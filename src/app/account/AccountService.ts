import { DataSource } from 'typeorm';
import { AccountStore, Account } from '../../services/account/AccountStore';
import { LedgerAccountStore, LedgerAccount } from '../../services/account/LedgerAccountStore';
import { BalanceStore } from '../../services/balance/BalanceStore';
import { UUID, Currency } from '../../domain/common/Types';

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
 * Account service facade.
 * Provides operations for account management.
 */
export class AccountService {
  constructor(
    private readonly accountStore: AccountStore,
    private readonly ledgerAccountStore: LedgerAccountStore,
    private readonly balanceStore: BalanceStore,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Creates a user account with associated USER_CASH ledger account and zero balance.
   * Runs in a single transaction.
   */
  async createUserAccount(input: CreateUserAccountInput): Promise<CreateUserAccountResult> {
    // TODO: Implement
    // 1. Start transaction via queryRunner
    // 2. Create Account (type = USER)
    // 3. Create LedgerAccount (type = USER_CASH)
    // 4. Initialize Balance with 0 balance and sequence 0
    // 5. Commit transaction
    // 6. Return account and ledgerAccount
    throw new Error('Not implemented');
  }

  /**
   * Finds an account by identifier.
   */
  async findByIdentifier(identifier: string): Promise<Account | null> {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  /**
   * Gets all ledger accounts for a given account.
   */
  async getLedgerAccounts(accountId: UUID): Promise<LedgerAccount[]> {
    // TODO: Implement
    throw new Error('Not implemented');
  }
}
