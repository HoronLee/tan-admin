import { describe, expect, it } from "vitest";
import { resolveActiveOrganizationRole } from "#/lib/auth/session-role";

describe("resolveActiveOrganizationRole", () => {
	it("returns the persisted role when both session fields are valid", () => {
		expect(
			resolveActiveOrganizationRole({
				activeOrganizationId: "org-1",
				activeOrganizationRole: "owner",
			}),
		).toBe("owner");
	});

	it("fails closed when the active organization is missing", () => {
		expect(
			resolveActiveOrganizationRole({ activeOrganizationRole: "owner" }),
		).toBeUndefined();
	});

	it("fails closed when the persisted role is missing or malformed", () => {
		expect(
			resolveActiveOrganizationRole({
				activeOrganizationId: "org-1",
				activeOrganizationRole: null,
			}),
		).toBeUndefined();
		expect(
			resolveActiveOrganizationRole({
				activeOrganizationId: "org-1",
				activeOrganizationRole: "   ",
			}),
		).toBeUndefined();
	});
});
