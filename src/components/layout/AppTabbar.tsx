import { useNavigate, useRouter } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { MoreHorizontalIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";
import {
	addTab,
	removeOtherTabs,
	removeRightTabs,
	removeTab,
	setActiveTab,
	type TabItem,
	tabbarStore,
} from "#/stores/tabbar";

export { addTab };

interface TabChipProps {
	tab: TabItem;
	isActive: boolean;
	onActivate: () => void;
	onClose: () => void;
	onCloseOthers: () => void;
	onCloseRight: () => void;
}

function TabChip({
	tab,
	isActive,
	onActivate,
	onClose,
	onCloseOthers,
	onCloseRight,
}: TabChipProps) {
	return (
		<div
			className={cn(
				"group relative flex h-full shrink-0 cursor-pointer select-none items-center gap-1.5 border-b-2 px-3 text-sm transition-colors",
				isActive
					? "border-b-primary text-foreground"
					: "border-b-transparent text-muted-foreground hover:text-foreground",
			)}
		>
			{/* Click area — activates tab */}
			<button
				type="button"
				className="flex items-center gap-1.5 outline-none"
				onClick={onActivate}
			>
				<span>{tab.title}</span>
			</button>

			{/* Close button — only for closable tabs */}
			{tab.closable && (
				<button
					type="button"
					aria-label={`Close ${tab.title}`}
					className={cn(
						"flex size-4 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100",
						isActive && "opacity-60",
					)}
					onClick={(e) => {
						e.stopPropagation();
						onClose();
					}}
				>
					<XIcon className="size-3" />
				</button>
			)}

			{/* Dropdown context menu */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Tab options"
						className={cn(
							"flex size-4 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100",
							isActive && "opacity-60",
						)}
					>
						<MoreHorizontalIcon className="size-3" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{tab.closable && (
						<DropdownMenuItem onClick={onClose}>关闭标签页</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={onCloseOthers}>关闭其他</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={onCloseRight}>关闭右侧</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

export default function AppTabbar() {
	const { tabs, activeTab } = useStore(tabbarStore);
	const navigate = useNavigate();
	const router = useRouter();

	function handleActivate(path: string) {
		setActiveTab(path);
		navigate({ to: path });
	}

	function handleClose(path: string) {
		const nextPath = removeTab(path);
		navigate({ to: nextPath });
	}

	function handleCloseOthers(keepPath: string) {
		removeOtherTabs(keepPath);
		// After removing others, navigate to keepPath to sync activeTab
		navigate({ to: keepPath });
	}

	function handleCloseRight(fromPath: string) {
		removeRightTabs(fromPath);
		// Navigate to fromPath if active tab was removed
		const current = tabbarStore.state.activeTab;
		const stillExists = tabbarStore.state.tabs.some((t) => t.path === current);
		if (!stillExists) {
			navigate({ to: fromPath });
		}
	}

	function handleRefresh() {
		router.invalidate();
	}

	return (
		<div className="flex h-9 shrink-0 items-stretch border-b bg-background">
			{/* Scrollable tab list */}
			<div className="flex flex-1 items-stretch overflow-x-auto">
				{tabs.map((tab) => (
					<TabChip
						key={tab.path}
						tab={tab}
						isActive={tab.path === activeTab}
						onActivate={() => handleActivate(tab.path)}
						onClose={() => handleClose(tab.path)}
						onCloseOthers={() => handleCloseOthers(tab.path)}
						onCloseRight={() => handleCloseRight(tab.path)}
					/>
				))}
			</div>

			{/* Fixed refresh button */}
			<div className="flex shrink-0 items-center border-l px-2">
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					aria-label="Refresh current page"
					onClick={handleRefresh}
				>
					<RefreshCwIcon className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
