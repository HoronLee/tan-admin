import { ORMError, ORMErrorReason } from "@zenstackhq/orm";
import { createModuleLogger } from "#/lib/logger";
import { base } from "#/orpc/errors";

const log = createModuleLogger("orpc:orm");

// Postgres SQLSTATE codes we special-case into typed oRPC errors.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const SQLSTATE_UNIQUE_VIOLATION = "23505";
const SQLSTATE_FOREIGN_KEY_VIOLATION = "23503";

function flattenFieldErrors(err: ORMError): {
	formErrors: string[];
	fieldErrors: Record<string, string[]>;
} {
	return {
		formErrors: [err.message],
		fieldErrors: {},
	};
}

/**
 * Maps ZenStack `ORMError` into typed oRPC errors.
 *
 * Mapping:
 * - `not-found`           → NOT_FOUND
 * - `rejected-by-policy`  → FORBIDDEN (pre-wired; fires when PolicyPlugin is on)
 * - `invalid-input`       → INPUT_VALIDATION_FAILED
 * - `db-query-error`      → dispatch by `dbErrorCode` (Postgres SQLSTATE):
 *     - 23505 unique_violation      → CONFLICT
 *     - 23503 foreign_key_violation → BAD_REQUEST
 *     - other                       → rethrow (upstream boundary → INTERNAL_ERROR)
 * - other reasons         → rethrow (upstream boundary → INTERNAL_ERROR)
 */
export const ormErrorMiddleware = base.middleware(async ({ next, errors }) => {
	try {
		return await next();
	} catch (err) {
		if (!(err instanceof ORMError)) {
			throw err;
		}

		log.warn(
			{ err, reason: err.reason, dbErrorCode: err.dbErrorCode },
			"zenstack ORM error",
		);

		switch (err.reason) {
			case ORMErrorReason.NOT_FOUND:
				throw errors.NOT_FOUND({
					message: "Resource not found.",
					cause: err,
				});
			case ORMErrorReason.REJECTED_BY_POLICY:
				throw errors.FORBIDDEN({
					message: "You do not have permission to perform this action.",
					cause: err,
				});
			case ORMErrorReason.INVALID_INPUT:
				throw errors.INPUT_VALIDATION_FAILED({
					message: err.message,
					data: flattenFieldErrors(err),
					cause: err,
				});
			case ORMErrorReason.DB_QUERY_ERROR: {
				const code =
					typeof err.dbErrorCode === "string" ? err.dbErrorCode : undefined;
				if (code === SQLSTATE_UNIQUE_VIOLATION) {
					throw errors.CONFLICT({
						message: "Resource already exists.",
						cause: err,
					});
				}
				if (code === SQLSTATE_FOREIGN_KEY_VIOLATION) {
					throw errors.BAD_REQUEST({
						message: "Referenced resource does not exist.",
						cause: err,
					});
				}
				throw err;
			}
			default:
				throw err;
		}
	}
});

/**
 * Procedure builder pre-composed with ORM error mapping.
 *
 * Use this in any oRPC procedure that talks to the database.
 * Procedures that never touch the DB may use `base` directly.
 */
export const pub = base.use(ormErrorMiddleware);
