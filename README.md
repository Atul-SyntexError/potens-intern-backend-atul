# Tamper-Evident Append-Only Log Service

A lightweight, cryptographically-chained audit log service built with Node.js. Every entry is hashed and linked to the one before it — if anyone tampers with a record, the chain breaks and verification fails instantly.

---

## Project Overview

This service provides an **append-only log** where each entry is linked to its predecessor via a SHA-256 hash chain — the same fundamental concept behind blockchains and certificate transparency logs. The key properties:

- **Append-only**: Entries can only be added, never modified or deleted through the API.
- **Tamper-evident**: Any modification to an existing entry breaks the hash chain, which is detectable through verification.
- **Auditable**: The full chain can be verified in a single request to prove no records have been altered.

This is useful for audit trails, compliance logging, access logs, and any scenario where you need to prove that historical records haven't been changed after the fact.

---

## Architecture

```
Client Request
      │
      ▼
┌─────────────────┐
│   Express App    │  ← JSON parsing, request logging
├─────────────────┤
│   Middleware     │  ← Auth (API key), Rate Limiting, Error Handling
├─────────────────┤
│   Routes         │  ← Endpoint definitions, request routing
├─────────────────┤
│   Controllers    │  ← Input validation (Zod), response formatting
├─────────────────┤
│   Services       │  ← Business logic, hash chain operations
├─────────────────┤
│   Prisma ORM     │  ← Data access, transactions
├─────────────────┤
│   SQLite DB      │  ← Persistent storage
└─────────────────┘
```

Each layer has a single responsibility. Controllers never touch the database directly. Services don't know about HTTP status codes. This makes the code easy to test — you can test services in isolation without spinning up a server.

---

## How the Hash Chain Works

Each log entry's hash is computed from its own data **plus** the hash of the previous entry, creating an unbreakable chain:

```
Entry #1 (Genesis)
├── id: 1
├── actor: "system"
├── action: "server.start"
├── payload: '{"version":"1.0.0"}'
├── prevHash: null
└── hash: SHA-256("1|system|server.start|{...}|GENESIS")
              = "a3f2...8b01"

Entry #2
├── id: 2
├── actor: "alice"
├── action: "user.login"
├── payload: '{"ip":"192.168.1.10"}'
├── prevHash: "a3f2...8b01"  ← points to Entry #1's hash
└── hash: SHA-256("2|alice|user.login|{...}|a3f2...8b01")
              = "7c91...d4e2"

Entry #3
├── id: 3
├── actor: "alice"
├── action: "document.create"
├── payload: '{"title":"Q4 Report"}'
├── prevHash: "7c91...d4e2"  ← points to Entry #2's hash
└── hash: SHA-256("3|alice|document.create|{...}|7c91...d4e2")
              = "e5b8...1fa9"
```

**What happens if someone tampers with Entry #2?** The recomputed hash of Entry #2 won't match the stored hash, *and* Entry #3's `prevHash` will no longer match Entry #2's actual hash. The verification endpoint catches both cases.

---

## Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- No external database setup needed — SQLite runs as a file

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd tamper-evident-log

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Initialize the database
npx prisma migrate dev --name init

# (Optional) Seed sample data
npm run db:seed

# Start the dev server
npm run dev
```

The server starts at `http://localhost:3000`. Hit `GET /health` to confirm it's running.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3000` |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` |
| `DATABASE_URL` | SQLite database file path | `file:./dev.db` |
| `API_KEY` | Secret key for API authentication | *(required)* |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `30` |

---

## API Reference

All endpoints except `/health` require the `x-api-key` header.

### Health Check

```
GET /health
```

No authentication required.

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-05-21T12:00:00.000Z"
}
```

---

### Create Log Entry

```
POST /log
```

Appends a new entry to the hash chain.

**Headers**: `x-api-key: your-api-key`, `Content-Type: application/json`

**Body**:
| Field | Type | Required | Description |
|---|---|---|---|
| `actor` | string | Yes | Who performed the action (1-255 chars) |
| `action` | string | Yes | What was done (1-255 chars) |
| `payload` | any | Yes | Arbitrary JSON data for context |

```bash
curl -X POST http://localhost:3000/log \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-change-in-production" \
  -d '{"actor": "alice", "action": "user.login", "payload": {"ip": "192.168.1.10"}}'
```

```json
{
  "success": true,
  "data": {
    "id": 1,
    "actor": "alice",
    "action": "user.login",
    "payload": "{\"ip\":\"192.168.1.10\"}",
    "hash": "a3f2...8b01",
    "prevHash": null,
    "createdAt": "2026-05-21T12:00:00.000Z"
  }
}
```

---

### Get Log Entry

```
GET /log/:id
```

Retrieves a single entry and verifies its hash integrity inline.

```bash
curl http://localhost:3000/log/1 \
  -H "x-api-key: dev-api-key-change-in-production"
```

```json
{
  "success": true,
  "data": {
    "id": 1,
    "actor": "alice",
    "action": "user.login",
    "payload": "{\"ip\":\"192.168.1.10\"}",
    "hash": "a3f2...8b01",
    "prevHash": null,
    "createdAt": "2026-05-21T12:00:00.000Z",
    "verification": {
      "isValid": true,
      "message": "Hash verification passed"
    }
  }
}
```

---

### Verify Chain Integrity

```
GET /verify
```

Walks the entire chain from genesis to the latest entry, verifying every hash and link.

```bash
curl http://localhost:3000/verify \
  -H "x-api-key: dev-api-key-change-in-production"
```

```json
{
  "success": true,
  "data": {
    "chainValid": true,
    "totalEntries": 5,
    "message": "All entries verified — chain integrity intact"
  }
}
```

If tampering is detected:

```json
{
  "success": true,
  "data": {
    "chainValid": false,
    "totalEntries": 5,
    "firstBrokenEntry": 3,
    "message": "Chain integrity broken at entry 3"
  }
}
```

---

### Export Logs

```
GET /export
```

Returns filtered log entries. All query parameters are optional.

**Query Parameters**:
| Param | Type | Description |
|---|---|---|
| `actor` | string | Filter by exact actor name |
| `startDate` | ISO 8601 | Entries created on or after this date |
| `endDate` | ISO 8601 | Entries created on or before this date |

```bash
curl "http://localhost:3000/export?actor=alice" \
  -H "x-api-key: dev-api-key-change-in-production"
```

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": 2,
      "actor": "alice",
      "action": "user.login",
      "payload": "{\"ip\":\"192.168.1.10\"}",
      "hash": "7c91...d4e2",
      "prevHash": "a3f2...8b01",
      "createdAt": "2026-05-21T12:00:01.000Z"
    }
  ]
}
```

---

## Folder Structure

```
├── prisma/
│   └── schema.prisma          # Database schema (LogEntry model)
├── src/
│   ├── config/
│   │   └── index.ts            # Environment variable loading
│   ├── controllers/
│   │   └── log.controller.ts   # Request handling, input validation
│   ├── middleware/
│   │   ├── auth.middleware.ts   # API key validation (constant-time)
│   │   ├── errorHandler.middleware.ts  # Centralized error handling
│   │   └── rateLimiter.middleware.ts   # Rate limiting on writes
│   ├── routes/
│   │   ├── index.ts            # Route aggregation
│   │   └── log.routes.ts       # Endpoint definitions
│   ├── scripts/
│   │   └── seed.ts             # Database seeding script
│   ├── services/
│   │   └── log.service.ts      # Core business logic, hash chaining
│   ├── tests/
│   │   ├── setup.ts            # Test lifecycle hooks (DB cleanup)
│   │   └── log.test.ts         # Unit and integration tests
│   ├── utils/
│   │   ├── hash.ts             # SHA-256 hash computation
│   │   ├── logger.ts           # Pino logger (silent in tests)
│   │   └── prisma.ts           # Prisma client singleton
│   ├── validations/
│   │   └── log.validation.ts   # Zod schemas for request validation
│   ├── app.ts                  # Express app setup (no listen)
│   └── index.ts                # Server entrypoint (listen)
├── .env.example                # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

---

## Design Decisions

### Why SQLite?
Zero configuration, no separate database process, single-file storage. Perfect for a project where the focus is on the hash-chaining logic, not database ops. The database is just a file — clone the repo, run a migration, and you're up.

### Why SHA-256?
Industry-standard cryptographic hash function. Used everywhere from TLS certificates to Git commits. The 256-bit output makes collision attacks computationally infeasible.

### Why Prisma interactive transactions?
Two concurrent `POST /log` requests could read the same "last entry" and both write entries with the same `prevHash`, forking the chain. Prisma's `$transaction` with an interactive callback serializes these operations — the second caller blocks until the first commits.

### Why constant-time API key comparison?
A naive `===` comparison leaks information through timing: an attacker can determine how many characters of their guess are correct by measuring response times. `crypto.timingSafeEqual` compares in constant time regardless of where the mismatch occurs.

### Why Express 5?
Express 5 natively catches errors thrown in `async` route handlers and forwards them to the error-handling middleware. No need for `express-async-errors` or manual try/catch wrappers in every controller.

### Why separate `app.ts` and `index.ts`?
`app.ts` exports the configured Express app without calling `listen()`. This makes it testable — tests can import the app without starting a server. `index.ts` is the only file that actually binds to a port.

---

## Tradeoffs & Limitations

| Tradeoff | Detail |
|---|---|
| **Single API key** | All clients share one key. Fine for internal tools; not suitable for multi-tenant production use. |
| **SQLite** | Great for development and low-write workloads. Not suitable for high write throughput or horizontal scaling. |
| **Full chain verification** | `GET /verify` loads all entries into memory. Works for thousands of entries; would need batching for millions. |
| **No pagination on export** | `GET /export` returns all matching entries. Large result sets could be slow. |
| **Sequential appends** | The transaction lock serializes writes. This is by design (ensures chain integrity) but limits write concurrency. |

---

## Future Improvements

- **Merkle tree verification** — O(log n) verification instead of O(n) full chain walk
- **JWT authentication** — Multi-tenant support with per-user tokens and role-based access
- **Pagination** — Cursor-based pagination on the export endpoint
- **WebSocket streaming** — Real-time log streaming for monitoring dashboards
- **Prometheus metrics** — Request latency, chain length, verification time
- **Batched verification** — Verify the chain in chunks for large datasets
- **Digital signatures** — Sign each entry with the server's private key for non-repudiation

---

## Running Tests

Tests run against a real SQLite database (not mocked). The test setup cleans the database between each test for full isolation.

```bash
# Run all tests once
npm run test

# Run in watch mode during development
npm run test:watch
```

---

## AI Disclosure

AI tools (GitHub Copilot, ChatGPT) were used for boilerplate generation, code review, and documentation drafting. All code was reviewed, understood, and tested by the author. Architectural decisions and implementation logic are original work.

---

## License

MIT — see [LICENSE](./LICENSE) for details.
