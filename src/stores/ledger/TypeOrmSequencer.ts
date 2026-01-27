import { QueryRunner } from 'typeorm';
import { Sequencer } from '../../services/ledger/Sequencer';
import { UUID } from '../../domain/common/Types';

/**
 * TypeORM implementation of Sequencer.
 * Uses timestamp-based sequences per ledger account.
 */
export class TypeOrmSequencer implements Sequencer {
  async getNextSequence(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<bigint> {
    // Lock balance row for update to ensure atomic access
    await queryRunner.manager
      .createQueryBuilder()
      .select("balance.ledger_account_id")
      .from("balance", "balance")
      .where("balance.ledger_account_id = :ledgerAccountId", { ledgerAccountId })
      .setLock("pessimistic_write")
      .getRawOne();

    const timestampSequence = BigInt(Date.now());
    return timestampSequence;
  }
}
