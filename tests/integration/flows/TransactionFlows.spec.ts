import { DataSource } from 'typeorm';
import { createContainer, Container } from '../../../src/bootstrap/container';
import { DepositInput } from '../../../src/app/transaction/DepositTransaction';
import { WithdrawInput } from '../../../src/app/transaction/WithdrawTransaction';
import { TransferInput } from '../../../src/app/transaction/TransferTransaction';
import { InsufficientBalanceError } from '../../../src/domain/common/DomainErrors';
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

describe('Transaction Flows (Integration)', () => {
  let dataSource: DataSource;
  let container: Container;

  // Test fixture data
  let userAccount: AccountEntity;
  let userLedgerAccount: LedgerAccountEntity;
  let bankLiabilityLedgerAccount: LedgerAccountEntity;
  let secondUserAccount: AccountEntity;
  let secondUserLedgerAccount: LedgerAccountEntity;
  let secondBankLiabilityLedgerAccount: LedgerAccountEntity;

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
    container = await createContainer(dataSource);
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    // Clean up tables in reverse dependency order
    await dataSource.manager.delete(LedgerLineEntity, {});
    await dataSource.manager.delete(BalanceEntity, {});
    await dataSource.manager.delete(TransactionEntity, {});
    await dataSource.manager.delete(LedgerAccountEntity, {});
    await dataSource.manager.delete(AccountEntity, {});

    // Create test fixtures
    // Each user account has two ledger accounts:
    // 1. USER_CASH - the user's cash ledger account
    // 2. FIRSTCIRCLE_BUSINESS_LIABILITY - the bank's liability ledger account (tied to same user account_id)

    userAccount = dataSource.manager.create(AccountEntity, {
      name: 'Test User',
      identifier: `user-${Date.now()}-${Math.random()}`,
      type: AccountType.USER,
      status: AccountStatus.ACTIVE,
    });
    await dataSource.manager.save(userAccount);

    userLedgerAccount = dataSource.manager.create(LedgerAccountEntity, {
      accountId: userAccount.id,
      currency: 'USD',
      type: LedgerAccountType.USER_CASH,
      status: LedgerAccountStatus.ACTIVE,
    });
    await dataSource.manager.save(userLedgerAccount);

    // Bank liability ledger account is tied to the same user account
    bankLiabilityLedgerAccount = dataSource.manager.create(LedgerAccountEntity, {
      accountId: userAccount.id,
      currency: 'USD',
      type: LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY,
      status: LedgerAccountStatus.ACTIVE,
    });
    await dataSource.manager.save(bankLiabilityLedgerAccount);

    // Second user for transfer tests
    secondUserAccount = dataSource.manager.create(AccountEntity, {
      name: 'Second User',
      identifier: `user2-${Date.now()}-${Math.random()}`,
      type: AccountType.USER,
      status: AccountStatus.ACTIVE,
    });
    await dataSource.manager.save(secondUserAccount);

    secondUserLedgerAccount = dataSource.manager.create(LedgerAccountEntity, {
      accountId: secondUserAccount.id,
      currency: 'USD',
      type: LedgerAccountType.USER_CASH,
      status: LedgerAccountStatus.ACTIVE,
    });
    await dataSource.manager.save(secondUserLedgerAccount);

    // Bank liability ledger account for second user
    secondBankLiabilityLedgerAccount = dataSource.manager.create(LedgerAccountEntity, {
      accountId: secondUserAccount.id,
      currency: 'USD',
      type: LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY,
      status: LedgerAccountStatus.ACTIVE,
    });
    await dataSource.manager.save(secondBankLiabilityLedgerAccount);
  });

  describe('Deposit Flow', () => {
    it('should complete deposit and update balances correctly', async () => {
      const depositInput: DepositInput = {
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 10000n,
        currency: 'USD',
        reference: `DEP-${Date.now()}`,
        description: 'Test deposit',
      };

      const result = await container.transactionService.deposit(depositInput);

      expect(result.transactionId).toBeDefined();

      // Verify user balance increased
      const userBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });
      expect(userBalance?.balanceAmount).toBe(10000n);

      // Verify bank liability decreased (negative)
      const bankBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: bankLiabilityLedgerAccount.id },
      });
      expect(bankBalance?.balanceAmount).toBe(-10000n);
    });

    it('should create transaction header with POSTED status', async () => {
      const depositInput: DepositInput = {
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 5000n,
        currency: 'USD',
        reference: `DEP-${Date.now()}`,
      };

      const result = await container.transactionService.deposit(depositInput);

      const transaction = await dataSource.manager.findOne(TransactionEntity, {
        where: { id: result.transactionId },
      });

      expect(transaction).not.toBeNull();
      expect(transaction!.status).toBe('POSTED');
      expect(transaction!.type).toBe('DEPOSIT');
      expect(transaction!.amount).toBe(5000n);
    });

    it('should create balanced ledger lines', async () => {
      const depositInput: DepositInput = {
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 7500n,
        currency: 'USD',
        reference: `DEP-${Date.now()}`,
      };

      const result = await container.transactionService.deposit(depositInput);

      const ledgerLines = await dataSource.manager.find(LedgerLineEntity, {
        where: { transactionId: result.transactionId },
      });

      expect(ledgerLines).toHaveLength(2);

      // Calculate total debits and credits
      const totalDebit = ledgerLines.reduce((sum, line) => sum + line.debit, 0n);
      const totalCredit = ledgerLines.reduce((sum, line) => sum + line.credit, 0n);

      expect(totalDebit).toBe(totalCredit);
    });

    it('should handle idempotent requests (same reference)', async () => {
      const reference = `DEP-IDEM-${Date.now()}`;
      const depositInput: DepositInput = {
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 10000n,
        currency: 'USD',
        reference,
      };

      // First deposit should succeed
      const result1 = await container.transactionService.deposit(depositInput);
      expect(result1.transactionId).toBeDefined();

      // Second deposit with same reference should fail (unique constraint)
      await expect(
        container.transactionService.deposit(depositInput)
      ).rejects.toThrow();

      // Balance should only reflect one deposit
      const userBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });
      expect(userBalance?.balanceAmount).toBe(10000n);
    });
  });

  describe('Withdraw Flow', () => {
    beforeEach(async () => {
      // Seed user with initial balance via deposit
      const depositInput: DepositInput = {
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 20000n,
        currency: 'USD',
        reference: `SEED-${Date.now()}`,
      };
      await container.transactionService.deposit(depositInput);
    });

    it('should complete withdrawal and update balances correctly', async () => {
      const withdrawInput: WithdrawInput = {
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 5000n,
        currency: 'USD',
        reference: `WTH-${Date.now()}`,
      };

      const result = await container.transactionService.withdraw(withdrawInput);

      expect(result.transactionId).toBeDefined();

      // Verify user balance decreased (20000 - 5000 = 15000)
      const userBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });
      expect(userBalance?.balanceAmount).toBe(15000n);

      // Verify bank liability increased (less negative: -20000 + 5000 = -15000)
      const bankBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: bankLiabilityLedgerAccount.id },
      });
      expect(bankBalance?.balanceAmount).toBe(-15000n);
    });

    it('should reject withdrawal when insufficient balance', async () => {
      const withdrawInput: WithdrawInput = {
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 50000n, // More than available 20000
        currency: 'USD',
        reference: `WTH-${Date.now()}`,
      };

      await expect(
        container.transactionService.withdraw(withdrawInput)
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it('should not update balances on rejection', async () => {
      // Get initial balances
      const initialUserBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });

      const withdrawInput: WithdrawInput = {
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 50000n,
        currency: 'USD',
        reference: `WTH-${Date.now()}`,
      };

      try {
        await container.transactionService.withdraw(withdrawInput);
      } catch {
        // Expected to fail
      }

      // Balance should remain unchanged
      const userBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });
      expect(userBalance?.balanceAmount).toBe(initialUserBalance?.balanceAmount);
    });
  });

  describe('Transfer Flow', () => {
    beforeEach(async () => {
      // Seed first user with initial balance
      const depositInput: DepositInput = {
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 15000n,
        currency: 'USD',
        reference: `SEED-${Date.now()}`,
      };
      await container.transactionService.deposit(depositInput);
    });

    it('should complete transfer between two accounts', async () => {
      const transferInput: TransferInput = {
        senderLedgerAccountId: userLedgerAccount.id,
        senderAccountId: userAccount.id,
        receiverLedgerAccountId: secondUserLedgerAccount.id,
        receiverAccountId: secondUserAccount.id,
        amount: 5000n,
        currency: 'USD',
        reference: `TRF-${Date.now()}`,
      };

      const result = await container.transactionService.transfer(transferInput);

      expect(result.transactionId).toBeDefined();
    });

    it('should update both sender and receiver balances', async () => {
      const transferInput: TransferInput = {
        senderLedgerAccountId: userLedgerAccount.id,
        senderAccountId: userAccount.id,
        receiverLedgerAccountId: secondUserLedgerAccount.id,
        receiverAccountId: secondUserAccount.id,
        amount: 5000n,
        currency: 'USD',
        reference: `TRF-${Date.now()}`,
      };

      await container.transactionService.transfer(transferInput);

      // Verify sender balance decreased (15000 - 5000 = 10000)
      const senderBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });
      expect(senderBalance?.balanceAmount).toBe(10000n);

      // Verify receiver balance increased
      const receiverBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: secondUserLedgerAccount.id },
      });
      expect(receiverBalance?.balanceAmount).toBe(5000n);
    });

    it('should reject transfer when sender has insufficient balance', async () => {
      const transferInput: TransferInput = {
        senderLedgerAccountId: userLedgerAccount.id,
        senderAccountId: userAccount.id,
        receiverLedgerAccountId: secondUserLedgerAccount.id,
        receiverAccountId: secondUserAccount.id,
        amount: 50000n, // More than sender has
        currency: 'USD',
        reference: `TRF-${Date.now()}`,
      };

      await expect(
        container.transactionService.transfer(transferInput)
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it('should not touch bank liability account', async () => {
      const initialBankBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: bankLiabilityLedgerAccount.id },
      });

      const transferInput: TransferInput = {
        senderLedgerAccountId: userLedgerAccount.id,
        senderAccountId: userAccount.id,
        receiverLedgerAccountId: secondUserLedgerAccount.id,
        receiverAccountId: secondUserAccount.id,
        amount: 3000n,
        currency: 'USD',
        reference: `TRF-${Date.now()}`,
      };

      await container.transactionService.transfer(transferInput);

      // Bank liability balance should remain unchanged
      const bankBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: bankLiabilityLedgerAccount.id },
      });
      expect(bankBalance?.balanceAmount).toBe(initialBankBalance?.balanceAmount);
    });
  });

  describe('Concurrent Transactions', () => {
    it('should handle concurrent deposits to same account', async () => {
      const deposits = Array.from({ length: 5 }, (_, i) => ({
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 1000n,
        currency: 'USD',
        reference: `DEP-CONCURRENT-${Date.now()}-${i}`,
      }));

      // Execute all deposits concurrently
      await Promise.all(
        deposits.map((input) => container.transactionService.deposit(input))
      );

      // Final balance should be sum of all deposits
      const userBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });
      expect(userBalance?.balanceAmount).toBe(5000n);
    });

    it('should handle concurrent withdrawals safely (prevent overdraft)', async () => {
      // First deposit to have some balance
      await container.transactionService.deposit({
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 5000n,
        currency: 'USD',
        reference: `SEED-${Date.now()}`,
      });

      // Try to withdraw more than available concurrently
      const withdrawals = Array.from({ length: 3 }, (_, i) => ({
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 3000n, // Each tries to withdraw 3000, but only 5000 available
        currency: 'USD',
        reference: `WTH-CONCURRENT-${Date.now()}-${i}`,
      }));

      // Some should succeed, some should fail
      const results = await Promise.allSettled(
        withdrawals.map((input) => container.transactionService.withdraw(input))
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      // At most 1 should succeed (5000 / 3000 = 1 full withdrawal)
      expect(successes.length).toBeLessThanOrEqual(1);
      // At least 2 should fail
      expect(failures.length).toBeGreaterThanOrEqual(2);

      // Final balance should be non-negative
      const userBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });
      expect(userBalance!.balanceAmount >= 0n).toBe(true);
    });

    it('should handle concurrent transfers without deadlocks', async () => {
      // Seed both users with balance
      await container.transactionService.deposit({
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 10000n,
        currency: 'USD',
        reference: `SEED1-${Date.now()}`,
      });

      await container.transactionService.deposit({
        userLedgerAccountId: secondUserLedgerAccount.id,
        userAccountId: secondUserAccount.id,
        bankLiabilityLedgerAccountId: secondBankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: secondUserAccount.id,
        amount: 10000n,
        currency: 'USD',
        reference: `SEED2-${Date.now()}`,
      });

      // Concurrent transfers in both directions
      const transfers = [
        {
          senderLedgerAccountId: userLedgerAccount.id,
          senderAccountId: userAccount.id,
          receiverLedgerAccountId: secondUserLedgerAccount.id,
          receiverAccountId: secondUserAccount.id,
          amount: 1000n,
          currency: 'USD',
          reference: `TRF-A-${Date.now()}-1`,
        },
        {
          senderLedgerAccountId: secondUserLedgerAccount.id,
          senderAccountId: secondUserAccount.id,
          receiverLedgerAccountId: userLedgerAccount.id,
          receiverAccountId: userAccount.id,
          amount: 1000n,
          currency: 'USD',
          reference: `TRF-B-${Date.now()}-2`,
        },
      ];

      // Should complete without deadlock
      await Promise.all(
        transfers.map((input) => container.transactionService.transfer(input))
      );

      // Both should still have their initial balance (transfers cancel out)
      const user1Balance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });
      const user2Balance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: secondUserLedgerAccount.id },
      });

      // Both transferred 1000 to each other, so net is 0
      expect(user1Balance?.balanceAmount).toBe(10000n);
      expect(user2Balance?.balanceAmount).toBe(10000n);
    });
  });

  describe('Invariant Tests', () => {
    it('should maintain balanced ledger after multiple transactions', async () => {
      // Perform multiple transactions
      await container.transactionService.deposit({
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 10000n,
        currency: 'USD',
        reference: `INV-DEP-${Date.now()}`,
      });

      await container.transactionService.deposit({
        userLedgerAccountId: secondUserLedgerAccount.id,
        userAccountId: secondUserAccount.id,
        bankLiabilityLedgerAccountId: secondBankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: secondUserAccount.id,
        amount: 5000n,
        currency: 'USD',
        reference: `INV-DEP2-${Date.now()}`,
      });

      await container.transactionService.transfer({
        senderLedgerAccountId: userLedgerAccount.id,
        senderAccountId: userAccount.id,
        receiverLedgerAccountId: secondUserLedgerAccount.id,
        receiverAccountId: secondUserAccount.id,
        amount: 3000n,
        currency: 'USD',
        reference: `INV-TRF-${Date.now()}`,
      });

      await container.transactionService.withdraw({
        userLedgerAccountId: secondUserLedgerAccount.id,
        userAccountId: secondUserAccount.id,
        bankLiabilityLedgerAccountId: secondBankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: secondUserAccount.id,
        amount: 2000n,
        currency: 'USD',
        reference: `INV-WTH-${Date.now()}`,
      });

      // Check all ledger lines sum to zero (balanced)
      const allLines = await dataSource.manager.find(LedgerLineEntity);
      const totalDebit = allLines.reduce((sum, line) => sum + line.debit, 0n);
      const totalCredit = allLines.reduce((sum, line) => sum + line.credit, 0n);

      expect(totalDebit).toBe(totalCredit);
    });

    it('should maintain non-negative balances', async () => {
      await container.transactionService.deposit({
        userLedgerAccountId: userLedgerAccount.id,
        userAccountId: userAccount.id,
        bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
        bankLiabilityAccountId: userAccount.id,
        amount: 5000n,
        currency: 'USD',
        reference: `BAL-DEP-${Date.now()}`,
      });

      // Try to withdraw more than available
      try {
        await container.transactionService.withdraw({
          userLedgerAccountId: userLedgerAccount.id,
          userAccountId: userAccount.id,
          bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
          bankLiabilityAccountId: userAccount.id,
          amount: 10000n,
          currency: 'USD',
          reference: `BAL-WTH-${Date.now()}`,
        });
      } catch {
        // Expected
      }

      // User balance should remain non-negative
      const userBalance = await dataSource.manager.findOne(BalanceEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
      });

      expect(userBalance!.balanceAmount >= 0n).toBe(true);
    });

    it('should maintain monotonic sequences per ledger account', async () => {
      // Perform multiple deposits to the same account
      for (let i = 0; i < 5; i++) {
        await container.transactionService.deposit({
          userLedgerAccountId: userLedgerAccount.id,
          userAccountId: userAccount.id,
          bankLiabilityLedgerAccountId: bankLiabilityLedgerAccount.id,
          bankLiabilityAccountId: userAccount.id,
          amount: 1000n,
          currency: 'USD',
          reference: `SEQ-DEP-${Date.now()}-${i}`,
        });
      }

      // Get all lines for user ledger account
      const lines = await dataSource.manager.find(LedgerLineEntity, {
        where: { ledgerAccountId: userLedgerAccount.id },
        order: { sequence: 'ASC' },
      });

      // Verify sequences are monotonically increasing
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].sequence).toBeGreaterThan(lines[i - 1].sequence);
      }
    });
  });
});
