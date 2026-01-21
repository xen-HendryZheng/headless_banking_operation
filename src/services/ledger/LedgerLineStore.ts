import { QueryRunner } from 'typeorm';
import { UUID } from '../../domain/common/Types';
import { LedgerLine } from '../../domain/ledger/LedgerTypes';

/**
 * Input for inserting a ledger line.
 */
export interface LedgerLineInsert {
  transactionId: UUID;
  ledgerAccountId: UUID;
  accountId: UUID;
  debit: bigint;
  credit: bigint;
  amount: bigint;
  sequence: number;
}

/**
 * Ledger line storage interface (port).
 * Handles persistence of immutable ledger entries.
 */
export interface LedgerLineStore {
  /**
   * Inserts ledger lines (batch).
   */
  insert(lines: LedgerLineInsert[], queryRunner: QueryRunner): Promise<LedgerLine[]>;

  /**
   * Finds ledger lines by transaction ID.
   */
  findByTransactionId(transactionId: UUID, queryRunner: QueryRunner): Promise<LedgerLine[]>;

  /**
   * Finds ledger lines by ledger account ID.
   */
  findByLedgerAccountId(ledgerAccountId: UUID, queryRunner: QueryRunner): Promise<LedgerLine[]>;

  getLatestLedgerLine(ledgerAccountId: string, queryRunner: QueryRunner): Promise<LedgerLine | null>;

}
