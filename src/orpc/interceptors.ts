import { ORPCError, onError, ValidationError } from "@orpc/server";
import type { RPCHandlerOptions } from "@orpc/server/fetch";
import * as Sentry from "@sentry/tanstackstart-react";
import * as z from "zod";
import { createModuleLogger } from "#/lib/logger";

const log = createModuleLogger("orpc");
const INTERNAL_ERROR_MESSAGE = "An unexpected error occurred.";
type ServerInterceptors = NonNullable<
	RPCHandlerOptions<Record<never, never>>["interceptors"]
>;

/**
 * Boundary interceptor chain for oRPC handlers.
 *
 * Runs on the server before the response leaves the process:
 * 1. Upgrade Zod validation failures (`BAD_REQUEST + ValidationError`)
 *    into typed `INPUT_VALIDATION_FAILED` with `{formErrors, fieldErrors}`.
 * 2. Log structured error.
 * 3. Forward unknown (non-typed) errors to Sentry. Typed errors
 *    defined in `src/orpc/errors.ts` are considered expected
 *    application signals and are not reported to Sentry.
 */
export const serverInterceptors: ServerInterceptors = [
	onError((error) => {
		if (
			error instanceof ORPCError &&
			error.code === "BAD_REQUEST" &&
			error.cause instanceof ValidationError
		) {
			const zodError = new z.ZodError(error.cause.issues as z.core.$ZodIssue[]);
			throw new ORPCError("INPUT_VALIDATION_FAILED", {
				status: 422,
				message: z.prettifyError(zodError),
				data: z.flattenError(zodError),
				cause: error.cause,
			});
		}
	}),
	onError((error) => {
		// Expected 4xx（UNAUTHORIZED / FORBIDDEN / NOT_FOUND 等 typed 错误）
		// 是客户端状态问题，不是服务故障；WARN 足矣，不污染 ERROR 告警面板。
		// 5xx / 未 typed 的 error 才是真故障，走 ERROR + Sentry 上报。
		const isExpectedClientError =
			error instanceof ORPCError &&
			error.defined === true &&
			error.status >= 400 &&
			error.status < 500;
		if (isExpectedClientError) {
			log.warn({ err: error }, "oRPC handler error");
		} else {
			log.error({ err: error }, "oRPC handler error");
		}

		if (error instanceof ORPCError && error.defined === true) {
			return;
		}

		Sentry.captureException(error);
		throw new ORPCError("INTERNAL_ERROR", {
			status: 500,
			message: INTERNAL_ERROR_MESSAGE,
			cause: error,
		});
	}),
];
