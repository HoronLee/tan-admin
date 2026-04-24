import { randomUUID } from "node:crypto";
import { db, pool } from "#/db";
import { env } from "#/env";
import { auth } from "#/lib/auth";
import { createModuleLogger } from "#/lib/logger";

const log = createModuleLogger("seed");

const resetMenus = process.argv.slice(2).includes("--reset-menus");

/**
 * Menu skeleton — nested groups via `parentName`. `meta.title` is an i18n key
 * (see `src/lib/menu-label.ts`). Seed is idempotent upsert by unique `name`,
 * so operator-added menus survive re-seed. Use `pnpm db:seed -- --reset-menus`
 * after major restructure (dev/staging only).
 *
 * `type: "CATALOG"` nodes are folder-only: no path/component, act as a
 * collapsible group in the sidebar.
 *
 * `requiredPermission` guidance:
 *   - `null`              : any authenticated user
 *   - `"site:admin"`      : BA admin plugin, cross-tenant
 *   - `"organization:*"`  : BA organization plugin, current-org role
 *   - `"menu:write"` etc. : organization plugin AC statements (permissions.ts)
 */
interface SeedMenu {
	name: string;
	type: "MENU" | "CATALOG";
	path: string | null;
	component: string | null;
	meta: { title: string; icon?: string; order?: number };
	status: "ACTIVE";
	order: number;
	requiredPermission: string | null;
	parentName?: string;
}

const MENUS: SeedMenu[] = [
	// ---------- 概览 ----------
	{
		name: "overview",
		type: "CATALOG",
		path: null,
		component: null,
		meta: { title: "menu.overview", icon: "LayoutDashboard", order: 1 },
		status: "ACTIVE",
		order: 1,
		requiredPermission: null,
	},
	{
		name: "dashboard",
		type: "MENU",
		path: "/dashboard",
		component: "dashboard",
		meta: { title: "menu.dashboard", icon: "LayoutDashboard", order: 1 },
		status: "ACTIVE",
		order: 1,
		requiredPermission: null,
		parentName: "overview",
	},

	// ---------- 组织管理 ----------
	{
		name: "org-management",
		type: "CATALOG",
		path: null,
		component: null,
		meta: { title: "menu.org_management", icon: "Building2", order: 10 },
		status: "ACTIVE",
		order: 10,
		requiredPermission: null,
	},
	{
		name: "organization",
		type: "MENU",
		path: "/organization",
		component: "organization",
		meta: { title: "menu.organization", icon: "Building2", order: 1 },
		status: "ACTIVE",
		order: 1,
		requiredPermission: "organization:read",
		parentName: "org-management",
	},
	{
		name: "settings-organization",
		type: "MENU",
		path: "/settings/organization",
		component: "settings-organization",
		meta: { title: "menu.settings_organization", icon: "Settings", order: 2 },
		status: "ACTIVE",
		order: 2,
		requiredPermission: "organization:write",
		parentName: "org-management",
	},
	{
		// Super-admin cross-tenant organization list.
		name: "organizations",
		type: "MENU",
		path: "/site/organizations",
		component: "organizations",
		meta: { title: "menu.organizations", icon: "Building", order: 3 },
		status: "ACTIVE",
		order: 3,
		requiredPermission: "site:admin",
		parentName: "org-management",
	},

	// ---------- 用户管理（独立顶级，BA admin only） ----------
	{
		name: "users",
		type: "MENU",
		path: "/site/users",
		component: "users",
		meta: { title: "menu.users", icon: "Users", order: 20 },
		status: "ACTIVE",
		order: 20,
		requiredPermission: "site:admin",
	},

	// ---------- 团队管理（独立顶级，feature flag 控制灰掉） ----------
	{
		name: "teams",
		type: "MENU",
		path: "/teams",
		component: "teams",
		meta: { title: "menu.teams", icon: "Users2", order: 30 },
		status: "ACTIVE",
		order: 30,
		requiredPermission: null,
	},

	// ---------- 权限管理（未实现，先占菜单） ----------
	{
		name: "permission-management",
		type: "CATALOG",
		path: null,
		component: null,
		meta: { title: "menu.permission_management", icon: "Shield", order: 40 },
		status: "ACTIVE",
		order: 40,
		requiredPermission: "site:admin",
	},
	{
		name: "permissions",
		type: "MENU",
		path: "/permissions",
		component: "permissions",
		meta: { title: "menu.permissions", icon: "Lock", order: 1 },
		status: "ACTIVE",
		order: 1,
		requiredPermission: "site:admin",
		parentName: "permission-management",
	},
	{
		name: "roles",
		type: "MENU",
		path: "/roles",
		component: "roles",
		meta: { title: "menu.roles", icon: "Key", order: 2 },
		status: "ACTIVE",
		order: 2,
		requiredPermission: "site:admin",
		parentName: "permission-management",
	},

	// ---------- 站内消息（未实现，先占菜单） ----------
	{
		name: "messages",
		type: "CATALOG",
		path: null,
		component: null,
		meta: { title: "menu.messages", icon: "Bell", order: 50 },
		status: "ACTIVE",
		order: 50,
		requiredPermission: null,
	},
	{
		name: "message-list",
		type: "MENU",
		path: "/messages",
		component: "messages",
		meta: { title: "menu.message_list", icon: "Mail", order: 1 },
		status: "ACTIVE",
		order: 1,
		requiredPermission: null,
		parentName: "messages",
	},
	{
		name: "message-categories",
		type: "MENU",
		path: "/messages/categories",
		component: "message-categories",
		meta: { title: "menu.message_categories", icon: "Tag", order: 2 },
		status: "ACTIVE",
		order: 2,
		requiredPermission: "site:admin",
		parentName: "messages",
	},

	// ---------- 日志审计（未实现，先占菜单） ----------
	{
		name: "audit",
		type: "CATALOG",
		path: null,
		component: null,
		meta: { title: "menu.audit", icon: "FileText", order: 60 },
		status: "ACTIVE",
		order: 60,
		requiredPermission: "site:admin",
	},
	{
		name: "audit-login",
		type: "MENU",
		path: "/audit/login",
		component: "audit-login",
		meta: { title: "menu.audit_login", icon: "LogIn", order: 1 },
		status: "ACTIVE",
		order: 1,
		requiredPermission: "site:admin",
		parentName: "audit",
	},
	{
		name: "audit-api",
		type: "MENU",
		path: "/audit/api",
		component: "audit-api",
		meta: { title: "menu.audit_api", icon: "Activity", order: 2 },
		status: "ACTIVE",
		order: 2,
		requiredPermission: "site:admin",
		parentName: "audit",
	},

	// ---------- 系统管理 ----------
	{
		name: "system",
		type: "CATALOG",
		path: null,
		component: null,
		meta: { title: "menu.system", icon: "Settings", order: 99 },
		status: "ACTIVE",
		order: 99,
		requiredPermission: "site:admin",
	},
	{
		name: "menus",
		type: "MENU",
		path: "/settings/organization/menus",
		component: "menus",
		meta: { title: "menu.menus", icon: "Menu", order: 1 },
		status: "ACTIVE",
		order: 1,
		// Commit 4 起改为 owner-only 的路由级 beforeLoad；菜单这里保持
		// site:admin 让"系统 > 菜单管理"这一栏对超管可见（他们也能管）。
		// 普通 owner 从 `/settings/organization/menus` 直接访问，不依赖菜单。
		requiredPermission: "site:admin",
		parentName: "system",
	},
	{
		name: "files",
		type: "MENU",
		path: "/files",
		component: "files",
		meta: { title: "menu.files", icon: "File", order: 2 },
		status: "ACTIVE",
		order: 2,
		requiredPermission: "site:admin",
		parentName: "system",
	},
];

async function seedMenus(): Promise<void> {
	if (resetMenus) {
		await pool.query('TRUNCATE TABLE "Menu" RESTART IDENTITY CASCADE');
		log.warn(
			"--reset-menus flag set: Menu table truncated. Operator-added menus are gone.",
		);
	}

	const nameToId = new Map<string, number>();

	// Two-phase upsert: roots first, then children — resolves parentId via
	// nameToId. Loop until all children have a resolvable parent (supports
	// arbitrary nesting, not just one level).
	const roots = MENUS.filter((x) => !x.parentName);
	for (const node of roots) {
		const row = await db.menu.upsert({
			where: { name: node.name },
			update: {
				type: node.type,
				path: node.path,
				component: node.component,
				meta: node.meta,
				status: node.status,
				order: node.order,
				requiredPermission: node.requiredPermission,
				parentId: null,
			},
			create: {
				name: node.name,
				type: node.type,
				path: node.path,
				component: node.component,
				meta: node.meta,
				status: node.status,
				order: node.order,
				requiredPermission: node.requiredPermission,
			},
			select: { id: true },
		});
		nameToId.set(node.name, row.id);
	}

	const remaining = MENUS.filter((x) => x.parentName);
	let guard = 0;
	while (remaining.length > 0 && guard < 16) {
		guard++;
		for (let i = remaining.length - 1; i >= 0; i--) {
			const node = remaining[i];
			const parentId = nameToId.get(node.parentName as string);
			if (parentId === undefined) continue;
			const row = await db.menu.upsert({
				where: { name: node.name },
				update: {
					type: node.type,
					path: node.path,
					component: node.component,
					meta: node.meta,
					status: node.status,
					order: node.order,
					requiredPermission: node.requiredPermission,
					parentId,
				},
				create: {
					name: node.name,
					type: node.type,
					path: node.path,
					component: node.component,
					meta: node.meta,
					status: node.status,
					order: node.order,
					requiredPermission: node.requiredPermission,
					parentId,
				},
				select: { id: true },
			});
			nameToId.set(node.name, row.id);
			remaining.splice(i, 1);
		}
	}
	if (remaining.length > 0) {
		log.warn(
			{ unresolved: remaining.map((x) => x.name) },
			"Menu parents not found — check parentName references.",
		);
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

	const existing = await db.$qbRaw
		.selectFrom("user")
		.where("email", "=", email)
		.select(["id"])
		.executeTakeFirst();

	if (existing) {
		// Keep role / emailVerified authoritative across re-runs: seed owns this
		// account, so normalize it every time even if a prior seed or manual
		// update drifted the columns.
		await pool.query(
			'UPDATE "user" SET role = $1, "emailVerified" = true WHERE id = $2',
			["admin", existing.id],
		);
		log.info(
			{ email, userId: existing.id },
			"Super-admin already exists, normalized.",
		);
		return existing.id;
	}

	// Skip the public signUpEmail API: it fires the verification email hook and
	// leaves emailVerified=false. Super-admin is a seed-strapped account that
	// must be login-ready on first boot, so create the user + credential row
	// directly via internalAdapter.
	const ctx = await auth.$context;
	const hash = await ctx.password.hash(password);
	const created = await ctx.internalAdapter.createUser({
		email,
		name: "Super Admin",
		emailVerified: true,
		role: "admin",
	});
	if (!created) {
		log.warn(
			{ email },
			"internalAdapter.createUser returned empty — aborting.",
		);
		return null;
	}
	await ctx.internalAdapter.linkAccount({
		userId: created.id,
		providerId: "credential",
		accountId: created.id,
		password: hash,
	});

	log.info(
		{ email, userId: created.id },
		"Super-admin created (internalAdapter, emailVerified=true).",
	);
	return created.id;
}

/**
 * Create the default organization and bind the super-admin as owner.
 * Private mode only: saas mode starts with zero orgs; super-admin
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
		// Private 模式的默认 org 写 enterprise —— 甲方交付场景没有 plan 升降级
		// 的运营概念，所有功能门应自动放行。type=team 避免被当成 personal。
		await pool.query(
			'INSERT INTO "organization" (id, name, slug, "createdAt", plan, "type") VALUES ($1, $2, $3, now(), $4, $5)',
			[orgId, name, slug, "enterprise", "team"],
		);
		log.info(
			{ orgId, slug, name, plan: "enterprise" },
			"Default organization created.",
		);
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
	if (env.VITE_PRODUCT_MODE === "private") {
		tablesTouched.push("organization", "member");
	}
	if (env.SEED_SUPER_ADMIN_EMAIL && env.SEED_SUPER_ADMIN_PASSWORD) {
		tablesTouched.push("user");
	}
	log.info(
		{
			productMode: env.VITE_PRODUCT_MODE,
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

	// --- Default organization binding (private mode only) ---
	if (env.VITE_PRODUCT_MODE === "private" && adminUserId) {
		await seedDefaultOrg(adminUserId);
	} else if (env.VITE_PRODUCT_MODE === "saas") {
		log.info(
			"VITE_PRODUCT_MODE=saas: skipping default organization. Super-admin creates orgs via UI.",
		);
	}

	log.info("Seed complete.");
}

main()
	.catch((err: unknown) => {
		log.error({ err }, "Seed failed.");
		process.exitCode = 1;
	})
	.finally(async () => {
		// nodemailer SMTP pool + pg Pool hold sockets open — without these the
		// CLI never exits. Force-exit after pool.end() to cover any other
		// lingering handles (BA internals, etc.).
		await pool.end().catch(() => {});
		process.exit(process.exitCode ?? 0);
	});
