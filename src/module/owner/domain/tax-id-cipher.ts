import type { Result } from "neverthrow"

import type { UnexpectedError } from "src/core/errors"

export interface TaxIdCipher {
	encrypt(plainTaxId: string): Result<string, UnexpectedError>
	decrypt(encryptedTaxId: string): Result<string, UnexpectedError>
	hash(plainTaxId: string): Result<string, UnexpectedError>
}
