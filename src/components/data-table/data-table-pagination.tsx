import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";

interface DataTablePaginationProps {
	page: number;
	pageSize: number;
	total: number;
	pageSizes?: number[];
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
}

export function DataTablePagination({
	page,
	pageSize,
	total,
	pageSizes = [10, 20, 50, 100],
	onPageChange,
	onPageSizeChange,
}: DataTablePaginationProps) {
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	return (
		<div className="flex items-center justify-between border-t px-4 py-3">
			<p className="text-sm text-muted-foreground">共 {total} 条</p>
			<div className="flex items-center gap-3">
				<Select
					value={String(pageSize)}
					onValueChange={(v) => onPageSizeChange(Number(v))}
				>
					<SelectTrigger className="h-8 w-[110px] text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{pageSizes.map((s) => (
							<SelectItem key={s} value={String(s)}>
								{s} 条/页
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<span className="text-sm text-muted-foreground whitespace-nowrap">
					第 {page} / {totalPages} 页
				</span>

				<div className="flex items-center gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						disabled={page <= 1}
						onClick={() => onPageChange(1)}
						aria-label="第一页"
					>
						<ChevronsLeft className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={page <= 1}
						onClick={() => onPageChange(page - 1)}
						aria-label="上一页"
					>
						<ChevronLeft className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={page >= totalPages}
						onClick={() => onPageChange(page + 1)}
						aria-label="下一页"
					>
						<ChevronRight className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={page >= totalPages}
						onClick={() => onPageChange(totalPages)}
						aria-label="最后一页"
					>
						<ChevronsRight className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
