import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
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
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { reportError } from "#/lib/error-report";
import {
	APP_ERROR_MESSAGES,
	getZenStackHttpError,
	mapZenStackReasonToCode,
} from "#/lib/zenstack-error-map";
import { useZenStackQueries } from "#/zenstack/client";

export const Route = createFileRoute("/(admin)/roles/")({
	component: RolesPage,
});

const PAGE_SIZE = 10;

const roleFormSchema = z.object({
	name: z.string().trim().min(1, "Role name is required"),
	code: z
		.string()
		.trim()
		.min(1, "Role code is required")
		.regex(
			/^[a-z0-9-]+$/,
			"Role code must use lowercase letters, numbers, and '-'",
		),
	description: z.string().trim().optional(),
	status: z.enum(["ACTIVE", "DISABLED"]),
	order: z.number().int().min(0, "Order must be greater than or equal to 0"),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;
type RoleStatus = RoleFormValues["status"];

interface RoleListItem {
	id: number;
	name: string;
	code: string;
	description: string | null;
	status: string;
	order: number;
	createdAt: string | Date;
}

type FieldName = keyof RoleFormValues;

function getDefaultRoleValues(): RoleFormValues {
	return {
		name: "",
		code: "",
		description: "",
		status: "ACTIVE",
		order: 0,
	};
}

function formatFieldError(value: unknown): string | undefined {
	if (typeof value === "string") {
		return value;
	}
	if (
		value &&
		typeof value === "object" &&
		"message" in value &&
		typeof value.message === "string"
	) {
		return value.message;
	}
	return undefined;
}

function inferFieldErrors(
	message: string,
): Partial<Record<FieldName, string>> | null {
	const normalized = message.toLowerCase();
	const candidateMap: Array<[FieldName, RegExp[]]> = [
		["name", [/\bname\b/]],
		["code", [/\bcode\b/, /\bunique\b/]],
		["description", [/\bdescription\b/]],
		["status", [/\bstatus\b/]],
		["order", [/\border\b/]],
	];

	for (const [field, patterns] of candidateMap) {
		if (patterns.some((pattern) => pattern.test(normalized))) {
			return { [field]: message };
		}
	}

	return null;
}

function normalizeRoleFormInput(values: RoleFormValues) {
	const description = values.description?.trim();
	return {
		name: values.name.trim(),
		code: values.code.trim(),
		description: description ? description : null,
		status: values.status,
		order: values.order,
	};
}

function toRoleFormValues(role: RoleListItem): RoleFormValues {
	return {
		name: role.name,
		code: role.code,
		description: role.description ?? "",
		status: role.status === "DISABLED" ? "DISABLED" : "ACTIVE",
		order: role.order,
	};
}

function RolesPage() {
	const client = useZenStackQueries();
	const [page, setPage] = useState(1);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingRole, setEditingRole] = useState<RoleListItem | null>(null);
	const [deletingRole, setDeletingRole] = useState<RoleListItem | null>(null);
	const [serverFormError, setServerFormError] = useState<string | null>(null);
	const [serverFieldErrors, setServerFieldErrors] = useState<
		Partial<Record<FieldName, string>>
	>({});

	const rolesQuery = client.role.useFindMany({
		orderBy: [{ order: "asc" }, { createdAt: "desc" }],
		skip: (page - 1) * PAGE_SIZE,
		take: PAGE_SIZE,
	});
	const countQuery = client.role.useCount();
	const createRole = client.role.useCreate();
	const updateRole = client.role.useUpdate();
	const deleteRole = client.role.useDelete();

	const roles = useMemo(
		() => (rolesQuery.data ?? []) as RoleListItem[],
		[rolesQuery.data],
	);
	const totalCount = countQuery.data ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

	useEffect(() => {
		if (page > totalPages) {
			setPage(totalPages);
		}
	}, [page, totalPages]);

	function setServerValidation(error: unknown): boolean {
		const zenStackError = getZenStackHttpError(error);
		if (!zenStackError) {
			return false;
		}
		const mappedCode = mapZenStackReasonToCode(
			zenStackError.reason,
			zenStackError.dbErrorCode,
		);
		if (mappedCode !== "INPUT_VALIDATION_FAILED") {
			return false;
		}

		const message = zenStackError.message ?? APP_ERROR_MESSAGES[mappedCode];
		const inferred = inferFieldErrors(message);
		setServerFormError(inferred ? null : message);
		setServerFieldErrors(inferred ?? {});
		return true;
	}

	const form = useForm({
		defaultValues: getDefaultRoleValues(),
		validators: {
			onSubmit: roleFormSchema,
		},
		onSubmit: async ({ value }) => {
			setServerFormError(null);
			setServerFieldErrors({});

			try {
				const data = normalizeRoleFormInput(value);
				if (editingRole) {
					await updateRole.mutateAsync({
						where: { id: editingRole.id },
						data,
					});
				} else {
					await createRole.mutateAsync({ data });
				}
				setSheetOpen(false);
				setEditingRole(null);
			} catch (error) {
				if (setServerValidation(error)) {
					return;
				}
				reportError(error);
			}
		},
	});

	useEffect(() => {
		if (!sheetOpen) {
			return;
		}
		form.reset(
			editingRole ? toRoleFormValues(editingRole) : getDefaultRoleValues(),
		);
		setServerFormError(null);
		setServerFieldErrors({});
	}, [editingRole, form, sheetOpen]);

	async function handleDelete() {
		if (!deletingRole) {
			return;
		}
		try {
			await deleteRole.mutateAsync({
				where: { id: deletingRole.id },
			});
			setDeletingRole(null);
		} catch (error) {
			reportError(error);
		}
	}

	const isSubmitting = createRole.isPending || updateRole.isPending;

	return (
		<div className="space-y-4">
			<section className="rounded-2xl border border-[var(--line)] bg-[color-mix(in_oklab,var(--header-bg)_90%,#fff_10%)] p-4 sm:p-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-xs font-semibold tracking-[0.16em] text-[var(--sea-ink-soft)] uppercase">
							Role Management
						</p>
						<h2 className="mt-1 text-xl font-semibold text-[var(--sea-ink)]">
							Roles
						</h2>
						<p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
							ZenStack CRUD hooks with automatic cache invalidation.
						</p>
					</div>
					<Button
						onClick={() => {
							setEditingRole(null);
							setSheetOpen(true);
						}}
					>
						New role
					</Button>
				</div>
			</section>

			<section className="rounded-2xl border border-[var(--line)] bg-[var(--header-bg)]">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>ID</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Code</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Order</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{roles.map((role) => (
							<TableRow key={role.id}>
								<TableCell>{role.id}</TableCell>
								<TableCell>
									<div className="font-medium text-[var(--sea-ink)]">
										{role.name}
									</div>
									{role.description ? (
										<div className="text-xs text-[var(--sea-ink-soft)]">
											{role.description}
										</div>
									) : null}
								</TableCell>
								<TableCell>
									<code className="rounded bg-[var(--chip-bg)] px-2 py-1 text-xs">
										{role.code}
									</code>
								</TableCell>
								<TableCell>
									<span
										className={
											role.status === "ACTIVE"
												? "rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
												: "rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700"
										}
									>
										{role.status}
									</span>
								</TableCell>
								<TableCell>{role.order}</TableCell>
								<TableCell>
									{new Date(role.createdAt).toLocaleDateString()}
								</TableCell>
								<TableCell className="text-right">
									<div className="flex justify-end gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												setEditingRole(role);
												setSheetOpen(true);
											}}
										>
											Edit
										</Button>
										<Button
											size="sm"
											variant="destructive"
											onClick={() => setDeletingRole(role)}
										>
											Delete
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))}
						{!rolesQuery.isPending && roles.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={7}
									className="py-10 text-center text-sm text-[var(--sea-ink-soft)]"
								>
									No roles yet.
								</TableCell>
							</TableRow>
						) : null}
						{rolesQuery.isPending ? (
							<TableRow>
								<TableCell
									colSpan={7}
									className="py-10 text-center text-sm text-[var(--sea-ink-soft)]"
								>
									Loading roles...
								</TableCell>
							</TableRow>
						) : null}
					</TableBody>
				</Table>
				<div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-sm">
					<p className="text-[var(--sea-ink-soft)]">
						{totalCount} total • page {page} / {totalPages}
					</p>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage((prev) => Math.max(1, prev - 1))}
							disabled={page <= 1}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
							disabled={page >= totalPages}
						>
							Next
						</Button>
					</div>
				</div>
			</section>

			<Sheet
				open={sheetOpen}
				onOpenChange={(open) => {
					setSheetOpen(open);
					if (!open) {
						setEditingRole(null);
					}
				}}
			>
				<SheetContent className="w-full sm:max-w-lg">
					<SheetHeader>
						<SheetTitle>{editingRole ? "Edit role" : "Create role"}</SheetTitle>
						<SheetDescription>
							{editingRole
								? "Update role metadata and save."
								: "Create a new role in the RBAC model."}
						</SheetDescription>
					</SheetHeader>
					<form
						className="flex flex-1 flex-col gap-4 px-4 pb-4"
						onSubmit={(event) => {
							event.preventDefault();
							event.stopPropagation();
							form.handleSubmit();
						}}
					>
						{serverFormError ? (
							<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{serverFormError}
							</div>
						) : null}

						<form.Field name="name">
							{(field) => {
								const clientError = formatFieldError(
									field.state.meta.errors[0],
								);
								const error = serverFieldErrors.name ?? clientError;
								return (
									<div className="space-y-2">
										<Label htmlFor="role-name">Name</Label>
										<Input
											id="role-name"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="Role name"
										/>
										{error ? (
											<p className="text-xs text-destructive">{error}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						<form.Field name="code">
							{(field) => {
								const clientError = formatFieldError(
									field.state.meta.errors[0],
								);
								const error = serverFieldErrors.code ?? clientError;
								return (
									<div className="space-y-2">
										<Label htmlFor="role-code">Code</Label>
										<Input
											id="role-code"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="e.g. super-admin"
										/>
										{error ? (
											<p className="text-xs text-destructive">{error}</p>
										) : (
											<p className="text-xs text-[var(--sea-ink-soft)]">
												Use lowercase letters, numbers, and hyphen.
											</p>
										)}
									</div>
								);
							}}
						</form.Field>

						<form.Field name="description">
							{(field) => {
								const clientError = formatFieldError(
									field.state.meta.errors[0],
								);
								const error = serverFieldErrors.description ?? clientError;
								return (
									<div className="space-y-2">
										<Label htmlFor="role-description">Description</Label>
										<Input
											id="role-description"
											value={field.state.value ?? ""}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											placeholder="Optional description"
										/>
										{error ? (
											<p className="text-xs text-destructive">{error}</p>
										) : null}
									</div>
								);
							}}
						</form.Field>

						<div className="grid grid-cols-2 gap-3">
							<form.Field name="status">
								{(field) => {
									const clientError = formatFieldError(
										field.state.meta.errors[0],
									);
									const error = serverFieldErrors.status ?? clientError;
									return (
										<div className="space-y-2">
											<Label>Status</Label>
											<Select
												value={field.state.value}
												onValueChange={(value) =>
													field.handleChange(value as RoleStatus)
												}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select status" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="ACTIVE">ACTIVE</SelectItem>
													<SelectItem value="DISABLED">DISABLED</SelectItem>
												</SelectContent>
											</Select>
											{error ? (
												<p className="text-xs text-destructive">{error}</p>
											) : null}
										</div>
									);
								}}
							</form.Field>

							<form.Field name="order">
								{(field) => {
									const clientError = formatFieldError(
										field.state.meta.errors[0],
									);
									const error = serverFieldErrors.order ?? clientError;
									return (
										<div className="space-y-2">
											<Label htmlFor="role-order">Order</Label>
											<Input
												id="role-order"
												type="number"
												value={String(field.state.value)}
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(Number(event.target.value))
												}
												min={0}
											/>
											{error ? (
												<p className="text-xs text-destructive">{error}</p>
											) : null}
										</div>
									);
								}}
							</form.Field>
						</div>

						<SheetFooter className="px-0">
							<Button
								type="button"
								variant="outline"
								onClick={() => setSheetOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting
									? "Saving..."
									: editingRole
										? "Save changes"
										: "Create role"}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>

			<AlertDialog
				open={Boolean(deletingRole)}
				onOpenChange={(open) => {
					if (!open) {
						setDeletingRole(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete role</AlertDialogTitle>
						<AlertDialogDescription>
							{deletingRole
								? `Delete "${deletingRole.name}" (${deletingRole.code})? This action cannot be undone.`
								: "Delete this role?"}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setDeletingRole(null)}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							disabled={deleteRole.isPending}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleteRole.isPending ? "Deleting..." : "Delete role"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
