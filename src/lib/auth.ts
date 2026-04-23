import "@tanstack/react-start/server-only";

import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { admin, multiSession, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { pool } from "#/db";
import { env } from "#/env";
import { sendEmail } from "#/lib/email";
import { createModuleLogger } from "#/lib/logger";
import { ac, adminRole, member, owner } from "#/lib/permissions";

const log = createModuleLogger("better-auth");

// Dev convenience: addresses at `@dev.com` skip verification entirely — we
// flip `emailVerified` to true in-place and don't dispatch the email. Avoids
// touching mailpit for throwaway test accounts. Production unaffected.
//
// Don't import `appConfig` here — it pulls `node:os` transitively and taints
// the client bundle whenever a route file imports a serverFn from this tree
// (see auth-session.ts). Compute the flag from `env` + `process.env` locally.
const DEV_AUTO_VERIFY_DOMAIN = "@dev.com";
const IS_DEV_MODE =
	env.APP_ENV === "dev" ||
	(env.APP_ENV === undefined && process.env.NODE_ENV !== "production");

function isDevAutoVerifyEmail(email: string): boolean {
	return IS_DEV_MODE && email.toLowerCase().endsWith(DEV_AUTO_VERIFY_DOMAIN);
}

export const auth = betterAuth({
	database: pool,
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		autoSignInAfterVerification: true,
		sendResetPassword: async ({ user, url }) => {
			await sendEmail({
				type: "reset",
				to: user.email,
				props: { url, userName: user.name },
			});
		},
	},
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			if (isDevAutoVerifyEmail(user.email)) {
				await pool.query(
					'UPDATE "user" SET "emailVerified" = true WHERE id = $1',
					[user.id],
				);
				log.info(
					{ email: user.email },
					"Dev auto-verify: marked emailVerified=true, skipped send.",
				);
				return;
			}
			await sendEmail({
				type: "verify",
				to: user.email,
				props: { url, userName: user.name },
			});
		},
		autoSignInAfterVerification: true,
	},
	databaseHooks: {
		session: {
			create: {
				// Auto-pick an active organization on session creation so the user
				// is not stuck with `activeOrganizationId = null` (which would
				// block every org-gated hasPermission check — incl. menu filtering).
				before: async (session) => {
					const { rows } = await pool.query<{ organizationId: string }>(
						'SELECT "organizationId" FROM "member" WHERE "userId" = $1 ORDER BY "createdAt" ASC LIMIT 1',
						[session.userId],
					);
					const organizationId = rows[0]?.organizationId;
					if (!organizationId) return { data: session };
					return {
						data: { ...session, activeOrganizationId: organizationId },
					};
				},
			},
		},
		user: {
			create: {
				// R4: private-mode auto-join. After a user is created (e.g. via
				// /signup), bind them as `member` of the default org. Raw SQL via
				// the shared `pool` — do NOT call `auth.api.createOrganization`
				// from here (better-auth#6791 nested-call deadlock).
				after: async (user) => {
					if (env.PRODUCT_MODE !== "private") return;
					// The super-admin bootstrap is handled by seed. Skip to avoid
					// double binding (seed pins them as `owner`).
					if (
						env.SEED_SUPER_ADMIN_EMAIL &&
						user.email === env.SEED_SUPER_ADMIN_EMAIL
					) {
						return;
					}

					try {
						const { rows } = await pool.query<{ id: string }>(
							'SELECT id FROM "organization" WHERE slug = $1 LIMIT 1',
							[env.SEED_DEFAULT_ORG_SLUG],
						);
						const orgId = rows[0]?.id;
						if (!orgId) {
							log.warn(
								{ slug: env.SEED_DEFAULT_ORG_SLUG, userId: user.id },
								"Default organization missing — cannot auto-join new user.",
							);
							return;
						}

						// Idempotent: bail if already a member (concurrency / retry safe).
						// No unique (orgId, userId) constraint in BA schema, so guard here.
						const existing = await pool.query(
							'SELECT 1 FROM "member" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1',
							[orgId, user.id],
						);
						if (existing.rowCount && existing.rowCount > 0) return;

						await pool.query(
							'INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, now())',
							[randomUUID(), orgId, user.id, "member"],
						);
						log.info(
							{ userId: user.id, orgId },
							"New user auto-joined default organization (private mode).",
						);
					} catch (err) {
						// Swallow — registration already succeeded; auto-join is best-effort.
						// User can be manually bound later if this path fails.
						log.error(
							{ err, userId: user.id },
							"Failed to auto-join new user into default org.",
						);
					}
				},
			},
		},
	},
	plugins: [
		admin(),
		organization({
			ac,
			roles: { owner, admin: adminRole, member },
			teams: { enabled: env.TEAM_ENABLED },
			// R1/R4: in private mode, users must not self-create orgs — the
			// default org is seeded and users are auto-joined to it. `saas`
			// mode lets any signup be the owner of their own workspace.
			allowUserToCreateOrganization: env.PRODUCT_MODE === "saas",
			// R12: avoid duplicate pending invitations for the same email.
			cancelPendingInvitationsOnReInvite: true,
			// R8: business-profile columns on `organization`. Mirrored on the
			// client via `inferOrgAdditionalFields` in auth-client.ts.
			schema: {
				organization: {
					additionalFields: {
						plan: { type: "string", defaultValue: "free" },
						industry: { type: "string", required: false },
						billingEmail: { type: "string", required: false },
					},
				},
			},
			// R7/R11: one unified invitation path. `role === "owner"` marks a
			// transfer-of-ownership flow (stronger wording + warning).
			sendInvitationEmail: async ({
				email,
				inviter,
				organization: org,
				invitation,
			}) => {
				const isTransfer = invitation.role === "owner";
				const acceptUrl = `${env.BETTER_AUTH_URL}/accept-invitation?token=${invitation.id}`;
				await sendEmail({
					type: isTransfer ? "transfer" : "invite",
					to: email,
					props: {
						url: acceptUrl,
						inviterName: inviter.user.name,
						organizationName: org.name,
					},
				});
			},
			organizationHooks: {
				// R7: Transfer-ownership via invitation. When an invitation with
				// role=owner is accepted, atomically downgrade all existing
				// owners to `admin` before BA proceeds to create the accepting
				// user's member row with role=owner. If the downgrade fails we
				// re-throw so BA aborts the accept (partial state is worse than
				// a blocked accept — user can retry).
				beforeAcceptInvitation: async ({ invitation, user, organization }) => {
					if (invitation.role !== "owner") return;
					try {
						await pool.query(
							'UPDATE "member" SET role = $1 WHERE "organizationId" = $2 AND role = $3',
							["admin", organization.id, "owner"],
						);
						log.info(
							{ orgId: organization.id, newOwnerUserId: user.id },
							"Owner transferred via invitation accept; previous owner(s) downgraded to admin.",
						);
					} catch (err) {
						log.error(
							{ err, orgId: organization.id, newOwnerUserId: user.id },
							"Failed to downgrade previous owner during transfer — aborting accept.",
						);
						throw err;
					}
				},
				// R11: last-owner protection. BA exposes these hooks (verified in
				// installed types); throwing aborts the action with the thrown
				// message surfaced to the client.
				beforeUpdateMemberRole: async ({
					member: target,
					newRole,
					organization,
				}) => {
					if (target.role !== "owner" || newRole === "owner") return;
					const { rows } = await pool.query<{ count: string }>(
						'SELECT COUNT(*)::text AS count FROM "member" WHERE "organizationId" = $1 AND role = $2',
						[organization.id, "owner"],
					);
					const ownerCount = Number(rows[0]?.count ?? "0");
					if (ownerCount <= 1) {
						throw new Error("不能移除最后一个所有者");
					}
				},
				beforeRemoveMember: async ({ member: target, organization }) => {
					if (target.role !== "owner") return;
					const { rows } = await pool.query<{ count: string }>(
						'SELECT COUNT(*)::text AS count FROM "member" WHERE "organizationId" = $1 AND role = $2',
						[organization.id, "owner"],
					);
					const ownerCount = Number(rows[0]?.count ?? "0");
					if (ownerCount <= 1) {
						throw new Error("不能移除最后一个所有者");
					}
				},
			},
		}),
		multiSession(),
		tanstackStartCookies(),
	],
	user: {
		additionalFields: {
			nickname: { type: "string", required: false },
			avatar: { type: "string", required: false },
			status: { type: "string", defaultValue: "ACTIVE" },
		},
	},
	logger: {
		log(level, message, ...args) {
			const meta = args.length > 0 ? args[0] : undefined;
			switch (level) {
				case "error":
					log.error(meta ?? {}, message);
					break;
				case "warn":
					log.warn(meta ?? {}, message);
					break;
				case "debug":
					log.debug(meta ?? {}, message);
					break;
				default:
					log.info(meta ?? {}, message);
			}
		},
	},
});
