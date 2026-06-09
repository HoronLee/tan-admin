import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { serverFnErrorMiddleware } from "#/middleware/error";

const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware],
	functionMiddleware: [serverFnErrorMiddleware],
}));
