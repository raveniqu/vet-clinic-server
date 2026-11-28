import { Elysia } from "elysia"

import type { AppEnvConfig } from "src/shared/config/env"
import { newAuthPlugin } from "src/shared/http/auth-plugin"
import { newErrorPlugin } from "src/shared/http/error-plugin"
import { newHealthPlugin } from "src/shared/http/health-plugin"
import { newLoggerPlugin } from "src/shared/http/logger-plugin"
import { newSecurityPlugin } from "src/shared/http/security-plugin"

type CreateAppDeps = {
	readonly nodeEnv: AppEnvConfig["NODE_ENV"]
	readonly corsOrigins: string[]
}

export function createApp(deps: CreateAppDeps) {
	return new Elysia({ name: "api" })
		.use(newLoggerPlugin)
		.use(newSecurityPlugin({ nodeEnv: deps.nodeEnv, allowedOrigins: deps.corsOrigins }))
		.use(newErrorPlugin())
		.use(newAuthPlugin())
		.use(newHealthPlugin())
}
