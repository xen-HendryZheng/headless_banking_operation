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
      if (line.isDebit) {
        debitTotal += line.amount;
      } else {
        creditTotal += line.amount;
      }
    }

    if (debitTotal !== creditTotal) {
      throw new UnbalancedJournalError();
    }
  }

  // Validates that each ledger line has non-negative amounts
  // With cumulative tracking, both debit and credit can be positive
  assertValidLines(lines: LedgerLineDraft[]): void {
    for (let i = 0; i < lines.length; i += 1) {
      const { debit, credit } = lines[i];

      // Amounts must be non-negative
      if (debit < 0n || credit < 0n) {
        throw new InvalidLedgerLineError();
      }

      // At least one of debit or credit must be positive
      if (debit === 0n && credit === 0n) {
        throw new InvalidLedgerLineError();
      }
    }
  }
}
