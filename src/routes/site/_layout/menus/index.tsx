import { createFileRoute } from "@tanstack/react-router";
import { MenuManagement } from "#/components/menu-management";
import { requireSiteAdmin } from "#/lib/auth/guards";

export const Route = createFileRoute("/site/_layout/menus/")({
	beforeLoad: async () => {
		await requireSiteAdmin();
	},
	component: SiteMenusPage,
});

function SiteMenusPage() {
	return <MenuManagement mode="site" />;
}
