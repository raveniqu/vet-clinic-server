import { elysiaLogger } from "@logtape/elysia"

export function newLoggerPlugin() {
	return elysiaLogger({
		context: true,
		format: "structured-combined",
		skip: (ctx) => ctx.path === "/api/v1/health",
	})
}
