import { elysiaLogger } from "@logtape/elysia"

export function newLoggerPlugin() {
	return elysiaLogger({
		context: true,
		format: "structured-combined",
	})
}
