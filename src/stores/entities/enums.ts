/**
 * Account type enum - represents the type of system entity.
 */
export enum AccountType {
  USER = 'USER'
}

/**
 * Account status enum.
 */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Ledger account type enum - represents the type of financial account.
 */
export enum LedgerAccountType {
  USER_CASH = 'USER_CASH',
  FIRSTCIRCLE_BUSINESS_LIABILITY = 'FIRSTCIRCLE_BUSINESS_LIABILITY',
}

/**
 * Ledger account status enum.
 */
export enum LedgerAccountStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
}

/**
 * Transaction type enum.
 */
export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  TRANSFER = 'TRANSFER',
}

/**
 * Transaction status enum.
 */
export enum TransactionStatus {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  FAILED = 'FAILED',
}
