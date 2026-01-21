import { QueryRunner } from 'typeorm';
import { BalanceStore } from '../../services/balance/BalanceStore';
import { BalanceRecord } from '../../services/balance/BalanceService';
import { UUID } from '../../domain/common/Types';
import { BalanceEntity } from '../entities/BalanceEntity';

/**
 * TypeORM implementation of BalanceStore.
 * Handles balance persistence with row-level locking for concurrency safety.
 */
export class TypeOrmBalanceStore implements BalanceStore {
  async lockAndGet(
    ledgerAccountId: UUID,
    queryRunner: QueryRunner
  ): Promise<BalanceRecord | null> {
    const balanceEntity = await queryRunner.manager.createQueryBuilder(BalanceEntity, 'balance')
      .where('balance.ledger_account_id = :ledgerAccountId', { ledgerAccountId })
      .setLock('pessimistic_write')
      .getOne();

    if (!balanceEntity) {
      return null;
    }

    return this.mapToBalanceRecord(balanceEntity);
  }

  async lockAndGetMany(
    ledgerAccountIds: UUID[],
    queryRunner: QueryRunner
  ): Promise<BalanceRecord[]> {
    const balanceEntities = await queryRunner.manager.createQueryBuilder(BalanceEntity, 'balance')
      .where('balance.ledger_account_id IN (:...ledgerAccountIds)', { ledgerAccountIds })
      .setLock('pessimistic_write')
      .getMany();

    return balanceEntities.map(entity => this.mapToBalanceRecord(entity));
  }

  async insert(
    ledgerAccountId: UUID,
    balanceAmount: bigint,
    sequence: number,
    queryRunner: QueryRunner
  ): Promise<BalanceRecord> {
    const balanceEntity = new BalanceEntity();
    balanceEntity.ledgerAccountId = ledgerAccountId;
    balanceEntity.balanceAmount = balanceAmount;
    balanceEntity.lastSequence = sequence;
    balanceEntity.updatedAt = new Date();

    const savedEntity = await queryRunner.manager.save(balanceEntity);
    return this.mapToBalanceRecord(savedEntity);
  }

  /**
   * Updates the balance for a specific ledger account.
   *
   * Note : This method assumes the balance row is already locked.
   */
  async updateBalance(
    ledgerAccountId: UUID,
    newBalance: bigint,
    newSequence: number,
    queryRunner: QueryRunner
  ): Promise<BalanceRecord> {
    const balanceEntity = await queryRunner.manager
      .createQueryBuilder()
      .update(BalanceEntity)
      .set({
        balanceAmount: newBalance,
        lastSequence: newSequence,
        updatedAt: new Date(),
      })
      .where('ledger_account_id = :ledgerAccountId', { ledgerAccountId })
      .returning('*')
      .execute()
      .then(result => result.raw[0] as BalanceEntity);

    return this.mapToBalanceRecord(balanceEntity);
  }

  /**
   * Maps BalanceEntity to BalanceRecord.
   */
  private mapToBalanceRecord(entity: BalanceEntity): BalanceRecord {
    return {
      ledgerAccountId: entity.ledgerAccountId,
      balanceAmount: entity.balanceAmount,
      lastSequence: entity.lastSequence,
      updatedAt: entity.updatedAt,
    };
  }
}
