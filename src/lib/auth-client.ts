import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL:
		import.meta.env.VITE_APP_URL ??
		(typeof window !== "undefined" ? window.location.origin : undefined),
});
