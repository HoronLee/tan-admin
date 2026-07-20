import { useClientQueries } from "@zenstackhq/tanstack-query/react";
// schema-lite strips policy/attribute metadata (`zen generate --lite`) so the
// browser bundle doesn't ship access-policy expressions. Server code keeps
// importing the full `zenstack/schema`.
import { schema } from "zenstack/schema-lite";

export function useZenStackQueries() {
	return useClientQueries(schema, {
		endpoint: "/api/model",
	});
}
