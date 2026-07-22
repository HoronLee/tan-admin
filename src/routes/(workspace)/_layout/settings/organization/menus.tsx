import { createFileRoute } from "@tanstack/react-router";
import { MenuManagement } from "#/components/menu-management";
import { requireOrgMemberRole } from "#/lib/auth/guards";

export const Route = createFileRoute(
	"/(workspace)/_layout/settings/organization/menus",
)({
	beforeLoad: async () => {
		await requireOrgMemberRole({ data: { allowed: ["owner"] } });
	},
	component: WorkspaceMenusPage,
});

function WorkspaceMenusPage() {
	return <MenuManagement mode="workspace" />;
}
