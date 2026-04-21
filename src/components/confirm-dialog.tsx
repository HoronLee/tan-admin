import { type ReactNode, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Input } from "#/components/ui/input";

interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	description?: ReactNode;
	confirmText?: string;
	cancelText?: string;
	variant?: "default" | "destructive";
	onConfirm: () => void | Promise<void>;
	confirming?: boolean;
	requireTypedConfirm?: string;
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title = "确认删除",
	description,
	confirmText = "确认删除",
	cancelText = "取消",
	variant = "destructive",
	onConfirm,
	confirming = false,
	requireTypedConfirm,
}: ConfirmDialogProps) {
	const [inputValue, setInputValue] = useState("");

	const needsTypedConfirm = requireTypedConfirm !== undefined;
	const canConfirm = !needsTypedConfirm || inputValue === requireTypedConfirm;

	function handleOpenChange(next: boolean) {
		if (!next) {
			setInputValue("");
		}
		onOpenChange(next);
	}

	async function handleConfirm() {
		if (!canConfirm || confirming) return;
		await onConfirm();
		setInputValue("");
	}

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description && (
						<AlertDialogDescription>{description}</AlertDialogDescription>
					)}
				</AlertDialogHeader>

				{needsTypedConfirm && (
					<div className="py-2">
						<p className="mb-2 text-sm text-muted-foreground">
							请输入{" "}
							<span className="font-medium text-foreground">
								{requireTypedConfirm}
							</span>{" "}
							以确认
						</p>
						<Input
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							placeholder={requireTypedConfirm}
							autoComplete="off"
						/>
					</div>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={confirming}>
						{cancelText}
					</AlertDialogCancel>
					<AlertDialogAction
						variant={variant}
						onClick={handleConfirm}
						disabled={!canConfirm || confirming}
					>
						{confirming ? "处理中..." : confirmText}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
