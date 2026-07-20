/**
 * Mirror of the operation-name constants exported by `@zenstackhq/orm`.
 *
 * `@zenstackhq/tanstack-query` imports these constants from the orm barrel at
 * runtime (transaction invalidation). Resolving the real barrel in the client
 * build would drag the whole ORM runtime (Kysely dialects, node built-ins)
 * into the browser bundle, so `vite.config.ts` swaps the bare
 * `@zenstackhq/orm` import for a virtual module generated from this file in
 * non-SSR builds.
 *
 * Drift guard: `orm-client-shim.test.ts` asserts these arrays stay identical
 * to the real package exports — re-check after upgrading `@zenstackhq/*`.
 */

export const CoreCrudOperations = [
	"findMany",
	"findUnique",
	"findFirst",
	"create",
	"createMany",
	"createManyAndReturn",
	"update",
	"updateMany",
	"updateManyAndReturn",
	"upsert",
	"delete",
	"deleteMany",
	"count",
	"aggregate",
	"groupBy",
	"exists",
];

export const CoreReadOperations = [
	"findMany",
	"findUnique",
	"findFirst",
	"count",
	"aggregate",
	"groupBy",
	"exists",
];

export const CoreWriteOperations = [
	"create",
	"createMany",
	"createManyAndReturn",
	"update",
	"updateMany",
	"updateManyAndReturn",
	"upsert",
	"delete",
	"deleteMany",
];

export const CoreCreateOperations = [
	"create",
	"createMany",
	"createManyAndReturn",
	"upsert",
];

export const CoreUpdateOperations = [
	"update",
	"updateMany",
	"updateManyAndReturn",
	"upsert",
];

export const CoreDeleteOperations = ["delete", "deleteMany"];

export const AllCrudOperations = [
	...CoreCrudOperations,
	"findUniqueOrThrow",
	"findFirstOrThrow",
];

export const AllReadOperations = [
	...CoreReadOperations,
	"findUniqueOrThrow",
	"findFirstOrThrow",
];

export const AllWriteOperations = [...CoreWriteOperations];
