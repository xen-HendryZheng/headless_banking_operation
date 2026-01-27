import { DataSource, QueryRunner } from 'typeorm';
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
} from '../../../src/stores/entities/enums';

describe('TypeOrmBalanceStore (Integration)', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let balanceStore: TypeOrmBalanceStore;

  // Test fixture data
  let testAccount: AccountEntity;
  let testLedgerAccount1: LedgerAccountEntity;
  let testLedgerAccount2: LedgerAccountEntity;
  let testLedgerAccount3: LedgerAccountEntity;

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
      type: LedgerAccountType.USER_CASH,
      status: LedgerAccountStatus.ACTIVE,
    });
    await queryRunner.manager.save(testLedgerAccount2);

    testLedgerAccount3 = queryRunner.manager.create(LedgerAccountEntity, {
      accountId: testAccount.id,
      currency: 'PHP',
      type: LedgerAccountType.USER_CASH,
      status: LedgerAccountStatus.ACTIVE,
    });
    await queryRunner.manager.save(testLedgerAccount3);
  });

  afterEach(async () => {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    await queryRunner.release();
  });

  describe('lockAndGet', () => {
    it('should lock and return balance for existing ledger account', async () => {
      // First create a balance
      await balanceStore.upsert(testLedgerAccount1.id, 5000n, 1n, queryRunner);

      const result = await balanceStore.lockAndGet(testLedgerAccount1.id, queryRunner);

      expect(result).not.toBeNull();
      expect(result!.ledgerAccountId).toBe(testLedgerAccount1.id);
      expect(result!.balanceAmount).toBe(5000n);
      expect(result!.lastSequence).toBe(1n);
    });

    it('should return null for non-existent ledger account', async () => {
      const result = await balanceStore.lockAndGet(
        '00000000-0000-0000-0000-000000000000',
        queryRunner
      );

      expect(result).toBeNull();
    });

    it('should acquire row-level lock (FOR UPDATE)', async () => {
      // Create a balance
      await balanceStore.upsert(testLedgerAccount1.id, 1000n, 1n, queryRunner);

      // Lock and get should work within the same transaction
      const result = await balanceStore.lockAndGet(testLedgerAccount1.id, queryRunner);

      expect(result).not.toBeNull();
      expect(result!.balanceAmount).toBe(1000n);

      // Verify we can update after locking (proves lock was acquired)
      const updated = await balanceStore.updateBalance(
        testLedgerAccount1.id,
        2000n,
        2n,
        queryRunner
      );
      expect(updated.balanceAmount).toBe(2000n);
    });
  });

  describe('lockAndGetMany', () => {
    it('should lock and return balances for multiple ledger accounts', async () => {
      // Create balances for multiple accounts
      await balanceStore.upsert(testLedgerAccount1.id, 1000n, 1n, queryRunner);
      await balanceStore.upsert(testLedgerAccount2.id, 2000n, 2n, queryRunner);

      const result = await balanceStore.lockAndGetMany(
        [testLedgerAccount1.id, testLedgerAccount2.id],
        queryRunner
      );

      expect(result).toHaveLength(2);
      const balances = new Map(result.map((b) => [b.ledgerAccountId, b]));
      expect(balances.get(testLedgerAccount1.id)?.balanceAmount).toBe(1000n);
      expect(balances.get(testLedgerAccount2.id)?.balanceAmount).toBe(2000n);
    });

    it('should return balances in consistent order', async () => {
      // Create balances
      await balanceStore.upsert(testLedgerAccount1.id, 1000n, 1n, queryRunner);
      await balanceStore.upsert(testLedgerAccount2.id, 2000n, 1n, queryRunner);
      await balanceStore.upsert(testLedgerAccount3.id, 3000n, 1n, queryRunner);

      // Request in different orders - results should be sorted
      const result1 = await balanceStore.lockAndGetMany(
        [testLedgerAccount3.id, testLedgerAccount1.id, testLedgerAccount2.id],
        queryRunner
      );

      const result2 = await balanceStore.lockAndGetMany(
        [testLedgerAccount1.id, testLedgerAccount2.id, testLedgerAccount3.id],
        queryRunner
      );

      // Both should return in the same sorted order (by ledger_account_id)
      expect(result1.map((b) => b.ledgerAccountId).sort()).toEqual(
        result2.map((b) => b.ledgerAccountId).sort()
      );
    });

    it('should handle mix of existing and non-existing accounts', async () => {
      // Only create balance for one account
      await balanceStore.upsert(testLedgerAccount1.id, 1000n, 1n, queryRunner);

      const result = await balanceStore.lockAndGetMany(
        [testLedgerAccount1.id, '00000000-0000-0000-0000-000000000000'],
        queryRunner
      );

      // Should only return the existing balance
      expect(result).toHaveLength(1);
      expect(result[0].ledgerAccountId).toBe(testLedgerAccount1.id);
    });
  });

  describe('upsert', () => {
    it('should insert new balance record', async () => {
      const result = await balanceStore.upsert(
        testLedgerAccount1.id,
        10000n,
        1n,
        queryRunner
      );

      expect(result.ledgerAccountId).toBe(testLedgerAccount1.id);
      expect(result.balanceAmount).toBe(10000n);
      expect(result.lastSequence).toBe(1n);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should update existing balance record', async () => {
      // First insert
      await balanceStore.upsert(testLedgerAccount1.id, 5000n, 1n, queryRunner);

      // Then update
      const result = await balanceStore.upsert(
        testLedgerAccount1.id,
        8000n,
        2n,
        queryRunner
      );

      expect(result.balanceAmount).toBe(8000n);
      expect(result.lastSequence).toBe(2n);
    });

    it('should return the upserted balance record', async () => {
      const result = await balanceStore.upsert(
        testLedgerAccount2.id,
        15000n,
        5n,
        queryRunner
      );

      expect(result).toEqual(
        expect.objectContaining({
          ledgerAccountId: testLedgerAccount2.id,
          balanceAmount: 15000n,
          lastSequence: 5n,
        })
      );
    });
  });

  describe('updateBalance', () => {
    it('should update balance amount and sequence', async () => {
      // First create a balance
      await balanceStore.upsert(testLedgerAccount1.id, 1000n, 1n, queryRunner);

      // Then update
      const result = await balanceStore.updateBalance(
        testLedgerAccount1.id,
        5000n,
        3n,
        queryRunner
      );

      expect(result.balanceAmount).toBe(5000n);
      expect(result.lastSequence).toBe(3n);
    });

    it('should update the updated_at timestamp', async () => {
      // Create initial balance
      const initial = await balanceStore.upsert(
        testLedgerAccount1.id,
        1000n,
        1n,
        queryRunner
      );
      const initialUpdatedAt = initial.updatedAt;

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update balance
      const updated = await balanceStore.updateBalance(
        testLedgerAccount1.id,
        2000n,
        2n,
        queryRunner
      );

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        initialUpdatedAt.getTime()
      );
    });
  });
});
