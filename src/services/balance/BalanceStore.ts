import { QueryRunner } from 'typeorm';
import { UUID } from '../../domain/common/Types';
import { BalanceRecord } from './BalanceService';

/**
 * Balance storage interface (port).
 * Handles persistence of balance projections with concurrency control.
 */
export interface BalanceStore {
  /**
   * Locks and gets a balance record (SELECT ... FOR UPDATE).
   */
  lockAndGet(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<BalanceRecord | null>;

  /**
   * Locks and gets multiple balance records.
   * IMPORTANT: Sort ledgerAccountIds to prevent deadlocks.
   */
  lockAndGetMany(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<BalanceRecord[]>;

  /**
   * INSERT a balance record (INSERT ... ON CONFLICT UPDATE).
   */
  insert(
    ledgerAccountId: UUID,
    balanceAmount: bigint,
    sequence: number,
    queryRunner: QueryRunner
  ): Promise<BalanceRecord>;

  /**
   * Updates an existing balance record.
   */
  updateBalance(
    ledgerAccountId: UUID,
    newBalance: bigint,
    newSequence: number,
    queryRunner: QueryRunner
  ): Promise<BalanceRecord>;
}
