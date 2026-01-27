import { UUID, Currency, TxType } from '../common/Types';

/**
 * Draft ledger line before persistence (no id, no sequence).
 */
export interface LedgerLineDraft {
  ledgerAccountId: UUID;
  accountId: UUID;
  debit: bigint;
  credit: bigint;
  /** Transaction amount for this line (used for balance validation) */
  amount: bigint;
  /** Whether this line is a debit (true) or credit (false) for this transaction */
  isDebit: boolean;
}

/**
 * Journal draft containing transaction reference and lines.
 */
export interface JournalDraft {
  transactionId: UUID;
  type: TxType;
  currency: Currency;
  lines: LedgerLineDraft[];
}

/**
 * Persisted ledger line with id and sequence.
 * Note: Does not extend LedgerLineDraft since isDebit is only used for validation.
 */
export interface LedgerLine {
  id: UUID;
  transactionId: UUID;
  ledgerAccountId: UUID;
  accountId: UUID;
  debit: bigint;
  credit: bigint;
  amount: bigint;
  sequence: bigint;
  createdAt: Date;
}
