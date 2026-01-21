import { Journal } from '../../../../src/domain/ledger/Journal';
import { JournalDraft, LedgerLineDraft } from '../../../../src/domain/ledger/LedgerTypes';

describe('Journal', () => {
  // Helper to create a valid ledger line draft
  const createDebitLine = (ledgerAccountId: string, amount: bigint): LedgerLineDraft => ({
    ledgerAccountId,
    accountId: 'account-1',
    debit: amount,
    credit: 0n,
    subtype: 'PRINCIPAL',
  });

  const createCreditLine = (ledgerAccountId: string, amount: bigint): LedgerLineDraft => ({
    ledgerAccountId,
    accountId: 'account-1',
    debit: 0n,
    credit: amount,
    subtype: 'PRINCIPAL',
  });

  describe('create', () => {
    it('should create a Journal with the given transaction ID, type, currency, and lines', () => {
      const lines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 1000n),
        createCreditLine('ledger-2', 1000n),
      ];

      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', lines);

      expect(journal.transactionId).toBe('tx-123');
      expect(journal.type).toBe('DEPOSIT');
      expect(journal.currency).toBe('USD');
      expect(journal.lines).toHaveLength(2);
    });

    it('should create a Journal with empty lines', () => {
      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', []);

      expect(journal.lines).toHaveLength(0);
    });
  });

  describe('fromDraft', () => {
    it('should create a Journal from a JournalDraft', () => {
      const draft: JournalDraft = {
        transactionId: 'tx-456',
        type: 'TRANSFER',
        currency: 'PHP',
        lines: [
          createDebitLine('ledger-a', 500n),
          createCreditLine('ledger-b', 500n),
        ],
      };

      const journal = Journal.fromDraft(draft);

      expect(journal.transactionId).toBe('tx-456');
      expect(journal.type).toBe('TRANSFER');
      expect(journal.currency).toBe('PHP');
      expect(journal.lines).toHaveLength(2);
    });
  });

  describe('totalDebits', () => {
    it('should return the sum of all debit amounts', () => {
      const lines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 1000n),
        createDebitLine('ledger-2', 500n),
        createCreditLine('ledger-3', 1500n),
      ];

      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', lines);

      expect(journal.totalDebits()).toBe(1500n);
    });

    it('should return 0n for empty lines', () => {
      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', []);

      expect(journal.totalDebits()).toBe(0n);
    });

    it('should return 0n when no debit lines exist', () => {
      const lines: LedgerLineDraft[] = [
        createCreditLine('ledger-1', 1000n),
      ];

      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', lines);

      expect(journal.totalDebits()).toBe(0n);
    });
  });

  describe('totalCredits', () => {
    it('should return the sum of all credit amounts', () => {
      const lines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 1500n),
        createCreditLine('ledger-2', 1000n),
        createCreditLine('ledger-3', 500n),
      ];

      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', lines);

      expect(journal.totalCredits()).toBe(1500n);
    });

    it('should return 0n for empty lines', () => {
      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', []);

      expect(journal.totalCredits()).toBe(0n);
    });

    it('should return 0n when no credit lines exist', () => {
      const lines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 1000n),
      ];

      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', lines);

      expect(journal.totalCredits()).toBe(0n);
    });
  });

  describe('isBalanced', () => {
    it('should return true when total debits equal total credits', () => {
      const lines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 1000n),
        createCreditLine('ledger-2', 1000n),
      ];

      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', lines);

      expect(journal.isBalanced()).toBe(true);
    });

    it('should return true for multiple balanced lines', () => {
      const lines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 500n),
        createDebitLine('ledger-2', 500n),
        createCreditLine('ledger-3', 700n),
        createCreditLine('ledger-4', 300n),
      ];

      const journal = Journal.create('tx-123', 'TRANSFER', 'USD', lines);

      expect(journal.isBalanced()).toBe(true);
    });

    it('should return false when total debits do not equal total credits', () => {
      const lines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 1000n),
        createCreditLine('ledger-2', 500n),
      ];

      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', lines);

      expect(journal.isBalanced()).toBe(false);
    });

    it('should return true for empty lines (0 == 0)', () => {
      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', []);

      expect(journal.isBalanced()).toBe(true);
    });
  });

  describe('getAffectedLedgerAccountIds', () => {
    it('should return unique ledger account IDs from all lines', () => {
      const lines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 500n),
        createDebitLine('ledger-1', 500n), // duplicate
        createCreditLine('ledger-2', 1000n),
      ];

      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', lines);
      const accountIds = journal.getAffectedLedgerAccountIds();

      expect(accountIds).toHaveLength(2);
      expect(accountIds).toContain('ledger-1');
      expect(accountIds).toContain('ledger-2');
    });

    it('should return empty array for empty lines', () => {
      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', []);

      expect(journal.getAffectedLedgerAccountIds()).toEqual([]);
    });

    it('should return single ID when all lines affect same account', () => {
      const lines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 500n),
        createCreditLine('ledger-1', 500n),
      ];

      const journal = Journal.create('tx-123', 'DEPOSIT', 'USD', lines);
      const accountIds = journal.getAffectedLedgerAccountIds();

      expect(accountIds).toHaveLength(1);
      expect(accountIds).toContain('ledger-1');
    });
  });

  describe('toDraft', () => {
    it('should convert Journal to JournalDraft interface', () => {
      const originalLines: LedgerLineDraft[] = [
        createDebitLine('ledger-1', 1000n),
        createCreditLine('ledger-2', 1000n),
      ];

      const journal = Journal.create('tx-789', 'WITHDRAW', 'PHP', originalLines);
      const draft = journal.toDraft();

      expect(draft.transactionId).toBe('tx-789');
      expect(draft.type).toBe('WITHDRAW');
      expect(draft.currency).toBe('PHP');
      expect(draft.lines).toHaveLength(2);
      expect(draft.lines[0].ledgerAccountId).toBe('ledger-1');
      expect(draft.lines[0].debit).toBe(1000n);
    });
  });
});
