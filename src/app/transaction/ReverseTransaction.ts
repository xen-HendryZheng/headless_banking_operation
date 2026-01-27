import { DataSource, QueryRunner } from 'typeorm';
import { BaseTransactionCore, TxResult } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { CreateTransactionInput, TransactionHeader, TransactionStore } from '../../services/transaction/TransactionStore';
import { InvalidTransactionError } from '../../domain/common/DomainErrors';
import { LedgerAccountType, TransactionType } from '../../stores/entities/enums';
import { LedgerAccountStore } from '../../services/account/LedgerAccountStore';

/**
 * Input for deposit transaction.
 */
export interface ReverseInput {
  /** Transaction ID to be reversed */
  trxId: UUID;
}

/**
 * Internal resolved ledger accounts for deposit.
 */
interface ResolvedDepositAccounts {
  userCashLedgerAccountId: UUID;
  bankLiabilityLedgerAccountId: UUID;
}

export class ReverseTransaction extends BaseTransactionCore<ReverseInput> {
  private queryRunner!: QueryRunner;
  private resolvedAccounts!: ResolvedDepositAccounts;
  private transactionDetail!: TransactionHeader | null;

  constructor(
    private readonly transactionStore: TransactionStore,
    private readonly ledgerService: LedgerService,
    private readonly balanceService: BalanceService,
    private readonly ledgerAccountStore: LedgerAccountStore,
    private readonly dataSource: DataSource
  ) {
    super();
    this.queryRunner = this.dataSource.createQueryRunner();
  }

  name(): string {
    return 'ReverseTransaction';
  }

  /**
   * Override execute to manage database transaction lifecycle.
   */
  async execute(input: ReverseInput): Promise<TxResult> {
    await this.queryRunner.connect();
    await this.queryRunner.startTransaction();

    try {
      this.transactionDetail = await this.transactionStore.findById(input.trxId, this.queryRunner);
      if (!this.transactionDetail) {
        throw new InvalidTransactionError("Transaction not found");
      }
      const accountId = this.transactionDetail?.accountId;
      // Resolve ledger accounts before executing the transaction
      this.resolvedAccounts = await this.resolveLedgerAccounts(accountId);

      const result = await super.execute(input);
      await this.queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await this.queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await this.queryRunner.release();
    }
  }

  /**
   * Resolves ledger accounts for the given account ID.
   */
  private async resolveLedgerAccounts(accountId: UUID): Promise<ResolvedDepositAccounts> {
    const userCash = await this.ledgerAccountStore.findByAccountIdAndType(
      accountId,
      LedgerAccountType.USER_CASH,
      this.queryRunner
    );
    const bankLiability = await this.ledgerAccountStore.findByAccountIdAndType(
      accountId,
      LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY,
      this.queryRunner
    );

    if (!userCash) {
      throw new InvalidTransactionError('User cash ledger account not found');
    }
    if (!bankLiability) {
      throw new InvalidTransactionError('Bank liability ledger account not found');
    }

    return {
      userCashLedgerAccountId: userCash.id,
      bankLiabilityLedgerAccountId: bankLiability.id,
    };
  }

  validate(input: ReverseInput): Promise<void> {
    if (!input) {
      throw new InvalidTransactionError('Transaction ID cannot be empty');
    }

    if (this.transactionDetail?.type === 'TRANSFER') {
        throw new InvalidTransactionError("Transfer cannot be reversed")
    }

    return Promise.resolve();
  }

  protected async createTransactionHeader(input: ReverseInput): Promise<UUID> {
    const transactionInput: CreateTransactionInput = {
      parentTransactionId: input.trxId,
      accountId: this.transactionDetail!.accountId,
      type: TransactionType.REVERSAL,
      ledgerAccountId: this.resolvedAccounts.userCashLedgerAccountId,
      counterpartyLedgerAccountId: null,
      isCredit: false, // user's perspective - debit
      amount: this.transactionDetail!.amount,
      currency: this.transactionDetail!.currency,
      reference: 'REVERSAL TRANSACTION',
      description: `REVERSE TRANSACTION ${input.trxId}`
    };

    const header = await this.transactionStore.createHeader(transactionInput, this.queryRunner);
    return header.id;
  }

  protected async buildJournal(txId: UUID, input: ReverseInput): Promise<JournalDraft> {
    const { userCashLedgerAccountId, bankLiabilityLedgerAccountId } = this.resolvedAccounts;

    const [latestBankLiabilityLine, latestUserCashLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(bankLiabilityLedgerAccountId, this.queryRunner),
      this.ledgerService.getLatestLedgerLine(userCashLedgerAccountId, this.queryRunner)
    ]);
    
    return {
      transactionId: txId,
      type: TransactionType.REVERSAL,
      currency: this.transactionDetail!.currency,
      lines: [
        {
          ledgerAccountId: bankLiabilityLedgerAccountId,
          accountId: this.transactionDetail!.accountId,
          debit: this.transactionDetail!.type === 'DEPOSIT' ? latestBankLiabilityLine?.debit ?? 0n : (latestBankLiabilityLine?.debit ?? 0n) + this.transactionDetail!.amount,
          credit: this.transactionDetail!.type === 'DEPOSIT' ? (latestBankLiabilityLine?.credit ?? 0n) + this.transactionDetail!.amount : latestBankLiabilityLine?.credit ?? 0n,
          amount: this.transactionDetail!.amount,
          isDebit: this.transactionDetail!.type === 'DEPOSIT' ? false : true,
        },
        {
          ledgerAccountId: userCashLedgerAccountId,
          accountId: this.transactionDetail!.accountId,
          debit: this.transactionDetail!.type === 'DEPOSIT' ? (latestUserCashLine?.debit ?? 0n) + this.transactionDetail!.amount : latestUserCashLine?.debit ?? 0n,
          credit: this.transactionDetail!.type === 'DEPOSIT' ? (latestUserCashLine?.credit ?? 0n) + this.transactionDetail!.amount : latestUserCashLine?.credit ?? 0n,
          amount: this.transactionDetail!.amount,
          isDebit: this.transactionDetail!.type === 'DEPOSIT' ? true : false,
        },
      ],
    };
  }

  protected async postLedger(journal: JournalDraft): Promise<LedgerLine[]> {
    return this.ledgerService.post(journal, this.queryRunner);
  }

  protected async updateBalances(ledgerLines: LedgerLine[]): Promise<void> {
    // Only update balance for user cash accounts, not bank liability accounts
    // User line is the second one (index 1)
    const userLedgerLine = ledgerLines[1];
    if (!userLedgerLine) {
      return;
    }

    const balanceDelta = [{
      ledgerAccountId: userLedgerLine.ledgerAccountId,
      delta: this.transactionDetail!.type === 'DEPOSIT' ? -userLedgerLine.amount : userLedgerLine.amount,
      newSequence: userLedgerLine.sequence,
    }];

    await this.balanceService.apply(balanceDelta, this.queryRunner);
  }
}
