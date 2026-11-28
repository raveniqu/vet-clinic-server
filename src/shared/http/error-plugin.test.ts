import { describe, expect, test } from "bun:test"
import { AsyncLocalStorage } from "node:async_hooks"
import { type LogRecord, configure, reset } from "@logtape/logtape"
import { Elysia, t } from "elysia"

import { createApp } from "src/app"
import type { ErrorResponseBody } from "src/shared/http/error-plugin"

function createTestApp() {
	const testRoutes = new Elysia({ name: "error-plugin-test-routes" })
		.post("/test/validate", ({ body }) => body, {
			body: t.Object(
				{
					name: t.String({ minLength: 1 }),
					count: t.Integer({ minimum: 1 }),
				},
				{ additionalProperties: false }
			),
		})
		.get("/test/panic", () => {
			throw new Error("secret internal detail: db password")
		})

	return createApp({ nodeEnv: "development", corsOrigins: [] }).use(testRoutes)
}

const app = createTestApp()

describe("error-plugin", () => {
	describe("Happy cases", () => {
		test("passes valid requests through untouched", async () => {
			const response = await app.handle(
				new Request("http://localhost/test/validate", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "Alice", count: 2 }),
				})
			)

			expect(response.status).toBe(200)
			expect(await response.json()).toEqual({ name: "Alice", count: 2 })
		})
	})

	describe("Unhappy cases", () => {
		test("returns 400 with canonical error_message and security headers on malformed JSON", async () => {
			const response = await app.handle(
				new Request("http://localhost/test/validate", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{bad json",
				})
			)

			expect(response.status).toBe(400)
			expect(response.headers.get("x-content-type-options")).toBe("nosniff")
			expect(response.headers.get("cache-control")).toBe("no-store")
			const body = (await response.json()) as ErrorResponseBody
			expect(typeof body.error_message).toBe("string")
			expect(body.error_message.length).toBeGreaterThan(0)
		})

		test("returns 400 without leaking submitted values on TypeBox validation failure", async () => {
			const response = await app.handle(
				new Request("http://localhost/test/validate", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: "SENSITIVE_VALUE_999", count: "not-a-number" }),
				})
			)

			expect(response.status).toBe(400)
			expect(response.headers.get("x-content-type-options")).toBe("nosniff")
			expect(response.headers.get("cache-control")).toBe("no-store")
			const body = (await response.json()) as ErrorResponseBody
			expect(typeof body.error_message).toBe("string")
			expect(body.error_message.length).toBeGreaterThan(0)
			expect(body.error_message).not.toContain("not-a-number")
			expect(body.error_message).not.toContain("SENSITIVE_VALUE_999")
		})

		test("returns 404 with canonical error_message and security headers on unknown route", async () => {
			const response = await app.handle(new Request("http://localhost/test/does-not-exist"))

			expect(response.status).toBe(404)
			expect(response.headers.get("x-content-type-options")).toBe("nosniff")
			expect(response.headers.get("cache-control")).toBe("no-store")
			expect(await response.json()).toEqual({ error_message: "Not Found" })
		})

		test("returns 500 Internal Server Error without leaking details and logs unhandled exceptions", async () => {
			const records: LogRecord[] = []
			await configure({
				reset: true,
				contextLocalStorage: new AsyncLocalStorage(),
				sinks: {
					test: (record: LogRecord) => {
						records.push(record)
					},
				},
				loggers: [{ category: ["app", "http"], lowestLevel: "error", sinks: ["test"] }],
			})

			try {
				const response = await app.handle(new Request("http://localhost/test/panic"))

				expect(response.status).toBe(500)
				expect(response.headers.get("x-content-type-options")).toBe("nosniff")
				expect(response.headers.get("cache-control")).toBe("no-store")
				expect(await response.json()).toEqual({ error_message: "Internal Server Error" })
				expect(records.length).toBe(1)
				expect(records[0]?.level).toBe("error")
			} finally {
				await reset()
			}
		})
	})
})
