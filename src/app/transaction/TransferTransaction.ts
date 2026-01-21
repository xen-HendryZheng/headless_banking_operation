import { DataSource } from 'typeorm';
import { BaseTransactionCore } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { TransactionStore } from '../../services/transaction/TransactionStore';

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
  /** Idempotency key */
  reference: string;
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
  }

  name(): string {
    return 'TransferTransaction';
  }

  validate(input: TransferInput): Promise<void> {
    // TODO: Implement validation
    // - amount > 0
    // - reference not empty
    // - senderLedgerAccountId != receiverLedgerAccountId
    // - senderLedgerAccountId valid
    // - receiverLedgerAccountId valid
    throw new Error('Not implemented');
  }

  protected async createTransactionHeader(input: TransferInput): Promise<UUID> {
    // TODO: Implement
    // type = TRANSFER
    // ledgerAccountId = senderLedgerAccountId
    // counterpartyLedgerAccountId = receiverLedgerAccountId
    // isCredit = false (sender's perspective)
    throw new Error('Not implemented');
  }

  protected async buildJournal(txId: UUID, input: TransferInput): Promise<JournalDraft> {
    // TODO: Implement
    // Lines:
    //   1. senderLedgerAccountId: DEBIT amount
    //   2. receiverLedgerAccountId: CREDIT amount
    throw new Error('Not implemented');
  }

  protected async postLedger(journal: JournalDraft): Promise<void> {
    // TODO: Implement - use this.ledgerService
    throw new Error('Not implemented');
  }

  protected async updateBalances(journal: JournalDraft): Promise<void> {
    // TODO: Implement - use this.balanceService
    throw new Error('Not implemented');
  }
}
