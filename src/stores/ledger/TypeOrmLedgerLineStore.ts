import { QueryRunner } from 'typeorm';
import { LedgerLineStore, LedgerLineInsert } from '../../services/ledger/LedgerLineStore';
import { LedgerLine } from '../../domain/ledger/LedgerTypes';
import { UUID } from '../../domain/common/Types';
import { LedgerLineEntity } from '../entities/LedgerLineEntity';

/**
 * TypeORM implementation of LedgerLineStore.
 */
export class TypeOrmLedgerLineStore implements LedgerLineStore {
  async insert(lines: LedgerLineInsert[], queryRunner: QueryRunner): Promise<LedgerLine[]> {
    const entities = lines.map(line => {
      const entity = new LedgerLineEntity();
      entity.ledgerAccountId = line.ledgerAccountId;
      entity.accountId = line.accountId;
      entity.transactionId = line.transactionId;
      entity.sequence = line.sequence;
      entity.amount = line.amount;
      entity.debit = line.debit;
      entity.credit = line.credit;
      entity.createdAt = new Date();
      return entity;
    });
    const savedEntities = await queryRunner.manager.save(entities);
    return savedEntities.map(entity => this.mapToLedgerLine(entity));
  }

  async findByTransactionId(
    transactionId: UUID,
    queryRunner: QueryRunner
  ): Promise<LedgerLine[]> {
    return queryRunner.manager.find(LedgerLineEntity, {
      where: { transactionId },
    }).then(entities => entities.map(entity => this.mapToLedgerLine(entity)));
  }

  async findByLedgerAccountId(
    ledgerAccountId: UUID,
    queryRunner: QueryRunner
  ): Promise<LedgerLine[]> {
    return queryRunner.manager.find(LedgerLineEntity, {
      where: { ledgerAccountId },
      order: { sequence: 'ASC' },
    }).then(entities => entities.map(entity => this.mapToLedgerLine(entity)));
  }

  async getLatestLedgerLine(ledgerAccountId: string, queryRunner: QueryRunner): Promise<LedgerLine | null> {
    const ledgerLineEntity = await queryRunner.manager
      .createQueryBuilder(LedgerLineEntity, 'ledgerLine')
      .where('ledgerLine.ledger_account_id = :ledgerAccountId', { ledgerAccountId })
      .orderBy('ledgerLine.sequence', 'DESC')
      .getOne();

    return ledgerLineEntity ? this.mapToLedgerLine(ledgerLineEntity) : null;
  }

  /**
   * Maps LedgerLineEntity to LedgerLine.
   */
  private mapToLedgerLine(entity: LedgerLineEntity): LedgerLine {
    return {
      id: entity.id as UUID,
      accountId: entity.accountId,
      credit: entity.credit,
      debit: entity.debit,
      amount: entity.amount,
      ledgerAccountId: entity.ledgerAccountId,
      transactionId: entity.transactionId,
      sequence: entity.sequence,
      createdAt: entity.createdAt,
    };
  }
}
