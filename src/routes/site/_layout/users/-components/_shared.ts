/**
 * Shared types/constants for the site users page drawers/dialogs.
 *
 * `_components/` is a TanStack Router private directory (underscore prefix —
 * not part of the route tree). The `_shared.ts` filename keeps it private
 * within this group while signaling "internal helper, not a drawer".
 */

export type AdminRole = "admin" | "user";

export const ADMIN_ROLES: AdminRole[] = ["admin", "user"];

export interface AdminUser {
	id: string;
	name: string;
	email: string;
	image?: string | null;
	role?: string | null;
	banned?: boolean | null;
	banReason?: string | null;
	banExpires?: Date | string | null;
	createdAt: Date | string;
}
