import "@tanstack/react-start/server-only";

import { ZenStackClient } from "@zenstackhq/orm";
import { PostgresDialect } from "@zenstackhq/orm/dialects/postgres";
import { PolicyPlugin } from "@zenstackhq/plugin-policy";
import { Pool } from "pg";
import { createMenuMutationGuard } from "#/lib/menu/menu-mutation-guard.server";
import { schema } from "../../zenstack/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required");
}

declare global {
	var __pgPool: Pool | undefined;
	var __db: Db | undefined;
}

/**
 * Shared pg Pool, consumed by both ZenStack (business tables) and
 * Better Auth (auth tables). Single pool = single connection budget.
 */
export const pool =
	globalThis.__pgPool ?? new Pool({ connectionString: databaseUrl });

function createClient() {
	return new ZenStackClient(schema, {
		dialect: new PostgresDialect({ pool }),
	});
}

// Derive Db from the actual construction so the `globalThis.__db ?? ...`
// fallback below stays a single type instead of a union of two client
// instantiations (unions of deep ZenStack generics blow up tsc).
type Db = ReturnType<typeof createClient>;

export const db: Db = globalThis.__db ?? createClient();

/**
 * Policy-enforced client. Install once; bind a user per-request via
 * `authDb.$setAuth({ userId, isAdmin })` inside the authed middleware.
 */
export const authDb = db.$use(new PolicyPlugin());

export interface PolicyAuthContext {
	[key: string]: unknown;
	userId: string;
	isAdmin: boolean;
	activeOrganizationId?: string;
	activeOrganizationRole?: string;
}

/** Bind policy identity and server-side Menu invariants for one request. */
export function bindAuthDb(
	policyAuth: PolicyAuthContext | undefined,
	actorId?: string,
) {
	return authDb.$setAuth(policyAuth).$use(
		createMenuMutationGuard(
			async (id, includeChildren) =>
				db.menu.findUnique({
					where: { id },
					...(includeChildren
						? { include: { children: { select: { id: true } } } }
						: {}),
				}),
			{
				actorId,
				isAdmin: policyAuth?.isAdmin,
				activeOrganizationId: policyAuth?.activeOrganizationId,
			},
		),
	);
}

if (process.env.NODE_ENV !== "production") {
	globalThis.__pgPool = pool;
	globalThis.__db = db;
}

// Fail-fast: verify the database is reachable at module load time.
// A real authentication handshake — stronger than a TCP port check.
// Any error bubbles up as an uncaught module-load rejection and
// terminates the process before the server accepts traffic.
await db.$connect();
