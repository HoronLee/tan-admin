import { ORPCError } from "@orpc/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
const sentryCapture = vi.fn();

vi.mock("sonner", () => ({
	toast: {
		error: (...args: unknown[]) => toastError(...args),
	},
}));

vi.mock("@sentry/tanstackstart-react", () => ({
	captureException: (...args: unknown[]) => sentryCapture(...args),
}));

import { reportError } from "#/lib/error-report";

describe("reportError", () => {
	beforeEach(() => {
		toastError.mockClear();
		sentryCapture.mockClear();
	});

	it("toasts the message for defined non-validation errors", () => {
		const err = new ORPCError("FORBIDDEN", {
			defined: true,
			message: "Access denied.",
		});

		reportError(err);

		expect(toastError).toHaveBeenCalledWith("Access denied.");
		expect(sentryCapture).not.toHaveBeenCalled();
	});

	it("does NOT toast for INPUT_VALIDATION_FAILED (caller handles inline)", () => {
		const err = new ORPCError("INPUT_VALIDATION_FAILED", {
			defined: true,
			message: "validation failed",
			data: { formErrors: [], fieldErrors: { email: ["required"] } },
		});

		reportError(err);

		expect(toastError).not.toHaveBeenCalled();
		expect(sentryCapture).not.toHaveBeenCalled();
	});

	it("captures unknown errors to Sentry and toasts fallback", () => {
		const err = new Error("network down");

		reportError(err, { fallback: "Please try again." });

		expect(sentryCapture).toHaveBeenCalledWith(err);
		expect(toastError).toHaveBeenCalledWith("Please try again.");
	});

	it("silent mode suppresses toast but still captures unknown", () => {
		const err = new Error("boom");

		reportError(err, { silent: true });

		expect(sentryCapture).toHaveBeenCalledWith(err);
		expect(toastError).not.toHaveBeenCalled();
	});
});
