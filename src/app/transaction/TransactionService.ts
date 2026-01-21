import { DepositTransaction, DepositInput } from './DepositTransaction';
import { WithdrawTransaction, WithdrawInput } from './WithdrawTransaction';
import { TransferTransaction, TransferInput } from './TransferTransaction';
import { TxResult, Component } from './BaseTransactionCore';

/**
 * Transaction service facade.
 * Exposes deposit, withdraw, and transfer operations.
 */
export class TransactionService implements Component {
  constructor(
    private readonly depositTransaction: DepositTransaction,
    private readonly withdrawTransaction: WithdrawTransaction,
    private readonly transferTransaction: TransferTransaction
  ) {}

  name(): string {
    return 'TransactionService';
  }

  /**
   * Process a deposit transaction.
   */
  async deposit(input: DepositInput): Promise<TxResult> {
    return this.depositTransaction.execute(input);
  }

  /**
   * Process a withdrawal transaction.
   */
  async withdraw(input: WithdrawInput): Promise<TxResult> {
    return this.withdrawTransaction.execute(input);
  }

  /**
   * Process an internal transfer transaction.
   */
  async transfer(input: TransferInput): Promise<TxResult> {
    return this.transferTransaction.execute(input);
  }
}
