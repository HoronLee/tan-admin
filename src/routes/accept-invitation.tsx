import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { authClient } from "#/lib/auth/client";
import { translateAuthError } from "#/lib/auth/errors";
import * as m from "#/paraglide/messages";

// Bare page — no workspace layout. Public URL target of the invitation email
// (`${BETTER_AUTH_URL}/accept-invitation?token=${invitation.id}` — see
// `src/lib/auth.ts` sendInvitationEmail).
//
// `authClient.organization.getInvitation` + `acceptInvitation` both require a
// session, so anonymous visitors can't preview invitation details.
// Anonymous path: forward `invitationToken` to sign-up / sign-in so the
// authenticated user lands back here automatically (sign-up uses BA's
// `verify-email?callbackURL=/accept-invitation?token=...` redirect; sign-in
// hard-navigates to the same URL on success). The mismatch / accept flow then
// runs unchanged.
export const Route = createFileRoute("/accept-invitation")({
	validateSearch: (search): { token?: string; email?: string } => {
		const out: { token?: string; email?: string } = {};
		const t = search.token;
		if (typeof t === "string" && t.length > 0) out.token = t;
		const e = search.email;
		if (typeof e === "string" && e.length > 0) out.email = e;
		return out;
	},
	component: AcceptInvitationPage,
});

interface InvitationDetail {
	id: string;
	email: string;
	role: string | null;
	status: string;
	expiresAt: Date | string;
	organizationId: string;
	organizationName?: string;
	organizationSlug?: string;
	inviterEmail?: string;
}

function AcceptInvitationPage() {
	const { token, email } = Route.useSearch();
	const navigate = useNavigate();
	const { data: session, isPending: sessionPending } = authClient.useSession();

	if (!token) {
		return (
			<Shell>
				<CardHeader>
					<CardTitle>{m.accept_invitation_missing_token_title()}</CardTitle>
					<CardDescription>
						{m.accept_invitation_missing_token_body()}
					</CardDescription>
				</CardHeader>
				<CardFooter>
					<Button
						variant="outline"
						onClick={() => navigate({ to: "/" })}
						type="button"
					>
						{m.accept_invitation_back_home()}
					</Button>
				</CardFooter>
			</Shell>
		);
	}

	if (sessionPending) {
		return (
			<Shell>
				<CardHeader>
					<CardTitle>{m.accept_invitation_loading_title()}</CardTitle>
				</CardHeader>
			</Shell>
		);
	}

	if (!session?.user) {
		return <NeedSignInCard token={token} email={email} />;
	}

	return (
		<AuthedInvitation
			token={token}
			currentUserEmail={session.user.email ?? ""}
		/>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-screen items-center justify-center p-4 md:p-6">
			<Card className="w-full max-w-md">{children}</Card>
		</div>
	);
}

function NeedSignInCard({ token, email }: { token: string; email?: string }) {
	const navigate = useNavigate();
	// Forward both the invitation token and (when present) the invitee email
	// to sign-up/sign-in. SignUp pins the email to read-only and uses the
	// token to round-trip back here through BA's verify-email callbackURL;
	// SignIn navigates straight back here on success. See `frontend/route-organization.md`.
	const search: { invitationToken: string; prefillEmail?: string } = {
		invitationToken: token,
		...(email ? { prefillEmail: email } : {}),
	};
	return (
		<Shell>
			<CardHeader>
				<CardTitle>{m.accept_invitation_need_signin_title()}</CardTitle>
				<CardDescription>
					{m.accept_invitation_need_signin_body()}
				</CardDescription>
			</CardHeader>
			<CardFooter className="flex gap-2">
				<Button
					type="button"
					onClick={() =>
						navigate({
							to: "/auth/$path",
							params: { path: "sign-up" },
							search,
						})
					}
				>
					{m.accept_invitation_go_signup()}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={() =>
						navigate({
							to: "/auth/$path",
							params: { path: "sign-in" },
							search,
						})
					}
				>
					{m.accept_invitation_go_signin()}
				</Button>
			</CardFooter>
		</Shell>
	);
}

function AuthedInvitation({
	token,
	currentUserEmail,
}: {
	token: string;
	currentUserEmail: string;
}) {
	const navigate = useNavigate();

	const {
		data: invitation,
		isPending,
		error,
	} = useQuery({
		queryKey: ["organization", "invitation", token],
		queryFn: async (): Promise<InvitationDetail> => {
			const { data, error } = await authClient.organization.getInvitation({
				query: { id: token },
			});
			if (error) throw new Error(error.message ?? "Invitation not found");
			return data as unknown as InvitationDetail;
		},
		retry: false,
	});

	const acceptMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.organization.acceptInvitation({
				invitationId: token,
			});
			if (error) throw error;
		},
		onSuccess: () => {
			toast.success(m.accept_invitation_accepted_toast());
			// Hard-navigate so BA session picks up the newly-joined org as
			// activeOrganizationId on the next session.create hook.
			window.location.href = "/dashboard";
		},
		onError: (err) => {
			toast.error(
				translateAuthError(err as { code?: string; message?: string }),
			);
		},
	});

	async function handleSwitchAccount() {
		await authClient.signOut();
		await navigate({ to: "/auth/$path", params: { path: "sign-in" } });
	}

	if (isPending) {
		return (
			<Shell>
				<CardHeader>
					<CardTitle>{m.accept_invitation_loading_title()}</CardTitle>
				</CardHeader>
			</Shell>
		);
	}

	if (error || !invitation) {
		return (
			<Shell>
				<CardHeader>
					<CardTitle>{m.accept_invitation_not_found_title()}</CardTitle>
					<CardDescription>
						{m.accept_invitation_not_found_body()}
					</CardDescription>
				</CardHeader>
				<CardFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => navigate({ to: "/" })}
					>
						{m.accept_invitation_back_home()}
					</Button>
				</CardFooter>
			</Shell>
		);
	}

	const emailMatches =
		invitation.email.toLowerCase() === currentUserEmail.toLowerCase();

	if (!emailMatches) {
		return (
			<Shell>
				<CardHeader>
					<CardTitle>{m.accept_invitation_email_mismatch_title()}</CardTitle>
					<CardDescription>
						{m.accept_invitation_email_mismatch_body({
							inviteEmail: invitation.email,
							currentEmail: currentUserEmail || "—",
						})}
					</CardDescription>
				</CardHeader>
				<CardFooter className="flex gap-2">
					<Button type="button" onClick={handleSwitchAccount}>
						{m.accept_invitation_switch_account()}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={() => navigate({ to: "/" })}
					>
						{m.accept_invitation_back_home()}
					</Button>
				</CardFooter>
			</Shell>
		);
	}

	const orgName = invitation.organizationName ?? invitation.organizationId;

	return (
		<Shell>
			<CardHeader>
				<CardTitle>
					{m.accept_invitation_title_prefix()} — {orgName}
				</CardTitle>
				<CardDescription>
					{m.accept_invitation_confirm_body({ organizationName: orgName })}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2 text-sm">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">
						{m.accept_invitation_role_label()}:
					</span>
					<Badge variant="outline">{invitation.role ?? "member"}</Badge>
				</div>
			</CardContent>
			<CardFooter className="flex gap-2">
				<Button
					type="button"
					disabled={acceptMutation.isPending}
					onClick={() => acceptMutation.mutate()}
				>
					{acceptMutation.isPending
						? m.common_processing()
						: m.accept_invitation_confirm_button()}
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={acceptMutation.isPending}
					onClick={() => navigate({ to: "/" })}
				>
					{m.common_cancel()}
				</Button>
			</CardFooter>
		</Shell>
	);
}
