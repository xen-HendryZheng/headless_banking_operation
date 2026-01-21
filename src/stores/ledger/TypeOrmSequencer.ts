import { QueryRunner } from 'typeorm';
import { Sequencer } from '../../services/ledger/Sequencer';
import { UUID } from '../../domain/common/Types';

/**
 * TypeORM implementation of Sequencer.
 * Allocates monotonically increasing sequences per ledger account.
 */
export class TypeOrmSequencer implements Sequencer {
  async getNextSequence(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<number> {
    
    const result = await queryRunner.manager
      .createQueryBuilder()
      .select("balance.last_sequence", "last_sequence")
      .from("balance", "balance")
      .where("balance.ledger_account_id = :ledgerAccountId", { ledgerAccountId })
      .setLock("pessimistic_write") // Lock balance row for update
      .getRawOne();

    // If balance exists, return last_sequence + 1, otherwise return 1 (first transaction)
    return result ? result.last_sequence + 1 : 1;
  }
}
