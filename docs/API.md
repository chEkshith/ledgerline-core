# LedgerLine Core — API Reference Manual

Version: 1.0.0  
Protocol: HTTP/1.1 with TLS (Production) / HTTP (Local Dev)  
Base URL: `/api`  
Content-Type: `application/json`

---

## 1. Overview & Architectural Conventions

LedgerLine exposes an enterprise-grade RESTful API designed with defense-in-depth financial guarantees. All financial endpoints enforce integer-based minor currency arithmetic, cryptographic identity binding, strict row-level security (RLS), and transactional idempotency.

### 1.1 Authentication & Authorization Headers

Protected endpoints require a Bearer token in the `Authorization` header:

```http
Authorization: Bearer <jwt-token>
```

The JWT token contains the user's authenticated identity (`id`, `email`, `role`). The backend dynamically verifies the user's real-time database status and role before establishing a cryptographically signed HMAC session context in PostgreSQL (`active_session_contexts`). Stale or demoted tokens are immediately rejected.

### 1.2 Idempotency-Key Header

All financial mutation endpoints (`/api/transactions/deposit`, `/api/transactions/withdraw`, `/api/transactions/transfer`, `/api/transactions/:id/reverse`) require a client-generated UUID v4 idempotency key:

```http
Idempotency-Key: <uuid-v4>
```

- **Exact Replay**: Submitting an identical payload with the same idempotency key returns the cached response with HTTP status `200 OK` (or original status) and includes the response header:
  ```http
  Idempotent-Replay: true
  ```
- **Payload Conflict**: Submitting a different payload with an already-used idempotency key produces an immediate rejection:
  ```http
  HTTP/1.1 409 Conflict
  ```
  ```json
  {
    "error": "Idempotency key already used with different payload",
    "code": "IDEMPOTENCY_PAYLOAD_MISMATCH"
  }
  ```
- **Concurrent Requests**: Simultaneous requests using the same key are serialized at the database row lock. Exactly one request executes financial logic; all concurrent contenders receive the cached result.

### 1.3 Minor Currency Representation (Integer Paise)

All monetary values are represented strictly as **integer strings in minor currency units (paise)**. Floating-point numbers are prohibited across the API boundary to prevent IEEE 754 precision errors.

- ₹1.00 = 100 paise
- ₹1,500.00 = `"150000"` paise
- Minimum amount: `"1"` (1 paisa / ₹0.01)
- Maximum amount: `"9223372036854775807"` (PostgreSQL `BIGINT` max)

### 1.4 HTTP Status Codes Summary

| Status Code | Meaning | Usage in LedgerLine |
| :--- | :--- | :--- |
| `200 OK` | Success | Successful read operation, cached idempotent replay, or status update |
| `201 Created` | Created | Successfully posted financial transaction or provisioned account/user |
| `400 Bad Request` | Validation Error | Malformed body, missing fields, non-integer paise, invalid UUID syntax |
| `401 Unauthorized` | Authentication Failure | Missing, expired, malformed, or signature-invalid JWT |
| `403 Forbidden` | Access Denied | Authenticated actor lacks necessary role or account membership |
| `404 Not Found` | Resource Not Found | Account, user, or transaction does not exist (or hidden by RLS) |
| `409 Conflict` | Concurrency / Key Conflict | Re-used idempotency key with altered payload or assertion conflict |
| `422 Unprocessable` | Business Rule Refusal | Insufficient funds, frozen account, or already-reversed transaction |
| `500 Internal Error` | Server Exception | Uncaught database exception or connection failure (sanitized) |

---

## 2. Health & Monitoring Endpoints

### 2.1 System Health Probe

Checks API server uptime and PostgreSQL database pool connectivity.

- **URL**: `GET /api/health`
- **Authentication**: None (Public)
- **Headers**: None

#### Success Response (`200 OK`)

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-11-09T10:30:00.000Z",
  "uptime": 1423.85
}
```

#### Failure Response (`500 Internal Server Error`)

```json
{
  "status": "error",
  "database": "disconnected",
  "error": "Database connection timed out",
  "timestamp": "2026-11-09T10:30:00.000Z"
}
```

---

## 3. Authentication & User Management Endpoints

### 3.1 Register User

Provisions a new user account with default role `customer`. Registration of `admin` or `auditor` roles via this endpoint is prohibited.

- **URL**: `POST /api/auth/register`
- **Authentication**: None (Public)
- **Headers**: `Content-Type: application/json`

#### Request Body

```json
{
  "email": "customer@example.com",
  "password": "SecurePassword123!",
  "fullName": "Priya Sharma"
}
```

#### Success Response (`201 Created`)

```json
{
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "customer@example.com",
    "fullName": "Priya Sharma",
    "role": "customer",
    "status": "active",
    "createdAt": "2026-11-09T10:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 3.2 Login User

Authenticates credentials and returns a signed JWT.

- **URL**: `POST /api/auth/login`
- **Authentication**: None (Public)

#### Request Body

```json
{
  "email": "customer@example.com",
  "password": "SecurePassword123!"
}
```

#### Success Response (`200 OK`)

```json
{
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "customer@example.com",
    "fullName": "Priya Sharma",
    "role": "customer",
    "status": "active"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### 3.3 Get Authenticated Profile

Returns profile of the currently logged-in user.

- **URL**: `GET /api/auth/me`
- **Authentication**: Bearer Token
- **Headers**: `Authorization: Bearer <token>`

#### Success Response (`200 OK`)

```json
{
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "customer@example.com",
    "fullName": "Priya Sharma",
    "role": "customer",
    "status": "active"
  }
}
```

---

### 3.4 List Users (Admin Only)

Returns a list of all registered users.

- **URL**: `GET /api/users`
- **Authentication**: Bearer Token (`admin` role required)

#### Success Response (`200 OK`)

```json
{
  "users": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "email": "customer@example.com",
      "full_name": "Priya Sharma",
      "role": "customer",
      "status": "active",
      "created_at": "2026-11-09T10:00:00.000Z"
    }
  ]
}
```

---

### 3.5 Set User Status (Admin Only)

Activates or suspends a user. All changes are attributed to the authentic admin in immutable audit logs.

- **URL**: `POST /api/users/:id/status`
- **Authentication**: Bearer Token (`admin` role required)

#### Request Body

```json
{
  "status": "suspended",
  "reason": "Security review pending"
}
```

#### Success Response (`200 OK`)

```json
{
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "status": "suspended",
    "updated_at": "2026-11-09T10:15:00.000Z"
  }
}
```

---

## 4. Account Management Endpoints

### 4.1 List Accounts

Returns accounts accessible to the caller. For customers and auditors, RLS limits results to accounts where they have an active membership. For administrators, returns all system accounts.

- **URL**: `GET /api/accounts`
- **Authentication**: Bearer Token

#### Success Response (`200 OK`)

```json
{
  "accounts": [
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "account_number": "ACC-IND-1001",
      "name": "Priya Savings",
      "type": "customer",
      "currency": "INR",
      "balance_paise": "150000",
      "status": "active",
      "created_at": "2026-11-09T10:05:00.000Z"
    }
  ]
}
```

---

### 4.2 Create Account (Admin Only)

Provisions a new account (e.g. `customer` or `vault`) and optionally assigns initial membership.

- **URL**: `POST /api/accounts`
- **Authentication**: Bearer Token (`admin` role required)

#### Request Body

```json
{
  "name": "Arun Business Account",
  "type": "customer",
  "currency": "INR",
  "initialHolderUserId": "33333333-3333-3333-3333-333333333333"
}
```

#### Success Response (`201 Created`)

```json
{
  "account": {
    "id": "44444444-4444-4444-4444-444444444444",
    "account_number": "ACC-IND-1002",
    "name": "Arun Business Account",
    "type": "customer",
    "currency": "INR",
    "balance_paise": "0",
    "status": "active",
    "created_at": "2026-11-09T10:10:00.000Z"
  }
}
```

---

### 4.3 Get Account Details

Retrieves details for a specific account. Subject to RLS.

- **URL**: `GET /api/accounts/:id`
- **Authentication**: Bearer Token

#### Success Response (`200 OK`)

```json
{
  "account": {
    "id": "22222222-2222-2222-2222-222222222222",
    "account_number": "ACC-IND-1001",
    "name": "Priya Savings",
    "type": "customer",
    "currency": "INR",
    "balance_paise": "150000",
    "status": "active",
    "memberships": [
      {
        "user_id": "11111111-1111-1111-1111-111111111111",
        "role": "account_holder",
        "email": "customer@example.com",
        "full_name": "Priya Sharma"
      }
    ]
  }
}
```

---

### 4.4 Assign Account Membership

Adds an `account_holder` or `auditor` to an account.

- **URL**: `POST /api/accounts/:id/memberships`
- **Authentication**: Bearer Token (`admin` or existing `account_holder`)

#### Request Body

```json
{
  "userId": "55555555-5555-5555-5555-555555555555",
  "role": "auditor"
}
```

#### Success Response (`200 OK`)

```json
{
  "membership": {
    "account_id": "22222222-2222-2222-2222-222222222222",
    "user_id": "55555555-5555-5555-5555-555555555555",
    "role": "auditor",
    "created_at": "2026-11-09T10:20:00.000Z"
  }
}
```

---

### 4.5 Revoke Account Membership

Removes a membership from an account. The database strictly enforces that an active account cannot have its final `account_holder` revoked.

- **URL**: `DELETE /api/accounts/:id/memberships/:userId`
- **Authentication**: Bearer Token (`admin` or existing `account_holder`)

#### Success Response (`200 OK`)

```json
{
  "message": "Membership revoked successfully"
}
```

---

## 5. Financial Transaction Endpoints

All financial operations require the `Idempotency-Key` header with a valid UUID v4.

### 5.1 Deposit Money (Vault $\to$ Account)

Credits a customer account from the system Vault. Only an authorized `account_holder` of the destination account or an `admin` can initiate this request.

- **URL**: `POST /api/transactions/deposit`
- **Authentication**: Bearer Token
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Idempotency-Key: <uuid-v4>`
  - `Content-Type: application/json`

#### Request Body

```json
{
  "destinationAccountId": "22222222-2222-2222-2222-222222222222",
  "amountPaise": "1000000",
  "currency": "INR",
  "description": "Initial capital deposit"
}
```
*(Amount: ₹10,000.00 = 1,000,000 paise)*

#### Success Response (`201 Created` or `200 OK` on replay)

```json
{
  "transaction": {
    "id": "66666666-6666-6666-6666-666666666666",
    "type": "deposit",
    "status": "posted",
    "source_account_id": "00000000-0000-0000-0000-000000000001",
    "destination_account_id": "22222222-2222-2222-2222-222222222222",
    "amount_paise": "1000000",
    "currency": "INR",
    "description": "Initial capital deposit",
    "created_at": "2026-11-09T10:25:00.000Z",
    "postings": [
      {
        "id": "77777777-7777-7777-7777-777777777771",
        "account_id": "00000000-0000-0000-0000-000000000001",
        "amount_paise": "-1000000",
        "direction": "debit"
      },
      {
        "id": "77777777-7777-7777-7777-777777777772",
        "account_id": "22222222-2222-2222-2222-222222222222",
        "amount_paise": "1000000",
        "direction": "credit"
      }
    ]
  }
}
```

---

### 5.2 Withdraw Money (Account $\to$ Vault)

Debits a customer account to the system Vault. Requires sufficient available balance.

- **URL**: `POST /api/transactions/withdraw`
- **Authentication**: Bearer Token
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Idempotency-Key: <uuid-v4>`
  - `Content-Type: application/json`

#### Request Body

```json
{
  "sourceAccountId": "22222222-2222-2222-2222-222222222222",
  "amountPaise": "250000",
  "currency": "INR",
  "description": "Cash withdrawal"
}
```
*(Amount: ₹2,500.00 = 250,000 paise)*

#### Success Response (`201 Created`)

```json
{
  "transaction": {
    "id": "88888888-8888-8888-8888-888888888888",
    "type": "withdrawal",
    "status": "posted",
    "source_account_id": "22222222-2222-2222-2222-222222222222",
    "destination_account_id": "00000000-0000-0000-0000-000000000001",
    "amount_paise": "250000",
    "currency": "INR",
    "description": "Cash withdrawal",
    "created_at": "2026-11-09T10:30:00.000Z",
    "postings": [
      {
        "id": "99999999-9999-9999-9999-999999999991",
        "account_id": "22222222-2222-2222-2222-222222222222",
        "amount_paise": "-250000",
        "direction": "debit"
      },
      {
        "id": "99999999-9999-9999-9999-999999999992",
        "account_id": "00000000-0000-0000-0000-000000000001",
        "amount_paise": "250000",
        "direction": "credit"
      }
    ]
  }
}
```

---

### 5.3 Transfer Money (Account $\to$ Account)

Atomically moves funds between two customer accounts. Locks both accounts in deterministic ascending UUID order to eliminate deadlocks.

- **URL**: `POST /api/transactions/transfer`
- **Authentication**: Bearer Token
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Idempotency-Key: <uuid-v4>`

#### Request Body

```json
{
  "sourceAccountId": "22222222-2222-2222-2222-222222222222",
  "destinationAccountId": "44444444-4444-4444-4444-444444444444",
  "amountPaise": "150000",
  "currency": "INR",
  "description": "Vendor invoice payment"
}
```
*(Amount: ₹1,500.00 = 150,000 paise)*

#### Success Response (`201 Created`)

```json
{
  "transaction": {
    "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "type": "transfer",
    "status": "posted",
    "source_account_id": "22222222-2222-2222-2222-222222222222",
    "destination_account_id": "44444444-4444-4444-4444-444444444444",
    "amount_paise": "150000",
    "currency": "INR",
    "description": "Vendor invoice payment",
    "created_at": "2026-11-09T10:35:00.000Z",
    "postings": [
      {
        "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        "account_id": "22222222-2222-2222-2222-222222222222",
        "amount_paise": "-150000",
        "direction": "debit"
      },
      {
        "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
        "account_id": "44444444-4444-4444-4444-444444444444",
        "amount_paise": "150000",
        "direction": "credit"
      }
    ]
  }
}
```

#### Business Rule Refusal: Insufficient Funds (`422 Unprocessable Entity`)

When the source account lacks sufficient funds, the transaction is permanently recorded with status `refused` and produces **zero postings**:

```json
{
  "error": "Insufficient funds in source account",
  "code": "INSUFFICIENT_FUNDS",
  "transaction": {
    "id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "status": "refused",
    "refusal_reason": "INSUFFICIENT_FUNDS",
    "amount_paise": "50000000",
    "postings_count": 0
  }
}
```

---

### 5.4 Reverse Transaction (Admin Only)

Issues an atomic compensating reversal for a previously posted transaction. Exactly restores balances via dual complementary postings. Cannot reverse an already reversed transaction.

- **URL**: `POST /api/transactions/:id/reverse`
- **Authentication**: Bearer Token (`admin` role required)
- **Headers**:
  - `Authorization: Bearer <token>`
  - `Idempotency-Key: <uuid-v4>`

#### Request Body

```json
{
  "reason": "Customer requested chargeback resolution"
}
```

#### Success Response (`201 Created`)

```json
{
  "transaction": {
    "id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
    "type": "reversal",
    "status": "posted",
    "source_account_id": "44444444-4444-4444-4444-444444444444",
    "destination_account_id": "22222222-2222-2222-2222-222222222222",
    "amount_paise": "150000",
    "currency": "INR",
    "description": "Reversal of aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa: Customer requested chargeback resolution",
    "postings": [
      {
        "account_id": "44444444-4444-4444-4444-444444444444",
        "amount_paise": "-150000",
        "direction": "debit"
      },
      {
        "account_id": "22222222-2222-2222-2222-222222222222",
        "amount_paise": "150000",
        "direction": "credit"
      }
    ]
  }
}
```

#### Refusal: Already Reversed (`422 Unprocessable Entity`)

```json
{
  "error": "Transaction has already been reversed",
  "code": "ALREADY_REVERSED"
}
```

---

### 5.5 Get Transaction Details

Retrieves transaction details and postings. Subject to RLS.

- **URL**: `GET /api/transactions/:id`
- **Authentication**: Bearer Token

#### Success Response (`200 OK`)

```json
{
  "transaction": {
    "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "type": "transfer",
    "status": "posted",
    "source_account_id": "22222222-2222-2222-2222-222222222222",
    "destination_account_id": "44444444-4444-4444-4444-444444444444",
    "amount_paise": "150000",
    "currency": "INR",
    "description": "Vendor invoice payment",
    "created_at": "2026-11-09T10:35:00.000Z",
    "postings": [
      {
        "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        "account_id": "22222222-2222-2222-2222-222222222222",
        "amount_paise": "-150000",
        "direction": "debit",
        "created_at": "2026-11-09T10:35:00.000Z"
      },
      {
        "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
        "account_id": "44444444-4444-4444-4444-444444444444",
        "amount_paise": "150000",
        "direction": "credit",
        "created_at": "2026-11-09T10:35:00.000Z"
      }
    ]
  }
}
```

---

## 6. Ledger Statement Endpoints

### 6.1 Account Statement with Running Balance

Returns paginated append-only postings for an account with running balance calculations. Accessible by account holders, auditors of the account, and administrators.

- **URL**: `GET /api/accounts/:id/statement`
- **Authentication**: Bearer Token
- **Query Parameters**:
  - `page` (optional, default: `1`): Page number
  - `limit` (optional, default: `20`, max: `100`): Records per page

#### Success Response (`200 OK`)

```json
{
  "account": {
    "id": "22222222-2222-2222-2222-222222222222",
    "account_number": "ACC-IND-1001",
    "name": "Priya Savings",
    "currency": "INR",
    "current_balance_paise": "600000"
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_records": 3,
    "total_pages": 1
  },
  "statement": [
    {
      "posting_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      "transaction_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "transaction_type": "transfer",
      "amount_paise": "-150000",
      "direction": "debit",
      "running_balance_paise": "600000",
      "description": "Vendor invoice payment",
      "created_at": "2026-11-09T10:35:00.000Z"
    },
    {
      "posting_id": "99999999-9999-9999-9999-999999999991",
      "transaction_id": "88888888-8888-8888-8888-888888888888",
      "transaction_type": "withdrawal",
      "amount_paise": "-250000",
      "direction": "debit",
      "running_balance_paise": "750000",
      "description": "Cash withdrawal",
      "created_at": "2026-11-09T10:30:00.000Z"
    },
    {
      "posting_id": "77777777-7777-7777-7777-777777777772",
      "transaction_id": "66666666-6666-6666-6666-666666666666",
      "transaction_type": "deposit",
      "amount_paise": "1000000",
      "direction": "credit",
      "running_balance_paise": "1000000",
      "description": "Initial capital deposit",
      "created_at": "2026-11-09T10:25:00.000Z"
    }
  ]
}
```

---

## 7. Error Handling & Validation Standards

The API returns RFC 7807-compliant error structures. Internal database error traces, connection strings, and credential details are never leaked to callers.

```json
{
  "error": "Descriptive message",
  "code": "STANDARD_ERROR_CODE",
  "details": []
}
```

### Common Standard Error Codes:
- `VALIDATION_ERROR`: Request payload failed Zod schema checks.
- `UNAUTHENTICATED`: No valid JWT was supplied.
- `FORBIDDEN`: Role lacks permission for this action.
- `NOT_FOUND`: Resource was not found or is hidden by RLS.
- `IDEMPOTENCY_PAYLOAD_MISMATCH`: Idempotency key reused with different amount, currency, or payload.
- `INSUFFICIENT_FUNDS`: Account balance cannot satisfy debit.
- `FROZEN_ACCOUNT`: Operation attempted on a suspended/frozen account.
- `ALREADY_REVERSED`: Target transaction was already reversed.
- `INTERNAL_ERROR`: Unexpected internal server error.
