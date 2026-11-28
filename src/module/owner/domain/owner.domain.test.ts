import { describe, expect, test } from "bun:test"
import { err, ok } from "neverthrow"

import { DomainValidationError, UnexpectedError } from "src/core/errors"
import { Owner } from "./owner.domain"
import type { TaxIdCipher } from "./tax-id-cipher"

const TODAY_BANGKOK_ISO = "2026-11-28"

function createFakeCipher(overrides?: Partial<TaxIdCipher>): { readonly cipher: TaxIdCipher; readonly calls: { encrypt: string[]; hash: string[] } } {
	const calls = { encrypt: [] as string[], hash: [] as string[] }
	const cipher: TaxIdCipher = {
		encrypt(plainTaxId: string) {
			calls.encrypt.push(plainTaxId)
			return ok(`enc:${plainTaxId}`)
		},
		decrypt(encryptedTaxId: string) {
			return ok(encryptedTaxId.replace(/^enc:/, ""))
		},
		hash(plainTaxId: string) {
			calls.hash.push(plainTaxId)
			return ok(`hash:${plainTaxId}`.padEnd(64, "0"))
		},
		...overrides,
	}
	return { cipher: cipher, calls: calls }
}

function makeValidJuristicInput() {
	return {
		type: "JURISTIC" as const,
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

function makeValidIndividualInput() {
	return {
		type: "INDIVIDUAL" as const,
		prefix: "MR" as const,
		firstName: "  เอกนิติ  ",
		lastName: "  เลี้ยงหมา  ",
		taxId: "8627480061811",
		dateOfBirth: "1990-05-15",
		gender: "MALE" as const,
		phoneNo: " 0921874669 ",
		email: " QATest001@Example.COM ",
		lineId: " a.line ",
		acquisitionChannel: "WALK_IN" as const,
		addresses: {
			residential: {
				isDefault: true,
				addressLine: " 88/12 ซอยสุขุมวิท 55 ",
				subdistrict: " คลองตันเหนือ ",
				district: " วัฒนา ",
				province: " กรุงเทพมหานคร ",
				postalCode: " 10110 ",
			},
			billing: null,
		},
		consents: {
			privacyPolicy: true,
			marketing: true,
			appointment: false,
			media: false,
			research: false,
		},
	}
}

describe("Owner", () => {
	describe("registerNew", () => {
		describe("Happy cases", () => {
			test("creates a valid JURISTIC Owner with trimmed fields, lowercased email, null personal fields, and without calling cipher", () => {
				const { cipher, calls } = createFakeCipher()
				const result = Owner.registerNew(makeValidJuristicInput(), {
					taxIdCipher: cipher,
					todayBangkokIso: TODAY_BANGKOK_ISO,
				})

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
				expect(calls.encrypt).toEqual([])
				expect(calls.hash).toEqual([])
			})

			test("creates a valid INDIVIDUAL Owner with encrypted taxId, blind index hash, trimmed names, and dateOfBirth", () => {
				const { cipher, calls } = createFakeCipher()
				const result = Owner.registerNew(makeValidIndividualInput(), {
					taxIdCipher: cipher,
					todayBangkokIso: TODAY_BANGKOK_ISO,
				})

				expect(result.isOk()).toBe(true)
				if (result.isOk()) {
					const owner = result.value
					expect(owner.type).toBe("INDIVIDUAL")
					expect(owner.prefix).toBe("MR")
					expect(owner.firstName).toBe("เอกนิติ")
					expect(owner.lastName).toBe("เลี้ยงหมา")
					expect(owner.taxId).toBe("enc:8627480061811")
					expect(owner.taxId).not.toBe("8627480061811")
					expect(owner.taxIdHash).toBe("hash:8627480061811".padEnd(64, "0"))
					expect(owner.dateOfBirth).toBe("1990-05-15")
					expect(owner.gender).toBe("MALE")
					expect(owner.phoneNo).toBe("0921874669")
					expect(owner.email).toBe("qatest001@example.com")
					expect(owner.lineId).toBe("a.line")
				}
				expect(calls.encrypt).toEqual(["8627480061811"])
				expect(calls.hash).toEqual(["8627480061811"])
			})

			test("accepts valid leap day 2024-02-29 and dateOfBirth equal to todayBangkokIso", () => {
				const { cipher } = createFakeCipher()
				const input = makeValidIndividualInput()

				const leapResult = Owner.registerNew({ ...input, dateOfBirth: "2024-02-29" }, { taxIdCipher: cipher, todayBangkokIso: TODAY_BANGKOK_ISO })
				const todayResult = Owner.registerNew({ ...input, dateOfBirth: TODAY_BANGKOK_ISO }, { taxIdCipher: cipher, todayBangkokIso: TODAY_BANGKOK_ISO })

				expect(leapResult.isOk()).toBe(true)
				expect(todayResult.isOk()).toBe(true)
			})

			test("allows omitted or null email and lineId", () => {
				const { cipher } = createFakeCipher()
				const deps = { taxIdCipher: cipher, todayBangkokIso: TODAY_BANGKOK_ISO }
				const input = makeValidJuristicInput()
				const resultNull = Owner.registerNew({ ...input, email: null, lineId: null }, deps)
				const resultOmitted = Owner.registerNew(
					{
						type: input.type,
						prefix: input.prefix,
						firstName: input.firstName,
						taxId: input.taxId,
						phoneNo: input.phoneNo,
						acquisitionChannel: input.acquisitionChannel,
						addresses: input.addresses,
						consents: input.consents,
					},
					deps
				)

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
			test("rejects whitespace-only required strings (firstName, lastName, phoneNo) and overlong lastName", () => {
				const { cipher } = createFakeCipher()
				const deps = { taxIdCipher: cipher, todayBangkokIso: TODAY_BANGKOK_ISO }
				const juristic = makeValidJuristicInput()
				const individual = makeValidIndividualInput()

				const blankName = Owner.registerNew({ ...juristic, firstName: "   " }, deps)
				expect(blankName.isErr()).toBe(true)
				if (blankName.isErr()) {
					expect(blankName.error).toBeInstanceOf(DomainValidationError)
				}

				const blankLastName = Owner.registerNew({ ...individual, lastName: "   " }, deps)
				expect(blankLastName.isErr()).toBe(true)
				if (blankLastName.isErr()) {
					expect(blankLastName.error).toBeInstanceOf(DomainValidationError)
				}

				const longLastName = Owner.registerNew({ ...individual, lastName: "ก".repeat(101) }, deps)
				expect(longLastName.isErr()).toBe(true)
				if (longLastName.isErr()) {
					expect(longLastName.error).toBeInstanceOf(DomainValidationError)
				}

				const blankPhone = Owner.registerNew({ ...juristic, phoneNo: "\t\n " }, deps)
				expect(blankPhone.isErr()).toBe(true)
				if (blankPhone.isErr()) {
					expect(blankPhone.error).toBeInstanceOf(DomainValidationError)
				}
			})

			test("rejects malformed, impossible calendar, and future dateOfBirth for INDIVIDUAL", () => {
				const { cipher, calls } = createFakeCipher()
				const deps = { taxIdCipher: cipher, todayBangkokIso: TODAY_BANGKOK_ISO }
				const individual = makeValidIndividualInput()

				for (const badDob of ["not-a-date", "2026-2-30", "2026-02-30", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-11-29"]) {
					const res = Owner.registerNew({ ...individual, dateOfBirth: badDob }, deps)
					expect(res.isErr()).toBe(true)
					if (res.isErr()) {
						expect(res.error).toBeInstanceOf(DomainValidationError)
					}
				}
				expect(calls.encrypt).toEqual([])
				expect(calls.hash).toEqual([])
			})

			test("rejects empty or whitespace-only nullable email and lineId", () => {
				const { cipher } = createFakeCipher()
				const deps = { taxIdCipher: cipher, todayBangkokIso: TODAY_BANGKOK_ISO }
				const input = makeValidJuristicInput()

				for (const blank of ["", "   "]) {
					const badEmail = Owner.registerNew({ ...input, email: blank }, deps)
					expect(badEmail.isErr()).toBe(true)
					if (badEmail.isErr()) {
						expect(badEmail.error).toBeInstanceOf(DomainValidationError)
					}

					const badLineId = Owner.registerNew({ ...input, lineId: blank }, deps)
					expect(badLineId.isErr()).toBe(true)
					if (badLineId.isErr()) {
						expect(badLineId.error).toBeInstanceOf(DomainValidationError)
					}
				}
			})

			test("rejects non-13-digit taxId", () => {
				const { cipher } = createFakeCipher()
				const deps = { taxIdCipher: cipher, todayBangkokIso: TODAY_BANGKOK_ISO }
				const input = makeValidJuristicInput()

				for (const badTaxId of ["123", "123456789012a", "12345678901234"]) {
					const result = Owner.registerNew({ ...input, taxId: badTaxId }, deps)
					expect(result.isErr()).toBe(true)
					if (result.isErr()) {
						expect(result.error).toBeInstanceOf(DomainValidationError)
					}
				}
			})

			test("propagates address and consent domain errors", () => {
				const { cipher } = createFakeCipher()
				const deps = { taxIdCipher: cipher, todayBangkokIso: TODAY_BANGKOK_ISO }
				const input = makeValidJuristicInput()

				const badConsent = Owner.registerNew(
					{
						...input,
						consents: { ...input.consents, privacyPolicy: false },
					},
					deps
				)
				expect(badConsent.isErr()).toBe(true)
				if (badConsent.isErr()) {
					expect(badConsent.error).toBeInstanceOf(DomainValidationError)
				}

				const bothDefault = Owner.registerNew(
					{
						...input,
						addresses: {
							residential: { ...input.addresses.residential, isDefault: true },
							billing: { ...input.addresses.residential, isDefault: true },
						},
					},
					deps
				)
				expect(bothDefault.isErr()).toBe(true)
				if (bothDefault.isErr()) {
					expect(bothDefault.error).toBeInstanceOf(DomainValidationError)
					expect(bothDefault.error.message).toBe("Only one address may be marked as default.")
				}
			})
		})

		describe("Exception cases", () => {
			test("propagates UnexpectedError when TaxIdCipher encrypt or hash fails", () => {
				const encryptFailure = new UnexpectedError("encrypt boom", new Error("crypto"))
				const { cipher: failingEncryptCipher } = createFakeCipher({
					encrypt: () => err(encryptFailure),
				})
				const encryptErrRes = Owner.registerNew(makeValidIndividualInput(), {
					taxIdCipher: failingEncryptCipher,
					todayBangkokIso: TODAY_BANGKOK_ISO,
				})
				expect(encryptErrRes.isErr()).toBe(true)
				if (encryptErrRes.isErr()) {
					expect(encryptErrRes.error).toBe(encryptFailure)
				}

				const hashFailure = new UnexpectedError("hash boom", new Error("crypto"))
				const { cipher: failingHashCipher } = createFakeCipher({
					hash: () => err(hashFailure),
				})
				const hashErrRes = Owner.registerNew(makeValidIndividualInput(), {
					taxIdCipher: failingHashCipher,
					todayBangkokIso: TODAY_BANGKOK_ISO,
				})
				expect(hashErrRes.isErr()).toBe(true)
				if (hashErrRes.isErr()) {
					expect(hashErrRes.error).toBe(hashFailure)
				}
			})
		})
	})
})
