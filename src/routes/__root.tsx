import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	type ErrorComponentProps,
	HeadContent,
	Link,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { createIsomorphicFn } from "@tanstack/react-start";
import { Providers } from "#/components/providers";
import { ThemeProvider } from "#/components/theme-provider";
import { Toaster } from "#/components/ui/sonner";
import { brandConfig } from "#/config/brand";
import { getLocale } from "#/paraglide/runtime";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

const initSentryClient = createIsomorphicFn()
	.server(() => {})
	.client(async () => {
		const { initSentryClient } = await import("#/lib/sentry.client");
		initSentryClient();
	});

void initSentryClient();

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: brandConfig.name,
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	errorComponent: RootErrorFallback,
	notFoundComponent: RootNotFound,
	shellComponent: RootDocument,
});

function RootNotFound() {
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
			<h1 className="text-2xl font-semibold">Page not found</h1>
			<p className="max-w-lg text-sm text-muted-foreground">
				The page you're looking for doesn't exist.
			</p>
			<Link
				to="/"
				className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
			>
				Back to home
			</Link>
		</div>
	);
}

function RootErrorFallback({ error, reset }: ErrorComponentProps) {
	const message = error instanceof Error ? error.message : String(error);
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
			<h1 className="text-2xl font-semibold">Something went wrong</h1>
			<p className="max-w-lg text-sm text-muted-foreground">{message}</p>
			<div className="flex gap-3">
				<button
					type="button"
					onClick={reset}
					className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
				>
					Try again
				</button>
				<Link
					to="/"
					className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
				>
					Go home
				</Link>
			</div>
		</div>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang={getLocale()} suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body className="font-sans antialiased [overflow-wrap:anywhere]">
				<ThemeProvider defaultTheme="system" storageKey="theme">
					<Providers>{children}</Providers>
				</ThemeProvider>
				<Toaster position="top-right" />
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
