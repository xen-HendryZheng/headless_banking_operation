import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { BigIntTransformer } from '../transformers/BigIntTransformer';
import { LedgerAccountEntity } from './LedgerAccountEntity';

@Entity('balance')
export class BalanceEntity {
  @PrimaryColumn({ name: 'ledger_account_id', type: 'uuid' })
  ledgerAccountId!: string;

  @Column({ name: 'balance_amount', type: 'bigint', default: 0, transformer: new BigIntTransformer() })
  balanceAmount!: bigint;

  @Column({ name: 'last_sequence', type: 'bigint', default: 0, transformer: new BigIntTransformer() })
  lastSequence!: bigint;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToOne(() => LedgerAccountEntity, (ledgerAccount) => ledgerAccount.balance)
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccountEntity;
}
