import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { DataTable } from "#/components/data-table/data-table";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/(workspace)/_layout/invitations/")({
	component: InvitationsPage,
});

interface UserInvitation {
	id: string;
	email: string;
	role: string | null;
	status: string;
	expiresAt: Date | string;
	organizationId: string;
	organizationName?: string;
}

function InvitationsPage() {
	const queryClient = useQueryClient();
	const { data, isPending } = useQuery({
		queryKey: ["organization", "user-invitations"],
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.listUserInvitations();
			if (error) throw new Error(error.message);
			return data;
		},
	});

	const invitations = (data ?? []) as unknown as UserInvitation[];
	const pending = invitations.filter((i) => i.status === "pending");

	const acceptMutation = useMutation({
		mutationFn: async (invitationId: string) => {
			const { error } = await authClient.organization.acceptInvitation({
				invitationId,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success("Invitation accepted");
			queryClient.invalidateQueries({
				queryKey: ["organization", "user-invitations"],
			});
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const rejectMutation = useMutation({
		mutationFn: async (invitationId: string) => {
			const { error } = await authClient.organization.rejectInvitation({
				invitationId,
			});
			if (error) throw new Error(error.message);
		},
		onSuccess: () => {
			toast.success("Invitation rejected");
			queryClient.invalidateQueries({
				queryKey: ["organization", "user-invitations"],
			});
		},
		onError: (err: Error) => toast.error(err.message),
	});

	const columns: ColumnDef<UserInvitation>[] = [
		{
			accessorKey: "organizationName",
			header: "Organization",
			cell: ({ row }) => (
				<span className="font-medium">
					{row.original.organizationName ?? row.original.organizationId}
				</span>
			),
		},
		{
			accessorKey: "role",
			header: "Role",
			cell: ({ row }) => (
				<Badge variant="outline">{row.original.role ?? "—"}</Badge>
			),
		},
		{
			accessorKey: "expiresAt",
			header: "Expires",
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{new Date(row.original.expiresAt).toLocaleString()}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const busy = acceptMutation.isPending || rejectMutation.isPending;
				return (
					<div className="flex gap-2">
						<Button
							size="sm"
							disabled={busy}
							onClick={() => acceptMutation.mutate(row.original.id)}
						>
							Accept
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => rejectMutation.mutate(row.original.id)}
						>
							Reject
						</Button>
					</div>
				);
			},
		},
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle>My invitations</CardTitle>
				<CardDescription>
					Organizations that have invited you to join.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<DataTable
					columns={columns}
					data={pending}
					loading={isPending}
					rowKey={(row) => row.id}
					emptyText="No pending invitations"
				/>
			</CardContent>
		</Card>
	);
}
