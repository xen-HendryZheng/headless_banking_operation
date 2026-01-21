import { Money } from '../../../../src/domain/common/Money';
import { CurrencyMismatchError } from '../../../../src/domain/common/DomainErrors';

describe('Money', () => {
  describe('of', () => {
    it('should create a Money instance with the given amount and currency', () => {
      const money = Money.of(1000n, 'USD');

      expect(money.amount).toBe(1000n);
      expect(money.currency).toBe('USD');
    });

    it('should create Money with negative amount', () => {
      const money = Money.of(-500n, 'PHP');

      expect(money.amount).toBe(-500n);
      expect(money.currency).toBe('PHP');
    });

    it('should create Money with zero amount', () => {
      const money = Money.of(0n, 'USD');

      expect(money.amount).toBe(0n);
    });
  });

  describe('zero', () => {
    it('should create a Money instance with zero amount', () => {
      const money = Money.zero('USD');

      expect(money.amount).toBe(0n);
      expect(money.currency).toBe('USD');
    });
  });

  describe('add', () => {
    it('should add two Money instances with the same currency', () => {
      const a = Money.of(1000n, 'USD');
      const b = Money.of(500n, 'USD');

      const result = a.add(b);

      expect(result.amount).toBe(1500n);
      expect(result.currency).toBe('USD');
    });

    it('should handle adding negative amounts', () => {
      const a = Money.of(1000n, 'USD');
      const b = Money.of(-300n, 'USD');

      const result = a.add(b);

      expect(result.amount).toBe(700n);
    });

    it('should throw CurrencyMismatchError when adding Money instances with different currencies', () => {
      const a = Money.of(1000n, 'USD');
      const b = Money.of(500n, 'PHP');

      expect(() => a.add(b)).toThrow(CurrencyMismatchError);
    });
  });

  describe('subtract', () => {
    it('should subtract two Money instances with the same currency', () => {
      const a = Money.of(1000n, 'USD');
      const b = Money.of(300n, 'USD');

      const result = a.subtract(b);

      expect(result.amount).toBe(700n);
      expect(result.currency).toBe('USD');
    });

    it('should handle subtracting larger amount (resulting in negative)', () => {
      const a = Money.of(300n, 'USD');
      const b = Money.of(1000n, 'USD');

      const result = a.subtract(b);

      expect(result.amount).toBe(-700n);
    });

    it('should throw CurrencyMismatchError when subtracting Money instances with different currencies', () => {
      const a = Money.of(1000n, 'USD');
      const b = Money.of(500n, 'PHP');

      expect(() => a.subtract(b)).toThrow(CurrencyMismatchError);
    });
  });

  describe('negate', () => {
    it('should negate a positive amount to negative', () => {
      const money = Money.of(1000n, 'USD');

      const result = money.negate();

      expect(result.amount).toBe(-1000n);
      expect(result.currency).toBe('USD');
    });

    it('should negate a negative amount to positive', () => {
      const money = Money.of(-500n, 'USD');

      const result = money.negate();

      expect(result.amount).toBe(500n);
    });

    it('should keep zero as zero', () => {
      const money = Money.zero('USD');

      const result = money.negate();

      expect(result.amount).toBe(0n);
    });
  });

  describe('isNegative', () => {
    it('should return true for negative amounts', () => {
      const money = Money.of(-100n, 'USD');

      expect(money.isNegative()).toBe(true);
    });

    it('should return false for zero', () => {
      const money = Money.zero('USD');

      expect(money.isNegative()).toBe(false);
    });

    it('should return false for positive amounts', () => {
      const money = Money.of(100n, 'USD');

      expect(money.isNegative()).toBe(false);
    });
  });

  describe('isZero', () => {
    it('should return true for zero amount', () => {
      const money = Money.zero('USD');

      expect(money.isZero()).toBe(true);
    });

    it('should return true for Money.of(0n)', () => {
      const money = Money.of(0n, 'PHP');

      expect(money.isZero()).toBe(true);
    });

    it('should return false for positive amount', () => {
      const money = Money.of(100n, 'USD');

      expect(money.isZero()).toBe(false);
    });

    it('should return false for negative amount', () => {
      const money = Money.of(-100n, 'USD');

      expect(money.isZero()).toBe(false);
    });
  });

  describe('isPositive', () => {
    it('should return true for positive amounts', () => {
      const money = Money.of(100n, 'USD');

      expect(money.isPositive()).toBe(true);
    });

    it('should return false for zero', () => {
      const money = Money.zero('USD');

      expect(money.isPositive()).toBe(false);
    });

    it('should return false for negative amounts', () => {
      const money = Money.of(-100n, 'USD');

      expect(money.isPositive()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal Money instances', () => {
      const a = Money.of(1000n, 'USD');
      const b = Money.of(1000n, 'USD');

      expect(a.equals(b)).toBe(true);
    });

    it('should return false for different amounts', () => {
      const a = Money.of(1000n, 'USD');
      const b = Money.of(500n, 'USD');

      expect(a.equals(b)).toBe(false);
    });

    it('should return false for different currencies', () => {
      const a = Money.of(1000n, 'USD');
      const b = Money.of(1000n, 'PHP');

      expect(a.equals(b)).toBe(false);
    });

    it('should return false for different amount and currency', () => {
      const a = Money.of(1000n, 'USD');
      const b = Money.of(500n, 'PHP');

      expect(a.equals(b)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return string representation with amount and currency', () => {
      const money = Money.of(1000n, 'USD');

      const result = money.toString();

      expect(result).toContain('1000');
      expect(result).toContain('USD');
    });
  });
});
