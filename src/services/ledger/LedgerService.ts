import { QueryRunner } from 'typeorm';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';

/**
 * Ledger service interface (port).
 * Responsible for posting journal entries to the ledger.
 */
export interface LedgerService {
  /**
   * Posts a journal to the ledger.
   * - Validates journal entries (balanced, valid lines)
   * - Allocates sequences per ledger account
   * - Persists immutable ledger lines
   *
   * @param journal - The journal draft to post
   * @param queryRunner - TypeORM QueryRunner for transaction context
   * @returns Persisted ledger lines with sequences
   */
  post(journal: JournalDraft, queryRunner: QueryRunner): Promise<LedgerLine[]>;

  getLatestLedgerLine(ledgerAccountId: string, queryRunner: QueryRunner): Promise<LedgerLine | null>;
}
