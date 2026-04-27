import { hostname } from "node:os";
import { brandConfig } from "#/config/brand";
import { env } from "#/lib/env";

const NODE_ENV_MAP: Record<string, "dev" | "prod" | "test"> = {
	development: "dev",
	production: "prod",
	test: "test",
};

// brand 单一真相源来自 `#/config/brand`（读 VITE_BRAND_*）。服务端邮件渲染
// 通过 appConfig.brand 访问，与 UI (`<BrandMark>`) 共享同一值，杜绝 drift。
// 这个文件本身仍是 server-only（`hostname()` 依赖 `node:os`）。

export const appConfig = {
	name: env.APP_NAME ?? "tan-servora",
	version: env.APP_VERSION ?? "0.0.1",
	env: env.APP_ENV ?? NODE_ENV_MAP[process.env.NODE_ENV ?? ""] ?? "dev",
	instanceId: env.APP_INSTANCE_ID ?? hostname(),
	brand: brandConfig,
} as const;
