import { Elysia } from "elysia"
import type { RequestContext } from "src/core/request-context"

export function newAuthPlugin() {
	return new Elysia({ name: "auth-context" }).derive({ as: "global" }, ({ request }) => {
		const ctx: RequestContext = { signal: request.signal }

		return { ctx: ctx }
	})
}
