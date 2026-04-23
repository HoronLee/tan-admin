/**
 * Plan gating — 把"业务能力能不能用"从 env flag 迁移到 `organization.plan` 字段。
 * 服务端（`maximumTeams` / hooks）和客户端（Sidebar 灰化）读同一张表。
 *
 * 与 `organization.type` 正交：
 * - type: "personal" → 一般配 plan "free" 或 "personal_pro"
 * - type: "team"     → 一般配 "free" / "team_pro" / "enterprise"
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
	free: { maxTeams: 0, canInviteMembers: false, maxMembers: 1 },
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
