import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { appConfig } from "#/config/app";
import { env } from "#/lib/env";
import { createModuleLogger } from "#/lib/observability/logger";

const log = createModuleLogger("email-transport");

export interface MailMessage {
	to: string;
	from: string;
	subject: string;
	html: string;
	text?: string;
}

type Driver = (message: MailMessage) => Promise<void>;

/**
 * Boot-time cross-field validation.
 *
 * We do this at module load (not inside `sendMail`) so a mis-configured
 * deployment fails fast — not on the first verification email a user tries
 * to send, half an hour after rollout.
 */
function validateTransportEnv(): void {
	const transport = env.EMAIL_TRANSPORT;

	if (appConfig.env === "prod" && transport === "console") {
		throw new Error(
			"[email-transport] EMAIL_TRANSPORT=console is not permitted in production. " +
				"Set EMAIL_TRANSPORT=smtp or EMAIL_TRANSPORT=resend.",
		);
	}

	if (transport === "smtp") {
		if (!env.SMTP_HOST) {
			throw new Error(
				"[email-transport] EMAIL_TRANSPORT=smtp requires SMTP_HOST. " +
					"Check your .env / deployment config.",
			);
		}
		// SMTP_USER + SMTP_PASS are optional: local relays (mailpit / maildev /
		// postfix) accept unauthenticated submissions. If one is set, both must be.
		const hasUser = Boolean(env.SMTP_USER);
		const hasPass = Boolean(env.SMTP_PASS);
		if (hasUser !== hasPass) {
			throw new Error(
				"[email-transport] SMTP_USER and SMTP_PASS must be set together, or neither. " +
					"Check your .env / deployment config.",
			);
		}
	}

	if (transport === "resend" && !env.RESEND_API_KEY) {
		throw new Error(
			"[email-transport] EMAIL_TRANSPORT=resend requires RESEND_API_KEY. " +
				"Check your .env / deployment config.",
		);
	}
}

function extractFirstUrl(text: string): string | undefined {
	const match = text.match(/https?:\/\/\S+/);
	return match?.[0];
}

function buildConsoleDriver(): Driver {
	return async ({ to, subject, html, text }) => {
		const body = text ?? html;
		const url = extractFirstUrl(body);
		log.info(
			{ to, subject, url },
			"[EMAIL_TRANSPORT=console] mail skipped (dev). Use the URL to continue manually.",
		);
	};
}

function buildSmtpDriver(): Driver {
	// SMTP_HOST is guaranteed by validateTransportEnv(); auth is opt-in.
	const transporter: Transporter = nodemailer.createTransport({
		host: env.SMTP_HOST as string,
		port: env.SMTP_PORT,
		// Port 465 uses implicit TLS → secure:true; 587/25 use STARTTLS → secure:false.
		secure: env.SMTP_SECURE,
		requireTLS: !env.SMTP_SECURE && env.SMTP_PORT === 587,
		auth: env.SMTP_USER
			? { user: env.SMTP_USER, pass: env.SMTP_PASS as string }
			: undefined,
		pool: true,
	});

	// Fire-and-forget verify on boot: only surface on failure. Some providers
	// reject SMTP-AUTH via verify() but still accept sendMail, so a warn is
	// sufficient; silent on success keeps dev logs quiet (module loads lazily
	// on the first SSR render that touches BA, which otherwise spams every
	// `pnpm dev` restart).
	transporter
		.verify()
		.catch((err: unknown) =>
			log.warn({ err, host: env.SMTP_HOST }, "SMTP transporter verify failed"),
		);

	return async ({ to, from, subject, html, text }) => {
		await transporter.sendMail({ to, from, subject, html, text });
	};
}

function buildResendDriver(): Driver {
	const client = new Resend(env.RESEND_API_KEY as string);
	return async ({ to, from, subject, html, text }) => {
		const { error } = await client.emails.send({
			from,
			to: [to],
			subject,
			html,
			text,
		});
		if (error) {
			throw new Error(`[resend] ${error.message}`);
		}
	};
}

function buildDriver(): Driver {
	switch (env.EMAIL_TRANSPORT) {
		case "console":
			return buildConsoleDriver();
		case "smtp":
			return buildSmtpDriver();
		case "resend":
			return buildResendDriver();
	}
}

validateTransportEnv();

const driver: Driver = buildDriver();

/**
 * Low-level mail dispatch. Picks a driver based on `EMAIL_TRANSPORT` at
 * module-load time. Callers should go through `sendEmail` in `./email.ts`
 * — this function is exported for testing / tooling only.
 */
export async function sendMail(message: MailMessage): Promise<void> {
	await driver(message);
}
