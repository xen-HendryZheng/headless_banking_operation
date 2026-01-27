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


    //auser Deposit then reverse
    const depositToReverseAmount = 5000n;
    const depositTx = await container.transactionService.deposit({
      accountId: aUser.account.id,
      amount: depositToReverseAmount,
      currency: 'USD',
      reference: 'Deposit to be reversed for aUser',
      description: 'Funding aUser account for reversal',
    });
    console.log(`Deposited ${formatCents(depositToReverseAmount)} USD to aUser for reversal`);

    const aUserBalanceBeforeReversal = await container.accountService.getUserBalanceFormatted(
      aUser.account.id
    );
    console.log(`aUser Balance before reversal: ${aUserBalanceBeforeReversal} USD`);

    await container.transactionService.reverse(depositTx.transactionId);
    console.log(`Reversed deposit transaction ${depositTx.transactionId} for aUser`);


    const aUserBalanceAfterReversal = await container.accountService.getUserBalanceFormatted(
      aUser.account.id
    );
    console.log(`aUser Balance after reversal: ${aUserBalanceAfterReversal} USD`);

    //aUser balance before reversal

    const aUserBalanceBeforeWithdrawReversal = await container.accountService.getUserBalanceFormatted(
      aUser.account.id
    );
    console.log(`aUser Balance before withdrawal reversal: ${aUserBalanceBeforeWithdrawReversal} USD`);

    //aUser Withdrawal then reverse
    const withdrawToReverseAmount = 3000n;
    const withdrawTx = await container.transactionService.withdraw({
      accountId: aUser.account.id,
      amount: withdrawToReverseAmount,
      currency: 'USD',
      reference: 'Withdrawal to be reversed for aUser',
      description: 'Withdrawing funds for reversal',
    });
    console.log(`Withdrew ${formatCents(withdrawToReverseAmount)} USD from aUser for reversal`);

    const aUserBalanceAfterWithdraw = await container.accountService.getUserBalanceFormatted(
      aUser.account.id
    );
    console.log(`aUser Balance after withdrawal: ${aUserBalanceAfterWithdraw} USD`);

    await container.transactionService.reverse(withdrawTx.transactionId);
    console.log(`Reversed withdrawal transaction ${withdrawTx.transactionId} for aUser`);

    const aUserBalanceAfterWithdrawReversal = await container.accountService.getUserBalanceFormatted(
      aUser.account.id
    );
    console.log(`aUser Balance after withdrawal reversal: ${aUserBalanceAfterWithdrawReversal} USD`);

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
