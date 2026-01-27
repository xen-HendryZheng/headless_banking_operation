import { DataSource, QueryRunner } from 'typeorm';
import { BaseTransactionCore, TxResult } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { CreateTransactionInput, TransactionHeader, TransactionStore } from '../../services/transaction/TransactionStore';
import { InvalidTransactionError, InsufficientBalanceError } from '../../domain/common/DomainErrors';
import { LedgerAccountType, TransactionType } from '../../stores/entities/enums';
import { LedgerAccountStore } from '../../services/account/LedgerAccountStore';

/**
 * Input for withdrawal transaction.
 */
export interface WithdrawInput {
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
 * Internal resolved ledger accounts for withdrawal.
 */
interface ResolvedWithdrawAccounts {
  userCashLedgerAccountId: UUID;
  bankLiabilityLedgerAccountId: UUID;
}

/**
 * Withdrawal transaction use-case.
 *
 * Ledger posting pattern:
 *   USER_CASH              DEBIT
 *   FIRSTCIRCLE_LIABILITY  CREDIT
 */
export class WithdrawTransaction extends BaseTransactionCore<WithdrawInput> {
  private queryRunner!: QueryRunner;
  private resolvedAccounts!: ResolvedWithdrawAccounts;

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
    return 'WithdrawTransaction';
  }

  /**
   * Override execute to manage database transaction lifecycle.
   */
  async execute(input: WithdrawInput): Promise<TxResult> {
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
  private async resolveLedgerAccounts(accountId: UUID): Promise<ResolvedWithdrawAccounts> {
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

  async validate(input: WithdrawInput): Promise<void> {
    if (input.amount <= 0n) {
      throw new InvalidTransactionError('Amount must be greater than zero');
    }

    if (!input.accountId || input.accountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid account ID');
    }

    // Get the current balance and ensure sufficient funds
    const currentBalance = await this.balanceService.getBalance(
      this.resolvedAccounts.userCashLedgerAccountId,
      this.queryRunner
    );
    const availableAmount = currentBalance ? currentBalance.balanceAmount : 0n;
    if (availableAmount < input.amount) {
      throw new InsufficientBalanceError('Insufficient funds for withdrawal');
    }
  }

  protected async createTransactionHeader(input: WithdrawInput): Promise<TransactionHeader> {
    const transactionInput: CreateTransactionInput = {
      accountId: input.accountId,
      type: TransactionType.WITHDRAW,
      ledgerAccountId: this.resolvedAccounts.userCashLedgerAccountId,
      counterpartyLedgerAccountId: null,
      isCredit: false, // user's perspective - withdrawing funds
      amount: input.amount,
      currency: input.currency,
      reference: input.reference || '',
      description: input.description
    };

    const header = await this.transactionStore.createHeader(transactionInput, this.queryRunner);
    return header;
  }

  protected async createFeeTransactionHeader(transactionHeader: TransactionHeader): Promise<TransactionHeader> {
    throw new Error("Not done");
  }

  protected async buildJournal(txId: UUID, input: WithdrawInput): Promise<JournalDraft> {
    const { userCashLedgerAccountId, bankLiabilityLedgerAccountId } = this.resolvedAccounts;

    const [latestBankLiabilityLine, latestUserCashLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(bankLiabilityLedgerAccountId, this.queryRunner),
      this.ledgerService.getLatestLedgerLine(userCashLedgerAccountId, this.queryRunner)
    ]);

    return {
      transactionId: txId,
      type: TransactionType.WITHDRAW,
      currency: input.currency,
      lines: [
        {
          ledgerAccountId: bankLiabilityLedgerAccountId,
          accountId: input.accountId,
          debit: latestBankLiabilityLine?.debit ?? 0n,
          credit: (latestBankLiabilityLine?.credit ?? 0n) + input.amount,
          amount: input.amount,
          isDebit: false,
        },
        {
          ledgerAccountId: userCashLedgerAccountId,
          accountId: input.accountId,
          debit: (latestUserCashLine?.debit ?? 0n) + input.amount,
          credit: latestUserCashLine?.credit ?? 0n,
          amount: input.amount,
          isDebit: true,
        },
      ],
    };
  }

  protected async buildJournalForFees(transactionLedgerLines: LedgerLine[], transactionHeader: TransactionHeader): Promise<JournalDraft> {
    throw new Error("Not done yet");
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
      delta: -userLedgerLine.amount, // Negative delta for withdrawal
      newSequence: userLedgerLine.sequence,
    }];

    await this.balanceService.apply(balanceDelta, this.queryRunner);
  }
}
