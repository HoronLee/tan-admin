import { ORMError, ORMErrorReason } from "@zenstackhq/orm";
import { describe, expect, it } from "vitest";
import { authDb, bindAuthDb, db } from "#/lib/db";

/**
 * Policy integration tests.
 *
 * These tests run against the real database (same DATABASE_URL used by the app).
 * They verify the core policy paths defined in the schema:
 *   1. unauthenticated — all write operations denied
 *   2. authenticated read — any logged-in user can read Menu
 *   3. admin write — isAdmin user can mutate Menu
 *   4. org owner write — active org owner can mutate org-scoped Menu
 *   5. org owner boundary — active org owner cannot mutate global Menu,
 *      and cannot re-scope an org menu out of the org (post-update rule)
 *   6. read isolation — org-scoped menus are invisible to other orgs
 *   7. non-admin write — regular user without owner context cannot mutate Menu
 */
describe("RBAC Policy paths", () => {
	const aliceId = "test-user-alice-policy";
	const bobId = "test-user-bob-policy";
	const orgId = "test-org-policy";

	// --- 1. Unauthenticated ---

	describe("unauthenticated (no $setAuth)", () => {
		it("reads are filtered to empty (auth==null, @@deny all)", async () => {
			// ZenStack v3: read policy violations → filtered results (not thrown)
			const menus = await authDb.menu.findMany();
			expect(Array.isArray(menus)).toBe(true);
			expect(menus).toHaveLength(0);
		});

		it("unauthenticated write is rejected by policy", async () => {
			await expect(
				authDb.menu.create({
					data: {
						name: "test-policy-unauthed",
						type: "MENU",
						status: "ACTIVE",
						order: 999,
					},
				}),
			).rejects.toSatisfy((err: unknown) => err instanceof ORMError);
		});
	});

	// --- 2. Authenticated read ---

	describe("authenticated: any user can read menus", () => {
		it("bob (non-admin) can read menus (returns array)", async () => {
			const bobDb = authDb.$setAuth({ userId: bobId, isAdmin: false });
			const menus = await bobDb.menu.findMany();
			expect(Array.isArray(menus)).toBe(true);
		});
	});

	// --- 3. Non-admin write denied ---

	describe("non-admin cannot write Menu", () => {
		it("bob (non-admin without owner context) cannot create a menu", async () => {
			const bobDb = authDb.$setAuth({ userId: bobId, isAdmin: false });
			await expect(
				bobDb.menu.create({
					data: {
						name: "test-policy-bob-create",
						type: "MENU",
						status: "ACTIVE",
						order: 999,
					},
				}),
			).rejects.toSatisfy((err: unknown) => {
				return (
					err instanceof ORMError &&
					(err.reason === ORMErrorReason.REJECTED_BY_POLICY ||
						err.reason === ORMErrorReason.NOT_FOUND)
				);
			});
		});
	});

	// --- 4. Org owner scoped write ---

	describe("active org owner can write org-scoped Menu", () => {
		let tempMenuId: number;

		it("bob can create a menu for his active organization", async () => {
			const bobDb = authDb.$setAuth({
				userId: bobId,
				isAdmin: false,
				activeOrganizationId: orgId,
				activeOrganizationRole: "owner",
			});
			const menu = await bobDb.menu.create({
				data: {
					name: "test-policy-bob-owner-create",
					type: "MENU",
					status: "ACTIVE",
					order: 997,
					organizationId: orgId,
				},
			});
			expect(menu.id).toBeDefined();
			tempMenuId = menu.id;
		});

		it("bob can delete that org-scoped menu", async () => {
			const bobDb = authDb.$setAuth({
				userId: bobId,
				isAdmin: false,
				activeOrganizationId: orgId,
				activeOrganizationRole: "owner",
			});
			await expect(
				bobDb.menu.delete({ where: { id: tempMenuId } }),
			).resolves.toBeDefined();
		});

		it("bob cannot update or delete a global menu", async () => {
			const globalMenu = await db.menu.create({
				data: {
					name: "test-policy-global-owner-denied",
					type: "MENU",
					status: "ACTIVE",
					order: 996,
				},
			});
			const bobDb = authDb.$setAuth({
				userId: bobId,
				isAdmin: false,
				activeOrganizationId: orgId,
				activeOrganizationRole: "owner",
			});

			try {
				await expect(
					bobDb.menu.update({
						where: { id: globalMenu.id },
						data: { name: "test-policy-global-owner-claimed" },
					}),
				).rejects.toSatisfy((err: unknown) => err instanceof ORMError);
				await expect(
					bobDb.menu.delete({ where: { id: globalMenu.id } }),
				).rejects.toSatisfy((err: unknown) => err instanceof ORMError);
			} finally {
				await db.menu.delete({ where: { id: globalMenu.id } }).catch(() => {});
			}
		});

		it("bob cannot re-scope an org menu to global or another org (post-update)", async () => {
			const orgMenu = await db.menu.create({
				data: {
					name: "test-policy-owner-rescope",
					type: "MENU",
					status: "ACTIVE",
					order: 995,
					organizationId: orgId,
				},
			});
			const bobDb = authDb.$setAuth({
				userId: bobId,
				isAdmin: false,
				activeOrganizationId: orgId,
				activeOrganizationRole: "owner",
			});

			try {
				// Escaping the org scope must fail the post-update check.
				await expect(
					bobDb.menu.update({
						where: { id: orgMenu.id },
						data: { organizationId: null },
					}),
				).rejects.toSatisfy((err: unknown) => err instanceof ORMError);
				await expect(
					bobDb.menu.update({
						where: { id: orgMenu.id },
						data: { organizationId: "test-org-policy-other" },
					}),
				).rejects.toSatisfy((err: unknown) => err instanceof ORMError);
				// Updates that keep the org scope still pass.
				await expect(
					bobDb.menu.update({
						where: { id: orgMenu.id },
						data: { name: "test-policy-owner-rescope-renamed" },
					}),
				).resolves.toBeDefined();
			} finally {
				await db.menu.delete({ where: { id: orgMenu.id } }).catch(() => {});
			}
		});

		it("bob cannot change an org menu to the SITE surface", async () => {
			const orgMenu = await db.menu.create({
				data: {
					name: "test-policy-owner-surface-change",
					type: "MENU",
					status: "ACTIVE",
					order: 991,
					organizationId: orgId,
				},
			});
			const bobDb = authDb.$setAuth({
				userId: bobId,
				isAdmin: false,
				activeOrganizationId: orgId,
				activeOrganizationRole: "owner",
			});

			try {
				await expect(
					bobDb.menu.update({
						where: { id: orgMenu.id },
						data: { surface: "SITE" },
					}),
				).rejects.toBeInstanceOf(ORMError);
			} finally {
				await db.menu.delete({ where: { id: orgMenu.id } }).catch(() => {});
			}
		});
	});

	// --- 6. Read isolation across orgs ---

	describe("org-scoped menus are invisible outside their org", () => {
		it("menus of another org are filtered from reads", async () => {
			const otherOrgMenu = await db.menu.create({
				data: {
					name: "test-policy-other-org-menu",
					type: "MENU",
					status: "ACTIVE",
					order: 994,
					organizationId: "test-org-policy-other",
				},
			});

			try {
				// bob's active org differs from the menu's org
				const bobDb = authDb.$setAuth({
					userId: bobId,
					isAdmin: false,
					activeOrganizationId: orgId,
					activeOrganizationRole: "member",
				});
				const visible = await bobDb.menu.findMany({
					where: { id: otherOrgMenu.id },
				});
				expect(visible).toHaveLength(0);

				// a user with no active org sees global menus only
				const noOrgDb = authDb.$setAuth({ userId: bobId, isAdmin: false });
				const visibleNoOrg = await noOrgDb.menu.findMany({
					where: { id: otherOrgMenu.id },
				});
				expect(visibleNoOrg).toHaveLength(0);

				// admin still sees everything
				const adminDb = authDb.$setAuth({ userId: aliceId, isAdmin: true });
				const visibleAdmin = await adminDb.menu.findMany({
					where: { id: otherOrgMenu.id },
				});
				expect(visibleAdmin).toHaveLength(1);
			} finally {
				await db.menu
					.delete({ where: { id: otherOrgMenu.id } })
					.catch(() => {});
			}
		});
	});

	// --- 7. Admin override ---

	describe("menu surface validation", () => {
		it("allows an admin to create a global SITE menu", async () => {
			const aliceDb = authDb.$setAuth({ userId: aliceId, isAdmin: true });
			const menu = await aliceDb.menu.create({
				data: {
					name: "test-policy-site-global",
					type: "MENU",
					surface: "SITE",
					status: "ACTIVE",
					order: 993,
				},
			});
			expect(menu.surface).toBe("SITE");
			await db.menu.delete({ where: { id: menu.id } });
		});

		it("rejects an organization-scoped SITE menu", async () => {
			const aliceDb = authDb.$setAuth({ userId: aliceId, isAdmin: true });
			await expect(
				aliceDb.menu.create({
					data: {
						name: "test-policy-site-org-invalid",
						type: "MENU",
						surface: "SITE",
						status: "ACTIVE",
						order: 992,
						organizationId: orgId,
					},
				}),
			).rejects.toBeInstanceOf(ORMError);
		});
	});

	describe("menu mutation guard", () => {
		const aliceDb = bindAuthDb({ userId: aliceId, isAdmin: true }, aliceId);

		it("rejects a parent from another surface", async () => {
			const parent = await db.menu.create({
				data: {
					name: "test-menu-guard-site-parent",
					type: "CATALOG",
					surface: "SITE",
					status: "ACTIVE",
					order: 980,
				},
			});

			try {
				await expect(
					aliceDb.menu.create({
						data: {
							name: "test-menu-guard-workspace-child",
							type: "MENU",
							surface: "WORKSPACE",
							parentId: parent.id,
							status: "ACTIVE",
							order: 981,
						},
					}),
				).rejects.toMatchObject({ reason: ORMErrorReason.INVALID_INPUT });
			} finally {
				await db.menu.delete({ where: { id: parent.id } }).catch(() => {});
			}
		});

		it("rejects re-scoping a parent that still has children", async () => {
			const parent = await db.menu.create({
				data: {
					name: "test-menu-guard-parent",
					type: "CATALOG",
					status: "ACTIVE",
					order: 982,
				},
			});
			const child = await db.menu.create({
				data: {
					name: "test-menu-guard-child",
					type: "MENU",
					parentId: parent.id,
					status: "ACTIVE",
					order: 983,
				},
			});

			try {
				await expect(
					aliceDb.menu.update({
						where: { id: parent.id },
						data: { organizationId: orgId },
					}),
				).rejects.toMatchObject({ reason: ORMErrorReason.INVALID_INPUT });
			} finally {
				await db.menu.delete({ where: { id: child.id } }).catch(() => {});
				await db.menu.delete({ where: { id: parent.id } }).catch(() => {});
			}
		});

		it("allows re-scoping a leaf menu", async () => {
			const leaf = await db.menu.create({
				data: {
					name: "test-menu-guard-leaf",
					type: "MENU",
					status: "ACTIVE",
					order: 984,
				},
			});

			try {
				await expect(
					aliceDb.menu.update({
						where: { id: leaf.id },
						data: { organizationId: orgId },
					}),
				).resolves.toMatchObject({ organizationId: orgId });
			} finally {
				await db.menu.delete({ where: { id: leaf.id } }).catch(() => {});
			}
		});
	});

	describe("admin can write Menu", () => {
		let tempMenuId: number;

		it("alice (admin) can create a menu", async () => {
			const aliceDb = authDb.$setAuth({ userId: aliceId, isAdmin: true });
			const menu = await aliceDb.menu.create({
				data: {
					name: "test-policy-alice-create",
					type: "MENU",
					status: "ACTIVE",
					order: 999,
				},
			});
			expect(menu.id).toBeDefined();
			tempMenuId = menu.id;
		});

		it("alice (admin) can delete that menu", async () => {
			const aliceDb = authDb.$setAuth({ userId: aliceId, isAdmin: true });
			await expect(
				aliceDb.menu.delete({ where: { id: tempMenuId } }),
			).resolves.toBeDefined();
		});

		it("direct db (no policy) can also write", async () => {
			const menu = await db.menu.create({
				data: {
					name: "test-policy-direct-create",
					type: "MENU",
					status: "ACTIVE",
					order: 998,
				},
			});
			expect(menu.id).toBeDefined();
			await db.menu.delete({ where: { id: menu.id } });
		});
	});
});
