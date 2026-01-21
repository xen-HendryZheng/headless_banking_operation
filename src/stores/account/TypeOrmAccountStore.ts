import { QueryRunner } from 'typeorm';
import {
  AccountStore,
  Account,
  CreateAccountInput,
} from '../../services/account/AccountStore';
import { UUID } from '../../domain/common/Types';
import { AccountEntity } from '../entities/AccountEntity';
import { AccountStatus } from '../entities/enums';

/**
 * TypeORM implementation of AccountStore.
 */
export class TypeOrmAccountStore implements AccountStore {
  async create(
    input: CreateAccountInput,
    queryRunner: QueryRunner
  ): Promise<Account> {
    const accountEntity = new AccountEntity();
    accountEntity.name = input.name;
    accountEntity.identifier = input.identifier;
    accountEntity.type = input.type;
    accountEntity.status = AccountStatus.ACTIVE;
    accountEntity.metadata = input.metadata || {};
    accountEntity.createdAt = new Date();
    accountEntity.updatedAt = new Date();

    const savedEntity = await queryRunner.manager.save(accountEntity);
    return this.mapToAccount(savedEntity);
  }

  async findById(id: UUID, queryRunner: QueryRunner): Promise<Account | null> {
    const accountEntity = await queryRunner.manager.findOne(AccountEntity, {
      where: { id },
    });

    return accountEntity ? this.mapToAccount(accountEntity) : null;
  }

  async findByIdentifier(
    identifier: string,
    queryRunner: QueryRunner
  ): Promise<Account | null> {
    const accountEntity = await queryRunner.manager.findOne(AccountEntity, {
      where: { identifier },
    });

    return accountEntity ? this.mapToAccount(accountEntity) : null;
  }

  /**
   * Maps AccountEntity to Account domain object.
   */
  private mapToAccount(entity: AccountEntity): Account {
    return {
      id: entity.id,
      name: entity.name,
      identifier: entity.identifier,
      type: entity.type as 'USER',
      status: entity.status as 'ACTIVE' | 'SUSPENDED',
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
