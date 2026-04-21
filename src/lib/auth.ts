import { betterAuth } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { pool } from "#/db";
import { createModuleLogger } from "#/lib/logger";
import { ac, adminRole, member, owner } from "#/lib/permissions";

const log = createModuleLogger("better-auth");

export const auth = betterAuth({
	database: pool,
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		admin(),
		organization({
			ac,
			roles: { owner, admin: adminRole, member },
			teams: { enabled: true },
		}),
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
