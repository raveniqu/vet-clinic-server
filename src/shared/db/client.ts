import { Kysely } from "kysely"
import { PostgresJSDialect } from "kysely-postgres-js"
import postgres from "postgres"

const IDLE_TIMEOUT_SECONDS = 20
const MAX_LIFETIME_SECONDS = 1800 // 30 minutes
const RW_LOCK_TIMEOUT_MS = 3000
const RW_IDLE_IN_TX_TIMEOUT_MS = 10000
const RO_IDLE_IN_TX_TIMEOUT_MS = 5000

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
