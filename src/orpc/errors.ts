import { os } from "@orpc/server";
import * as z from "zod";

/**
 * Standard error codes aligned with HTTP semantics.
 *
 * Every oRPC procedure must derive from `base` so clients can
 * narrow errors via `isDefinedError()` and switch on `error.code`.
 */
export const base = os.errors({
	UNAUTHORIZED: {
		status: 401,
		message: "Authentication required.",
	},
	FORBIDDEN: {
		status: 403,
		message: "You do not have permission to perform this action.",
	},
	NOT_FOUND: {
		status: 404,
		message: "Resource not found.",
	},
	CONFLICT: {
		status: 409,
		message: "Resource conflict.",
	},
	INPUT_VALIDATION_FAILED: {
		status: 422,
		message: "Input validation failed.",
		data: z.object({
			formErrors: z.array(z.string()),
			fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
		}),
	},
	RATE_LIMITED: {
		status: 429,
		message: "Too many requests. Please try again later.",
		data: z.object({
			retryAfter: z.number().int().positive(),
		}),
	},
	INTERNAL_ERROR: {
		status: 500,
		message: "An unexpected error occurred.",
	},
});
