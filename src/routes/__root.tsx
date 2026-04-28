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
import { createIsomorphicFn, createServerFn } from "@tanstack/react-start";
import { Providers } from "#/components/providers";
import { ThemeProvider } from "#/components/theme-provider";
import { Toaster } from "#/components/ui/sonner";
import {
	type BrandPair,
	DEFAULT_LIGHT_OKLCH,
	deriveBrandPair,
} from "#/lib/brand/oklch";
import { brandConfig } from "#/lib/config";
import { getLocale } from "#/paraglide/runtime";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

const initSentryClient = createIsomorphicFn()
	.server(() => {})
	.client(async () => {
		const { initSentryClient } = await import(
			"#/lib/observability/sentry.client"
		);
		initSentryClient();
	});

void initSentryClient();

/**
 * Brand color SSR 派生（root loader → server fn）。
 *
 * 真相源是服务端 env `BRAND_PRIMARY_OKLCH` / `BRAND_PRIMARY_DARK_OKLCH`
 * （非 `VITE_` 前缀，纯服务端）。
 *
 * 走 root loader + `createServerFn`，而不是 `createIsomorphicFn` 桥：
 *   - TanStack Start 默认 loader 是同构的（server + client 都跑）。如果 loader
 *     直接读 `process.env.BRAND_PRIMARY_OKLCH`，client 端 navigate 时 process.env
 *     被 Vite 编译为空对象 `{}`，loader 算出默认中性灰，与 SSR 的品牌色不一致 →
 *     React diff 会把 SSR 节点替换。
 *   - `createServerFn` 把派生强制到 server-only RPC 桩；client 端 loader 调用时
 *     发 RPC 拿同一份 `BrandPair`，hydration / navigate 时 head() 读到的 loaderData
 *     永远等于 SSR 注入值。
 *   - TanStack Router hydration 时 client 重调 `head()` 并 diff `match.styles`
 *     / `match.meta`（见 `react-router/.../HeadContent.dev.js`、`router-core/.../
 *     ssr/ssr-client.js` 的 `useStore(matches)` reconcile 流程）。loaderData 一致 →
 *     diff 不动节点 → SSR 注入的 `<style>` / `<meta theme-color>` 稳定保留
 *     （task 04-27 R1 修复目标）。
 */
const getBrandPair = createServerFn({ method: "GET" }).handler(
	(): BrandPair => {
		const lightInput = process.env.BRAND_PRIMARY_OKLCH ?? DEFAULT_LIGHT_OKLCH;
		const darkInput = process.env.BRAND_PRIMARY_DARK_OKLCH;
		return deriveBrandPair(lightInput, darkInput);
	},
);

interface MyRouterContext {
	queryClient: QueryClient;
}

interface RootLoaderData {
	brand: BrandPair;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	loader: async (): Promise<RootLoaderData> => ({
		brand: await getBrandPair(),
	}),
	head: ({ loaderData }: { loaderData?: RootLoaderData }) => {
		const brand = loaderData?.brand;
		const themeColorMeta = brand
			? [
					{
						name: "theme-color",
						media: "(prefers-color-scheme: light)",
						content: brand.lightCss,
					},
					{
						name: "theme-color",
						media: "(prefers-color-scheme: dark)",
						content: brand.darkCss,
					},
				]
			: [];
		const brandStyles = brand
			? [
					{
						children: `:root{--brand-primary:${brand.lightCss};--brand-primary-foreground:${brand.lightForegroundCss}}.dark{--brand-primary:${brand.darkCss};--brand-primary-foreground:${brand.darkForegroundCss}}`,
					},
				]
			: [];
		return {
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
				...themeColorMeta,
			],
			links: [
				{
					rel: "stylesheet",
					href: appCss,
				},
			],
			styles: brandStyles,
		};
	},
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
