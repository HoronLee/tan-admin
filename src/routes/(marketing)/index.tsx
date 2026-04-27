import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "#/components/brand-mark";
import { Button } from "#/components/ui/button";
import { brandConfig } from "#/lib/config";

// 占位 marketing index。公开可访问，已登录用户不 redirect（允许返回官网看）。
// 以后要补 pricing / about / blog 时在 `src/routes/(marketing)/` 下平铺。
export const Route = createFileRoute("/(marketing)/")({
	component: MarketingIndex,
});

function MarketingIndex() {
	return (
		<div className="min-h-svh flex flex-col items-center justify-center gap-6 p-8 text-center">
			<div className="flex flex-col items-center gap-2">
				<BrandMark
					size="md"
					className="text-xs tracking-[0.18em] text-muted-foreground uppercase"
					name={brandConfig.name.toUpperCase()}
				/>
				<h1 className="text-3xl font-semibold">
					全栈 SaaS / ToB 快速开发脚手架
				</h1>
				<p className="max-w-lg text-sm text-muted-foreground">
					一套代码同时服务甲方交付（私有化部署）与 B2B SaaS workspace 模型。
					基于 TanStack Start + Better Auth + ZenStack + shadcn/ui。
				</p>
			</div>
			<div className="flex gap-3">
				<Button asChild>
					<Link to="/auth/$path" params={{ path: "sign-in" }}>
						登录
					</Link>
				</Button>
				<Button asChild variant="outline">
					<Link to="/dashboard">进入 Workspace</Link>
				</Button>
			</div>
		</div>
	);
}
