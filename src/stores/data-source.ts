import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { AccountEntity } from './entities/AccountEntity';
import { LedgerAccountEntity } from './entities/LedgerAccountEntity';
import { TransactionEntity } from './entities/TransactionEntity';
import { LedgerLineEntity } from './entities/LedgerLineEntity';
import { BalanceEntity } from './entities/BalanceEntity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER || 'ledger',
  password: process.env.POSTGRES_PASSWORD || 'ledger_secret',
  database: process.env.POSTGRES_DB || 'ledger',
  synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
  logging: process.env.TYPEORM_LOGGING === 'true',
  entities: [
    AccountEntity,
    LedgerAccountEntity,
    TransactionEntity,
    LedgerLineEntity,
    BalanceEntity,
  ],
  migrations: ['src/infrastructure/migrations/*.ts'],
  subscribers: [],
});
