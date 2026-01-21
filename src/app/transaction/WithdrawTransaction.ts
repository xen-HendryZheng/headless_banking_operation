import { DataSource, QueryRunner } from 'typeorm';
import { BaseTransactionCore, TxResult } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { CreateTransactionInput, TransactionStore } from '../../services/transaction/TransactionStore';
import { InvalidTransactionError, InsufficientBalanceError } from '@domain/common';
import { TransactionType } from 'stores';

/**
 * Input for withdrawal transaction.
 */
export interface WithdrawInput {
  /** User's ledger account ID (withdrawing from) */
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
 * Withdrawal transaction use-case.
 *
 * Ledger posting pattern:
 *   USER_CASH              DEBIT
 *   FIRSTCIRCLE_LIABILITY  CREDIT
 */
export class WithdrawTransaction extends BaseTransactionCore<WithdrawInput> {
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
    return 'WithdrawTransaction';
  }

  private queryRunner!: QueryRunner;

  /**
   * Override execute to manage database transaction lifecycle.
   */
  async execute(input: WithdrawInput): Promise<TxResult> {
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

  async validate(input: WithdrawInput): Promise<void> {
    if (input.amount <= 0n) {
      throw new InvalidTransactionError('Amount must be greater than zero');
    }

    if (!input.userLedgerAccountId || input.userLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid user ledger account');
    }

    if (!input.bankLiabilityLedgerAccountId || input.bankLiabilityLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid bank liability ledger account');
    }

    // Get the current balance and ensure sufficient funds
    const currentBalance = await this.balanceService.getBalance(input.userLedgerAccountId, this.queryRunner);
    const availableAmount = currentBalance ? currentBalance.balanceAmount : 0n;
    if (availableAmount < input.amount) {
      throw new InsufficientBalanceError('Insufficient funds for withdrawal');
    }
  }

  protected async createTransactionHeader(input: WithdrawInput): Promise<UUID> {
    const transactionInput: CreateTransactionInput = {
      accountId: input.userAccountId,
      type: TransactionType.WITHDRAW,
      ledgerAccountId: input.userLedgerAccountId,
      counterpartyLedgerAccountId: null,
      isCredit: false, // user's perspective - withdrawing funds
      amount: input.amount,
      currency: input.currency,
      reference: input.reference || '',
      description: input.description
    };

    const header = await this.transactionStore.createHeader(transactionInput, this.queryRunner);
    return header.id;
  }

  protected async buildJournal(txId: UUID, input: WithdrawInput): Promise<JournalDraft> {
    const [latestBankLiabilityLine, latestUserCashLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(input.bankLiabilityLedgerAccountId, this.queryRunner),
      this.ledgerService.getLatestLedgerLine(input.userLedgerAccountId, this.queryRunner)
    ]);
    return {
      transactionId: txId,
      type: TransactionType.WITHDRAW,
      currency: input.currency,
      lines: [
        {
          ledgerAccountId: input.bankLiabilityLedgerAccountId,
          accountId: input.userAccountId,
          debit: latestBankLiabilityLine?.debit ?? 0n,
          credit: (latestBankLiabilityLine?.credit ?? 0n) + input.amount,
          amount: input.amount,
          isDebit: false,
        },
        {
          ledgerAccountId: input.userLedgerAccountId,
          accountId: input.userAccountId,
          debit: (latestUserCashLine?.debit ?? 0n) + input.amount,
          credit: latestUserCashLine?.credit ?? 0n,
          amount: input.amount,
          isDebit: true,
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
      delta: -userLedgerLine.amount, // Negative delta for withdrawal
      newSequence: userLedgerLine.sequence,
    }];

    await this.balanceService.apply(balanceDelta, this.queryRunner);
  }
}
