import { createStart } from "@tanstack/react-start";
import { serverFnErrorMiddleware } from "#/middleware/error";

export const startInstance = createStart(() => ({
	functionMiddleware: [serverFnErrorMiddleware],
}));
