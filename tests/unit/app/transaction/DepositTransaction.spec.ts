import { DataSource, QueryRunner } from 'typeorm';
import { DepositTransaction, DepositInput } from '../../../../src/app/transaction/DepositTransaction';
import { TransactionStore, TransactionHeader } from '../../../../src/services/transaction/TransactionStore';
import { LedgerService } from '../../../../src/services/ledger/LedgerService';
import { BalanceService, BalanceRecord } from '../../../../src/services/balance/BalanceService';
import { LedgerAccountStore, LedgerAccount } from '../../../../src/services/account/LedgerAccountStore';
import { LedgerLine } from '../../../../src/domain/ledger/LedgerTypes';
import { InvalidTransactionError } from '../../../../src/domain/common/DomainErrors';
import { LedgerAccountType } from '../../../../src/stores/entities/enums';

describe('DepositTransaction', () => {
  let depositTransaction: DepositTransaction;
  let mockTransactionStore: jest.Mocked<TransactionStore>;
  let mockLedgerService: jest.Mocked<LedgerService>;
  let mockBalanceService: jest.Mocked<BalanceService>;
  let mockLedgerAccountStore: jest.Mocked<LedgerAccountStore>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  // Resolved ledger account IDs (mocked)
  const userLedgerAccountId = 'user-ledger-123';
  const bankLiabilityLedgerAccountId = 'bank-liability-ledger';

  // Valid deposit input for testing
  const validInput: DepositInput = {
    accountId: 'user-account-123',
    amount: 10000n,
    currency: 'USD',
    reference: 'DEP-001',
    description: 'Test deposit',
  };

  // Helper to create ledger line
  const createLedgerLine = (
    ledgerAccountId: string,
    debit: bigint,
    credit: bigint,
    sequence: bigint
  ): LedgerLine => ({
    id: `line-${ledgerAccountId}`,
    transactionId: 'tx-123',
    ledgerAccountId,
    accountId: 'account-1',
    debit,
    credit,
    amount: debit > 0n ? debit : credit,
    sequence,
    createdAt: new Date(),
  });

  // Helper to create ledger account
  const createLedgerAccount = (id: string, type: LedgerAccountType): LedgerAccount => ({
    id,
    accountId: validInput.accountId,
    currency: 'USD',
    type,
    status: 'ACTIVE',
    metadata: null,
    createdAt: new Date(),
  });

  beforeEach(() => {
    mockTransactionStore = {
      createHeader: jest.fn(),
      findByReference: jest.fn(),
      findById: jest.fn(),
    };

    mockLedgerService = {
      post: jest.fn(),
      getLatestLedgerLine: jest.fn().mockResolvedValue(null),
    };

    mockBalanceService = {
      apply: jest.fn(),
      getBalance: jest.fn(),
      getBalances: jest.fn(),
    };

    mockLedgerAccountStore = {
      create: jest.fn(),
      findById: jest.fn(),
      findByAccountId: jest.fn(),
      findByAccountIdAndType: jest.fn().mockImplementation((accountId, type) => {
        if (type === LedgerAccountType.USER_CASH) {
          return Promise.resolve(createLedgerAccount(userLedgerAccountId, LedgerAccountType.USER_CASH));
        }
        if (type === LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY) {
          return Promise.resolve(createLedgerAccount(bankLiabilityLedgerAccountId, LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY));
        }
        return Promise.resolve(null);
      }),
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

    depositTransaction = new DepositTransaction(
      mockTransactionStore,
      mockLedgerService,
      mockBalanceService,
      mockLedgerAccountStore,
      mockDataSource
    );
  });

  describe('validate', () => {
    it('should not throw for valid input', () => {
      expect(() => depositTransaction.validate(validInput)).not.toThrow();
    });

    it('should throw InvalidTransactionError for zero amount', () => {
      const input = { ...validInput, amount: 0n };

      expect(() => depositTransaction.validate(input)).toThrow(InvalidTransactionError);
    });

    it('should throw InvalidTransactionError for negative amount', () => {
      const input = { ...validInput, amount: -1000n };

      expect(() => depositTransaction.validate(input)).toThrow(InvalidTransactionError);
    });

    it('should not throw for undefined reference (optional field)', () => {
      const input = { ...validInput, reference: undefined };

      expect(() => depositTransaction.validate(input)).not.toThrow();
    });
  });

  describe('execute', () => {
    it('should resolve ledger accounts and complete full deposit flow', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(bankLiabilityLedgerAccountId, validInput.amount, 0n, 1n),
        createLedgerLine(userLedgerAccountId, 0n, validInput.amount, 1n),
      ];

      const balanceRecords: BalanceRecord[] = [
        { ledgerAccountId: userLedgerAccountId, balanceAmount: 10000n, lastSequence: 1n, updatedAt: new Date() },
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue(balanceRecords);

      const result = await depositTransaction.execute(validInput);

      // Verify ledger accounts were resolved
      expect(mockLedgerAccountStore.findByAccountIdAndType).toHaveBeenCalledWith(
        validInput.accountId,
        LedgerAccountType.USER_CASH,
        mockQueryRunner
      );
      expect(mockLedgerAccountStore.findByAccountIdAndType).toHaveBeenCalledWith(
        validInput.accountId,
        LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY,
        mockQueryRunner
      );

      // Verify transaction flow - each step is called
      expect(mockTransactionStore.createHeader).toHaveBeenCalled();
      expect(mockLedgerService.post).toHaveBeenCalled();
      expect(mockBalanceService.apply).toHaveBeenCalled();

      // Verify result
      expect(result.transactionId).toBe('tx-123');
    });

    it('should throw error when user cash ledger account not found', async () => {
      mockLedgerAccountStore.findByAccountIdAndType.mockResolvedValue(null);

      await expect(depositTransaction.execute(validInput)).rejects.toThrow(InvalidTransactionError);
    });

    it('should create transaction header with resolved ledger account', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue([
        createLedgerLine(bankLiabilityLedgerAccountId, validInput.amount, 0n, 1n),
        createLedgerLine(userLedgerAccountId, 0n, validInput.amount, 1n),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);

      await depositTransaction.execute(validInput);

      expect(mockTransactionStore.createHeader).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DEPOSIT',
          ledgerAccountId: userLedgerAccountId,
          isCredit: true,
          counterpartyLedgerAccountId: null,
        }),
        mockQueryRunner
      );
    });

    it('should build journal with resolved ledger accounts', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue([
        createLedgerLine(bankLiabilityLedgerAccountId, validInput.amount, 0n, 1n),
        createLedgerLine(userLedgerAccountId, 0n, validInput.amount, 1n),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);

      await depositTransaction.execute(validInput);

      expect(mockLedgerService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'tx-123',
          type: 'DEPOSIT',
          currency: 'USD',
          lines: expect.arrayContaining([
            expect.objectContaining({
              ledgerAccountId: bankLiabilityLedgerAccountId,
              debit: validInput.amount,
              credit: 0n,
            }),
            expect.objectContaining({
              ledgerAccountId: userLedgerAccountId,
              debit: 0n,
              credit: validInput.amount,
            }),
          ]),
        }),
        mockQueryRunner
      );
    });

    it('should update only user balance (not bank liability)', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(bankLiabilityLedgerAccountId, validInput.amount, 0n, 1n),
        createLedgerLine(userLedgerAccountId, 0n, validInput.amount, 1n),
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue([]);

      await depositTransaction.execute(validInput);

      expect(mockBalanceService.apply).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            ledgerAccountId: userLedgerAccountId,
            delta: validInput.amount,
          }),
        ],
        mockQueryRunner
      );
    });

    it('should propagate error on ledger post failure', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockRejectedValue(new Error('Ledger post failed'));

      await expect(depositTransaction.execute(validInput)).rejects.toThrow('Ledger post failed');
    });
  });
});
