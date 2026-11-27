import { cors } from "@elysiajs/cors"
import { Elysia } from "elysia"
import type { AppEnvConfig } from "../config/env"

type SecurityPluginProps = {
	readonly nodeEnv: AppEnvConfig["NODE_ENV"]
	readonly allowedOrigins: string[]
}

type MutableHeaders = {
	readonly headers: Record<string, string | number | undefined>
}

function applySecurityHeaders(set: MutableHeaders, nodeEnv: AppEnvConfig["NODE_ENV"]) {
	set.headers["x-content-type-options"] = "nosniff"
	set.headers["x-frame-options"] = "DENY"
	set.headers["referrer-policy"] = "no-referrer"
	set.headers["content-security-policy"] = "default-src 'none'; frame-ancestors 'none'"
	set.headers["cache-control"] = "no-store"
	if (nodeEnv === "production") {
		set.headers["strict-transport-security"] = "max-age=31536000; includeSubDomains"
	}
}

export function newSecurityPlugin(props: SecurityPluginProps) {
	return new Elysia({ name: "security" })
		.use(
			cors({
				origin: props.allowedOrigins,
				methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
				credentials: true,
			})
		)
		.onAfterHandle({ as: "global" }, ({ set }) => {
			applySecurityHeaders(set, props.nodeEnv)
		})
		.onError({ as: "global" }, ({ set }) => {
			applySecurityHeaders(set, props.nodeEnv)
		})
}
