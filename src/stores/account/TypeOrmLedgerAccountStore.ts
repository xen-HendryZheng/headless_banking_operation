import { QueryRunner } from 'typeorm';
import {
  LedgerAccountStore,
  LedgerAccount,
  CreateLedgerAccountInput,
} from '../../services/account/LedgerAccountStore';
import { UUID } from '../../domain/common/Types';
import { LedgerAccountEntity } from '../entities/LedgerAccountEntity';
import { LedgerAccountStatus, LedgerAccountType } from 'stores/entities';

/**
 * TypeORM implementation of LedgerAccountStore.
 */
export class TypeOrmLedgerAccountStore implements LedgerAccountStore {
  async create(
    input: CreateLedgerAccountInput,
    queryRunner: QueryRunner
  ): Promise<LedgerAccount> {
    const ledgerAccountEntity = new LedgerAccountEntity();
    ledgerAccountEntity.accountId = input.accountId;
    ledgerAccountEntity.currency = input.currency;
    ledgerAccountEntity.type = input.type;
    ledgerAccountEntity.status = LedgerAccountStatus.ACTIVE;
    ledgerAccountEntity.metadata = input.metadata || {};
    ledgerAccountEntity.createdAt = new Date();

    const savedEntity = await queryRunner.manager.save(ledgerAccountEntity);
    return this.mapToLedgerAccount(savedEntity);
  }

  async findById(id: UUID, queryRunner: QueryRunner): Promise<LedgerAccount | null> {
    const ledgerAccountEntity = await queryRunner.manager.findOne(LedgerAccountEntity, {
      where: { id },
    });

    return ledgerAccountEntity ? this.mapToLedgerAccount(ledgerAccountEntity) : null;
  }

  async findByAccountId(
    accountId: UUID,
    queryRunner: QueryRunner
  ): Promise<LedgerAccount[]> {
    const ledgerAccountEntities = await queryRunner.manager.find(LedgerAccountEntity, {
      where: { accountId },
    });

    return ledgerAccountEntities.map(entity => this.mapToLedgerAccount(entity));
  }

  async findByAccountIdAndType(
    accountId: UUID,
    type: 'USER_CASH' | 'FIRSTCIRCLE_BUSINESS_LIABILITY',
    queryRunner: QueryRunner
  ): Promise<LedgerAccount | null> {
    const ledgerAccountEntity = await queryRunner.manager
      .createQueryBuilder(LedgerAccountEntity, 'ledgerAccount')
      .where('ledgerAccount.account_id = :accountId AND ledgerAccount.type = :type', { accountId, type })
      .getOne();

    return ledgerAccountEntity ? this.mapToLedgerAccount(ledgerAccountEntity) : null;
  }

  /**
   * Maps LedgerAccountEntity to LedgerAccount domain object.
   */
  private mapToLedgerAccount(entity: LedgerAccountEntity): LedgerAccount {
    return {
      id: entity.id,
      accountId: entity.accountId,
      currency: entity.currency,
      type: entity.type as LedgerAccountType,
      status: entity.status as 'ACTIVE' | 'FROZEN',
      metadata: entity.metadata,
      createdAt: entity.createdAt,
    };
  }
}
