import "@tanstack/react-start/server-only";

import { betterAuth } from "better-auth";
import { pool } from "#/lib/db";
import { authConfig } from "./config";

// Runtime BA instance: business code imports `auth` from here (server
// functions, oRPC middlewares, route loaders). Wires the shared `pool` as
// the database adapter; everything else lives in `./config`.
export const auth = betterAuth({
	...authConfig,
	database: pool,
});
