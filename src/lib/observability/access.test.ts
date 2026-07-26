import { describe, expect, it } from "vitest";
import { resolveAccessLogLevel } from "#/lib/observability/access";

describe("resolveAccessLogLevel", () => {
	const fast = { durationMs: 10, slowThresholdMs: 3000 };

	it("classifies 2xx as info", () => {
		expect(resolveAccessLogLevel({ status: 200, ...fast })).toEqual({
			level: "info",
			slow: false,
		});
	});

	it("classifies 3xx as info", () => {
		expect(resolveAccessLogLevel({ status: 302, ...fast })).toEqual({
			level: "info",
			slow: false,
		});
	});

	it("classifies 4xx as warn — client state, not service fault", () => {
		expect(resolveAccessLogLevel({ status: 401, ...fast }).level).toBe("warn");
		expect(resolveAccessLogLevel({ status: 404, ...fast }).level).toBe("warn");
		expect(resolveAccessLogLevel({ status: 422, ...fast }).level).toBe("warn");
	});

	it("classifies 5xx as error", () => {
		expect(resolveAccessLogLevel({ status: 500, ...fast }).level).toBe("error");
		expect(resolveAccessLogLevel({ status: 503, ...fast }).level).toBe("error");
	});

	it("escalates a slow success to warn with the slow marker", () => {
		expect(
			resolveAccessLogLevel({
				status: 200,
				durationMs: 3001,
				slowThresholdMs: 3000,
			}),
		).toEqual({ level: "warn", slow: true });
	});

	it("never demotes an error, slow or not", () => {
		expect(
			resolveAccessLogLevel({
				status: 500,
				durationMs: 9999,
				slowThresholdMs: 3000,
			}),
		).toEqual({ level: "error", slow: true });
	});

	it("treats the threshold itself as not slow", () => {
		expect(
			resolveAccessLogLevel({
				status: 200,
				durationMs: 3000,
				slowThresholdMs: 3000,
			}).slow,
		).toBe(false);
	});
});
