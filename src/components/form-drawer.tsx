import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet";
import * as m from "#/paraglide/messages";

type DrawerWidth = "sm" | "md" | "lg";

const widthClass: Record<DrawerWidth, string> = {
	sm: "sm:max-w-md",
	md: "sm:max-w-lg",
	lg: "sm:max-w-2xl",
};

interface FormDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	children: ReactNode;
	onSubmit?: () => void | Promise<void>;
	submitText?: string;
	submitting?: boolean;
	side?: "left" | "right";
	width?: DrawerWidth;
}

export function FormDrawer({
	open,
	onOpenChange,
	title,
	description,
	children,
	onSubmit,
	submitText,
	submitting = false,
	side = "right",
	width = "md",
}: FormDrawerProps) {
	const resolvedSubmit = submitText ?? m.common_save();
	async function handleSubmit() {
		await onSubmit?.();
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side={side}
				className={`flex flex-col gap-0 p-0 ${widthClass[width]}`}
				aria-describedby={description ? undefined : "form-drawer-desc"}
			>
				<SheetHeader className="px-6 py-4">
					<SheetTitle>{title}</SheetTitle>
					{description && <SheetDescription>{description}</SheetDescription>}
					{!description && (
						<SheetDescription id="form-drawer-desc" className="sr-only">
							{title}
						</SheetDescription>
					)}
				</SheetHeader>
				<Separator />
				<div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
				<Separator />
				<SheetFooter className="flex-row justify-end gap-2 px-6 py-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						{m.common_cancel()}
					</Button>
					{onSubmit && (
						<Button type="button" onClick={handleSubmit} disabled={submitting}>
							{submitting ? m.common_submitting() : resolvedSubmit}
						</Button>
					)}
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
