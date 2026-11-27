import { getLogger } from "@logtape/logtape"
import { Kysely, sql } from "kysely"
import { PostgresJSDialect } from "kysely-postgres-js"
import { type Result, ResultAsync, err, ok } from "neverthrow"
import postgres from "postgres"

const IDLE_TIMEOUT_SECONDS = 20
const MAX_LIFETIME_SECONDS = 1800 // 30 minutes
const RW_LOCK_TIMEOUT_MS = 3000
const RW_IDLE_IN_TX_TIMEOUT_MS = 10000
const RO_IDLE_IN_TX_TIMEOUT_MS = 5000
const READY_DEADLINE_MS = 30_000
const READY_INITIAL_BACKOFF_MS = 250
const READY_MAX_BACKOFF_MS = 2000

const logger = getLogger(["app", "db"])

// Placeholder until `bun run db:types` generates src/shared/db/generated/db.d.ts.
type DbSchema = unknown

export type DbPools = {
	readonly rw: Kysely<DbSchema>
	readonly ro: Kysely<DbSchema>
	destroy(): Promise<void>
}

export type DbPoolConfig = {
	rwUrl: string
	roUrl: string
	rwMax: number
	roMax: number
	connectTimeoutSeconds: number
	rwStatementTimeoutMs: number
	roStatementTimeoutMs: number
	prepare: boolean
}

export function createDbPools(cfg: DbPoolConfig): DbPools {
	const rw = new Kysely<DbSchema>({
		dialect: new PostgresJSDialect({
			postgres: postgres(cfg.rwUrl, {
				max: cfg.rwMax,
				connect_timeout: cfg.connectTimeoutSeconds,
				idle_timeout: IDLE_TIMEOUT_SECONDS,
				max_lifetime: MAX_LIFETIME_SECONDS,
				prepare: cfg.prepare,
				ssl: "prefer",
				connection: {
					application_name: "api-rw",
					statement_timeout: cfg.rwStatementTimeoutMs,
					lock_timeout: RW_LOCK_TIMEOUT_MS,
					idle_in_transaction_session_timeout: RW_IDLE_IN_TX_TIMEOUT_MS,
				},
			}),
		}),
	})

	const ro = new Kysely<DbSchema>({
		dialect: new PostgresJSDialect({
			postgres: postgres(cfg.roUrl, {
				max: cfg.roMax,
				connect_timeout: cfg.connectTimeoutSeconds,
				idle_timeout: IDLE_TIMEOUT_SECONDS,
				max_lifetime: MAX_LIFETIME_SECONDS,
				prepare: cfg.prepare,
				ssl: "prefer",
				connection: {
					application_name: "api-ro",
					default_transaction_read_only: true,
					statement_timeout: cfg.roStatementTimeoutMs,
					idle_in_transaction_session_timeout: RO_IDLE_IN_TX_TIMEOUT_MS,
				},
			}),
		}),
	})

	return {
		rw: rw,
		ro: ro,
		async destroy() {
			await Promise.all([rw.destroy(), ro.destroy()])
		},
	}
}

function toError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause))
}

function pingPools(db: DbPools): ResultAsync<void, Error> {
	const ping = Promise.all([sql`SELECT 1`.execute(db.rw), sql`SELECT 1`.execute(db.ro)])
	return ResultAsync.fromPromise(ping, toError).map(() => undefined)
}

function assertRoReadOnly(db: DbPools): ResultAsync<void, Error> {
	const show = sql<{ default_transaction_read_only: string }>`SHOW default_transaction_read_only`.execute(db.ro)
	return ResultAsync.fromPromise(show, toError).andThen((res) => {
		const value = res.rows[0]?.default_transaction_read_only
		if (value !== "on") {
			return err(new Error(`db.ro must run default_transaction_read_only=on, got ${value ?? "nothing"}`))
		}
		return ok(undefined)
	})
}

// Blocks until both pools answer, retrying with backoff up to READY_DEADLINE_MS. A read-only misconfig on db.ro is permanent, so it is not retried.
export async function waitForDbReady(db: DbPools): Promise<Result<void, Error>> {
	const deadline = Date.now() + READY_DEADLINE_MS
	let backoffMs = READY_INITIAL_BACKOFF_MS

	for (let attempt = 1; ; attempt++) {
		const ping = await pingPools(db)
		if (ping.isOk()) {
			break
		}
		if (Date.now() + backoffMs >= deadline) {
			return err(new Error(`Database not ready after ${READY_DEADLINE_MS}ms: ${ping.error.message}`))
		}

		logger.warn("Database not ready (attempt {attempt}), retrying in {backoffMs}ms: {reason}", {
			attempt: attempt,
			backoffMs: backoffMs,
			reason: ping.error.message,
		})
		await Bun.sleep(backoffMs)
		backoffMs = Math.min(backoffMs * 2, READY_MAX_BACKOFF_MS)
	}

	return await assertRoReadOnly(db)
}
