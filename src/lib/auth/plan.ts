/**
 * Plan gating — 把"业务能力能不能用"从 env flag 迁移到 `organization.plan` 字段。
 * 服务端（`maximumTeams` / hooks）和客户端（Sidebar 灰化）读同一张表。
 *
 * 与 `organization.type` 正交：
 * - type: "personal" → 一般配 plan "free" 或 "personal_pro"
 * - type: "team"     → 一般配 "free" / "team_pro" / "enterprise"
 *
 * `canInviteMembers` 语义：**plan 级是否允许邀请**。personal org 另外由
 * `organizationHooks.beforeCreateInvitation` 按 `type === "personal"` 硬
 * 盖 false（不管 plan 是什么）。所以 type × plan 是正交关系：
 *   - personal + 任何 plan → 不可邀请（type 硬盖）
 *   - team + free / team_pro / enterprise → 可邀请
 *   - team + personal_pro → 不可邀请（plan 语义是"私人付费"）
 *
 * 详见 `.trellis/spec/backend/plan-gating.md`。
 */

export type PlanName = "free" | "personal_pro" | "team_pro" | "enterprise";
export type OrgType = "personal" | "team";

export interface PlanLimits {
	/** BA `teams.enabled` 已写死 true；本值 0 表示该 plan 下新建 team API 返回配额 0。 */
	maxTeams: number;
	/** 能否向外邀请成员（personal org 恒为 false，与此字段叠加时取交集）。 */
	canInviteMembers: boolean;
	/** 成员数上限；Infinity 表示无限。 */
	maxMembers: number;
}

const INF = Number.POSITIVE_INFINITY;

const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
	// free team workspace 允许邀请（Notion 心智：免费开始、加人协作）。
	// 未来做订阅限制时改走 `maxMembers` 数量上限，而不是全封。
	// personal org 的"不可邀请"由 type hook 兜底，不依赖这里。
	free: { maxTeams: 0, canInviteMembers: true, maxMembers: 5 },
	personal_pro: { maxTeams: 0, canInviteMembers: false, maxMembers: 1 },
	team_pro: { maxTeams: 10, canInviteMembers: true, maxMembers: 25 },
	enterprise: { maxTeams: INF, canInviteMembers: true, maxMembers: INF },
};

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
	const key = (plan ?? "free") as PlanName;
	return PLAN_LIMITS[key] ?? PLAN_LIMITS.free;
}

export function planAllowsTeams(plan: string | null | undefined): boolean {
	return getPlanLimits(plan).maxTeams > 0;
}
