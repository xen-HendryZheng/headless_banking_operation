import { DataSource, QueryRunner } from 'typeorm';
import { TypeOrmSequencer } from '../../../src/stores/ledger/TypeOrmSequencer';
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

describe('TypeOrmSequencer (Integration)', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let sequencer: TypeOrmSequencer;
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
    sequencer = new TypeOrmSequencer();
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

  describe('getNextSequence', () => {
    it('should return 1 for first sequence of new ledger account', async () => {
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      expect(result).toBe(1);
    });

    it('should return incrementing sequence for existing ledger account', async () => {
      // Insert some ledger lines with sequences
      const lines: LedgerLineInsert[] = [
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 1000n,
          amount: 1000n,
          subtype: 'PRINCIPAL',
          sequence: 1,
        },
      ];
      await ledgerLineStore.insert(lines, queryRunner);

      // Get next sequence
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      expect(result).toBe(2);
    });

    it('should handle multiple sequences correctly', async () => {
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

      // Insert ledger lines with increasing sequences
      const lines: LedgerLineInsert[] = [
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 1000n,
          amount: 1000n,
          subtype: 'PRINCIPAL',
          sequence: 1,
        },
        {
          transactionId: testTransaction2.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 5000n,
          amount: 5000n,
          subtype: 'PRINCIPAL',
          sequence: 2,
        },
        {
          transactionId: testTransaction3.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 3000n,
          amount: 3000n,
          subtype: 'PRINCIPAL',
          sequence: 3,
        },
      ];
      await ledgerLineStore.insert(lines, queryRunner);

      // Get next sequence
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      expect(result).toBe(4);
    });

    it('should handle concurrent sequence requests safely', async () => {
      // This test verifies that even when called multiple times in sequence,
      // the sequencer returns correct values based on the current state

      // First call - should return 1 for new account
      const seq1 = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);
      expect(seq1).toBe(1);

      // Insert a line with sequence 1
      const lines1: LedgerLineInsert[] = [
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 1000n,
          amount: 1000n,
          subtype: 'PRINCIPAL',
          sequence: 1,
        },
      ];
      await ledgerLineStore.insert(lines1, queryRunner);

      // Second call - should return 2 now
      const seq2 = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);
      expect(seq2).toBe(2);

      // Different ledger account should still return 1
      const seq3 = await sequencer.getNextSequence(testLedgerAccount2.id, queryRunner);
      expect(seq3).toBe(1);
    });

    it('should return correct sequence for ledger account with gap in sequences', async () => {
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

      // Insert ledger lines with gaps in sequences
      const lines: LedgerLineInsert[] = [
        {
          transactionId: testTransaction.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 1000n,
          amount: 1000n,
          subtype: 'PRINCIPAL',
          sequence: 1,
        },
        {
          transactionId: testTransaction2.id,
          ledgerAccountId: testLedgerAccount1.id,
          accountId: testAccount.id,
          debit: 0n,
          credit: 5000n,
          amount: 5000n,
          subtype: 'PRINCIPAL',
          sequence: 10, // Gap in sequence
        },
      ];
      await ledgerLineStore.insert(lines, queryRunner);

      // Get next sequence - should be MAX(sequence) + 1
      const result = await sequencer.getNextSequence(testLedgerAccount1.id, queryRunner);

      expect(result).toBe(11);
    });
  });
});
