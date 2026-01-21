import { DataSource, QueryRunner } from 'typeorm';
import { WithdrawTransaction, WithdrawInput } from '../../../../src/app/transaction/WithdrawTransaction';
import { TransactionStore, TransactionHeader } from '../../../../src/services/transaction/TransactionStore';
import { LedgerService } from '../../../../src/services/ledger/LedgerService';
import { BalanceService, BalanceRecord } from '../../../../src/services/balance/BalanceService';
import { LedgerLine } from '../../../../src/domain/ledger/LedgerTypes';
import { InvalidTransactionError } from '../../../../src/domain/common/DomainErrors';

describe('WithdrawTransaction', () => {
  let withdrawTransaction: WithdrawTransaction;
  let mockTransactionStore: jest.Mocked<TransactionStore>;
  let mockLedgerService: jest.Mocked<LedgerService>;
  let mockBalanceService: jest.Mocked<BalanceService>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  // Valid withdraw input for testing
  const validInput: WithdrawInput = {
    userLedgerAccountId: 'user-ledger-123',
    userAccountId: 'user-account-123',
    bankLiabilityLedgerAccountId: 'bank-liability-ledger',
    amount: 5000n,
    currency: 'USD',
    reference: 'WTH-001',
    description: 'Test withdrawal',
  };

  // Helper to create ledger line
  const createLedgerLine = (
    ledgerAccountId: string,
    debit: bigint,
    credit: bigint,
    sequence: number
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
      getBalance: jest.fn().mockResolvedValue({ ledgerAccountId: 'user-ledger-123', balanceAmount: 20000n, lastSequence: 0, updatedAt: new Date() }),
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

    withdrawTransaction = new WithdrawTransaction(
      mockTransactionStore,
      mockLedgerService,
      mockBalanceService,
      mockDataSource
    );
  });

  describe('validate', () => {
    it('should not throw for valid input with sufficient balance', async () => {
      await expect(withdrawTransaction.validate(validInput)).resolves.not.toThrow();
    });

    it('should throw InvalidTransactionError for zero amount', async () => {
      const input = { ...validInput, amount: 0n };

      await expect(withdrawTransaction.validate(input)).rejects.toThrow(Error);
    });

    it('should throw InvalidTransactionError for negative amount', async () => {
      const input = { ...validInput, amount: -1000n };

      await expect(withdrawTransaction.validate(input)).rejects.toThrow(Error);
    });

    it('should not throw for undefined reference (optional field)', async () => {
      const input = { ...validInput, reference: undefined };

      await expect(withdrawTransaction.validate(input)).resolves.not.toThrow();
    });

    it('should throw InvalidTransactionError for insufficient balance', async () => {
      mockBalanceService.getBalance.mockResolvedValue({ ledgerAccountId: 'user-ledger-123', balanceAmount: 1000n, lastSequence: 0, updatedAt: new Date() });
      const input = { ...validInput, amount: 5000n };

      await expect(withdrawTransaction.validate(input)).rejects.toThrow(InvalidTransactionError);
    });
  });

  describe('buildTransactionInput (via execute flow)', () => {
    it('should build CreateTransactionInput with WITHDRAW type and isCredit false', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'PENDING',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue([
        createLedgerLine(validInput.userLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.bankLiabilityLedgerAccountId, 0n, validInput.amount, 1),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);

      await withdrawTransaction.execute(validInput);

      expect(mockTransactionStore.createHeader).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'WITHDRAW',
          ledgerAccountId: validInput.userLedgerAccountId,
          isCredit: false,
          counterpartyLedgerAccountId: null,
        }),
        mockQueryRunner
      );
    });
  });

  describe('buildJournal (via execute flow)', () => {
    it('should create journal with user debit and bank liability credit', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue([
        createLedgerLine(validInput.userLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.bankLiabilityLedgerAccountId, 0n, validInput.amount, 1),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);

      await withdrawTransaction.execute(validInput);

      expect(mockLedgerService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'tx-123',
          type: 'WITHDRAW',
          currency: 'USD',
          lines: expect.arrayContaining([
            // User account gets DEBITED
            expect.objectContaining({
              ledgerAccountId: validInput.userLedgerAccountId,
              debit: validInput.amount,
              credit: 0n,
            }),
            // Bank liability gets CREDITED
            expect.objectContaining({
              ledgerAccountId: validInput.bankLiabilityLedgerAccountId,
              debit: 0n,
              credit: validInput.amount,
            }),
          ]),
        }),
        mockQueryRunner
      );
    });
  });

  describe('computeBalanceDeltas', () => {
    it('should compute negative delta for user (debit) and positive for bank (credit)', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(validInput.userLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.bankLiabilityLedgerAccountId, 0n, validInput.amount, 1),
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue([]);

      await withdrawTransaction.execute(validInput);

      expect(mockBalanceService.apply).toHaveBeenCalledWith(
        expect.arrayContaining([
          // User: negative delta (debit)
          expect.objectContaining({
            ledgerAccountId: validInput.userLedgerAccountId,
            delta: -validInput.amount,
          }),
          // Bank liability: positive delta (credit)
          expect.objectContaining({
            ledgerAccountId: validInput.bankLiabilityLedgerAccountId,
            delta: validInput.amount,
          }),
        ]),
        mockQueryRunner
      );
    });
  });

  describe('execute', () => {
    it('should complete full withdrawal flow', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(validInput.userLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.bankLiabilityLedgerAccountId, 0n, validInput.amount, 1),
      ];

      const balanceRecords: BalanceRecord[] = [
        { ledgerAccountId: validInput.userLedgerAccountId, balanceAmount: 5000n, lastSequence: 1, updatedAt: new Date() },
        { ledgerAccountId: validInput.bankLiabilityLedgerAccountId, balanceAmount: -5000n, lastSequence: 1, updatedAt: new Date() },
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue(balanceRecords);

      const result = await withdrawTransaction.execute(validInput);

      // Verify transaction flow
      expect(mockTransactionStore.createHeader).toHaveBeenCalled();
      expect(mockLedgerService.post).toHaveBeenCalled();
      expect(mockBalanceService.apply).toHaveBeenCalled();

      expect(result.transactionId).toBe('tx-123');
    });

    it('should throw InsufficientBalanceError when user has insufficient balance', async () => {
      // Mock insufficient balance during validation
      mockBalanceService.getBalance.mockResolvedValue({ ledgerAccountId: 'user-ledger-123', balanceAmount: 1000n, lastSequence: 0, updatedAt: new Date() });

      await expect(withdrawTransaction.execute(validInput)).rejects.toThrow(InvalidTransactionError);
    });

    it('should propagate error on failure', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockRejectedValue(new Error('Unexpected error'));

      await expect(withdrawTransaction.execute(validInput)).rejects.toThrow('Unexpected error');
    });
  });
});
