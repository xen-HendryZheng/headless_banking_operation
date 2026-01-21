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

  // Assuming this is still within same transaction block as early get sequence balance locking
  async apply(deltas: BalanceDelta[], queryRunner: QueryRunner): Promise<BalanceRecord[]> {
    if (deltas.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(deltas.map(delta => delta.ledgerAccountId))).sort();
    const lockedBalances = await this.balanceStore.lockAndGetMany(uniqueIds, queryRunner);
    const balanceMap = new Map<UUID, BalanceRecord>(
      lockedBalances.map(record => [record.ledgerAccountId, record])
    );

    const updatedRecords: BalanceRecord[] = [];

    for (const delta of deltas) {
      const existingBalance = balanceMap.get(delta.ledgerAccountId);
      const currentBalance = existingBalance?.balanceAmount ?? 0n;
      this.balanceRules.assertNoNegative(currentBalance, delta.delta);

      const newBalance = currentBalance + delta.delta;

      // Use insert for new balance records, update for existing ones
      const updated = existingBalance
        ? await this.balanceStore.updateBalance(
            delta.ledgerAccountId,
            newBalance,
            delta.newSequence,
            queryRunner
          )
        : await this.balanceStore.insert(
            delta.ledgerAccountId,
            newBalance,
            delta.newSequence,
            queryRunner
          );

      balanceMap.set(delta.ledgerAccountId, updated);
      updatedRecords.push(updated);
    }

    return updatedRecords;
  }

  async getBalance(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<BalanceRecord | null> {
    return this.balanceStore.lockAndGet(ledgerAccountId, queryRunner);
  }

  async getBalances(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<BalanceRecord[]> {
    return this.balanceStore.lockAndGetMany(ledgerAccountIds, queryRunner);
  }
}
