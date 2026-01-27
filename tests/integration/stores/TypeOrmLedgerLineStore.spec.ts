import { DataSource, QueryRunner } from 'typeorm';
import { TypeOrmLedgerLineStore } from '../../../src/stores/ledger/TypeOrmLedgerLineStore';
import { LedgerLineInsert } from '../../../src/services/ledger/LedgerLineStore';
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

describe('TypeOrmLedgerLineStore (Integration)', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let ledgerLineStore: TypeOrmLedgerLineStore;

  // Test fixture data
  let testAccount: AccountEntity;
  let testLedgerAccount1: LedgerAccountEntity;
  let testLedgerAccount2: LedgerAccountEntity;
  let testTransaction: TransactionEntity;

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
    ledgerLineStore = new TypeOrmLedgerLineStore();
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

    testTransaction = queryRunner.manager.create(TransactionEntity, {
      ledgerAccountId: testLedgerAccount1.id,
      counterpartyLedgerAccountId: null,
      type: TransactionType.DEPOSIT,
      currency: 'USD',
      isCredit: true,
      amount: 10000n,
      reference: `DEP-${Date.now()}-${Math.random()}`,
      description: 'Test deposit',
      status: TransactionStatus.PENDING,
      accountId: testAccount.id,
    });
    await queryRunner.manager.save(testTransaction);
  });

  afterEach(async () => {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    await queryRunner.release();
  });

  describe('insert', () => {
    it('should insert multiple ledger lines in a batch', async () => {
      const lines: LedgerLineInsert[] = [
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 10000n,
          amount: 10000n,
          sequence: 1n,
        },
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount2.id,
          accountId: testAccount.id,
          debit: 10000n,
          credit: 0n,
          amount: 10000n,
          sequence: 1n,
        },
      ];

      const result = await ledgerLineStore.insert(lines, queryRunner);

      expect(result).toHaveLength(2);
      expect(result[0].transactionId).toBe(testTransaction.id);
      expect(result[1].transactionId).toBe(testTransaction.id);
    });

    it('should return inserted lines with generated IDs', async () => {
      const lines: LedgerLineInsert[] = [
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 5000n,
          amount: 5000n,
          sequence: 1n,
        },
      ];

      const result = await ledgerLineStore.insert(lines, queryRunner);

      expect(result).toHaveLength(1);
      expect(result[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(result[0].credit).toBe(5000n);
      expect(result[0].debit).toBe(0n);
    });

    it('should preserve sequence values', async () => {
      const lines: LedgerLineInsert[] = [
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 1000n,
          amount: 1000n,
          sequence: 5n,
        },
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount2.id,
          accountId: testAccount.id,
          debit: 1000n,
          credit: 0n,
          amount: 1000n,
          sequence: 3n,
        },
      ];

      const result = await ledgerLineStore.insert(lines, queryRunner);

      const linesByAccount = new Map(result.map((l) => [l.ledgerAccountId, l]));
      expect(linesByAccount.get(testLedgerAccount1.id)?.sequence).toBe(5n);
      expect(linesByAccount.get(testLedgerAccount2.id)?.sequence).toBe(3n);
    });
  });

  describe('findByTransactionId', () => {
    it('should find all lines for a transaction', async () => {
      // Insert some lines
      const lines: LedgerLineInsert[] = [
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 10000n,
          amount: 10000n,
          sequence: 1n,
        },
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount2.id,
          accountId: testAccount.id,
          debit: 10000n,
          credit: 0n,
          amount: 10000n,
          sequence: 1n,
        },
      ];

      await ledgerLineStore.insert(lines, queryRunner);

      const result = await ledgerLineStore.findByTransactionId(
        testTransaction.id,
        queryRunner
      );

      expect(result).toHaveLength(2);
      expect(result.every((l) => l.transactionId === testTransaction.id)).toBe(true);
    });

    it('should return empty array when no lines found', async () => {
      const result = await ledgerLineStore.findByTransactionId(
        '00000000-0000-0000-0000-000000000000',
        queryRunner
      );

      expect(result).toEqual([]);
    });
  });

  describe('findByLedgerAccountId', () => {
    it('should find all lines for a ledger account', async () => {
      // Create another transaction
      const testTransaction2 = queryRunner.manager.create(TransactionEntity, {
        ledgerAccountId: testLedgerAccount1.id,
        counterpartyLedgerAccountId: null,
        type: TransactionType.DEPOSIT,
        currency: 'USD',
        isCredit: true,
        amount: 5000n,
        reference: `DEP-${Date.now()}-2-${Math.random()}`,
        status: TransactionStatus.PENDING,
        accountId: testAccount.id,
      });
      await queryRunner.manager.save(testTransaction2);

      // Insert lines for both transactions
      const lines: LedgerLineInsert[] = [
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 10000n,
          amount: 10000n,
          sequence: 1n,
        },
        {
          transactionId: testTransaction2.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 5000n,
          amount: 5000n,
          sequence: 2n,
        },
      ];

      await ledgerLineStore.insert(lines, queryRunner);

      const result = await ledgerLineStore.findByLedgerAccountId(
        testLedgerAccount1.id,
        queryRunner
      );

      expect(result).toHaveLength(2);
      expect(result.every((l) => l.ledgerAccountId === testLedgerAccount1.id)).toBe(true);
    });

    it('should order results by sequence', async () => {
      // Create multiple transactions
      const testTransaction2 = queryRunner.manager.create(TransactionEntity, {
        ledgerAccountId: testLedgerAccount1.id,
        counterpartyLedgerAccountId: null,
        type: TransactionType.DEPOSIT,
        currency: 'USD',
        isCredit: true,
        amount: 5000n,
        reference: `DEP-${Date.now()}-2-${Math.random()}`,
        status: TransactionStatus.PENDING,
        accountId: testAccount.id,
      });
      await queryRunner.manager.save(testTransaction2);

      const testTransaction3 = queryRunner.manager.create(TransactionEntity, {
        ledgerAccountId: testLedgerAccount1.id,
        counterpartyLedgerAccountId: null,
        type: TransactionType.DEPOSIT,
        currency: 'USD',
        isCredit: true,
        amount: 3000n,
        reference: `DEP-${Date.now()}-3-${Math.random()}`,
        status: TransactionStatus.PENDING,
        accountId: testAccount.id,
      });
      await queryRunner.manager.save(testTransaction3);

      // Insert lines with different sequences (not in order)
      const lines: LedgerLineInsert[] = [
        {
          transactionId: testTransaction2.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 5000n,
          amount: 5000n,
          sequence: 3n, // Middle sequence
        },
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 10000n,
          amount: 10000n,
          sequence: 1n, // First sequence
        },
        {
          transactionId: testTransaction3.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 3000n,
          amount: 3000n,
          sequence: 5n, // Last sequence
        },
      ];

      await ledgerLineStore.insert(lines, queryRunner);

      const result = await ledgerLineStore.findByLedgerAccountId(
        testLedgerAccount1.id,
        queryRunner
      );

      expect(result).toHaveLength(3);
      expect(result[0].sequence).toBe(1n);
      expect(result[1].sequence).toBe(3n);
      expect(result[2].sequence).toBe(5n);
    });

    it('should return empty array when no lines found', async () => {
      const result = await ledgerLineStore.findByLedgerAccountId(
        '00000000-0000-0000-0000-000000000000',
        queryRunner
      );

      expect(result).toEqual([]);
    });
  });
});
