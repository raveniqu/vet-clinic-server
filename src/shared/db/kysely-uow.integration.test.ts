import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { type Kysely, sql } from "kysely"
import { ResultAsync, err, ok } from "neverthrow"

import { ConflictError, type DomainError, DomainValidationError, mapPgError } from "src/core/errors"
import type { DB } from "src/shared/db/generated/db"
import { KyselyUnitOfWork } from "src/shared/db/kysely-uow"
import { type TestPostgres, startTestPostgres } from "src/shared/db/pg-testcontainer"

function createSequenceUow(db: Kysely<DB>) {
	return new KyselyUnitOfWork(db, (tx) => ({
		insertSequence: (prefix: string, date: string, lastNumber: number) =>
			ResultAsync.fromPromise(tx.insertInto("running_number_sequences").values({ prefix: prefix, sequence_date: date, last_number: lastNumber }).execute(), mapPgError),
	}))
}

let pg: TestPostgres

beforeAll(async () => {
	pg = await startTestPostgres()
})

afterAll(async () => {
	if (pg !== undefined) {
		await pg.stop()
	}
})

beforeEach(async () => {
	await sql`TRUNCATE TABLE running_number_sequences`.execute(pg.db)
})

describe("KyselyUnitOfWork (Postgres integration)", () => {
	describe("collation setup", () => {
		test("initializes Postgres 18 database with ICU Thai collation", async () => {
			const result = await sql<{ datlocprovider: string; datlocale: string | null }>`
				SELECT datlocprovider::text, datlocale
				FROM pg_database
				WHERE datname = current_database()
			`.execute(pg.db)

			const row = result.rows[0]
			expect(row?.datlocprovider).toBe("i")
			expect(row?.datlocale).toBe("th")
		})
	})

	describe("run", () => {
		describe("Happy cases", () => {
			test("commits inserted rows when callback returns ok", async () => {
				const uow = createSequenceUow(pg.db)

				const res = await uow.run<string, DomainError>(async (repos) => {
					const inserted = await repos.insertSequence("OWN", "2026-11-28", 1)
					if (inserted.isErr()) {
						return err(inserted.error)
					}
					return ok("OWN-20261128-0001")
				})

				expect(res.isOk()).toBe(true)
				const rows = await pg.db.selectFrom("running_number_sequences").selectAll().execute()
				expect(rows).toHaveLength(1)
				expect(rows[0]?.prefix).toBe("OWN")
				expect(rows[0]?.last_number).toBe("1")
			})
		})

		describe("Unhappy cases", () => {
			test("rolls back inserted rows when callback returns err", async () => {
				const uow = createSequenceUow(pg.db)

				const res = await uow.run<void, DomainError>(async (repos) => {
					const inserted = await repos.insertSequence("OWN", "2026-11-28", 1)
					if (inserted.isErr()) {
						return err(inserted.error)
					}
					return err(new DomainValidationError("simulated domain failure"))
				})

				expect(res.isErr()).toBe(true)
				if (res.isErr()) {
					expect(res.error).toBeInstanceOf(DomainValidationError)
				}
				const rows = await pg.db.selectFrom("running_number_sequences").selectAll().execute()
				expect(rows).toHaveLength(0)
			})

			test("maps Postgres 23505 unique violation to ConflictError with constraint name and rolls back", async () => {
				const uow = createSequenceUow(pg.db)

				const res = await uow.run<void, DomainError>(async (repos) => {
					const first = await repos.insertSequence("OWN", "2026-11-28", 1)
					if (first.isErr()) {
						return err(first.error)
					}
					const second = await repos.insertSequence("OWN", "2026-11-28", 2)
					if (second.isErr()) {
						return err(second.error)
					}
					return ok(undefined)
				})

				expect(res.isErr()).toBe(true)
				if (res.isErr()) {
					expect(res.error).toBeInstanceOf(ConflictError)
					if (res.error instanceof ConflictError) {
						expect(res.error.constraint).toBe("pk_running_number_sequences")
					}
				}
				const rows = await pg.db.selectFrom("running_number_sequences").selectAll().execute()
				expect(rows).toHaveLength(0)
			})
		})
	})
})
