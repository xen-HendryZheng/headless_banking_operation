import { DataSource, QueryRunner } from 'typeorm';
import { DepositTransaction, DepositInput } from '../../../../src/app/transaction/DepositTransaction';
import { TransactionStore, TransactionHeader } from '../../../../src/services/transaction/TransactionStore';
import { LedgerService } from '../../../../src/services/ledger/LedgerService';
import { BalanceService, BalanceRecord } from '../../../../src/services/balance/BalanceService';
import { LedgerLine } from '../../../../src/domain/ledger/LedgerTypes';
import { InvalidTransactionError } from '../../../../src/domain/common/DomainErrors';

describe('DepositTransaction', () => {
  let depositTransaction: DepositTransaction;
  let mockTransactionStore: jest.Mocked<TransactionStore>;
  let mockLedgerService: jest.Mocked<LedgerService>;
  let mockBalanceService: jest.Mocked<BalanceService>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  // Valid deposit input for testing
  const validInput: DepositInput = {
    userLedgerAccountId: 'user-ledger-123',
    userAccountId: 'user-account-123',
    bankLiabilityLedgerAccountId: 'bank-liability-ledger',
    bankLiabilityAccountId: 'bank-account',
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
    sequence: number
  ): LedgerLine => ({
    id: `line-${ledgerAccountId}`,
    transactionId: 'tx-123',
    ledgerAccountId,
    accountId: 'account-1',
    debit,
    credit,
    amount: debit > 0n ? debit : credit,
    subtype: 'PRINCIPAL',
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
    };

    mockBalanceService = {
      apply: jest.fn(),
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

    depositTransaction = new DepositTransaction(
      mockTransactionStore,
      mockLedgerService,
      mockBalanceService,
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

    it('should throw InvalidTransactionError for empty reference', () => {
      const input = { ...validInput, reference: '' };

      expect(() => depositTransaction.validate(input)).toThrow(InvalidTransactionError);
    });

    it('should throw InvalidTransactionError for whitespace-only reference', () => {
      const input = { ...validInput, reference: '   ' };

      expect(() => depositTransaction.validate(input)).toThrow(InvalidTransactionError);
    });
  });

  describe('buildTransactionInput (protected method test via execute)', () => {
    it('should build CreateTransactionInput with DEPOSIT type', async () => {
      // Setup mocks for full flow
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference,
        description: validInput.description || null,
        status: 'PENDING',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue([
        createLedgerLine(validInput.bankLiabilityLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.userLedgerAccountId, 0n, validInput.amount, 1),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);

      await depositTransaction.execute(validInput);

      expect(mockTransactionStore.createHeader).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DEPOSIT',
          ledgerAccountId: validInput.userLedgerAccountId,
          isCredit: true,
          counterpartyLedgerAccountId: null,
        }),
        mockQueryRunner
      );
    });
  });

  describe('buildJournal (via execute flow)', () => {
    it('should create journal with bank liability debit and user credit', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference,
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue([
        createLedgerLine(validInput.bankLiabilityLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.userLedgerAccountId, 0n, validInput.amount, 1),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);

      await depositTransaction.execute(validInput);

      // Verify ledgerService.post was called with correct journal structure
      expect(mockLedgerService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'tx-123',
          type: 'DEPOSIT',
          currency: 'USD',
          lines: expect.arrayContaining([
            // Bank liability gets DEBITED
            expect.objectContaining({
              ledgerAccountId: validInput.bankLiabilityLedgerAccountId,
              debit: validInput.amount,
              credit: 0n,
            }),
            // User account gets CREDITED
            expect.objectContaining({
              ledgerAccountId: validInput.userLedgerAccountId,
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
    it('should compute positive delta for credit line and negative for debit line', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference,
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(validInput.bankLiabilityLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.userLedgerAccountId, 0n, validInput.amount, 1),
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue([]);

      await depositTransaction.execute(validInput);

      // Verify balance deltas
      expect(mockBalanceService.apply).toHaveBeenCalledWith(
        expect.arrayContaining([
          // Bank liability: negative delta (debit)
          expect.objectContaining({
            ledgerAccountId: validInput.bankLiabilityLedgerAccountId,
            delta: -validInput.amount, // credit - debit = 0 - amount = negative
          }),
          // User: positive delta (credit)
          expect.objectContaining({
            ledgerAccountId: validInput.userLedgerAccountId,
            delta: validInput.amount, // credit - debit = amount - 0 = positive
          }),
        ]),
        mockQueryRunner
      );
    });
  });

  describe('execute', () => {
    it('should complete full deposit flow', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference,
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(validInput.bankLiabilityLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.userLedgerAccountId, 0n, validInput.amount, 1),
      ];

      const balanceRecords: BalanceRecord[] = [
        { ledgerAccountId: validInput.bankLiabilityLedgerAccountId, balanceAmount: -10000n, lastSequence: 1, updatedAt: new Date() },
        { ledgerAccountId: validInput.userLedgerAccountId, balanceAmount: 10000n, lastSequence: 1, updatedAt: new Date() },
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue(balanceRecords);

      const result = await depositTransaction.execute(validInput);

      // Verify transaction flow
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockTransactionStore.createHeader).toHaveBeenCalled();
      expect(mockLedgerService.post).toHaveBeenCalled();
      expect(mockBalanceService.apply).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();

      // Verify result
      expect(result.transactionId).toBe('tx-123');
    });

    it('should rollback on ledger post failure', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference,
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockRejectedValue(new Error('Ledger post failed'));

      await expect(depositTransaction.execute(validInput)).rejects.toThrow('Ledger post failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback on balance apply failure', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'DEPOSIT',
        currency: 'USD',
        isCredit: true,
        amount: validInput.amount,
        reference: validInput.reference,
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.userAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(validInput.bankLiabilityLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.userLedgerAccountId, 0n, validInput.amount, 1),
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockRejectedValue(new Error('Balance apply failed'));

      await expect(depositTransaction.execute(validInput)).rejects.toThrow('Balance apply failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
