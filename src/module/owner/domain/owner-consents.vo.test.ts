import { describe, expect, test } from "bun:test"

import { DomainValidationError } from "src/core/errors"
import { OwnerConsents } from "./owner-consents.vo"

describe("OwnerConsents", () => {
	describe("createInitial", () => {
		describe("Happy cases", () => {
			test("creates all five PDPA consent records when privacyPolicy is true", () => {
				const result = OwnerConsents.createInitial({
					privacyPolicy: true,
					marketing: true,
					appointment: false,
					media: true,
					research: false,
				})

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value.toRecords()).toEqual([
						{ type: "PRIVACY_POLICY", isGranted: true },
						{ type: "MARKETING", isGranted: true },
						{ type: "APPOINTMENT", isGranted: false },
						{ type: "MEDIA", isGranted: true },
						{ type: "RESEARCH", isGranted: false },
					])
				}
			})
		})

		describe("Unhappy cases", () => {
			test("rejects when privacyPolicy is false", () => {
				const result = OwnerConsents.createInitial({
					privacyPolicy: false,
					marketing: true,
					appointment: true,
					media: false,
					research: false,
				})

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(DomainValidationError)
				}
			})
		})
	})
})
