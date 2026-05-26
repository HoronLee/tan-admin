type AdminCreateUser = {
	id: string;
	email: string;
	emailVerified: boolean;
};

type AdminCreateUserContext =
	| {
			path?: string;
			context: {
				internalAdapter: {
					updateUser: (
						userId: string,
						data: { emailVerified: boolean },
					) => Promise<unknown>;
				};
			};
	  }
	| null
	| undefined;

type AuthHookLogger = {
	info: (obj: unknown, msg: string) => void;
	error: (obj: unknown, msg: string) => void;
};

// admin.createUser users are reviewed by a site admin, so they can skip email
// verification. Keep this helper DB-free so its unit test stays isolated.
export async function flipEmailVerifiedForAdminCreate(
	user: AdminCreateUser,
	ctx: AdminCreateUserContext,
	log?: AuthHookLogger,
): Promise<void> {
	if (ctx?.path !== "/admin/create-user") return;
	if (user.emailVerified) return;
	try {
		await ctx.context.internalAdapter.updateUser(user.id, {
			emailVerified: true,
		});
		log?.info(
			{ userId: user.id, email: user.email },
			"admin.createUser path: emailVerified flipped to true.",
		);
	} catch (err) {
		log?.error(
			{ err, userId: user.id, email: user.email },
			"admin.createUser path: failed to flip emailVerified; user may be stuck at sign-in.",
		);
	}
}
