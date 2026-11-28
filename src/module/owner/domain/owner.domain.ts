import { type Result, err, ok } from "neverthrow"

import { DomainValidationError } from "src/core/errors"
import { OwnerAddresses, type OwnerAddressesInput } from "./owner-addresses.vo"
import { type InitialOwnerConsentsInput, OwnerConsents } from "./owner-consents.vo"

export type OwnerType = "JURISTIC"

export type JuristicOwnerPrefix = "COMMERCIAL" | "NON_PROFIT" | "OTHER"

export type AcquisitionChannel = "WALK_IN" | "LINE_OA" | "WEB_PORTAL" | "REFERRAL" | "SOCIAL_MEDIA" | "CAMPAIGN"

export type RegisterJuristicOwnerInput = {
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

const TAX_ID_PATTERN = /^[0-9]{13}$/
const FIRST_NAME_MAX_LENGTH = 255
const PHONE_NO_MAX_LENGTH = 30
const EMAIL_MAX_LENGTH = 255
const LINE_ID_MAX_LENGTH = 100

function validateRequiredField(value: string, fieldName: string, maxLength: number): Result<string, DomainValidationError> {
	const trimmed = value.trim()
	if (trimmed.length === 0) {
		return err(new DomainValidationError(`${fieldName} must not be blank.`))
	}
	if (trimmed.length > maxLength) {
		return err(new DomainValidationError(`${fieldName} must not exceed ${maxLength} characters.`))
	}
	return ok(trimmed)
}

function normalizeOptionalField(value: string | null | undefined, fieldName: string, maxLength: number, lowercase: boolean): Result<string | null, DomainValidationError> {
	if (value === undefined || value === null) {
		return ok(null)
	}

	const trimmed = value.trim()
	if (trimmed.length === 0) {
		return err(new DomainValidationError(`${fieldName} must not be blank.`))
	}
	if (trimmed.length > maxLength) {
		return err(new DomainValidationError(`${fieldName} must not exceed ${maxLength} characters.`))
	}

	return ok(lowercase ? trimmed.toLowerCase() : trimmed)
}

export class Owner {
	readonly type: OwnerType
	readonly prefix: JuristicOwnerPrefix
	readonly firstName: string
	readonly lastName: null
	readonly taxId: string
	readonly taxIdHash: null
	readonly dateOfBirth: null
	readonly gender: null
	readonly phoneNo: string
	readonly email: string | null
	readonly lineId: string | null
	readonly acquisitionChannel: AcquisitionChannel
	readonly addresses: OwnerAddresses
	readonly consents: OwnerConsents

	private constructor(props: {
		readonly prefix: JuristicOwnerPrefix
		readonly firstName: string
		readonly taxId: string
		readonly phoneNo: string
		readonly email: string | null
		readonly lineId: string | null
		readonly acquisitionChannel: AcquisitionChannel
		readonly addresses: OwnerAddresses
		readonly consents: OwnerConsents
	}) {
		this.type = "JURISTIC"
		this.prefix = props.prefix
		this.firstName = props.firstName
		this.lastName = null
		this.taxId = props.taxId
		this.taxIdHash = null
		this.dateOfBirth = null
		this.gender = null
		this.phoneNo = props.phoneNo
		this.email = props.email
		this.lineId = props.lineId
		this.acquisitionChannel = props.acquisitionChannel
		this.addresses = props.addresses
		this.consents = props.consents
	}

	static registerNew(input: RegisterJuristicOwnerInput): Result<Owner, DomainValidationError> {
		const firstName = validateRequiredField(input.firstName, "first_name", FIRST_NAME_MAX_LENGTH)
		if (firstName.isErr()) {
			return err(firstName.error)
		}

		const trimmedTaxId = input.taxId.trim()
		if (!TAX_ID_PATTERN.test(trimmedTaxId)) {
			return err(new DomainValidationError("tax_id must be a 13-digit numeric string."))
		}

		const phoneNo = validateRequiredField(input.phoneNo, "phone_no", PHONE_NO_MAX_LENGTH)
		if (phoneNo.isErr()) {
			return err(phoneNo.error)
		}

		const email = normalizeOptionalField(input.email, "email", EMAIL_MAX_LENGTH, true)
		if (email.isErr()) {
			return err(email.error)
		}

		const lineId = normalizeOptionalField(input.lineId, "line_id", LINE_ID_MAX_LENGTH, false)
		if (lineId.isErr()) {
			return err(lineId.error)
		}

		const addresses = OwnerAddresses.create(input.addresses)
		if (addresses.isErr()) {
			return err(addresses.error)
		}

		const consents = OwnerConsents.createInitial(input.consents)
		if (consents.isErr()) {
			return err(consents.error)
		}

		return ok(
			new Owner({
				prefix: input.prefix,
				firstName: firstName.value,
				taxId: trimmedTaxId,
				phoneNo: phoneNo.value,
				email: email.value,
				lineId: lineId.value,
				acquisitionChannel: input.acquisitionChannel,
				addresses: addresses.value,
				consents: consents.value,
			})
		)
	}
}
