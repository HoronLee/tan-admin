import type { EmailChangedEmailLocalization } from "#/components/email/email-changed";
import type { EmailVerificationEmailLocalization } from "#/components/email/email-verification";
import type { MagicLinkEmailLocalization } from "#/components/email/magic-link";
import type { NewDeviceEmailLocalization } from "#/components/email/new-device";
import type { OtpEmailEmailLocalization } from "#/components/email/otp";
import type { PasswordChangedEmailLocalization } from "#/components/email/password-changed";
import type { ResetPasswordEmailLocalization } from "#/components/email/reset-password";
import * as m from "#/paraglide/messages";

/**
 * Localization factories for the 7 Better Auth UI email templates plus the
 * 2 custom org templates (invite / transfer).
 *
 * Rationale (see .trellis/spec/backend/email-infrastructure.md):
 * - BA UI components accept `localization?: Partial<XxxLocalization>` and
 *   merge with their hard-coded English default. We want full i18n control,
 *   so we build a complete localization object from Paraglide messages and
 *   pass it in.
 * - Keeping translation text in factories (not in BA UI source) means
 *   `shadcn add ...` can re-sync the templates without clobbering our
 *   translations. If BA UI renames a key, only the factory breaks at
 *   compile time — single-file fix.
 *
 * Paraglide placeholders match BA UI placeholders 1:1 — e.g. `{appName}`,
 * `{emailAddress}`, `{expirationMinutes}` stay literal in the returned
 * strings and BA UI's component does the `.replace()` at render time.
 */

export function verifyLocalization(): EmailVerificationEmailLocalization {
	return {
		VERIFY_YOUR_EMAIL_ADDRESS: m.email_verify_title(),
		LOGO: m.email_verify_logo(),
		CLICK_BUTTON_TO_VERIFY_EMAIL: m.email_verify_click_to_verify({
			emailAddress: "{emailAddress}",
			appName: "{appName}",
		}),
		VERIFY_EMAIL_ADDRESS: m.email_verify_button(),
		OR_COPY_AND_PASTE_URL: m.email_verify_or_copy_url(),
		THIS_LINK_EXPIRES_IN_MINUTES: m.email_verify_expires_in({
			expirationMinutes: "{expirationMinutes}",
		}),
		EMAIL_SENT_BY: m.email_verify_sent_by({ appName: "{appName}" }),
		IF_YOU_DIDNT_REQUEST_THIS_EMAIL: m.email_verify_ignore_if_not_requested(),
		POWERED_BY_BETTER_AUTH: m.email_verify_powered_by({
			betterAuth: "{betterAuth}",
		}),
	};
}

export function resetPasswordLocalization(): ResetPasswordEmailLocalization {
	return {
		RESET_YOUR_PASSWORD: m.email_reset_title(),
		LOGO: m.email_reset_logo(),
		WE_RECEIVED_REQUEST_TO_RESET_PASSWORD: m.email_reset_received_request({
			appName: "{appName}",
			email: "{email}",
		}),
		RESET_PASSWORD: m.email_reset_button(),
		OR_COPY_AND_PASTE_URL: m.email_reset_or_copy_url(),
		THIS_LINK_EXPIRES_IN_MINUTES: m.email_reset_expires_in({
			expirationMinutes: "{expirationMinutes}",
		}),
		EMAIL_SENT_BY: m.email_reset_sent_by({ appName: "{appName}" }),
		IF_YOU_DIDNT_REQUEST_PASSWORD_RESET:
			m.email_reset_ignore_if_not_requested(),
		POWERED_BY_BETTER_AUTH: m.email_reset_powered_by({
			betterAuth: "{betterAuth}",
		}),
	};
}

export function emailChangedLocalization(): EmailChangedEmailLocalization {
	return {
		YOUR_EMAIL_ADDRESS_HAS_BEEN_CHANGED: m.email_email_changed_heading(),
		LOGO: m.email_email_changed_logo(),
		EMAIL_ADDRESS_CHANGED: m.email_email_changed_title(),
		EMAIL_ADDRESS_FOR_YOUR_ACCOUNT_CHANGED:
			m.email_email_changed_account_changed({ appName: "{appName}" }),
		PREVIOUS_EMAIL: m.email_email_changed_previous_email(),
		NEW_EMAIL: m.email_email_changed_new_email(),
		IF_YOU_MADE_THIS_CHANGE: m.email_email_changed_if_you_made_this_change(),
		I_DIDNT_MAKE_THIS_CHANGE: m.email_email_changed_i_didnt_make_this_change(),
		EMAIL_SENT_BY: m.email_email_changed_sent_by({ appName: "{appName}" }),
		IF_YOU_DIDNT_AUTHORIZE_THIS_CHANGE:
			m.email_email_changed_if_you_didnt_authorize({
				supportEmail: "{supportEmail}",
			}),
		POWERED_BY_BETTER_AUTH: m.email_email_changed_powered_by({
			betterAuth: "{betterAuth}",
		}),
	};
}

export function passwordChangedLocalization(): PasswordChangedEmailLocalization {
	return {
		YOUR_PASSWORD_HAS_BEEN_CHANGED: m.email_password_changed_heading(),
		LOGO: m.email_password_changed_logo(),
		PASSWORD_CHANGED_SUCCESSFULLY: m.email_password_changed_title(),
		PASSWORD_FOR_YOUR_ACCOUNT_CHANGED: m.email_password_changed_account_changed(
			{
				appName: "{appName}",
				userEmail: "{userEmail}",
			},
		),
		CHANGED_AT: m.email_password_changed_changed_at(),
		IF_YOU_MADE_THIS_CHANGE: m.email_password_changed_if_you_made_this_change(),
		I_DIDNT_MAKE_THIS_CHANGE:
			m.email_password_changed_i_didnt_make_this_change(),
		EMAIL_SENT_BY: m.email_password_changed_sent_by({ appName: "{appName}" }),
		IF_YOU_DIDNT_AUTHORIZE_THIS_CHANGE:
			m.email_password_changed_if_you_didnt_authorize({
				supportEmail: "{supportEmail}",
			}),
		POWERED_BY_BETTER_AUTH: m.email_password_changed_powered_by({
			betterAuth: "{betterAuth}",
		}),
	};
}

export function magicLinkLocalization(): MagicLinkEmailLocalization {
	return {
		SIGN_IN_TO_APP_NAME: m.email_magic_link_sign_in_to_app({
			appName: "{appName}",
		}),
		SIGN_IN_TO_YOUR_ACCOUNT: m.email_magic_link_sign_in_to_your_account(),
		YOUR_ACCOUNT: m.email_magic_link_your_account(),
		LOGO: m.email_magic_link_logo(),
		CLICK_BUTTON_TO_SIGN_IN: m.email_magic_link_click_to_sign_in({
			emailAddress: "{emailAddress}",
		}),
		OR_COPY_AND_PASTE_URL: m.email_magic_link_or_copy_url(),
		THIS_LINK_EXPIRES_IN_MINUTES: m.email_magic_link_expires_in({
			expirationMinutes: "{expirationMinutes}",
		}),
		EMAIL_SENT_BY: m.email_magic_link_sent_by({ appName: "{appName}" }),
		IF_YOU_DIDNT_REQUEST_THIS_EMAIL:
			m.email_magic_link_ignore_if_not_requested(),
		POWERED_BY_BETTER_AUTH: m.email_magic_link_powered_by({
			betterAuth: "{betterAuth}",
		}),
	};
}

export function newDeviceLocalization(): NewDeviceEmailLocalization {
	return {
		NEW_SIGN_IN_DETECTED: m.email_new_device_heading(),
		LOGO: m.email_new_device_logo(),
		NEW_SIGN_IN_TO_YOUR_ACCOUNT: m.email_new_device_sign_in_detected({
			appName: "{appName}",
			userEmail: "{userEmail}",
		}),
		DEVICE_DETAILS: m.email_new_device_device_details(),
		BROWSER: m.email_new_device_browser(),
		OPERATING_SYSTEM: m.email_new_device_operating_system(),
		LOCATION: m.email_new_device_location(),
		IP_ADDRESS: m.email_new_device_ip_address(),
		TIME: m.email_new_device_time(),
		IF_THIS_WAS_YOU: m.email_new_device_if_this_was_you(),
		SECURE_MY_ACCOUNT: m.email_new_device_secure_my_account(),
		EMAIL_SENT_BY: m.email_new_device_sent_by({ appName: "{appName}" }),
		IF_YOU_DIDNT_SIGN_IN: m.email_new_device_if_you_didnt_sign_in({
			supportEmail: "{supportEmail}",
		}),
		POWERED_BY_BETTER_AUTH: m.email_new_device_powered_by({
			betterAuth: "{betterAuth}",
		}),
	};
}

export function otpLocalization(): OtpEmailEmailLocalization {
	return {
		YOUR_VERIFICATION_CODE_IS_CODE: m.email_otp_code_is({
			verificationCode: "{verificationCode}",
		}),
		LOGO: m.email_otp_logo(),
		VERIFY_YOUR_EMAIL: m.email_otp_title(),
		WE_NEED_TO_VERIFY_YOUR_EMAIL_ADDRESS: m.email_otp_need_to_verify({
			email: "{email}",
			appName: "{appName}",
		}),
		THIS_CODE_EXPIRES_IN_MINUTES: m.email_otp_expires_in({
			expirationMinutes: "{expirationMinutes}",
		}),
		EMAIL_SENT_BY: m.email_otp_sent_by({ appName: "{appName}" }),
		IF_YOU_DIDNT_REQUEST_THIS_EMAIL: m.email_otp_ignore_if_not_requested(),
		POWERED_BY_BETTER_AUTH: m.email_otp_powered_by({
			betterAuth: "{betterAuth}",
		}),
	};
}
