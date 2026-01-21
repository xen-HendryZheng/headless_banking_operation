import { UUID } from '../../domain/common/Types';
import { JournalDraft } from '../../domain/ledger/LedgerTypes';

// ===== Common contracts =====

export interface Executable<I, O> {
  execute(input: I): Promise<O>;
}

export interface Component {
  name(): string;
}

// ===== Output =====

export interface TxResult {
  transactionId: UUID;
}

/**
 * Abstract base class implementing Template Method Pattern for transactions.
 * Defines the canonical execution pipeline for all transaction types.
 */
export abstract class BaseTransactionCore<I>
  implements Component, Executable<I, TxResult>
{
  abstract name(): string;

  /**
   * Template method defining the transaction execution pipeline.
   */
  async execute(input: I): Promise<TxResult> {
    await this.validate(input);
    const txId = await this.createTransactionHeader(input);
    const journal = await this.buildJournal(txId, input);
    await this.postLedger(journal);
    await this.updateBalances(journal);
    return { transactionId: txId };
  }

  // ===== Abstract hooks for subclasses =====

  /**
   * Validates the input. Throws on invalid input.
   * Public to allow pre-validation before execute.
   */
  abstract validate(input: I): Promise<void>;

  /**
   * Creates the transaction header and returns the transaction ID.
   */
  protected abstract createTransactionHeader(input: I): Promise<UUID>;

  /**
   * Builds the journal draft from the transaction ID and input.
   */
  protected abstract buildJournal(txId: UUID, input: I): Promise<JournalDraft>;

  // ===== Shared components (injected) =====

  /**
   * Posts ledger lines from the journal.
   */
  protected abstract postLedger(journal: JournalDraft): Promise<void>;

  /**
   * Updates balances from the journal.
   */
  protected abstract updateBalances(journal: JournalDraft): Promise<void>;
}
