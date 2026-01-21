import { QueryRunner } from 'typeorm';
import { UUID } from '../../domain/common/Types';

/**
 * Balance record.
 */
export interface BalanceRecord {
  ledgerAccountId: UUID;
  balanceAmount: bigint;
  lastSequence: number;
  updatedAt: Date;
}

/**
 * Balance delta to apply.
 */
export interface BalanceDelta {
  ledgerAccountId: UUID;
  delta: bigint;
  newSequence: number;
}

/**
 * Balance service interface (port).
 * Responsible for maintaining balance projections.
 */
export interface BalanceService {
  /**
   * Applies balance deltas.
   * - Locks balances for affected ledger accounts
   * - Validates no-negative constraint
   * - Updates balance projections
   *
   * @param deltas - Balance deltas to apply
   * @param queryRunner - TypeORM QueryRunner for transaction context
   * @returns Updated balance records
   */
  apply(deltas: BalanceDelta[], queryRunner: QueryRunner): Promise<BalanceRecord[]>;

  lockForLedgerAccounts(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<void>;

  /**
   * Gets the current balance for a ledger account.
   */
  getBalance(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<BalanceRecord | null>;

  /**
   * Gets balances for multiple ledger accounts.
   */
  getBalances(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<BalanceRecord[]>;
}
