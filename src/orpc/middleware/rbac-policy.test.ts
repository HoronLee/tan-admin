import { ORMError, ORMErrorReason } from "@zenstackhq/orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authDb, db } from "#/db";

/**
 * Policy integration tests.
 *
 * These tests run against the real database (same DATABASE_URL used by the app).
 * They verify the four key policy paths defined in the RBAC schema:
 *   1. unauthenticated — all denied
 *   2. own-record — UserRole readable by the owning user
 *   3. cross-user-deny — non-admin cannot write protected tables
 *   4. admin-override — super-admin can write everything
 */
describe("RBAC Policy paths", () => {
	// Seed IDs captured during setup
	let superAdminRoleId: number;
	let viewerRoleId: number;
	let aliceId: string;
	let bobId: string;

	beforeAll(async () => {
		// Wipe RBAC tables in safe order
		await db.rolePermission.deleteMany({});
		await db.userRole.deleteMany({});
		await db.role.deleteMany({});

		// Create test roles
		const superRole = await db.role.create({
			data: {
				name: "Super Admin",
				code: "super-admin",
				status: "ACTIVE",
				order: 0,
			},
		});
		const viewerRole = await db.role.create({
			data: { name: "Viewer", code: "viewer", status: "ACTIVE", order: 1 },
		});
		superAdminRoleId = superRole.id;
		viewerRoleId = viewerRole.id;

		// Fake user IDs (Better Auth users aren't seeded in unit tests)
		aliceId = "test-user-alice";
		bobId = "test-user-bob";

		// Assign super-admin to alice, viewer to bob
		await db.userRole.create({
			data: { userId: aliceId, roleId: superAdminRoleId },
		});
		await db.userRole.create({ data: { userId: bobId, roleId: viewerRoleId } });
	});

	afterAll(async () => {
		await db.userRole.deleteMany({
			where: { userId: { in: [aliceId, bobId] } },
		});
		await db.role.deleteMany({
			where: { id: { in: [superAdminRoleId, viewerRoleId] } },
		});
	});

	// --- 1. Unauthenticated ---

	describe("unauthenticated (no $setAuth)", () => {
		it("reads are filtered to empty (auth==null, @@deny read)", async () => {
			// ZenStack v3: read policy violations → filtered results (not thrown)
			const roles = await authDb.role.findMany();
			expect(roles).toHaveLength(0);
			await expect(
				authDb.role.create({
					data: { name: "X", code: "x", status: "ACTIVE", order: 99 },
				}),
			).rejects.toThrow();
		});
	});

	// --- 2. Own-record (UserRole) ---

	describe("own-record: UserRole visible to owning user", () => {
		it("bob can read his own UserRole", async () => {
			const bobDb = authDb.$setAuth({ userId: bobId, isAdmin: false });
			const rows = await bobDb.userRole.findMany();
			expect(rows).toHaveLength(1);
			expect(rows[0].userId).toBe(bobId);
		});

		it("alice cannot see bob's UserRole when not admin", async () => {
			// Alice is a super-admin, but let's test a hypothetical non-admin user
			// by creating a separate test case with a plain viewer perspective
			const carolDb = authDb.$setAuth({
				userId: "test-user-carol",
				isAdmin: false,
			});
			const rows = await carolDb.userRole.findMany();
			// carol has no UserRole records, so she should see empty array (not bob's)
			expect(rows).toHaveLength(0);
		});
	});

	// --- 3. Cross-user-deny (non-admin cannot mutate) ---

	describe("cross-user-deny: viewer cannot write Role", () => {
		it("bob (viewer) cannot create a role", async () => {
			const bobDb = authDb.$setAuth({ userId: bobId, isAdmin: false });
			await expect(
				bobDb.role.create({
					data: { name: "Hack", code: "hack", status: "ACTIVE", order: 99 },
				}),
			).rejects.toSatisfy((err: unknown) => {
				return (
					err instanceof ORMError &&
					(err.reason === ORMErrorReason.REJECTED_BY_POLICY ||
						err.reason === ORMErrorReason.NOT_FOUND)
				);
			});
		});

		it("bob (viewer) cannot delete a role", async () => {
			const bobDb = authDb.$setAuth({ userId: bobId, isAdmin: false });
			await expect(
				bobDb.role.delete({ where: { id: superAdminRoleId } }),
			).rejects.toSatisfy((err: unknown) => {
				return (
					err instanceof ORMError &&
					(err.reason === ORMErrorReason.REJECTED_BY_POLICY ||
						err.reason === ORMErrorReason.NOT_FOUND)
				);
			});
		});
	});

	// --- 4. Admin-override ---

	describe("admin-override: super-admin can write everything", () => {
		let tempRoleId: number;

		it("alice (super-admin) can create a role", async () => {
			const aliceDb = authDb.$setAuth({ userId: aliceId, isAdmin: true });
			const role = await aliceDb.role.create({
				data: {
					name: "Temp",
					code: "temp-policy-test",
					status: "ACTIVE",
					order: 99,
				},
			});
			expect(role.id).toBeDefined();
			tempRoleId = role.id;
		});

		it("alice (super-admin) can delete that role", async () => {
			const aliceDb = authDb.$setAuth({ userId: aliceId, isAdmin: true });
			await expect(
				aliceDb.role.delete({ where: { id: tempRoleId } }),
			).resolves.toBeDefined();
		});

		it("alice (super-admin) can assign a role to another user", async () => {
			const aliceDb = authDb.$setAuth({ userId: aliceId, isAdmin: true });
			const ur = await aliceDb.userRole.create({
				data: { userId: "test-user-dave", roleId: viewerRoleId },
			});
			expect(ur.userId).toBe("test-user-dave");
			// cleanup
			await db.userRole.delete({ where: { id: ur.id } });
		});
	});
});
