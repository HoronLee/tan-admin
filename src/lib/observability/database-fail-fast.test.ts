import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	captureException: vi.fn(),
	drainTelemetryAndLogs: vi.fn<() => Promise<void>>(),
	fatal: vi.fn(),
}));

vi.mock("@sentry/tanstackstart-react", () => ({
	captureException: mocks.captureException,
}));

vi.mock("#/lib/observability/logger", () => ({
	createModuleLogger: () => ({ fatal: mocks.fatal }),
}));

vi.mock("#/lib/observability/shutdown", () => ({
	drainTelemetryAndLogs: mocks.drainTelemetryAndLogs,
}));

import {
	exitForDatabaseUnavailable,
	isDatabaseUnavailableError,
} from "#/lib/observability/database-fail-fast";

beforeEach(() => {
	globalThis.__databaseUnavailableExitPromise = undefined;
	globalThis.__databaseUnavailableExitScheduled = undefined;
	mocks.captureException.mockReset();
	mocks.drainTelemetryAndLogs.mockReset();
	mocks.drainTelemetryAndLogs.mockResolvedValue();
	mocks.fatal.mockReset();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("isDatabaseUnavailableError", () => {
	it("recognizes nested driver connection failures", () => {
		const driverError = Object.assign(new Error("connect failed"), {
			code: "ECONNREFUSED",
		});
		const wrapped = new Error("query failed", { cause: driverError });

		expect(isDatabaseUnavailableError(wrapped)).toBe(true);
	});

	it("does not classify unrelated application errors as database failures", () => {
		expect(isDatabaseUnavailableError(new Error("validation failed"))).toBe(
			false,
		);
	});
});

describe("exitForDatabaseUnavailable", () => {
	it("deduplicates fatal exits and drains telemetry and logs before exit 1", async () => {
		const failure = Object.assign(new Error("connect failed"), {
			code: "ECONNREFUSED",
		});
		const exitError = new Error("process.exit(1)");
		const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
			expect(code).toBe(1);
			throw exitError;
		});

		const first = exitForDatabaseUnavailable(failure, {
			phase: "bootstrap",
			requestId: "request-123",
		});
		const second = exitForDatabaseUnavailable(failure, {
			phase: "bootstrap",
			requestId: "request-456",
		});

		expect(second).toBe(first);
		await expect(first).rejects.toBe(exitError);
		expect(mocks.captureException).toHaveBeenCalledTimes(1);
		expect(mocks.captureException).toHaveBeenCalledWith(failure);
		expect(mocks.fatal).toHaveBeenCalledWith(
			{
				err: failure,
				requestId: "request-123",
				phase: "bootstrap",
				serverFn: undefined,
			},
			"database is unavailable; exiting process",
		);
		expect(mocks.drainTelemetryAndLogs).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledTimes(1);
		expect(
			mocks.drainTelemetryAndLogs.mock.invocationCallOrder[0],
		).toBeLessThan(
			exit.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
		);
	});
});
