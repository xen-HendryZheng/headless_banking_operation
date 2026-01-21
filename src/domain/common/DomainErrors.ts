/**
 * Base class for all domain errors.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when journal entries do not balance (SUM(debit) != SUM(credit)).
 */
export class UnbalancedJournalError extends DomainError {
  constructor(message: string = 'Journal entries must balance') {
    super('UNBALANCED_JOURNAL', message);
  }
}

/**
 * Thrown when a ledger line is invalid (e.g., both debit and credit are non-zero).
 */
export class InvalidLedgerLineError extends DomainError {
  constructor(message: string = 'Invalid ledger line') {
    super('INVALID_LEDGER_LINE', message);
  }
}

/**
 * Thrown when an operation would result in a negative balance.
 */
export class InsufficientBalanceError extends DomainError {
  constructor(message: string = 'Insufficient balance') {
    super('INSUFFICIENT_BALANCE', message);
  }
}

/**
 * Thrown when transaction input is invalid.
 */
export class InvalidTransactionError extends DomainError {
  constructor(message: string = 'Invalid transaction') {
    super('INVALID_TRANSACTION', message);
  }
}

/**
 * Thrown when a duplicate reference is detected (idempotency violation).
 */
export class DuplicateReferenceError extends DomainError {
  constructor(reference: string) {
    super('DUPLICATE_REFERENCE', `Duplicate reference: ${reference}`);
  }
}

/**
 * Thrown when currency mismatch is detected.
 */
export class CurrencyMismatchError extends DomainError {
  constructor(expected: string, actual: string) {
    super('CURRENCY_MISMATCH', `Currency mismatch: expected ${expected}, got ${actual}`);
  }
}
