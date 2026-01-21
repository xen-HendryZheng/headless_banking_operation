import { QueryRunner } from 'typeorm';
import { BalanceServiceImpl } from '../../../../src/services/balance/BalanceServiceImpl';
import { BalanceRules } from '../../../../src/domain/balance/BalanceRules';
import { BalanceStore } from '../../../../src/services/balance/BalanceStore';
import { BalanceRecord, BalanceDelta } from '../../../../src/services/balance/BalanceService';
import { InsufficientBalanceError } from '../../../../src/domain/common/DomainErrors';

describe('BalanceServiceImpl', () => {
  let balanceService: BalanceServiceImpl;
  let mockBalanceRules: jest.Mocked<BalanceRules>;
  let mockBalanceStore: jest.Mocked<BalanceStore>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  // Helper to create balance record
  const createBalanceRecord = (
    ledgerAccountId: string,
    balanceAmount: bigint,
    lastSequence: number
  ): BalanceRecord => ({
    ledgerAccountId,
    balanceAmount,
    lastSequence,
    updatedAt: new Date(),
  });

  beforeEach(() => {
    mockBalanceRules = {
      assertNoNegative: jest.fn(),
    };

    mockBalanceStore = {
      lockAndGet: jest.fn(),
      lockAndGetMany: jest.fn(),
      insert: jest.fn(),
      updateBalance: jest.fn(),
      getBalance: jest.fn(),
      getBalances: jest.fn(),
    };

    mockQueryRunner = {} as jest.Mocked<QueryRunner>;

    balanceService = new BalanceServiceImpl(mockBalanceRules, mockBalanceStore);
  });

  describe('apply', () => {
    it('should lock balances for all affected ledger accounts', async () => {
      const deltas: BalanceDelta[] = [
        { ledgerAccountId: 'ledger-1', delta: 1000n, newSequence: 1 },
        { ledgerAccountId: 'ledger-2', delta: -1000n, newSequence: 1 },
      ];

      mockBalanceStore.lockAndGetMany.mockResolvedValue([
        createBalanceRecord('ledger-1', 0n, 0),
        createBalanceRecord('ledger-2', 5000n, 0),
      ]);

      mockBalanceStore.updateBalance.mockImplementation(async (id, balance, seq) =>
        createBalanceRecord(id, balance, seq)
      );

      await balanceService.apply(deltas, mockQueryRunner);

      expect(mockBalanceStore.lockAndGetMany).toHaveBeenCalledWith(
        expect.arrayContaining(['ledger-1', 'ledger-2']),
        mockQueryRunner
      );
    });

    it('should validate no-negative constraint for each delta', async () => {
      const deltas: BalanceDelta[] = [
        { ledgerAccountId: 'ledger-1', delta: -500n, newSequence: 1 },
      ];

      mockBalanceStore.lockAndGetMany.mockResolvedValue([
        createBalanceRecord('ledger-1', 1000n, 0),
      ]);

      mockBalanceStore.updateBalance.mockImplementation(async (id, balance, seq) =>
        createBalanceRecord(id, balance, seq)
      );

      await balanceService.apply(deltas, mockQueryRunner);

      expect(mockBalanceRules.assertNoNegative).toHaveBeenCalledWith(1000n, -500n);
    });

    it('should update balances via balanceStore', async () => {
      const deltas: BalanceDelta[] = [
        { ledgerAccountId: 'ledger-1', delta: 1000n, newSequence: 5 },
      ];

      mockBalanceStore.lockAndGetMany.mockResolvedValue([
        createBalanceRecord('ledger-1', 500n, 4),
      ]);

      mockBalanceStore.updateBalance.mockResolvedValue(
        createBalanceRecord('ledger-1', 1500n, 5)
      );

      await balanceService.apply(deltas, mockQueryRunner);

      expect(mockBalanceStore.updateBalance).toHaveBeenCalledWith(
        'ledger-1',
        1500n, // 500 + 1000
        5,
        mockQueryRunner
      );
    });

    it('should return updated balance records', async () => {
      const deltas: BalanceDelta[] = [
        { ledgerAccountId: 'ledger-1', delta: 1000n, newSequence: 1 },
        { ledgerAccountId: 'ledger-2', delta: 500n, newSequence: 1 },
      ];

      mockBalanceStore.lockAndGetMany.mockResolvedValue([
        createBalanceRecord('ledger-1', 0n, 0),
        createBalanceRecord('ledger-2', 100n, 0),
      ]);

      mockBalanceStore.updateBalance
        .mockResolvedValueOnce(createBalanceRecord('ledger-1', 1000n, 1))
        .mockResolvedValueOnce(createBalanceRecord('ledger-2', 600n, 1));

      const result = await balanceService.apply(deltas, mockQueryRunner);

      expect(result).toHaveLength(2);
      expect(result[0].balanceAmount).toBe(1000n);
      expect(result[1].balanceAmount).toBe(600n);
    });

    it('should throw InsufficientBalanceError when balance would go negative', async () => {
      const deltas: BalanceDelta[] = [
        { ledgerAccountId: 'ledger-1', delta: -2000n, newSequence: 1 },
      ];

      mockBalanceStore.lockAndGetMany.mockResolvedValue([
        createBalanceRecord('ledger-1', 1000n, 0),
      ]);

      mockBalanceRules.assertNoNegative.mockImplementation(() => {
        throw new InsufficientBalanceError();
      });

      await expect(balanceService.apply(deltas, mockQueryRunner)).rejects.toThrow(
        InsufficientBalanceError
      );

      expect(mockBalanceStore.updateBalance).not.toHaveBeenCalled();
    });

    it('should sort ledger account IDs to prevent deadlocks', async () => {
      const deltas: BalanceDelta[] = [
        { ledgerAccountId: 'ledger-z', delta: 100n, newSequence: 1 },
        { ledgerAccountId: 'ledger-a', delta: 100n, newSequence: 1 },
        { ledgerAccountId: 'ledger-m', delta: 100n, newSequence: 1 },
      ];

      mockBalanceStore.lockAndGetMany.mockResolvedValue([
        createBalanceRecord('ledger-a', 0n, 0),
        createBalanceRecord('ledger-m', 0n, 0),
        createBalanceRecord('ledger-z', 0n, 0),
      ]);

      mockBalanceStore.updateBalance.mockImplementation(async (id, balance, seq) =>
        createBalanceRecord(id, balance, seq)
      );

      await balanceService.apply(deltas, mockQueryRunner);

      // Verify lockAndGetMany was called with sorted IDs
      const calledIds = mockBalanceStore.lockAndGetMany.mock.calls[0][0];
      const sortedIds = [...calledIds].sort();
      expect(calledIds).toEqual(sortedIds);
    });

    it('should handle new ledger accounts (no existing balance)', async () => {
      const deltas: BalanceDelta[] = [
        { ledgerAccountId: 'new-ledger', delta: 1000n, newSequence: 1 },
      ];

      // No existing balance - returns empty
      mockBalanceStore.lockAndGetMany.mockResolvedValue([]);

      mockBalanceStore.insert.mockResolvedValue(
        createBalanceRecord('new-ledger', 1000n, 1)
      );

      const result = await balanceService.apply(deltas, mockQueryRunner);

      // Should treat missing balance as 0 and use insert instead of updateBalance
      expect(mockBalanceRules.assertNoNegative).toHaveBeenCalledWith(0n, 1000n);
      expect(mockBalanceStore.insert).toHaveBeenCalledWith('new-ledger', 1000n, 1, mockQueryRunner);
      expect(result).toHaveLength(1);
      expect(result[0].balanceAmount).toBe(1000n);
    });

    it('should handle empty deltas array', async () => {
      const result = await balanceService.apply([], mockQueryRunner);

      expect(result).toEqual([]);
      expect(mockBalanceStore.lockAndGetMany).not.toHaveBeenCalled();
    });
  });

  describe('getBalance', () => {
    it('should return balance record for existing ledger account', async () => {
      const expectedBalance = createBalanceRecord('ledger-1', 5000n, 10);
      mockBalanceStore.lockAndGet.mockResolvedValue(expectedBalance);

      const result = await balanceService.getBalance('ledger-1', mockQueryRunner);

      expect(result).toEqual(expectedBalance);
      expect(mockBalanceStore.lockAndGet).toHaveBeenCalledWith('ledger-1', mockQueryRunner);
    });

    it('should return null for non-existent ledger account', async () => {
      mockBalanceStore.lockAndGet.mockResolvedValue(null);

      const result = await balanceService.getBalance('non-existent', mockQueryRunner);

      expect(result).toBeNull();
    });
  });

  describe('getBalances', () => {
    it('should return balance records for multiple ledger accounts', async () => {
      const balances = [
        createBalanceRecord('ledger-1', 1000n, 5),
        createBalanceRecord('ledger-2', 2000n, 3),
      ];
      mockBalanceStore.lockAndGetMany.mockResolvedValue(balances);

      const result = await balanceService.getBalances(
        ['ledger-1', 'ledger-2'],
        mockQueryRunner
      );

      expect(result).toEqual(balances);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no ledger accounts found', async () => {
      mockBalanceStore.lockAndGetMany.mockResolvedValue([]);

      const result = await balanceService.getBalances(
        ['non-existent-1', 'non-existent-2'],
        mockQueryRunner
      );

      expect(result).toEqual([]);
    });

    it('should return partial results when some accounts exist', async () => {
      const balances = [createBalanceRecord('ledger-1', 1000n, 5)];
      mockBalanceStore.lockAndGetMany.mockResolvedValue(balances);

      const result = await balanceService.getBalances(
        ['ledger-1', 'non-existent'],
        mockQueryRunner
      );

      expect(result).toHaveLength(1);
      expect(result[0].ledgerAccountId).toBe('ledger-1');
    });
  });
});
