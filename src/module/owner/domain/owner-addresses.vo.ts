import { type Result, err, ok } from "neverthrow"

import { DomainValidationError } from "src/core/errors"

export type OwnerAddressType = "RESIDENTIAL" | "BILLING"

export type OwnerAddressInput = {
	readonly isDefault?: boolean
	readonly addressLine: string
	readonly subdistrict: string
	readonly district: string
	readonly province: string
	readonly postalCode: string
}

export type OwnerAddressesInput = {
	readonly residential: OwnerAddressInput
	readonly billing?: OwnerAddressInput | null
}

export type OwnerAddressRecord = {
	readonly type: OwnerAddressType
	readonly isDefault: boolean
	readonly addressLine: string
	readonly subdistrict: string
	readonly district: string
	readonly province: string
	readonly postalCode: string
}

const ADDRESS_LIMITS = {
	addressLine: 255,
	subdistrict: 100,
	district: 100,
	province: 100,
	postalCode: 10,
} as const

function validateRequiredText(value: string, fieldLabel: string, maxLength: number): Result<string, DomainValidationError> {
	const trimmed = value.trim()
	if (trimmed.length === 0) {
		return err(new DomainValidationError(`${fieldLabel} must not be blank.`))
	}
	if (trimmed.length > maxLength) {
		return err(new DomainValidationError(`${fieldLabel} must not exceed ${maxLength} characters.`))
	}
	return ok(trimmed)
}

function normalizeAddress(type: OwnerAddressType, prefix: string, input: OwnerAddressInput, isDefault: boolean): Result<OwnerAddressRecord, DomainValidationError> {
	const addressLine = validateRequiredText(input.addressLine, `${prefix}.address_line`, ADDRESS_LIMITS.addressLine)
	if (addressLine.isErr()) {
		return err(addressLine.error)
	}

	const subdistrict = validateRequiredText(input.subdistrict, `${prefix}.subdistrict`, ADDRESS_LIMITS.subdistrict)
	if (subdistrict.isErr()) {
		return err(subdistrict.error)
	}

	const district = validateRequiredText(input.district, `${prefix}.district`, ADDRESS_LIMITS.district)
	if (district.isErr()) {
		return err(district.error)
	}

	const province = validateRequiredText(input.province, `${prefix}.province`, ADDRESS_LIMITS.province)
	if (province.isErr()) {
		return err(province.error)
	}

	const postalCode = validateRequiredText(input.postalCode, `${prefix}.postal_code`, ADDRESS_LIMITS.postalCode)
	if (postalCode.isErr()) {
		return err(postalCode.error)
	}

	return ok({
		type: type,
		isDefault: isDefault,
		addressLine: addressLine.value,
		subdistrict: subdistrict.value,
		district: district.value,
		province: province.value,
		postalCode: postalCode.value,
	})
}

export class OwnerAddresses {
	readonly residential: OwnerAddressRecord
	readonly billing: OwnerAddressRecord | null

	private constructor(residential: OwnerAddressRecord, billing: OwnerAddressRecord | null) {
		this.residential = residential
		this.billing = billing
	}

	static create(input: OwnerAddressesInput): Result<OwnerAddresses, DomainValidationError> {
		const hasBilling = input.billing !== undefined && input.billing !== null
		const residentialRequestedDefault = input.residential.isDefault === true
		const billingRequestedDefault = hasBilling && input.billing?.isDefault === true

		if (residentialRequestedDefault && billingRequestedDefault) {
			return err(new DomainValidationError("Only one address may be marked as default."))
		}

		const billingIsDefault = billingRequestedDefault
		const residentialIsDefault = !billingIsDefault

		const residentialResult = normalizeAddress("RESIDENTIAL", "residential", input.residential, residentialIsDefault)
		if (residentialResult.isErr()) {
			return err(residentialResult.error)
		}

		if (!hasBilling || input.billing === undefined || input.billing === null) {
			return ok(new OwnerAddresses(residentialResult.value, null))
		}

		const billingResult = normalizeAddress("BILLING", "billing", input.billing, billingIsDefault)
		if (billingResult.isErr()) {
			return err(billingResult.error)
		}

		return ok(new OwnerAddresses(residentialResult.value, billingResult.value))
	}

	toRecords(): readonly OwnerAddressRecord[] {
		if (this.billing === null) {
			return [this.residential]
		}
		return [this.residential, this.billing]
	}
}
