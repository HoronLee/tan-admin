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
import { Toaster } from "#/components/ui/sonner";
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

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export const Route = createRootRouteWithContext<MyRouterContext>()({
	beforeLoad: async () => {
		if (typeof document !== "undefined") {
			document.documentElement.setAttribute("lang", getLocale());
		}
	},

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
				title: "Tan Admin",
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
	shellComponent: RootDocument,
});

function RootErrorFallback({ error, reset }: ErrorComponentProps) {
	const message = error instanceof Error ? error.message : String(error);
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
			<h1 className="text-2xl font-semibold">Something went wrong</h1>
			<p className="max-w-lg text-sm text-[var(--muted-foreground,#64748b)]">
				{message}
			</p>
			<div className="flex gap-3">
				<button
					type="button"
					onClick={reset}
					className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-[var(--accent,#f1f5f9)]"
				>
					Try again
				</button>
				<Link
					to="/"
					className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-[var(--accent,#f1f5f9)]"
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
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static inline script to avoid theme flash before hydration */}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
				<HeadContent />
			</head>
			<body className="font-sans antialiased [overflow-wrap:anywhere]">
				{children}
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
