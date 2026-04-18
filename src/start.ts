import { createStart } from "@tanstack/react-start";
import { serverFnErrorMiddleware } from "#/lib/server-fn-middleware";

export const startInstance = createStart(() => ({
	functionMiddleware: [serverFnErrorMiddleware],
}));
