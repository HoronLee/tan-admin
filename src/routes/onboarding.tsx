import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { authClient } from "#/lib/auth-client";
import * as m from "#/paraglide/messages";

// Bare page — no workspace layout / sidebar / tabbar. Shown as a fallback
// when the workspace guard finds a logged-in user without any activeOrg
// (saas mode edge case; super-admin is redirected to /site separately).
export const Route = createFileRoute("/onboarding")({
	component: OnboardingPage,
});

function OnboardingPage() {
	const navigate = useNavigate();

	async function handleSignOut() {
		await authClient.signOut();
		await navigate({ to: "/auth/$path", params: { path: "sign-in" } });
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4 md:p-6">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{m.onboarding_no_workspace_title()}</CardTitle>
					<CardDescription>{m.onboarding_no_workspace_body()}</CardDescription>
				</CardHeader>
				<CardContent>
					<Button type="button" variant="outline" onClick={handleSignOut}>
						{m.onboarding_sign_out()}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
