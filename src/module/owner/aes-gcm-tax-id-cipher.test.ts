import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"

import { UnexpectedError } from "src/core/errors"
import { AesGcmTaxIdCipher } from "./aes-gcm-tax-id-cipher"

const ENCRYPTION_KEY = new Uint8Array(32).fill(0x11)
const OTHER_ENCRYPTION_KEY = new Uint8Array(32).fill(0x33)
const HMAC_KEY = new Uint8Array(32).fill(0x22)
const OTHER_HMAC_KEY = new Uint8Array(48).fill(0x44)

describe("AesGcmTaxIdCipher", () => {
	describe("constructor", () => {
		describe("Happy cases", () => {
			test("accepts 32-byte encryption key and >= 32-byte HMAC key", () => {
				expect(() => new AesGcmTaxIdCipher({ encryptionKey: ENCRYPTION_KEY, hmacKey: HMAC_KEY })).not.toThrow()
				expect(() => new AesGcmTaxIdCipher({ encryptionKey: ENCRYPTION_KEY, hmacKey: OTHER_HMAC_KEY })).not.toThrow()
			})
		})

		describe("Unhappy cases", () => {
			test("rejects encryption key not equal to 32 bytes and HMAC key shorter than 32 bytes", () => {
				expect(() => new AesGcmTaxIdCipher({ encryptionKey: new Uint8Array(31), hmacKey: HMAC_KEY })).toThrow()
				expect(() => new AesGcmTaxIdCipher({ encryptionKey: new Uint8Array(33), hmacKey: HMAC_KEY })).toThrow()
				expect(() => new AesGcmTaxIdCipher({ encryptionKey: ENCRYPTION_KEY, hmacKey: new Uint8Array(31) })).toThrow()
			})
		})
	})

	describe("encrypt & decrypt", () => {
		describe("Happy cases", () => {
			test("encrypts as v1:<base64(12B-iv || 16B-authTag || ciphertext)> with random IV per call and round-trips via decrypt", () => {
				const cipher = new AesGcmTaxIdCipher({ encryptionKey: ENCRYPTION_KEY, hmacKey: HMAC_KEY })
				const plain = "8627480061811"

				const enc1 = cipher.encrypt(plain)
				const enc2 = cipher.encrypt(plain)

				expect(enc1.isOk()).toBe(true)
				expect(enc2.isOk()).toBe(true)
				if (enc1.isOk() && enc2.isOk()) {
					expect(enc1.value).toMatch(/^v1:[A-Za-z0-9+/]+=*$/)
					expect(enc2.value).toMatch(/^v1:[A-Za-z0-9+/]+=*$/)
					expect(enc1.value).not.toBe(enc2.value)
					expect(enc1.value).not.toContain(plain)

					const rawBytes = Buffer.from(enc1.value.slice(3), "base64")
					expect(rawBytes.byteLength).toBe(12 + 16 + Buffer.byteLength(plain, "utf8"))

					const dec1 = cipher.decrypt(enc1.value)
					const dec2 = cipher.decrypt(enc2.value)
					expect(dec1.isOk()).toBe(true)
					expect(dec2.isOk()).toBe(true)
					if (dec1.isOk() && dec2.isOk()) {
						expect(dec1.value).toBe(plain)
						expect(dec2.value).toBe(plain)
					}
				}
			})
		})

		describe("Unhappy cases", () => {
			test("rejects unsupported version prefix, invalid base64, truncated payload, tampered bytes, and wrong key", () => {
				const cipher = new AesGcmTaxIdCipher({ encryptionKey: ENCRYPTION_KEY, hmacKey: HMAC_KEY })
				const wrongCipher = new AesGcmTaxIdCipher({ encryptionKey: OTHER_ENCRYPTION_KEY, hmacKey: HMAC_KEY })

				const encrypted = cipher.encrypt("8627480061811")
				expect(encrypted.isOk()).toBe(true)
				if (encrypted.isErr()) {
					return
				}

				const payloadBytes = Buffer.from(encrypted.value.slice(3), "base64")
				const tamperedIv = Buffer.from(payloadBytes)
				tamperedIv[0] = (tamperedIv[0] ?? 0) ^ 0xff
				const tamperedTag = Buffer.from(payloadBytes)
				tamperedTag[12] = (tamperedTag[12] ?? 0) ^ 0xff
				const tamperedCiphertext = Buffer.from(payloadBytes)
				tamperedCiphertext[payloadBytes.byteLength - 1] = (tamperedCiphertext[payloadBytes.byteLength - 1] ?? 0) ^ 0xff

				const badInputs = [
					`v2:${encrypted.value.slice(3)}`,
					encrypted.value.slice(3),
					"v1:not-valid-base64!",
					`v1:${Buffer.alloc(27).toString("base64")}`,
					`v1:${tamperedIv.toString("base64")}`,
					`v1:${tamperedTag.toString("base64")}`,
					`v1:${tamperedCiphertext.toString("base64")}`,
				]

				for (const bad of badInputs) {
					const res = cipher.decrypt(bad)
					expect(res.isErr()).toBe(true)
					if (res.isErr()) {
						expect(res.error).toBeInstanceOf(UnexpectedError)
					}
				}

				const wrongKeyRes = wrongCipher.decrypt(encrypted.value)
				expect(wrongKeyRes.isErr()).toBe(true)
				if (wrongKeyRes.isErr()) {
					expect(wrongKeyRes.error).toBeInstanceOf(UnexpectedError)
				}
			})
		})
	})

	describe("hash", () => {
		describe("Happy cases", () => {
			test("produces deterministic lowercase 64-char hex HMAC-SHA256 matching independent vector", () => {
				const cipher = new AesGcmTaxIdCipher({ encryptionKey: ENCRYPTION_KEY, hmacKey: HMAC_KEY })
				const plain = "8627480061811"
				const expected = createHmac("sha256", HMAC_KEY).update(plain, "utf8").digest("hex")

				const h1 = cipher.hash(plain)
				const h2 = cipher.hash(plain)

				expect(h1.isOk()).toBe(true)
				expect(h2.isOk()).toBe(true)
				if (h1.isOk() && h2.isOk()) {
					expect(h1.value).toMatch(/^[0-9a-f]{64}$/)
					expect(h1.value).toBe(expected)
					expect(h2.value).toBe(h1.value)
				}

				const otherTaxId = cipher.hash("1234567890123")
				const otherKeyCipher = new AesGcmTaxIdCipher({ encryptionKey: ENCRYPTION_KEY, hmacKey: OTHER_HMAC_KEY })
				const otherKeyHash = otherKeyCipher.hash(plain)
				expect(otherTaxId.isOk()).toBe(true)
				expect(otherKeyHash.isOk()).toBe(true)
				if (h1.isOk() && otherTaxId.isOk() && otherKeyHash.isOk()) {
					expect(otherTaxId.value).not.toBe(h1.value)
					expect(otherKeyHash.value).not.toBe(h1.value)
				}
			})
		})
	})
})
