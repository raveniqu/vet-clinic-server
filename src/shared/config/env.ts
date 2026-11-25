import { type Static, Type } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"

const EnvSchema = Type.Object({
	NODE_ENV: Type.Union([Type.Literal("development"), Type.Literal("test"), Type.Literal("production")], { default: "development" }),
	PORT: Type.Number({ default: 3000, minimum: 1, maximum: 65535 }),
	LOG_LEVEL: Type.Union([Type.Literal("debug"), Type.Literal("info"), Type.Literal("warning"), Type.Literal("error")], { default: "info" }),
	CORS_ORIGINS: Type.String({ default: "http://localhost:5173" }),
	// DATABASE_RW_URL: Type.String({ minLength: 1 }),
	// DATABASE_RO_URL: Type.Optional(Type.String({ minLength: 1 })),
	// DB_RW_MAX_POOL: Type.Number({ default: 5, minimum: 1 }),
	// DB_RO_MAX_POOL: Type.Number({ default: 5, minimum: 1 }),
	// DB_RO_STATEMENT_TIMEOUT_MS: Type.Number({ default: 5000, minimum: 100 }),
})

export type AppEnvConfig = {
	readonly NODE_ENV: Static<typeof EnvSchema>["NODE_ENV"]
	readonly PORT: number
	readonly LOG_LEVEL: Static<typeof EnvSchema>["LOG_LEVEL"]
	readonly CORS_ORIGINS: string[]
	// readonly databaseRwUrl: string;
	// readonly databaseRoUrl: string;
	// dbRwMaxPool: number;
	// dbRoMaxPool: number;
	// dbRoStatementTimeoutMs: number;
}

export function loadConfig(raw: Record<string, string | undefined>): Readonly<AppEnvConfig> {
	const coerced = Value.Convert(EnvSchema, { ...raw })
	if (!Value.Check(EnvSchema, coerced)) {
		const errors = [...Value.Errors(EnvSchema, coerced)].map((e) => `${e.path}: ${e.message}`).join("; ")
		throw new Error(`Invalid environment configuration: ${errors}`)
	}
	const parsed = coerced as Static<typeof EnvSchema>
	const origins = parsed.CORS_ORIGINS.split(",")
		.map((o) => o.trim())
		.filter((o) => o.length > 0)

	return {
		NODE_ENV: parsed.NODE_ENV,
		PORT: parsed.PORT,
		LOG_LEVEL: parsed.LOG_LEVEL,
		CORS_ORIGINS: origins,
		// databaseRwUrl: parsed.DATABASE_URL,
		// databaseRoUrl: parsed.DATABASE_RO_URL ?? parsed.DATABASE_URL,
		// dbRwMaxPool: parsed.DB_RW_MAX_POOL,
		// dbRoMaxPool: parsed.DB_RO_MAX_POOL,
		// dbRoStatementTimeoutMs: parsed.DB_RO_STATEMENT_TIMEOUT_MS,
	}
}
