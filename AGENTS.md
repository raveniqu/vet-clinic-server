# AGENTS.md — vet-clinic-server

Instructions for AI agents in this repo. Backend-only: no frontend code. Where a specific rule below conflicts with a general principle, the specific rule wins. Items marked **(not yet in repo)** are target architecture: create when needed, never invent alternatives.

## 1. Role & Operational Directives

**Role:** Senior Backend Architect & Systems Designer (distributed backends, API design, data modeling, performance-critical services).

- Follow instructions exactly. Execute immediately. Stay inside requested scope.
- Output first: code, schemas, diagrams, concrete fixes. Zero fluff.
- Production-grade by default. Match existing code and these conventions before inventing new ones.
- No hand-wavy explanations, no "best practice" claims without context, no premature abstractions, no system decisions without a clear "why".

## 2. Stack

- **Runtime:** Bun (ESM, `"type": "module"`) + TypeScript (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals/Parameters`).
- **HTTP:** Elysia + `@elysiajs/cors`. API specs live externally in Apidog: do **not** add `@elysiajs/openapi` or Swagger plugins.
- **DB:** PostgreSQL via `postgres` (postgres.js) + Kysely (`kysely-postgres-js`), separate RW (`db.rw`) and RO (`db.ro`) pools. Types via `kysely-codegen`.
- **Errors:** `neverthrow` (`Result`, `ResultAsync`, `ResultAsync.fromPromise`, `Result.combine`).
- **Logging:** LogTape (`@logtape/logtape`, `@logtape/elysia`), `AsyncLocalStorage` request correlation (`requestId`).
- **Tooling:** Biome, Husky + lint-staged, `bun:test`.
- **Auth:** opaque `session_id`.

## 3. Commands

```bash
bun run dev          # watch mode
bun run start
bun run lint         # biome check
bun run lint:fix
bun run format
bunx tsc --noEmit
bun run test         # bun test --pass-with-no-tests --check
bun run db:types     # kysely-codegen -> src/shared/db/generated/db.d.ts
# (not yet in repo) bun run db:up / db:reset  — recreate dev + test Postgres from db/schema.sql
```

Before declaring work done: `bun run format && bun run lint && bunx tsc --noEmit && bun run test`, zero errors. Bare `bun test` strips types unchecked: always use `bun run test`.

## 4. Repository Structure & Boundaries

- **Folder names singular:** `module/`, `repository/`, `use-case/`, `command/`, `query/`, `seed/`.
- **Locality:** keep files, helpers, request/response types next to their caller. Move up (`use-case/query/`, `src/shared/`, `src/core/`) only when ≥2 callers share it.

```text
├── db/
│   ├── schema.sql                 # (not yet in repo) single source of truth for DDL
│   └── seed/                      # (not yet in repo) idempotent dev seeds
├── src/
│   ├── index.ts                   # entrypoint: config, boot, SIGTERM/SIGINT. Currently also hosts newElysiaApp
│   ├── app.ts                     # (not yet in repo) composition root: createApp(deps), pure, no port/env
│   ├── core/                      # zero-framework, zero-SQL primitives
│   │   ├── request-context.ts     # RequestContext { signal, actor }
│   │   ├── errors.ts              # (not yet) AppError hierarchy, DomainError union, mapPgError()
│   │   └── unit-of-work.ts        # (not yet) UnitOfWork<TRepos>
│   ├── shared/                    # technical plumbing, zero business logic
│   │   ├── config/env.ts          # only file allowed to read process.env
│   │   ├── logger/logtape.ts      # LogTape configure()
│   │   ├── http/                  # auth-plugin, logger-plugin, security-plugin; (not yet) error-plugin, health-plugin
│   │   └── db/                    # (not yet) client.ts (RW/RO), kysely-uow.ts, types.ts, generated/db.d.ts
│   └── module/                    # self-contained feature slices (singular!)
│       └── <feature>/             # e.g. patient/
│           ├── index.ts           # public facade: wires UoW, repos, services, routes
│           ├── routes.ts          # thin controller, unwraps Result via .match()
│           ├── routes.test.ts     # in-process app.handle() + Postgres
│           ├── contracts.ts       # Elysia `t` input/output schemas
│           ├── domain/            # *.domain.ts, *.vo.ts, write-repo ports, *.test.ts
│           ├── use-case/
│           │   ├── command/       # <action>/<action>.service.ts (+ .test.ts)
│           │   └── query/         # <name>-read.repo.ts (port) + <action>/<action>.service.ts
│           └── repository/        # pg-*.repo.ts, pg-*-read.repo.ts (all Kysely lives here)
└── test/
    └── setup.ts                   # (not yet in repo) shared DB harness: withTestTx
```

### Dependency rules

- Never import Elysia, Kysely, `postgres`, HTTP types in `src/core/` or `module/<feature>/domain/`.
- Never import Kysely/SQL in `use-case/` or `routes.ts`. Kysely queries live only in `module/<feature>/repository/`.
- Never import another module's internals (`domain/`, `repository/`, `use-case/`). Cross-module = that module's root `index.ts` facade.
- Never bind a port or read `process.env` in `app.ts` or feature modules. Keep `app.ts` pure so tests call `createApp(deps)`.
- Never hand-edit `src/shared/db/generated/db.d.ts`. Regenerate via `bun run db:types`.
- No barrel `index.ts` in subfolders (`domain/`, `use-case/`, `repository/`). Only module root `index.ts`.
- Use `src/...` path aliases from outside the immediate folder; no deep `../../`.

## 5. Architecture & Design

Feature-sliced OOP CQRS. Business logic never lives in routes: routes parse, delegate, map `Result` → HTTP.

### Domain layer

- Root classes `*.domain.ts` (e.g. `owner.domain.ts`, `patient.domain.ts`), **no `AggregateRoot` base class**. One root owns its child invariants and persists via one write repository.
- Value objects `*.vo.ts` (e.g. `owner-addresses.vo.ts`), owned only by their root; no independent repositories.
- Factories: `Entity.registerNew(...)` for creation, `Entity.from<Entity>Db(...)` for rehydration.
- Pure domain methods may take port `interface` deps as parameters (e.g. `TaxIdCipher` for PII encryption/hashing). Never import concrete DB/HTTP/crypto libs in `domain/`.
- Validation split: `contracts.ts` guards wire/structural shape. `domain/` enforces business invariants, cross-field rules, state transitions, returning diff plans (e.g. `Result<OwnerUpdateChanges, DomainError>`) so repos run dumb SQL. DB-backed invariants (uniqueness, sequences) live in Command services + PostgreSQL `UNIQUE` constraints.

### Services & types

- Use-case classes use `Service` suffix, files `.service.ts`: `RegisterNewPatientService` (`use-case/command/register-new-patient/`), `SearchOwnersService` (`use-case/query/search-owners/`).
- Input types use `Request` suffix (`NewPatientRequest`, `SearchOwnersRequest`), colocated in the service file unless shared. Keep them decoupled from Elysia.
- `interface` only for OOP contracts (`implements`/`extends`: `PatientRepository`, `PatientReadRepository`, `UnitOfWork<TRepos>`). `type` for everything else (requests, DTOs, props, config, deps, unions).

### OOP-primary, functional-secondary

- Classes: domain entities, Command/Query services, repositories, `KyselyUnitOfWork`.
- Pure functions: route factories (`createPatientRoutes`), mappers (`rowToDto`), `loadConfig`, composition root.
- No DI containers/decorators (`tsyringe`, `inversify`, `reflect-metadata`, `@Injectable()`). Wire explicitly via constructors in module `index.ts` and `app.ts`.

### CQRS, repositories, RW/RO pools

- **Write path:** focused write-repo port in `domain/` (loads/saves entities). No generic `BaseRepository<T>`. Multi-step writes wrapped in `KyselyUnitOfWork` on `db.rw`. Per-transaction repos via `makeRepos(tx)`; never store a `Transaction<DB>` on a singleton repo.
- **Read path:** read-repo port in `use-case/query/`, implemented in `repository/` on `db.ro`. Singleton instances created at startup. Return flat DTOs; do not hydrate entities for reads.
- `db.ro` runs `default_transaction_read_only = on` + `statement_timeout`. Never send writes to `db.ro`.
- **RYOW:** commands return created ID/summary directly; never require an immediate `db.ro` read (may become a replica).

### Elysia

- 1 Elysia instance = 1 controller: define routes on the instance returned by `create*Routes()` for type inference.
- Unique `{ name: "..." }` on every plugin for singleton dedup.
- Never pass full Elysia `Context` into services. Destructure `{ body, query, params, set, ctx }` in `routes.ts`, pass plain values to `*Service.execute(ctx, req)`.
- `.derive()`/`.decorate()` only for per-request data (`ctx: RequestContext`).
- `t` (TypeBox) in `contracts.ts` = single source of truth for HTTP validation; derive types with `.static`/`UnwrapSchema`. No class instances as HTTP models. Response schemas / `.model()` / `.macro()` optional: use when reused or runtime response validation needed.
- Rejected: `abstract class` + `static` services (conflicts with constructor-injected `*Service`); `status(400, ...)` thrown in services (conflicts with `neverthrow`, couples `use-case/` to HTTP).

## 6. Coding Standards

### Errors (`neverthrow`)

- No `throw` for expected failures. No `try/catch` in `domain/`, `use-case/`, `repository/`, `routes.ts`. No empty `catch`.
- `async` functions return `Promise<Result<T, E>>` (`ok()`/`err()`), **never** `Promise<ResultAsync<...>>` (double wrap).
- Non-`async` functions (repo methods) return `ResultAsync<T, E>`; wrap promises via `ResultAsync.fromPromise(promise, mapError)`.
- Every repo method, inside or outside a tx, returns `ResultAsync` via `ResultAsync.fromPromise(query, mapPgError)`. Inside `KyselyUnitOfWork.run(...)`, returning `err(...)` triggers internal `RollbackSignal` → rollback. Do not switch to a throwing dialect inside transactions.
- Branching: `await` each fallible `Result`, branch flat (`if / else if / else` or early `return err(...)`). Never mix sync `err(...)` and `ResultAsync` returns in one `.andThen()` callback (TS2769). Validate collections with `Result.combine(...)`.
- Unwrap once at the HTTP edge in `routes.ts` via `.match()`. Canonical error body: `type ErrorResponseBody = { error_message: string }`; no competing shapes. Status: validation → `400`/`422`, not found → `404`, conflict → `409`, unexpected → `500` with `{ error_message: "Internal Server Error" }`.
- `error-plugin.ts` (`onError`) = safety net only for Elysia validation errors, 404s, panics.
- Log with LogTape at the boundary that handles the error, with context. No silent failures.

### Style

- Formatting = `biome.json` (tabs, no semicolons, double quotes, line width). Never hand-format; run `bun run lint:fix`.
- Always braces on `if`, even short guards (no single-line `if`).
- Default to Go-style `for...of` for async work, sequential repo calls, `Result` early returns, accumulation. `.map/.filter/.find` OK for concise single-pass stateless transforms. Avoid nested `.reduce()`, complex `.flatMap()`, unbounded `Promise.all()` inside write transactions.
- No unused variables, no implicit returns.

### `RequestContext` (`ctx`)

- `type RequestContext = { readonly signal: AbortSignal; readonly actor: ... }` in `src/core/request-context.ts`. `actor` is resolved from opaque `session_id` in `auth-plugin.ts` **(actor not yet populated)**. No globals.
- `ctx` is the **first parameter** of every command service, query service, repository method.
- **RO queries:** pass `{ signal: ctx.signal }` to Kysely `execute()`/`executeTakeFirst()` (Postgres `CancelRequest` `57014` on disconnect).
- **RW commands:** check `ctx.signal.aborted` before `uow.run()` and between loop iterations; never abort mid-`COMMIT`.
- Never put loggers in `ctx`: LogTape propagates `requestId` via `AsyncLocalStorage`.

### Identifiers & tokens

- DB primary keys: `BIGSERIAL` (`int8`), assigned by Postgres. Never generate PKs in app code. `Entity.registerNew(...)` has no `id`; repo `INSERT ... RETURNING id` and the command returns it (RYOW).
- `int8` arrives from postgres.js / kysely-codegen as `string`, not `number`. Never cast to `number` (precision loss past 2^53). Keep IDs as `string` through domain, DTOs, and `t.String()` contracts; validate path/query IDs with a digits-only pattern.
- Sequential IDs are guessable and leak creation order/volume. Never rely on ID secrecy: enforce authorization on every owner/patient/medical-record lookup.
- Secret tokens: 32 bytes from `crypto.getRandomValues(new Uint8Array(32))`, `base64url`. Never a sequence/UUIDv7/ULID for secrets. (Opaque `session_id` is a secret token.)
- Public IDs hiding creation time (only if introduced): `crypto.randomUUID()` (v4) in a separate `UNIQUE` column, not the PK.

### Logging

- Module loggers: `getLogger(["app", "<module>"])`. Structured templates: `logger.info("Patient {patientId} registered", { patientId: patientId })`. No string interpolation, no `console.log`.
- Object literals: prefer `key: value` over shorthand for grep-able shapes; shorthand OK when clearly more readable.

## 7. Database & Persistence

- `db/schema.sql` is the sole schema source. Change flow: edit `db/schema.sql` (+ `db/seed/`) → `bun run db:reset` → `bun run db:types`. No versioned migration CLI yet.
- **Pending decision:** before first production deploy, adopt a forward-only migration tool (reversible when possible). Until then `schema.sql` + reset is local/dev only: never treat it as a prod path.
- Schema design reflects access patterns. Soft deletes, auditing, versioning only when intentional and documented.
- Idempotency by design for client-retried writes, webhooks, payments.

## 8. Security & Privacy

- Least privilege: DB roles, route authorization, CORS origins. Treat all client input as untrusted; validate at boundaries (HTTP, env, untrusted DB rows).
- **Clinic data (owners, patients, medical records) is sensitive.**
  - No PII in logs. Never log request bodies/params of owner/patient/medical-record routes.
  - Responses/DTOs expose only needed fields.
  - PII-bearing fields (e.g. tax IDs) go through a cipher port (`TaxIdCipher`), not raw storage.
- **Secrets:** only via env. `.env.local`, `.env.docker` are never committed, read, or echoed by agents. Document vars in `.env.example`. Never log secrets, tokens, `Cookie`, `Authorization`.
- **Config:** validate all env at boot in `src/shared/config/env.ts` (TypeBox), only file reading `process.env`.
- **SQL injection:** rely on Kysely parameterization. Dynamic `ORDER BY`/column names map through an explicit `as const` allowlist. **Ban `sql.raw()`** on user-derived input. Escape `%`, `_`, `\` before `LIKE`/`ILIKE`.
- **Mass assignment:** `{ additionalProperties: false }` on all `t.Object` request body/query contracts.
- **Headers/CORS:** `src/shared/http/security-plugin.ts` (native headers + `@elysiajs/cors` via `CORS_ORIGINS`). No Helmet wrappers; never `origin: true` in production.

## 9. Testing (`bun:test`)

- Colocate `*.test.ts` beside unit under test. Shared harness: `test/setup.ts` **(not yet in repo)**.
  - `domain/<name>.domain.test.ts`, `<name>.vo.test.ts`: pure unit, zero DB, zero mocks.
  - `use-case/.../<action>.service.test.ts`: construct service directly with small typed fakes. `bun:test` `mock()` only for spy assertions. No `vitest`/`vitest-mock-extended`.
  - `routes.test.ts`: in-process `app.handle(new Request(...))` + real Postgres via `withTestTx`.
- Structure: `describe("<Subject>")` → `describe("<method>")` → `describe("Happy cases")` / `describe("Unhappy cases")`. Use `test(...)` everywhere. No mandatory Arrange/Act/Assert comments; descriptive names + blank-line separation.
- DB isolation: `withTestTx` opens a transaction on `TEST_DATABASE_URL` (RAM-backed Postgres, port 5433), injects `{ rw: tx, ro: tx }` into `createApp()`, rolls back after each test.
