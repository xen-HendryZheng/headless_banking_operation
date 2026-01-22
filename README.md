# Simple Banking Operation

A headless banking operation with ledger service followed by double-entry accounting principles with TypeScript, TypeORM, and PostgreSQL.

# Technical Spec 
https://west-impala-862.notion.site/Banking-Operations-Technical-Spec-2eea5b93c289801e9260d9fc1cd445f6?pvs=74

## Directory Structure

```
src/
├── bootstrap/                 # Dependency injection setup
│   └── container.ts           # Creates and wires all dependencies
│
├── app/                       # Application layer (use cases)
│   └── transaction/
│       ├── TransactionService.ts    # Facade for deposit/withdraw/transfer
│       ├── BaseTransactionCore.ts   # Abstract base with Template Method pattern
│       ├── DepositTransaction.ts    # Money entering the system
│       ├── WithdrawTransaction.ts   # Money leaving the system
│       └── TransferTransaction.ts   # Internal transfers between accounts
│
├── domain/                    # Domain layer (business rules)
│   ├── common/
│   │   ├── Types.ts           # Core types: UUID, Currency, TxType, TxStatus
│   │   └── DomainErrors.ts    # InvalidTransactionError, InsufficientBalanceError
│   ├── ledger/
│   │   ├── LedgerTypes.ts     # JournalDraft, LedgerLine, LedgerLineDraft
│   │   └── LedgerRulesImpl.ts # Validates journal balance (debits == credits)
│   └── balance/
│       └── BalanceRulesImpl.ts # Validates non-negative balance
│
├── services/                  # Service layer (interfaces + implementations)
│   ├── account/
│   │   ├── AccountService.ts        # Interface for account operations
│   │   ├── AccountServiceImpl.ts    # Creates accounts with ledger accounts
│   │   ├── AccountStore.ts          # Port interface for account persistence
│   │   └── LedgerAccountStore.ts    # Port interface for ledger account persistence
│   ├── ledger/
│   │   ├── LedgerService.ts         # Interface for ledger posting
│   │   ├── LedgerServiceImpl.ts     # Posts journals, manages sequences
│   │   ├── LedgerLineStore.ts       # Port interface for ledger lines
│   │   └── Sequencer.ts             # Port interface for sequence allocation
│   ├── balance/
│   │   ├── BalanceService.ts        # Interface for balance operations
│   │   ├── BalanceServiceImpl.ts    # Applies deltas with locking
│   │   └── BalanceStore.ts          # Port interface for balance persistence
│   └── transaction/
│       └── TransactionStore.ts      # Port interface for transaction headers
│
├── stores/                    # Infrastructure layer (TypeORM adapters)
│   ├── data-source.ts         # TypeORM DataSource configuration
│   ├── entities/
│   │   ├── enums.ts           # AccountType, LedgerAccountType, TransactionType, etc.
│   │   ├── AccountEntity.ts   # User account table mapping
│   │   ├── LedgerAccountEntity.ts   # Ledger account table mapping
│   │   ├── TransactionEntity.ts     # Transaction header table mapping
│   │   ├── LedgerLineEntity.ts      # Double-entry ledger lines
│   │   └── BalanceEntity.ts         # Denormalized balance projection
│   ├── transformers/
│   │   └── BigIntTransformer.ts     # Handles bigint <-> string conversion
│   ├── account/
│   │   ├── TypeOrmAccountStore.ts
│   │   └── TypeOrmLedgerAccountStore.ts
│   ├── ledger/
│   │   ├── TypeOrmLedgerLineStore.ts
│   │   └── TypeOrmSequencer.ts
│   ├── balance/
│   │   └── TypeOrmBalanceStore.ts
│   └── transaction/
│       └── TypeOrmTransactionStore.ts
│
└── index.ts                   # Application entry point

tests/
├── unit/                      # Unit tests with mocks
└── integration/               # Integration tests with real database
```

## Main Classes

### TransactionService

The main facade for all transaction operations. Creates fresh transaction instances per operation to support concurrency.

```typescript
import { createContainer } from './bootstrap/container';

const container = await createContainer(dataSource);

// Deposit funds
await container.transactionService.deposit({
  accountId: 'user-uuid',
  amount: 10000n,        // $100.00 in cents
  currency: 'USD',
  reference: 'DEP-001',
  description: 'Initial deposit',
});

// Withdraw funds
await container.transactionService.withdraw({
  accountId: 'user-uuid',
  amount: 5000n,
  currency: 'USD',
  reference: 'WTH-001',
});

// Transfer between accounts
await container.transactionService.transfer({
  senderAccountId: 'sender-uuid',
  receiverAccountId: 'receiver-uuid',
  amount: 2500n,
  currency: 'USD',
  reference: 'TRF-001',
});
```

### AccountService

Manages user accounts and their associated ledger accounts.

```typescript
// Create a new user account
const result = await container.accountService.createUserAccount({
  name: 'John Doe',
  identifier: 'john.doe@example.com',
  currency: 'USD',
});

// Returns: { account, ledgerAccounts, balance }
// - account: The main user account
// - ledgerAccounts: [USER_CASH, FIRSTCIRCLE_BUSINESS_LIABILITY]
// - balance: Initial zero balance

// Get user balance
const balance = await container.accountService.getUserBalance(accountId);
```

### Transaction Classes

All transactions extend `BaseTransactionCore` which implements the Template Method pattern:

| Class | Purpose | Ledger Pattern |
|-------|---------|----------------|
| `DepositTransaction` | Money entering from external source | Bank Liability (DEBIT) + User Cash (CREDIT) |
| `WithdrawTransaction` | Money leaving to external recipient | User Cash (DEBIT) + Bank Liability (CREDIT) |
| `TransferTransaction` | Internal transfer between users | Sender Cash (DEBIT) + Receiver Cash (CREDIT) |

**Transaction Pipeline:**
1. `validate()` - Validates input and checks balance
2. `createTransactionHeader()` - Creates transaction record
3. `buildJournal()` - Builds double-entry journal
4. `postLedger()` - Persists ledger lines
5. `updateBalances()` - Updates balance projections

## Data Model

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────┐
│   account   │──1:M──│  ledger_account  │──1:M──│ ledger_line │
└─────────────┘       └──────────────────┘       └─────────────┘
                              │                         │
                              │                         │
                           1:1│                      M:1│
                              ▼                         ▼
                      ┌─────────────┐           ┌─────────────┐
                      │   balance   │           │ transaction │
                      └─────────────┘           └─────────────┘
```

**Tables:**
- `account` - User accounts (id, name, identifier, type, status)
- `ledger_account` - Financial ledger accounts linked to user accounts
- `transaction` - Transaction headers (deposit, withdraw, transfer)
- `ledger_line` - Immutable double-entry ledger lines
- `balance` - Denormalized balance projection for performance

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL)

### Installation

```bash
# Install dependencies
npm install

# Start PostgreSQL
docker-compose up -d

# Run in development mode
npm run dev
```

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage
npm run test:coverage
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run with ts-node (development) |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run compiled JavaScript |
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests |
| `npm run test:integration` | Run integration tests |
| `npm run migration:run` | Run database migrations |
| `npm run migration:revert` | Revert last migration |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | Database host |
| `POSTGRES_PORT` | `5432` | Database port |
| `POSTGRES_USER` | `ledger` | Database user |
| `POSTGRES_PASSWORD` | `ledger_secret` | Database password |
| `POSTGRES_DB` | `ledger` | Database name |

## Usage Example

```typescript
import { AppDataSource } from './stores/data-source';
import { createContainer } from './bootstrap/container';

async function main() {
  // Initialize database
  await AppDataSource.initialize();

  // Create dependency container
  const container = await createContainer(AppDataSource);

  // Create two users
  const alice = await container.accountService.createUserAccount({
    name: 'Alice',
    identifier: 'alice@example.com',
    currency: 'USD',
  });

  const bob = await container.accountService.createUserAccount({
    name: 'Bob',
    identifier: 'bob@example.com',
    currency: 'USD',
  });

  // Deposit $100 to Alice
  await container.transactionService.deposit({
    accountId: alice.account.id,
    amount: 10000n,
    currency: 'USD',
    reference: 'DEP-001',
  });

  // Transfer $25 from Alice to Bob
  await container.transactionService.transfer({
    senderAccountId: alice.account.id,
    receiverAccountId: bob.account.id,
    amount: 2500n,
    currency: 'USD',
    reference: 'TRF-001',
  });

  // Check balances
  const aliceBalance = await container.accountService.getUserBalance(alice.account.id);
  const bobBalance = await container.accountService.getUserBalance(bob.account.id);

  console.log(`Alice: ${aliceBalance}`);  // 7500 ($75.00)
  console.log(`Bob: ${bobBalance}`);      // 2500 ($25.00)
}
```

**Test Sample Result**

```
bash-5.0$ npm run dev

> ledger-core@1.0.0 dev
> ts-node src/index.ts

Database connection established
Container initialized
Deposited initial funds to aUser with $10,000.00 USD
aUser Balance after deposit: 10000 USD
bUser Balance: 0 USD
Transferred $2,500.00 USD from aUser to bUser
Withdrew $1,000.00 USD from bUser
aUser Balance: 7500 USD
bUser Balance: 1500 USD
Initial setup completed
```

## Architecture

**Layered Architecture:**
- **Application Layer** - Use cases (TransactionService, transactions)
- **Domain Layer** - Business rules (LedgerRules, BalanceRules)
- **Service Layer** - Interfaces and business logic
- **Infrastructure Layer** - TypeORM adapters

**Design Patterns:**
- **Template Method** - BaseTransactionCore defines the transaction pipeline
- **Facade** - TransactionService simplifies complex operations
- **Adapter** - TypeOrm* classes adapt TypeORM to domain interfaces
- **Dependency Injection** - Container bootstraps all dependencies

**Concurrency Handling:**
- Fresh transaction instances per operation
- Database transactions with proper isolation
- Sorted lock acquisition for transfers (deadlock prevention)
- Pessimistic locking on balance updates

## Tech Stack

- **TypeScript** 5.3
- **TypeORM** 0.3 - Database ORM
- **PostgreSQL** 16 - Primary database
- **Jest** 29 - Testing framework
- **Docker** - Container for PostgreSQL
