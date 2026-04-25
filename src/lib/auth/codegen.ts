import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { authConfig } from "./config";

// CLI-only entry for `better-auth generate`. Reuses the runtime authConfig so
// the generated Prisma-shaped schema can never drift from server.ts. We bind
// a Prisma adapter (instead of the runtime pg.Pool) because BA's generate
// command emits schema in the adapter's native format. The PrismaClient
// argument is a typed-stub — BA's `generate` only inspects plugin/options
// metadata, never invokes adapter methods, so an empty object suffices.
export const auth = betterAuth({
	...authConfig,
	database: prismaAdapter({}, { provider: "postgresql" }),
});
