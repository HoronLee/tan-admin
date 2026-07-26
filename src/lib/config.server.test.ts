import { describe, expect, it } from "vitest";
import { resolveLogOutput } from "#/lib/config.server";

describe("resolveLogOutput", () => {
	it("defaults to stdout when LOG_OUTPUT is unset", () => {
		expect(resolveLogOutput({})).toEqual({
			output: "stdout",
			fileIgnored: false,
		});
	});

	it("honours an explicit stdout policy", () => {
		expect(resolveLogOutput({ output: "stdout" })).toEqual({
			output: "stdout",
			fileIgnored: false,
		});
	});

	it("accepts file output with a destination path", () => {
		expect(resolveLogOutput({ output: "file", file: "logs/app.log" })).toEqual({
			output: "file",
			fileIgnored: false,
		});
	});

	it("accepts both output with a destination path", () => {
		expect(resolveLogOutput({ output: "both", file: "logs/app.log" })).toEqual({
			output: "both",
			fileIgnored: false,
		});
	});

	it("throws when file output has no LOG_FILE — boot must fail, not degrade", () => {
		expect(() => resolveLogOutput({ output: "file" })).toThrow(/LOG_FILE/);
	});

	it("throws when both output has no LOG_FILE", () => {
		expect(() => resolveLogOutput({ output: "both" })).toThrow(/LOG_FILE/);
	});

	it("keeps stdout and flags the ignore when LOG_FILE is set alone", () => {
		expect(resolveLogOutput({ file: "logs/app.log" })).toEqual({
			output: "stdout",
			fileIgnored: true,
		});
	});
});
