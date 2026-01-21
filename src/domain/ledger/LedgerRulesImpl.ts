import { LedgerRules } from './LedgerRules';
import { LedgerLineDraft } from './LedgerTypes';
import {
  InvalidLedgerLineError,
  UnbalancedJournalError,
} from '../common/DomainErrors';

/**
 * Implementation of ledger validation rules.
 */
export class LedgerRulesImpl implements LedgerRules {
  assertBalanced(lines: LedgerLineDraft[]): void {
    let debitTotal = 0n;
    let creditTotal = 0n;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      debitTotal += line.debit;
      creditTotal += line.credit;
    }

    if (debitTotal !== creditTotal) {
      throw new UnbalancedJournalError();
    }
  }

  // Validates that each ledger line is valid according to double-entry rules
  // - Exactly one of debit or credit must be non-zero
  // - Amounts must be non-negative
  assertValidLines(lines: LedgerLineDraft[]): void {
    for (let i = 0; i < lines.length; i += 1) {
      const { debit, credit } = lines[i];

      if (debit < 0n || credit < 0n) {
        throw new InvalidLedgerLineError();
      }

      const hasDebit = debit !== 0n;
      const hasCredit = credit !== 0n;

      if (hasDebit === hasCredit) {
        throw new InvalidLedgerLineError();
      }
    }
  }
}
