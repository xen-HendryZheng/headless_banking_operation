import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { LineSubtype } from './enums';
import { BigIntTransformer } from '../transformers/BigIntTransformer';
import { TransactionEntity } from './TransactionEntity';
import { LedgerAccountEntity } from './LedgerAccountEntity';

@Entity('ledger_lines')
@Index(['ledgerAccountId', 'sequence'])
@Index(['transactionId'])
export class LedgerLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @Column({ name: 'ledger_account_id', type: 'uuid' })
  ledgerAccountId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ type: 'bigint', default: 0, transformer: new BigIntTransformer() })
  debit!: bigint;

  @Column({ type: 'bigint', default: 0, transformer: new BigIntTransformer() })
  credit!: bigint;

  @Column({ type: 'bigint', transformer: new BigIntTransformer() })
  amount!: bigint;

  @Column({ type: 'enum', enum: LineSubtype })
  subtype!: LineSubtype;

  @Column({ type: 'integer' })
  sequence!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => TransactionEntity, (transaction) => transaction.ledgerLines)
  @JoinColumn({ name: 'transaction_id' })
  transaction!: TransactionEntity;

  @ManyToOne(() => LedgerAccountEntity, (ledgerAccount) => ledgerAccount.ledgerLines)
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccountEntity;
}
