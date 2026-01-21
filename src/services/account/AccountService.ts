import { UUID, Currency } from '../../domain/common/Types';
import { Account } from './AccountStore';
import { LedgerAccount } from './LedgerAccountStore';

/**
 * Input for creating a user account.
 */
export interface CreateUserAccountInput {
  name: string;
  identifier: string;
  currency: Currency;
  metadata?: Record<string, unknown>;
}

/**
 * Result of creating a user account.
 */
export interface CreateUserAccountResult {
  account: Account;
  ledgerAccount: LedgerAccount;
}

/**
 * Account service interface (port).
 * Provides operations for account management.
 */
export interface AccountService {
  /**
   * Creates a user account with associated USER_CASH and FIRSTCIRCLE_BUSINESS_LIABILITY ledger accounts and zero balance.
   */
  createUserAccount(input: CreateUserAccountInput): Promise<CreateUserAccountResult>;

  /**
   * Finds an account by identifier.
   */
  findByIdentifier(identifier: string): Promise<Account | null>;

  /**
   * Gets all ledger accounts for a given account.
   */
  getLedgerAccounts(accountId: UUID): Promise<LedgerAccount[]>;
}
