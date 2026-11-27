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

export type RetryOptions = {
	deadlineMs: number
	initialBackoffMs: number
	maxBackoffMs: number
	now: () => number
	sleep: (ms: number) => Promise<void>
}

const DEFAULT_RETRY: RetryOptions = {
	deadlineMs: READY_DEADLINE_MS,
	initialBackoffMs: READY_INITIAL_BACKOFF_MS,
	maxBackoffMs: READY_MAX_BACKOFF_MS,
	now: Date.now,
	sleep: Bun.sleep,
}

// Retries probe with backoff until it succeeds or the hard deadline passes. Each attempt is capped by the remaining time, so the deadline holds even when a probe hangs.
export async function retryUntilReady(probe: () => ResultAsync<void, Error>, opts: RetryOptions = DEFAULT_RETRY): Promise<Result<void, Error>> {
	const deadline = opts.now() + opts.deadlineMs
	let backoffMs = opts.initialBackoffMs

	for (let attempt = 1; ; attempt++) {
		const remainingMs = deadline - opts.now()
		let timer: ReturnType<typeof setTimeout> | undefined
		const timeout = new Promise<Result<void, Error>>((resolve) => {
			timer = setTimeout(() => resolve(err(new Error("probe timed out"))), Math.max(remainingMs, 0))
		})
		const result = await Promise.race([probe(), timeout])
		clearTimeout(timer)

		if (result.isOk()) {
			return ok(undefined)
		}
		if (opts.now() + backoffMs >= deadline) {
			return err(new Error(`Database not ready after ${opts.deadlineMs}ms: ${result.error.message}`))
		}

		logger.warn("Database not ready (attempt {attempt}), retrying in {backoffMs}ms: {reason}", {
			attempt: attempt,
			backoffMs: backoffMs,
			reason: result.error.message,
		})
		await opts.sleep(backoffMs)
		backoffMs = Math.min(backoffMs * 2, opts.maxBackoffMs)
	}
}

// Blocks until both pools answer. A read-only misconfig on db.ro is permanent, so it is checked once after connectivity and not retried.
export async function waitForDbReady(db: DbPools): Promise<Result<void, Error>> {
	const ready = await retryUntilReady(() => pingPools(db))
	if (ready.isErr()) {
		return err(ready.error)
	}
	return await assertRoReadOnly(db)
}
