declare module "bun" {
	interface Env {
		NODE_ENV: "development" | "test" | "production"
		PORT?: string
		LOG_LEVEL?: "debug" | "info" | "warning" | "error"
		CORS_ORIGINS?: string
		DATABASE_URL: string
		DATABASE_RO_URL?: string
		DB_RW_MAX_POOL?: string
		DB_RO_MAX_POOL?: string
		DB_RO_STATEMENT_TIMEOUT_MS?: string
		TEST_DATABASE_URL?: string
		TZ?: string
	}
}

export {}
