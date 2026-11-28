import { type Transaction, sql } from "kysely"
import { ResultAsync, errAsync, okAsync } from "neverthrow"

import { UnexpectedError, mapPgError } from "src/core/errors"
import type { RequestContext } from "src/core/request-context"
import type { RunningNumberSequenceRepository } from "src/module/owner/domain/owner.repo"
import type { DB } from "src/shared/db/generated/db"
import { parseSafePositiveInt8 } from "./pg-int8"

function toUnexpectedError(error: unknown): UnexpectedError {
	const mapped = mapPgError(error)
	if (mapped instanceof UnexpectedError) {
		return mapped
	}
	return new UnexpectedError(mapped.message, error)
}

export class PgRunningNumberSequenceRepository implements RunningNumberSequenceRepository {
	private readonly tx: Transaction<DB>

	constructor(tx: Transaction<DB>) {
		this.tx = tx
	}

	nextNumber(_ctx: RequestContext, prefix: string, sequenceDate: string): ResultAsync<number, UnexpectedError> {
		const query = this.tx
			.insertInto("running_number_sequences")
			.values({
				prefix: prefix,
				sequence_date: sequenceDate,
				last_number: 1,
			})
			.onConflict((oc) =>
				oc.columns(["prefix", "sequence_date"]).doUpdateSet({
					last_number: sql`${sql.ref("running_number_sequences.last_number")} + 1`,
				})
			)
			.returning("last_number")
			.executeTakeFirstOrThrow()

		return ResultAsync.fromPromise(query, toUnexpectedError).andThen((row) =>
			parseSafePositiveInt8(row.last_number, "running_number_sequences.last_number").match(
				(value) => okAsync(value),
				(error) => errAsync(error)
			)
		)
	}
}
