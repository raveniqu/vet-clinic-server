import { getLogger } from "@logtape/logtape"
import { Elysia } from "elysia"

export type ErrorResponseBody = {
	readonly error_message: string
}

type ValidationIssue = {
	readonly path?: string
	readonly message?: string
}

type ValidationErrorLike = {
	readonly valueError?: ValidationIssue
	readonly all?: readonly ValidationIssue[]
}

const logger = getLogger(["app", "http"])

function formatValidationError(error: ValidationErrorLike): string {
	const issue = error.valueError ?? error.all?.[0]
	if (issue === undefined) {
		return "Invalid request"
	}

	const rawPath = typeof issue.path === "string" ? issue.path : ""
	const field = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath
	const message = typeof issue.message === "string" && issue.message.length > 0 ? issue.message : "Invalid value"

	if (field.length > 0) {
		return `${field}: ${message}`
	}
	return message
}

export function newErrorPlugin() {
	return new Elysia({ name: "error-handler" }).onError({ as: "global" }, ({ code, error, set, request }): ErrorResponseBody => {
		if (code === "PARSE") {
			set.status = 400
			return { error_message: "Malformed JSON request body" }
		}

		if (code === "VALIDATION") {
			set.status = 400
			return { error_message: formatValidationError(error) }
		}

		if (code === "NOT_FOUND") {
			set.status = 404
			return { error_message: "Not Found" }
		}

		const pathname = new URL(request.url).pathname
		const reason = error instanceof Error ? error.message : String(error)
		logger.error("Unhandled HTTP error on {method} {path}: {reason}", {
			method: request.method,
			path: pathname,
			code: String(code),
			reason: reason,
		})

		set.status = 500
		return { error_message: "Internal Server Error" }
	})
}
