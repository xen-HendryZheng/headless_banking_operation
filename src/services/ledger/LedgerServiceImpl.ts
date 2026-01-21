import { QueryRunner } from 'typeorm';
import { LedgerService } from './LedgerService';
import { LedgerLineStore } from './LedgerLineStore';
import { Sequencer } from './Sequencer';
import { LedgerRules } from '../../domain/ledger/LedgerRules';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';

/**
 * Implementation of the ledger service.
 */
export class LedgerServiceImpl implements LedgerService {
  constructor(
    private readonly ledgerRules: LedgerRules,
    private readonly ledgerLineStore: LedgerLineStore,
    private readonly sequencer: Sequencer
  ) {}

  async post(journal: JournalDraft, queryRunner: QueryRunner): Promise<LedgerLine[]> {
    this.ledgerRules.assertBalanced(journal.lines);
    this.ledgerRules.assertValidLines(journal.lines);

    if (journal.lines.length === 0) {
      return [];
    }

    // This is where balance locking would occur and should be done prior to sequence allocation
    const sequences = await Promise.all(
      journal.lines.map((line) =>
        this.sequencer.getNextSequence(line.ledgerAccountId, queryRunner)
      )
    );

    const inserts = journal.lines.map((line, index) => ({
      transactionId: journal.transactionId,
      ledgerAccountId: line.ledgerAccountId,
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      amount: line.debit !== 0n ? line.debit : line.credit,
      sequence: sequences[index],
    }));

    return this.ledgerLineStore.insert(inserts, queryRunner);
  }

  async getLatestLedgerLine(ledgerAccountId: string, queryRunner: QueryRunner): Promise<LedgerLine | null> {
    return this.ledgerLineStore.getLatestLedgerLine(ledgerAccountId, queryRunner);
  }
}
