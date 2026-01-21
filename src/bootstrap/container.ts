import { DataSource } from 'typeorm';

// Domain
import { LedgerRulesImpl } from '../domain/ledger/LedgerRulesImpl';
import { BalanceRulesImpl } from '../domain/balance/BalanceRulesImpl';

// Services
import { LedgerServiceImpl } from '../services/ledger/LedgerServiceImpl';
import { BalanceServiceImpl } from '../services/balance/BalanceServiceImpl';

// Infrastructure
import { TypeOrmTransactionStore } from '../stores/transaction/TypeOrmTransactionStore';
import { TypeOrmLedgerLineStore } from '../stores/ledger/TypeOrmLedgerLineStore';
import { TypeOrmSequencer } from '../stores/ledger/TypeOrmSequencer';
import { TypeOrmBalanceStore } from '../stores/balance/TypeOrmBalanceStore';
import { TypeOrmAccountStore } from '../stores/account/TypeOrmAccountStore';
import { TypeOrmLedgerAccountStore } from '../stores/account/TypeOrmLedgerAccountStore';

// Application
import { DepositTransaction } from '../app/transaction/DepositTransaction';
import { WithdrawTransaction } from '../app/transaction/WithdrawTransaction';
import { TransferTransaction } from '../app/transaction/TransferTransaction';
import { TransactionService } from '../app/transaction/TransactionService';
import { AccountService, AccountServiceImpl } from '../services/account';

/**
 * Dependency injection container.
 */
export interface Container {
  accountService: AccountService;
  transactionService: TransactionService;
  dataSource: DataSource;
}

/**
 * Creates and wires up all dependencies.
 * Spring-like configuration for assembling components.
 */
export async function createContainer(dataSource: DataSource): Promise<Container> {
  // 1. Create rule implementations (domain layer)
  const ledgerRules = new LedgerRulesImpl();
  const balanceRules = new BalanceRulesImpl();

  // 2. Create store implementations (infrastructure layer)
  const transactionStore = new TypeOrmTransactionStore();
  const ledgerLineStore = new TypeOrmLedgerLineStore();
  const sequencer = new TypeOrmSequencer();
  const balanceStore = new TypeOrmBalanceStore();
  const accountStore = new TypeOrmAccountStore();
  const ledgerAccountStore = new TypeOrmLedgerAccountStore();

  // 3. Create service implementations (services layer)
  const ledgerService = new LedgerServiceImpl(ledgerRules, ledgerLineStore, sequencer);
  const balanceService = new BalanceServiceImpl(balanceRules, balanceStore);

  // 4. Create transaction use-cases (application layer)
  const depositTransaction = new DepositTransaction(
    transactionStore,
    ledgerService,
    balanceService,
    dataSource
  );
  const withdrawTransaction = new WithdrawTransaction(
    transactionStore,
    ledgerService,
    balanceService,
    dataSource
  );
  const transferTransaction = new TransferTransaction(
    transactionStore,
    ledgerService,
    balanceService,
    dataSource
  );

  // 5. Create facades
  const transactionService = new TransactionService(
    depositTransaction,
    withdrawTransaction,
    transferTransaction
  );

  const accountService = new AccountServiceImpl(
    accountStore,
    ledgerAccountStore,
    balanceStore,
    dataSource
  );

  return {
    accountService,
    transactionService,
    dataSource,
  };
}
