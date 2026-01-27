import { UUID } from '../../domain/common/Types';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';
import { TransactionHeader } from '../../services/transaction/TransactionStore';

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

  private feesPercentage: number = 0.01; // assuming 1% fee per trx

  private feesEnabled: boolean = false;

  protected setFeesEnabled(enabled: boolean) {
    this.feesEnabled = enabled;
  }

  protected calculateFees(amount: bigint): bigint {
    const fee = Number(amount) * this.feesPercentage;
    return BigInt(Math.floor(fee));
  }

  /**
   * Template method defining the transaction execution pipeline.
   */
  async execute(input: I): Promise<TxResult> {
    await this.validate(input);
    const transactionHeader = await this.createTransactionHeader(input);
    const journal = await this.buildJournal(transactionHeader.id, input);
    const ledgerLines = await this.postLedger(journal);
    await this.updateBalances(ledgerLines);

    /**
     * This only applies if transaction set fees enabled
     */
    if (this.feesEnabled) {
      const transactionFeeHeader = await this.createFeeTransactionHeader(transactionHeader);
      const journalFee = await this.buildJournalForFees(ledgerLines, transactionFeeHeader);
      const feeLedgerLines = await this.postLedger(journalFee);
      await this.updateBalances(feeLedgerLines, true);
    }
    /**
     * This only applies if transaction set fees enabled
     */
    
    return { transactionId: transactionHeader.id };
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
  protected abstract createTransactionHeader(input: I): Promise<TransactionHeader>;

  /**
   * 
   * Creates transaction header for fee
   */
  protected abstract createFeeTransactionHeader(transactionHeader: TransactionHeader): Promise<TransactionHeader>;

  /**
   * Builds the journal draft from the transaction ID and input.
   */
  protected abstract buildJournal(txId: UUID, input: I): Promise<JournalDraft>;

  /**
   * Builds journal draft for fees
   */
  protected abstract buildJournalForFees(transactionLedgerLines: LedgerLine[], transactionFeeHeader: TransactionHeader): Promise<JournalDraft>;

  // ===== Shared components (injected) =====

  /**
   * Posts ledger lines from the journal.
   */
  protected abstract postLedger(journal: JournalDraft): Promise<LedgerLine[]>;

  /**
   * Updates balances from the ledger lines.
   */
  protected abstract updateBalances(ledgerLines: LedgerLine[], isDebit?: boolean): Promise<void>;
}
