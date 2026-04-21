import { useClientQueries } from "@zenstackhq/tanstack-query/react";
import type { authDb } from "#/db";
import { schema } from "zenstack/schema";

type AuthDbClient = typeof authDb;

export function useZenStackQueries() {
	return useClientQueries<AuthDbClient>(schema, {
		endpoint: "/api/model",
	});
}
