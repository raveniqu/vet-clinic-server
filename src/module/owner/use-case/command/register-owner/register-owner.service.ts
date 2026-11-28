import { getLogger } from "@logtape/logtape"
import { type Result, err, ok } from "neverthrow"

import { type ConflictError, type DomainValidationError, RequestAbortedError, type UnexpectedError } from "src/core/errors"
import type { RequestContext } from "src/core/request-context"
import type { UnitOfWork } from "src/core/unit-of-work"
import type { OwnerAddressesInput } from "src/module/owner/domain/owner-addresses.vo"
import type { InitialOwnerConsentsInput } from "src/module/owner/domain/owner-consents.vo"
import { type AcquisitionChannel, type IndividualOwnerPrefix, type JuristicOwnerPrefix, Owner, type OwnerGender } from "src/module/owner/domain/owner.domain"
import type { OwnerUnitOfWorkRepos } from "src/module/owner/domain/owner.repo"
import type { TaxIdCipher } from "src/module/owner/domain/tax-id-cipher"

export type Clock = {
	now(): Date
}

export type RegisterIndividualOwnerRequest = {
	readonly type: "INDIVIDUAL"
	readonly prefix: IndividualOwnerPrefix
	readonly firstName: string
	readonly lastName: string
	readonly taxId: string
	readonly dateOfBirth: string
	readonly gender: OwnerGender
	readonly phoneNo: string
	readonly email?: string | null
	readonly lineId?: string | null
	readonly acquisitionChannel: AcquisitionChannel
	readonly addresses: OwnerAddressesInput
	readonly consents: InitialOwnerConsentsInput
}

export type RegisterJuristicOwnerRequest = {
	readonly type: "JURISTIC"
	readonly prefix: JuristicOwnerPrefix
	readonly firstName: string
	readonly taxId: string
	readonly phoneNo: string
	readonly email?: string | null
	readonly lineId?: string | null
	readonly acquisitionChannel: AcquisitionChannel
	readonly addresses: OwnerAddressesInput
	readonly consents: InitialOwnerConsentsInput
}

export type RegisterOwnerRequest = RegisterIndividualOwnerRequest | RegisterJuristicOwnerRequest

export type RegisterOwnerResult = {
	readonly id: number
}

export type RegisterOwnerError = DomainValidationError | ConflictError | RequestAbortedError | UnexpectedError

export interface RegisterOwnerUseCase {
	execute(ctx: RequestContext, req: RegisterOwnerRequest): Promise<Result<RegisterOwnerResult, RegisterOwnerError>>
}

const logger = getLogger(["app", "owner"])

const BANGKOK_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	timeZone: "Asia/Bangkok",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
})

function toBangkokDateParts(date: Date): { readonly isoDate: string; readonly compactDate: string } {
	const parts = BANGKOK_DATE_FORMATTER.formatToParts(date)
	const year = parts.find((p) => p.type === "year")?.value ?? ""
	const month = parts.find((p) => p.type === "month")?.value ?? ""
	const day = parts.find((p) => p.type === "day")?.value ?? ""
	return {
		isoDate: `${year}-${month}-${day}`,
		compactDate: `${year}${month}${day}`,
	}
}

function formatOwnerCode(compactDate: string, sequenceNumber: number): string {
	return `OWN-${compactDate}-${String(sequenceNumber).padStart(4, "0")}`
}

export class RegisterOwnerService implements RegisterOwnerUseCase {
	private readonly uow: UnitOfWork<OwnerUnitOfWorkRepos>
	private readonly clock: Clock
	private readonly taxIdCipher: TaxIdCipher

	constructor(uow: UnitOfWork<OwnerUnitOfWorkRepos>, clock: Clock, taxIdCipher: TaxIdCipher) {
		this.uow = uow
		this.clock = clock
		this.taxIdCipher = taxIdCipher
	}

	async execute(ctx: RequestContext, req: RegisterOwnerRequest): Promise<Result<RegisterOwnerResult, RegisterOwnerError>> {
		if (ctx.signal.aborted) {
			return err(new RequestAbortedError("Request aborted", ctx.signal.reason))
		}

		const dateParts = toBangkokDateParts(this.clock.now())
		const ownerResult = Owner.registerNew(req, {
			taxIdCipher: this.taxIdCipher,
			todayBangkokIso: dateParts.isoDate,
		})
		if (ownerResult.isErr()) {
			return err(ownerResult.error)
		}

		const txResult = await this.uow.run<RegisterOwnerResult, ConflictError | UnexpectedError>(async (repos) => {
			const seqResult = await repos.sequences.nextNumber(ctx, "OWN", dateParts.isoDate)
			if (seqResult.isErr()) {
				return err(seqResult.error)
			}

			const ownerCode = formatOwnerCode(dateParts.compactDate, seqResult.value)
			const createResult = await repos.owners.create(ctx, ownerResult.value, ownerCode)
			if (createResult.isErr()) {
				return err(createResult.error)
			}

			return ok({ id: createResult.value })
		})

		if (txResult.isErr()) {
			return err(txResult.error)
		}

		logger.info("Owner {ownerId} registered", { ownerId: txResult.value.id })
		return ok(txResult.value)
	}
}
