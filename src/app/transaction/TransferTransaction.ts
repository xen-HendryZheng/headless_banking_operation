import { DataSource, QueryRunner } from 'typeorm';
import { BaseTransactionCore, TxResult } from './BaseTransactionCore';
import { UUID, Currency } from '../../domain/common/Types';
import { JournalDraft, LedgerLine } from '../../domain/ledger/LedgerTypes';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';
import { CreateTransactionInput, TransactionHeader, TransactionStore } from '../../services/transaction/TransactionStore';
import { InvalidTransactionError, InsufficientBalanceError } from '../../domain/common/DomainErrors';
import { LedgerAccountType, TransactionType } from '../../stores/entities/enums';
import { LedgerAccountStore } from '../../services/account/LedgerAccountStore';

/**
 * Input for transfer transaction.
 */
export interface TransferInput {
  /** Sender's account ID */
  senderAccountId: UUID;
  /** Receiver's account ID */
  receiverAccountId: UUID;
  /** Amount and currency */
  amount: bigint;
  currency: Currency;
  /** Optional reference */
  reference?: string;
  /** Optional description */
  description?: string;
}

/**
 * Internal resolved ledger accounts for transfer.
 */
interface ResolvedTransferAccounts {
  senderLedgerAccountId: UUID;
  receiverLedgerAccountId: UUID;
  bankRevenueLedgerAccountId: UUID;
}

/**
 * Internal transfer transaction use-case.
 *
 * Ledger posting pattern:
 *   SENDER (USER_A)    DEBIT
 *   RECEIVER (USER_B)  CREDIT
 *
 * Note: Bank liability is NOT touched for internal transfers.
 */
export class TransferTransaction extends BaseTransactionCore<TransferInput> {
  private queryRunner!: QueryRunner;
  private resolvedAccounts!: ResolvedTransferAccounts;

  constructor(
    private readonly transactionStore: TransactionStore,
    private readonly ledgerService: LedgerService,
    private readonly balanceService: BalanceService,
    private readonly ledgerAccountStore: LedgerAccountStore,
    private readonly dataSource: DataSource
  ) {
    super();
    this.queryRunner = this.dataSource.createQueryRunner();
  }

  name(): string {
    return 'TransferTransaction';
  }

  /**
   * Override execute to manage database transaction lifecycle.
   */
  async execute(input: TransferInput): Promise<TxResult> {
    await this.queryRunner.connect();
    await this.queryRunner.startTransaction();

    try {
      // Resolve ledger accounts before executing the transaction
      this.resolvedAccounts = await this.resolveLedgerAccounts(input);

      const result = await super.execute(input);
      await this.queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await this.queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await this.queryRunner.release();
    }
  }

  /**
   * Resolves ledger accounts for both sender and receiver.
   */
  private async resolveLedgerAccounts(input: TransferInput): Promise<ResolvedTransferAccounts> {
    const senderCash = await this.ledgerAccountStore.findByAccountIdAndType(
      input.senderAccountId,
      LedgerAccountType.USER_CASH,
      this.queryRunner
    );
    const receiverCash = await this.ledgerAccountStore.findByAccountIdAndType(
      input.receiverAccountId,
      LedgerAccountType.USER_CASH,
      this.queryRunner
    );
    const bankRevenueLedgerAccountId = await this.ledgerAccountStore.findByAccountIdAndType(
      input.receiverAccountId,
      LedgerAccountType.FIRSTCIRCLE_REVENUE,
      this.queryRunner
    );

    if (!senderCash) {
      throw new InvalidTransactionError('Sender ledger account not found');
    }
    if (!receiverCash) {
      throw new InvalidTransactionError('Receiver ledger account not found');
    }
    if (!bankRevenueLedgerAccountId) {
      throw new InvalidTransactionError('Invalid account setup');
    }

    return {
      senderLedgerAccountId: senderCash.id,
      receiverLedgerAccountId: receiverCash.id,
      bankRevenueLedgerAccountId: bankRevenueLedgerAccountId.id
    };
  }

  async validate(input: TransferInput): Promise<void> {
    if (input.amount <= 0n) {
      throw new InvalidTransactionError('Amount must be greater than zero');
    }

    if (!input.senderAccountId || input.senderAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid sender account');
    }

    if (!input.receiverAccountId || input.receiverAccountId.trim().length === 0) {
      throw new InvalidTransactionError('Invalid receiver account');
    }

    // Lock BOTH accounts in sorted order upfront to prevent deadlocks
    const { senderLedgerAccountId, receiverLedgerAccountId } = this.resolvedAccounts;
    const sortedIds = [senderLedgerAccountId, receiverLedgerAccountId].sort();
    const balances = await this.balanceService.getBalances(sortedIds, this.queryRunner);

    // Find sender's balance from the locked balances
    const senderBalance = balances.find(b => b.ledgerAccountId === senderLedgerAccountId);
    const availableAmount = senderBalance?.balanceAmount ?? 0n;
    if (availableAmount < input.amount) {
      throw new InsufficientBalanceError('Insufficient funds for transfer');
    }
  }

  protected async createTransactionHeader(input: TransferInput): Promise<TransactionHeader> {
    const transactionInput: CreateTransactionInput = {
      accountId: input.senderAccountId,
      type: TransactionType.TRANSFER,
      ledgerAccountId: this.resolvedAccounts.senderLedgerAccountId,
      counterpartyLedgerAccountId: this.resolvedAccounts.receiverLedgerAccountId,
      isCredit: false, // user's perspective - withdrawing funds
      amount: input.amount,
      currency: input.currency,
      reference: input.reference || '',
      description: input.description
    };

    const header = await this.transactionStore.createHeader(transactionInput, this.queryRunner);
    return header;
  }

  protected async buildJournal(txId: UUID, input: TransferInput): Promise<JournalDraft> {
    const { senderLedgerAccountId, receiverLedgerAccountId } = this.resolvedAccounts;

    const [latestSenderLine, latestReceiverLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(senderLedgerAccountId, this.queryRunner),
      this.ledgerService.getLatestLedgerLine(receiverLedgerAccountId, this.queryRunner)
    ]);

    return {
      transactionId: txId,
      type: TransactionType.TRANSFER,
      currency: input.currency,
      lines: [
        {
          ledgerAccountId: senderLedgerAccountId,
          accountId: input.senderAccountId,
          debit: (latestSenderLine?.debit ?? 0n) + input.amount,
          credit: latestSenderLine?.credit ?? 0n,
          amount: input.amount,
          isDebit: true,
        },
        {
          ledgerAccountId: receiverLedgerAccountId,
          accountId: input.receiverAccountId,
          debit: latestReceiverLine?.debit ?? 0n,
          credit: (latestReceiverLine?.credit ?? 0n) + input.amount,
          amount: input.amount,
          isDebit: false,
        },
      ]
    };
  }

  protected async buildJournalForFees(transactionLedgerLines: LedgerLine[], transactionHeader: TransactionHeader): Promise<JournalDraft> {
    const { receiverLedgerAccountId, bankRevenueLedgerAccountId } = this.resolvedAccounts;
    const [latestBankRevenueLine, latestUserCashLine] = await Promise.all([
      this.ledgerService.getLatestLedgerLine(bankRevenueLedgerAccountId, this.queryRunner),
      transactionLedgerLines.find( line => line.ledgerAccountId === receiverLedgerAccountId)
    ]);
    const feeAmount = this.calculateFees(transactionHeader.amount);

    return {
      transactionId: transactionHeader.id,
      type: TransactionType.FEE,
      currency: transactionHeader.currency,
      lines: [
        {
          ledgerAccountId: bankRevenueLedgerAccountId,
          accountId: transactionHeader.accountId,
          debit: latestBankRevenueLine?.debit ?? 0n,
          credit: (latestBankRevenueLine?.credit ?? 0n) + feeAmount,
          amount: feeAmount,
          description: `Fee for transaction ${transactionHeader.id}`,
          isDebit: false,
        },
        {
          ledgerAccountId: receiverLedgerAccountId,
          accountId: transactionHeader.accountId,
          debit: (latestUserCashLine?.debit ?? 0n) + feeAmount,
          credit: latestUserCashLine?.credit ?? 0n,
          description: `Fee for transaction ${transactionHeader.id}`,
          amount: feeAmount,
          isDebit: true,
        },
      ],
    };
  }

  protected async postLedger(journal: JournalDraft): Promise<LedgerLine[]> {
    const ledgerLines = await this.ledgerService.post(journal, this.queryRunner);
    return ledgerLines;
  }

  protected async updateBalances(ledgerLines: LedgerLine[]): Promise<void> {
    // Sender (index 0) gets -amount, Receiver (index 1) gets +amount
    const senderLine = ledgerLines[0];
    const receiverLine = ledgerLines[1];

    const deltas = [
      {
        ledgerAccountId: senderLine.ledgerAccountId,
        delta: -senderLine.amount, // Negative delta for sender
        newSequence: senderLine.sequence,
      },
      {
        ledgerAccountId: receiverLine.ledgerAccountId,
        delta: receiverLine.amount, // Positive delta for receiver
        newSequence: receiverLine.sequence,
      },
    ];

    // Apply balance updates
    await this.balanceService.apply(deltas, this.queryRunner);
  }
}
