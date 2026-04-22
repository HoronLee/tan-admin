import { render, toPlainText } from "@react-email/render";
import { appConfig } from "#/config/app";
import { InviteMember, type InviteMemberProps } from "#/emails/invite-member";
import {
	ResetPassword,
	type ResetPasswordProps,
} from "#/emails/reset-password";
import {
	TransferOwnership,
	type TransferOwnershipProps,
} from "#/emails/transfer-ownership";
import { VerifyEmail, type VerifyEmailProps } from "#/emails/verify-email";
import { env } from "#/env";
import { createModuleLogger } from "#/lib/logger";
import * as m from "#/paraglide/messages";
import { sendMail } from "./email-transport";

const log = createModuleLogger("email");

/**
 * Discriminated union so each template gets its required props checked at
 * the call site. Add a new variant here when introducing a new template.
 */
export type EmailPayload =
	| { type: "verify"; to: string; props: VerifyEmailProps }
	| { type: "reset"; to: string; props: ResetPasswordProps }
	| { type: "invite"; to: string; props: InviteMemberProps }
	| { type: "transfer"; to: string; props: TransferOwnershipProps };

interface RenderedTemplate {
	subject: string;
	html: string;
	text: string;
}

async function renderTemplate(
	payload: EmailPayload,
): Promise<RenderedTemplate> {
	const pretty = appConfig.env !== "prod";

	switch (payload.type) {
		case "verify": {
			const html = await render(<VerifyEmail {...payload.props} />, { pretty });
			return {
				subject: m.email_subject_verify(),
				html,
				text: toPlainText(html),
			};
		}
		case "reset": {
			const html = await render(<ResetPassword {...payload.props} />, {
				pretty,
			});
			return {
				subject: m.email_subject_reset(),
				html,
				text: toPlainText(html),
			};
		}
		case "invite": {
			const html = await render(<InviteMember {...payload.props} />, {
				pretty,
			});
			return {
				subject: m.email_subject_invite({
					inviterName: payload.props.inviterName,
					organizationName: payload.props.organizationName,
				}),
				html,
				text: toPlainText(html),
			};
		}
		case "transfer": {
			const html = await render(<TransferOwnership {...payload.props} />, {
				pretty,
			});
			return {
				subject: m.email_subject_transfer({
					organizationName: payload.props.organizationName,
				}),
				html,
				text: toPlainText(html),
			};
		}
	}
}

function buildFromAddress(): string {
	const name = env.EMAIL_FROM_NAME?.trim();
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
