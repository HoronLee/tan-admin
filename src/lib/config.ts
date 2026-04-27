import { env } from "#/lib/env";

/**
 * Client-safe configuration. Both server and client modules may import from
 * this file. Server-only configs (with `node:os`, secrets, etc.) live in
 * `./config.server.ts` and must NOT be re-exported from here, otherwise the
 * client bundle would inherit the server-only transitive deps.
 *
 * R6: brand 单一真相源。直接读 `VITE_BRAND_*`，前后端共用同一份：
 * - 浏览器：Vite build 时把 `VITE_*` 值内联到 bundle
 * - Node：`process.env.VITE_BRAND_*` 照常可读
 *
 * 这三个值（显示名 + logo URL × 2）是 100% 公开信息，不存在 secret 暴露
 * 问题，所以只需一份 `VITE_*` 变量，不搞"服务端真相 + 客户端镜像"的双
 * 份约定——少一处 drift 风险。UI (`<BrandMark>`)、路由标题
 * (`__root.tsx`)、服务端邮件渲染 (`appConfig.brand`) 全部读这里。
 *
 * 未设置时回退到 `"Tan Servora"` / `undefined`——无 env 也能正常显示旧
 * 默认品牌，非破坏性。
 */
export const brandConfig = {
	name: env.VITE_BRAND_NAME ?? "Tan Servora",
	logoURL: env.VITE_BRAND_LOGO_URL,
	logoDarkURL: env.VITE_BRAND_LOGO_DARK_URL,
} as const;
