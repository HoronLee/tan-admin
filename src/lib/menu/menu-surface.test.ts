import { describe, expect, it } from "vitest";
import { canChangeMenuScope, normalizeMenuScope } from "./menu-surface";

describe("menu surface scope", () => {
	it("forces SITE menus to the global scope", () => {
		expect(normalizeMenuScope("SITE", "org-1")).toEqual({
			surface: "SITE",
			organizationId: null,
		});
	});

	it("keeps WORKSPACE global and organization scopes distinct", () => {
		expect(normalizeMenuScope("WORKSPACE", undefined)).toEqual({
			surface: "WORKSPACE",
			organizationId: null,
		});
		expect(normalizeMenuScope("WORKSPACE", "org-1")).toEqual({
			surface: "WORKSPACE",
			organizationId: "org-1",
		});
	});

	it("blocks re-scoping a parent while allowing leaf re-scoping", () => {
		const current = normalizeMenuScope("WORKSPACE", "org-1");
		const next = normalizeMenuScope("WORKSPACE", null);

		expect(canChangeMenuScope(true, current, next)).toBe(false);
		expect(canChangeMenuScope(false, current, next)).toBe(true);
	});
});
