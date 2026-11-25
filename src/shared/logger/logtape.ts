import { AsyncLocalStorage } from "node:async_hooks"
import { ansiColorFormatter, configure, getConsoleSink, jsonLinesFormatter } from "@logtape/logtape"
import type { AppEnvConfig } from "src/shared/config/env"

export async function setupLogging(conf: Pick<AppEnvConfig, "NODE_ENV" | "LOG_LEVEL">): Promise<void> {
	const isProduction = conf.NODE_ENV === "production"

	await configure({
		contextLocalStorage: new AsyncLocalStorage(),
		sinks: {
			console: getConsoleSink({
				formatter: isProduction ? jsonLinesFormatter : ansiColorFormatter,
			}),
		},
		loggers: [
			{ category: ["app"], lowestLevel: conf.LOG_LEVEL, sinks: ["console"] },
			{ category: ["elysia"], lowestLevel: conf.LOG_LEVEL, sinks: ["console"] },
			{ category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] },
		],
	})
}
