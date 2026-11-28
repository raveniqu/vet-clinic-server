import { resolve } from "node:path"
import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { Kysely } from "kysely"
import { PostgresJSDialect } from "kysely-postgres-js"
import postgres from "postgres"

import type { DB } from "src/shared/db/generated/db"

const DDL_FILES = [
	"owners/schema.sql",
	"owners/index.sql",
	"owner_addresses/schema.sql",
	"owner_addresses/index.sql",
	"owner_consents/schema.sql",
	"owner_consents/index.sql",
	"running_number_sequences/schema.sql",
	"running_number_sequences/index.sql",
] as const

export type TestPostgres = {
	readonly db: Kysely<DB>
	readonly connectionUri: string
	stop(): Promise<void>
}

export async function startTestPostgres(): Promise<TestPostgres> {
	const container = await new PostgreSqlContainer("postgres:18").withEnvironment({ POSTGRES_INITDB_ARGS: "--locale-provider=icu --icu-locale=th" }).start()

	const connectionUri = container.getConnectionUri()
	const setupClient = postgres(connectionUri)
	try {
		const dbDir = resolve(import.meta.dir, "../../../db")
		for (const file of DDL_FILES) {
			await setupClient.file(resolve(dbDir, file))
		}
	} finally {
		await setupClient.end()
	}

	const db = new Kysely<DB>({
		dialect: new PostgresJSDialect({
			postgres: postgres(connectionUri),
		}),
	})

	return {
		db: db,
		connectionUri: connectionUri,
		async stop() {
			await db.destroy()
			await container.stop()
		},
	}
}
