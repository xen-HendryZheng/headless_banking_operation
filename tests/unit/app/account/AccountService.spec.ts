import { DataSource, QueryRunner } from 'typeorm';
import {
  AccountService,
  AccountServiceImpl,
  CreateUserAccountInput,
  CreateUserAccountResult,
  AccountStore,
  Account,
  LedgerAccountStore,
  LedgerAccount,
} from '../../../../src/services/account';
import { BalanceStore } from '../../../../src/services/balance/BalanceStore';
import { BalanceRecord } from '../../../../src/services/balance/BalanceService';
import { LedgerAccountType } from '../../../../src/stores/entities/enums';

describe('AccountService', () => {
  let accountService: AccountService;
  let mockAccountStore: jest.Mocked<AccountStore>;
  let mockLedgerAccountStore: jest.Mocked<LedgerAccountStore>;
  let mockBalanceStore: jest.Mocked<BalanceStore>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  const validInput: CreateUserAccountInput = {
    name: 'John Doe',
    identifier: 'john.doe@example.com',
    currency: 'USD',
    metadata: { referralCode: 'ABC123' },
  };

  const mockAccount: Account = {
    id: 'account-123',
    name: 'John Doe',
    identifier: 'john.doe@example.com',
    type: 'USER',
    status: 'ACTIVE',
    metadata: { referralCode: 'ABC123' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLedgerAccount: LedgerAccount = {
    id: 'ledger-account-123',
    accountId: 'account-123',
    currency: 'USD',
    type: LedgerAccountType.USER_CASH,
    status: 'ACTIVE',
    metadata: null,
    createdAt: new Date(),
  };

  const mockBalanceRecord: BalanceRecord = {
    ledgerAccountId: 'ledger-account-123',
    balanceAmount: 0n,
    lastSequence: 0,
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockAccountStore = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdentifier: jest.fn(),
    };

    mockLedgerAccountStore = {
      create: jest.fn(),
      findById: jest.fn(),
      findByAccountId: jest.fn(),
      findByAccountIdAndType: jest.fn(),
    };

    mockBalanceStore = {
      lockAndGet: jest.fn(),
      lockAndGetMany: jest.fn(),
      insert: jest.fn(),
      updateBalance: jest.fn(),
      getBalance: jest.fn(),
      getBalances: jest.fn(),
    };

    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {} as any,
    } as unknown as jest.Mocked<QueryRunner>;

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    } as unknown as jest.Mocked<DataSource>;

    accountService = new AccountServiceImpl(
      mockAccountStore,
      mockLedgerAccountStore,
      mockBalanceStore,
      mockDataSource
    );
  });

  describe('createUserAccount', () => {
    it('should create account, ledger account, and initialize balance in a transaction', async () => {
      mockAccountStore.create.mockResolvedValue(mockAccount);
      mockLedgerAccountStore.create.mockResolvedValue(mockLedgerAccount);
      mockBalanceStore.insert.mockResolvedValue(mockBalanceRecord);

      const result = await accountService.createUserAccount(validInput);

      // Verify transaction lifecycle
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();

      // Verify account creation
      expect(mockAccountStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: validInput.name,
          identifier: validInput.identifier,
          type: 'USER',
        }),
        mockQueryRunner
      );

      // Verify ledger account creation (USER_CASH)
      expect(mockLedgerAccountStore.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: mockAccount.id,
          currency: validInput.currency,
          type: LedgerAccountType.USER_CASH,
        }),
        mockQueryRunner
      );

      // Verify balance initialization
      expect(mockBalanceStore.insert).toHaveBeenCalledWith(
        mockLedgerAccount.id,
        0n,
        0,
        mockQueryRunner
      );

      // Verify result
      expect(result.account).toEqual(mockAccount);
      expect(result.ledgerAccount).toEqual(mockLedgerAccount);
    });

    it('should rollback transaction on account creation failure', async () => {
      mockAccountStore.create.mockRejectedValue(new Error('Duplicate identifier'));

      await expect(accountService.createUserAccount(validInput)).rejects.toThrow('Duplicate identifier');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction on ledger account creation failure', async () => {
      mockAccountStore.create.mockResolvedValue(mockAccount);
      mockLedgerAccountStore.create.mockRejectedValue(new Error('Ledger account creation failed'));

      await expect(accountService.createUserAccount(validInput)).rejects.toThrow('Ledger account creation failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction on balance initialization failure', async () => {
      mockAccountStore.create.mockResolvedValue(mockAccount);
      mockLedgerAccountStore.create.mockResolvedValue(mockLedgerAccount);
      mockBalanceStore.insert.mockRejectedValue(new Error('Balance initialization failed'));

      await expect(accountService.createUserAccount(validInput)).rejects.toThrow('Balance initialization failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('findByIdentifier', () => {
    it('should return account when found', async () => {
      mockAccountStore.findByIdentifier.mockResolvedValue(mockAccount);

      const result = await accountService.findByIdentifier('john.doe@example.com');

      expect(result).toEqual(mockAccount);
    });

    it('should return null when account not found', async () => {
      mockAccountStore.findByIdentifier.mockResolvedValue(null);

      const result = await accountService.findByIdentifier('unknown@example.com');

      expect(result).toBeNull();
    });
  });

  describe('getLedgerAccounts', () => {
    it('should return all ledger accounts for an account', async () => {
      const ledgerAccounts: LedgerAccount[] = [
        mockLedgerAccount,
        {
          ...mockLedgerAccount,
          id: 'ledger-account-456',
          type: LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY,
        },
      ];
      mockLedgerAccountStore.findByAccountId.mockResolvedValue(ledgerAccounts);

      const result = await accountService.getLedgerAccounts('account-123');

      expect(result).toEqual(ledgerAccounts);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no ledger accounts found', async () => {
      mockLedgerAccountStore.findByAccountId.mockResolvedValue([]);

      const result = await accountService.getLedgerAccounts('account-123');

      expect(result).toEqual([]);
    });
  });
});
