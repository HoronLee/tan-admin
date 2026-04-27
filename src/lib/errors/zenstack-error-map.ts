export const SQLSTATE_UNIQUE_VIOLATION = "23505";
export const SQLSTATE_FOREIGN_KEY_VIOLATION = "23503";

export const APP_ERROR_MESSAGES = {
	BAD_REQUEST: "Bad request.",
	UNAUTHORIZED: "Authentication required.",
	FORBIDDEN: "You do not have permission to perform this action.",
	NOT_FOUND: "Resource not found.",
	CONFLICT: "Resource conflict.",
	INPUT_VALIDATION_FAILED: "Input validation failed.",
	RATE_LIMITED: "Too many requests. Please try again later.",
	INTERNAL_ERROR: "An unexpected error occurred.",
} as const;

export type AppErrorCode = keyof typeof APP_ERROR_MESSAGES;

export const ZENSTACK_ERROR_REASONS = [
	"invalid-input",
	"not-found",
	"rejected-by-policy",
	"db-query-error",
	"not-supported",
	"internal-error",
	"config-error",
] as const;

export type ZenStackErrorReason = (typeof ZENSTACK_ERROR_REASONS)[number];

const ZENSTACK_REASON_CODE_MAP: Record<ZenStackErrorReason, AppErrorCode> = {
	"invalid-input": "INPUT_VALIDATION_FAILED",
	"not-found": "NOT_FOUND",
	"rejected-by-policy": "FORBIDDEN",
	"db-query-error": "BAD_REQUEST",
	"not-supported": "INTERNAL_ERROR",
	"internal-error": "INTERNAL_ERROR",
	"config-error": "INTERNAL_ERROR",
};

export interface ZenStackHttpError {
	reason: ZenStackErrorReason;
	message?: string;
	dbErrorCode?: string;
	status?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	return value as Record<string, unknown>;
}

export function isZenStackErrorReason(
	value: unknown,
): value is ZenStackErrorReason {
	return (
		typeof value === "string" &&
		ZENSTACK_ERROR_REASONS.includes(value as ZenStackErrorReason)
	);
}

export function mapZenStackReasonToCode(
	reason: ZenStackErrorReason,
	dbErrorCode?: string,
): AppErrorCode {
	if (reason !== "db-query-error") {
		return ZENSTACK_REASON_CODE_MAP[reason];
	}
	if (dbErrorCode === SQLSTATE_UNIQUE_VIOLATION) {
		return "CONFLICT";
	}
	if (dbErrorCode === SQLSTATE_FOREIGN_KEY_VIOLATION) {
		return "BAD_REQUEST";
	}
	return "INTERNAL_ERROR";
}

export function getZenStackHttpError(error: unknown): ZenStackHttpError | null {
	const root = asRecord(error);
	if (!root) {
		return null;
	}

	const infoError = asRecord(root.info);
	const bodyError = asRecord(asRecord(root.body)?.error);
	const rootError = asRecord(root.error);
	const candidate = infoError ?? bodyError ?? rootError;

	if (!candidate || !isZenStackErrorReason(candidate.reason)) {
		return null;
	}

	const status = typeof root.status === "number" ? root.status : undefined;
	const message =
		typeof candidate.message === "string" ? candidate.message : undefined;
	const dbErrorCode =
		typeof candidate.dbErrorCode === "string"
			? candidate.dbErrorCode
			: undefined;

	return {
		reason: candidate.reason,
		message,
		dbErrorCode,
		status,
	};
}
