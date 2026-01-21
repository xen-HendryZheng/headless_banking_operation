import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AccountType, AccountStatus } from './enums';
import { LedgerAccountEntity } from './LedgerAccountEntity';

@Entity('account')
export class AccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  identifier!: string;

  @Column({ type: 'enum', enum: AccountType })
  type!: string;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status!: AccountStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => LedgerAccountEntity, (ledgerAccount) => ledgerAccount.account)
  ledgerAccounts!: LedgerAccountEntity[];
}
