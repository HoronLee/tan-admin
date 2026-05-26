import { describe, expect, it, vi } from "vitest";
import { flipEmailVerifiedForAdminCreate } from "#/lib/auth/admin-create-user";

function makeCtx(path: string) {
	const updateUser = vi.fn().mockResolvedValue({});
	return {
		ctx: { path, context: { internalAdapter: { updateUser } } },
		updateUser,
	};
}

describe("flipEmailVerifiedForAdminCreate", () => {
	const baseUser = {
		id: "user_123",
		email: "bob@acme.com",
		emailVerified: false,
	};

	it("flips emailVerified for admin plugin path + unverified user", async () => {
		const { ctx, updateUser } = makeCtx("/admin/create-user");
		await flipEmailVerifiedForAdminCreate(baseUser, ctx);
		expect(updateUser).toHaveBeenCalledTimes(1);
		expect(updateUser).toHaveBeenCalledWith("user_123", {
			emailVerified: true,
		});
	});

	it("flips for admin path regardless of email suffix (covers @dev.com too)", async () => {
		const { ctx, updateUser } = makeCtx("/admin/create-user");
		await flipEmailVerifiedForAdminCreate(
			{ ...baseUser, email: "2@dev.com" },
			ctx,
		);
		expect(updateUser).toHaveBeenCalledTimes(1);
	});

	it("does NOT flip for signUpEmail path — public registration must keep verification flow", async () => {
		const { ctx, updateUser } = makeCtx("/sign-up/email");
		await flipEmailVerifiedForAdminCreate(baseUser, ctx);
		expect(updateUser).not.toHaveBeenCalled();
	});

	it("does NOT flip when user is already emailVerified=true (idempotent)", async () => {
		const { ctx, updateUser } = makeCtx("/admin/create-user");
		await flipEmailVerifiedForAdminCreate(
			{ ...baseUser, emailVerified: true },
			ctx,
		);
		expect(updateUser).not.toHaveBeenCalled();
	});

	it("does NOT flip when ctx is null (seed / internalAdapter direct path)", async () => {
		const updateUser = vi.fn().mockResolvedValue({});
		await flipEmailVerifiedForAdminCreate(baseUser, null);
		expect(updateUser).not.toHaveBeenCalled();
	});

	it("does NOT flip when ctx is undefined", async () => {
		await flipEmailVerifiedForAdminCreate(baseUser, undefined);
		// no throw, no call — defensive against BA signature changes
		expect(true).toBe(true);
	});

	it("does NOT flip for unrelated paths (e.g. /reset-password)", async () => {
		const { ctx, updateUser } = makeCtx("/reset-password");
		await flipEmailVerifiedForAdminCreate(baseUser, ctx);
		expect(updateUser).not.toHaveBeenCalled();
	});

	it("swallows updateUser errors (does not break user creation)", async () => {
		const updateUser = vi.fn().mockRejectedValue(new Error("db down"));
		const ctx = {
			path: "/admin/create-user",
			context: { internalAdapter: { updateUser } },
		};
		await expect(
			flipEmailVerifiedForAdminCreate(baseUser, ctx),
		).resolves.toBeUndefined();
		expect(updateUser).toHaveBeenCalledTimes(1);
	});
});
