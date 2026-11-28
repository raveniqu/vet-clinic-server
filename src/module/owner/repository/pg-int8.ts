import { type Result, err, ok } from "neverthrow"

import { UnexpectedError } from "src/core/errors"

const POSITIVE_INT_PATTERN = /^[1-9][0-9]*$/

export function parseSafePositiveInt8(raw: string | number | bigint, fieldName: string): Result<number, UnexpectedError> {
	const text = typeof raw === "string" ? raw : String(raw)
	if (!POSITIVE_INT_PATTERN.test(text)) {
		return err(new UnexpectedError(`Unsafe or invalid int8 value for ${fieldName}`, raw))
	}

	const parsed = Number(text)
	if (!Number.isSafeInteger(parsed) || parsed < 1 || String(parsed) !== text) {
		return err(new UnexpectedError(`Unsafe or invalid int8 value for ${fieldName}`, raw))
	}

	return ok(parsed)
}
