import { describe, expect, test } from "bun:test"

import { AppError, ConflictError, DomainValidationError, NotFoundError, UnexpectedError, mapPgError } from "src/core/errors"

describe("Core errors", () => {
	describe("AppError hierarchy", () => {
		describe("Happy cases", () => {
			test("constructs DomainValidationError with expected code, name, and message", () => {
				const err = new DomainValidationError("privacy_policy must be true")

				expect(err).toBeInstanceOf(Error)
				expect(err).toBeInstanceOf(AppError)
				expect(err.code).toBe("DOMAIN_VALIDATION")
				expect(err.name).toBe("DomainValidationError")
				expect(err.message).toBe("privacy_policy must be true")
			})

			test("constructs ConflictError with constraint name", () => {
				const err = new ConflictError("Duplicate phone", "uniq_owners_phone_no_live")

				expect(err).toBeInstanceOf(AppError)
				expect(err.code).toBe("CONFLICT")
				expect(err.name).toBe("ConflictError")
				expect(err.message).toBe("Duplicate phone")
				expect(err.constraint).toBe("uniq_owners_phone_no_live")
			})

			test("constructs NotFoundError with expected code and message", () => {
				const err = new NotFoundError("Owner not found")

				expect(err).toBeInstanceOf(AppError)
				expect(err.code).toBe("NOT_FOUND")
				expect(err.name).toBe("NotFoundError")
				expect(err.message).toBe("Owner not found")
			})

			test("constructs UnexpectedError preserving original cause", () => {
				const rootCause = new Error("connection reset")
				const err = new UnexpectedError("DB query failed", rootCause)

				expect(err).toBeInstanceOf(AppError)
				expect(err.code).toBe("UNEXPECTED")
				expect(err.name).toBe("UnexpectedError")
				expect(err.message).toBe("DB query failed")
				expect(err.cause).toBe(rootCause)
			})
		})
	})

	describe("mapPgError", () => {
		describe("Happy cases", () => {
			test("maps postgres.js 23505 unique violation using constraint_name to ConflictError", () => {
				const pgError = {
					code: "23505",
					constraint_name: "uniq_owners_phone_no_live",
					message: "duplicate key value violates unique constraint",
				}

				const mapped = mapPgError(pgError)

				expect(mapped).toBeInstanceOf(ConflictError)
				if (mapped instanceof ConflictError) {
					expect(mapped.constraint).toBe("uniq_owners_phone_no_live")
					expect(mapped.message).toBe("Unique constraint violation: uniq_owners_phone_no_live")
				}
			})

			test("maps pg-style 23505 unique violation using constraint property to ConflictError", () => {
				const pgError = {
					code: "23505",
					constraint: "uniq_owners_email_live",
					message: "duplicate key value violates unique constraint",
				}

				const mapped = mapPgError(pgError)

				expect(mapped).toBeInstanceOf(ConflictError)
				if (mapped instanceof ConflictError) {
					expect(mapped.constraint).toBe("uniq_owners_email_live")
					expect(mapped.message).toBe("Unique constraint violation: uniq_owners_email_live")
				}
			})

			test("maps 23505 with missing or empty constraint name to ConflictError with null constraint", () => {
				const missingConstraint = mapPgError({ code: "23505" })
				const emptyConstraint = mapPgError({ code: "23505", constraint_name: "" })

				expect(missingConstraint).toBeInstanceOf(ConflictError)
				if (missingConstraint instanceof ConflictError) {
					expect(missingConstraint.constraint).toBeNull()
					expect(missingConstraint.message).toBe("Unique constraint violation")
				}

				expect(emptyConstraint).toBeInstanceOf(ConflictError)
				if (emptyConstraint instanceof ConflictError) {
					expect(emptyConstraint.constraint).toBeNull()
					expect(emptyConstraint.message).toBe("Unique constraint violation")
				}
			})
		})

		describe("Unhappy cases", () => {
			test("maps non-23505 Postgres SQLSTATE codes to UnexpectedError preserving cause", () => {
				const fkViolation = Object.assign(new Error("foreign key violation"), {
					code: "23503",
					constraint_name: "owner_addresses_owner_id_fkey",
				})
				const checkViolation = Object.assign(new Error("check violation"), { code: "23514" })
				const canceled = Object.assign(new Error("canceling statement due to user request"), { code: "57014" })

				for (const raw of [fkViolation, checkViolation, canceled]) {
					const mapped = mapPgError(raw)
					expect(mapped).toBeInstanceOf(UnexpectedError)
					if (mapped instanceof UnexpectedError) {
						expect(mapped.message).toBe(raw.message)
						expect(mapped.cause).toBe(raw)
					}
				}
			})

			test("maps generic Error and non-Error values to UnexpectedError preserving cause", () => {
				const genericErr = new Error("network timeout")
				const mappedErr = mapPgError(genericErr)
				expect(mappedErr).toBeInstanceOf(UnexpectedError)
				if (mappedErr instanceof UnexpectedError) {
					expect(mappedErr.message).toBe("network timeout")
					expect(mappedErr.cause).toBe(genericErr)
				}

				for (const raw of ["boom", null, undefined]) {
					const mapped = mapPgError(raw)
					expect(mapped).toBeInstanceOf(UnexpectedError)
					if (mapped instanceof UnexpectedError) {
						expect(mapped.message).toBe(String(raw))
						expect(mapped.cause).toBe(raw)
					}
				}
			})
		})
	})
})
