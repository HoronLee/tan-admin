import { db } from "#/db";
import { createModuleLogger } from "#/lib/logger";

const log = createModuleLogger("seed");

async function main() {
	log.info("Seeding database…");

	await db.todo.deleteMany({});
	const result = await db.todo.createMany({
		data: [
			{ title: "Buy groceries" },
			{ title: "Read a book" },
			{ title: "Workout" },
		],
	});

	log.info({ count: result.count }, "Seed complete.");
}

main().catch((err: unknown) => {
	log.error({ err }, "Seed failed.");
	process.exit(1);
});
