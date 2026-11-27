import { Elysia } from "elysia"

export function newHealthPlugin() {
	return new Elysia({ name: "health" }).get("/api/v1/health", () => new Response(null, { status: 204 }))
}
