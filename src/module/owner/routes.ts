import { getLogger } from "@logtape/logtape"
import { Elysia } from "elysia"

import { ConflictError, DomainValidationError, RequestAbortedError } from "src/core/errors"
import { newAuthPlugin } from "src/shared/http/auth-plugin"
import type { ErrorResponseBody } from "src/shared/http/error-plugin"
import { type RegisterJuristicOwnerBody, RegisterJuristicOwnerBodySchema, type RegisterOwnerResponse } from "./contracts"
import type { RegisterOwnerRequest, RegisterOwnerUseCase } from "./use-case/command/register-owner/register-owner.service"

type OwnerRoutesDeps = {
	readonly registerOwnerService: RegisterOwnerUseCase
}

const logger = getLogger(["app", "owner"])

function toRegisterOwnerRequest(body: RegisterJuristicOwnerBody): RegisterOwnerRequest {
	return {
		type: body.type,
		prefix: body.prefix,
		firstName: body.first_name,
		taxId: body.tax_id,
		phoneNo: body.phone_no,
		email: body.email,
		lineId: body.line_id,
		acquisitionChannel: body.acquisition_channel,
		addresses: {
			residential: {
				isDefault: body.addresses.residential.is_default,
				addressLine: body.addresses.residential.address_line,
				subdistrict: body.addresses.residential.subdistrict,
				district: body.addresses.residential.district,
				province: body.addresses.residential.province,
				postalCode: body.addresses.residential.postal_code,
			},
			billing:
				body.addresses.billing === undefined || body.addresses.billing === null
					? body.addresses.billing
					: {
							isDefault: body.addresses.billing.is_default,
							addressLine: body.addresses.billing.address_line,
							subdistrict: body.addresses.billing.subdistrict,
							district: body.addresses.billing.district,
							province: body.addresses.billing.province,
							postalCode: body.addresses.billing.postal_code,
						},
		},
		consents: {
			privacyPolicy: body.consents.privacy_policy,
			marketing: body.consents.marketing,
			appointment: body.consents.appointment,
			media: body.consents.media,
			research: body.consents.research,
		},
	}
}

export function createOwnerRoutes(deps: OwnerRoutesDeps) {
	return new Elysia({ name: "owner-routes", normalize: false }).use(newAuthPlugin()).post(
		"/api/v1/owners",
		async ({ body, set, ctx }): Promise<RegisterOwnerResponse | ErrorResponseBody> => {
			const result = await deps.registerOwnerService.execute(ctx, toRegisterOwnerRequest(body))

			return result.match<RegisterOwnerResponse | ErrorResponseBody>(
				(created) => {
					set.status = 201
					set.headers.location = `/api/v1/owners/${created.id}`
					return { id: created.id }
				},
				(error) => {
					if (error instanceof DomainValidationError) {
						set.status = 422
						return { error_message: error.message }
					}
					if (error instanceof ConflictError) {
						set.status = 409
						return { error_message: error.message }
					}
					if (error instanceof RequestAbortedError) {
						logger.warn("Owner registration aborted by client")
						set.status = 499
						return { error_message: "Client disconnected" }
					}

					logger.error("Failed to register owner: {reason}", {
						errorCode: error.code,
						reason: error.message,
					})
					set.status = 500
					return { error_message: "Internal Server Error" }
				}
			)
		},
		{ body: RegisterJuristicOwnerBodySchema }
	)
}

export type OwnerRoutes = ReturnType<typeof createOwnerRoutes>
