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
import { authClient } from "#/lib/auth-client";
import { translateAuthError } from "#/lib/auth-errors";
import * as m from "#/paraglide/messages";

// Bare page — no workspace layout. Public URL target of the invitation email
// (`${BETTER_AUTH_URL}/accept-invitation?token=${invitation.id}` — see
// `src/lib/auth.ts` sendInvitationEmail).
//
// `authClient.organization.getInvitation` + `acceptInvitation` both require a
// session, so this page can't preview invitation details for anonymous users.
// Anonymous path: show a sign-in/sign-up CTA and ask the user to re-open the
// email link after authenticating. After authenticating, invitation details
// are fetched and the user can confirm or reject the email mismatch case.
export const Route = createFileRoute("/accept-invitation")({
	validateSearch: (search): { token?: string } => {
		const raw = search.token;
		if (typeof raw === "string" && raw.length > 0) return { token: raw };
		return {};
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
	const { token } = Route.useSearch();
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
		return <NeedSignInCard />;
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

function NeedSignInCard() {
	const navigate = useNavigate();
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
						navigate({ to: "/auth/$path", params: { path: "sign-up" } })
					}
				>
					{m.accept_invitation_go_signup()}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={() =>
						navigate({ to: "/auth/$path", params: { path: "sign-in" } })
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
