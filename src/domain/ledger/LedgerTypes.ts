import { UUID, Currency, TxType } from '../common/Types';

/**
 * Draft ledger line before persistence (no id, no sequence).
 */
export interface LedgerLineDraft {
  ledgerAccountId: UUID;
  accountId: UUID;
  debit: bigint;
  credit: bigint;
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
 */
export interface LedgerLine extends LedgerLineDraft {
  id: UUID;
  transactionId: UUID;
  sequence: number;
  amount: bigint;
  createdAt: Date;
}
