import type { AppEnvConfig } from "src/shared/config/env";

declare module "bun" {
	interface Env extends AppEnvConfig {
		TZ?: string;
	}
}

export {};
