import { getLogger } from "@logtape/logtape"
import { Elysia } from "elysia"

import { type AppEnvConfig, loadConfig } from "src/shared/config/env"
import { newAuthPlugin } from "src/shared/http/auth-plugin"
import { newLoggerPlugin } from "src/shared/http/logger-plugin"
import { newSecurityPlugin } from "src/shared/http/security-plugin"
import { setupLogging } from "src/shared/logger/logtape"

const conf = loadConfig(process.env)
await setupLogging(conf)

const logger = getLogger(["app", "bootstrap"])

const app = newElysiaApp({
	nodeEnv: conf.NODE_ENV,
	corsOrigins: conf.CORS_ORIGINS,
}).listen({
	port: conf.PORT,
	maxRequestBodySize: 7 * 1024 * 1024, // 7 MB cap
})

logger.info("Server listening on port {port}", { port: conf.PORT, env: conf.NODE_ENV })

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => void gracefulShutdown("SIGINT"))

let shuttingDown = false

async function gracefulShutdown(signal: string) {
	if (shuttingDown) {
		return
	}

	shuttingDown = true
	logger.info("Received {signal}, shutting down server", { signal: signal })

	const timer = setTimeout(() => {
		logger.error("Forced exit after shutdown timeout")

		process.exit(1)
	}, 11_000)

	await app.stop()
	clearTimeout(timer)

	logger.info("Graceful shutdown complete")
	process.exit(0)
}

type ElysiaProps = {
	nodeEnv: AppEnvConfig["NODE_ENV"]
	corsOrigins: string[]
	// db: DbPools
	// sessions: SessionStore
}

function newElysiaApp(props: ElysiaProps) {
	return new Elysia({ name: "api" })
		.use(newLoggerPlugin)
		.use(newSecurityPlugin({ nodeEnv: props.nodeEnv, allowedOrigins: props.corsOrigins }))
		.use(newAuthPlugin())
}
