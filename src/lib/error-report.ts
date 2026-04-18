import { isDefinedError } from "@orpc/client";
import * as Sentry from "@sentry/tanstackstart-react";
import { toast } from "sonner";

export interface ReportOptions {
	/** Fallback message when the error is not a typed ORPCError. */
	fallback?: string;
	/** Skip the toast (still captures to Sentry when unknown). */
	silent?: boolean;
}

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

/**
 * Route any caught error through a single reporting surface.
 *
 * Behavior:
 * - Typed oRPC errors (`.errors({...})` defined codes) → user-facing toast
 *   mapped by code. Not reported to Sentry (they are expected signals).
 * - Field-level validation errors (`INPUT_VALIDATION_FAILED`) are NOT
 *   turned into toasts by default — the caller should feed the
 *   structured `data.fieldErrors` into the form. A top-level toast would
 *   be redundant with inline field errors.
 * - Any non-typed error → Sentry capture + generic fallback toast.
 *
 * @example
 *   try { await orpc.users.create.call(data) }
 *   catch (e) { reportError(e) }
 */
export function reportError(error: unknown, options: ReportOptions = {}): void {
	const { fallback = DEFAULT_FALLBACK, silent = false } = options;

	if (isDefinedError(error)) {
		// `isDefinedError` narrows at runtime, but oRPC's generic can collapse to
		// `never` without a concrete router type parameter.
		const definedError = error as { code: string; message?: string };

		if (definedError.code === "INPUT_VALIDATION_FAILED") {
			// Caller should render field errors inline; no toast.
			return;
		}
		if (!silent) {
			toast.error(definedError.message || fallback);
		}
		return;
	}

	Sentry.captureException(error);
	if (!silent) {
		toast.error(fallback);
	}
}
