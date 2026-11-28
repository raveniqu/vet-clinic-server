import { t } from "elysia"

const OwnerAddressInputSchema = t.Object(
	{
		is_default: t.Optional(t.Boolean()),
		address_line: t.String({ minLength: 1, maxLength: 255 }),
		subdistrict: t.String({ minLength: 1, maxLength: 100 }),
		district: t.String({ minLength: 1, maxLength: 100 }),
		province: t.String({ minLength: 1, maxLength: 100 }),
		postal_code: t.String({ minLength: 1, maxLength: 10 }),
	},
	{ additionalProperties: false }
)

const CreateOwnerAddressesSchema = t.Object(
	{
		residential: OwnerAddressInputSchema,
		billing: t.Optional(t.Nullable(OwnerAddressInputSchema)),
	},
	{ additionalProperties: false }
)

const CreateOwnerConsentsSchema = t.Object(
	{
		privacy_policy: t.Boolean(),
		marketing: t.Boolean(),
		appointment: t.Boolean(),
		media: t.Boolean(),
		research: t.Boolean(),
	},
	{ additionalProperties: false }
)

// Allow blank/whitespace strings through wire validation so domain rejects them with 422, while malformed emails still fail wire validation with 400.
const EmailWireSchema = t.Union([t.String({ format: "email", maxLength: 255 }), t.String({ pattern: "^\\s*$", maxLength: 255 })])

export const RegisterJuristicOwnerBodySchema = t.Object(
	{
		type: t.Literal("JURISTIC"),
		prefix: t.Union([t.Literal("COMMERCIAL"), t.Literal("NON_PROFIT"), t.Literal("OTHER")]),
		first_name: t.String({ minLength: 1, maxLength: 255 }),
		tax_id: t.String({ pattern: "^[0-9]{13}$" }),
		phone_no: t.String({ minLength: 1, maxLength: 30 }),
		email: t.Optional(t.Nullable(EmailWireSchema)),
		line_id: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
		acquisition_channel: t.Union([
			t.Literal("WALK_IN"),
			t.Literal("LINE_OA"),
			t.Literal("WEB_PORTAL"),
			t.Literal("REFERRAL"),
			t.Literal("SOCIAL_MEDIA"),
			t.Literal("CAMPAIGN"),
		]),
		addresses: CreateOwnerAddressesSchema,
		consents: CreateOwnerConsentsSchema,
	},
	{ additionalProperties: false }
)

export const RegisterOwnerResponseSchema = t.Object(
	{
		id: t.Integer({ minimum: 1 }),
	},
	{ additionalProperties: false }
)

export type RegisterJuristicOwnerBody = typeof RegisterJuristicOwnerBodySchema.static
export type RegisterOwnerResponse = typeof RegisterOwnerResponseSchema.static
