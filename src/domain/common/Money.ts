import { Currency } from './Types';

/**
 * Immutable Money value object.
 * Amounts are stored as bigint in minor units (e.g., 3dp -> multiply by 1000).
 */
export class Money {
  private constructor(
    public readonly amount: bigint,
    public readonly currency: Currency
  ) {}

  static of(amount: bigint, currency: Currency): Money {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  static zero(currency: Currency): Money {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  add(other: Money): Money {
    // TODO: Implement - ensure same currency
    throw new Error('Not implemented');
  }

  subtract(other: Money): Money {
    // TODO: Implement - ensure same currency
    throw new Error('Not implemented');
  }

  negate(): Money {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  isNegative(): boolean {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  isZero(): boolean {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  isPositive(): boolean {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  equals(other: Money): boolean {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  toString(): string {
    // TODO: Implement
    throw new Error('Not implemented');
  }
}
