import { UUID, TxType, Currency } from '../common/Types';
import { LedgerLineDraft, JournalDraft } from './LedgerTypes';

/**
 * Journal aggregate for grouping ledger line drafts.
 */
export class Journal {
  private constructor(
    public readonly transactionId: UUID,
    public readonly type: TxType,
    public readonly currency: Currency,
    public readonly lines: ReadonlyArray<LedgerLineDraft>
  ) {}

  /**
   * Factory method to create a Journal.
   */
  static create(
    transactionId: UUID,
    type: TxType,
    currency: Currency,
    lines: LedgerLineDraft[]
  ): Journal {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  /**
   * Create Journal from JournalDraft.
   */
  static fromDraft(draft: JournalDraft): Journal {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  /**
   * Returns total debits across all lines.
   */
  totalDebits(): bigint {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  /**
   * Returns total credits across all lines.
   */
  totalCredits(): bigint {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  /**
   * Checks if journal is balanced (debits == credits).
   */
  isBalanced(): boolean {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  /**
   * Returns unique ledger account IDs affected by this journal.
   */
  getAffectedLedgerAccountIds(): UUID[] {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  /**
   * Converts to JournalDraft interface.
   */
  toDraft(): JournalDraft {
    // TODO: Implement
    throw new Error('Not implemented');
  }
}
