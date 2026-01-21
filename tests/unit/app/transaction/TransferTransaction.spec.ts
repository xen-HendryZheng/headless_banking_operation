import { DataSource, QueryRunner } from 'typeorm';
import { TransferTransaction, TransferInput } from '../../../../src/app/transaction/TransferTransaction';
import { TransactionStore, TransactionHeader } from '../../../../src/services/transaction/TransactionStore';
import { LedgerService } from '../../../../src/services/ledger/LedgerService';
import { BalanceService, BalanceRecord } from '../../../../src/services/balance/BalanceService';
import { LedgerLine } from '../../../../src/domain/ledger/LedgerTypes';
import { InvalidTransactionError, InsufficientBalanceError } from '../../../../src/domain/common/DomainErrors';

describe('TransferTransaction', () => {
  let transferTransaction: TransferTransaction;
  let mockTransactionStore: jest.Mocked<TransactionStore>;
  let mockLedgerService: jest.Mocked<LedgerService>;
  let mockBalanceService: jest.Mocked<BalanceService>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  // Valid transfer input for testing
  const validInput: TransferInput = {
    senderLedgerAccountId: 'sender-ledger-123',
    senderAccountId: 'sender-account-123',
    receiverLedgerAccountId: 'receiver-ledger-456',
    receiverAccountId: 'receiver-account-456',
    amount: 2500n,
    currency: 'USD',
    reference: 'TRF-001',
    description: 'Test transfer',
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
      getBalance: jest.fn().mockResolvedValue({ ledgerAccountId: 'sender-ledger-123', balanceAmount: 10000n, lastSequence: 0, updatedAt: new Date() }),
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

    transferTransaction = new TransferTransaction(
      mockTransactionStore,
      mockLedgerService,
      mockBalanceService,
      mockDataSource
    );
  });

  describe('validate', () => {
    it('should not throw for valid input with sufficient balance', async () => {
      await expect(transferTransaction.validate(validInput)).resolves.not.toThrow();
    });

    it('should throw for zero amount', async () => {
      const input = { ...validInput, amount: 0n };

      await expect(transferTransaction.validate(input)).rejects.toThrow(Error);
    });

    it('should throw for negative amount', async () => {
      const input = { ...validInput, amount: -1000n };

      await expect(transferTransaction.validate(input)).rejects.toThrow(Error);
    });

    it('should not throw for undefined reference (optional field)', async () => {
      const input = { ...validInput, reference: undefined };

      await expect(transferTransaction.validate(input)).resolves.not.toThrow();
    });

    it('should throw InvalidTransactionError for insufficient balance', async () => {
      mockBalanceService.getBalance.mockResolvedValue({ ledgerAccountId: 'sender-ledger-123', balanceAmount: 1000n, lastSequence: 0, updatedAt: new Date() });
      const input = { ...validInput, amount: 5000n };

      await expect(transferTransaction.validate(input)).rejects.toThrow(InvalidTransactionError);
    });
  });

  describe('buildTransactionInput (via execute flow)', () => {
    it('should build CreateTransactionInput with WITHDRAW type for sender perspective', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.senderLedgerAccountId,
        counterpartyLedgerAccountId: validInput.receiverLedgerAccountId,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.senderAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue([
        createLedgerLine(validInput.senderLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.receiverLedgerAccountId, 0n, validInput.amount, 1),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);

      await transferTransaction.execute(validInput);

      expect(mockTransactionStore.createHeader).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'WITHDRAW',
          ledgerAccountId: validInput.senderLedgerAccountId,
          isCredit: false,
          counterpartyLedgerAccountId: validInput.receiverLedgerAccountId,
        }),
        mockQueryRunner
      );
    });
  });

  describe('buildJournal (via execute flow)', () => {
    it('should create journal with sender debit and receiver credit', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.senderLedgerAccountId,
        counterpartyLedgerAccountId: validInput.receiverLedgerAccountId,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.senderAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue([
        createLedgerLine(validInput.senderLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.receiverLedgerAccountId, 0n, validInput.amount, 1),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);
      
      await transferTransaction.execute(validInput);

      expect(mockLedgerService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'tx-123',
          type: 'TRANSFER',
          currency: 'USD',
          lines: expect.arrayContaining([
            // Sender account gets DEBITED
            expect.objectContaining({
              ledgerAccountId: validInput.senderLedgerAccountId,
              debit: validInput.amount,
              credit: 0n,
            }),
            // Receiver account gets CREDITED
            expect.objectContaining({
              ledgerAccountId: validInput.receiverLedgerAccountId,
              debit: 0n,
              credit: validInput.amount,
            }),
          ]),
        }),
        mockQueryRunner
      );
    });

    it('should not touch bank liability account', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.senderLedgerAccountId,
        counterpartyLedgerAccountId: validInput.receiverLedgerAccountId,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.senderAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue([
        createLedgerLine(validInput.senderLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.receiverLedgerAccountId, 0n, validInput.amount, 1),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);
      
      await transferTransaction.execute(validInput);

      // Verify only 2 lines are posted (sender and receiver)
      const postCall = mockLedgerService.post.mock.calls[0][0];
      expect(postCall.lines).toHaveLength(2);

      // Verify no bank liability account is involved
      const ledgerAccountIds = postCall.lines.map((line: any) => line.ledgerAccountId);
      expect(ledgerAccountIds).toContain(validInput.senderLedgerAccountId);
      expect(ledgerAccountIds).toContain(validInput.receiverLedgerAccountId);
      expect(ledgerAccountIds).not.toContain(expect.stringMatching(/bank|liability/i));
    });
  });

  describe('computeBalanceDeltas', () => {
    it('should compute delta as debit minus credit for each line', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.senderLedgerAccountId,
        counterpartyLedgerAccountId: validInput.receiverLedgerAccountId,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.senderAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(validInput.senderLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.receiverLedgerAccountId, 0n, validInput.amount, 1),
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue([]);

      await transferTransaction.execute(validInput);

      // Transfer uses debit - credit for delta calculation
      expect(mockBalanceService.apply).toHaveBeenCalledWith(
        expect.arrayContaining([
          // Sender: debit - credit = amount - 0 = positive
          expect.objectContaining({
            ledgerAccountId: validInput.senderLedgerAccountId,
            delta: validInput.amount,
          }),
          // Receiver: debit - credit = 0 - amount = negative
          expect.objectContaining({
            ledgerAccountId: validInput.receiverLedgerAccountId,
            delta: -validInput.amount,
          }),
        ]),
        mockQueryRunner
      );
    });
  });

  describe('execute', () => {
    it('should complete full transfer flow', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.senderLedgerAccountId,
        counterpartyLedgerAccountId: validInput.receiverLedgerAccountId,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.senderAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(validInput.senderLedgerAccountId, validInput.amount, 0n, 1),
        createLedgerLine(validInput.receiverLedgerAccountId, 0n, validInput.amount, 1),
      ];

      const balanceRecords: BalanceRecord[] = [
        { ledgerAccountId: validInput.senderLedgerAccountId, balanceAmount: 7500n, lastSequence: 1, updatedAt: new Date() },
        { ledgerAccountId: validInput.receiverLedgerAccountId, balanceAmount: 2500n, lastSequence: 1, updatedAt: new Date() },
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue(balanceRecords);

      const result = await transferTransaction.execute(validInput);

      expect(mockTransactionStore.createHeader).toHaveBeenCalled();
      expect(mockLedgerService.post).toHaveBeenCalled();
      expect(mockBalanceService.apply).toHaveBeenCalled();

      expect(result.transactionId).toBe('tx-123');
    });

    it('should throw InvalidTransactionError when sender has insufficient balance during validation', async () => {
      // Mock insufficient balance - validation happens before any transaction operations
      mockBalanceService.getBalance.mockResolvedValue({
        ledgerAccountId: validInput.senderLedgerAccountId,
        balanceAmount: 1000n, // Less than required 2500n
        lastSequence: 0,
        updatedAt: new Date(),
      });

      await expect(transferTransaction.execute(validInput)).rejects.toThrow(InvalidTransactionError);

      // Validation fails early - no transaction operations should occur
      expect(mockTransactionStore.createHeader).not.toHaveBeenCalled();
    });

    it('should propagate error on ledger post failure', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: validInput.senderLedgerAccountId,
        counterpartyLedgerAccountId: validInput.receiverLedgerAccountId,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.senderAccountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockRejectedValue(new Error('Unexpected error'));

      await expect(transferTransaction.execute(validInput)).rejects.toThrow('Unexpected error');
    });
  });
});
