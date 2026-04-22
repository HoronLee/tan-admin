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
import * as m from "#/paraglide/messages";

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
			<p className="text-sm text-muted-foreground">
				{m.pagination_total({ total })}
			</p>
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
								{m.pagination_page_size({ size: s })}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<span className="text-sm text-muted-foreground whitespace-nowrap">
					{m.pagination_page_indicator({ page, total: totalPages })}
				</span>

				<div className="flex items-center gap-1">
					<Button
						variant="outline"
						size="icon-sm"
						disabled={page <= 1}
						onClick={() => onPageChange(1)}
						aria-label={m.pagination_first_page()}
					>
						<ChevronsLeft className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={page <= 1}
						onClick={() => onPageChange(page - 1)}
						aria-label={m.pagination_prev_page()}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={page >= totalPages}
						onClick={() => onPageChange(page + 1)}
						aria-label={m.pagination_next_page()}
					>
						<ChevronRight className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						disabled={page >= totalPages}
						onClick={() => onPageChange(totalPages)}
						aria-label={m.pagination_last_page()}
					>
						<ChevronsRight className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
