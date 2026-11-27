import { describe, expect, test } from "bun:test"
import { AsyncLocalStorage } from "node:async_hooks"
import { type LogRecord, configure, dispose } from "@logtape/logtape"

import { createApp } from "src/app"

const app = createApp({ nodeEnv: "development", corsOrigins: [] })

describe("GET /api/v1/health", () => {
	describe("Happy cases", () => {
		test("returns 204 No Content with empty body and security headers", async () => {
			const response = await app.handle(new Request("http://localhost/api/v1/health"))

			expect(response.status).toBe(204)
			expect(await response.text()).toBe("")
			expect(response.headers.get("x-content-type-options")).toBe("nosniff")
		})
	})

	describe("Unhappy cases", () => {
		test("rejects non-GET methods with 404", async () => {
			const response = await app.handle(new Request("http://localhost/api/v1/health", { method: "POST" }))

			expect(response.status).toBe(404)
		})
	})

	describe("request logging", () => {
		test("is skipped by the request logger while other paths are logged", async () => {
			const records: LogRecord[] = []
			await configure({
				contextLocalStorage: new AsyncLocalStorage(),
				sinks: {
					test: (record: LogRecord) => {
						records.push(record)
					},
				},
				loggers: [{ category: ["elysia"], lowestLevel: "debug", sinks: ["test"] }],
			})

			try {
				await app.handle(new Request("http://localhost/api/v1/health"))
				expect(records).toHaveLength(0)

				await app.handle(new Request("http://localhost/api/v1/unknown"))
				expect(records.length).toBeGreaterThan(0)
			} finally {
				await dispose()
			}
		})
	})
})
