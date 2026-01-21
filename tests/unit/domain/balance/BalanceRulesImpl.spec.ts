import { BalanceRulesImpl } from '../../../../src/domain/balance/BalanceRulesImpl';
import { InsufficientBalanceError } from '../../../../src/domain/common/DomainErrors';

describe('BalanceRulesImpl', () => {
  let balanceRules: BalanceRulesImpl;

  beforeEach(() => {
    balanceRules = new BalanceRulesImpl();
  });

  describe('assertNoNegative', () => {
    it('should not throw when result is positive', () => {
      const currentBalance = 1000n;
      const delta = -500n; // Withdraw 500

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).not.toThrow();
    });

    it('should not throw when result is zero', () => {
      const currentBalance = 1000n;
      const delta = -1000n; // Withdraw exact balance

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).not.toThrow();
    });

    it('should throw InsufficientBalanceError when result would be negative', () => {
      const currentBalance = 500n;
      const delta = -1000n; // Try to withdraw more than balance

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).toThrow(
        InsufficientBalanceError
      );
    });

    it('should handle positive delta correctly (deposit)', () => {
      const currentBalance = 1000n;
      const delta = 500n; // Deposit 500

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).not.toThrow();
    });

    it('should handle negative delta correctly (withdrawal)', () => {
      const currentBalance = 1000n;
      const delta = -300n; // Withdraw 300

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).not.toThrow();
    });

    it('should not throw when current balance is zero and delta is positive', () => {
      const currentBalance = 0n;
      const delta = 1000n; // Deposit to empty account

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).not.toThrow();
    });

    it('should throw when current balance is zero and delta is negative', () => {
      const currentBalance = 0n;
      const delta = -1n; // Any withdrawal from empty account

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).toThrow(
        InsufficientBalanceError
      );
    });

    it('should handle large amounts correctly', () => {
      const currentBalance = 999999999999999n;
      const delta = -999999999999998n;

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).not.toThrow();
    });

    it('should throw for large overdraft attempt', () => {
      const currentBalance = 100n;
      const delta = -999999999999999n;

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).toThrow(
        InsufficientBalanceError
      );
    });

    it('should not throw when delta is zero', () => {
      const currentBalance = 1000n;
      const delta = 0n;

      expect(() => balanceRules.assertNoNegative(currentBalance, delta)).not.toThrow();
    });
  });
});
