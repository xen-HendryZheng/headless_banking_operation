import { QueryRunner } from 'typeorm';
import { LedgerServiceImpl } from '../../../../src/services/ledger/LedgerServiceImpl';
import { LedgerRules } from '../../../../src/domain/ledger/LedgerRules';
import { LedgerLineStore } from '../../../../src/services/ledger/LedgerLineStore';
import { Sequencer } from '../../../../src/services/ledger/Sequencer';
import { JournalDraft, LedgerLineDraft, LedgerLine } from '../../../../src/domain/ledger/LedgerTypes';
import { UnbalancedJournalError, InvalidLedgerLineError } from '../../../../src/domain/common/DomainErrors';

describe('LedgerServiceImpl', () => {
  let ledgerService: LedgerServiceImpl;
  let mockLedgerRules: jest.Mocked<LedgerRules>;
  let mockLedgerLineStore: jest.Mocked<LedgerLineStore>;
  let mockSequencer: jest.Mocked<Sequencer>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  // Helper to create ledger line drafts
  const createLineDraft = (
    ledgerAccountId: string,
    debit: bigint,
    credit: bigint
  ): LedgerLineDraft => ({
    ledgerAccountId,
    accountId: 'account-1',
    debit,
    credit,
    amount: debit > 0n ? debit : credit,
    isDebit: debit > 0n,
  });

  // Helper to create persisted ledger line
  const createLedgerLine = (
    id: string,
    transactionId: string,
    ledgerAccountId: string,
    debit: bigint,
    credit: bigint,
    sequence: number
  ): LedgerLine => ({
    id,
    transactionId,
    ledgerAccountId,
    accountId: 'account-1',
    debit,
    credit,
    amount: debit > 0n ? debit : credit,
    sequence,
    createdAt: new Date(),
  });

  beforeEach(() => {
    mockLedgerRules = {
      assertBalanced: jest.fn(),
      assertValidLines: jest.fn(),
    };

    mockLedgerLineStore = {
      insert: jest.fn(),
      findByTransactionId: jest.fn(),
      findByLedgerAccountId: jest.fn(),
      getLatestLedgerLine: jest.fn(),
    };

    mockSequencer = {
      getNextSequence: jest.fn(),
    };

    mockQueryRunner = {} as jest.Mocked<QueryRunner>;

    ledgerService = new LedgerServiceImpl(
      mockLedgerRules,
      mockLedgerLineStore,
      mockSequencer
    );
  });

  describe('post', () => {
    it('should validate journal using ledgerRules', async () => {
      const journal: JournalDraft = {
        transactionId: 'tx-123',
        type: 'DEPOSIT',
        currency: 'USD',
        lines: [
          createLineDraft('ledger-1', 1000n, 0n),
          createLineDraft('ledger-2', 0n, 1000n),
        ],
      };

      mockSequencer.getNextSequence.mockResolvedValue(1);
      mockLedgerLineStore.insert.mockResolvedValue([
        createLedgerLine('line-1', 'tx-123', 'ledger-1', 1000n, 0n, 1),
        createLedgerLine('line-2', 'tx-123', 'ledger-2', 0n, 1000n, 1),
      ]);

      await ledgerService.post(journal, mockQueryRunner);

      expect(mockLedgerRules.assertBalanced).toHaveBeenCalledWith(journal.lines);
      expect(mockLedgerRules.assertValidLines).toHaveBeenCalledWith(journal.lines);
    });

    it('should allocate sequences for each line', async () => {
      const journal: JournalDraft = {
        transactionId: 'tx-123',
        type: 'DEPOSIT',
        currency: 'USD',
        lines: [
          createLineDraft('ledger-1', 1000n, 0n),
          createLineDraft('ledger-2', 0n, 1000n),
        ],
      };

      mockSequencer.getNextSequence
        .mockResolvedValueOnce(5) // First call for ledger-1
        .mockResolvedValueOnce(3); // Second call for ledger-2

      mockLedgerLineStore.insert.mockResolvedValue([
        createLedgerLine('line-1', 'tx-123', 'ledger-1', 1000n, 0n, 5),
        createLedgerLine('line-2', 'tx-123', 'ledger-2', 0n, 1000n, 3),
      ]);

      await ledgerService.post(journal, mockQueryRunner);

      expect(mockSequencer.getNextSequence).toHaveBeenCalledWith('ledger-1', mockQueryRunner);
      expect(mockSequencer.getNextSequence).toHaveBeenCalledWith('ledger-2', mockQueryRunner);
      expect(mockSequencer.getNextSequence).toHaveBeenCalledTimes(2);
    });

    it('should persist lines via ledgerLineStore', async () => {
      const journal: JournalDraft = {
        transactionId: 'tx-123',
        type: 'DEPOSIT',
        currency: 'USD',
        lines: [
          createLineDraft('ledger-1', 1000n, 0n),
          createLineDraft('ledger-2', 0n, 1000n),
        ],
      };

      mockSequencer.getNextSequence
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      mockLedgerLineStore.insert.mockResolvedValue([
        createLedgerLine('line-1', 'tx-123', 'ledger-1', 1000n, 0n, 1),
        createLedgerLine('line-2', 'tx-123', 'ledger-2', 0n, 1000n, 1),
      ]);

      await ledgerService.post(journal, mockQueryRunner);

      expect(mockLedgerLineStore.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            transactionId: 'tx-123',
            ledgerAccountId: 'ledger-1',
            debit: 1000n,
            credit: 0n,
            sequence: 1,
          }),
          expect.objectContaining({
            transactionId: 'tx-123',
            ledgerAccountId: 'ledger-2',
            debit: 0n,
            credit: 1000n,
            sequence: 1,
          }),
        ]),
        mockQueryRunner
      );
    });

    it('should return persisted ledger lines', async () => {
      const journal: JournalDraft = {
        transactionId: 'tx-123',
        type: 'DEPOSIT',
        currency: 'USD',
        lines: [
          createLineDraft('ledger-1', 1000n, 0n),
          createLineDraft('ledger-2', 0n, 1000n),
        ],
      };

      const expectedLines = [
        createLedgerLine('line-1', 'tx-123', 'ledger-1', 1000n, 0n, 1),
        createLedgerLine('line-2', 'tx-123', 'ledger-2', 0n, 1000n, 1),
      ];

      mockSequencer.getNextSequence.mockResolvedValue(1);
      mockLedgerLineStore.insert.mockResolvedValue(expectedLines);

      const result = await ledgerService.post(journal, mockQueryRunner);

      expect(result).toEqual(expectedLines);
      expect(result).toHaveLength(2);
    });

    it('should throw when journal is unbalanced', async () => {
      const journal: JournalDraft = {
        transactionId: 'tx-123',
        type: 'DEPOSIT',
        currency: 'USD',
        lines: [
          createLineDraft('ledger-1', 1000n, 0n),
          createLineDraft('ledger-2', 0n, 500n), // Unbalanced
        ],
      };

      mockLedgerRules.assertBalanced.mockImplementation(() => {
        throw new UnbalancedJournalError();
      });

      await expect(ledgerService.post(journal, mockQueryRunner)).rejects.toThrow(
        UnbalancedJournalError
      );

      expect(mockLedgerLineStore.insert).not.toHaveBeenCalled();
    });

    it('should throw when lines are invalid', async () => {
      const journal: JournalDraft = {
        transactionId: 'tx-123',
        type: 'DEPOSIT',
        currency: 'USD',
        lines: [
          createLineDraft('ledger-1', 1000n, 500n), // Invalid: both non-zero
        ],
      };

      mockLedgerRules.assertValidLines.mockImplementation(() => {
        throw new InvalidLedgerLineError();
      });

      await expect(ledgerService.post(journal, mockQueryRunner)).rejects.toThrow(
        InvalidLedgerLineError
      );

      expect(mockLedgerLineStore.insert).not.toHaveBeenCalled();
    });

    it('should handle empty lines array', async () => {
      const journal: JournalDraft = {
        transactionId: 'tx-123',
        type: 'DEPOSIT',
        currency: 'USD',
        lines: [],
      };

      mockLedgerLineStore.insert.mockResolvedValue([]);

      const result = await ledgerService.post(journal, mockQueryRunner);

      expect(result).toEqual([]);
      expect(mockSequencer.getNextSequence).not.toHaveBeenCalled();
    });
  });
});
