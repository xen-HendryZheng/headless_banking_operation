import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { TransactionType, TransactionStatus } from './enums';
import { BigIntTransformer } from '../transformers/BigIntTransformer';
import { LedgerAccountEntity } from './LedgerAccountEntity';
import { LedgerLineEntity } from './LedgerLineEntity';

@Entity('transaction')
@Index(['ledgerAccountId', 'createdAt'])
@Index(['counterpartyLedgerAccountId', 'createdAt'])
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ledger_account_id', type: 'uuid' })
  ledgerAccountId!: string;

  @Column({ name: 'counterparty_ledger_account_id', type: 'uuid', nullable: true })
  counterpartyLedgerAccountId!: string | null;

  @Column({ type: 'enum', enum: TransactionType })
  type!: TransactionType;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ name: 'is_credit', type: 'boolean' })
  isCredit!: boolean;

  @Column({ type: 'bigint', transformer: new BigIntTransformer() })
  amount!: bigint;

  @Column({ type: 'varchar', length: 255, unique: true })
  reference!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status!: TransactionStatus;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => LedgerAccountEntity)
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccountEntity;

  @ManyToOne(() => LedgerAccountEntity, { nullable: true })
  @JoinColumn({ name: 'counterparty_ledger_account_id' })
  counterpartyLedgerAccount!: LedgerAccountEntity | null;

  @OneToMany(() => LedgerLineEntity, (ledgerLine) => ledgerLine.transaction)
  ledgerLines!: LedgerLineEntity[];
}
