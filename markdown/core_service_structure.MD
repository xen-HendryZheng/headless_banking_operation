# Recommended Core Service Structure

This module is designed as a **headless ledger-core service** (no API/transport). The goal is a **Java-style component/service blueprint** in TypeScript with clean separation of responsibilities and clear extension points for TypeORM implementations later.

---

## Directory Layout

```
src/
├── app/                         # Use-case orchestration (Application layer)
│   └── transaction/
│       ├── BaseTransactionCore.ts
│       ├── TransactionService.ts
│       ├── DepositTransaction.ts
│       ├── WithdrawTransaction.ts
│       └── TransferTransaction.ts
│
├── domain/                      # Pure business rules & invariants (no IO)
│   ├── ledger/
│   │   ├── Journal.ts
│   │   ├── LedgerTypes.ts
│   │   ├── LedgerRules.ts
│   │   └── LedgerRulesImpl.ts
│   │
│   ├── balance/
│   │   ├── BalanceRules.ts
│   │   └── BalanceRulesImpl.ts
│   │
│   └── common/
│       ├── Types.ts
│       ├── Money.ts
│       └── DomainErrors.ts
│
├── services/                    # Core engines (system components)
│   ├── transaction/
│   │   ├── TransactionStore.ts
│   │   └── TransactionStatus.ts
│   │
│   ├── ledger/
│   │   ├── LedgerService.ts
│   │   ├── LedgerServiceImpl.ts
│   │   ├── Sequencer.ts
│   │   └── LedgerLineStore.ts
│   │
│   └── balance/
│       ├── BalanceService.ts
│       ├── BalanceServiceImpl.ts
│       └── BalanceStore.ts
│
├── infrastructure/              # DB adapters (TypeORM later)
│   ├── transaction/
│   │   └── TypeOrmTransactionStore.ts
│   │
│   ├── ledger/
│   │   ├── TypeOrmLedgerLineStore.ts
│   │   └── TypeOrmSequencer.ts
│   │
│   └── balance/
│       └── TypeOrmBalanceStore.ts
│
├── bootstrap/                   # Dependency wiring (Spring-like config)
│   └── container.ts
│
└── index.ts                     # Entry point for worker/module startup
```

---

## Component Responsibilities

### `app/transaction` — Use Cases (Orchestration)

**Purpose:** “What happens when user performs X?”

* Implements **Template Method Pattern** via `BaseTransactionCore`
* Each transaction type is a dedicated command component:

  * `DepositTransaction`
  * `WithdrawTransaction`
  * `TransferTransaction`
* `TransactionService` is a facade to expose:

  * `deposit()`, `withdraw()`, `transfer()`

**No persistence logic** allowed here.

---

### `domain/` — Invariants and Business Rules

**Purpose:** Pure rules that must always hold.

* `LedgerRules`

  * `assertBalanced(lines)`
  * `assertValidLines(lines)`
* `BalanceRules`

  * `assertNoNegative(current, delta)`
* Shared domain primitives:

  * `Money`, `Types`, error codes

Must be:

* deterministic
* side-effect free
* framework-free

---

### `services/` — Core Engines

**Purpose:** The “ledger engine” and “projection engine” that enforce correctness.

#### `services/ledger`

* Validates journal invariants using `LedgerRules`
* Assigns `sequence` per `ledger_account_id`
* Writes immutable `ledger_lines` via `LedgerLineStore`

#### `services/balance`

* Computes deltas from journal lines
* Locks and updates `balance` projection via `BalanceStore`
* Enforces no-negative constraint using `BalanceRules`

#### `services/transaction`

* Creates transaction header records
* Maintains transaction lifecycle (PENDING → POSTED/FAILED)
* Optional: idempotency via `reference`

---

### `infrastructure/` — TypeORM Adapters

**Purpose:** DB-specific implementations.

* `TypeOrmTransactionStore`
* `TypeOrmLedgerLineStore`
* `TypeOrmBalanceStore`
* `TypeOrmSequencer`

Only this layer knows:

* TypeORM entities
* QueryRunner
* row locking statements
* SQL/index constraints

No business rules here.

---

### `bootstrap/` — Dependency Wiring

**Purpose:** Spring-style configuration for assembling components.

* Instantiates rule engines
* Instantiates service implementations
* Wires use-cases into `TransactionService`
* Exposes a fully assembled `TransactionService` to runtime entrypoints

---

## Execution Pipeline (Canonical Flow)

```
TransactionService
        ↓
BaseTransactionCore.execute()
        ↓
TransactionStore.createHeader()
        ↓
LedgerService.post()  [assertBalanced + sequence allocation + append ledger_lines]
        ↓
BalanceService.apply() [assertNoNegative + update balance projection]
        ↓
TransactionStore.markPosted()
```

All steps must execute within a single database transaction (implemented later in TypeORM infrastructure).

---

## Where Invariants Are Enforced

* `assertBalanced` → inside `LedgerService.post()` before inserting ledger_lines
* `assertNoNegative` → inside `BalanceService.apply()` while holding balance locks

This ensures correctness even if use-case validation is incomplete.

---

## Testing Implications

This structure enables testing at multiple layers:

* **Unit tests** for domain rules (`domain/`)
* **Component tests** for service engines with fakes (`services/`)
* **Integration tests** in infrastructure with real Postgres (`infrastructure/`)

---

## Notes

* This structure intentionally avoids API concerns.
* Any transport integration (HTTP, Kafka, cron) lives outside this module and calls `TransactionService`.
