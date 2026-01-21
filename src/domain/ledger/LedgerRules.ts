import { LedgerLineDraft } from './LedgerTypes';

/**
 * Interface for ledger validation rules.
 * Enforces double-entry accounting invariants.
 */
export interface LedgerRules {
  /**
   * Asserts that journal lines are balanced (SUM(debit) == SUM(credit)).
   * @throws UnbalancedJournalError if not balanced
   */
  assertBalanced(lines: LedgerLineDraft[]): void;

  /**
   * Asserts that all ledger lines are valid.
   * - Exactly one of debit or credit must be non-zero
   * - Amounts must be non-negative
   * @throws InvalidLedgerLineError if any line is invalid
   */
  assertValidLines(lines: LedgerLineDraft[]): void;
}
