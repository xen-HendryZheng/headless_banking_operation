import { DataSource } from 'typeorm';
import { BaseTransactionCore } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { TransactionStore } from '../../services/transaction/TransactionStore';

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
  /** Bank liability account ID (denormalized owner reference) */
  bankLiabilityAccountId: UUID;
  /** Amount and currency */
  amount: bigint;
  currency: Currency;
  /** Idempotency key */
  reference: string;
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
  }

  name(): string {
    return 'DepositTransaction';
  }

  validate(input: DepositInput): Promise<void> {
    // TODO: Implement validation
    // - amount > 0
    // - reference not empty
    // - userLedgerAccountId valid
    // - bankLiabilityLedgerAccountId valid
    throw new Error('Not implemented');
  }

  protected async createTransactionHeader(input: DepositInput): Promise<UUID> {
    // TODO: Implement
    // type = DEPOSIT
    // ledgerAccountId = userLedgerAccountId
    // counterpartyLedgerAccountId = null
    // isCredit = true (user receives funds)
    throw new Error('Not implemented');
  }

  protected async buildJournal(txId: UUID, input: DepositInput): Promise<JournalDraft> {
    // TODO: Implement
    // Lines:
    //   1. bankLiabilityLedgerAccountId: DEBIT amount
    //   2. userLedgerAccountId: CREDIT amount
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
