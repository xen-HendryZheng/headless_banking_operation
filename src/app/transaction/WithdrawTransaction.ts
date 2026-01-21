import { DataSource } from 'typeorm';
import { BaseTransactionCore } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { TransactionStore } from '../../services/transaction/TransactionStore';

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
  }

  name(): string {
    return 'WithdrawTransaction';
  }

  validate(input: WithdrawInput): Promise<void> {
    // TODO: Implement validation
    // - amount > 0
    // - reference not empty
    // - userLedgerAccountId valid
    // - bankLiabilityLedgerAccountId valid
    throw new Error('Not implemented');
  }

  protected async createTransactionHeader(input: WithdrawInput): Promise<UUID> {
    // TODO: Implement
    // type = WITHDRAW
    // ledgerAccountId = userLedgerAccountId
    // counterpartyLedgerAccountId = null
    // isCredit = false (user sends funds out)
    throw new Error('Not implemented');
  }

  protected async buildJournal(txId: UUID, input: WithdrawInput): Promise<JournalDraft> {
    // TODO: Implement
    // Lines:
    //   1. userLedgerAccountId: DEBIT amount
    //   2. bankLiabilityLedgerAccountId: CREDIT amount
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
