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

	it("maps ZenStack policy errors to the same FORBIDDEN toast", () => {
		const err = Object.assign(new Error("fetch failed"), {
			status: 403,
			info: {
				reason: "rejected-by-policy",
				message: "policy denied",
			},
		});

		reportError(err);

		expect(toastError).toHaveBeenCalledWith(
			"You do not have permission to perform this action.",
		);
		expect(sentryCapture).not.toHaveBeenCalled();
	});

	it("keeps ZenStack invalid-input silent for form-level rendering", () => {
		const err = Object.assign(new Error("fetch failed"), {
			status: 422,
			info: {
				reason: "invalid-input",
				message: "invalid payload",
			},
		});

		reportError(err);

		expect(toastError).not.toHaveBeenCalled();
		expect(sentryCapture).not.toHaveBeenCalled();
	});
});
