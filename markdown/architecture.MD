# Ledger Core Architecture

## Overview

This module implements a **headless financial ledger core** responsible for:

* Deposit processing
* Withdrawal processing
* Internal account transfers
* Double-entry journal posting
* Balance projection and enforcement

The system is designed as a **service-oriented core engine** with no API or transport coupling. It is intended to be embedded behind workers, schedulers, or external adapters.

Primary goals:

* Financial correctness
* Auditability
* High concurrency safety
* Separation of business orchestration and accounting logic
* Java-style component/service design in TypeScript

---

## Architectural Layers

```
Application Layer (Use Cases)
        ↓
Service Layer (Ledger + Balance Engines)
        ↓
Domain Layer (Rules & Invariants)
        ↓
Infrastructure Layer (TypeORM / Database)
```

---

## Layer Responsibilities

### Application Layer (`src/app`)

Contains **use-case orchestration**:

Components:

* BaseTransactionCore (template method)
* DepositTransaction
* WithdrawTransaction
* TransferTransaction
* TransactionService (facade)

Responsibilities:

* Validate business inputs
* Coordinate transaction creation
* Build journal entries
* Invoke ledger posting and balance updates
* Manage transaction lifecycle

No database logic is allowed here.

---

### Service Layer (`src/services`)

Implements **system engines**.

#### Ledger Engine

Components:

* LedgerService
* LedgerServiceImpl
* Sequencer
* LedgerLineStore (port)

Responsibilities:

* Enforce double-entry rules
* Validate journal structure
* Assign per-account sequences
* Persist immutable ledger entries

---

#### Balance Engine

Components:

* BalanceService
* BalanceServiceImpl
* BalanceStore (port)

Responsibilities:

* Lock balances
* Apply balance deltas
* Enforce no-negative constraint
* Maintain projection cache

---

#### Transaction Storage

Components:

* TransactionStore

Responsibilities:

* Create transaction headers
* Maintain transaction lifecycle state
* Support idempotency via reference key

---

### Domain Layer (`src/domain`)

Contains **pure business logic**:

* LedgerRules (balanced journal invariant)
* BalanceRules (no-negative invariant)
* Journal definitions
* Money types
* Domain errors

This layer contains no persistence, no framework dependencies, and no IO.

---

### Infrastructure Layer (`src/infrastructure`)

Contains database adapters:

* TypeORM implementations
* SQL transaction handling
* Row locking logic
* QueryRunner usage
* Index-level optimizations

This layer must not contain business rules.

---

## Transaction Processing Flow

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

This flow is atomic and must execute inside a database transaction.

---

## Design Patterns Used

### Template Method Pattern

Implemented by:

* BaseTransactionCore

Ensures consistent execution pipeline while allowing specialized behavior per transaction type.

---

### Command Pattern

Each transaction type is implemented as a dedicated command:

* DepositTransaction
* WithdrawTransaction
* TransferTransaction

---

### Ports & Adapters Pattern

Core services depend on interfaces:

* LedgerLineStore
* BalanceStore
* TransactionStore

Concrete implementations live in infrastructure.

---

## Concurrency Model

### Balance Safety

* Balance rows are locked using row-level locking
* Concurrent overspending is prevented
* No-negative invariant enforced before commit

---

### Ledger Safety

* Ledger lines are append-only
* Per-ledger-account sequences are monotonic
* No updates or deletes on ledger_lines

---

## Invariants

The system guarantees:

### Accounting Invariant

```
SUM(debit) == SUM(credit)
```

Enforced by LedgerService.

---

### Balance Invariant

```
balance >= 0
```

For user accounts.

Enforced by BalanceService.

---

### Sequence Invariant

```
sequence strictly increases per ledger account
```

Used for:

* Audit ordering
* Replay safety
* Balance reconstruction

---

## Failure Handling Model

* No partial posting allowed
* If ledger write fails → balance must not update
* If balance update fails → transaction not marked POSTED
* Failed transactions remain in PENDING or FAILED state (configurable)

---

## Non-Goals

This core does NOT implement:

* HTTP APIs
* Authentication
* Payment gateway integrations
* External settlement reconciliation
* AML/KYC logic

These belong to outer system layers.

---

## Summary

This architecture provides:

* Bank-grade accounting safety
* Strong invariants
* Clear separation of responsibilities
* High testability
* Long-term extensibility

All financial correctness logic lives inside:

* LedgerService
* BalanceService
* Domain Rules

Infrastructure remains replaceable without affecting core behavior.
