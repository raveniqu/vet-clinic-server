import { describe, expect, test } from "bun:test"

import { createApp } from "src/app"

const app = createApp({ nodeEnv: "development", corsOrigins: [] })

describe("security headers", () => {
	describe("on handled responses", () => {
		test("includes cache-control no-store", async () => {
			const response = await app.handle(new Request("http://localhost/api/v1/health"))

			expect(response.headers.get("cache-control")).toBe("no-store")
		})

		test("sends strict-transport-security only in production", async () => {
			const productionApp = createApp({ nodeEnv: "production", corsOrigins: [] })

			const productionResponse = await productionApp.handle(new Request("http://localhost/api/v1/health"))
			expect(productionResponse.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains")

			const developmentResponse = await app.handle(new Request("http://localhost/api/v1/health"))
			expect(developmentResponse.headers.get("strict-transport-security")).toBeNull()
		})
	})

	describe("on error responses", () => {
		test("includes the full header set on router 404s", async () => {
			const response = await app.handle(new Request("http://localhost/api/v1/unknown"))

			expect(response.status).toBe(404)
			expect(response.headers.get("x-content-type-options")).toBe("nosniff")
			expect(response.headers.get("x-frame-options")).toBe("DENY")
			expect(response.headers.get("referrer-policy")).toBe("no-referrer")
			expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'")
			expect(response.headers.get("cache-control")).toBe("no-store")
		})

		test("includes the full header set on method-mismatch 404s", async () => {
			const response = await app.handle(new Request("http://localhost/api/v1/health", { method: "POST" }))

			expect(response.status).toBe(404)
			expect(response.headers.get("x-content-type-options")).toBe("nosniff")
			expect(response.headers.get("cache-control")).toBe("no-store")
		})
	})
})
