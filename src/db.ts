import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg({
	connectionString: databaseUrl,
});

declare global {
	var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
	globalThis.__prisma = prisma;
}

// Fail-fast: verify the database is reachable at module load time.
// PrismaClient.connect() performs a real authentication handshake — stronger
// than a TCP port check. Any error bubbles up as an uncaught module-load
// rejection and terminates the process before the server accepts traffic.
await prisma.$connect();
