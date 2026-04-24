import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	pixelBasedPreset,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";
import {
	type EmailClassNames,
	type EmailColors,
	EmailStyles,
} from "#/components/email/email-styles";
import { cn } from "#/lib/utils";
import * as m from "#/paraglide/messages";

export interface InviteMemberProps {
	/** Invitation URL the recipient must click to accept */
	url: string;
	/** Name of the inviter displayed in the email body */
	inviterName: string;
	/** Name of the organization the recipient is being invited to */
	organizationName: string;
	/** Name of the application sending the email */
	appName?: string;
	/** Logo URL(s) — single string or light/dark variants */
	logoURL?: string | { light: string; dark: string };
	/** Custom CSS class names for styling */
	classNames?: EmailClassNames;
	/** Custom color scheme for light and dark modes */
	colors?: EmailColors;
	/** Whether to enable dark mode support */
	darkMode?: boolean;
	/** Whether to show the "Powered by better-auth" footer */
	poweredBy?: boolean;
}

/**
 * Org-invite email template. Mirrors the BA UI template shape (Tailwind
 * `Head`/`Body`/`Section` with `EmailStyles` CSS injection) so it renders
 * visually consistent with the 7 BA UI transactional emails. See
 * .trellis/spec/backend/email-infrastructure.md § Templates directory.
 */
export function InviteMember({
	url,
	inviterName,
	organizationName,
	appName,
	logoURL,
	classNames,
	colors,
	darkMode = true,
	poweredBy,
}: InviteMemberProps) {
	const resolvedAppName = appName ?? "";
	const previewText = m.email_invite_title();

	return (
		<Html>
			<Head>
				<meta content="light dark" name="color-scheme" />
				<meta content="light dark" name="supported-color-schemes" />
				<EmailStyles colors={colors} darkMode={darkMode} />
			</Head>

			<Preview>{previewText}</Preview>

			<Tailwind config={{ presets: [pixelBasedPreset] }}>
				<Body className={cn("bg-background font-sans", classNames?.body)}>
					<Container
						className={cn(
							"mx-auto my-auto max-w-xl px-2 py-10",
							classNames?.container,
						)}
					>
						<Section
							className={cn(
								"bg-card text-card-foreground rounded-none border border-border p-8",
								classNames?.card,
							)}
						>
							{logoURL &&
								(typeof logoURL === "string" ? (
									<Img
										src={logoURL}
										width={48}
										height={48}
										alt={appName || m.email_invite_logo()}
										className={cn("mx-auto mb-8", classNames?.logo)}
									/>
								) : (
									<>
										<Img
											src={logoURL.light}
											width={48}
											height={48}
											alt={appName || m.email_invite_logo()}
											className={cn(
												"mx-auto mb-8 logo-light",
												classNames?.logo,
											)}
										/>
										<Img
											src={logoURL.dark}
											width={48}
											height={48}
											alt={appName || m.email_invite_logo()}
											className={cn(
												"hidden mx-auto mb-8 logo-dark",
												classNames?.logo,
											)}
										/>
									</>
								))}

							<Heading
								className={cn(
									"m-0 mb-5 text-2xl font-semibold",
									classNames?.title,
								)}
							>
								{m.email_invite_heading()}
							</Heading>

							<Text className={cn("text-sm font-normal", classNames?.content)}>
								{m.email_invite_body({ inviterName, organizationName })}
							</Text>

							<Section className="my-8 text-center">
								<Button
									href={url}
									className={cn(
										"bg-primary text-primary-foreground rounded px-6 py-3 text-sm font-medium",
										classNames?.button,
									)}
								>
									{m.email_invite_button()}
								</Button>
							</Section>

							<Text
								className={cn(
									"text-muted-foreground text-xs",
									classNames?.description,
								)}
							>
								{m.email_invite_or_copy_url()}
							</Text>
							<Text className={cn("text-xs", classNames?.link)}>
								<Link href={url} className="break-all">
									{url}
								</Link>
							</Text>

							<Hr className={cn("border-border my-6", classNames?.separator)} />

							<Text
								className={cn(
									"text-muted-foreground text-xs",
									classNames?.description,
								)}
							>
								{m.email_invite_sent_by({ appName: resolvedAppName })}
							</Text>
							<Text
								className={cn(
									"text-muted-foreground text-xs",
									classNames?.description,
								)}
							>
								{m.email_invite_ignore_if_not_requested()}
							</Text>

							{poweredBy ? (
								<Text
									className={cn(
										"text-muted-foreground text-center text-xs mt-4",
										classNames?.poweredBy,
									)}
								>
									{m.email_invite_powered_by({ betterAuth: "Better Auth" })}
								</Text>
							) : null}
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

export default InviteMember;
