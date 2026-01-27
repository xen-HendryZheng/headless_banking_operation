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

  async lockAndGet(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<BalanceRecord | null> {
    const balanceEntity = await queryRunner.manager
      .createQueryBuilder(BalanceEntity, 'balance')
      .setLock('pessimistic_write')
      .where('balance.ledger_account_id = :ledgerAccountId', { ledgerAccountId })
      .getOne();

    if (!balanceEntity) {
      return null;
    }

    return this.mapToBalanceRecord(balanceEntity);
  }

  async lockAndGetMany(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<BalanceRecord[]> {
    if (ledgerAccountIds.length === 0) {
      return [];
    }

    const balanceEntities = await queryRunner.manager
      .createQueryBuilder(BalanceEntity, 'balance')
      .setLock('pessimistic_write')
      .where('balance.ledger_account_id IN (:...ledgerAccountIds)', { ledgerAccountIds })
      .orderBy('balance.ledger_account_id', 'ASC')
      .getMany();

    return balanceEntities.map(entity => this.mapToBalanceRecord(entity));
  }

  async getBalance(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<BalanceRecord | null> {
    const balanceEntity = await queryRunner.manager
      .createQueryBuilder(BalanceEntity, 'balance')
      .where('balance.ledger_account_id = :ledgerAccountId', { ledgerAccountId })
      .getOne();

    if (!balanceEntity) {
      return null;
    }

    return this.mapToBalanceRecord(balanceEntity);
  }

  async getBalances(ledgerAccountIds: UUID[], queryRunner: QueryRunner): Promise<BalanceRecord[]> {
    const balanceEntities = await queryRunner.manager
      .createQueryBuilder(BalanceEntity, 'balance')
      .where('balance.ledger_account_id IN (:...ledgerAccountIds)', { ledgerAccountIds })
      .getMany();

    return balanceEntities.map(entity => this.mapToBalanceRecord(entity));
  }

  async upsert(
    ledgerAccountId: UUID,
    newBalance: bigint,
    newSequence: bigint,
    queryRunner: QueryRunner
  ): Promise<BalanceRecord> {
    const existing = await this.lockAndGet(ledgerAccountId, queryRunner);
    if (existing) {
      return this.updateBalance(ledgerAccountId, newBalance, newSequence, queryRunner);
    }
    return this.insert(ledgerAccountId, newBalance, newSequence, queryRunner);
  }

  async insert(
    ledgerAccountId: UUID,
    balanceAmount: bigint,
    sequence: bigint,
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
    newSequence: bigint,
    queryRunner: QueryRunner
  ): Promise<BalanceRecord> {
    const result = await queryRunner.manager
      .createQueryBuilder()
      .update(BalanceEntity)
      .set({
        balanceAmount: newBalance,
        lastSequence: newSequence,
        updatedAt: new Date(),
      })
      .where('ledger_account_id = :ledgerAccountId', { ledgerAccountId })
      .returning('*')
      .execute();

    // Map raw snake_case result to BalanceRecord
    const raw = result.raw[0];
    return {
      ledgerAccountId: raw.ledger_account_id,
      balanceAmount: BigInt(raw.balance_amount),
      lastSequence: BigInt(raw.last_sequence),
      updatedAt: raw.updated_at,
    };
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
