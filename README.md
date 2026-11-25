# ElysiaJS + Bun + Kysely (RW/RO) Starter

Feature-sliced OOP CQRS starter with `postgres.js` + `kysely-postgres-js`, `neverthrow`, LogTape, opaque `session_id` auth, and colocated `bun test` suites.

## Quick Start

```bash
cp .env.example .env
bun install
bun run lint && bun run typecheck
bun test --check
bun run dev
```

## Key Conventions

- **SQL-first schema:** Edit `db/schema.sql`, reset local Postgres (`bun run db:reset`), and regenerate types (`bun run db:types`).
- **RW / RO pools:** Commands use `KyselyUnitOfWork` on `db.rw`; queries use Singleton read repositories on `db.ro` (`default_transaction_read_only=on`).
- **Typed errors:** Return `neverthrow` `Result` / `ResultAsync` everywhere; unwrap via `.match()` in `routes.ts`.
- **Loops & `ctx`:** Prefer Go-style `for...of` loops with explicit `ctx: RequestContext` (`ctx.signal` + `ctx.actor`).
- **Colocated tests:** Keep `*.test.ts` right beside the unit under test; shared DB harness lives in `test/setup.ts`.
