/**
 * organizations-admin — super-admin cross-org management (R10).
 *
 * These endpoints bypass Better Auth's user-scoped `listOrganizations`
 * and reach the `organization` / `member` tables directly via the shared
 * `pool`. Gated by a `requireSuperAdmin` middleware that checks the
 * admin-plugin site-level `user.role === "admin"`.
 *
 * `organization` and `member` are Better-Auth-managed tables (BA CLI
 * migrations) and are `@@ignore`d in ZenStack — so ZenStack CRUD is not
 * available and raw SQL via `pool` is the canonical path.
 *
 * Scope: `list`, `create`, `dissolve`. `VITE_PRODUCT_MODE === "private"`
 * forbids `create` / `dissolve` (server-side guard matching the UI).
 */
import { randomUUID } from "node:crypto";
import * as z from "zod";
import { pool } from "#/db";
import { env } from "#/env";
import { createModuleLogger } from "#/lib/logger";
import { base } from "#/orpc/errors";
import { authed } from "#/orpc/middleware/auth";

const log = createModuleLogger("orpc:organizations-admin");

const SLUG_REGEX = /^[a-z0-9-]+$/;

/**
 * Require a site-level admin (admin plugin `user.role === "admin"`).
 * `authed` already guarantees a signed-in user in context, so we only
 * need the role check here. Throws FORBIDDEN when the caller is not a
 * site-level admin.
 */
const requireSuperAdmin = base.middleware(async ({ context, next, errors }) => {
	const ctx = context as { user?: { role?: string | null } };
	if (ctx.user?.role !== "admin") {
		throw errors.FORBIDDEN({
			message: "需要站点管理员权限。",
		});
	}
	return next();
});

const superAdmin = authed.use(requireSuperAdmin);

// --- list ------------------------------------------------------------------

interface OrganizationRow {
	id: string;
	name: string;
	slug: string | null;
	logo: string | null;
	plan: string | null;
	industry: string | null;
	billingEmail: string | null;
	metadata: unknown;
	createdAt: Date | string;
	memberCount: string; // postgres COUNT is bigint → pg returns string
}

export const list = superAdmin
	.input(z.object({}).optional())
	.handler(async () => {
		const { rows } = await pool.query<OrganizationRow>(
			`SELECT o.id,
			        o.name,
			        o.slug,
			        o.logo,
			        o.plan,
			        o.industry,
			        o."billingEmail",
			        o.metadata,
			        o."createdAt",
			        COUNT(m.id)::text AS "memberCount"
			   FROM "organization" o
			   LEFT JOIN "member" m ON m."organizationId" = o.id
			  GROUP BY o.id
			  ORDER BY o."createdAt" DESC`,
		);

		const defaultSlug = env.SEED_DEFAULT_ORG_SLUG;

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			slug: row.slug,
			logo: row.logo,
			plan: row.plan,
			industry: row.industry,
			billingEmail: row.billingEmail,
			metadata: row.metadata,
			createdAt:
				row.createdAt instanceof Date
					? row.createdAt.toISOString()
					: row.createdAt,
			memberCount: Number(row.memberCount),
			// Marks the seed-managed default organization. UI uses this flag to
			// hide destructive actions (R3 — default org is protected).
			isDefault: row.slug === defaultSlug,
		}));
	});

// --- create ----------------------------------------------------------------

const CreateInput = z.object({
	name: z.string().min(1).max(128),
	slug: z
		.string()
		.min(2)
		.max(64)
		.regex(SLUG_REGEX, "slug 仅允许小写字母、数字和连字符"),
	plan: z.string().max(32).optional(),
	industry: z.string().max(64).optional(),
	billingEmail: z.string().email().optional(),
});

export const create = superAdmin
	.input(CreateInput)
	.handler(async ({ input, errors }) => {
		if (env.VITE_PRODUCT_MODE === "private") {
			throw errors.FORBIDDEN({
				message: "私有部署模式下不可新建组织。",
			});
		}

		const existing = await pool.query<{ id: string }>(
			'SELECT id FROM "organization" WHERE slug = $1 LIMIT 1',
			[input.slug],
		);
		if (existing.rows.length > 0) {
			throw errors.CONFLICT({ message: "slug 已被占用。" });
		}

		const id = randomUUID();
		await pool.query(
			`INSERT INTO "organization"
				 (id, name, slug, plan, industry, "billingEmail", "createdAt")
			 VALUES ($1, $2, $3, $4, $5, $6, now())`,
			[
				id,
				input.name,
				input.slug,
				input.plan ?? "free",
				input.industry ?? null,
				input.billingEmail ?? null,
			],
		);

		log.info(
			{ orgId: id, slug: input.slug },
			"Organization created by super-admin.",
		);

		return { id, slug: input.slug };
	});

// --- dissolve --------------------------------------------------------------

const DissolveInput = z.object({
	organizationId: z.string().min(1),
});

export const dissolve = superAdmin
	.input(DissolveInput)
	.handler(async ({ input, errors }) => {
		if (env.VITE_PRODUCT_MODE === "private") {
			throw errors.FORBIDDEN({
				message: "私有部署模式下不可解散组织。",
			});
		}

		const { rows } = await pool.query<{ slug: string | null }>(
			'SELECT slug FROM "organization" WHERE id = $1 LIMIT 1',
			[input.organizationId],
		);
		if (rows.length === 0) {
			throw errors.NOT_FOUND({ message: "组织不存在。" });
		}
		if (rows[0].slug === env.SEED_DEFAULT_ORG_SLUG) {
			throw errors.FORBIDDEN({
				message: "不可解散默认组织。",
			});
		}

		// Delete children first to avoid relying on FK cascade semantics
		// (BA migrations do not guarantee ON DELETE CASCADE across providers).
		// Wrap in a transaction so a partial delete cannot leave orphans.
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			await client.query(
				'DELETE FROM "invitation" WHERE "organizationId" = $1',
				[input.organizationId],
			);
			await client.query(
				'DELETE FROM "teamMember" WHERE "teamId" IN (SELECT id FROM "team" WHERE "organizationId" = $1)',
				[input.organizationId],
			);
			await client.query('DELETE FROM "team" WHERE "organizationId" = $1', [
				input.organizationId,
			]);
			await client.query('DELETE FROM "member" WHERE "organizationId" = $1', [
				input.organizationId,
			]);
			await client.query('DELETE FROM "organization" WHERE id = $1', [
				input.organizationId,
			]);
			await client.query("COMMIT");
		} catch (err) {
			await client.query("ROLLBACK");
			log.error(
				{ err, orgId: input.organizationId },
				"Failed to dissolve organization — rolled back.",
			);
			throw err;
		} finally {
			client.release();
		}

		log.info(
			{ orgId: input.organizationId },
			"Organization dissolved by super-admin.",
		);

		return { success: true };
	});
