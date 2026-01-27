import { QueryRunner } from 'typeorm';
import {
  TransactionStore,
  TransactionHeader,
  CreateTransactionInput,
} from '../../services/transaction/TransactionStore';
import { UUID } from '../../domain/common/Types';
import { TransactionEntity } from '../entities/TransactionEntity';
import { TransactionStatus } from '../entities/enums';

/**
 * TypeORM implementation of TransactionStore.
 */
export class TypeOrmTransactionStore implements TransactionStore {
  async createHeader(
    input: CreateTransactionInput,
    queryRunner: QueryRunner
  ): Promise<TransactionHeader> {

    const transactionEntity = new TransactionEntity();
    transactionEntity.ledgerAccountId = input.ledgerAccountId;
    transactionEntity.parentTransactionId = input.parentTransactionId || null;
    transactionEntity.accountId = input.accountId;
    transactionEntity.type = input.type;
    transactionEntity.status = TransactionStatus.POSTED;
    transactionEntity.isCredit = input.isCredit;
    transactionEntity.amount = input.amount;
    transactionEntity.currency = input.currency;
    transactionEntity.reference = input.reference;
    transactionEntity.description = input.description || null;
    transactionEntity.counterpartyLedgerAccountId = input.counterpartyLedgerAccountId || null;

    await queryRunner.manager.save(transactionEntity);

    return this.mapToHeader(transactionEntity);
  }

  async findByReference(
    reference: string,
    queryRunner: QueryRunner
  ): Promise<TransactionHeader | null> {
    
    return queryRunner.manager.findOne(TransactionEntity, {
      where: { reference },
    }).then(entity => entity ? this.mapToHeader(entity) : null);
  }

  async findById(id: UUID, queryRunner: QueryRunner): Promise<TransactionHeader | null> {
    // TODO: Implement
    // Use queryRunner.manager.findOne() with id filter
    return queryRunner.manager.findOne(TransactionEntity, {
      where: { id },
    }).then(entity => entity ? this.mapToHeader(entity) : null);
  }

  /**
   * Maps TransactionEntity to TransactionHeader.
   */
  private mapToHeader(entity: TransactionEntity): TransactionHeader {
    return {
      id: entity.id,
      ledgerAccountId: entity.ledgerAccountId,
      counterpartyLedgerAccountId: entity.counterpartyLedgerAccountId || null,
      type: entity.type,
      currency: entity.currency,
      isCredit: entity.isCredit,
      amount: entity.amount,
      reference: entity.reference,
      description: entity.description || null,
      status: entity.status,
      accountId: entity.accountId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
