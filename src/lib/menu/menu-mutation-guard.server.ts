import "@tanstack/react-start/server-only";

import { definePlugin, ORMError, ORMErrorReason } from "@zenstackhq/orm";
import type { MenuScope, MenuSurface } from "#/lib/menu/menu-surface";
import { createModuleLogger } from "#/lib/observability/logger";
import { schema } from "../../../zenstack/schema";

const log = createModuleLogger("menu:mutation");

export interface MenuMutationActor {
	actorId?: string;
	isAdmin?: boolean;
	activeOrganizationId?: string;
}

export type MenuLookup = (
	id: number,
	includeChildren: boolean,
) => Promise<unknown>;

interface MenuRecord extends MenuScope {
	id: number;
	parentId: number | null;
	children?: { id: number }[];
}

function invalidInput(message: string): never {
	const error = new ORMError(ORMErrorReason.INVALID_INPUT, message);
	error.model = "Menu";
	throw error;
}

function readNullableString(
	value: unknown,
	fallback: string | null,
): string | null {
	if (value === undefined) return fallback;
	if (value === null || typeof value === "string") return value;
	if (typeof value === "object" && value && "set" in value) {
		const set = (value as { set?: unknown }).set;
		if (set === null || typeof set === "string") return set;
	}
	return fallback;
}

function readNullableNumber(
	value: unknown,
	fallback: number | null,
): number | null {
	if (value === undefined) return fallback;
	if (value === null || typeof value === "number") return value;
	if (typeof value === "object" && value && "set" in value) {
		const set = (value as { set?: unknown }).set;
		if (set === null || typeof set === "number") return set;
	}
	return fallback;
}

function readSurface(value: unknown, fallback: MenuSurface): MenuSurface {
	if (value === undefined) return fallback;
	if (value === "SITE" || value === "WORKSPACE") return value;
	if (typeof value === "object" && value && "set" in value) {
		const set = (value as { set?: unknown }).set;
		if (set === "SITE" || set === "WORKSPACE") return set;
	}
	invalidInput("Menu surface must be SITE or WORKSPACE.");
}

function scopeChanged(current: MenuScope, next: MenuScope): boolean {
	return (
		current.surface !== next.surface ||
		current.organizationId !== next.organizationId
	);
}

export function createMenuMutationGuard(
	lookupMenu: MenuLookup,
	actor: MenuMutationActor = {},
) {
	return definePlugin(schema, {
		id: "menu-mutation-guard",
		onQuery: async ({ model, operation, args, proceed }) => {
			if (
				model !== "Menu" ||
				(operation !== "create" && operation !== "update")
			) {
				return proceed(args);
			}

			const data = (args?.data ?? {}) as Record<string, unknown>;
			let current: MenuRecord | null = null;
			if (operation === "update") {
				const menuId = (args?.where as { id?: unknown } | undefined)?.id;
				if (typeof menuId !== "number") {
					invalidInput("Menu update requires a numeric id.");
				}
				current = (await lookupMenu(menuId, true)) as MenuRecord | null;
				if (!current) invalidInput("Menu does not exist or is not writable.");
			}

			const next: MenuRecord = {
				id: current?.id ?? 0,
				parentId: readNullableNumber(data.parentId, current?.parentId ?? null),
				surface: readSurface(data.surface, current?.surface ?? "WORKSPACE"),
				organizationId: readNullableString(
					data.organizationId,
					current?.organizationId ?? null,
				),
			};

			if (next.surface === "SITE" && next.organizationId !== null) {
				invalidInput("SITE menus must be global.");
			}

			if (current?.children?.length && scopeChanged(current, next)) {
				invalidInput(
					"Menus with children cannot change surface or organization scope.",
				);
			}

			if (next.parentId !== null) {
				if (next.parentId === current?.id) {
					invalidInput("A menu cannot be its own parent.");
				}
				const parent = (await lookupMenu(
					next.parentId,
					false,
				)) as MenuRecord | null;
				if (!parent)
					invalidInput("Menu parent does not exist or is not visible.");
				if (
					parent.surface !== next.surface ||
					(parent.organizationId !== null &&
						parent.organizationId !== next.organizationId)
				) {
					invalidInput("Menu parent must share the surface and scope.");
				}
			}

			const result = await proceed(args);
			const oldScope = current
				? {
						surface: current.surface,
						organizationId: current.organizationId,
					}
				: null;
			const crossOrganization =
				actor.isAdmin &&
				(next.organizationId !== actor.activeOrganizationId ||
					Boolean(oldScope && scopeChanged(oldScope, next)));
			if (crossOrganization) {
				log.info(
					{
						event: "menu.cross_org_mutation",
						actorId: actor.actorId,
						operation,
						menuId: current?.id,
						oldScope,
						newScope: {
							surface: next.surface,
							organizationId: next.organizationId,
						},
					},
					"cross-organization menu mutation",
				);
			}

			return result;
		},
	});
}
