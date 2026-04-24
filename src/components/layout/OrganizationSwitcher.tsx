import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { authClient } from "#/lib/auth-client";
import { translateAuthError } from "#/lib/auth-errors";
import * as m from "#/paraglide/messages";

// `private` 模式下 BA 的 `allowUserToCreateOrganization: false` 已在后端
// 硬挡，前端同步禁用入口以获得一致 UX（按钮 disabled + "soon" 标签）。
// 前端可读 `VITE_*` 走 `import.meta.env`（Vite 约定），Node SSR 时走 process.env。
const PRODUCT_MODE =
	(typeof import.meta.env !== "undefined"
		? (import.meta.env.VITE_PRODUCT_MODE as string | undefined)
		: process.env.VITE_PRODUCT_MODE) ?? "private";
const CAN_CREATE_ORG = PRODUCT_MODE === "saas";

const SLUG_REGEX = /^[a-z0-9-]+$/;

export default function OrganizationSwitcher() {
	const { data: orgs, isPending: orgsPending } =
		authClient.useListOrganizations();
	const { data: activeOrg, isPending: activePending } =
		authClient.useActiveOrganization();
	const [dialogOpen, setDialogOpen] = useState(false);

	const items = useMemo(() => orgs ?? [], [orgs]);

	if (orgsPending || activePending) {
		return <Skeleton className="h-8 w-40" />;
	}

	async function handleSwitch(organizationId: string) {
		if (organizationId === activeOrg?.id) return;
		const { error } = await authClient.organization.setActive({
			organizationId,
		});
		if (error) {
			toast.error(error.message ?? "Failed to switch organization");
			return;
		}
		toast.success("Organization switched");
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="h-8 min-w-[10rem] justify-between gap-2"
					>
						<span className="flex items-center gap-2 truncate">
							<Building2 className="size-4 shrink-0 text-muted-foreground" />
							<span className="truncate">
								{activeOrg?.name ?? "Select organization"}
							</span>
						</span>
						<ChevronsUpDown className="size-3.5 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
					<DropdownMenuLabel className="text-xs text-muted-foreground">
						Organizations
					</DropdownMenuLabel>
					{items.length === 0 ? (
						<div className="px-2 py-6 text-center text-sm text-muted-foreground">
							No organizations
						</div>
					) : (
						items.map((org) => {
							const isActive = org.id === activeOrg?.id;
							return (
								<DropdownMenuItem
									key={org.id}
									onSelect={() => {
										void handleSwitch(org.id);
									}}
								>
									<Building2 className="size-4 text-muted-foreground" />
									<span className="flex-1 truncate">{org.name}</span>
									{isActive && <Check className="size-4 text-primary" />}
								</DropdownMenuItem>
							);
						})
					)}
					<DropdownMenuSeparator />
					{CAN_CREATE_ORG ? (
						<DropdownMenuItem
							onSelect={(e) => {
								e.preventDefault();
								setDialogOpen(true);
							}}
						>
							<Plus className="size-4 text-muted-foreground" />
							<span>{m.org_switcher_new_org()}</span>
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem disabled>
							<Plus className="size-4 text-muted-foreground" />
							<span>{m.org_switcher_new_org()}</span>
							<span className="ml-auto text-xs text-muted-foreground">
								soon
							</span>
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{CAN_CREATE_ORG && (
				<CreateOrganizationDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
				/>
			)}
		</>
	);
}

interface CreateOrganizationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function CreateOrganizationDialog({
	open,
	onOpenChange,
}: CreateOrganizationDialogProps) {
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [slugError, setSlugError] = useState<string | null>(null);

	function reset() {
		setName("");
		setSlug("");
		setSlugError(null);
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (submitting) return;
		setSlugError(null);

		if (!name.trim()) return;
		if (!SLUG_REGEX.test(slug)) {
			setSlugError(m.org_switcher_new_org_slug_invalid());
			return;
		}

		setSubmitting(true);
		const { data, error } = await authClient.organization.create({
			name: name.trim(),
			slug,
			// additionalFields with defaultValue are still typed as required on
			// the client (BA infers from schema shape, not runtime defaults).
			// Pass them explicitly to make intent obvious at the call site.
			type: "team",
			plan: "free",
		});
		if (error || !data) {
			setSubmitting(false);
			toast.error(translateAuthError(error ?? { message: "Create failed" }));
			return;
		}

		const { error: setActiveError } = await authClient.organization.setActive({
			organizationId: data.id,
		});
		setSubmitting(false);
		if (setActiveError) {
			toast.error(translateAuthError(setActiveError));
			return;
		}

		toast.success(m.org_switcher_new_org_success());
		onOpenChange(false);
		reset();
		// Hard reload so sidebar menus, active-org cache, and ZenStack policy
		// context all refresh to the newly-created org. Matches the pattern
		// used by ConvertToTeamSection.
		window.location.reload();
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.org_switcher_new_org_dialog_title()}</DialogTitle>
					<DialogDescription>
						{m.org_switcher_new_org_slug_help()}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="new-org-name">
							{m.org_switcher_new_org_name_label()}
						</Label>
						<Input
							id="new-org-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="new-org-slug">
							{m.org_switcher_new_org_slug_label()}
						</Label>
						<Input
							id="new-org-slug"
							value={slug}
							onChange={(e) => {
								setSlug(e.target.value);
								if (slugError) setSlugError(null);
							}}
							placeholder="acme-team"
							required
							aria-invalid={slugError ? true : undefined}
						/>
						{slugError ? (
							<p className="text-sm text-destructive">{slugError}</p>
						) : (
							<p className="text-sm text-muted-foreground">
								{m.org_switcher_new_org_slug_help()}
							</p>
						)}
					</div>
					<DialogFooter>
						<Button type="submit" disabled={submitting}>
							{submitting
								? m.org_switcher_new_org_creating()
								: m.org_switcher_new_org_create()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
