# LedgerLine — 5-Minute Hackathon Demo Runbook & Project Showcase

Version: 1.0.0  
Audience: Hackathon Judges, Financial Engineers, Security Auditors  
Time: Exactly 5 Minutes (0:00 to 5:00)  
Data Context: Safe Local Demonstration Data (Zero Production Credentials)

---

## Part 1: Hackathon Project Write-Up

### 1. Problem Statement
Traditional financial web applications routinely place double-spending defenses, ledger balance math, and authorization logic exclusively in high-level application code (Node.js, Python, Java). This pattern is vulnerable to:
1. **IEEE 754 Floating-Point Rounding Inaccuracies**: Binary fraction rounding errors (`0.1 + 0.2 !== 0.3`) silently corrupt ledger arithmetic.
2. **Race Conditions & Double Spending**: Parallel requests exploit dirty reads or lock interleaving to withdraw funds beyond available limits.
3. **Application Layer Bypass**: A compromised web process or flawed SQL query can leak multi-tenant accounts or mutate immutable transaction ledgers.
4. **Un-reconciled Rollback Residue**: Partial failures leave orphan postings or inconsistent cached balances.

### 2. Solution Architecture
**LedgerLine** is a hardened, double-entry financial transaction core built on the principle of **defense-in-depth database enforcement**:
- **Integer Minor Currency**: All monetary amounts are handled strictly as integer paise (`BIGINT`, ₹1 = 100 paise), avoiding binary floating-point rounding from UI to disk (without claiming to eliminate all potential financial calculation defects).
- **Cryptographic Assertion Lifecycle**: Identity assertions are signed with HMAC-SHA256 and committed independently before financial processing begins, surviving rollbacks.
- **PostgreSQL Row-Level Security (`FORCE RLS`)**: Non-recursive security functions isolate tenant accounts and postings at the engine level.
- **Transactional Idempotency**: Atomic reservation, deterministic JSON canonical payload hashing, and cached replays eliminate duplicate debits under concurrent storms.
- **Deferred Commit Reconciliation**: An exclusive trigger runs at `COMMIT` time, independently summing all postings to mathematically verify cached balances.

### 3. Key Innovations
- **Three-Stage Assertion Lifecycle**: Nonce consumption commits independently of the financial transaction. If financial execution rolls back, the nonce remains consumed, permanently barring replay attacks.
- **Deterministic Two-Phase Account Locking**: Multi-party transfers lock account rows in ascending UUID order (`LEAST(src, dest)` followed by `GREATEST(src, dest)`), mathematically preventing concurrency deadlocks.
- **Zero-Postings Business Refusal**: Insufficient-funds or frozen-account attempts are permanently recorded as `refused` with zero postings, preventing phantom balance drift.
- **Immutable Ledger Triggers**: Database triggers block `UPDATE` and `DELETE` on posted transactions and postings even against privileged database owners.

### 4. Technologies Used
- **Database**: PostgreSQL 16 with `pgcrypto`, `FORCE ROW LEVEL SECURITY`, `SECURITY DEFINER` procedures, and deferred constraint triggers.
- **Backend**: Node.js 20+ LTS, Express, `pg` connection pool, Helmet, Zod schemas, scrypt password hashing, native WebCrypto HMAC-SHA256.
- **Frontend**: React 18, Vite, Tailwind CSS v4, React Router v7, Lucide React, client-side BigInt minor currency parsing.
- **Testing**: Node.js native test runner (`node:test`, `node:assert`), 103 automated tests (62 backend + 41 frontend).

---

## Part 2: Step-by-Step 5-Minute Demo Runbook

### Setup & Prerequisites
1. Ensure PostgreSQL is running on `localhost:5432` with `ledgerline_dev` migrated.
2. Start the backend: `npm --prefix server run dev` (runs on `http://localhost:5000`).
3. Start the frontend: `npm --prefix client run dev` (runs on `http://localhost:5173`).
4. Open your browser to `http://localhost:5173`.

---

### Timeline & Navigation Script

```
0:00 ─── 0:30 : System Health Probe & Monorepo Overview
0:30 ─── 1:15 : Administrator Provisioning & Account Creation
1:15 ─── 2:00 : Customer Deposit & Real-Time Balance Reflection
2:00 ─── 2:45 : Customer-to-Customer Transfer & Dual Posting Inspection
2:45 ─── 3:30 : Insufficient Funds Refusal (Zero Postings Proof)
3:30 ─── 4:00 : Idempotency Replay & 409 Conflict Rejection
4:00 ─── 4:30 : Administrative Transaction Reversal
4:30 ─── 5:00 : Auditor Read-Only Access & Financial Immutability Proof
```

---

### Step 1: Health Check Probe & System Overview (0:00 - 0:30)
1. Navigate to `http://localhost:5173/health` (or click **System Health** in navbar).
2. **Observe**:
   - Live status: `OK`
   - Database Pool: `Connected`
   - Ping latency: Measured live during demonstration (dependent on environment network characteristics)
   - Zero configuration errors.
3. **Presenter Script**:
   > *"Welcome to LedgerLine. We're looking at the live system health probe. Notice the low-latency database connectivity. LedgerLine enforces banking-grade guarantees directly at the database tier using integer paise arithmetic, RLS, and append-only triggers."*

---

### Step 2: Admin Login & Account Provisioning (0:30 - 1:15)
1. Click **Login** and authenticate as the administrator:
   - Email: `admin@ledgerline.local`
   - Password: `Password123!`
2. Navigate to **Accounts** and click **Open New Account**:
   - Account Name: `Demo Primary Savings`
   - Type: `customer`
   - Currency: `INR`
   - Initial Holder: Select `demo_user1` (Priya Sharma).
   - Click **Create Account**.
3. Repeat to create a second account:
   - Account Name: `Demo Merchant Account`
   - Initial Holder: Select `demo_user2` (Arun Verma).
4. **Observe**: Both accounts show initial balance `₹0.00` (`0` paise).
5. Click **Logout**.

---

### Step 3: Customer Deposit (1:15 - 2:00)
1. Log in as `demo_user1`:
   - Email: `user1@ledgerline.local`
   - Password: `Password123!`
2. Navigate to **Money Movement** $\to$ **Deposit**:
   - Destination Account: `Demo Primary Savings`
   - Amount in Rupees: `10000.00` (₹10,000.00)
   - Description: `Initial Capital Injection`
3. Notice the auto-generated **Idempotency Key** UUID v4.
4. Click **Submit Deposit**.
5. **Observe**:
   - Immediate confirmation: Status `Posted`.
   - Account balance immediately reflects `₹10,000.00` (1,000,000 paise).
   - Double-entry proof:
     - Vault: `-₹10,000.00` (Debit)
     - Demo Primary Savings: `+₹10,000.00` (Credit)
     - Net Sum: `₹0.00` (strictly zero-sum).

---

### Step 4: Transfer Funds & Inspect Ledger Statement (2:00 - 2:45)
1. In **Money Movement**, switch to the **Transfer** tab:
   - Source Account: `Demo Primary Savings`
   - Destination Account: `Demo Merchant Account`
   - Amount: `2500.00` (₹2,500.00)
   - Description: `Consulting invoice payment`
2. Click **Submit Transfer**.
3. **Observe**:
   - Transaction completes with status `posted`.
   - `Demo Primary Savings` balance updates to `₹7,500.00`.
4. Click **View Statement**:
   - Notice the append-only postings table showing:
     - Posting 1: Initial Deposit (+₹10,000.00) $\to$ Running Balance: ₹10,000.00
     - Posting 2: Invoice Payment (-₹2,500.00) $\to$ Running Balance: ₹7,500.00

---

### Step 5: Insufficient Funds Refusal (2:45 - 3:30)
1. Attempt an overdraft transfer:
   - Source Account: `Demo Primary Savings` (Available: ₹7,500.00)
   - Destination: `Demo Merchant Account`
   - Amount: `50000.00` (₹50,000.00)
   - Description: `Malicious overdraft attempt`
2. Click **Submit Transfer**.
3. **Observe**:
   - Request is refused with HTTP 422: `Insufficient funds in source account`.
   - Transaction is saved with status `refused` and `refusal_reason: INSUFFICIENT_FUNDS`.
   - **Critical Invariant Proof**: Postings count is **exactly 0**. No debit, no credit, and no phantom balance leakage occurred!

---

### Step 6: Idempotent Replay & 409 Conflict Rejection (3:30 - 4:00)
1. **Exact Replay**:
   - Without changing any fields or the Idempotency Key, click **Submit Transfer** again.
   - **Observe**:
     - The transaction immediately returns the existing refusal record.
     - Header banner displays: `Idempotent-Replay: true`.
     - No new transaction ID was created; no duplicate database operation ran.
2. **Payload Tampering Rejection**:
   - Keep the **same Idempotency Key**, but change the amount from `50000.00` to `100.00`.
   - Click **Submit Transfer**.
   - **Observe**:
     - Immediate rejection: `HTTP 409 Conflict`.
     - Error: `Idempotency key already used with different payload`.
     - The database rejects key hijacking.
3. Click **Logout**.

---

### Step 7: Administrative Reversal (4:00 - 4:30)
1. Log in as `admin@ledgerline.local`.
2. Navigate to **Transactions** and locate the ₹2,500.00 transfer.
3. Click **Reverse Transaction**:
   - Reversal Reason: `Merchant cancelled service agreement`
   - Click **Confirm Reversal**.
4. **Observe**:
   - Status updates to `reversed`.
   - A new compensating reversal transaction is posted:
     - Debit Demo Merchant: `-₹2,500.00`
     - Credit Demo Savings: `+₹2,500.00`
   - `Demo Primary Savings` balance is restored to `₹10,000.00`.
5. Click **Reverse Transaction** again on the same transaction:
   - **Observe**: Blocked with `Transaction has already been reversed` (HTTP 422). Double reversal is mathematically prevented.
6. Click **Logout**.

---

### Step 8: Auditor Read-Only Access & Immutability Proof (4:30 - 5:00)
1. Log in as the compliance auditor:
   - Email: `auditor@ledgerline.local`
   - Password: `Password123!`
2. Navigate to **Accounts** & **Statements**:
   - Auditor can inspect all transactions, postings, running balances, and audit logs.
3. Notice that mutation controls (**Deposit**, **Withdraw**, **Transfer**, **Reverse**, **Change Status**) are disabled or hidden in the UI.
4. Attempting to directly trigger a transfer via API as auditor returns `HTTP 403 Forbidden` (`Auditor role cannot initiate financial transfers`).
5. **Presenter Concluding Statement**:
   > *"In 5 minutes, we have demonstrated mathematical precision in integer paise, double-entry invariance, complete idempotency and conflict defense, atomic reversal, and immutable role separation. LedgerLine provides a rock-solid, production-ready foundation for mission-critical financial engineering."*
