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

    let nextSequence: number;
    if (result) {
      nextSequence = result.last_sequence + 1;
    } else {
      // throw error if balance record not found
      throw new Error(`Balance record not found for ledgerAccountId: ${ledgerAccountId}`);
    }

    return nextSequence;
  }
}
