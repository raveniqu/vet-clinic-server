import { type Result, err, ok } from "neverthrow"

import { DomainValidationError, type UnexpectedError } from "src/core/errors"
import { OwnerAddresses, type OwnerAddressesInput } from "./owner-addresses.vo"
import { type InitialOwnerConsentsInput, OwnerConsents } from "./owner-consents.vo"
import type { TaxIdCipher } from "./tax-id-cipher"

export type OwnerType = "INDIVIDUAL" | "JURISTIC"

export type IndividualOwnerPrefix = "MR" | "MRS" | "MS"

export type JuristicOwnerPrefix = "COMMERCIAL" | "NON_PROFIT" | "OTHER"

export type OwnerPrefix = IndividualOwnerPrefix | JuristicOwnerPrefix

export type OwnerGender = "MALE" | "FEMALE" | "OTHER"

export type AcquisitionChannel = "WALK_IN" | "LINE_OA" | "WEB_PORTAL" | "REFERRAL" | "SOCIAL_MEDIA" | "CAMPAIGN"

export type RegisterIndividualOwnerInput = {
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

export type RegisterJuristicOwnerInput = {
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

export type RegisterOwnerInput = RegisterIndividualOwnerInput | RegisterJuristicOwnerInput

export type RegisterOwnerDeps = {
	readonly taxIdCipher: TaxIdCipher
	readonly todayBangkokIso: string
}

const TAX_ID_PATTERN = /^[0-9]{13}$/
const ISO_DATE_PATTERN = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/
const FIRST_NAME_MAX_LENGTH = 255
const LAST_NAME_MAX_LENGTH = 100
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

function validateDateOfBirth(raw: string, todayBangkokIso: string): Result<string, DomainValidationError> {
	const trimmed = raw.trim()
	const match = ISO_DATE_PATTERN.exec(trimmed)
	if (match === null) {
		return err(new DomainValidationError("date_of_birth must be a valid YYYY-MM-DD calendar date."))
	}

	const year = Number(match[1])
	const month = Number(match[2])
	const day = Number(match[3])
	const parsed = new Date(Date.UTC(year, month - 1, day))
	if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
		return err(new DomainValidationError("date_of_birth must be a valid calendar date."))
	}

	if (trimmed > todayBangkokIso) {
		return err(new DomainValidationError("date_of_birth must not be in the future."))
	}

	return ok(trimmed)
}

export class Owner {
	readonly type: OwnerType
	readonly prefix: OwnerPrefix
	readonly firstName: string
	readonly lastName: string | null
	/** Stored form: plaintext 13-digit Tax ID for JURISTIC; v1: AES-256-GCM ciphertext for INDIVIDUAL (ADR-0002). */
	readonly taxId: string
	readonly taxIdHash: string | null
	readonly dateOfBirth: string | null
	readonly gender: OwnerGender | null
	readonly phoneNo: string
	readonly email: string | null
	readonly lineId: string | null
	readonly acquisitionChannel: AcquisitionChannel
	readonly addresses: OwnerAddresses
	readonly consents: OwnerConsents

	private constructor(props: {
		readonly type: OwnerType
		readonly prefix: OwnerPrefix
		readonly firstName: string
		readonly lastName: string | null
		readonly taxId: string
		readonly taxIdHash: string | null
		readonly dateOfBirth: string | null
		readonly gender: OwnerGender | null
		readonly phoneNo: string
		readonly email: string | null
		readonly lineId: string | null
		readonly acquisitionChannel: AcquisitionChannel
		readonly addresses: OwnerAddresses
		readonly consents: OwnerConsents
	}) {
		this.type = props.type
		this.prefix = props.prefix
		this.firstName = props.firstName
		this.lastName = props.lastName
		this.taxId = props.taxId
		this.taxIdHash = props.taxIdHash
		this.dateOfBirth = props.dateOfBirth
		this.gender = props.gender
		this.phoneNo = props.phoneNo
		this.email = props.email
		this.lineId = props.lineId
		this.acquisitionChannel = props.acquisitionChannel
		this.addresses = props.addresses
		this.consents = props.consents
	}

	static registerNew(input: RegisterOwnerInput, deps: RegisterOwnerDeps): Result<Owner, DomainValidationError | UnexpectedError> {
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

		if (input.type === "JURISTIC") {
			return ok(
				new Owner({
					type: "JURISTIC",
					prefix: input.prefix,
					firstName: firstName.value,
					lastName: null,
					taxId: trimmedTaxId,
					taxIdHash: null,
					dateOfBirth: null,
					gender: null,
					phoneNo: phoneNo.value,
					email: email.value,
					lineId: lineId.value,
					acquisitionChannel: input.acquisitionChannel,
					addresses: addresses.value,
					consents: consents.value,
				})
			)
		}

		const lastName = validateRequiredField(input.lastName, "last_name", LAST_NAME_MAX_LENGTH)
		if (lastName.isErr()) {
			return err(lastName.error)
		}

		const dateOfBirth = validateDateOfBirth(input.dateOfBirth, deps.todayBangkokIso)
		if (dateOfBirth.isErr()) {
			return err(dateOfBirth.error)
		}

		const encryptedTaxId = deps.taxIdCipher.encrypt(trimmedTaxId)
		if (encryptedTaxId.isErr()) {
			return err(encryptedTaxId.error)
		}

		const taxIdHash = deps.taxIdCipher.hash(trimmedTaxId)
		if (taxIdHash.isErr()) {
			return err(taxIdHash.error)
		}

		return ok(
			new Owner({
				type: "INDIVIDUAL",
				prefix: input.prefix,
				firstName: firstName.value,
				lastName: lastName.value,
				taxId: encryptedTaxId.value,
				taxIdHash: taxIdHash.value,
				dateOfBirth: dateOfBirth.value,
				gender: input.gender,
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
