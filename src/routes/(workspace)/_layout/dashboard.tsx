import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheckIcon, WorkflowIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import * as m from "#/paraglide/messages";

type DeniedReason = "site-admin" | "org-role" | "no-active-org";

export const Route = createFileRoute("/(workspace)/_layout/dashboard")({
	validateSearch: (search): { denied?: DeniedReason } => {
		const denied = search.denied;
		if (
			denied === "site-admin" ||
			denied === "org-role" ||
			denied === "no-active-org"
		) {
			return { denied };
		}
		return {};
	},
	component: AdminDashboardPage,
});

function useDenialToast() {
	const { denied } = Route.useSearch();
	const navigate = useNavigate();
	useEffect(() => {
		if (!denied) return;
		const messageFn =
			denied === "site-admin"
				? m.denied_site_admin
				: denied === "org-role"
					? m.denied_org_role
					: m.denied_no_active_org;
		toast.error(messageFn());
		// Strip the query param so refresh / back-navigation doesn't re-fire.
		navigate({
			to: "/dashboard",
			search: {},
			replace: true,
		});
	}, [denied, navigate]);
}

function AdminDashboardPage() {
	useDenialToast();
	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
						Dashboard
					</p>
					<CardTitle className="text-2xl font-semibold">
						Admin shell is ready
					</CardTitle>
					<CardDescription className="max-w-2xl">
						This workspace is the landing area for CRUD model pages powered by
						ZenStack hooks and Better Auth. Start with Users and Organization,
						then scale the same pattern to Menu, Permission, and other admin
						domains.
					</CardDescription>
				</CardHeader>
			</Card>

			<div className="grid gap-4 sm:grid-cols-2">
				<Card size="sm">
					<CardHeader>
						<div className="inline-flex w-fit rounded-full border p-2">
							<ShieldCheckIcon size={18} />
						</div>
						<CardTitle className="mt-3 text-base">
							Policy-aware data path
						</CardTitle>
						<CardDescription>
							`/api/model/**` requests are evaluated with PolicyPlugin using
							request session context, matching server-side RBAC semantics.
						</CardDescription>
					</CardHeader>
				</Card>
				<Card size="sm">
					<CardHeader>
						<div className="inline-flex w-fit rounded-full border p-2">
							<WorkflowIcon size={18} />
						</div>
						<CardTitle className="mt-3 text-base">
							Dual-stack contract
						</CardTitle>
						<CardDescription>
							CRUD uses ZenStack hooks while business actions stay on oRPC, both
							sharing one error reporting surface in the frontend.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>

			<Card size="sm">
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Next steps: pick a task in{" "}
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
							.trellis/tasks/
						</code>{" "}
						or explore the research library at{" "}
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
							docs/research/
						</code>
						.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
