import { type Static, Type } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"

const EnvSchema = Type.Object({
	NODE_ENV: Type.Union([Type.Literal("development"), Type.Literal("test"), Type.Literal("production")], { default: "development" }),
	PORT: Type.Number({ default: 3000, minimum: 1, maximum: 65535 }),
	LOG_LEVEL: Type.Union([Type.Literal("debug"), Type.Literal("info"), Type.Literal("warning"), Type.Literal("error")], { default: "info" }),
	CORS_ORIGINS: Type.String({ default: "http://localhost:5173" }),
	DATABASE_RW_URL: Type.String({ minLength: 1 }),
	DATABASE_RO_URL: Type.Optional(Type.String({ minLength: 1 })),
	DATABASE_RW_MAX_POOL: Type.Number({ default: 1, minimum: 1 }),
	DATABASE_RO_MAX_POOL: Type.Number({ default: 1, minimum: 1 }),
	DATABASE_CONNECT_TIMEOUT_SECONDS: Type.Number({ default: 10, minimum: 1 }),
	DATABASE_RW_STATEMENT_TIMEOUT_MS: Type.Number({ default: 10000, minimum: 100 }),
	DATABASE_RO_STATEMENT_TIMEOUT_MS: Type.Number({ default: 5000, minimum: 100 }),
	DATABASE_PREPARE: Type.Boolean({ default: true }),
	TAX_ID_ENCRYPTION_KEY: Type.String({ minLength: 1 }),
	TAX_ID_HMAC_KEY: Type.String({ minLength: 1 }),
})

const STRICT_HEX_PATTERN = /^(?:[0-9a-fA-F]{2})+$/

function decodeStrictHexKey(raw: string, varName: string): Uint8Array {
	if (!STRICT_HEX_PATTERN.test(raw)) {
		throw new Error(`Invalid environment configuration: /${varName}: must be valid even-length hex`)
	}
	return new Uint8Array(Buffer.from(raw, "hex"))
}

export type AppEnvConfig = {
	readonly NODE_ENV: Static<typeof EnvSchema>["NODE_ENV"]
	readonly PORT: number
	readonly LOG_LEVEL: Static<typeof EnvSchema>["LOG_LEVEL"]
	readonly CORS_ORIGINS: string[]
	readonly DATABASE_RW_URL: string
	readonly DATABASE_RO_URL: string
	readonly DATABASE_RW_MAX_POOL: number
	readonly DATABASE_RO_MAX_POOL: number
	readonly DATABASE_CONNECT_TIMEOUT_SECONDS: number
	readonly DATABASE_RW_STATEMENT_TIMEOUT_MS: number
	readonly DATABASE_RO_STATEMENT_TIMEOUT_MS: number
	readonly DATABASE_PREPARE: boolean
	readonly TAX_ID_ENCRYPTION_KEY: Uint8Array
	readonly TAX_ID_HMAC_KEY: Uint8Array
}

export function loadConfig(raw: Record<string, string | undefined>): Readonly<AppEnvConfig> {
	const coerced = Value.Convert(EnvSchema, Value.Default(EnvSchema, { ...raw }))
	if (!Value.Check(EnvSchema, coerced)) {
		const errors = [...Value.Errors(EnvSchema, coerced)].map((e) => `${e.path}: ${e.message}`).join("; ")
		throw new Error(`Invalid environment configuration: ${errors}`)
	}
	const parsed = coerced as Static<typeof EnvSchema>
	const origins = parsed.CORS_ORIGINS.split(",")
		.map((o) => o.trim())
		.filter((o) => o.length > 0)

	const taxIdEncryptionKey = decodeStrictHexKey(parsed.TAX_ID_ENCRYPTION_KEY, "TAX_ID_ENCRYPTION_KEY")
	if (taxIdEncryptionKey.byteLength !== 32) {
		throw new Error(`Invalid environment configuration: /TAX_ID_ENCRYPTION_KEY: expected 32 decoded bytes, got ${taxIdEncryptionKey.byteLength}`)
	}

	const taxIdHmacKey = decodeStrictHexKey(parsed.TAX_ID_HMAC_KEY, "TAX_ID_HMAC_KEY")
	if (taxIdHmacKey.byteLength < 32) {
		throw new Error(`Invalid environment configuration: /TAX_ID_HMAC_KEY: expected at least 32 decoded bytes, got ${taxIdHmacKey.byteLength}`)
	}

	return {
		NODE_ENV: parsed.NODE_ENV,
		PORT: parsed.PORT,
		LOG_LEVEL: parsed.LOG_LEVEL,
		CORS_ORIGINS: origins,
		DATABASE_RW_URL: parsed.DATABASE_RW_URL,
		DATABASE_RO_URL: parsed.DATABASE_RO_URL ?? parsed.DATABASE_RW_URL,
		DATABASE_RW_MAX_POOL: parsed.DATABASE_RW_MAX_POOL,
		DATABASE_RO_MAX_POOL: parsed.DATABASE_RO_MAX_POOL,
		DATABASE_CONNECT_TIMEOUT_SECONDS: parsed.DATABASE_CONNECT_TIMEOUT_SECONDS,
		DATABASE_RW_STATEMENT_TIMEOUT_MS: parsed.DATABASE_RW_STATEMENT_TIMEOUT_MS,
		DATABASE_RO_STATEMENT_TIMEOUT_MS: parsed.DATABASE_RO_STATEMENT_TIMEOUT_MS,
		DATABASE_PREPARE: parsed.DATABASE_PREPARE,
		TAX_ID_ENCRYPTION_KEY: taxIdEncryptionKey,
		TAX_ID_HMAC_KEY: taxIdHmacKey,
	}
}
