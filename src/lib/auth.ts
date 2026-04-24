import "@tanstack/react-start/server-only";

import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin, multiSession, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { pool } from "#/db";
import { env } from "#/env";
import { sendEmail } from "#/lib/email";
import { createModuleLogger } from "#/lib/logger";
import { ac, adminRole, member, owner } from "#/lib/permissions";
import { getPlanLimits } from "#/lib/plan";

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
			update: {
				// Saas-mode personal org provision. Trigger: emailVerified flips
				// to true (后端验证流程 / dev auto-verify 都会走到 user.update)。
				// 幂等：每次 fire 都查 member + org.type='personal' 是否已存在，
				// 已有则直接返回；这样 emailVerified 被再次 set true 时不会重复
				// 建 org。Private 模式跳过（走 user.create.after 的 auto-join
				// 走默认 org，不需要个人 org）。
				after: async (user) => {
					if (env.VITE_PRODUCT_MODE !== "saas") return;
					if (!user.emailVerified) return;
					// super-admin 不需要 personal org（他们是平台运营角色）
					if (
						env.SEED_SUPER_ADMIN_EMAIL &&
						user.email === env.SEED_SUPER_ADMIN_EMAIL
					) {
						return;
					}
					try {
						const existing = await pool.query(
							`SELECT o.id
							 FROM "organization" o
							 INNER JOIN "member" m ON m."organizationId" = o.id
							 WHERE m."userId" = $1 AND o."type" = 'personal'
							 LIMIT 1`,
							[user.id],
						);
						if (existing.rowCount && existing.rowCount > 0) return;

						const orgId = randomUUID();
						// BA user.id is a mixed-case nanoid ([A-Za-z0-9]). The client
						// slug validator enforces `/^[a-z0-9-]+$/`, so we must lowercase
						// before building the slug. Hyphen in the prefix is fine.
						const slug = `personal-${user.id.toLowerCase()}`;
						const displayName = user.name || user.email.split("@")[0];
						await pool.query(
							'INSERT INTO "organization" (id, name, slug, "createdAt", plan, "type") VALUES ($1, $2, $3, now(), $4, $5)',
							[orgId, `${displayName}'s Personal`, slug, "free", "personal"],
						);
						await pool.query(
							'INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, now())',
							[randomUUID(), orgId, user.id, "owner"],
						);
						// 把该 user 所有 active session 的 activeOrganizationId 指向
						// 新建的 personal org。BA 只在 sign-in 时 bootstrap activeOrg，
						// 不覆盖此处：用户点完验证链接的 session 若不同步，回 workspace
						// 会被 beforeLoad 当作"无 workspace"踢去 /onboarding。
						await pool.query(
							'UPDATE "session" SET "activeOrganizationId" = $1 WHERE "userId" = $2',
							[orgId, user.id],
						);
						log.info(
							{ userId: user.id, orgId, slug },
							"Personal org auto-provisioned after emailVerified (saas mode).",
						);
					} catch (err) {
						// 幂等失败（unique violation 等）也 swallow——下次 emailVerified
						// update 会再试；registration 本身已成功。
						log.error(
							{ err, userId: user.id },
							"Failed to auto-provision personal org.",
						);
					}
				},
			},
			create: {
				// R4: private-mode auto-join. After a user is created (e.g. via
				// /signup), bind them as `member` of the default org. Raw SQL via
				// the shared `pool` — do NOT call `auth.api.createOrganization`
				// from here (better-auth#6791 nested-call deadlock).
				after: async (user) => {
					if (env.VITE_PRODUCT_MODE !== "private") return;
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
			// 插件级写死：产品支持 team 概念。能不能建 team 由 plan 决定（见 maximumTeams）。
			teams: {
				enabled: true,
				maximumTeams: async ({ organizationId }) => {
					const { rows } = await pool.query<{ plan: string | null }>(
						'SELECT plan FROM "organization" WHERE id = $1',
						[organizationId],
					);
					return getPlanLimits(rows[0]?.plan).maxTeams;
				},
			},
			// R1/R4: in private mode, users must not self-create orgs — the
			// default org is seeded and users are auto-joined to it. `saas`
			// mode lets any signup be the owner of their own workspace.
			allowUserToCreateOrganization: env.VITE_PRODUCT_MODE === "saas",
			// R12: avoid duplicate pending invitations for the same email.
			cancelPendingInvitationsOnReInvite: true,
			// R8: business-profile columns on `organization`. Mirrored on the
			// client via `inferOrgAdditionalFields` in auth-client.ts.
			schema: {
				organization: {
					additionalFields: {
						// Plan gating source of truth. 可选值 "free" | "personal_pro" |
						// "team_pro" | "enterprise"，见 #/lib/plan。
						plan: { type: "string", defaultValue: "free" },
						// org 类型：personal = 注册后自动建的个人空间（saas 模式），
						// team = 普通团队 workspace。personal org 禁止邀请/删除/转让。
						type: { type: "string", defaultValue: "team" },
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
				// Slug 不可修改：slug 是 workspace 的 URL-level identity，允许改
				// 会破坏外链 + 历史引用，且需要级联迁移。UI 层已将 slug Input
				// 置为 readOnly，这里是服务端护栏，防 API 直调 / 未来 UI 失误。
				// BA 传入的 `organization` 是 `ctx.body.data`（patch payload），
				// slug 字段未在请求体中 → undefined，不拦。
				beforeUpdateOrganization: async ({ organization: patch, member }) => {
					if (patch.slug === undefined) return;
					const { rows } = await pool.query<{ slug: string }>(
						'SELECT slug FROM "organization" WHERE id = $1 LIMIT 1',
						[member.organizationId],
					);
					const currentSlug = rows[0]?.slug;
					if (currentSlug && patch.slug !== currentSlug) {
						throw new APIError("BAD_REQUEST", {
							message: "slug cannot be modified",
						});
					}
				},
				// Personal org 保护：不允许删除（用户删号时会级联清理）。
				beforeDeleteOrganization: async ({ organization: org }) => {
					if ((org as { type?: string }).type === "personal") {
						throw new APIError("BAD_REQUEST", {
							message: "个人工作空间不允许删除",
						});
					}
				},
				// Personal org 保护：不允许邀请别人，保持"个人空间"语义。
				beforeCreateInvitation: async ({ organization: org }) => {
					if ((org as { type?: string }).type === "personal") {
						throw new APIError("BAD_REQUEST", {
							message: "个人工作空间不支持邀请成员",
						});
					}
				},
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
