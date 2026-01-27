import { DataSource, QueryRunner } from 'typeorm';
import { WithdrawTransaction, WithdrawInput } from '../../../../src/app/transaction/WithdrawTransaction';
import { TransactionStore, TransactionHeader } from '../../../../src/services/transaction/TransactionStore';
import { LedgerService } from '../../../../src/services/ledger/LedgerService';
import { BalanceService, BalanceRecord } from '../../../../src/services/balance/BalanceService';
import { LedgerAccountStore, LedgerAccount } from '../../../../src/services/account/LedgerAccountStore';
import { LedgerLine } from '../../../../src/domain/ledger/LedgerTypes';
import { InvalidTransactionError, InsufficientBalanceError } from '../../../../src/domain/common/DomainErrors';
import { LedgerAccountType } from '../../../../src/stores/entities/enums';

describe('WithdrawTransaction', () => {
  let withdrawTransaction: WithdrawTransaction;
  let mockTransactionStore: jest.Mocked<TransactionStore>;
  let mockLedgerService: jest.Mocked<LedgerService>;
  let mockBalanceService: jest.Mocked<BalanceService>;
  let mockLedgerAccountStore: jest.Mocked<LedgerAccountStore>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  // Resolved ledger account IDs (mocked)
  const userLedgerAccountId = 'user-ledger-123';
  const bankLiabilityLedgerAccountId = 'bank-liability-ledger';

  // Valid withdraw input for testing
  const validInput: WithdrawInput = {
    accountId: 'user-account-123',
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
      getBalance: jest.fn().mockResolvedValue({
        ledgerAccountId: userLedgerAccountId,
        balanceAmount: 10000n,
        lastSequence: 0n,
        updatedAt: new Date()
      }),
      getBalances: jest.fn(),
    };

    mockLedgerAccountStore = {
      create: jest.fn(),
      findById: jest.fn(),
      findByAccountId: jest.fn(),
      findByAccountIdAndType: jest.fn().mockImplementation((_accountId, type) => {
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

    withdrawTransaction = new WithdrawTransaction(
      mockTransactionStore,
      mockLedgerService,
      mockBalanceService,
      mockLedgerAccountStore,
      mockDataSource
    );
  });

  describe('execute', () => {
    it('should resolve ledger accounts and complete full withdrawal flow', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(bankLiabilityLedgerAccountId, 0n, validInput.amount, 1n),
        createLedgerLine(userLedgerAccountId, validInput.amount, 0n, 1n),
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue([]);

      const result = await withdrawTransaction.execute(validInput);

      // Verify ledger accounts were resolved
      expect(mockLedgerAccountStore.findByAccountIdAndType).toHaveBeenCalledWith(
        validInput.accountId,
        LedgerAccountType.USER_CASH,
        mockQueryRunner
      );

      // Verify transaction flow
      expect(mockTransactionStore.createHeader).toHaveBeenCalled();
      expect(mockLedgerService.post).toHaveBeenCalled();
      expect(mockBalanceService.apply).toHaveBeenCalled();

      expect(result.transactionId).toBe('tx-123');
    });

    it('should throw InsufficientBalanceError when user has insufficient balance', async () => {
      mockBalanceService.getBalance.mockResolvedValue({
        ledgerAccountId: userLedgerAccountId,
        balanceAmount: 1000n,
        lastSequence: 0n,
        updatedAt: new Date()
      });

      await expect(withdrawTransaction.execute(validInput)).rejects.toThrow(InsufficientBalanceError);
    });

    it('should throw error when user cash ledger account not found', async () => {
      mockLedgerAccountStore.findByAccountIdAndType.mockResolvedValue(null);

      await expect(withdrawTransaction.execute(validInput)).rejects.toThrow(InvalidTransactionError);
    });

    it('should update only user balance with negative delta', async () => {
      const txHeader: TransactionHeader = {
        id: 'tx-123',
        ledgerAccountId: userLedgerAccountId,
        counterpartyLedgerAccountId: null,
        type: 'WITHDRAW',
        currency: 'USD',
        isCredit: false,
        amount: validInput.amount,
        reference: validInput.reference || '',
        description: validInput.description || null,
        status: 'POSTED',
        accountId: validInput.accountId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ledgerLines: LedgerLine[] = [
        createLedgerLine(bankLiabilityLedgerAccountId, 0n, validInput.amount, 1n),
        createLedgerLine(userLedgerAccountId, validInput.amount, 0n, 1n),
      ];

      mockTransactionStore.createHeader.mockResolvedValue(txHeader);
      mockLedgerService.post.mockResolvedValue(ledgerLines);
      mockBalanceService.apply.mockResolvedValue([]);

      await withdrawTransaction.execute(validInput);

      expect(mockBalanceService.apply).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            ledgerAccountId: userLedgerAccountId,
            delta: -validInput.amount,
          }),
        ],
        mockQueryRunner
      );
    });
  });
});
