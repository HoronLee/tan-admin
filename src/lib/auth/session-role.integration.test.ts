import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authConfig } from "#/lib/auth/config";
import { pool } from "#/lib/db";

describe("active organization role database synchronization", () => {
	const userId = `session-role-user-${randomUUID()}`;
	const organizationId = `session-role-org-${randomUUID()}`;
	const memberId = `session-role-member-${randomUUID()}`;
	const sessionTokens = [
		`session-role-token-a-${randomUUID()}`,
		`session-role-token-b-${randomUUID()}`,
	];

	beforeAll(async () => {
		await pool.query(
			`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, true, now(), now())`,
			[userId, "Session Role Test", `${userId}@example.com`],
		);
		await pool.query(
			`INSERT INTO "organization" (id, name, slug, "createdAt")
			 VALUES ($1, $2, $3, now())`,
			[organizationId, "Session Role Test Org", organizationId],
		);
		await pool.query(
			`INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt")
			 VALUES ($1, $2, $3, 'owner', now())`,
			[memberId, organizationId, userId],
		);
		for (const token of sessionTokens) {
			await pool.query(
				`INSERT INTO "session"
					(id, "expiresAt", token, "createdAt", "updatedAt", "userId",
					 "activeOrganizationId", "activeOrganizationRole")
				 VALUES ($1, now() + interval '1 hour', $2, now(), now(), $3, $4, $5)`,
				[randomUUID(), token, userId, organizationId, "owner"],
			);
		}
	});

	afterAll(async () => {
		await pool.query('DELETE FROM "session" WHERE "userId" = $1', [userId]);
		await pool.query('DELETE FROM "member" WHERE "id" = $1', [memberId]);
		await pool.query('DELETE FROM "organization" WHERE id = $1', [
			organizationId,
		]);
		await pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
	});

	it("writes a matching role when a session is created", async () => {
		const hook = authConfig.databaseHooks?.session?.create?.before;
		expect(hook).toBeDefined();
		if (!hook) throw new Error("session create hook is not configured");

		const session = {
			id: "hook-session",
			userId,
			expiresAt: new Date(),
			token: "hook-token",
			createdAt: new Date(),
			updatedAt: new Date(),
			activeOrganizationId: organizationId,
		} satisfies Parameters<typeof hook>[0];
		const result = await hook(session);

		expect(result).toMatchObject({
			data: {
				activeOrganizationId: organizationId,
				activeOrganizationRole: "owner",
			},
		});
	});

	it("writes a matching role when the active organization changes", async () => {
		const hook = authConfig.databaseHooks?.session?.update?.before;
		expect(hook).toBeDefined();
		if (!hook) throw new Error("session update hook is not configured");

		const update = {
			activeOrganizationId: organizationId,
		} satisfies Parameters<typeof hook>[0];
		const context = {
			context: {
				session: { user: { id: userId } },
			},
		} as Parameters<typeof hook>[1];
		const result = await hook(update, context);

		expect(result).toMatchObject({ data: { activeOrganizationRole: "owner" } });
	});

	it("updates every active session when a member role changes", async () => {
		await pool.query('UPDATE "member" SET role = $1 WHERE id = $2', [
			"admin",
			memberId,
		]);

		const { rows } = await pool.query<{
			token: string;
			activeOrganizationRole: string | null;
		}>(
			`SELECT token, "activeOrganizationRole"
			   FROM "session"
			  WHERE "userId" = $1
			  ORDER BY token`,
			[userId],
		);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.activeOrganizationRole)).toEqual([
			"admin",
			"admin",
		]);
	});

	it("clears every active session when membership is removed", async () => {
		await pool.query('DELETE FROM "member" WHERE id = $1', [memberId]);

		const { rows } = await pool.query<{
			activeOrganizationId: string | null;
			activeOrganizationRole: string | null;
		}>(
			`SELECT "activeOrganizationId", "activeOrganizationRole"
			   FROM "session"
			  WHERE "userId" = $1`,
			[userId],
		);
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.activeOrganizationId).toBeNull();
			expect(row.activeOrganizationRole).toBeNull();
		}
	});

	it("clears sessions even when the organization is deleted directly", async () => {
		await pool.query(
			`UPDATE "session"
			    SET "activeOrganizationId" = $1, "activeOrganizationRole" = $2
			  WHERE "userId" = $3`,
			[organizationId, "owner", userId],
		);
		await pool.query('DELETE FROM "organization" WHERE id = $1', [
			organizationId,
		]);

		const { rows } = await pool.query<{
			activeOrganizationId: string | null;
			activeOrganizationRole: string | null;
		}>(
			`SELECT "activeOrganizationId", "activeOrganizationRole"
			   FROM "session"
			  WHERE "userId" = $1`,
			[userId],
		);
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(row.activeOrganizationId).toBeNull();
			expect(row.activeOrganizationRole).toBeNull();
		}
	});
});
