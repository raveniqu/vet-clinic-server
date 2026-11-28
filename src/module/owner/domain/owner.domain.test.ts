import { describe, expect, test } from "bun:test"

import { DomainValidationError } from "src/core/errors"
import { Owner } from "./owner.domain"

function makeValidJuristicInput() {
	return {
		prefix: "COMMERCIAL" as const,
		firstName: "  บริษัท สยามเพ็ท จำกัด  ",
		taxId: "0215568005093",
		phoneNo: " 0870957124 ",
		email: " QATest004@Example.COM ",
		lineId: " c.line ",
		acquisitionChannel: "REFERRAL" as const,
		addresses: {
			residential: {
				isDefault: true,
				addressLine: " 999/999 ซอยทดสอบ 99 ",
				subdistrict: " คลองตันเหนือ ",
				district: " วัฒนา ",
				province: " กรุงเทพมหานคร ",
				postalCode: " 10110 ",
			},
			billing: null,
		},
		consents: {
			privacyPolicy: true,
			marketing: false,
			appointment: false,
			media: false,
			research: false,
		},
	}
}

describe("Owner", () => {
	describe("registerNew", () => {
		describe("Happy cases", () => {
			test("creates a valid JURISTIC Owner with trimmed fields, lowercased email, and null personal fields", () => {
				const result = Owner.registerNew(makeValidJuristicInput())

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					const owner = result.value
					expect(owner.type).toBe("JURISTIC")
					expect(owner.prefix).toBe("COMMERCIAL")
					expect(owner.firstName).toBe("บริษัท สยามเพ็ท จำกัด")
					expect(owner.lastName).toBeNull()
					expect(owner.taxId).toBe("0215568005093")
					expect(owner.taxIdHash).toBeNull()
					expect(owner.dateOfBirth).toBeNull()
					expect(owner.gender).toBeNull()
					expect(owner.phoneNo).toBe("0870957124")
					expect(owner.email).toBe("qatest004@example.com")
					expect(owner.lineId).toBe("c.line")
					expect(owner.acquisitionChannel).toBe("REFERRAL")
					expect(owner.addresses.residential.isDefault).toBe(true)
					expect(owner.consents.toRecords()).toHaveLength(5)
				}
			})

			test("allows omitted or null email and lineId", () => {
				const input = makeValidJuristicInput()
				const resultNull = Owner.registerNew({ ...input, email: null, lineId: null })
				const resultOmitted = Owner.registerNew({
					prefix: input.prefix,
					firstName: input.firstName,
					taxId: input.taxId,
					phoneNo: input.phoneNo,
					acquisitionChannel: input.acquisitionChannel,
					addresses: input.addresses,
					consents: input.consents,
				})

				expect(resultNull.isOk()).toBe(true)
				if (resultNull.isOk()) {
					expect(resultNull.value.email).toBeNull()
					expect(resultNull.value.lineId).toBeNull()
				}

				expect(resultOmitted.isOk()).toBe(true)
				if (resultOmitted.isOk()) {
					expect(resultOmitted.value.email).toBeNull()
					expect(resultOmitted.value.lineId).toBeNull()
				}
			})
		})

		describe("Unhappy cases", () => {
			test("rejects whitespace-only required strings (firstName, phoneNo)", () => {
				const input = makeValidJuristicInput()

				const blankName = Owner.registerNew({ ...input, firstName: "   " })
				expect(blankName.isErr()).toBe(true)
				if (blankName.isErr()) {
					expect(blankName.error).toBeInstanceOf(DomainValidationError)
				}

				const blankPhone = Owner.registerNew({ ...input, phoneNo: "\t\n " })
				expect(blankPhone.isErr()).toBe(true)
				if (blankPhone.isErr()) {
					expect(blankPhone.error).toBeInstanceOf(DomainValidationError)
				}
			})

			test("rejects empty or whitespace-only nullable email and lineId", () => {
				const input = makeValidJuristicInput()

				for (const blank of ["", "   "]) {
					const badEmail = Owner.registerNew({ ...input, email: blank })
					expect(badEmail.isErr()).toBe(true)
					if (badEmail.isErr()) {
						expect(badEmail.error).toBeInstanceOf(DomainValidationError)
					}

					const badLineId = Owner.registerNew({ ...input, lineId: blank })
					expect(badLineId.isErr()).toBe(true)
					if (badLineId.isErr()) {
						expect(badLineId.error).toBeInstanceOf(DomainValidationError)
					}
				}
			})

			test("rejects non-13-digit taxId", () => {
				const input = makeValidJuristicInput()

				for (const badTaxId of ["123", "123456789012a", "12345678901234"]) {
					const result = Owner.registerNew({ ...input, taxId: badTaxId })
					expect(result.isErr()).toBe(true)
					if (result.isErr()) {
						expect(result.error).toBeInstanceOf(DomainValidationError)
					}
				}
			})

			test("propagates address and consent domain errors", () => {
				const input = makeValidJuristicInput()

				const badConsent = Owner.registerNew({
					...input,
					consents: { ...input.consents, privacyPolicy: false },
				})
				expect(badConsent.isErr()).toBe(true)
				if (badConsent.isErr()) {
					expect(badConsent.error).toBeInstanceOf(DomainValidationError)
				}

				const bothDefault = Owner.registerNew({
					...input,
					addresses: {
						residential: { ...input.addresses.residential, isDefault: true },
						billing: { ...input.addresses.residential, isDefault: true },
					},
				})
				expect(bothDefault.isErr()).toBe(true)
				if (bothDefault.isErr()) {
					expect(bothDefault.error).toBeInstanceOf(DomainValidationError)
					expect(bothDefault.error.message).toBe("Only one address may be marked as default.")
				}
			})
		})
	})
})
