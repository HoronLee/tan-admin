import { ORMError, ORMErrorReason } from "@zenstackhq/orm";
import { describe, expect, it } from "vitest";
import { authDb, db } from "#/db";

/**
 * Policy integration tests.
 *
 * These tests run against the real database (same DATABASE_URL used by the app).
 * They verify the core policy paths defined in the schema:
 *   1. unauthenticated — all write operations denied
 *   2. authenticated read — any logged-in user can read Menu
 *   3. admin write — isAdmin user can mutate Menu
 *   4. non-admin write — regular user cannot mutate Menu
 */
describe("RBAC Policy paths", () => {
	const aliceId = "test-user-alice-policy";
	const bobId = "test-user-bob-policy";

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
		it("bob (non-admin) cannot create a menu", async () => {
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

	// --- 4. Admin override ---

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
