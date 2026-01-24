import { DataSource } from 'typeorm';
import { AccountStore, Account } from './AccountStore';
import { LedgerAccountStore, LedgerAccount } from './LedgerAccountStore';
import { BalanceStore } from '../balance/BalanceStore';
import { UUID } from '../../domain/common/Types';
import { formatCents } from '../../domain/common/Currency';
import { LedgerAccountType } from '../../stores/entities/enums';
import {
  AccountService,
  CreateUserAccountInput,
  CreateUserAccountResult,
} from './AccountService';

/**
 * AccountService implementation.
 */
export class AccountServiceImpl implements AccountService {
  constructor(
    private readonly accountStore: AccountStore,
    private readonly ledgerAccountStore: LedgerAccountStore,
    private readonly balanceStore: BalanceStore,
    private readonly dataSource: DataSource
  ) {}

  async createUserAccount(input: CreateUserAccountInput): Promise<CreateUserAccountResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const account = await this.accountStore.create(
        {
          name: input.name,
          identifier: input.identifier,
          type: 'USER',
          metadata: input.metadata,
        },
        queryRunner
      );

      const ledgerAccount = await this.ledgerAccountStore.create(
        {
          accountId: account.id,
          currency: input.currency,
          type: LedgerAccountType.USER_CASH,
          metadata: input.metadata,
        },
        queryRunner
      );

      await this.ledgerAccountStore.create(
        {
          accountId: account.id,
          currency: input.currency,
          type: LedgerAccountType.FIRSTCIRCLE_BUSINESS_LIABILITY,
          metadata: input.metadata,
        },
        queryRunner
      );

      await this.balanceStore.insert(
        ledgerAccount.id,
        BigInt(0),
        0,
        queryRunner
      );

      await queryRunner.commitTransaction();

      return { account, ledgerAccount };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findByIdentifier(identifier: string): Promise<Account | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      return await this.accountStore.findByIdentifier(identifier, queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  async getLedgerAccounts(accountId: UUID): Promise<LedgerAccount[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      return await this.ledgerAccountStore.findByAccountId(accountId, queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  async getUserBalance(accountId: UUID): Promise<bigint> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const userCashLedgerAccount = await this.ledgerAccountStore.findByAccountIdAndType(
        accountId,
        LedgerAccountType.USER_CASH,
        queryRunner
      );

      if (!userCashLedgerAccount) {
        throw new Error('User cash ledger account not found');
      }

      const balanceRecord = await this.balanceStore.getBalance(
        userCashLedgerAccount.id,
        queryRunner
      );

      return balanceRecord ? balanceRecord.balanceAmount : 0n;
    } finally {
      await queryRunner.release();
    }
  }

  async getUserBalanceFormatted(accountId: UUID): Promise<string> {
    const balance = await this.getUserBalance(accountId);
    return formatCents(balance);
  }
}
