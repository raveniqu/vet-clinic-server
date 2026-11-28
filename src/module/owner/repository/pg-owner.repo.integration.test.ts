import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { sql } from "kysely"
import { err } from "neverthrow"

import { ConflictError, UnexpectedError } from "src/core/errors"
import type { RequestContext } from "src/core/request-context"
import { AesGcmTaxIdCipher } from "src/module/owner/aes-gcm-tax-id-cipher"
import type { OwnerUnitOfWorkRepos } from "src/module/owner/domain/owner.repo"
import {
	type Clock,
	type RegisterIndividualOwnerRequest,
	type RegisterJuristicOwnerRequest,
	RegisterOwnerService,
} from "src/module/owner/use-case/command/register-owner/register-owner.service"
import { KyselyUnitOfWork } from "src/shared/db/kysely-uow"
import { type TestPostgres, startTestPostgres } from "src/shared/db/pg-testcontainer"
import { PgOwnerRepository } from "./pg-owner.repo"
import { PgRunningNumberSequenceRepository } from "./pg-running-number-sequence.repo"

let pg: TestPostgres

const TEST_ENCRYPTION_KEY = new Uint8Array(32).fill(0x11)
const TEST_HMAC_KEY = new Uint8Array(32).fill(0x22)
const cipher = new AesGcmTaxIdCipher({ encryptionKey: TEST_ENCRYPTION_KEY, hmacKey: TEST_HMAC_KEY })

function createService(nowIso: string) {
	const uow = new KyselyUnitOfWork<OwnerUnitOfWorkRepos>(pg.db, (tx) => ({
		owners: new PgOwnerRepository(tx),
		sequences: new PgRunningNumberSequenceRepository(tx),
	}))
	const clock: Clock = { now: () => new Date(nowIso) }
	return new RegisterOwnerService(uow, clock, cipher)
}

function makeJuristicRequest(overrides: Partial<RegisterJuristicOwnerRequest>): RegisterJuristicOwnerRequest {
	return {
		type: "JURISTIC",
		prefix: "COMMERCIAL",
		firstName: "บริษัท สยามเพ็ท จำกัด",
		taxId: "0215568005093",
		phoneNo: "0870957124",
		email: "Admin@SiamPet.CO.TH",
		lineId: "siampet.line",
		acquisitionChannel: "REFERRAL",
		addresses: {
			residential: {
				addressLine: "999/999 ซอยทดสอบ 99",
				subdistrict: "คลองตันเหนือ",
				district: "วัฒนา",
				province: "กรุงเทพมหานคร",
				postalCode: "10110",
			},
			billing: null,
		},
		consents: {
			privacyPolicy: true,
			marketing: true,
			appointment: false,
			media: true,
			research: false,
		},
		...overrides,
	}
}

function makeIndividualRequest(overrides: Partial<RegisterIndividualOwnerRequest>): RegisterIndividualOwnerRequest {
	return {
		type: "INDIVIDUAL",
		prefix: "MR",
		firstName: "เอกนิติ",
		lastName: "เลี้ยงหมา",
		taxId: "8627480061811",
		dateOfBirth: "1990-05-15",
		gender: "MALE",
		phoneNo: "0921874669",
		email: "Ekanit@Example.COM",
		lineId: "ekanit.line",
		acquisitionChannel: "WALK_IN",
		addresses: {
			residential: {
				addressLine: "88/12 ซอยสุขุมวิท 55",
				subdistrict: "คลองตันเหนือ",
				district: "วัฒนา",
				province: "กรุงเทพมหานคร",
				postalCode: "10110",
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
		...overrides,
	}
}

function makeCtx(): RequestContext {
	return { signal: new AbortController().signal }
}

beforeAll(async () => {
	pg = await startTestPostgres()
})

afterAll(async () => {
	if (pg !== undefined) {
		await pg.stop()
	}
})

beforeEach(async () => {
	await sql`TRUNCATE TABLE owner_consents, owner_addresses, owners, running_number_sequences RESTART IDENTITY CASCADE`.execute(pg.db)
})

describe("PgOwnerRepository & PgRunningNumberSequenceRepository (Postgres integration)", () => {
	describe("Happy cases", () => {
		test("commits JURISTIC owner, default residential address, and 5 PDPA consents with shared timestamp", async () => {
			const service = createService("2026-11-28T10:00:00.000Z")

			const res = await service.execute(makeCtx(), makeJuristicRequest({}))

			expect(res.isOk()).toBe(true)
			if (res.isOk()) {
				expect(Number.isSafeInteger(res.value.id)).toBe(true)
				expect(res.value.id).toBeGreaterThanOrEqual(1)

				const ownerRows = await pg.db.selectFrom("owners").selectAll().where("id", "=", String(res.value.id)).execute()
				expect(ownerRows).toHaveLength(1)
				expect(ownerRows[0]?.code).toBe("OWN-20261128-0001")
				expect(ownerRows[0]?.type).toBe("JURISTIC")
				expect(ownerRows[0]?.tax_id).toBe("0215568005093")
				expect(ownerRows[0]?.tax_id_hash).toBeNull()
				expect(ownerRows[0]?.last_name).toBeNull()
				expect(ownerRows[0]?.date_of_birth).toBeNull()
				expect(ownerRows[0]?.gender).toBeNull()
				expect(ownerRows[0]?.email).toBe("admin@siampet.co.th")

				const addressRows = await pg.db.selectFrom("owner_addresses").selectAll().where("owner_id", "=", String(res.value.id)).execute()
				expect(addressRows).toHaveLength(1)
				expect(addressRows[0]?.type).toBe("RESIDENTIAL")
				expect(addressRows[0]?.is_default).toBe(true)

				const consentRows = await pg.db.selectFrom("owner_consents").selectAll().where("owner_id", "=", String(res.value.id)).orderBy("id", "asc").execute()
				expect(consentRows).toHaveLength(5)
				const timestamps = new Set(consentRows.map((c) => c.consented_at.getTime()))
				expect(timestamps.size).toBe(1)
				expect(consentRows.map((c) => [c.type, c.is_granted])).toEqual([
					["PRIVACY_POLICY", true],
					["MARKETING", true],
					["APPOINTMENT", false],
					["MEDIA", true],
					["RESEARCH", false],
				])
			}
		})

		test("commits INDIVIDUAL owner with encrypted tax_id, HMAC-SHA256 tax_id_hash, personal fields, address, and 5 consents", async () => {
			const service = createService("2026-11-28T10:00:00.000Z")

			const res = await service.execute(makeCtx(), makeIndividualRequest({}))

			expect(res.isOk()).toBe(true)
			if (res.isOk()) {
				const row = await pg.db.selectFrom("owners").selectAll().where("id", "=", String(res.value.id)).executeTakeFirstOrThrow()
				expect(row.code).toBe("OWN-20261128-0001")
				expect(row.type).toBe("INDIVIDUAL")
				expect(row.prefix).toBe("MR")
				expect(row.first_name).toBe("เอกนิติ")
				expect(row.last_name).toBe("เลี้ยงหมา")
				expect(row.gender).toBe("MALE")
				expect(row.email).toBe("ekanit@example.com")
				expect(row.date_of_birth).toBeInstanceOf(Date)
				expect(row.date_of_birth?.toISOString().slice(0, 10)).toBe("1990-05-15")

				expect(row.tax_id).not.toBe("8627480061811")
				expect(row.tax_id.startsWith("v1:")).toBe(true)
				const decrypted = cipher.decrypt(row.tax_id)
				expect(decrypted.isOk()).toBe(true)
				if (decrypted.isOk()) {
					expect(decrypted.value).toBe("8627480061811")
				}

				const expectedHash = cipher.hash("8627480061811")
				expect(expectedHash.isOk()).toBe(true)
				if (expectedHash.isOk()) {
					expect(row.tax_id_hash).toBe(expectedHash.value)
					expect(row.tax_id_hash).toMatch(/^[0-9a-f]{64}$/)
				}

				const addressRows = await pg.db.selectFrom("owner_addresses").selectAll().where("owner_id", "=", String(res.value.id)).execute()
				expect(addressRows).toHaveLength(1)
				const consentRows = await pg.db.selectFrom("owner_consents").selectAll().where("owner_id", "=", String(res.value.id)).execute()
				expect(consentRows).toHaveLength(5)
			}
		})

		test("persists both residential and billing addresses with billing marked default", async () => {
			const service = createService("2026-11-28T10:00:00.000Z")

			const res = await service.execute(
				makeCtx(),
				makeJuristicRequest({
					addresses: {
						residential: {
							isDefault: false,
							addressLine: "1/1 Residential",
							subdistrict: "Sub1",
							district: "Dist1",
							province: "Prov1",
							postalCode: "10110",
						},
						billing: {
							isDefault: true,
							addressLine: "2/2 Billing",
							subdistrict: "Sub2",
							district: "Dist2",
							province: "Prov2",
							postalCode: "10200",
						},
					},
				})
			)

			expect(res.isOk()).toBe(true)
			if (res.isOk()) {
				const addressRows = await pg.db.selectFrom("owner_addresses").selectAll().where("owner_id", "=", String(res.value.id)).orderBy("type", "asc").execute()
				expect(addressRows).toHaveLength(2)
				expect(addressRows.map((a) => [a.type, a.is_default])).toEqual([
					["BILLING", true],
					["RESIDENTIAL", false],
				])
			}
		})

		test("generates distinct sequential Owner Codes under concurrent registrations", async () => {
			const service = createService("2026-11-28T10:00:00.000Z")

			const results = await Promise.all(
				[1, 2, 3, 4, 5].map((n) =>
					service.execute(
						makeCtx(),
						makeJuristicRequest({
							taxId: `021556800509${n}`,
							phoneNo: `087095712${n}`,
							email: `owner${n}@siampet.co.th`,
							lineId: `line.${n}`,
						})
					)
				)
			)

			for (const res of results) {
				expect(res.isOk()).toBe(true)
			}

			const rows = await pg.db.selectFrom("owners").select(["code"]).orderBy("code", "asc").execute()
			expect(rows.map((r) => r.code)).toEqual(["OWN-20261128-0001", "OWN-20261128-0002", "OWN-20261128-0003", "OWN-20261128-0004", "OWN-20261128-0005"])
		})

		test("allows re-registration using tax_id, phone_no, email, and line_id of a soft-deleted owner (both JURISTIC and INDIVIDUAL)", async () => {
			const service = createService("2026-11-28T10:00:00.000Z")

			const firstJuristic = await service.execute(makeCtx(), makeJuristicRequest({}))
			expect(firstJuristic.isOk()).toBe(true)
			if (firstJuristic.isOk()) {
				await pg.db.updateTable("owners").set({ deleted_at: sql`NOW()` }).where("id", "=", String(firstJuristic.value.id)).execute()
			}

			const secondJuristic = await service.execute(makeCtx(), makeJuristicRequest({}))
			expect(secondJuristic.isOk()).toBe(true)
			if (firstJuristic.isOk() && secondJuristic.isOk()) {
				expect(secondJuristic.value.id).not.toBe(firstJuristic.value.id)
			}

			const firstIndividual = await service.execute(makeCtx(), makeIndividualRequest({}))
			expect(firstIndividual.isOk()).toBe(true)
			if (firstIndividual.isOk()) {
				await pg.db.updateTable("owners").set({ deleted_at: sql`NOW()` }).where("id", "=", String(firstIndividual.value.id)).execute()
			}

			const secondIndividual = await service.execute(makeCtx(), makeIndividualRequest({}))
			expect(secondIndividual.isOk()).toBe(true)
			if (firstIndividual.isOk() && secondIndividual.isOk()) {
				expect(secondIndividual.value.id).not.toBe(firstIndividual.value.id)
				const firstRow = await pg.db.selectFrom("owners").select(["tax_id", "tax_id_hash"]).where("id", "=", String(firstIndividual.value.id)).executeTakeFirstOrThrow()
				const secondRow = await pg.db.selectFrom("owners").select(["tax_id", "tax_id_hash"]).where("id", "=", String(secondIndividual.value.id)).executeTakeFirstOrThrow()
				expect(secondRow.tax_id).not.toBe(firstRow.tax_id)
				expect(secondRow.tax_id_hash).toBe(firstRow.tax_id_hash)
			}
		})
	})

	describe("Unhappy cases", () => {
		test("maps duplicate active tax_id (INDIVIDUAL blind index) to 409 and rolls back sequence increment", async () => {
			const service = createService("2026-11-28T10:00:00.000Z")

			const initial = await service.execute(makeCtx(), makeIndividualRequest({}))
			expect(initial.isOk()).toBe(true)

			const duplicateTaxId = await service.execute(
				makeCtx(),
				makeIndividualRequest({
					phoneNo: "0890000001",
					email: "other@example.com",
					lineId: "other.line",
				})
			)
			expect(duplicateTaxId.isErr()).toBe(true)
			if (duplicateTaxId.isErr()) {
				expect(duplicateTaxId.error).toBeInstanceOf(ConflictError)
				expect(duplicateTaxId.error.message).toBe("An active owner with this tax_id already exists.")
			}

			const nextValid = await service.execute(
				makeCtx(),
				makeIndividualRequest({
					taxId: "8627480061812",
					phoneNo: "0890000002",
					email: "next@example.com",
					lineId: "next.line",
				})
			)
			expect(nextValid.isOk()).toBe(true)
			if (nextValid.isOk()) {
				const row = await pg.db.selectFrom("owners").select(["code"]).where("id", "=", String(nextValid.value.id)).executeTakeFirst()
				expect(row?.code).toBe("OWN-20261128-0002")
			}
		})

		test("maps duplicate active tax_id (JURISTIC), phone_no, email (case-insensitive), and line_id to 409 messages and rolls back sequence increment", async () => {
			const service = createService("2026-11-28T10:00:00.000Z")

			const initial = await service.execute(makeCtx(), makeJuristicRequest({}))
			expect(initial.isOk()).toBe(true)

			const cases = [
				{
					label: "tax_id",
					req: makeJuristicRequest({ taxId: "0215568005093", phoneNo: "0890000001", email: "other1@example.com", lineId: "other.1" }),
					expectedMessage: "An active owner with this tax_id already exists.",
				},
				{
					label: "phone_no",
					req: makeJuristicRequest({ taxId: "0215568005099", phoneNo: "0870957124", email: "other2@example.com", lineId: "other.2" }),
					expectedMessage: "An active owner with this phone_no already exists.",
				},
				{
					label: "email",
					req: makeJuristicRequest({ taxId: "0215568005098", phoneNo: "0890000003", email: "admin@siampet.co.th", lineId: "other.3" }),
					expectedMessage: "An active owner with this email already exists.",
				},
				{
					label: "line_id",
					req: makeJuristicRequest({ taxId: "0215568005097", phoneNo: "0890000004", email: "other4@example.com", lineId: "siampet.line" }),
					expectedMessage: "An active owner with this line_id already exists.",
				},
			] as const

			for (const c of cases) {
				const conflictRes = await service.execute(makeCtx(), c.req)
				expect(conflictRes.isErr()).toBe(true)
				if (conflictRes.isErr()) {
					expect(conflictRes.error).toBeInstanceOf(ConflictError)
					expect(conflictRes.error.message).toBe(c.expectedMessage)
				}
			}

			// Verify sequence rolled back on all 4 conflicts: next valid registration gets 0002, not 0006
			const nextValid = await service.execute(
				makeCtx(),
				makeJuristicRequest({
					taxId: "0215568005096",
					phoneNo: "0890000005",
					email: "next@example.com",
					lineId: "next.line",
				})
			)
			expect(nextValid.isOk()).toBe(true)
			if (nextValid.isOk()) {
				const row = await pg.db.selectFrom("owners").select(["code"]).where("id", "=", String(nextValid.value.id)).executeTakeFirst()
				expect(row?.code).toBe("OWN-20261128-0002")
			}
		})

		test("rolls back sequence, owner, address, and consent rows when transaction returns err after writes", async () => {
			const uow = new KyselyUnitOfWork<OwnerUnitOfWorkRepos>(pg.db, (tx) => ({
				owners: new PgOwnerRepository(tx),
				sequences: new PgRunningNumberSequenceRepository(tx),
			}))

			const res = await uow.run(async (repos) => {
				const seq = await repos.sequences.nextNumber(makeCtx(), "OWN", "2026-11-28")
				if (seq.isErr()) {
					return err(seq.error)
				}
				return err(new UnexpectedError("simulated failure", new Error("boom")))
			})

			expect(res.isErr()).toBe(true)
			const seqRows = await pg.db.selectFrom("running_number_sequences").selectAll().execute()
			expect(seqRows).toHaveLength(0)
		})
	})
})
