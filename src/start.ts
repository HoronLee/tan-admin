import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { serverFnErrorMiddleware } from "#/middleware/error";
import { serverFnAccessMiddleware } from "#/middleware/logging";

const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware],
	// Access middleware outermost so its duration covers the error middleware.
	functionMiddleware: [serverFnAccessMiddleware, serverFnErrorMiddleware],
}));
