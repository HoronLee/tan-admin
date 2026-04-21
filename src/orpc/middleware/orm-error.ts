import { ORMError } from "@zenstackhq/orm";
import { createModuleLogger } from "#/lib/logger";
import {
	mapZenStackReasonToCode,
	SQLSTATE_FOREIGN_KEY_VIOLATION,
} from "#/lib/zenstack-error-map";
import { base } from "#/orpc/errors";

const log = createModuleLogger("orpc:orm");

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

		const dbErrorCode =
			typeof err.dbErrorCode === "string" ? err.dbErrorCode : undefined;
		const mappedCode = mapZenStackReasonToCode(err.reason, dbErrorCode);

		switch (mappedCode) {
			case "NOT_FOUND":
				throw errors.NOT_FOUND({
					message: "Resource not found.",
					cause: err,
				});
			case "FORBIDDEN":
				throw errors.FORBIDDEN({
					message: "You do not have permission to perform this action.",
					cause: err,
				});
			case "INPUT_VALIDATION_FAILED":
				throw errors.INPUT_VALIDATION_FAILED({
					message: err.message,
					data: flattenFieldErrors(err),
					cause: err,
				});
			case "CONFLICT":
				throw errors.CONFLICT({
					message: "Resource already exists.",
					cause: err,
				});
			case "BAD_REQUEST":
				throw errors.BAD_REQUEST({
					message:
						dbErrorCode === SQLSTATE_FOREIGN_KEY_VIOLATION
							? "Referenced resource does not exist."
							: "Bad request.",
					cause: err,
				});
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
