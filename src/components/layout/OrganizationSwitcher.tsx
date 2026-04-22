import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Skeleton } from "#/components/ui/skeleton";
import { authClient } from "#/lib/auth-client";

export default function OrganizationSwitcher() {
	const { data: orgs, isPending: orgsPending } =
		authClient.useListOrganizations();
	const { data: activeOrg, isPending: activePending } =
		authClient.useActiveOrganization();

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
				<DropdownMenuItem disabled>
					<Plus className="size-4 text-muted-foreground" />
					<span>New organization</span>
					<span className="ml-auto text-xs text-muted-foreground">soon</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
