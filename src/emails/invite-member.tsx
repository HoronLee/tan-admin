import { Button, Link, Text } from "@react-email/components";
import * as m from "#/paraglide/messages";
import { EmailLayout, sharedStyles } from "./components/email-layout";

export interface InviteMemberProps {
	url: string;
	inviterName: string;
	organizationName: string;
}

export function InviteMember({
	url,
	inviterName,
	organizationName,
}: InviteMemberProps) {
	return (
		<EmailLayout
			preview={m.email_invite_preview({ inviterName, organizationName })}
		>
			<Text style={sharedStyles.heading}>{m.email_invite_heading()}</Text>
			<Text style={sharedStyles.paragraph}>
				<strong>{inviterName}</strong> {m.email_invite_body_prefix()}{" "}
				<strong>{organizationName}</strong>
				{m.email_invite_body_suffix()}
			</Text>
			<Text style={sharedStyles.paragraph}>{m.email_invite_body_action()}</Text>
			<div style={sharedStyles.buttonWrap}>
				<Button href={url} style={sharedStyles.button}>
					{m.email_invite_cta()}
				</Button>
			</div>
			<Text style={sharedStyles.muted}>{m.email_link_fallback_hint()}</Text>
			<Text style={sharedStyles.muted}>
				<Link href={url} style={sharedStyles.link}>
					{url}
				</Link>
			</Text>
			<Text style={sharedStyles.muted}>{m.email_invite_ignore()}</Text>
		</EmailLayout>
	);
}

export default InviteMember;
