import { DataSource, QueryRunner } from 'typeorm';
import { BaseTransactionCore, TxResult } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { CreateTransactionInput, TransactionStore } from '../../services/transaction/TransactionStore';
import { InvalidTransactionError } from '../../domain/common/DomainErrors';
import { TransactionType } from 'stores';

/**
 * Input for deposit transaction.
 */
export interface DepositInput {
  /** User's ledger account ID (receiving the deposit) */
  userLedgerAccountId: UUID;
  /** User's account ID (denormalized owner reference) */
  userAccountId: UUID;
  /** Bank liability ledger account ID (FIRSTCIRCLE_BUSINESS_LIABILITY) */
  bankLiabilityLedgerAccountId: UUID;
  /** Amount and currency */
  amount: bigint;
  currency: Currency;
  /** Optional */
  reference?: string;
  /** Optional description */
  description?: string;
}

/**
 * Deposit transaction use-case.
 *
 * Ledger posting pattern:
 *   FIRSTCIRCLE_LIABILITY  DEBIT
 *   USER_CASH              CREDIT
 */
export class DepositTransaction extends BaseTransactionCore<DepositInput> {
  constructor(
    private readonly transactionStore: TransactionStore,
    private readonly ledgerService: LedgerService,
    private readonly balanceService: BalanceService,
    private readonly dataSource: DataSource
  ) {
    super();
    this.queryRunner = this.dataSource.createQueryRunner();
  }

  name(): string {
    return 'DepositTransaction';
  }

  private queryRunner!: QueryRunner;
  /**
   * Override execute to manage database transaction lifecycle.
   */
  async execute(input: DepositInput): Promise<TxResult> {
    
    await this.queryRunner.connect();
    await this.queryRunner.startTransaction();

    try {
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

  validate(input: DepositInput): Promise<void> {
    if (input.amount <= 0n) {
      throw new InvalidTransactionError('Amount must be greater than zero');
    }

    if (!input.userLedgerAccountId || input.userLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid user ledger account');
    }

    if (!input.bankLiabilityLedgerAccountId || input.bankLiabilityLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid bank liability ledger account');
    }

    return Promise.resolve();
  }

  protected async createTransactionHeader(input: DepositInput): Promise<UUID> {
    const transactionInput: CreateTransactionInput = {
      accountId: input.userAccountId,
      type: TransactionType.DEPOSIT,
      ledgerAccountId: input.userLedgerAccountId,
      counterpartyLedgerAccountId: null,
      isCredit: true, // user's perspective - receiving funds
      amount: input.amount,
      currency: input.currency,
      reference: input.reference || '',
      description: input.description
    };

    const header = await this.transactionStore.createHeader(transactionInput, this.queryRunner);
    return header.id;
  }

  protected async buildJournal(txId: UUID, input: DepositInput): Promise<JournalDraft> {
    const [latestBankLiabilityLine, latestUserCashLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(input.bankLiabilityLedgerAccountId, this.queryRunner),
      this.ledgerService.getLatestLedgerLine(input.userLedgerAccountId, this.queryRunner)
    ]);
    return {
      transactionId: txId,
      type: TransactionType.DEPOSIT,
      currency: input.currency,
      lines: [
        {
          ledgerAccountId: input.bankLiabilityLedgerAccountId,
          accountId: input.userAccountId,
          debit: (latestBankLiabilityLine?.debit ?? 0n) + input.amount,
          credit: latestBankLiabilityLine?.credit ?? 0n,
          amount: input.amount,
          isDebit: true,
        },
        {
          ledgerAccountId: input.userLedgerAccountId,
          accountId: input.userAccountId,
          debit: latestUserCashLine?.debit ?? 0n,
          credit: (latestUserCashLine?.credit ?? 0n) + input.amount,
          amount: input.amount,
          isDebit: false,
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
      delta: userLedgerLine.amount, // Positive delta for deposit
      newSequence: userLedgerLine.sequence,
    }];

    await this.balanceService.apply(balanceDelta, this.queryRunner);
  }
}
