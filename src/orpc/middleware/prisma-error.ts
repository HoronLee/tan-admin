import { Prisma } from "#/generated/prisma/client";
import { createModuleLogger } from "#/lib/logger";
import { base } from "#/orpc/errors";

const log = createModuleLogger("orpc:prisma");

/**
 * Maps Prisma runtime errors to typed oRPC errors.
 *
 * Covered codes:
 * - P2002 (unique constraint violation) → CONFLICT
 * - P2025 (record not found) → NOT_FOUND
 *
 * Other `PrismaClientKnownRequestError` codes and
 * `PrismaClientValidationError` propagate to the upstream
 * boundary interceptor as unknown errors (logged + forwarded
 * to Sentry, client sees INTERNAL_ERROR).
 */
export const prismaErrorMiddleware = base.middleware(
	async ({ next, errors }) => {
		try {
			return await next();
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError) {
				log.warn(
					{ err, code: err.code, meta: err.meta },
					"prisma known request error",
				);

				if (err.code === "P2002") {
					throw errors.CONFLICT({
						message: "Resource already exists.",
						cause: err,
					});
				}
				if (err.code === "P2025") {
					throw errors.NOT_FOUND({
						message: "Resource not found.",
						cause: err,
					});
				}
			}
			throw err;
		}
	},
);

/**
 * Procedure builder pre-composed with Prisma error mapping.
 *
 * Use this in any oRPC procedure that talks to the database.
 * Procedures that never touch Prisma may use `base` directly.
 */
export const pub = base.use(prismaErrorMiddleware);
