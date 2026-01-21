import { QueryRunner } from 'typeorm';
import { UUID } from '../../domain/common/Types';

/**
 * Account record returned from store.
 */
export interface Account {
  id: UUID;
  name: string;
  identifier: string;
  type: 'USER';
  status: 'ACTIVE' | 'SUSPENDED';
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating an account.
 */
export interface CreateAccountInput {
  name: string;
  identifier: string;
  type: 'USER';
  metadata?: Record<string, unknown>;
}

/**
 * Account storage interface (port).
 * Implementations handle database persistence.
 */
export interface AccountStore {
  /**
   * Creates an account record.
   */
  create(input: CreateAccountInput, queryRunner: QueryRunner): Promise<Account>;

  /**
   * Finds an account by ID.
   */
  findById(id: UUID, queryRunner: QueryRunner): Promise<Account | null>;

  /**
   * Finds an account by unique identifier.
   */
  findByIdentifier(identifier: string, queryRunner: QueryRunner): Promise<Account | null>;
}
