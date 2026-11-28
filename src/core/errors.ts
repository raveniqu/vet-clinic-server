export abstract class AppError extends Error {
	abstract readonly code: string

	constructor(message: string) {
		super(message)
		this.name = new.target.name
	}
}

export class DomainValidationError extends AppError {
	override readonly code = "DOMAIN_VALIDATION" as const
}

export class ConflictError extends AppError {
	override readonly code = "CONFLICT" as const
	readonly constraint: string | null

	constructor(message: string, constraint: string | null) {
		super(message)
		this.constraint = constraint
	}
}

export class NotFoundError extends AppError {
	override readonly code = "NOT_FOUND" as const
}

export class RequestAbortedError extends AppError {
	override readonly code = "REQUEST_ABORTED" as const
	override readonly cause: unknown

	constructor(message: string, cause: unknown) {
		super(message)
		this.cause = cause
	}
}

export class UnexpectedError extends AppError {
	override readonly code = "UNEXPECTED" as const
	override readonly cause: unknown

	constructor(message: string, cause: unknown) {
		super(message)
		this.cause = cause
	}
}

export type DomainError = DomainValidationError | ConflictError | NotFoundError | RequestAbortedError | UnexpectedError

type PgErrorLike = {
	readonly code?: unknown
	readonly constraint_name?: unknown
	readonly constraint?: unknown
}

function readConstraintName(record: PgErrorLike): string | null {
	const raw = record.constraint_name ?? record.constraint
	if (typeof raw === "string" && raw.length > 0) {
		return raw
	}
	return null
}

export function mapPgError(error: unknown): ConflictError | UnexpectedError {
	if (typeof error === "object" && error !== null) {
		const record = error as PgErrorLike
		if (record.code === "23505") {
			const constraint = readConstraintName(record)
			const message = constraint !== null ? `Unique constraint violation: ${constraint}` : "Unique constraint violation"
			return new ConflictError(message, constraint)
		}
	}

	const message = error instanceof Error ? error.message : String(error)
	return new UnexpectedError(message, error)
}
