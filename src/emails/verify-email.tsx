import { Button, Link, Text } from "@react-email/components";
import * as m from "#/paraglide/messages";
import { EmailLayout, sharedStyles } from "./components/email-layout";

export interface VerifyEmailProps {
	url: string;
	userName?: string;
}

export function VerifyEmail({ url, userName }: VerifyEmailProps) {
	const greeting = userName
		? m.email_verify_greeting_named({ name: userName })
		: m.email_verify_greeting_default();
	return (
		<EmailLayout preview={m.email_verify_preview()}>
			<Text style={sharedStyles.heading}>{m.email_verify_heading()}</Text>
			<Text style={sharedStyles.paragraph}>{greeting}：</Text>
			<Text style={sharedStyles.paragraph}>{m.email_verify_body()}</Text>
			<div style={sharedStyles.buttonWrap}>
				<Button href={url} style={sharedStyles.button}>
					{m.email_verify_cta()}
				</Button>
			</div>
			<Text style={sharedStyles.muted}>{m.email_link_fallback_hint()}</Text>
			<Text style={sharedStyles.muted}>
				<Link href={url} style={sharedStyles.link}>
					{url}
				</Link>
			</Text>
			<Text style={sharedStyles.muted}>{m.email_verify_ignore()}</Text>
		</EmailLayout>
	);
}

export default VerifyEmail;
