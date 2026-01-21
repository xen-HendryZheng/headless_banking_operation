import { DataSource, QueryRunner } from 'typeorm';
import { TypeOrmTransactionStore } from '../../../src/stores/transaction/TypeOrmTransactionStore';
import { CreateTransactionInput } from '../../../src/services/transaction/TransactionStore';
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
} from '../../../src/stores/entities/enums';

// Note: Each user account has two ledger accounts:
// 1. USER_CASH - the user's cash ledger account
// 2. FIRSTCIRCLE_BUSINESS_LIABILITY - the bank's liability ledger account (tied to same user account_id)

describe('TypeOrmTransactionStore (Integration)', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let transactionStore: TypeOrmTransactionStore;

  // Test fixture data
  let testAccount: AccountEntity;
  let testLedgerAccount: LedgerAccountEntity;
  let testCounterpartyLedgerAccount: LedgerAccountEntity;

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
    transactionStore = new TypeOrmTransactionStore();
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
      identifier: `test-user-${Date.now()}`,
      type: AccountType.USER,
      status: AccountStatus.ACTIVE,
    });
    await queryRunner.manager.save(testAccount);

    testLedgerAccount = queryRunner.manager.create(LedgerAccountEntity, {
      accountId: testAccount.id,
      currency: 'USD',
      type: LedgerAccountType.USER_CASH,
      status: LedgerAccountStatus.ACTIVE,
    });
    await queryRunner.manager.save(testLedgerAccount);

    testCounterpartyLedgerAccount = queryRunner.manager.create(LedgerAccountEntity, {
      accountId: testAccount.id,
      currency: 'USD',
      type: LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY,
      status: LedgerAccountStatus.ACTIVE,
    });
    await queryRunner.manager.save(testCounterpartyLedgerAccount);
  });

  afterEach(async () => {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    await queryRunner.release();
  });

  describe('createHeader', () => {
    it('should create a transaction header in the database', async () => {
      const input: CreateTransactionInput = {
        ledgerAccountId: testLedgerAccount.id,
        counterpartyLedgerAccountId: null,
        type: TransactionType.DEPOSIT,
        currency: 'USD',
        isCredit: true,
        amount: 10000n,
        reference: `DEP-${Date.now()}`,
        description: 'Test deposit',
        accountId: testAccount.id,
      };

      const result = await transactionStore.createHeader(input, queryRunner);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.ledgerAccountId).toBe(input.ledgerAccountId);
      expect(result.type).toBe('DEPOSIT');
      expect(result.amount).toBe(10000n);
    });

    it('should return the created transaction with generated ID', async () => {
      const input: CreateTransactionInput = {
        ledgerAccountId: testLedgerAccount.id,
        counterpartyLedgerAccountId: testCounterpartyLedgerAccount.id,
        type: TransactionType.TRANSFER,
        currency: 'USD',
        isCredit: false,
        amount: 5000n,
        reference: `TRF-${Date.now()}`,
        accountId: testAccount.id,
      };

      const result = await transactionStore.createHeader(input, queryRunner);

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(result.counterpartyLedgerAccountId).toBe(testCounterpartyLedgerAccount.id);
    });
  });

  describe('findByReference', () => {
    it('should find transaction by reference', async () => {
      const reference = `DEP-${Date.now()}`;
      const input: CreateTransactionInput = {
        ledgerAccountId: testLedgerAccount.id,
        type: TransactionType.DEPOSIT,
        currency: 'USD',
        isCredit: true,
        amount: 10000n,
        reference,
        description: 'Test deposit',
        accountId: testAccount.id,
      };

      await transactionStore.createHeader(input, queryRunner);

      const found = await transactionStore.findByReference(reference, queryRunner);

      expect(found).not.toBeNull();
      expect(found!.reference).toBe(reference);
      expect(found!.amount).toBe(10000n);
    });

    it('should return null when reference not found', async () => {
      const result = await transactionStore.findByReference(
        'non-existent-reference',
        queryRunner
      );

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find transaction by ID', async () => {
      const input: CreateTransactionInput = {
        ledgerAccountId: testLedgerAccount.id,
        type: TransactionType.TRANSFER,
        currency: 'USD',
        isCredit: false,
        amount: 7500n,
        reference: `TRF-${Date.now()}`,
        counterpartyLedgerAccountId: testCounterpartyLedgerAccount.id,
        accountId: testAccount.id,
      };

      const created = await transactionStore.createHeader(input, queryRunner);

      const found = await transactionStore.findById(created.id, queryRunner);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.type).toBe('TRANSFER');
      expect(found!.amount).toBe(7500n);
    });

    it('should return null when ID not found', async () => {
      const result = await transactionStore.findById(
        '00000000-0000-0000-0000-000000000000',
        queryRunner
      );

      expect(result).toBeNull();
    });
  });
});
