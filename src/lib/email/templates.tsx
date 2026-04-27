import { render, toPlainText } from "@react-email/render";
import {
	EmailChangedEmail,
	type EmailChangedEmailProps,
} from "#/components/email/email-changed";
import {
	EmailVerificationEmail,
	type EmailVerificationEmailProps,
} from "#/components/email/email-verification";
import {
	MagicLinkEmail,
	type MagicLinkEmailProps,
} from "#/components/email/magic-link";
import {
	NewDeviceEmail,
	type NewDeviceEmailProps,
} from "#/components/email/new-device";
import { OtpEmail, type OtpEmailProps } from "#/components/email/otp";
import {
	PasswordChangedEmail,
	type PasswordChangedEmailProps,
} from "#/components/email/password-changed";
import {
	ResetPasswordEmail,
	type ResetPasswordEmailProps,
} from "#/components/email/reset-password";
import { InviteMember, type InviteMemberProps } from "#/emails/invite-member";
import {
	TransferOwnership,
	type TransferOwnershipProps,
} from "#/emails/transfer-ownership";
import { appConfig } from "#/lib/config.server";
import {
	emailChangedLocalization,
	magicLinkLocalization,
	newDeviceLocalization,
	otpLocalization,
	passwordChangedLocalization,
	resetPasswordLocalization,
	verifyLocalization,
} from "#/lib/email/localization";
import { env } from "#/lib/env";
import { createModuleLogger } from "#/lib/observability/logger";
import * as m from "#/paraglide/messages";
import { sendMail } from "./transport";

const log = createModuleLogger("email");

/**
 * Callsite-only props: each variant strips the plumbing that
 * `renderTemplate` injects centrally (appName, logo, localization) so the
 * caller isn't forced to repeat brand wiring on every `sendEmail` call.
 */
type BaseVerifyProps = Omit<
	EmailVerificationEmailProps,
	"appName" | "logoURL" | "localization"
>;
type BaseResetProps = Omit<
	ResetPasswordEmailProps,
	"appName" | "logoURL" | "localization"
>;
type BaseEmailChangedProps = Omit<
	EmailChangedEmailProps,
	"appName" | "logoURL" | "localization"
>;
type BasePasswordChangedProps = Omit<
	PasswordChangedEmailProps,
	"appName" | "logoURL" | "localization"
>;
type BaseMagicLinkProps = Omit<
	MagicLinkEmailProps,
	"appName" | "logoURL" | "localization"
>;
type BaseNewDeviceProps = Omit<
	NewDeviceEmailProps,
	"appName" | "logoURL" | "localization"
>;
type BaseOtpProps = Omit<OtpEmailProps, "appName" | "logoURL" | "localization">;
type BaseInviteProps = Omit<InviteMemberProps, "appName" | "logoURL">;
type BaseTransferProps = Omit<TransferOwnershipProps, "appName" | "logoURL">;

/**
 * Discriminated union so each template gets its required props checked at
 * the call site. Add a new variant here when introducing a new template.
 */
export type EmailPayload =
	| { type: "verify"; to: string; props: BaseVerifyProps }
	| { type: "reset"; to: string; props: BaseResetProps }
	| { type: "email-changed"; to: string; props: BaseEmailChangedProps }
	| { type: "password-changed"; to: string; props: BasePasswordChangedProps }
	| { type: "magic-link"; to: string; props: BaseMagicLinkProps }
	| { type: "new-device"; to: string; props: BaseNewDeviceProps }
	| { type: "otp"; to: string; props: BaseOtpProps }
	| { type: "invite"; to: string; props: BaseInviteProps }
	| { type: "transfer"; to: string; props: BaseTransferProps };

interface RenderedTemplate {
	subject: string;
	html: string;
	text: string;
}

/**
 * Resolve brand plumbing (appName / logoURL) from `appConfig.brand`. Kept as
 * a single call so every template gets the same wiring — swap here and the
 * change is global.
 */
function buildBrandProps(): {
	appName: string;
	logoURL?: string | { light: string; dark: string };
} {
	const { name, logoURL, logoDarkURL } = appConfig.brand;
	return {
		appName: name,
		logoURL: logoURL
			? logoDarkURL
				? { light: logoURL, dark: logoDarkURL }
				: logoURL
			: undefined,
	};
}

async function renderTemplate(
	payload: EmailPayload,
): Promise<RenderedTemplate> {
	const pretty = appConfig.env !== "prod";
	const brand = buildBrandProps();

	switch (payload.type) {
		case "verify": {
			const html = await render(
				<EmailVerificationEmail
					{...payload.props}
					{...brand}
					localization={verifyLocalization()}
				/>,
				{ pretty },
			);
			return {
				subject: m.email_verify_subject(),
				html,
				text: toPlainText(html),
			};
		}
		case "reset": {
			const html = await render(
				<ResetPasswordEmail
					{...payload.props}
					{...brand}
					localization={resetPasswordLocalization()}
				/>,
				{ pretty },
			);
			return {
				subject: m.email_reset_subject(),
				html,
				text: toPlainText(html),
			};
		}
		case "email-changed": {
			const html = await render(
				<EmailChangedEmail
					{...payload.props}
					{...brand}
					localization={emailChangedLocalization()}
				/>,
				{ pretty },
			);
			return {
				subject: m.email_email_changed_subject(),
				html,
				text: toPlainText(html),
			};
		}
		case "password-changed": {
			const html = await render(
				<PasswordChangedEmail
					{...payload.props}
					{...brand}
					localization={passwordChangedLocalization()}
				/>,
				{ pretty },
			);
			return {
				subject: m.email_password_changed_subject(),
				html,
				text: toPlainText(html),
			};
		}
		case "magic-link": {
			const html = await render(
				<MagicLinkEmail
					{...payload.props}
					{...brand}
					localization={magicLinkLocalization()}
				/>,
				{ pretty },
			);
			return {
				subject: m.email_magic_link_subject({ appName: brand.appName }),
				html,
				text: toPlainText(html),
			};
		}
		case "new-device": {
			const html = await render(
				<NewDeviceEmail
					{...payload.props}
					{...brand}
					localization={newDeviceLocalization()}
				/>,
				{ pretty },
			);
			return {
				subject: m.email_new_device_subject(),
				html,
				text: toPlainText(html),
			};
		}
		case "otp": {
			const html = await render(
				<OtpEmail
					{...payload.props}
					{...brand}
					localization={otpLocalization()}
				/>,
				{ pretty },
			);
			return {
				subject: m.email_otp_subject(),
				html,
				text: toPlainText(html),
			};
		}
		case "invite": {
			const html = await render(
				<InviteMember {...payload.props} {...brand} />,
				{ pretty },
			);
			return {
				subject: m.email_invite_subject({
					inviterName: payload.props.inviterName,
					organizationName: payload.props.organizationName,
				}),
				html,
				text: toPlainText(html),
			};
		}
		case "transfer": {
			const html = await render(
				<TransferOwnership {...payload.props} {...brand} />,
				{ pretty },
			);
			return {
				subject: m.email_transfer_subject({
					organizationName: payload.props.organizationName,
				}),
				html,
				text: toPlainText(html),
			};
		}
	}
}

function buildFromAddress(): string {
	// EMAIL_FROM_NAME 允许单独配置（某些场景希望发件人名和品牌名不一样，
	// 比如 brand=Acme 但发件人想写 "Acme Security Alerts"）。未设置时
	// 回退到 brand.name —— 品牌单一真相源，默认情况下改一处 VITE_BRAND_NAME 全联动。
	const name = env.EMAIL_FROM_NAME?.trim() || appConfig.brand.name;
	return name ? `"${name}" <${env.EMAIL_FROM}>` : env.EMAIL_FROM;
}

/**
 * High-level email entry point. Renders a react-email template, resolves the
 * from address, and dispatches through the configured transport.
 *
 * Errors propagate — callers decide whether to retry / surface to the user.
 * Better Auth's `sendVerificationEmail` etc. call this outside of the signup
 * transaction, so a thrown error will NOT roll back the signup.
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
	const { subject, html, text } = await renderTemplate(payload);
	const from = buildFromAddress();

	try {
		await sendMail({ to: payload.to, from, subject, html, text });
		log.info(
			{ to: payload.to, type: payload.type, transport: env.EMAIL_TRANSPORT },
			"Email dispatched.",
		);
	} catch (err) {
		log.error(
			{ err, to: payload.to, type: payload.type },
			"Failed to dispatch email.",
		);
		throw err;
	}
}
