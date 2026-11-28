import type { ResultAsync } from "neverthrow"

import type { ConflictError, UnexpectedError } from "src/core/errors"
import type { RequestContext } from "src/core/request-context"
import type { Owner } from "./owner.domain"

export interface OwnerRepository {
	create(ctx: RequestContext, owner: Owner, ownerCode: string): ResultAsync<number, ConflictError | UnexpectedError>
}

export interface RunningNumberSequenceRepository {
	nextNumber(ctx: RequestContext, prefix: string, sequenceDate: string): ResultAsync<number, UnexpectedError>
}

export type OwnerUnitOfWorkRepos = {
	readonly owners: OwnerRepository
	readonly sequences: RunningNumberSequenceRepository
}
