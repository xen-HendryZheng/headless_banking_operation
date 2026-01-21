import { DataSource } from 'typeorm';
import { BaseTransactionCore } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { CreateTransactionInput, TransactionStore } from '../../services/transaction/TransactionStore';
import { InvalidTransactionError } from '@domain/common';
import { TransactionType } from 'stores';

/**
 * Input for withdrawal transaction.
 */
export interface WithdrawInput {
  /** User's ledger account ID (withdrawing from) */
  userLedgerAccountId: UUID;
  /** User's account ID (denormalized owner reference) */
  userAccountId: UUID;
  /** Bank liability ledger account ID (FIRSTCIRCLE_BUSINESS_LIABILITY) */
  bankLiabilityLedgerAccountId: UUID;
  /** Amount and currency */
  amount: bigint;
  currency: Currency;
  /** Optional */
  reference?: string;
  /** Optional description */
  description?: string;
}

/**
 * Withdrawal transaction use-case.
 *
 * Ledger posting pattern:
 *   USER_CASH              DEBIT
 *   FIRSTCIRCLE_LIABILITY  CREDIT
 */
export class WithdrawTransaction extends BaseTransactionCore<WithdrawInput> {
  constructor(
    private readonly transactionStore: TransactionStore,
    private readonly ledgerService: LedgerService,
    private readonly balanceService: BalanceService,
    private readonly dataSource: DataSource
  ) {
    super();
    this.queryRunner = this.dataSource.createQueryRunner();
  }

  name(): string {
    return 'WithdrawTransaction';
  }

  private readonly queryRunner;

  validate(input: WithdrawInput): Promise<void> {
    if (input.amount <= 0n) {
      throw new Error('Amount must be greater than zero');
    }

    if (!input.userLedgerAccountId || input.userLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid user ledger account');
    }

    if (!input.bankLiabilityLedgerAccountId || input.bankLiabilityLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid bank liability ledger account');
    }

    return Promise.resolve();
  }

  protected async createTransactionHeader(input: WithdrawInput): Promise<UUID> {
    const transactionInput: CreateTransactionInput = {
      accountId: input.userAccountId,
      type: TransactionType.WITHDRAW,
      ledgerAccountId: input.userLedgerAccountId,
      counterpartyLedgerAccountId: null,
      isCredit: false, // user's perspective - withdrawing funds
      amount: input.amount,
      currency: input.currency,
      reference: input.reference || '',
      description: input.description
    };

    const header = await this.transactionStore.createHeader(transactionInput, this.queryRunner);
    return header.id;

  }

  protected async buildJournal(txId: UUID, input: WithdrawInput): Promise<JournalDraft> {
    const [latestBankLiabilityLine, latestUserCashLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(input.bankLiabilityLedgerAccountId, this.queryRunner),
      this.ledgerService.getLatestLedgerLine(input.userLedgerAccountId, this.queryRunner)
    ]);
    return {
      transactionId: txId,
      type: TransactionType.WITHDRAW,
      currency: input.currency,
      lines: [
        {
          ledgerAccountId: input.bankLiabilityLedgerAccountId,
          accountId: input.userAccountId,
          debit: latestBankLiabilityLine ? latestBankLiabilityLine.debit : 0n,
          credit: latestBankLiabilityLine ? latestBankLiabilityLine.credit + input.amount : input.amount,
        },
        {
          ledgerAccountId: input.userLedgerAccountId,
          accountId: input.userAccountId,
          debit: latestUserCashLine ? latestUserCashLine.debit + input.amount : input.amount,
          credit: latestUserCashLine ? latestUserCashLine.credit : 0n,
        },
      ],
    };
  }

  protected async postLedger(journal: JournalDraft): Promise<LedgerLine[]> {
    const ledgerLines = await this.ledgerService.post(journal, this.queryRunner);
    return ledgerLines;
  }

  protected async updateBalances(ledgerLines: LedgerLine[]): Promise<void> {
    const balanceDelta = ledgerLines.map((line) => {
      const delta = line.credit - line.debit;
      return {
        ledgerAccountId: line.ledgerAccountId,
        delta,
        newSequence: line.sequence,
      };
    });

    await this.balanceService.apply(balanceDelta, this.queryRunner);
  }
}
