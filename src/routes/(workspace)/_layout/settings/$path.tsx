import { viewPaths } from "@better-auth-ui/react/core";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Settings } from "#/components/settings/settings";

export const Route = createFileRoute("/(workspace)/_layout/settings/$path")({
	beforeLoad: ({ params: { path } }) => {
		if (!Object.values(viewPaths.settings).includes(path)) {
			throw notFound();
		}
	},
	component: SettingsPage,
});

function SettingsPage() {
	const { path } = Route.useParams();
	return (
		<div className="mx-auto w-full max-w-3xl">
			<Settings path={path} />
		</div>
	);
}
