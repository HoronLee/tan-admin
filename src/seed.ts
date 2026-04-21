import { randomUUID } from "node:crypto";
import { db, pool } from "#/db";
import { env } from "#/env";
import { auth } from "#/lib/auth";
import { createModuleLogger } from "#/lib/logger";

const DEFAULT_ORG_SLUG = "default";
const DEFAULT_ORG_NAME = "Default Organization";

const log = createModuleLogger("seed");

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
 * Uses direct pg INSERTs because Better Auth's server APIs require a
 * request/session context we don't have in a seed script.
 */
async function seedDefaultOrg(adminUserId: string): Promise<void> {
	const existing = await pool.query<{ id: string }>(
		'SELECT id FROM "organization" WHERE slug = $1 LIMIT 1',
		[DEFAULT_ORG_SLUG],
	);

	let orgId: string;
	if (existing.rows.length > 0) {
		orgId = existing.rows[0].id;
		log.info({ orgId }, "Default organization already exists.");
	} else {
		orgId = randomUUID();
		await pool.query(
			'INSERT INTO "organization" (id, name, slug, "createdAt") VALUES ($1, $2, $3, now())',
			[orgId, DEFAULT_ORG_NAME, DEFAULT_ORG_SLUG],
		);
		log.info({ orgId }, "Default organization created.");
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

async function main() {
	log.info("Seeding database…");

	// --- Menus (system skeleton) ---
	const dashboardMenu = await db.menu.upsert({
		where: { name: "dashboard" },
		update: {},
		create: {
			name: "dashboard",
			type: "MENU",
			path: "/dashboard",
			component: "dashboard",
			meta: { title: "Dashboard", icon: "LayoutDashboard", order: 1 },
			status: "ACTIVE",
			order: 1,
			requiredPermission: null,
		},
	});

	const adminMenu = await db.menu.upsert({
		where: { name: "admin" },
		update: {},
		create: {
			name: "admin",
			type: "CATALOG",
			path: "/admin",
			meta: { title: "Admin", icon: "ShieldCheck", order: 10 },
			status: "ACTIVE",
			order: 10,
			requiredPermission: "user:read",
		},
	});

	const adminMenuDefs = [
		{
			name: "admin-users",
			path: "/admin/users",
			component: "admin/users",
			title: "Users",
			order: 1,
			requiredPermission: "user:read",
		},
	];
	for (const m of adminMenuDefs) {
		await db.menu.upsert({
			where: { name: m.name },
			update: {},
			create: {
				name: m.name,
				type: "MENU",
				path: m.path,
				component: m.component,
				parentId: adminMenu.id,
				meta: { title: m.title, order: m.order },
				status: "ACTIVE",
				order: m.order,
				requiredPermission: m.requiredPermission,
			},
		});
	}

	const orgMenu = await db.menu.upsert({
		where: { name: "organization" },
		update: {},
		create: {
			name: "organization",
			type: "MENU",
			path: "/organization",
			component: "organization",
			meta: { title: "Organization", icon: "Building2", order: 20 },
			status: "ACTIVE",
			order: 20,
			requiredPermission: "organization:read",
		},
	});

	const menusMenu = await db.menu.upsert({
		where: { name: "menus" },
		update: {},
		create: {
			name: "menus",
			type: "MENU",
			path: "/menus",
			component: "menus",
			meta: { title: "Menus", icon: "Menu", order: 30 },
			status: "ACTIVE",
			order: 30,
			requiredPermission: "menu:write",
		},
	});

	const settingsMenu = await db.menu.upsert({
		where: { name: "settings" },
		update: {},
		create: {
			name: "settings",
			type: "MENU",
			path: "/settings",
			component: "settings",
			meta: { title: "Settings", icon: "Settings", order: 99 },
			status: "ACTIVE",
			order: 99,
			requiredPermission: null,
		},
	});

	log.info(
		{
			dashboardId: dashboardMenu.id,
			adminId: adminMenu.id,
			orgId: orgMenu.id,
			menusId: menusMenu.id,
			settingsId: settingsMenu.id,
		},
		"Menus seeded.",
	);

	// --- Super-admin user bootstrap (opt-in via env) ---
	const adminUserId = await bootstrapSuperAdmin();

	// --- Default organization + super-admin binding ---
	if (adminUserId) {
		await seedDefaultOrg(adminUserId);
	}

	log.info("Seed complete.");
}

main().catch((err: unknown) => {
	log.error({ err }, "Seed failed.");
	process.exit(1);
});
