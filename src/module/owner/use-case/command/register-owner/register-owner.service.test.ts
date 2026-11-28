import { describe, expect, test } from "bun:test"
import { AsyncLocalStorage } from "node:async_hooks"
import { type LogRecord, configure, reset } from "@logtape/logtape"
import { type Result, type ResultAsync, err, errAsync, ok, okAsync } from "neverthrow"

import { ConflictError, DomainValidationError, RequestAbortedError, UnexpectedError } from "src/core/errors"
import type { RequestContext } from "src/core/request-context"
import type { UnitOfWork } from "src/core/unit-of-work"
import type { Owner } from "src/module/owner/domain/owner.domain"
import type { OwnerRepository, OwnerUnitOfWorkRepos, RunningNumberSequenceRepository } from "src/module/owner/domain/owner.repo"
import type { TaxIdCipher } from "src/module/owner/domain/tax-id-cipher"
import { type Clock, type RegisterIndividualOwnerRequest, type RegisterJuristicOwnerRequest, RegisterOwnerService } from "./register-owner.service"

function makeValidJuristicRequest(): RegisterJuristicOwnerRequest {
	return {
		type: "JURISTIC",
		prefix: "COMMERCIAL",
		firstName: "บริษัท สยามเพ็ท จำกัด",
		taxId: "0215568005093",
		phoneNo: "0870957124",
		email: "QATest004@Example.COM",
		lineId: "c.line",
		acquisitionChannel: "REFERRAL",
		addresses: {
			residential: {
				isDefault: true,
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
			marketing: false,
			appointment: false,
			media: false,
			research: false,
		},
	}
}

function makeValidIndividualRequest(): RegisterIndividualOwnerRequest {
	return {
		type: "INDIVIDUAL",
		prefix: "MR",
		firstName: "เอกนิติ",
		lastName: "เลี้ยงหมา",
		taxId: "8627480061811",
		dateOfBirth: "1990-05-15",
		gender: "MALE",
		phoneNo: "0921874669",
		email: "QATest001@Example.COM",
		lineId: "a.line",
		acquisitionChannel: "WALK_IN",
		addresses: {
			residential: {
				isDefault: true,
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
	}
}

type FakeState = {
	uowRuns: number
	committed: number
	rolledBack: number
	sequencePrefix: string | null
	sequenceDate: string | null
	createdOwnerCode: string | null
	createdOwner: Owner | null
	seenCtx: RequestContext[]
	encryptCalls: number
	hashCalls: number
	uowOpenedAfterCrypto: boolean
}

function createFakeDeps(options: {
	readonly nowIso: string
	readonly nextSequence?: ResultAsync<number, UnexpectedError>
	readonly createOwnerResult?: ResultAsync<number, ConflictError | UnexpectedError>
	readonly cipherEncryptResult?: Result<string, UnexpectedError>
	readonly cipherHashResult?: Result<string, UnexpectedError>
}) {
	const state: FakeState = {
		uowRuns: 0,
		committed: 0,
		rolledBack: 0,
		sequencePrefix: null,
		sequenceDate: null,
		createdOwnerCode: null,
		createdOwner: null,
		seenCtx: [],
		encryptCalls: 0,
		hashCalls: 0,
		uowOpenedAfterCrypto: false,
	}

	const sequences: RunningNumberSequenceRepository = {
		nextNumber(ctx: RequestContext, prefix: string, sequenceDate: string) {
			state.seenCtx.push(ctx)
			state.sequencePrefix = prefix
			state.sequenceDate = sequenceDate
			return options.nextSequence ?? okAsync(1)
		},
	}

	const owners: OwnerRepository = {
		create(ctx: RequestContext, owner: Owner, ownerCode: string) {
			state.seenCtx.push(ctx)
			state.createdOwner = owner
			state.createdOwnerCode = ownerCode
			return options.createOwnerResult ?? okAsync(42)
		},
	}

	const uow: UnitOfWork<OwnerUnitOfWorkRepos> = {
		async run<T, E>(work: (repos: OwnerUnitOfWorkRepos) => Promise<Result<T, E>>) {
			state.uowRuns += 1
			state.uowOpenedAfterCrypto = state.encryptCalls > 0 && state.hashCalls > 0
			const result = await work({ owners: owners, sequences: sequences })
			if (result.isErr()) {
				state.rolledBack += 1
			} else {
				state.committed += 1
			}
			return result
		},
	}

	const clock: Clock = {
		now: () => new Date(options.nowIso),
	}

	const taxIdCipher: TaxIdCipher = {
		encrypt(plainTaxId: string) {
			state.encryptCalls += 1
			return options.cipherEncryptResult ?? ok(`v1:enc:${plainTaxId}`)
		},
		decrypt(encryptedTaxId: string) {
			return ok(encryptedTaxId.replace(/^v1:enc:/, ""))
		},
		hash(plainTaxId: string) {
			state.hashCalls += 1
			return options.cipherHashResult ?? ok(`hash:${plainTaxId}`.padEnd(64, "0"))
		},
	}

	return { service: new RegisterOwnerService(uow, clock, taxIdCipher), state: state }
}

describe("RegisterOwnerService", () => {
	describe("execute", () => {
		describe("Happy cases", () => {
			test("registers JURISTIC owner using Asia/Bangkok date across UTC midnight boundary and logs without PII", async () => {
				const records: LogRecord[] = []
				await configure({
					reset: true,
					contextLocalStorage: new AsyncLocalStorage(),
					sinks: {
						test: (record: LogRecord) => {
							records.push(record)
						},
					},
					loggers: [{ category: ["app", "owner"], lowestLevel: "info", sinks: ["test"] }],
				})

				try {
					// 2026-11-28T17:00:00Z is 2026-11-29T00:00:00+07:00 in Asia/Bangkok
					const { service, state } = createFakeDeps({ nowIso: "2026-11-28T17:00:00.000Z" })
					const ctx: RequestContext = { signal: new AbortController().signal }

					const result = await service.execute(ctx, makeValidJuristicRequest())

					expect(result.isOk()).toBe(true)
					if (result.isOk()) {
						expect(result.value).toEqual({ id: 42 })
					}
					expect(state.uowRuns).toBe(1)
					expect(state.committed).toBe(1)
					expect(state.rolledBack).toBe(0)
					expect(state.sequencePrefix).toBe("OWN")
					expect(state.sequenceDate).toBe("2026-11-29")
					expect(state.createdOwnerCode).toBe("OWN-20261129-0001")
					expect(state.seenCtx).toEqual([ctx, ctx])
					expect(state.encryptCalls).toBe(0)
					expect(state.hashCalls).toBe(0)

					expect(records).toHaveLength(1)
					const serialized = JSON.stringify(records[0])
					expect(serialized).toContain("42")
					expect(serialized).not.toContain("สยามเพ็ท")
					expect(serialized).not.toContain("0215568005093")
					expect(serialized).not.toContain("0870957124")
					expect(serialized).not.toContain("qatest004")
					expect(serialized).not.toContain("c.line")
					expect(serialized).not.toContain("999/999")
				} finally {
					await reset()
				}
			})

			test("registers INDIVIDUAL owner encrypting & hashing Tax ID before opening UoW transaction and uses Asia/Bangkok today for dateOfBirth", async () => {
				const records: LogRecord[] = []
				await configure({
					reset: true,
					contextLocalStorage: new AsyncLocalStorage(),
					sinks: {
						test: (record: LogRecord) => {
							records.push(record)
						},
					},
					loggers: [{ category: ["app", "owner"], lowestLevel: "info", sinks: ["test"] }],
				})

				try {
					// 2026-11-28T17:00:00Z is 2026-11-29T00:00:00+07:00 in Asia/Bangkok
					const { service, state } = createFakeDeps({ nowIso: "2026-11-28T17:00:00.000Z" })
					const ctx: RequestContext = { signal: new AbortController().signal }
					const req = makeValidIndividualRequest()

					const result = await service.execute(ctx, { ...req, dateOfBirth: "2026-11-29" })

					expect(result.isOk()).toBe(true)
					expect(state.uowRuns).toBe(1)
					expect(state.uowOpenedAfterCrypto).toBe(true)
					expect(state.encryptCalls).toBe(1)
					expect(state.hashCalls).toBe(1)
					expect(state.createdOwner?.type).toBe("INDIVIDUAL")
					expect(state.createdOwner?.taxId).toBe("v1:enc:8627480061811")
					expect(state.createdOwner?.taxIdHash).toBe("hash:8627480061811".padEnd(64, "0"))
					expect(state.createdOwner?.dateOfBirth).toBe("2026-11-29")

					expect(records).toHaveLength(1)
					const serialized = JSON.stringify(records[0])
					expect(serialized).not.toContain("เอกนิติ")
					expect(serialized).not.toContain("เลี้ยงหมา")
					expect(serialized).not.toContain("8627480061811")
					expect(serialized).not.toContain("0921874669")
				} finally {
					await reset()
				}
			})

			test("formats sequence numbers >= 10000 without truncation", async () => {
				const { service, state } = createFakeDeps({
					nowIso: "2026-11-28T10:00:00.000Z",
					nextSequence: okAsync(10000),
				})
				const ctx: RequestContext = { signal: new AbortController().signal }

				const result = await service.execute(ctx, makeValidJuristicRequest())

				expect(result.isOk()).toBe(true)
				expect(state.createdOwnerCode).toBe("OWN-20261128-10000")
			})
		})

		describe("Unhappy cases", () => {
			test("fails before opening UoW transaction when RequestContext.signal is aborted", async () => {
				const controller = new AbortController()
				controller.abort("client disconnected")
				const { service, state } = createFakeDeps({ nowIso: "2026-11-28T10:00:00.000Z" })

				const result = await service.execute({ signal: controller.signal }, makeValidJuristicRequest())

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(RequestAbortedError)
				}
				expect(state.uowRuns).toBe(0)
			})

			test("returns DomainValidationError before opening UoW transaction when domain invariants fail", async () => {
				const { service, state } = createFakeDeps({ nowIso: "2026-11-28T10:00:00.000Z" })
				const req = makeValidJuristicRequest()

				const result = await service.execute({ signal: new AbortController().signal }, { ...req, consents: { ...req.consents, privacyPolicy: false } })

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBeInstanceOf(DomainValidationError)
				}
				expect(state.uowRuns).toBe(0)
			})

			test("returns UnexpectedError before opening UoW transaction when TaxIdCipher fails", async () => {
				const cryptoErr = new UnexpectedError("cipher failed", new Error("bad key"))
				const { service, state } = createFakeDeps({
					nowIso: "2026-11-28T10:00:00.000Z",
					cipherEncryptResult: err(cryptoErr),
				})

				const result = await service.execute({ signal: new AbortController().signal }, makeValidIndividualRequest())

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBe(cryptoErr)
				}
				expect(state.uowRuns).toBe(0)
			})

			test("rolls back and propagates UnexpectedError when sequence generation fails", async () => {
				const seqError = new UnexpectedError("sequence failed", new Error("db down"))
				const { service, state } = createFakeDeps({
					nowIso: "2026-11-28T10:00:00.000Z",
					nextSequence: errAsync(seqError),
				})

				const result = await service.execute({ signal: new AbortController().signal }, makeValidJuristicRequest())

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBe(seqError)
				}
				expect(state.rolledBack).toBe(1)
				expect(state.createdOwner).toBeNull()
			})

			test("rolls back and propagates ConflictError when owner repository reports duplicate", async () => {
				const conflict = new ConflictError("An active owner with this tax_id already exists.", "uniq_owners_tax_id_juristic_live")
				const { service, state } = createFakeDeps({
					nowIso: "2026-11-28T10:00:00.000Z",
					createOwnerResult: errAsync(conflict),
				})

				const result = await service.execute({ signal: new AbortController().signal }, makeValidJuristicRequest())

				expect(result.isErr()).toBe(true)
				if (result.isErr()) {
					expect(result.error).toBe(conflict)
				}
				expect(state.rolledBack).toBe(1)
			})
		})
	})
})
