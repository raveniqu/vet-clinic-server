import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import { type Result, err, ok } from "neverthrow"

import { UnexpectedError } from "src/core/errors"
import type { TaxIdCipher } from "./domain/tax-id-cipher"

const CIPHERTEXT_PREFIX = "v1:"
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const ENCRYPTION_KEY_BYTES = 32
const MIN_HMAC_KEY_BYTES = 32
const STRICT_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export type AesGcmTaxIdCipherKeys = {
	readonly encryptionKey: Uint8Array
	readonly hmacKey: Uint8Array
}

export class AesGcmTaxIdCipher implements TaxIdCipher {
	private readonly encryptionKey: Uint8Array
	private readonly hmacKey: Uint8Array

	constructor(keys: AesGcmTaxIdCipherKeys) {
		if (keys.encryptionKey.byteLength !== ENCRYPTION_KEY_BYTES) {
			throw new Error(`Invalid encryption key length: expected ${ENCRYPTION_KEY_BYTES} bytes, got ${keys.encryptionKey.byteLength}`)
		}
		if (keys.hmacKey.byteLength < MIN_HMAC_KEY_BYTES) {
			throw new Error(`Invalid HMAC key length: expected at least ${MIN_HMAC_KEY_BYTES} bytes, got ${keys.hmacKey.byteLength}`)
		}
		this.encryptionKey = keys.encryptionKey
		this.hmacKey = keys.hmacKey
	}

	encrypt(plainTaxId: string): Result<string, UnexpectedError> {
		try {
			const iv = randomBytes(IV_BYTES)
			const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv)
			const encrypted = Buffer.concat([cipher.update(plainTaxId, "utf8"), cipher.final()])
			const authTag = cipher.getAuthTag()
			const packed = Buffer.concat([iv, authTag, encrypted])
			return ok(`${CIPHERTEXT_PREFIX}${packed.toString("base64")}`)
		} catch (error) {
			return err(new UnexpectedError("Failed to encrypt tax_id", error))
		}
	}

	decrypt(encryptedTaxId: string): Result<string, UnexpectedError> {
		if (!encryptedTaxId.startsWith(CIPHERTEXT_PREFIX)) {
			return err(new UnexpectedError("Unsupported tax_id ciphertext version", new Error("Unsupported prefix")))
		}

		const encoded = encryptedTaxId.slice(CIPHERTEXT_PREFIX.length)
		if (encoded.length === 0 || !STRICT_BASE64_PATTERN.test(encoded)) {
			return err(new UnexpectedError("Invalid tax_id ciphertext encoding", new Error("Invalid base64")))
		}

		const packed = Buffer.from(encoded, "base64")
		if (packed.toString("base64") !== encoded) {
			return err(new UnexpectedError("Invalid tax_id ciphertext encoding", new Error("Non-canonical base64")))
		}

		if (packed.byteLength < IV_BYTES + AUTH_TAG_BYTES) {
			return err(new UnexpectedError("Invalid tax_id ciphertext length", new Error("Payload too short")))
		}

		const iv = packed.subarray(0, IV_BYTES)
		const authTag = packed.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
		const ciphertext = packed.subarray(IV_BYTES + AUTH_TAG_BYTES)

		try {
			const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv)
			decipher.setAuthTag(authTag)
			const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
			return ok(decrypted.toString("utf8"))
		} catch (error) {
			return err(new UnexpectedError("Failed to decrypt tax_id", error))
		}
	}

	hash(plainTaxId: string): Result<string, UnexpectedError> {
		try {
			const digest = createHmac("sha256", this.hmacKey).update(plainTaxId, "utf8").digest("hex")
			return ok(digest)
		} catch (error) {
			return err(new UnexpectedError("Failed to hash tax_id", error))
		}
	}
}
