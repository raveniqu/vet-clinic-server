import { describe, expect, test } from "bun:test"

import { UnexpectedError } from "src/core/errors"
import { parseSafePositiveInt8 } from "./pg-int8"

describe("parseSafePositiveInt8", () => {
	describe("Happy cases", () => {
		test("parses positive safe integer strings and numbers", () => {
			for (const [input, expected] of [
				["1", 1],
				["42", 42],
				["9007199254740991", Number.MAX_SAFE_INTEGER],
				[7, 7],
				[BigInt(99), 99],
			] as const) {
				const result = parseSafePositiveInt8(input, "owners.id")
				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value).toBe(expected)
				}
			}
		})
	})

	describe("Unhappy cases", () => {
		test("returns UnexpectedError for unsafe, zero, negative, or non-integer values", () => {
			for (const bad of ["9007199254740992", "9223372036854775807", "0", "-1", "abc", "", "1.5", "01"]) {
				const result = parseSafePositiveInt8(bad, "owners.id")
				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(UnexpectedError)
				}
			}
		})
	})
})
