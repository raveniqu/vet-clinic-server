import { type Transaction, sql } from "kysely"
import { ResultAsync, errAsync, okAsync } from "neverthrow"

import { ConflictError, UnexpectedError, mapPgError } from "src/core/errors"
import type { RequestContext } from "src/core/request-context"
import type { Owner } from "src/module/owner/domain/owner.domain"
import type { OwnerRepository } from "src/module/owner/domain/owner.repo"
import type { DB } from "src/shared/db/generated/db"
import { parseSafePositiveInt8 } from "./pg-int8"

const OWNER_CONFLICT_MESSAGES: Record<string, string> = {
	uniq_owners_tax_id_hash_live: "An active owner with this tax_id already exists.",
	uniq_owners_tax_id_juristic_live: "An active owner with this tax_id already exists.",
	uniq_owners_phone_no_live: "An active owner with this phone_no already exists.",
	uniq_owners_email_live: "An active owner with this email already exists.",
	uniq_owners_line_id_live: "An active owner with this line_id already exists.",
}

function mapOwnerWriteError(error: unknown): ConflictError | UnexpectedError {
	const mapped = mapPgError(error)
	if (mapped instanceof ConflictError && mapped.constraint !== null) {
		const message = OWNER_CONFLICT_MESSAGES[mapped.constraint]
		if (message !== undefined) {
			return new ConflictError(message, mapped.constraint)
		}
		return new UnexpectedError(mapped.message, error)
	}
	return mapped instanceof UnexpectedError ? mapped : new UnexpectedError(mapped.message, error)
}

export class PgOwnerRepository implements OwnerRepository {
	private readonly tx: Transaction<DB>

	constructor(tx: Transaction<DB>) {
		this.tx = tx
	}

	create(_ctx: RequestContext, owner: Owner, ownerCode: string): ResultAsync<number, ConflictError | UnexpectedError> {
		const insertOwner = this.tx
			.insertInto("owners")
			.values({
				code: ownerCode,
				type: owner.type,
				prefix: owner.prefix,
				first_name: owner.firstName,
				last_name: owner.lastName,
				tax_id: owner.taxId,
				tax_id_hash: owner.taxIdHash,
				date_of_birth: owner.dateOfBirth,
				gender: owner.gender,
				phone_no: owner.phoneNo,
				email: owner.email,
				line_id: owner.lineId,
				acquisition_channel: owner.acquisitionChannel,
			})
			.returning("id")
			.executeTakeFirstOrThrow()

		return ResultAsync.fromPromise(insertOwner, mapOwnerWriteError)
			.andThen((row) =>
				parseSafePositiveInt8(row.id, "owners.id").match(
					(id) => okAsync(id),
					(error) => errAsync(error)
				)
			)
			.andThen((ownerId) => {
				const addressRows = owner.addresses.toRecords().map((addr) => ({
					owner_id: ownerId,
					type: addr.type,
					is_default: addr.isDefault,
					address_line: addr.addressLine,
					subdistrict: addr.subdistrict,
					district: addr.district,
					province: addr.province,
					postal_code: addr.postalCode,
				}))

				return ResultAsync.fromPromise(this.tx.insertInto("owner_addresses").values(addressRows).execute(), mapOwnerWriteError).map(() => ownerId)
			})
			.andThen((ownerId) => {
				const consentRows = owner.consents.toRecords().map((consent) => ({
					owner_id: ownerId,
					type: consent.type,
					is_granted: consent.isGranted,
					consented_at: sql<Date>`NOW()`,
				}))

				return ResultAsync.fromPromise(this.tx.insertInto("owner_consents").values(consentRows).execute(), mapOwnerWriteError).map(() => ownerId)
			})
	}
}
