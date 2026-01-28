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
export interface DepositInput {
  /** User's account ID */
  accountId: UUID;
  /** Amount and currency */
  amount: bigint;
  currency: Currency;
  /** Optional reference */
  reference?: string;
  /** Optional description */
  description?: string;
}

/**
 * Internal resolved ledger accounts for deposit.
 */
interface ResolvedDepositAccounts {
  userCashLedgerAccountId: UUID;
  bankLiabilityLedgerAccountId: UUID;
  bankRevenueLedgerAccountId: UUID;
}

/**
 * Deposit transaction use-case.
 *
 * Ledger posting pattern:
 *   FIRSTCIRCLE_LIABILITY  DEBIT
 *   USER_CASH              CREDIT
 */
export class DepositTransaction extends BaseTransactionCore<DepositInput> {
  private queryRunner!: QueryRunner;
  private resolvedAccounts!: ResolvedDepositAccounts;

  constructor(
    private readonly transactionStore: TransactionStore,
    private readonly ledgerService: LedgerService,
    private readonly balanceService: BalanceService,
    private readonly ledgerAccountStore: LedgerAccountStore,
    private readonly dataSource: DataSource
  ) {
    super();
    this.queryRunner = this.dataSource.createQueryRunner();
    this.setFeesEnabled(true);
  }

  name(): string {
    return 'DepositTransaction';
  }

  /**
   * Override execute to manage database transaction lifecycle.
   */
  async execute(input: DepositInput): Promise<TxResult> {
    await this.queryRunner.connect();
    await this.queryRunner.startTransaction();

    try {
      // Resolve ledger accounts before executing the transaction
      this.resolvedAccounts = await this.resolveLedgerAccounts(input.accountId);

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
    const bankRevenueLedgerAccountId = await this.ledgerAccountStore.findByAccountIdAndType(
      accountId,
      LedgerAccountType.FIRSTCIRCLE_REVENUE,
      this.queryRunner
    );

    if (!userCash) {
      throw new InvalidTransactionError('User cash ledger account not found');
    }
    if (!bankLiability) {
      throw new InvalidTransactionError('Bank liability ledger account not found');
    }
    if (!bankRevenueLedgerAccountId) {
      throw new InvalidTransactionError('Failed setup account, please contact support');
    }

    return {
      userCashLedgerAccountId: userCash.id,
      bankLiabilityLedgerAccountId: bankLiability.id,
      bankRevenueLedgerAccountId: bankRevenueLedgerAccountId.id
    };
  }

  validate(input: DepositInput): Promise<void> {
    if (input.amount <= 0n) {
      throw new InvalidTransactionError('Amount must be greater than zero');
    }

    if (!input.accountId || input.accountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid account ID');
    }

    return Promise.resolve();
  }

  protected async createTransactionHeader(input: DepositInput): Promise<TransactionHeader> {
    const transactionInput: CreateTransactionInput = {
      accountId: input.accountId,
      type: TransactionType.DEPOSIT,
      ledgerAccountId: this.resolvedAccounts.userCashLedgerAccountId,
      counterpartyLedgerAccountId: null,
      isCredit: true, // user's perspective - receiving funds
      amount: input.amount,
      currency: input.currency,
      reference: input.reference || '',
      description: input.description
    };

    const header = await this.transactionStore.createHeader(transactionInput, this.queryRunner);
    return header;
  }

  protected async buildJournal(txId: UUID, input: DepositInput): Promise<JournalDraft> {
    const { userCashLedgerAccountId, bankLiabilityLedgerAccountId } = this.resolvedAccounts;

    const [latestBankLiabilityLine, latestUserCashLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(bankLiabilityLedgerAccountId, this.queryRunner),
      this.ledgerService.getLatestLedgerLine(userCashLedgerAccountId, this.queryRunner)
    ]);

    return {
      transactionId: txId,
      type: TransactionType.DEPOSIT,
      currency: input.currency,
      lines: [
        {
          ledgerAccountId: bankLiabilityLedgerAccountId,
          accountId: input.accountId,
          debit: (latestBankLiabilityLine?.debit ?? 0n) + input.amount,
          credit: latestBankLiabilityLine?.credit ?? 0n,
          amount: input.amount,
          isDebit: true,
        },
        {
          ledgerAccountId: userCashLedgerAccountId,
          accountId: input.accountId,
          debit: latestUserCashLine?.debit ?? 0n,
          credit: (latestUserCashLine?.credit ?? 0n) + input.amount,
          amount: input.amount,
          isDebit: false,
        },
      ],
    };
  }

  protected async buildJournalForFees(transactionLedgerLines: LedgerLine[], transactionHeader: TransactionHeader): Promise<JournalDraft> {
    const { userCashLedgerAccountId, bankRevenueLedgerAccountId } = this.resolvedAccounts;
    const [latestBankRevenueLine, latestUserCashLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(bankRevenueLedgerAccountId, this.queryRunner),
      transactionLedgerLines.find( line => line.ledgerAccountId === userCashLedgerAccountId)
    ]);
    const feeAmount = this.calculateFees(transactionHeader.amount);

    return {
      transactionId: transactionHeader.id,
      type: TransactionType.FEE,
      currency: transactionHeader.currency,
      lines: [
        {
          ledgerAccountId: bankRevenueLedgerAccountId,
          accountId: transactionHeader.accountId,
          debit: latestBankRevenueLine?.debit ?? 0n,
          credit: (latestBankRevenueLine?.credit ?? 0n) + feeAmount,
          amount: feeAmount,
          description: `Fee for transaction ${transactionHeader.id}`,
          isDebit: false,
        },
        {
          ledgerAccountId: userCashLedgerAccountId,
          accountId: transactionHeader.accountId,
          debit: (latestUserCashLine?.debit ?? 0n) + feeAmount,
          credit: latestUserCashLine?.credit ?? 0n,
          description: `Fee for transaction ${transactionHeader.id}`,
          amount: feeAmount,
          isDebit: true,
        },
      ],
    };
  }

  protected async postLedger(journal: JournalDraft): Promise<LedgerLine[]> {
    return this.ledgerService.post(journal, this.queryRunner);
  }

  protected async updateBalances(ledgerLines: LedgerLine[], isDebit?: boolean): Promise<void> {
    // Only update balance for user cash accounts, not bank liability accounts
    // User line is the second one (index 1)
    const userLedgerLine = ledgerLines[1];
    if (!userLedgerLine) {
      return;
    }

    const balanceDelta = [{
      ledgerAccountId: userLedgerLine.ledgerAccountId,
      delta: isDebit ? -userLedgerLine.amount : userLedgerLine.amount, // Positive delta for deposit
      newSequence: userLedgerLine.sequence,
    }];

    await this.balanceService.apply(balanceDelta, this.queryRunner);
  }
}
