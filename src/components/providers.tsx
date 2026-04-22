import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import { AuthProvider } from "#/components/auth/auth-provider";
import { authClient } from "#/lib/auth-client";

type LinkProps = PropsWithChildren<{
	className?: string;
	href: string;
	to?: string;
}>;

const Link: ComponentType<LinkProps> = ({ href, to, className, children }) => (
	<RouterLink
		to={(to ?? href) as string}
		className={className as string | undefined}
	>
		{children}
	</RouterLink>
);

export function Providers({ children }: { children: ReactNode }) {
	const routerNavigate = useNavigate();

	const navigate = (options: { to: string; replace?: boolean }) => {
		routerNavigate({
			to: options.to as string,
			replace: options.replace,
		});
	};

	return (
		<AuthProvider
			authClient={authClient}
			navigate={navigate}
			Link={Link}
			redirectTo="/dashboard"
			// Capability flags — UI renders only what the server supports.
			// multiSession() is installed on the server; passkey / magicLink are not.
			multiSession={true}
			passkey={false}
			magicLink={false}
			deleteUser={{ enabled: false }}
		>
			{children}
		</AuthProvider>
	);
}
