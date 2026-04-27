import { useClientQueries } from "@zenstackhq/tanstack-query/react";
import { schema } from "zenstack/schema";
import type { authDb } from "#/lib/db";

type AuthDbClient = typeof authDb;

export function useZenStackQueries() {
	return useClientQueries<AuthDbClient>(schema, {
		endpoint: "/api/model",
	});
}
