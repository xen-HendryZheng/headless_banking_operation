import { LedgerRulesImpl } from '../../../../src/domain/ledger/LedgerRulesImpl';
import { LedgerLineDraft } from '../../../../src/domain/ledger/LedgerTypes';
import {
  UnbalancedJournalError,
  InvalidLedgerLineError,
} from '../../../../src/domain/common/DomainErrors';

describe('LedgerRulesImpl', () => {
  let ledgerRules: LedgerRulesImpl;

  beforeEach(() => {
    ledgerRules = new LedgerRulesImpl();
  });

  // Helper to create ledger line drafts
  const createLine = (
    debit: bigint,
    credit: bigint,
    ledgerAccountId = 'ledger-1'
  ): LedgerLineDraft => ({
    ledgerAccountId,
    accountId: 'account-1',
    debit,
    credit,
  });

  describe('assertBalanced', () => {
    it('should not throw when total debits equal total credits', () => {
      const lines: LedgerLineDraft[] = [
        createLine(1000n, 0n, 'ledger-1'),
        createLine(0n, 1000n, 'ledger-2'),
      ];

      expect(() => ledgerRules.assertBalanced(lines)).not.toThrow();
    });

    it('should not throw for multiple lines that balance', () => {
      const lines: LedgerLineDraft[] = [
        createLine(500n, 0n, 'ledger-1'),
        createLine(500n, 0n, 'ledger-2'),
        createLine(0n, 700n, 'ledger-3'),
        createLine(0n, 300n, 'ledger-4'),
      ];

      expect(() => ledgerRules.assertBalanced(lines)).not.toThrow();
    });

    it('should throw UnbalancedJournalError when debits exceed credits', () => {
      const lines: LedgerLineDraft[] = [
        createLine(1000n, 0n, 'ledger-1'),
        createLine(0n, 500n, 'ledger-2'),
      ];

      expect(() => ledgerRules.assertBalanced(lines)).toThrow(UnbalancedJournalError);
    });

    it('should throw UnbalancedJournalError when credits exceed debits', () => {
      const lines: LedgerLineDraft[] = [
        createLine(500n, 0n, 'ledger-1'),
        createLine(0n, 1000n, 'ledger-2'),
      ];

      expect(() => ledgerRules.assertBalanced(lines)).toThrow(UnbalancedJournalError);
    });

    it('should not throw for empty lines array (0 == 0)', () => {
      expect(() => ledgerRules.assertBalanced([])).not.toThrow();
    });

    it('should handle large amounts correctly', () => {
      const largeAmount = 999999999999999n;
      const lines: LedgerLineDraft[] = [
        createLine(largeAmount, 0n, 'ledger-1'),
        createLine(0n, largeAmount, 'ledger-2'),
      ];

      expect(() => ledgerRules.assertBalanced(lines)).not.toThrow();
    });
  });

  describe('assertValidLines', () => {
    it('should not throw for valid lines with only debit', () => {
      const lines: LedgerLineDraft[] = [
        createLine(1000n, 0n, 'ledger-1'),
      ];

      expect(() => ledgerRules.assertValidLines(lines)).not.toThrow();
    });

    it('should not throw for valid lines with only credit', () => {
      const lines: LedgerLineDraft[] = [
        createLine(0n, 1000n, 'ledger-1'),
      ];

      expect(() => ledgerRules.assertValidLines(lines)).not.toThrow();
    });

    it('should not throw for multiple valid lines', () => {
      const lines: LedgerLineDraft[] = [
        createLine(1000n, 0n, 'ledger-1'),
        createLine(0n, 500n, 'ledger-2'),
        createLine(0n, 500n, 'ledger-3'),
      ];

      expect(() => ledgerRules.assertValidLines(lines)).not.toThrow();
    });

    it('should throw InvalidLedgerLineError when both debit and credit are non-zero', () => {
      const lines: LedgerLineDraft[] = [
        createLine(1000n, 500n, 'ledger-1'), // Invalid: both non-zero
      ];

      expect(() => ledgerRules.assertValidLines(lines)).toThrow(InvalidLedgerLineError);
    });

    it('should throw InvalidLedgerLineError when both debit and credit are zero', () => {
      const lines: LedgerLineDraft[] = [
        createLine(0n, 0n, 'ledger-1'), // Invalid: both zero
      ];

      expect(() => ledgerRules.assertValidLines(lines)).toThrow(InvalidLedgerLineError);
    });

    it('should throw InvalidLedgerLineError for negative debit', () => {
      const lines: LedgerLineDraft[] = [
        createLine(-100n, 0n, 'ledger-1'),
      ];

      expect(() => ledgerRules.assertValidLines(lines)).toThrow(InvalidLedgerLineError);
    });

    it('should throw InvalidLedgerLineError for negative credit', () => {
      const lines: LedgerLineDraft[] = [
        createLine(0n, -100n, 'ledger-1'),
      ];

      expect(() => ledgerRules.assertValidLines(lines)).toThrow(InvalidLedgerLineError);
    });

    it('should not throw for empty lines array', () => {
      expect(() => ledgerRules.assertValidLines([])).not.toThrow();
    });

    it('should detect invalid line among valid lines', () => {
      const lines: LedgerLineDraft[] = [
        createLine(1000n, 0n, 'ledger-1'), // Valid
        createLine(500n, 500n, 'ledger-2'), // Invalid
        createLine(0n, 1000n, 'ledger-3'), // Valid
      ];

      expect(() => ledgerRules.assertValidLines(lines)).toThrow(InvalidLedgerLineError);
    });
  });
});
