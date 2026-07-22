import * as z from "zod";

export const MENU_SURFACES = ["WORKSPACE", "SITE"] as const;

export const MenuSurfaceSchema = z.enum(MENU_SURFACES);

export type MenuSurface = z.infer<typeof MenuSurfaceSchema>;

export type MenuScope = {
	surface: MenuSurface;
	organizationId: string | null;
};

export function normalizeMenuScope(
	surface: MenuSurface,
	organizationId: string | null | undefined,
): MenuScope {
	return {
		surface,
		organizationId: surface === "SITE" ? null : (organizationId ?? null),
	};
}

export function canChangeMenuScope(
	hasChildren: boolean,
	current: MenuScope,
	next: MenuScope,
): boolean {
	if (
		hasChildren &&
		(current.surface !== next.surface ||
			current.organizationId !== next.organizationId)
	) {
		return false;
	}
	return true;
}
