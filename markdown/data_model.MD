# Ledger Core Data Model

## Overview

This document defines the persistent data structures used by the ledger core.

The model is based on:

* Double-entry accounting
* Immutable journals
* Balance projection cache
* Business transaction headers

---

## Entity Relationship Overview

```
account
   │
   └── ledger_account
            │
            ├── ledger_lines
            │
            └── balance

transaction
   │
   └── ledger_lines
```

---

## account

Represents system entities (users, business entities).

### Fields

| Column     | Type      | Notes                  |
| ---------- | --------- | ---------------------- |
| id         | UUID      | Primary key            |
| name       | string    | Display name           |
| identifier | string    | User Bank Acc No       |
| type       | enum      | USER, BUSINESS, SYSTEM |
| status     | enum      | ACTIVE, SUSPENDED      |
| metadata   | jsonb     | Optional attributes    |
| created_at | timestamp |                        |
| updated_at | timestamp |                        |

---

## ledger_account

Represents financial accounts participating in journal posting.

Examples:

* User wallet accounts
* Bank liability control account

### Fields

| Column     | Type      | Notes                                         |
| ---------- | --------- | --------------------------------------------- |
| id         | UUID      | Primary key                                   |
| account_id | UUID      | FK → account                                  |
| currency   | string    | ISO currency code                             |
| type       | enum      | BUSINESS_CASH, FIRSTCIRCLE_BUSINESS_LIABILITY |
| status     | enum      | ACTIVE, FROZEN                                |
| metadata   | jsonb     |                                               |
| created_at | timestamp |                                               |

---

## transaction

Business-level transaction header.

Used for:

* UI queries
* History display
* Idempotency
* Status tracking

### Fields

| Column                         | Type          | Notes                                        |
| ------------------------------ | ------------- | -------------------------------------------- |
| id                             | UUID          | Primary key                                  |
| ledger_account_id              | UUID          | Primary account owner (Option 1)             |
| counterparty_ledger_account_id | UUID nullable | Only for TRANSFER                            |
| type                           | enum          | DEPOSIT, WITHDRAW, TRANSFER                  |
| currency                       | string        |                                              |
| is_credit                      | boolean       | Direction relative to primary ledger account |
| amount                         | bigint        | Minor units                                  |
| reference                      | string        | Idempotency key                              |
| description                    | string        |                                              |
| status                         | enum          | PENDING, POSTED, FAILED                      |
| account_id                     | UUID          | Initiator reference                          |
| created_at                     | timestamp     |                                              |
| updated_at                     | timestamp     |                                              |

---

## ledger_lines

Immutable journal entries.

This is the **source of accounting truth**.

### Fields

| Column            | Type      | Notes                        |
| ----------------- | --------- | ---------------------------- |
| id                | UUID      | Primary key                  |
| transaction_id    | UUID      | FK → transaction             |
| ledger_account_id | UUID      | FK → ledger_account          |
| account_id        | UUID      | Denormalized owner reference |
| debit             | bigint    |                              |
| credit            | bigint    |                              |
| amount            | bigint    | debit + credit               |
| subtype           | string    | PRINCIPAL, FEE, REVERSAL     |
| sequence          | integer   | Monotonic per ledger account |
| created_at        | timestamp |                              |

### Constraints

* Exactly one of debit or credit must be non-zero
* debit >= 0
* credit >= 0
* ledger_lines are append-only

---

## balance

Cached projection table.

Used for:

* Fast balance lookup
* Concurrency control
* Overspend prevention

### Fields

| Column            | Type      | Notes                        |
| ----------------- | --------- | ---------------------------- |
| ledger_account_id | UUID      | PK + FK                      |
| balance_amount    | bigint    |                              |
| last_sequence     | integer   | Last applied ledger sequence |
| updated_at        | timestamp |                              |

---

## Posting Patterns

---

### Deposit

User receives funds.

Ledger Lines:

```
FIRSTCIRCLE_LIABILITY   DEBIT
USER_CASH              CREDIT
```

Transaction:

```
type = DEPOSIT
ledger_account_id = USER
counterparty = NULL
is_credit = true
```

---

### Withdraw

User cash out.

Ledger Lines:

```
USER_CASH               DEBIT
FIRSTCIRCLE_LIABILITY   CREDIT
```

Transaction:

```
type = WITHDRAW
ledger_account_id = USER
counterparty = NULL
is_credit = false
```

---

### Internal Transfer (A → B)

Ledger Lines:

```
USER_A   DEBIT
USER_B   CREDIT
```

Transaction:

```
type = TRANSFER
ledger_account_id = USER_A
counterparty_ledger_account_id = USER_B
is_credit = false
```

---

## Index Recommendations

### ledger_lines

* (ledger_account_id, sequence)
* (transaction_id)

---

### transaction

* (ledger_account_id, created_at)
* (counterparty_ledger_account_id, created_at)
* UNIQUE(reference)

---

### balance

* PRIMARY KEY (ledger_account_id)

---

## Data Integrity Rules

### Accounting Integrity

```
SUM(debit) == SUM(credit) per transaction
```

---

### Balance Integrity

```
balance_amount >= 0
```

---

### Sequence Integrity

```
sequence strictly increasing per ledger_account_id
```

---

## Rebuild Strategy

Balances must be rebuildable from ledger_lines:

```
balance = SUM(credit) - SUM(debit)
```

Balance table is treated as a projection cache.

---

## Summary

This data model:

* Preserves immutable financial history
* Supports fast querying
* Enables strong concurrency safety
* Separates business intent from accounting truth
* Matches bank-grade ledger design patterns
