import { DataSource, QueryRunner } from 'typeorm';
import { BaseTransactionCore, TxResult } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { CreateTransactionInput, TransactionStore } from '../../services/transaction/TransactionStore';
import { InvalidTransactionError, InsufficientBalanceError } from '@domain/common';
import { TransactionType } from 'stores/entities/enums';

/**
 * Input for transfer transaction.
 */
export interface TransferInput {
  /** Sender's ledger account ID */
  senderLedgerAccountId: UUID;
  /** Sender's account ID (denormalized owner reference) */
  senderAccountId: UUID;
  /** Receiver's ledger account ID */
  receiverLedgerAccountId: UUID;
  /** Receiver's account ID (denormalized owner reference) */
  receiverAccountId: UUID;
  /** Amount and currency */
  amount: bigint;
  currency: Currency;
  /** Optional */
  reference?: string;
  /** Optional description */
  description?: string;
}

/**
 * Internal transfer transaction use-case.
 *
 * Ledger posting pattern:
 *   SENDER (USER_A)    DEBIT
 *   RECEIVER (USER_B)  CREDIT
 *
 * Note: Bank liability is NOT touched for internal transfers.
 */
export class TransferTransaction extends BaseTransactionCore<TransferInput> {
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
    return 'TransferTransaction';
  }

  private queryRunner!: QueryRunner;

  /**
   * Override execute to manage database transaction lifecycle.
   */
  async execute(input: TransferInput): Promise<TxResult> {
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

  async validate(input: TransferInput): Promise<void> {
    if (input.amount <= 0n) {
      throw new Error('Amount must be greater than zero');
    }

    if (!input.senderLedgerAccountId || input.senderLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid sender ledger account');
    }

    if (!input.receiverLedgerAccountId || input.receiverLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid receiver ledger account');
    }

    // Lock BOTH accounts in sorted order upfront to prevent deadlocks
    const sortedIds = [input.senderLedgerAccountId, input.receiverLedgerAccountId].sort();
    const balances = await this.balanceService.getBalances(sortedIds, this.queryRunner);

    // Find sender's balance from the locked balances
    const senderBalance = balances.find(b => b.ledgerAccountId === input.senderLedgerAccountId);
    const availableAmount = senderBalance?.balanceAmount ?? 0n;
    if (availableAmount < input.amount) {
      throw new InsufficientBalanceError('Insufficient funds for transfer');
    }
  }

  protected async createTransactionHeader(input: TransferInput): Promise<UUID> {
    const transactionInput: CreateTransactionInput = {
      accountId: input.senderAccountId,
      type: TransactionType.WITHDRAW,
      ledgerAccountId: input.senderLedgerAccountId,
      counterpartyLedgerAccountId: input.receiverLedgerAccountId,
      isCredit: false, // user's perspective - withdrawing funds
      amount: input.amount,
      currency: input.currency,
      reference: input.reference || '',
      description: input.description
    };

    const header = await this.transactionStore.createHeader(transactionInput, this.queryRunner);
    return header.id;
  }

  protected async buildJournal(txId: UUID, input: TransferInput): Promise<JournalDraft> {
    const [latestSenderLine, latestReceiverLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(input.senderLedgerAccountId, this.queryRunner),
      this.ledgerService.getLatestLedgerLine(input.receiverLedgerAccountId, this.queryRunner)
    ]);
    return {
      transactionId: txId,
      type: TransactionType.TRANSFER,
      currency: input.currency,
      lines: [
        {
          ledgerAccountId: input.senderLedgerAccountId,
          accountId: input.senderAccountId,
          debit: (latestSenderLine?.debit ?? 0n) + input.amount,
          credit: latestSenderLine?.credit ?? 0n,
          amount: input.amount,
          isDebit: true,
        },
        {
          ledgerAccountId: input.receiverLedgerAccountId,
          accountId: input.receiverAccountId,
          debit: latestReceiverLine?.debit ?? 0n,
          credit: (latestReceiverLine?.credit ?? 0n) + input.amount,
          amount: input.amount,
          isDebit: false,
        },
      ]
    };
  }

  protected async postLedger(journal: JournalDraft): Promise<LedgerLine[]> {
    const ledgerLines = await this.ledgerService.post(journal, this.queryRunner);
    return ledgerLines;
  }

  protected async updateBalances(ledgerLines: LedgerLine[]): Promise<void> {
    // Sender (index 0) gets -amount, Receiver (index 1) gets +amount
    const senderLine = ledgerLines[0];
    const receiverLine = ledgerLines[1];

    const deltas = [
      {
        ledgerAccountId: senderLine.ledgerAccountId,
        delta: -senderLine.amount, // Negative delta for sender
        newSequence: senderLine.sequence,
      },
      {
        ledgerAccountId: receiverLine.ledgerAccountId,
        delta: receiverLine.amount, // Positive delta for receiver
        newSequence: receiverLine.sequence,
      },
    ];

    // Apply balance updates
    await this.balanceService.apply(deltas, this.queryRunner);
  }
}
