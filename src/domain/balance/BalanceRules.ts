/**
 * Interface for balance validation rules.
 * Enforces non-negative balance invariant.
 */
export interface BalanceRules {
  /**
   * Asserts that applying a delta to current balance won't result in negative.
   * @param currentBalance - Current balance amount
   * @param delta - Change to apply (negative for debit, positive for credit)
   * @throws InsufficientBalanceError if result would be negative
   */
  assertNoNegative(currentBalance: bigint, delta: bigint): void;
}
