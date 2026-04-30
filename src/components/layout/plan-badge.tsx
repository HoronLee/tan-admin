import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";
import * as m from "#/paraglide/messages";

interface PlanBadgeProps {
	/** Current organization plan; unknown / null falls back to "free". */
	plan: string | null | undefined;
	className?: string;
}

const PLAN_LABEL_FNS: Record<string, () => string> = {
	free: m.plan_label_free,
	personal_pro: m.plan_label_personal_pro,
	team_pro: m.plan_label_team_pro,
	enterprise: m.plan_label_enterprise,
};

/**
 * Small badge showing the current org plan. The component does NOT check
 * VITE_PRODUCT_MODE itself — the caller (e.g. AppSidebar) decides when to
 * render based on saas-only product policy.
 *
 * Visual treatment:
 * - free / personal_pro / team_pro → outline badge
 * - enterprise → amber-tinted badge to signal "top tier" without looking
 *   like an upsell target (private mode 默认就是 enterprise)
 */
export function PlanBadge({ plan, className }: PlanBadgeProps) {
	const isEnterprise = plan === "enterprise";
	const labelFn = plan ? PLAN_LABEL_FNS[plan] : undefined;
	const label = labelFn ? labelFn() : m.plan_label_free();

	return (
		<Badge
			variant={isEnterprise ? "default" : "outline"}
			className={cn(
				isEnterprise &&
					"border-amber-400/40 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
				className,
			)}
			data-plan={plan ?? "free"}
		>
			{label}
		</Badge>
	);
}
