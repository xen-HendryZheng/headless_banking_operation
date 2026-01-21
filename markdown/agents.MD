# Ledger Core Service — Architecture Context (agents.md)

## Purpose

This module implements a **bank-grade internal ledger engine** for handling:

* Deposits
* Withdrawals
* Internal transfers (A → B)
* Balance projections
* Immutable journal posting

The system is designed as a **headless service core** (no API layer) that can be consumed by workers, schedulers, or external adapters.

Primary goals:

* Financial correctness (double-entry accounting)
* Strong invariants
* Auditability
* High concurrency safety
* Clear separation between business orchestration and accounting logic

---

## Core Design Principles

### 1. Ledger Is Source of Truth

* `ledger_lines` is append-only and immutable
* Balances are derived projections
* Never mutate historical ledger entries

---

### 2. Transaction Header vs Ledger Lines

Two layers are separated:

| Layer                              | Responsibility                   |
| ---------------------------------- | -------------------------------- |
| Transaction Header (`transaction`) | Business intent, UI/query layer  |
| Ledger Lines (`ledger_lines`)      | Accounting truth, financial math |

Transaction table must never be trusted for accounting math.

---

### 3. Option 1 Transaction Model (Counterparty Only for Transfer)

The system uses **Option 1 pattern**:

### transaction table:

* `ledger_account_id` → primary owner of this transaction
* `counterparty_ledger_account_id` → only populated when `type = TRANSFER`
* Deposit / Withdraw do NOT use fake external sender accounts

#### Mapping

| Type     | ledger_account_id | counterparty_ledger_account_id |
| -------- | ----------------- | ------------------------------ |
| DEPOSIT  | USER              | NULL                           |
| WITHDRAW | USER              | NULL                           |
| TRANSFER | SENDER            | RECEIVER                       |

Direction is derived from:

* `type`
* `is_credit`

---

### 4. No SYSTEM_EXTERNAL Ledger Account

There is **no fake external ledger account**.

External world is modeled only as:

* Transaction metadata
* Accounting impact via bank liability control account

This avoids polluting the ledger with artificial balances.

---

### 5. Bank Control Ledger

System maintains:

* User sub-ledger accounts (`BUSINESS_CASH`)
* Bank liability control ledger (`FIRSTCIRCLE_BUSINESS_LIABILITY`)

Usage:

### Deposit

```
FIRSTCIRCLE_LIABILITY  DEBIT
USER_CASH              CREDIT
```

### Withdraw

```
USER_CASH              DEBIT
FIRSTCIRCLE_LIABILITY  CREDIT
```

### Internal Transfer

```
USER_A                 DEBIT
USER_B                 CREDIT
```

Bank liability is NOT touched for internal transfers.

---

## Component Architecture

System follows **Java-style layered service architecture** using:

* Abstract base classes
* Interfaces
* Dependency injection
* Template Method Pattern

---

### High-Level Flow

```
TransactionService
        ↓
BaseTransactionCore.execute()
        ↓
TransactionStore.createHeader()
        ↓
LedgerService.post()
        ↓
BalanceService.apply()
        ↓
TransactionStore.markPosted()
```

---

## Core Components

### Application Layer

Location: `src/app/transaction`

* BaseTransactionCore
* DepositTransaction
* WithdrawTransaction
* TransferTransaction
* TransactionService (facade)

Purpose:

* Orchestrate use-cases
* Apply business validation
* Coordinate ledger + balance services

---

### Domain Layer

Location: `src/domain`

Contains pure logic:

* LedgerRules (balanced journal invariant)
* BalanceRules (no-negative invariant)
* Journal structures
* Money types
* Domain errors

NO database dependencies allowed.

---

### Services Layer (Engine)

Location: `src/services`

#### Ledger Engine

* LedgerService
* LedgerServiceImpl
* Sequencer
* LedgerLineStore (port)

Responsibilities:

* Validate journals
* Enforce debit/credit correctness
* Assign per-account sequences
* Append immutable ledger lines

---

#### Balance Engine

* BalanceService
* BalanceServiceImpl
* BalanceStore (port)

Responsibilities:

* Lock balances
* Apply deltas
* Enforce no-negative invariant
* Maintain projection cache

---

#### Transaction Storage

* TransactionStore

Responsibilities:

* Create transaction headers
* Maintain transaction lifecycle state

---

### Infrastructure Layer

Location: `src/infrastructure`

Contains:

* TypeORM implementations
* DB locking logic
* QueryRunner usage
* SQL-level optimizations

Infrastructure must never contain business rules.

---

## Ledger Invariants

These invariants MUST always hold:

### Journal Invariant

```
SUM(debit) == SUM(credit)
```

Enforced in:

* LedgerService via LedgerRules.assertBalanced()

---

### Balance Invariant

```
balance >= 0
```

For user cash accounts.

Enforced in:

* BalanceService using row locks + BalanceRules.assertNoNegative()

---

### Sequence Invariant

For each ledger account:

```
sequence strictly increases
```

Used for:

* Audit ordering
* Balance rebuild
* Event replay safety

---

## Concurrency Model

### Balance Updates

* Use row-level locking (`SELECT ... FOR UPDATE`)
* Reject concurrent overspending
* BalanceService owns enforcement

---

### Ledger Lines

* Append-only writes
* Sequence assigned atomically per ledger account

---

## Transaction Lifecycle

States:

* PENDING (created)
* POSTED (ledger + balance applied)
* FAILED (optional — if mid-flight failure occurs)

No partial state allowed:

* If ledger fails → balance must not update
* If balance fails → transaction not POSTED

---

## Testing Strategy

### Unit Tests

* LedgerRules
* BalanceRules
* Validation logic

---

### Component Tests

* LedgerService with fake stores
* BalanceService with fake balances
* Transaction flows with in-memory dependencies

---

### Integration Tests

With real Postgres:

* Atomic posting behavior
* Concurrent transfer safety
* Sequence correctness
* Idempotency handling (if enabled)

---

### Invariant Tests (Recommended)

Randomized operations verifying:

* Ledger always balances
* No negative balances
* Projection matches recomputed ledger sum

---

## Observability Requirements

### Logging Format

```
[TIMESTAMP][LEVEL][SERVICE][CLASS][ACTION][correlation_id][transaction_id][reference]
```

---

### Mandatory Events

* TRANSACTION_CREATED
* LEDGER_POST_ATTEMPT / SUCCESS
* BALANCE_APPLY_ATTEMPT / SUCCESS
* TRANSACTION_POSTED

---

### Error Logging

All errors must include:

* error_code
* transaction_id (if exists)
* reference
* correlation_id

---

### Non-Goals (Out of Scope)

- Functional
    - Transaction History
    - Transfer History
    - Fees, Charges, Tax
    - Overdraft
    - Multi Currency
    - Balance Hold
- Technical
    - Frontend Build
    - APIs

Those belong in outer layers.

---

## Summary

This architecture provides:

* Bank-grade correctness
* Clear separation of responsibilities
* Easy testability
* Strong invariants
* Future extensibility (fees, settlement, multi-currency)

All financial safety logic is centralized in:

* LedgerService
* BalanceService
* Domain rules

No business logic is allowed inside infrastructure adapters.

---

End of context.
