import type { ColumnDef } from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Skeleton } from "#/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { DataTablePagination } from "./data-table-pagination";

interface PaginationProps {
	page: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
}

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	loading?: boolean;
	pagination?: PaginationProps;
	emptyText?: string;
	rowKey?: (row: TData) => string | number;
}

export function DataTable<TData, TValue>({
	columns,
	data,
	loading = false,
	pagination,
	emptyText = "暂无数据",
	rowKey,
}: DataTableProps<TData, TValue>) {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="rounded-md border bg-card">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="hover:bg-transparent">
							{headerGroup.headers.map((header) => (
								<TableHead key={header.id}>
									{header.isPlaceholder
										? null
										: flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{loading ? (
						Array.from({ length: 5 }, (_, i) => `skeleton-row-${i}`).map(
							(skeletonKey) => (
								<TableRow key={skeletonKey}>
									{columns.map((col) => {
										const colId =
											typeof col.id === "string"
												? col.id
												: String(columns.indexOf(col));
										return (
											<TableCell key={`${skeletonKey}-${colId}`}>
												<Skeleton className="h-5 w-full" />
											</TableCell>
										);
									})}
								</TableRow>
							),
						)
					) : table.getRowModel().rows.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={columns.length}
								className="h-24 text-center text-muted-foreground"
							>
								{emptyText}
							</TableCell>
						</TableRow>
					) : (
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={rowKey ? rowKey(row.original) : row.id}
								data-state={row.getIsSelected() ? "selected" : undefined}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			{pagination && (
				<DataTablePagination
					page={pagination.page}
					pageSize={pagination.pageSize}
					total={pagination.total}
					onPageChange={pagination.onPageChange}
					onPageSizeChange={pagination.onPageSizeChange}
				/>
			)}
		</div>
	);
}
