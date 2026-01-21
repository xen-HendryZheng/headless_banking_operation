import { DataSource } from 'typeorm';
import { BaseTransactionCore } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { CreateTransactionInput, TransactionStore } from '../../services/transaction/TransactionStore';
import { InvalidTransactionError } from '../../domain/common/DomainErrors';
import { TransactionType } from 'stores';

/**
 * Input for deposit transaction.
 */
export interface DepositInput {
  /** User's ledger account ID (receiving the deposit) */
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
 * Deposit transaction use-case.
 *
 * Ledger posting pattern:
 *   FIRSTCIRCLE_LIABILITY  DEBIT
 *   USER_CASH              CREDIT
 */
export class DepositTransaction extends BaseTransactionCore<DepositInput> {
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
    return 'DepositTransaction';
  }

  private readonly queryRunner;

  validate(input: DepositInput): Promise<void> {
    if (input.amount <= 0n) {
      throw new InvalidTransactionError('Amount must be greater than zero');
    }

    if (!input.userLedgerAccountId || input.userLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid user ledger account');
    }

    if (!input.bankLiabilityLedgerAccountId || input.bankLiabilityLedgerAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid bank liability ledger account');
    }

    return Promise.resolve();
  }

  protected async createTransactionHeader(input: DepositInput): Promise<UUID> {
    const transactionInput: CreateTransactionInput = {
      accountId: input.userAccountId,
      type: TransactionType.DEPOSIT,
      ledgerAccountId: input.userLedgerAccountId,
      counterpartyLedgerAccountId: null,
      isCredit: true, // user's perspective - receiving funds
      amount: input.amount,
      currency: input.currency,
      reference: input.reference || '',
      description: input.description
    };

    const header =  await this.transactionStore.createHeader(transactionInput, this.queryRunner);
    return header.id;
  }

  protected async buildJournal(txId: UUID, input: DepositInput): Promise<JournalDraft> {
    const [latestBankLiabilityLine, latestUserCashLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(input.bankLiabilityLedgerAccountId, this.queryRunner),
      this.ledgerService.getLatestLedgerLine(input.userLedgerAccountId, this.queryRunner)
    ]);
    return {
      transactionId: txId,
      type: TransactionType.DEPOSIT,
      currency: input.currency,
      lines: [
        {
          ledgerAccountId: input.bankLiabilityLedgerAccountId,
          accountId: input.userAccountId,
          debit: latestBankLiabilityLine ? latestBankLiabilityLine.debit + input.amount : input.amount,
          credit: latestBankLiabilityLine ? latestBankLiabilityLine.credit : 0n,
        },
        {
          ledgerAccountId: input.userLedgerAccountId,
          accountId: input.userAccountId,
          debit: latestUserCashLine ? latestUserCashLine.debit : 0n,
          credit: latestUserCashLine ? latestUserCashLine.credit + input.amount : input.amount,
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
