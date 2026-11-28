import { describe, expect, test } from "bun:test"
import { AsyncLocalStorage } from "node:async_hooks"
import { type LogRecord, configure, reset } from "@logtape/logtape"
import { type Result, err, ok, okAsync } from "neverthrow"

import { createApp } from "src/app"
import { ConflictError, UnexpectedError } from "src/core/errors"
import type { RequestContext } from "src/core/request-context"
import type { UnitOfWork } from "src/core/unit-of-work"
import type { ErrorResponseBody } from "src/shared/http/error-plugin"
import type { OwnerUnitOfWorkRepos } from "./domain/owner.repo"
import { createOwnerRoutes } from "./routes"
import { type RegisterOwnerRequest, type RegisterOwnerResult, RegisterOwnerService, type RegisterOwnerUseCase } from "./use-case/command/register-owner/register-owner.service"

function makeValidPayload() {
	return {
		type: "JURISTIC",
		prefix: "COMMERCIAL",
		first_name: "บริษัท สยามเพ็ท จำกัด",
		tax_id: "0215568005093",
		phone_no: "0870957124",
		email: "QATest004@Example.COM",
		line_id: "c.line",
		acquisition_channel: "REFERRAL",
		addresses: {
			residential: {
				is_default: true,
				address_line: "999/999 ซอยทดสอบ 99",
				subdistrict: "คลองตันเหนือ",
				district: "วัฒนา",
				province: "กรุงเทพมหานคร",
				postal_code: "10110",
			},
			billing: null,
		},
		consents: {
			privacy_policy: true,
			marketing: false,
			appointment: false,
			media: false,
			research: false,
		},
	}
}

function createFakeApp(service: RegisterOwnerUseCase) {
	return createApp({
		nodeEnv: "development",
		corsOrigins: [],
		ownerRoutes: createOwnerRoutes({ registerOwnerService: service }),
	})
}

function createInMemoryServiceApp() {
	let uowRuns = 0
	const uow: UnitOfWork<OwnerUnitOfWorkRepos> = {
		async run<T, E>(work: (repos: OwnerUnitOfWorkRepos) => Promise<Result<T, E>>) {
			uowRuns += 1
			return work({
				sequences: { nextNumber: () => okAsync(1) },
				owners: { create: () => okAsync(42) },
			})
		},
	}
	const service = new RegisterOwnerService(uow, { now: () => new Date("2026-11-28T10:00:00.000Z") })
	return { app: createFakeApp(service), getUowRuns: () => uowRuns }
}

function postOwners(app: ReturnType<typeof createApp>, body: unknown, signal?: AbortSignal) {
	return app.handle(
		new Request("http://localhost/api/v1/owners", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
			signal: signal,
		})
	)
}

describe("POST /api/v1/owners", () => {
	describe("Happy cases", () => {
		test("returns 201 Created with { id }, Location header, and security headers for valid JURISTIC payload", async () => {
			let capturedRequest: RegisterOwnerRequest | null = null
			const app = createFakeApp({
				async execute(_ctx: RequestContext, req: RegisterOwnerRequest): Promise<Result<RegisterOwnerResult, never>> {
					capturedRequest = req
					return ok({ id: 42 })
				},
			})

			const response = await postOwners(app, makeValidPayload())

			expect(response.status).toBe(201)
			expect(response.headers.get("location")).toBe("/api/v1/owners/42")
			expect(response.headers.get("x-content-type-options")).toBe("nosniff")
			expect(response.headers.get("cache-control")).toBe("no-store")
			expect(await response.json()).toEqual({ id: 42 })
			expect(capturedRequest).not.toBeNull()
		})

		test("accepts billing address with is_default: true and omitted/null optional fields", async () => {
			const { app } = createInMemoryServiceApp()
			const payload = makeValidPayload()
			const withBilling = {
				...payload,
				email: undefined,
				line_id: null,
				addresses: {
					residential: {
						address_line: "1/1 Res",
						subdistrict: "Sub1",
						district: "Dist1",
						province: "Prov1",
						postal_code: "10110",
					},
					billing: {
						is_default: true,
						address_line: "2/2 Bill",
						subdistrict: "Sub2",
						district: "Dist2",
						province: "Prov2",
						postal_code: "10200",
					},
				},
			}

			const response = await postOwners(app, withBilling)

			expect(response.status).toBe(201)
			expect(response.headers.get("location")).toBe("/api/v1/owners/42")
			expect(await response.json()).toEqual({ id: 42 })
		})
	})

	describe("Unhappy cases", () => {
		test("returns 400 Bad Request on malformed JSON", async () => {
			const { app } = createInMemoryServiceApp()

			const response = await postOwners(app, "{not valid json")

			expect(response.status).toBe(400)
			const body = (await response.json()) as ErrorResponseBody
			expect(typeof body.error_message).toBe("string")
		})

		test("returns 400 Bad Request on unknown fields or disallowed personal fields (last_name, date_of_birth, gender)", async () => {
			const { app } = createInMemoryServiceApp()
			const base = makeValidPayload()

			for (const badPayload of [
				{ ...base, unknown_field: "nope" },
				{ ...base, last_name: "Smith" },
				{ ...base, date_of_birth: "1990-05-15" },
				{ ...base, gender: "MALE" },
				{ ...base, addresses: { ...base.addresses, extra: true } },
				{ ...base, addresses: { ...base.addresses, residential: { ...base.addresses.residential, extra: true } } },
				{ ...base, consents: { ...base.consents, extra: true } },
			]) {
				const response = await postOwners(app, badPayload)
				expect(response.status).toBe(400)
				const body = (await response.json()) as ErrorResponseBody
				expect(typeof body.error_message).toBe("string")
			}
		})

		test("returns 400 Bad Request on invalid type, enum, tax_id, email syntax, length bounds, or missing addresses.residential", async () => {
			const { app } = createInMemoryServiceApp()
			const base = makeValidPayload()

			for (const badPayload of [
				{ ...base, type: "INDIVIDUAL" },
				{ ...base, prefix: "MR" },
				{ ...base, acquisition_channel: "INSTAGRAM" },
				{ ...base, tax_id: "12345" },
				{ ...base, tax_id: "021556800509A" },
				{ ...base, email: "not-an-email" },
				{ ...base, first_name: "" },
				{ ...base, first_name: "a".repeat(256) },
				{ ...base, phone_no: "0".repeat(31) },
				{ ...base, line_id: "a".repeat(101) },
				{ ...base, addresses: { ...base.addresses, residential: { ...base.addresses.residential, postal_code: "12345678901" } } },
				{ ...base, addresses: { billing: null } },
			]) {
				const response = await postOwners(app, badPayload)
				expect(response.status).toBe(400)
				const body = (await response.json()) as ErrorResponseBody
				expect(typeof body.error_message).toBe("string")
			}
		})

		test("returns 422 Unprocessable Content on domain invariant violations", async () => {
			const { app } = createInMemoryServiceApp()
			const base = makeValidPayload()

			const privacyFalse = await postOwners(app, { ...base, consents: { ...base.consents, privacy_policy: false } })
			expect(privacyFalse.status).toBe(422)

			const bothDefault = await postOwners(app, {
				...base,
				addresses: {
					residential: { ...base.addresses.residential, is_default: true },
					billing: { ...base.addresses.residential, is_default: true },
				},
			})
			expect(bothDefault.status).toBe(422)
			expect(await bothDefault.json()).toEqual({ error_message: "Only one address may be marked as default." })

			for (const badPayload of [
				{ ...base, first_name: "   " },
				{ ...base, phone_no: "   " },
				{ ...base, addresses: { ...base.addresses, residential: { ...base.addresses.residential, address_line: "   " } } },
				{ ...base, email: "" },
				{ ...base, email: "   " },
				{ ...base, line_id: "" },
				{ ...base, line_id: "   " },
			]) {
				const response = await postOwners(app, badPayload)
				expect(response.status).toBe(422)
				const body = (await response.json()) as ErrorResponseBody
				expect(typeof body.error_message).toBe("string")
			}
		})

		test("returns 409 Conflict with exact conflicting field message", async () => {
			const messages = [
				"An active owner with this tax_id already exists.",
				"An active owner with this phone_no already exists.",
				"An active owner with this email already exists.",
				"An active owner with this line_id already exists.",
			] as const

			for (const message of messages) {
				const app = createFakeApp({
					async execute() {
						return err(new ConflictError(message, "uniq_constraint"))
					},
				})

				const response = await postOwners(app, makeValidPayload())

				expect(response.status).toBe(409)
				expect(await response.json()).toEqual({ error_message: message })
			}
		})

		test("returns 500 Internal Server Error without leaking details and logs without PII", async () => {
			const records: LogRecord[] = []
			await configure({
				reset: true,
				contextLocalStorage: new AsyncLocalStorage(),
				sinks: {
					test: (record: LogRecord) => {
						records.push(record)
					},
				},
				loggers: [{ category: ["app", "owner"], lowestLevel: "error", sinks: ["test"] }],
			})

			try {
				const app = createFakeApp({
					async execute() {
						return err(new UnexpectedError("connection refused to pg-primary", new Error("ECONNREFUSED")))
					},
				})

				const response = await postOwners(app, makeValidPayload())

				expect(response.status).toBe(500)
				expect(response.headers.get("x-content-type-options")).toBe("nosniff")
				expect(await response.json()).toEqual({ error_message: "Internal Server Error" })
				expect(records).toHaveLength(1)
				expect(JSON.stringify(records[0])).not.toContain("0215568005093")
			} finally {
				await reset()
			}
		})

		test("fails before opening DB transaction when Request signal is aborted", async () => {
			const records: LogRecord[] = []
			await configure({
				reset: true,
				contextLocalStorage: new AsyncLocalStorage(),
				sinks: {
					test: (record: LogRecord) => {
						records.push(record)
					},
				},
				loggers: [{ category: ["app", "owner"], lowestLevel: "warning", sinks: ["test"] }],
			})

			try {
				const { app, getUowRuns } = createInMemoryServiceApp()
				const controller = new AbortController()
				controller.abort("client closed")

				const response = await postOwners(app, makeValidPayload(), controller.signal)

				expect(response.status).toBe(499)
				expect(await response.json()).toEqual({ error_message: "Client disconnected" })
				expect(getUowRuns()).toBe(0)
				expect(records).toHaveLength(1)
				expect(records[0]?.level).toBe("warning")
				expect(JSON.stringify(records[0])).not.toContain("0215568005093")
			} finally {
				await reset()
			}
		})
	})
})
