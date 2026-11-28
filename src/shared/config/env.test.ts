import { describe, expect, test } from "bun:test"

import { loadConfig } from "./env"

const VALID_32B_KEY = Buffer.alloc(32, 0x11).toString("base64")
const VALID_64B_KEY = Buffer.alloc(64, 0x22).toString("base64")

function makeRawEnv(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
	return {
		NODE_ENV: "test",
		PORT: "3000",
		LOG_LEVEL: "info",
		CORS_ORIGINS: "http://localhost:5173",
		DATABASE_RW_URL: "postgres://user:pass@localhost:5432/vet_clinic_test",
		TAX_ID_ENCRYPTION_KEY: VALID_32B_KEY,
		TAX_ID_HMAC_KEY: VALID_32B_KEY,
		...overrides,
	}
}

describe("loadConfig", () => {
	describe("Tax ID key validation", () => {
		describe("Happy cases", () => {
			test("decodes valid base64 32-byte TAX_ID_ENCRYPTION_KEY and 32-byte TAX_ID_HMAC_KEY", () => {
				const config = loadConfig(makeRawEnv({}))

				expect(config.TAX_ID_ENCRYPTION_KEY).toBeInstanceOf(Uint8Array)
				expect(config.TAX_ID_ENCRYPTION_KEY.byteLength).toBe(32)
				expect(config.TAX_ID_ENCRYPTION_KEY).toEqual(new Uint8Array(32).fill(0x11))

				expect(config.TAX_ID_HMAC_KEY).toBeInstanceOf(Uint8Array)
				expect(config.TAX_ID_HMAC_KEY.byteLength).toBe(32)
				expect(config.TAX_ID_HMAC_KEY).toEqual(new Uint8Array(32).fill(0x11))
			})

			test("accepts TAX_ID_HMAC_KEY longer than 32 decoded bytes", () => {
				const config = loadConfig(makeRawEnv({ TAX_ID_HMAC_KEY: VALID_64B_KEY }))

				expect(config.TAX_ID_HMAC_KEY.byteLength).toBe(64)
				expect(config.TAX_ID_HMAC_KEY).toEqual(new Uint8Array(64).fill(0x22))
			})
		})

		describe("Exception cases", () => {
			test("throws when TAX_ID_ENCRYPTION_KEY or TAX_ID_HMAC_KEY is missing or empty", () => {
				expect(() => loadConfig(makeRawEnv({ TAX_ID_ENCRYPTION_KEY: undefined }))).toThrow()
				expect(() => loadConfig(makeRawEnv({ TAX_ID_ENCRYPTION_KEY: "" }))).toThrow()
				expect(() => loadConfig(makeRawEnv({ TAX_ID_HMAC_KEY: undefined }))).toThrow()
				expect(() => loadConfig(makeRawEnv({ TAX_ID_HMAC_KEY: "" }))).toThrow()
			})

			test("throws on invalid base64 (non-base64 chars, whitespace, bad padding, non-canonical trailing bits)", () => {
				const nonCanonical32B = `${VALID_32B_KEY.slice(0, -3)}B==`
				for (const bad of ["not-valid-base64!", ` ${VALID_32B_KEY}`, `${VALID_32B_KEY} `, "AAAA====", nonCanonical32B]) {
					expect(() => loadConfig(makeRawEnv({ TAX_ID_ENCRYPTION_KEY: bad }))).toThrow()
					expect(() => loadConfig(makeRawEnv({ TAX_ID_HMAC_KEY: bad }))).toThrow()
				}
			})

			test("throws when TAX_ID_ENCRYPTION_KEY is not exact 32 decoded bytes", () => {
				const key31 = Buffer.alloc(31, 0x11).toString("base64")
				const key33 = Buffer.alloc(33, 0x11).toString("base64")

				expect(() => loadConfig(makeRawEnv({ TAX_ID_ENCRYPTION_KEY: key31 }))).toThrow(/TAX_ID_ENCRYPTION_KEY/)
				expect(() => loadConfig(makeRawEnv({ TAX_ID_ENCRYPTION_KEY: key33 }))).toThrow(/TAX_ID_ENCRYPTION_KEY/)
			})

			test("throws when TAX_ID_HMAC_KEY is less than 32 decoded bytes", () => {
				const key31 = Buffer.alloc(31, 0x22).toString("base64")

				expect(() => loadConfig(makeRawEnv({ TAX_ID_HMAC_KEY: key31 }))).toThrow(/TAX_ID_HMAC_KEY/)
			})
		})
	})
})
