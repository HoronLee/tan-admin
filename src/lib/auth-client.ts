import {
	adminClient,
	inferOrgAdditionalFields,
	multiSessionClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "#/lib/auth";

export const authClient = createAuthClient({
	baseURL:
		import.meta.env.VITE_APP_URL ??
		(typeof window !== "undefined" ? window.location.origin : undefined),
	plugins: [
		adminClient(),
		organizationClient({
			// 走 BA 原生 owner / admin / member 三个角色 + 默认 statements
			// （organization / member / invitation / team）。不传 ac + roles
			// 让 BA 自己处理 hasPermission，避免踩"custom ac 覆盖 defaults →
			// invitation:create 资源丢失 → owner 也邀请不了人"的坑。
			//
			// BA client plugin 对 `teams.enabled` 类型门：只有字面量 `true`
			// 才会 infer 出 `createTeam` / `listTeams` / ... 的方法签名。插件
			// 级写死 `true`；运行时配额由 server 的 `maximumTeams` 函数读
			// `organization.plan` 决定（见 plan-gating.md），UI 灰化读同一份
			// plan（AppSidebar.SidebarGates）。
			teams: { enabled: true },
			// Infers `plan` / `industry` / `billingEmail` from the server auth
			// config so `organization.plan` is typed on the client.
			schema: inferOrgAdditionalFields<typeof auth>(),
		}),
		multiSessionClient(),
	],
});
