import { getLogger } from "@logtape/logtape"
import { type Result, err, ok } from "neverthrow"

import { type ConflictError, type DomainValidationError, UnexpectedError } from "src/core/errors"
import type { RequestContext } from "src/core/request-context"
import type { UnitOfWork } from "src/core/unit-of-work"
import type { OwnerAddressesInput } from "src/module/owner/domain/owner-addresses.vo"
import type { InitialOwnerConsentsInput } from "src/module/owner/domain/owner-consents.vo"
import { type AcquisitionChannel, type JuristicOwnerPrefix, Owner } from "src/module/owner/domain/owner.domain"
import type { OwnerUnitOfWorkRepos } from "src/module/owner/domain/owner.repo"

export type Clock = {
	now(): Date
}

export type RegisterOwnerRequest = {
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

export type RegisterOwnerResult = {
	readonly id: number
}

export type RegisterOwnerError = DomainValidationError | ConflictError | UnexpectedError

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

	constructor(uow: UnitOfWork<OwnerUnitOfWorkRepos>, clock: Clock) {
		this.uow = uow
		this.clock = clock
	}

	async execute(ctx: RequestContext, req: RegisterOwnerRequest): Promise<Result<RegisterOwnerResult, RegisterOwnerError>> {
		if (ctx.signal.aborted) {
			return err(new UnexpectedError("Request aborted", ctx.signal.reason))
		}

		const ownerResult = Owner.registerNew({
			prefix: req.prefix,
			firstName: req.firstName,
			taxId: req.taxId,
			phoneNo: req.phoneNo,
			email: req.email,
			lineId: req.lineId,
			acquisitionChannel: req.acquisitionChannel,
			addresses: req.addresses,
			consents: req.consents,
		})
		if (ownerResult.isErr()) {
			return err(ownerResult.error)
		}

		const dateParts = toBangkokDateParts(this.clock.now())
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
