"use client";

import {
	type useListDeviceSessions,
	useSetActiveSession,
} from "@better-auth-ui/react";

import { DropdownMenuItem } from "#/components/ui/dropdown-menu";
import { Spinner } from "#/components/ui/spinner";
import { UserView } from "./user-view";

export type DeviceSession = NonNullable<
	ReturnType<typeof useListDeviceSessions>["data"]
>[number];

export type SwitchAccountItemProps = {
	deviceSession: DeviceSession;
};

/**
 * Render a dropdown menu item for switching to a different authenticated session.
 *
 * @param deviceSession - The device session to display and switch to when selected
 * @returns The switch account dropdown menu item as a JSX element
 */
export function SwitchAccountItem({ deviceSession }: SwitchAccountItemProps) {
	// onSuccess MUST be passed to the hook options (not the mutate() 2nd arg).
	// `useSetActiveSession` overrides the mutation's onSuccess and chains to
	// the hook options via `await s?.onSuccess?.(...)` — per-call mutate
	// callbacks are effectively swallowed by its wrapper.
	const { mutate: setActiveSession, isPending } = useSetActiveSession({
		onSuccess: () => {
			// Full navigation to /dashboard: rebuilds the whole SPA tree, which
			// resets `tabbarStore` (in-memory, no persist) and all TanStack
			// Query caches. Partial invalidate leaves stale tabs from the
			// previous user in the header.
			window.location.href = "/dashboard";
		},
	});

	return (
		<DropdownMenuItem
			disabled={isPending}
			onSelect={() =>
				setActiveSession({ sessionToken: deviceSession.session.token })
			}
		>
			<UserView user={deviceSession.user} />

			{isPending && <Spinner className="ml-auto size-4" />}
		</DropdownMenuItem>
	);
}
