import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";
import * as ormClientShim from "./src/integrations/zenstack-query/orm-client-shim";

const ZENSTACK_ORM_CLIENT_SHIM_ID = "\0zenstack-orm-client-shim";

/**
 * `@zenstackhq/tanstack-query` runtime-imports operation-name constants from
 * the `@zenstackhq/orm` barrel, which would pull the whole ORM (Kysely
 * dialects, node built-ins) into the browser bundle. In non-SSR resolution we
 * swap the barrel for a virtual module generated from
 * `src/integrations/zenstack-query/orm-client-shim.ts` (drift-guarded by its
 * companion test).
 */
function zenStackOrmClientShim(): Plugin {
	return {
		name: "zenstack-orm-client-shim",
		enforce: "pre",
		resolveId(id, _importer, options) {
			if (id === "@zenstackhq/orm" && !options.ssr) {
				return ZENSTACK_ORM_CLIENT_SHIM_ID;
			}
		},
		load(id) {
			if (id !== ZENSTACK_ORM_CLIENT_SHIM_ID) return;

			return Object.entries(ormClientShim)
				.map(([name, ops]) => `export const ${name} = ${JSON.stringify(ops)};`)
				.join("\n");
		},
	};
}

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		zenStackOrmClientShim(),
		devtools(),
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			strategy: ["cookie", "preferredLanguage", "baseLocale"],
		}),
		tailwindcss(),
		tanstackStart(),
		!process.env.VITEST && nitro(),
		viteReact(),
	],
});

export default config;
