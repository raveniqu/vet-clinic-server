import { describe, expect, test } from "bun:test"

import { DomainValidationError } from "src/core/errors"
import { OwnerAddresses } from "./owner-addresses.vo"

describe("OwnerAddresses", () => {
	describe("create", () => {
		describe("Happy cases", () => {
			test("defaults residential.isDefault to true when billing is omitted", () => {
				const result = OwnerAddresses.create({
					residential: {
						addressLine: " 999/999 ซอยทดสอบ 99 ",
						subdistrict: " คลองตันเหนือ ",
						district: " วัฒนา ",
						province: " กรุงเทพมหานคร ",
						postalCode: " 10110 ",
					},
				})

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value.residential).toEqual({
						type: "RESIDENTIAL",
						isDefault: true,
						addressLine: "999/999 ซอยทดสอบ 99",
						subdistrict: "คลองตันเหนือ",
						district: "วัฒนา",
						province: "กรุงเทพมหานคร",
						postalCode: "10110",
					})
					expect(result.value.billing).toBeNull()
					expect(result.value.toRecords()).toHaveLength(1)
				}
			})

			test("defaults residential.isDefault to true when billing is null or billing.isDefault is false", () => {
				const nullBilling = OwnerAddresses.create({
					residential: {
						isDefault: false,
						addressLine: "1/1",
						subdistrict: "Sub",
						district: "Dist",
						province: "Prov",
						postalCode: "10110",
					},
					billing: null,
				})
				const falseBilling = OwnerAddresses.create({
					residential: {
						addressLine: "1/1",
						subdistrict: "Sub",
						district: "Dist",
						province: "Prov",
						postalCode: "10110",
					},
					billing: {
						isDefault: false,
						addressLine: "2/2",
						subdistrict: "Sub2",
						district: "Dist2",
						province: "Prov2",
						postalCode: "10200",
					},
				})

				expect(nullBilling.isOk()).toBe(true)
				if (nullBilling.isOk()) {
					expect(nullBilling.value.residential.isDefault).toBe(true)
					expect(nullBilling.value.billing).toBeNull()
				}

				expect(falseBilling.isOk()).toBe(true)
				if (falseBilling.isOk()) {
					expect(falseBilling.value.residential.isDefault).toBe(true)
					expect(falseBilling.value.billing?.isDefault).toBe(false)
					expect(falseBilling.value.toRecords()).toHaveLength(2)
				}
			})

			test("marks billing as default and residential as non-default when billing.isDefault is true", () => {
				const result = OwnerAddresses.create({
					residential: {
						isDefault: false,
						addressLine: "1/1",
						subdistrict: "Sub",
						district: "Dist",
						province: "Prov",
						postalCode: "10110",
					},
					billing: {
						isDefault: true,
						addressLine: " 2/2 Billing ",
						subdistrict: " Sub2 ",
						district: " Dist2 ",
						province: " Prov2 ",
						postalCode: " 10200 ",
					},
				})

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					expect(result.value.residential.isDefault).toBe(false)
					expect(result.value.billing).toEqual({
						type: "BILLING",
						isDefault: true,
						addressLine: "2/2 Billing",
						subdistrict: "Sub2",
						district: "Dist2",
						province: "Prov2",
						postalCode: "10200",
					})
					expect(result.value.toRecords()).toHaveLength(2)
				}
			})
		})

		describe("Unhappy cases", () => {
			test("rejects when both residential and billing are marked isDefault true", () => {
				const result = OwnerAddresses.create({
					residential: {
						isDefault: true,
						addressLine: "1/1",
						subdistrict: "Sub",
						district: "Dist",
						province: "Prov",
						postalCode: "10110",
					},
					billing: {
						isDefault: true,
						addressLine: "2/2",
						subdistrict: "Sub2",
						district: "Dist2",
						province: "Prov2",
						postalCode: "10200",
					},
				})

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(DomainValidationError)
					expect(result.error.message).toBe("Only one address may be marked as default.")
				}
			})

			test("rejects whitespace-only required fields in residential or billing", () => {
				const blankResidential = OwnerAddresses.create({
					residential: {
						addressLine: "   ",
						subdistrict: "Sub",
						district: "Dist",
						province: "Prov",
						postalCode: "10110",
					},
				})
				const blankBilling = OwnerAddresses.create({
					residential: {
						addressLine: "1/1",
						subdistrict: "Sub",
						district: "Dist",
						province: "Prov",
						postalCode: "10110",
					},
					billing: {
						addressLine: "2/2",
						subdistrict: "Sub2",
						district: "Dist2",
						province: "Prov2",
						postalCode: "   ",
					},
				})

				expect(blankResidential.isErr()).toBe(true)
				if (blankResidential.isErr()) {
					expect(blankResidential.error).toBeInstanceOf(DomainValidationError)
				}

				expect(blankBilling.isErr()).toBe(true)
				if (blankBilling.isErr()) {
					expect(blankBilling.error).toBeInstanceOf(DomainValidationError)
				}
			})

			test("rejects fields exceeding column length limits", () => {
				const tooLongPostal = OwnerAddresses.create({
					residential: {
						addressLine: "1/1",
						subdistrict: "Sub",
						district: "Dist",
						province: "Prov",
						postalCode: "12345678901",
					},
				})

				expect(tooLongPostal.isErr()).toBe(true)
				if (tooLongPostal.isErr()) {
					expect(tooLongPostal.error).toBeInstanceOf(DomainValidationError)
				}
			})
		})
	})
})
