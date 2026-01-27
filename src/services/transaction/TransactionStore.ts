import { QueryRunner } from 'typeorm';
import { UUID, Currency, TxType, TxStatus } from '../../domain/common/Types';
import { TransactionType } from '../../stores/entities/enums';

/**
 * Transaction header record.
 */
export interface TransactionHeader {
  id: UUID;
  ledgerAccountId: UUID;
  counterpartyLedgerAccountId: UUID | null;
  type: TxType;
  currency: Currency;
  isCredit: boolean;
  amount: bigint;
  reference: string;
  description: string | null;
  status: TxStatus;
  accountId: UUID;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a transaction header.
 */
export interface CreateTransactionInput {
  parentTransactionId?: UUID | null;
  ledgerAccountId: UUID;
  counterpartyLedgerAccountId?: UUID | null;
  type: TransactionType;
  currency: Currency;
  isCredit: boolean;
  amount: bigint;
  reference: string;
  description?: string;
  accountId: UUID;
}

/**
 * Transaction storage interface (port).
 * Implementations handle database persistence.
 */
export interface TransactionStore {
  /**
   * Creates a transaction header record.
   */
  createHeader(input: CreateTransactionInput, queryRunner: QueryRunner): Promise<TransactionHeader>;
  /**
   * Finds a transaction by reference (for idempotency).
   */
  findByReference(reference: string, queryRunner: QueryRunner): Promise<TransactionHeader | null>;

  /**
   * Finds a transaction by ID.
   */
  findById(id: UUID, queryRunner: QueryRunner): Promise<TransactionHeader | null>;
}
