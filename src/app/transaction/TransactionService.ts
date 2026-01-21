import { DataSource } from 'typeorm';
import { DepositTransaction, DepositInput } from './DepositTransaction';
import { WithdrawTransaction, WithdrawInput } from './WithdrawTransaction';
import { TransferTransaction, TransferInput } from './TransferTransaction';
import { TxResult, Component } from './BaseTransactionCore';
import { TransactionStore } from '../../services/transaction/TransactionStore';
import { LedgerService } from '../../services/ledger/LedgerService';
import { BalanceService } from '../../services/balance/BalanceService';

/**
 * Transaction service facade.
 * Exposes deposit, withdraw, and transfer operations.
 * Creates new transaction instances per call to support concurrency.
 */
export class TransactionService implements Component {
  constructor(
    private readonly transactionStore: TransactionStore,
    private readonly ledgerService: LedgerService,
    private readonly balanceService: BalanceService,
    private readonly dataSource: DataSource
  ) {}

  name(): string {
    return 'TransactionService';
  }

  /**
   * Process a deposit transaction.
   */
  async deposit(input: DepositInput): Promise<TxResult> {
    const tx = new DepositTransaction(
      this.transactionStore,
      this.ledgerService,
      this.balanceService,
      this.dataSource
    );
    return tx.execute(input);
  }

  /**
   * Process a withdrawal transaction.
   */
  async withdraw(input: WithdrawInput): Promise<TxResult> {
    const tx = new WithdrawTransaction(
      this.transactionStore,
      this.ledgerService,
      this.balanceService,
      this.dataSource
    );
    return tx.execute(input);
  }

  /**
   * Process an internal transfer transaction.
   */
  async transfer(input: TransferInput): Promise<TxResult> {
    const tx = new TransferTransaction(
      this.transactionStore,
      this.ledgerService,
      this.balanceService,
      this.dataSource
    );
    return tx.execute(input);
  }
}
