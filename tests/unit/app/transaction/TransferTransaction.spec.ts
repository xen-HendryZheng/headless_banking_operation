import { DataSource, QueryRunner } from 'typeorm';
import { TransferTransaction, TransferInput } from '../../../../src/app/transaction/TransferTransaction';
import { TransactionStore, TransactionHeader } from '../../../../src/services/transaction/TransactionStore';
import { LedgerService } from '../../../../src/services/ledger/LedgerService';
import { BalanceService, BalanceRecord } from '../../../../src/services/balance/BalanceService';
import { LedgerAccountStore, LedgerAccount } from '../../../../src/services/account/LedgerAccountStore';
import { LedgerLine } from '../../../../src/domain/ledger/LedgerTypes';
import { InvalidTransactionError, InsufficientBalanceError } from '../../../../src/domain/common/DomainErrors';
import { LedgerAccountType } from '../../../../src/stores/entities/enums';

describe('TransferTransaction', () => {
  let transferTransaction: TransferTransaction;
  let mockTransactionStore: jest.Mocked<TransactionStore>;
  let mockLedgerService: jest.Mocked<LedgerService>;
  let mockBalanceService: jest.Mocked<BalanceService>;
  let mockLedgerAccountStore: jest.Mocked<LedgerAccountStore>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  // Resolved ledger account IDs (mocked)
  const senderLedgerAccountId = 'sender-ledger-123';
  const receiverLedgerAccountId = 'receiver-ledger-456';

  // Valid transfer input for testing
  const validInput: TransferInput = {
    senderAccountId: 'sender-account-123',
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
  const createLedgerAccount = (id: string, accountId: string, type: LedgerAccountType): LedgerAccount => ({
    id,
    accountId,
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
      getBalances: jest.fn().mockResolvedValue([
        { ledgerAccountId: receiverLedgerAccountId, balanceAmount: 0n, lastSequence: 0n, updatedAt: new Date() },
        { ledgerAccountId: senderLedgerAccountId, balanceAmount: 10000n, lastSequence: 0n, updatedAt: new Date() },
      ]),
    };

    mockLedgerAccountStore = {
      create: jest.fn(),
      findById: jest.fn(),
      findByAccountId: jest.fn(),
      findByAccountIdAndType: jest.fn().mockImplementation((accountId, type) => {
        if (type === LedgerAccountType.USER_CASH) {
          if (accountId === validInput.senderAccountId) {
            return Promise.resolve(createLedgerAccount(senderLedgerAccountId, accountId, LedgerAccountType.USER_CASH));
          }
          if (accountId === validInput.receiverAccountId) {
            return Promise.resolve(createLedgerAccount(receiverLedgerAccountId, accountId, LedgerAccountType.USER_CASH));
          }
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

    transferTransaction = new TransferTransaction(
      mockTransactionStore,
      mockLedgerService,
      mockBalanceService,
      mockLedgerAccountStore,
      mockDataSource
    );
  });

  describe('execute', () => {
    it('should resolve ledger accounts and complete full transfer flow', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: senderLedgerAccountId,
        counterpartyLedgerAccountId: receiverLedgerAccountId,
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
        createLedgerLine(senderLedgerAccountId, validInput.amount, 0n, 1n),
        createLedgerLine(receiverLedgerAccountId, 0n, validInput.amount, 1n),
      ];

      const balanceRecords: BalanceRecord[] = [
        { ledgerAccountId: senderLedgerAccountId, balanceAmount: 7500n, lastSequence: 1n, updatedAt: new Date() },
        { ledgerAccountId: receiverLedgerAccountId, balanceAmount: 2500n, lastSequence: 1n, updatedAt: new Date() },
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue(balanceRecords);

      const result = await transferTransaction.execute(validInput);

      // Verify ledger accounts were resolved
      expect(mockLedgerAccountStore.findByAccountIdAndType).toHaveBeenCalledWith(
        validInput.senderAccountId,
        LedgerAccountType.USER_CASH,
        mockQueryRunner
      );
      expect(mockLedgerAccountStore.findByAccountIdAndType).toHaveBeenCalledWith(
        validInput.receiverAccountId,
        LedgerAccountType.USER_CASH,
        mockQueryRunner
      );

      // Verify transaction flow
      expect(mockTransactionStore.createHeader).toHaveBeenCalled();
      expect(mockLedgerService.post).toHaveBeenCalled();
      expect(mockBalanceService.apply).toHaveBeenCalled();

      expect(result.transactionId).toBe('tx-123');
    });

    it('should throw error when sender ledger account not found', async () => {
      mockLedgerAccountStore.findByAccountIdAndType.mockResolvedValue(null);

      await expect(transferTransaction.execute(validInput)).rejects.toThrow(InvalidTransactionError);
    });

    it('should throw InsufficientBalanceError when sender has insufficient balance', async () => {
      mockBalanceService.getBalances.mockResolvedValue([
        { ledgerAccountId: receiverLedgerAccountId, balanceAmount: 0n, lastSequence: 0n, updatedAt: new Date() },
        { ledgerAccountId: senderLedgerAccountId, balanceAmount: 1000n, lastSequence: 0n, updatedAt: new Date() },
      ]);

      await expect(transferTransaction.execute(validInput)).rejects.toThrow(InsufficientBalanceError);
    });

    it('should build journal with sender debit and receiver credit', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: senderLedgerAccountId,
        counterpartyLedgerAccountId: receiverLedgerAccountId,
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
        createLedgerLine(senderLedgerAccountId, validInput.amount, 0n, 1n),
        createLedgerLine(receiverLedgerAccountId, 0n, validInput.amount, 1n),
      ]);
      mockBalanceService.apply.mockResolvedValue([]);

      await transferTransaction.execute(validInput);

      expect(mockLedgerService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'tx-123',
          type: 'TRANSFER',
          currency: 'USD',
          lines: expect.arrayContaining([
            expect.objectContaining({
              ledgerAccountId: senderLedgerAccountId,
              debit: validInput.amount,
              credit: 0n,
            }),
            expect.objectContaining({
              ledgerAccountId: receiverLedgerAccountId,
              debit: 0n,
              credit: validInput.amount,
            }),
          ]),
        }),
        mockQueryRunner
      );
    });

    it('should compute negative delta for sender and positive for receiver', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: senderLedgerAccountId,
        counterpartyLedgerAccountId: receiverLedgerAccountId,
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
        createLedgerLine(senderLedgerAccountId, validInput.amount, 0n, 1n),
        createLedgerLine(receiverLedgerAccountId, 0n, validInput.amount, 1n),
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue([]);

      await transferTransaction.execute(validInput);

      expect(mockBalanceService.apply).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            ledgerAccountId: senderLedgerAccountId,
            delta: -validInput.amount,
          }),
          expect.objectContaining({
            ledgerAccountId: receiverLedgerAccountId,
            delta: validInput.amount,
          }),
        ]),
        mockQueryRunner
      );
    });
  });
});
