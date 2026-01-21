import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { LedgerAccountType, LedgerAccountStatus } from './enums';
import { AccountEntity } from './AccountEntity';
import { LedgerLineEntity } from './LedgerLineEntity';
import { BalanceEntity } from './BalanceEntity';

@Entity('ledger_account')
export class LedgerAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'enum', enum: LedgerAccountType })
  type!: LedgerAccountType;

  @Column({ type: 'enum', enum: LedgerAccountStatus, default: LedgerAccountStatus.ACTIVE })
  status!: LedgerAccountStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => AccountEntity, (account) => account.ledgerAccounts)
  @JoinColumn({ name: 'account_id' })
  account!: AccountEntity;

  @OneToMany(() => LedgerLineEntity, (ledgerLine) => ledgerLine.ledgerAccount)
  ledgerLines!: LedgerLineEntity[];

  @OneToOne(() => BalanceEntity, (balance) => balance.ledgerAccount)
  balance!: BalanceEntity;
}
