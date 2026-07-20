import * as orm from "@zenstackhq/orm";
import { describe, expect, it } from "vitest";
import * as shim from "./orm-client-shim";

/**
 * Drift guard for the client-build shim of `@zenstackhq/orm`.
 *
 * The vite plugin in `vite.config.ts` replaces the orm barrel with the
 * constants from `orm-client-shim.ts` in non-SSR builds. If an upgrade of
 * `@zenstackhq/orm` changes these operation lists, query invalidation in
 * `@zenstackhq/tanstack-query` would silently miss operations — this test
 * turns that silent drift into a loud failure.
 */
describe("zenstack orm client shim", () => {
	it("mirrors the real @zenstackhq/orm operation constants", () => {
		const real = orm as unknown as Record<string, unknown>;
		for (const [name, ops] of Object.entries(shim)) {
			expect(
				real[name],
				`@zenstackhq/orm no longer exports ${name}`,
			).toBeDefined();
			expect(
				real[name],
				`shimmed ${name} drifted from @zenstackhq/orm`,
			).toEqual(ops);
		}
	});
});
