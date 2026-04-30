import { ArrowUpRightIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { cn } from "#/lib/utils";
import * as m from "#/paraglide/messages";

/**
 * Whether the upgrade CTA system should render at all.
 *
 * Lives at the module scope so all upgrade entry points share one rule:
 * - 必须 saas 模式（private 模式默认 org 是 enterprise，不存在升级概念）
 * - 必须当前 plan 不是 enterprise（已经是顶档）
 *
 * 详见 .trellis/spec/backend/billing-stripe.md §2.3。
 */
export function shouldShowUpgradeCta(plan: string | null | undefined): boolean {
	const productMode =
		typeof import.meta.env !== "undefined"
			? (import.meta.env.VITE_PRODUCT_MODE as string | undefined)
			: process.env.VITE_PRODUCT_MODE;
	if (productMode !== "saas") return false;
	if (plan === "enterprise") return false;
	return true;
}

const PLAN_LABELS: Record<string, () => string> = {
	free: m.plan_label_free,
	personal_pro: m.plan_label_personal_pro,
	team_pro: m.plan_label_team_pro,
	enterprise: m.plan_label_enterprise,
};

function resolvePlanLabel(plan: string | null | undefined): string {
	if (!plan) return m.plan_label_free();
	const fn = PLAN_LABELS[plan];
	return fn ? fn() : m.plan_label_free();
}

interface UpgradePlanButtonProps {
	/** Current organization plan; gates whether the CTA renders. */
	plan: string | null | undefined;
	/** Optional className for layout tuning. */
	className?: string;
	/** Visual style. Default uses the primary button. */
	variant?: "default" | "outline";
	/** Size variant pass-through. Default `sm`. */
	size?: "sm" | "default";
}

/**
 * Stand-alone upgrade button. Renders nothing when the upgrade CTA system
 * is disabled (private mode or already-enterprise org).
 *
 * On click: toast `m.upgrade_coming_soon()`. No network call until the
 * Stripe stub is replaced (see TODO inside the component).
 */
export function UpgradePlanButton({
	plan,
	className,
	variant = "default",
	size = "sm",
}: UpgradePlanButtonProps) {
	if (!shouldShowUpgradeCta(plan)) return null;

	function handleClick() {
		// TODO(stripe): replace with `authClient.subscription.upgrade({ ... })`
		// once the @better-auth/stripe plugin is wired up. See
		// .trellis/spec/backend/billing-stripe.md §3.6.
		toast.info(m.upgrade_coming_soon());
	}

	return (
		<Button
			variant={variant}
			size={size}
			onClick={handleClick}
			className={cn("gap-1.5", className)}
		>
			<SparklesIcon className="size-4" />
			{m.upgrade_button_label()}
			<ArrowUpRightIcon className="size-3.5 opacity-70" />
		</Button>
	);
}

interface UpgradePlanCardProps {
	/** Current organization plan. */
	plan: string | null | undefined;
	/** Optional className for outer Card. */
	className?: string;
}

/**
 * Whole-card upgrade prompt for empty / disabled feature states (e.g. the
 * teams page when `plan.maxTeams === 0`). Renders nothing when the upgrade
 * CTA system is disabled.
 */
export function UpgradePlanCard({ plan, className }: UpgradePlanCardProps) {
	if (!shouldShowUpgradeCta(plan)) return null;
	const planLabel = resolvePlanLabel(plan);

	return (
		<Card className={cn("border-dashed", className)}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<SparklesIcon className="size-5 text-primary" />
					{m.upgrade_card_title()}
				</CardTitle>
				<CardDescription>
					{m.upgrade_card_description({ plan: planLabel })}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<UpgradePlanButton plan={plan} />
			</CardContent>
		</Card>
	);
}
