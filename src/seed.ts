import { randomUUID } from "node:crypto";
import { db, pool } from "#/db";
import { env } from "#/env";
import { auth } from "#/lib/auth";
import { createModuleLogger } from "#/lib/logger";

const log = createModuleLogger("seed");

const resetMenus = process.argv.slice(2).includes("--reset-menus");

/**
 * Minimal menu skeleton. `meta.title` is an i18n key (e.g. `menu.dashboard`);
 * the sidebar renderer resolves it via Paraglide `m[key]` with a literal
 * fallback, so user-created menus can keep storing plain Chinese strings.
 */
interface SeedMenu {
	name: string;
	type: "MENU";
	path: string;
	component: string;
	meta: { title: string; icon?: string; order?: number };
	status: "ACTIVE";
	order: number;
	requiredPermission: string | null;
}

const MENUS: SeedMenu[] = [
	{
		name: "dashboard",
		type: "MENU",
		path: "/dashboard",
		component: "dashboard",
		meta: { title: "menu.dashboard", icon: "LayoutDashboard", order: 1 },
		status: "ACTIVE",
		order: 1,
		requiredPermission: null,
	},
	{
		name: "users",
		type: "MENU",
		path: "/users",
		component: "users",
		meta: { title: "menu.users", icon: "Users", order: 10 },
		status: "ACTIVE",
		order: 10,
		requiredPermission: "user:read",
	},
	{
		name: "organization",
		type: "MENU",
		path: "/organization",
		component: "organization",
		meta: { title: "menu.organization", icon: "Building2", order: 20 },
		status: "ACTIVE",
		order: 20,
		requiredPermission: "organization:read",
	},
	{
		// R10: super-admin cross-tenant organization list. Gated via the
		// admin plugin's site-level `user.role === "admin"`; the sidebar
		// permission filter (`getUserMenus`) does not currently know about
		// site-level admin, so we leave `requiredPermission` null and rely
		// on the route-level gate + server-side `requireSuperAdmin`
		// middleware. A non-admin user who sees this menu will hit the 403
		// card on navigation. The menu stays visible for discoverability.
		name: "organizations",
		type: "MENU",
		path: "/organizations",
		component: "organizations",
		meta: { title: "menu.organizations", icon: "Building", order: 25 },
		status: "ACTIVE",
		order: 25,
		requiredPermission: null,
	},
	{
		name: "menus",
		type: "MENU",
		path: "/menus",
		component: "menus",
		meta: { title: "menu.menus", icon: "Menu", order: 30 },
		status: "ACTIVE",
		order: 30,
		requiredPermission: "menu:write",
	},
	{
		name: "teams",
		type: "MENU",
		path: "/teams",
		component: "teams",
		// Sidebar gating (TEAM_ENABLED=false -> greyed w/ tooltip) is driven
		// by the client env flag — the menu row is always seeded so users
		// discover the feature exists.
		meta: { title: "menu.teams", icon: "Users2", order: 40 },
		status: "ACTIVE",
		order: 40,
		requiredPermission: null,
	},
	{
		name: "settings",
		type: "MENU",
		path: "/settings/account",
		component: "settings",
		meta: { title: "menu.settings", icon: "Settings", order: 99 },
		status: "ACTIVE",
		order: 99,
		requiredPermission: null,
	},
	{
		name: "settings-organization",
		type: "MENU",
		path: "/settings/organization",
		component: "settings-organization",
		meta: {
			title: "menu.settings_organization",
			icon: "Building2",
			order: 100,
		},
		status: "ACTIVE",
		order: 100,
		requiredPermission: "organization:write",
	},
];

async function seedMenus(): Promise<void> {
	if (resetMenus) {
		await pool.query('TRUNCATE TABLE "Menu" RESTART IDENTITY CASCADE');
		log.warn(
			"--reset-menus flag set: Menu table truncated. Operator-added menus are gone.",
		);
	}

	for (const m of MENUS) {
		// Idempotent upsert keyed by unique `name`. Update meta/path/... so the
		// skeleton can evolve across deployments without losing operator data.
		await db.menu.upsert({
			where: { name: m.name },
			update: {
				type: m.type,
				path: m.path,
				component: m.component,
				meta: m.meta,
				status: m.status,
				order: m.order,
				requiredPermission: m.requiredPermission,
			},
			create: m,
		});
	}
	log.info(
		{ count: MENUS.length, reset: resetMenus },
		"Menu skeleton upserted.",
	);
}

async function bootstrapSuperAdmin(): Promise<string | null> {
	const email = env.SEED_SUPER_ADMIN_EMAIL;
	const password = env.SEED_SUPER_ADMIN_PASSWORD;
	if (!email || !password) {
		log.info(
			"SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD not set — skipping super-admin bootstrap.",
		);
		return null;
	}

	// Better Auth signUpEmail is the canonical path for creating the user row —
	// it hashes the password and populates auth-managed columns correctly.
	// When the account already exists it throws; treat that as a success signal.
	try {
		await auth.api.signUpEmail({
			body: { email, password, name: "Super Admin" },
		});
		log.info({ email }, "Super-admin user created via Better Auth.");
	} catch {
		log.info({ email }, "Super-admin user already exists — proceeding.");
	}

	const user = await db.$qbRaw
		.selectFrom("user")
		.where("email", "=", email)
		.select(["id"])
		.executeTakeFirst();

	if (!user) {
		log.warn(
			{ email },
			"Super-admin user lookup failed after sign-up attempt — skipping further setup.",
		);
		return null;
	}

	// Promote to admin role (admin plugin gates isAdmin on user.role === "admin").
	await pool.query(
		'UPDATE "user" SET role = $1 WHERE id = $2 AND (role IS DISTINCT FROM $1)',
		["admin", user.id],
	);

	log.info({ email, userId: user.id }, "Super-admin user ready.");
	return user.id;
}

/**
 * Create the default organization and bind the super-admin as owner.
 * Single-tenancy only: multi-tenancy starts with zero orgs; super-admin
 * creates them via the `/organizations` UI.
 */
async function seedDefaultOrg(adminUserId: string): Promise<void> {
	const slug = env.SEED_DEFAULT_ORG_SLUG;
	const name = env.SEED_DEFAULT_ORG_NAME;

	const existing = await pool.query<{ id: string }>(
		'SELECT id FROM "organization" WHERE slug = $1 LIMIT 1',
		[slug],
	);

	let orgId: string;
	if (existing.rows.length > 0) {
		orgId = existing.rows[0].id;
		log.info({ orgId, slug }, "Default organization already exists.");
	} else {
		orgId = randomUUID();
		await pool.query(
			'INSERT INTO "organization" (id, name, slug, "createdAt", plan) VALUES ($1, $2, $3, now(), $4)',
			[orgId, name, slug, "free"],
		);
		log.info({ orgId, slug, name }, "Default organization created.");
	}

	const existingMember = await pool.query<{ id: string }>(
		'SELECT id FROM "member" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1',
		[orgId, adminUserId],
	);

	if (existingMember.rows.length > 0) {
		log.info(
			{ orgId, userId: adminUserId },
			"Super-admin already a member of default org.",
		);
		return;
	}

	await pool.query(
		'INSERT INTO "member" (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, now())',
		[randomUUID(), orgId, adminUserId, "owner"],
	);
	log.info(
		{ orgId, userId: adminUserId },
		"Super-admin bound as owner of default org.",
	);
}

function printBanner(): void {
	const tablesTouched: string[] = ["Menu"];
	if (env.TENANCY_MODE === "single") {
		tablesTouched.push("organization", "member");
	}
	if (env.SEED_SUPER_ADMIN_EMAIL && env.SEED_SUPER_ADMIN_PASSWORD) {
		tablesTouched.push("user");
	}
	log.info(
		{
			tenancyMode: env.TENANCY_MODE,
			teamEnabled: env.TEAM_ENABLED,
			resetMenus,
			tablesTouched,
		},
		"Seed starting.",
	);
}

async function main() {
	printBanner();

	// --- Menus (system skeleton) ---
	await seedMenus();

	// --- Super-admin user bootstrap (opt-in via env) ---
	const adminUserId = await bootstrapSuperAdmin();

	// --- Default organization binding (single-tenancy only) ---
	if (env.TENANCY_MODE === "single" && adminUserId) {
		await seedDefaultOrg(adminUserId);
	} else if (env.TENANCY_MODE === "multi") {
		log.info(
			"TENANCY_MODE=multi: skipping default organization. Super-admin creates orgs via UI.",
		);
	}

	log.info("Seed complete.");
}

main().catch((err: unknown) => {
	log.error({ err }, "Seed failed.");
	process.exit(1);
});
