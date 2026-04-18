import { hostname } from "node:os";
import { env } from "#/env";

const NODE_ENV_MAP: Record<string, "dev" | "prod" | "test"> = {
	development: "dev",
	production: "prod",
	test: "test",
};

export const appConfig = {
	name: env.APP_NAME ?? "tan-admin",
	version: env.APP_VERSION ?? "0.0.1",
	env: env.APP_ENV ?? NODE_ENV_MAP[process.env.NODE_ENV ?? ""] ?? "dev",
	instanceId: env.APP_INSTANCE_ID ?? hostname(),
} as const;
