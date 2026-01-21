import { QueryRunner } from 'typeorm';
import { BalanceService, BalanceRecord, BalanceDelta } from './BalanceService';
import { BalanceStore } from './BalanceStore';
import { BalanceRules } from '../../domain/balance/BalanceRules';
import { UUID } from '../../domain/common/Types';

/**
 * Implementation of the balance service.
 */
export class BalanceServiceImpl implements BalanceService {
  constructor(
    private readonly balanceRules: BalanceRules,
    private readonly balanceStore: BalanceStore
  ) {}

  async apply(deltas: BalanceDelta[], queryRunner: QueryRunner): Promise<BalanceRecord[]> {
    // TODO: Implement
    // 1. Extract unique ledger account IDs from deltas
    // 2. Sort IDs to prevent deadlocks
    // 3. Lock and get all balances via balanceStore.lockAndGetMany()
    // 4. For each delta:
    //    a. Get current balance (or 0 if new)
    //    b. Check balanceRules.assertNoNegative(current, delta)
    //    c. Calculate new balance
    //    d. Upsert/update balance
    // 5. Return updated balance records
    throw new Error('Not implemented');
  }

  async lockForLedgerAccounts(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<void> {

  };

  async getBalance(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<BalanceRecord | null> {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  async getBalances(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<BalanceRecord[]> {
    // TODO: Implement
    throw new Error('Not implemented');
  }
}
