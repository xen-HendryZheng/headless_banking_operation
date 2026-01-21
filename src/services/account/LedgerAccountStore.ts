import { QueryRunner } from 'typeorm';
import { UUID, Currency } from '../../domain/common/Types';
import { LedgerAccountType } from 'stores';

/**
 * Ledger account record returned from store.
 */
export interface LedgerAccount {
  id: UUID;
  accountId: UUID;
  currency: Currency;
  type: LedgerAccountType;
  status: 'ACTIVE' | 'FROZEN';
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Input for creating a ledger account.
 */
export interface CreateLedgerAccountInput {
  accountId: UUID;
  currency: Currency;
  type: LedgerAccountType;
  metadata?: Record<string, unknown>;
}

/**
 * Ledger account storage interface (port).
 * Implementations handle database persistence.
 */
export interface LedgerAccountStore {
  /**
   * Creates a ledger account record.
   */
  create(input: CreateLedgerAccountInput, queryRunner: QueryRunner): Promise<LedgerAccount>;

  /**
   * Finds a ledger account by ID.
   */
  findById(id: UUID, queryRunner: QueryRunner): Promise<LedgerAccount | null>;

  /**
   * Finds all ledger accounts for a given account.
   */
  findByAccountId(accountId: UUID, queryRunner: QueryRunner): Promise<LedgerAccount[]>;

  /**
   * Finds a ledger account by account ID and type.
   */
  findByAccountIdAndType(
    accountId: UUID,
    type: LedgerAccountType,
    queryRunner: QueryRunner
  ): Promise<LedgerAccount | null>;
}
