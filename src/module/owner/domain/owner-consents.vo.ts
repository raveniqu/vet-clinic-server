import { type Result, err, ok } from "neverthrow"

import { DomainValidationError } from "src/core/errors"

export type OwnerConsentType = "PRIVACY_POLICY" | "MARKETING" | "APPOINTMENT" | "MEDIA" | "RESEARCH"

export type InitialOwnerConsentsInput = {
	readonly privacyPolicy: boolean
	readonly marketing: boolean
	readonly appointment: boolean
	readonly media: boolean
	readonly research: boolean
}

export type OwnerConsentRecord = {
	readonly type: OwnerConsentType
	readonly isGranted: boolean
}

export class OwnerConsents {
	private readonly records: readonly OwnerConsentRecord[]

	private constructor(records: readonly OwnerConsentRecord[]) {
		this.records = records
	}

	static createInitial(input: InitialOwnerConsentsInput): Result<OwnerConsents, DomainValidationError> {
		if (!input.privacyPolicy) {
			return err(new DomainValidationError("Privacy policy consent must be granted."))
		}

		return ok(
			new OwnerConsents([
				{ type: "PRIVACY_POLICY", isGranted: true },
				{ type: "MARKETING", isGranted: input.marketing },
				{ type: "APPOINTMENT", isGranted: input.appointment },
				{ type: "MEDIA", isGranted: input.media },
				{ type: "RESEARCH", isGranted: input.research },
			])
		)
	}

	toRecords(): readonly OwnerConsentRecord[] {
		return this.records
	}
}
