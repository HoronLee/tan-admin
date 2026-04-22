import { Button, Link, Text } from "@react-email/components";
import * as m from "#/paraglide/messages";
import { EmailLayout, sharedStyles } from "./components/email-layout";

export interface ResetPasswordProps {
	url: string;
	userName?: string;
}

export function ResetPassword({ url, userName }: ResetPasswordProps) {
	const greeting = userName
		? m.email_verify_greeting_named({ name: userName })
		: m.email_verify_greeting_default();
	return (
		<EmailLayout preview={m.email_reset_preview()}>
			<Text style={sharedStyles.heading}>{m.email_reset_heading()}</Text>
			<Text style={sharedStyles.paragraph}>{greeting}：</Text>
			<Text style={sharedStyles.paragraph}>{m.email_reset_body()}</Text>
			<div style={sharedStyles.buttonWrap}>
				<Button href={url} style={sharedStyles.button}>
					{m.email_reset_cta()}
				</Button>
			</div>
			<Text style={sharedStyles.warning}>{m.email_reset_warning()}</Text>
			<Text style={sharedStyles.muted}>{m.email_link_fallback_hint()}</Text>
			<Text style={sharedStyles.muted}>
				<Link href={url} style={sharedStyles.link}>
					{url}
				</Link>
			</Text>
			<Text style={sharedStyles.muted}>{m.email_reset_ignore()}</Text>
		</EmailLayout>
	);
}

export default ResetPassword;
