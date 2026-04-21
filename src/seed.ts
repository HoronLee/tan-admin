import { db } from "#/db";
import { env } from "#/env";
import { auth } from "#/lib/auth";
import { createModuleLogger } from "#/lib/logger";

const log = createModuleLogger("seed");

async function bootstrapSuperAdmin(superAdminRoleId: number): Promise<void> {
	const email = env.SEED_SUPER_ADMIN_EMAIL;
	const password = env.SEED_SUPER_ADMIN_PASSWORD;
	if (!email || !password) {
		log.info(
			"SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD not set — skipping super-admin bootstrap.",
		);
		return;
	}

	// Better Auth signUp is the canonical path for creating the user row —
	// it hashes the password and populates auth-managed columns correctly.
	// When the account already exists it throws; treat that as a success signal.
	try {
		await auth.api.signUpEmail({
			body: { email, password, name: "Super Admin" },
		});
		log.info({ email }, "Super-admin user created via Better Auth.");
	} catch {
		log.info(
			{ email },
			"Super-admin user already exists — proceeding to bind role.",
		);
	}

	const user = await db.$qbRaw
		.selectFrom("user")
		.where("email", "=", email)
		.select(["id"])
		.executeTakeFirst();

	if (!user) {
		log.warn(
			{ email },
			"Super-admin user lookup failed after sign-up attempt — skipping role bind.",
		);
		return;
	}

	const existing = await db.userRole.findFirst({
		where: { userId: user.id, roleId: superAdminRoleId },
	});
	if (existing) {
		log.info({ email }, "Super-admin role binding already in place.");
		return;
	}
	await db.userRole.create({
		data: { userId: user.id, roleId: superAdminRoleId },
	});
	log.info({ email, userId: user.id }, "Super-admin role bound.");
}

async function main() {
	log.info("Seeding database…");

	// --- Todos (demo) ---
	await db.todo.deleteMany({});
	const todos = await db.todo.createMany({
		data: [
			{ title: "Buy groceries" },
			{ title: "Read a book" },
			{ title: "Workout" },
		],
	});
	log.info({ count: todos.count }, "Todos seeded.");

	// --- Roles ---
	const superAdmin = await db.role.upsert({
		where: { code: "super-admin" },
		update: {},
		create: {
			name: "Super Admin",
			code: "super-admin",
			description: "Full system access",
			status: "ACTIVE",
			order: 0,
		},
	});

	await db.role.upsert({
		where: { code: "admin" },
		update: {},
		create: {
			name: "Admin",
			code: "admin",
			description: "Administrative access",
			status: "ACTIVE",
			order: 1,
		},
	});

	await db.role.upsert({
		where: { code: "viewer" },
		update: {},
		create: {
			name: "Viewer",
			code: "viewer",
			description: "Read-only access",
			status: "ACTIVE",
			order: 2,
		},
	});

	log.info("Roles seeded.");

	// --- Permissions ---
	const permDefs = [
		{ name: "Role Management", code: "role:manage", type: "MENU" },
		{ name: "Permission Management", code: "permission:manage", type: "MENU" },
		{ name: "Menu Management", code: "menu:manage", type: "MENU" },
		{ name: "User Management", code: "user:manage", type: "MENU" },
		{ name: "Dashboard", code: "dashboard:view", type: "MENU" },
	];
	for (const p of permDefs) {
		await db.permission.upsert({
			where: { code: p.code },
			update: {},
			create: { ...p, status: "ACTIVE" },
		});
	}
	log.info("Permissions seeded.");

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
		},
	});

	const systemMenu = await db.menu.upsert({
		where: { name: "system" },
		update: {},
		create: {
			name: "system",
			type: "CATALOG",
			path: "/system",
			meta: { title: "System", icon: "Settings", order: 100 },
			status: "ACTIVE",
			order: 100,
		},
	});

	const systemMenuDefs = [
		{
			name: "system-role",
			path: "/system/roles",
			component: "system/roles",
			title: "Roles",
			order: 1,
		},
		{
			name: "system-permission",
			path: "/system/permissions",
			component: "system/permissions",
			title: "Permissions",
			order: 2,
		},
		{
			name: "system-menu",
			path: "/system/menus",
			component: "system/menus",
			title: "Menus",
			order: 3,
		},
		{
			name: "system-user",
			path: "/system/users",
			component: "system/users",
			title: "Users",
			order: 4,
		},
	];
	for (const m of systemMenuDefs) {
		await db.menu.upsert({
			where: { name: m.name },
			update: {},
			create: {
				name: m.name,
				type: "MENU",
				path: m.path,
				component: m.component,
				parentId: systemMenu.id,
				meta: { title: m.title, order: m.order },
				status: "ACTIVE",
				order: m.order,
			},
		});
	}

	log.info(
		{ dashboardId: dashboardMenu.id, systemId: systemMenu.id },
		"Menus seeded.",
	);

	// --- Super-admin role permissions (all) ---
	const allPerms = await db.permission.findMany();
	for (const perm of allPerms) {
		await db.rolePermission.upsert({
			where: {
				roleId_permissionId: { roleId: superAdmin.id, permissionId: perm.id },
			},
			update: {},
			create: { roleId: superAdmin.id, permissionId: perm.id },
		});
	}
	log.info("Super-admin role permissions seeded.");

	// --- Super-admin user bootstrap (opt-in via env) ---
	await bootstrapSuperAdmin(superAdmin.id);

	log.info("Seed complete.");
}

main().catch((err: unknown) => {
	log.error({ err }, "Seed failed.");
	process.exit(1);
});
