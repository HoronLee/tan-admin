/**
 * Better Auth error → Chinese message translator.
 *
 * BA returns English messages with structured `code`. For user-facing toasts
 * we map known codes to translated strings via Paraglide messages. Unknown
 * codes fall back to the raw BA message, then a generic "未知错误".
 *
 * Usage:
 * ```
 * const { error } = await authClient.signIn.email({ email, password });
 * if (error) toast.error(translateAuthError(error));
 * ```
 */

import * as m from "#/paraglide/messages";

/**
 * Structural match for BA client error shapes. BA's generated errors look
 * roughly like `{ code?: string, message?: string, status?: number }` — we
 * accept the widest subset and guard every access.
 */
export interface AuthErrorLike {
	code?: string | null;
	message?: string | null;
}

type MessageFn = () => string;

const CODE_TO_MESSAGE: Record<string, MessageFn> = {
	INVALID_EMAIL_OR_PASSWORD: m.auth_error_invalid_email_or_password,
	USER_ALREADY_EXISTS: m.auth_error_user_already_exists,
	EMAIL_NOT_VERIFIED: m.auth_error_email_not_verified,
	INVITATION_EXPIRED: m.auth_error_invitation_expired,
	INVITATION_NOT_FOUND: m.auth_error_invitation_not_found,
	ORGANIZATION_NOT_FOUND: m.auth_error_organization_not_found,
	MEMBER_NOT_FOUND: m.auth_error_member_not_found,
	USER_NOT_FOUND: m.auth_error_user_not_found,
	PASSWORD_TOO_SHORT: m.auth_error_password_too_short,
	INVALID_TOKEN: m.auth_error_invalid_token,
	EMAIL_NOT_FOUND: m.auth_error_email_not_found,
	UNAUTHORIZED: m.auth_error_unauthorized,
	FORBIDDEN: m.auth_error_forbidden,
};

export function translateAuthError(
	error: AuthErrorLike | null | undefined,
): string {
	if (!error) return m.common_unknown_error();

	const code = error.code?.toString().toUpperCase();
	if (code && code in CODE_TO_MESSAGE) {
		return CODE_TO_MESSAGE[code]();
	}

	const raw = error.message?.trim();
	if (raw) return raw;

	return m.common_unknown_error();
}
