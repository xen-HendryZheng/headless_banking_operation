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
    it('should return 1 for ledger account without balance record', async () => {
      // No balance record exists yet
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      expect(result).toBe(1);
    });

    it('should return incrementing sequence for existing balance record', async () => {
      // Create a balance record with sequence 1
      await balanceStore.insert(testLedgerAccount1.id, 1000n, 1, queryRunner);

      // Get next sequence
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      expect(result).toBe(2);
    });

    it('should handle multiple balance updates correctly', async () => {
      // Create a balance record with sequence 3 (simulating 3 transactions)
      await balanceStore.insert(testLedgerAccount1.id, 9000n, 3, queryRunner);

      // Get next sequence
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      expect(result).toBe(4);
    });

    it('should handle concurrent sequence requests safely', async () => {
      // First call - should return 1 for account without balance
      const seq1 = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);
      expect(seq1).toBe(1);

      // Create balance with sequence 1
      await balanceStore.insert(testLedgerAccount1.id, 1000n, 1, queryRunner);

      // Second call - should return 2 now
      const seq2 = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);
      expect(seq2).toBe(2);

      // Different ledger account should still return 1
      const seq3 = await sequencer.getNextSequence(testLedgerAccount2.id, queryRunner);
      expect(seq3).toBe(1);
    });

    it('should return correct sequence for ledger account with gap in sequences', async () => {
      // Balance record with sequence 10 (simulating gap)
      await balanceStore.insert(testLedgerAccount1.id, 6000n, 10, queryRunner);

      // Get next sequence - should be last_sequence + 1
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      expect(result).toBe(11);
    });
  });
});
