import { DataSource, QueryRunner } from 'typeorm';
import { TypeOrmSequencer } from '../../../src/stores/ledger/TypeOrmSequencer';
import { TypeOrmBalanceStore } from '../../../src/stores/balance/TypeOrmBalanceStore';
import { AccountEntity } from '../../../src/stores/entities/AccountEntity';
import { LedgerAccountEntity } from '../../../src/stores/entities/LedgerAccountEntity';
import { TransactionEntity } from '../../../src/stores/entities/TransactionEntity';
import { LedgerLineEntity } from '../../../src/stores/entities/LedgerLineEntity';
import { BalanceEntity } from '../../../src/stores/entities/BalanceEntity';
import {
  AccountType,
  AccountStatus,
  LedgerAccountType,
  LedgerAccountStatus,
  TransactionType,
  TransactionStatus,
} from '../../../src/stores/entities/enums';

describe('TypeOrmSequencer (Integration)', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let sequencer: TypeOrmSequencer;
  let balanceStore: TypeOrmBalanceStore;

  // Test fixture data
  let testAccount: AccountEntity;
  let testLedgerAccount1: LedgerAccountEntity;
  let testLedgerAccount2: LedgerAccountEntity;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      username: process.env.POSTGRES_USER || 'ledger',
      password: process.env.POSTGRES_PASSWORD || 'ledger_secret',
      database: process.env.POSTGRES_DB || 'ledger',
      synchronize: true,
      logging: false,
      entities: [
        AccountEntity,
        LedgerAccountEntity,
        TransactionEntity,
        LedgerLineEntity,
        BalanceEntity,
      ],
    });

    await dataSource.initialize();
    sequencer = new TypeOrmSequencer();
    balanceStore = new TypeOrmBalanceStore();
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Create test fixtures
    testAccount = queryRunner.manager.create(AccountEntity, {
      name: 'Test User',
      identifier: `test-user-${Date.now()}-${Math.random()}`,
      type: AccountType.USER,
      status: AccountStatus.ACTIVE,
    });
    await queryRunner.manager.save(testAccount);

    testLedgerAccount1 = queryRunner.manager.create(LedgerAccountEntity, {
      accountId: testAccount.id,
      currency: 'USD',
      type: LedgerAccountType.USER_CASH,
      status: LedgerAccountStatus.ACTIVE,
    });
    await queryRunner.manager.save(testLedgerAccount1);

    testLedgerAccount2 = queryRunner.manager.create(LedgerAccountEntity, {
      accountId: testAccount.id,
      currency: 'USD',
      type: LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY,
      status: LedgerAccountStatus.ACTIVE,
    });
    await queryRunner.manager.save(testLedgerAccount2);
  });

  afterEach(async () => {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    await queryRunner.release();
  });

  describe('getNextSequence', () => {
    it('should return a timestamp-based sequence', async () => {
      const beforeTime = BigInt(Date.now());
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);
      const afterTime = BigInt(Date.now());

      expect(typeof result).toBe('bigint');
      expect(result).toBeGreaterThanOrEqual(beforeTime);
      expect(result).toBeLessThanOrEqual(afterTime);
    });

    it('should return a valid timestamp regardless of existing balance record', async () => {
      // Create a balance record
      await balanceStore.insert(testLedgerAccount1.id, 1000n, 1n, queryRunner);

      const beforeTime = BigInt(Date.now());
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);
      const afterTime = BigInt(Date.now());

      expect(typeof result).toBe('bigint');
      expect(result).toBeGreaterThanOrEqual(beforeTime);
      expect(result).toBeLessThanOrEqual(afterTime);
    });

    it('should return increasing sequences for consecutive calls', async () => {
      const seq1 = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));

      const seq2 = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      expect(seq2).toBeGreaterThanOrEqual(seq1);
    });

    it('should work independently for different ledger accounts', async () => {
      const seq1 = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);
      const seq2 = await sequencer.getNextSequence(testLedgerAccount2.id, queryRunner);

      // Both should be valid timestamps (within reasonable range of each other)
      expect(typeof seq1).toBe('bigint');
      expect(typeof seq2).toBe('bigint');
      expect(seq1).toBeGreaterThan(0n);
      expect(seq2).toBeGreaterThan(0n);
    });
  });
});
