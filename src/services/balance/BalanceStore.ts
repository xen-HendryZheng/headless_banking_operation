import { QueryRunner } from 'typeorm';
import { UUID } from '../../domain/common/Types';
import { BalanceRecord } from './BalanceService';

/**
 * Balance storage interface (port).
 * Handles persistence of balance projections with concurrency control.
 */
export interface BalanceStore {
  /**
   * Lock and fetch a balance row.
   */
  lockAndGet(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<BalanceRecord | null>;

  /**
   * Lock and fetch multiple balance rows.
   */
  lockAndGetMany(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<BalanceRecord[]>;

  /**
   * INSERT a balance record (INSERT ... ON CONFLICT UPDATE).
   */
  insert(
    ledgerAccountId: UUID,
    balanceAmount: bigint,
    sequence: bigint,
    queryRunner: QueryRunner
  ): Promise<BalanceRecord>;

  /**
   * Updates an existing balance record.
   */
  updateBalance(
    ledgerAccountId: UUID,
    newBalance: bigint,
    newSequence: bigint,
    queryRunner: QueryRunner
  ): Promise<BalanceRecord>;

  /**
   * Get balance records only
   * 
   */
  getBalance(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<BalanceRecord | null>;
  getBalances(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<BalanceRecord[]>;
}
