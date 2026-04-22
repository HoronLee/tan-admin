import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import * as m from "#/paraglide/messages";

interface EmailLayoutProps {
	preview: string;
	children: ReactNode;
}

const bodyStyle = {
	backgroundColor: "#f5f7fa",
	fontFamily:
		'-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
	margin: 0,
	padding: "24px 0",
};

const containerStyle = {
	backgroundColor: "#ffffff",
	borderRadius: "8px",
	maxWidth: "560px",
	margin: "0 auto",
	padding: "32px",
	boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const brandStyle = {
	color: "#0f172a",
	fontSize: "20px",
	fontWeight: 700,
	margin: 0,
	letterSpacing: "-0.01em",
};

const brandTaglineStyle = {
	color: "#64748b",
	fontSize: "12px",
	margin: "4px 0 0 0",
};

const hrStyle = {
	borderColor: "#e2e8f0",
	margin: "24px 0",
};

const footerStyle = {
	color: "#94a3b8",
	fontSize: "12px",
	lineHeight: "18px",
	textAlign: "center" as const,
	marginTop: "24px",
};

export function EmailLayout({ preview, children }: EmailLayoutProps) {
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Body style={bodyStyle}>
				<Container style={containerStyle}>
					<Section>
						<Text style={brandStyle}>{m.email_brand_name()}</Text>
						<Text style={brandTaglineStyle}>{m.email_brand_tagline()}</Text>
					</Section>
					<Hr style={hrStyle} />
					<Section>{children}</Section>
					<Hr style={hrStyle} />
					<Text style={footerStyle}>{m.email_footer_note()}</Text>
				</Container>
			</Body>
		</Html>
	);
}

// Shared styles exported for use in individual templates.
export const sharedStyles = {
	heading: {
		color: "#0f172a",
		fontSize: "18px",
		fontWeight: 600,
		margin: "0 0 16px 0",
	},
	paragraph: {
		color: "#334155",
		fontSize: "14px",
		lineHeight: "22px",
		margin: "0 0 12px 0",
	},
	muted: {
		color: "#64748b",
		fontSize: "13px",
		lineHeight: "20px",
		margin: "12px 0",
	},
	buttonWrap: {
		textAlign: "center" as const,
		margin: "24px 0",
	},
	button: {
		backgroundColor: "#0f172a",
		color: "#ffffff",
		borderRadius: "6px",
		display: "inline-block",
		fontSize: "14px",
		fontWeight: 600,
		padding: "12px 24px",
		textDecoration: "none",
	},
	link: {
		color: "#2563eb",
		wordBreak: "break-all" as const,
	},
	warning: {
		color: "#b45309",
		fontSize: "13px",
		lineHeight: "20px",
		margin: "12px 0",
	},
};
