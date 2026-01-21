import { QueryRunner } from 'typeorm';
import { UUID } from '../../domain/common/Types';

/**
 * Sequencer interface (port).
 * Responsible for allocating monotonically increasing sequences per ledger account.
 */
export interface Sequencer {
  /**
   * Gets the next sequence number for a ledger account.
   * Must be atomic and handle concurrent access safely.
   *
   * @param ledgerAccountId - The ledger account ID
   * @param queryRunner - TypeORM QueryRunner for transaction context
   * @returns The next sequence number
   */
  getNextSequence(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<number>;
}
