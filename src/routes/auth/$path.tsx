import { viewPaths } from "@better-auth-ui/react/core";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Auth } from "#/components/auth/auth";

// PR2: optional search params used by the invitation → sign-up/sign-in
// round-trip flow. `accept-invitation` forwards the invitation token (and the
// invitee email when present in the email link) so SignUp/SignIn can pin the
// email field and bring the user back to `/accept-invitation?token=...` after
// authenticating.
export const Route = createFileRoute("/auth/$path")({
	validateSearch: (
		search,
	): { invitationToken?: string; prefillEmail?: string } => {
		const out: { invitationToken?: string; prefillEmail?: string } = {};
		const token = search.invitationToken;
		if (typeof token === "string" && token.length > 0) {
			out.invitationToken = token;
		}
		const email = search.prefillEmail;
		if (typeof email === "string" && email.length > 0) {
			out.prefillEmail = email;
		}
		return out;
	},
	beforeLoad: ({ params: { path } }) => {
		if (!Object.values(viewPaths.auth).includes(path)) {
			throw redirect({ to: "/" });
		}
	},
	component: AuthPage,
});

function AuthPage() {
	const { path } = Route.useParams();
	return (
		<div className="flex min-h-screen items-center justify-center p-4 md:p-6">
			<Auth path={path} />
		</div>
	);
}
