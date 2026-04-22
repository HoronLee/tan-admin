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
import * as m from "#/paraglide/messages";

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
	title,
	description,
	confirmText,
	cancelText,
	variant = "destructive",
	onConfirm,
	confirming = false,
	requireTypedConfirm,
}: ConfirmDialogProps) {
	const resolvedTitle = title ?? m.confirm_dialog_default_title();
	const resolvedConfirm = confirmText ?? m.confirm_dialog_default_confirm();
	const resolvedCancel = cancelText ?? m.common_cancel();
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
					<AlertDialogTitle>{resolvedTitle}</AlertDialogTitle>
					{description && (
						<AlertDialogDescription>{description}</AlertDialogDescription>
					)}
				</AlertDialogHeader>

				{needsTypedConfirm && (
					<div className="py-2">
						<p className="mb-2 text-sm text-muted-foreground">
							{m.confirm_dialog_typed_hint_before()}{" "}
							<span className="font-medium text-foreground">
								{requireTypedConfirm}
							</span>{" "}
							{m.confirm_dialog_typed_hint_after()}
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
						{resolvedCancel}
					</AlertDialogCancel>
					<AlertDialogAction
						variant={variant}
						onClick={handleConfirm}
						disabled={!canConfirm || confirming}
					>
						{confirming ? m.common_processing() : resolvedConfirm}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
