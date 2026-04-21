import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheckIcon, WorkflowIcon } from "lucide-react";

export const Route = createFileRoute("/(admin)/dashboard")({
	component: AdminDashboardPage,
});

function AdminDashboardPage() {
	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-[var(--line)] bg-[color-mix(in_oklab,var(--header-bg)_90%,#fff_10%)] p-6">
				<p className="text-xs font-semibold tracking-[0.16em] text-[var(--sea-ink-soft)] uppercase">
					Dashboard
				</p>
				<h2 className="mt-2 text-2xl font-semibold text-[var(--sea-ink)]">
					Admin shell is ready
				</h2>
				<p className="mt-3 max-w-2xl text-sm text-[var(--sea-ink-soft)]">
					This workspace is the landing area for CRUD model pages powered by
					ZenStack hooks. Start with Roles, then scale the same pattern to
					Permission, Menu, and other admin domains.
				</p>
			</section>

			<section className="grid gap-4 sm:grid-cols-2">
				<article className="rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-5">
					<div className="inline-flex rounded-full border border-[var(--chip-line)] p-2 text-[var(--sea-ink)]">
						<ShieldCheckIcon size={18} />
					</div>
					<h3 className="mt-3 text-base font-semibold text-[var(--sea-ink)]">
						Policy-aware data path
					</h3>
					<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
						`/api/model/**` requests are evaluated with PolicyPlugin using
						request session context, matching server-side RBAC semantics.
					</p>
				</article>
				<article className="rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-5">
					<div className="inline-flex rounded-full border border-[var(--chip-line)] p-2 text-[var(--sea-ink)]">
						<WorkflowIcon size={18} />
					</div>
					<h3 className="mt-3 text-base font-semibold text-[var(--sea-ink)]">
						Dual-stack contract
					</h3>
					<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
						CRUD uses ZenStack hooks while business actions stay on oRPC, both
						sharing one error reporting surface in the frontend.
					</p>
				</article>
			</section>
		</div>
	);
}
