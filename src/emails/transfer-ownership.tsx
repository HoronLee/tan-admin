import { Button, Link, Text } from "@react-email/components";
import * as m from "#/paraglide/messages";
import { EmailLayout, sharedStyles } from "./components/email-layout";

export interface TransferOwnershipProps {
	url: string;
	inviterName: string;
	organizationName: string;
}

export function TransferOwnership({
	url,
	inviterName,
	organizationName,
}: TransferOwnershipProps) {
	return (
		<EmailLayout
			preview={m.email_transfer_preview({ inviterName, organizationName })}
		>
			<Text style={sharedStyles.heading}>{m.email_transfer_heading()}</Text>
			<Text style={sharedStyles.paragraph}>
				<strong>{inviterName}</strong>
				{m.email_transfer_body_initiated_suffix()}
			</Text>
			<Text style={sharedStyles.paragraph}>
				{m.email_transfer_body_impact_prefix()}
				<strong>
					{organizationName}
					{m.email_transfer_body_impact_suffix()}
				</strong>
				{m.email_transfer_body_scope()}
			</Text>
			<Text style={sharedStyles.warning}>{m.email_transfer_warning()}</Text>
			<div style={sharedStyles.buttonWrap}>
				<Button href={url} style={sharedStyles.button}>
					{m.email_transfer_cta()}
				</Button>
			</div>
			<Text style={sharedStyles.muted}>{m.email_link_fallback_hint()}</Text>
			<Text style={sharedStyles.muted}>
				<Link href={url} style={sharedStyles.link}>
					{url}
				</Link>
			</Text>
			<Text style={sharedStyles.muted}>
				{m.email_transfer_ignore_prefix()}
				{inviterName}
				{m.email_transfer_ignore_suffix()}
			</Text>
		</EmailLayout>
	);
}

export default TransferOwnership;
