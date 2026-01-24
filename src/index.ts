import 'reflect-metadata';
import { AppDataSource } from './stores/data-source';
import { createContainer, Container } from './bootstrap/container';
import { formatCents } from './domain/common/Currency';

/**
 * Application entry point.
 * Initializes database connection and creates the dependency container.
 */
async function main(): Promise<Container> {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log('Database connection established');

    // Create dependency container
    const container = await createContainer(AppDataSource);
    console.log('Container initialized');

    /**
     * Apply use cases
     */

    // Create accounts, ledger accounts, etc. as needed
    const aUser = await container.accountService.createUserAccount({
      name: 'a_' + Math.random().toString(36).substring(2, 15),
      identifier: Math.random().toString(36).substring(2, 15),
      currency: 'USD',
    });

    const bUser = await container.accountService.createUserAccount({
      name: 'b_' + Math.random().toString(36).substring(2, 15),
      identifier: Math.random().toString(36).substring(2, 15),
      currency: 'USD',
    });

    // Deposit initial funds to aUser ($100.00 = 10000 cents)
    const depositAmount = 10000n;
    await container.transactionService.deposit({
      accountId: aUser.account.id,
      amount: depositAmount,
      currency: 'USD',
      reference: 'Initial deposit for aUser',
      description: 'Funding aUser account',
    });
    console.log(`Deposited ${formatCents(depositAmount)} USD to aUser`);

    const aUserBalanceAfterDeposit = await container.accountService.getUserBalanceFormatted(
      aUser.account.id
    );
    console.log(`aUser Balance after deposit: ${aUserBalanceAfterDeposit} USD`);

    const bUserBalanceInitial = await container.accountService.getUserBalanceFormatted(
      bUser.account.id
    );
    console.log(`bUser Balance: ${bUserBalanceInitial} USD`);

    // Transfer funds from aUser to bUser ($25.00 = 2500 cents)
    const transferAmount = 2500n;
    await container.transactionService.transfer({
      senderAccountId: aUser.account.id,
      receiverAccountId: bUser.account.id,
      amount: transferAmount,
      currency: 'USD',
      reference: 'Transfer from aUser to bUser',
      description: 'Payment for services',
    });
    console.log(`Transferred ${formatCents(transferAmount)} USD from aUser to bUser`);

    // Withdraw funds from bUser ($10.00 = 1000 cents)
    const withdrawAmount = 1000n;
    await container.transactionService.withdraw({
      accountId: bUser.account.id,
      amount: withdrawAmount,
      currency: 'USD',
      reference: 'Withdrawal by bUser',
      description: 'Withdrawing funds',
    });
    console.log(`Withdrew ${formatCents(withdrawAmount)} USD from bUser`);

    const aUserBalance = await container.accountService.getUserBalanceFormatted(
      aUser.account.id
    );
    console.log(`aUser Balance: ${aUserBalance} USD`);

    const bUserBalance = await container.accountService.getUserBalanceFormatted(
      bUser.account.id
    );
    console.log(`bUser Balance: ${bUserBalance} USD`);

    console.log('Initial setup completed');


    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await AppDataSource.destroy();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down...');
      await AppDataSource.destroy();
      process.exit(0);
    });

    return container;
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Run if this is the main module
main();

// Export for external consumption
export { createContainer } from './bootstrap/container';
export { AppDataSource } from './stores/data-source';
export type { Container } from './bootstrap/container';
