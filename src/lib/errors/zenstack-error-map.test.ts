import { describe, expect, it } from "vitest";
import {
	getZenStackHttpError,
	mapZenStackReasonToCode,
	SQLSTATE_FOREIGN_KEY_VIOLATION,
	SQLSTATE_UNIQUE_VIOLATION,
} from "#/lib/errors/zenstack-error-map";

describe("mapZenStackReasonToCode", () => {
	it("maps non-db reasons to standard app error codes", () => {
		expect(mapZenStackReasonToCode("invalid-input")).toBe(
			"INPUT_VALIDATION_FAILED",
		);
		expect(mapZenStackReasonToCode("not-found")).toBe("NOT_FOUND");
		expect(mapZenStackReasonToCode("rejected-by-policy")).toBe("FORBIDDEN");
		expect(mapZenStackReasonToCode("not-supported")).toBe("INTERNAL_ERROR");
		expect(mapZenStackReasonToCode("internal-error")).toBe("INTERNAL_ERROR");
		expect(mapZenStackReasonToCode("config-error")).toBe("INTERNAL_ERROR");
	});

	it("maps db-query-error by SQLSTATE", () => {
		expect(
			mapZenStackReasonToCode("db-query-error", SQLSTATE_UNIQUE_VIOLATION),
		).toBe("CONFLICT");
		expect(
			mapZenStackReasonToCode("db-query-error", SQLSTATE_FOREIGN_KEY_VIOLATION),
		).toBe("BAD_REQUEST");
		expect(mapZenStackReasonToCode("db-query-error", "99999")).toBe(
			"INTERNAL_ERROR",
		);
	});
});

describe("getZenStackHttpError", () => {
	it("extracts error detail from fetcher error.info payload", () => {
		const err = Object.assign(new Error("failed"), {
			status: 403,
			info: {
				reason: "rejected-by-policy",
				message: "policy denied",
			},
		});

		expect(getZenStackHttpError(err)).toEqual({
			reason: "rejected-by-policy",
			message: "policy denied",
			status: 403,
			dbErrorCode: undefined,
		});
	});

	it("extracts error detail from body.error payload", () => {
		const err = {
			status: 400,
			body: {
				error: {
					reason: "db-query-error",
					dbErrorCode: SQLSTATE_FOREIGN_KEY_VIOLATION,
					message: "fk failed",
				},
			},
		};

		expect(getZenStackHttpError(err)).toEqual({
			reason: "db-query-error",
			message: "fk failed",
			status: 400,
			dbErrorCode: SQLSTATE_FOREIGN_KEY_VIOLATION,
		});
	});

	it("returns null for non-ZenStack errors", () => {
		expect(getZenStackHttpError(new Error("boom"))).toBeNull();
	});
});
