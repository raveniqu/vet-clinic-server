import { Elysia } from "elysia"
import type { Context } from "src/core/context"

export function newAuthPlugin() {
	return new Elysia({ name: "auth-context" }).derive({ as: "global" }, async ({ request }) => {
		const ctx: Context = { signal: request.signal }

		return ctx
	})
}
