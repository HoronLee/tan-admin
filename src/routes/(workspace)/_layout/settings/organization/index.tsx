import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import imageCompression from "browser-image-compression";
import { TrashIcon, UploadIcon } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { env } from "#/env";
import { authClient } from "#/lib/auth/client";
import { translateAuthError } from "#/lib/auth/errors";
import { requireOrgMemberRole } from "#/lib/auth/guards";
import * as m from "#/paraglide/messages";

export const Route = createFileRoute(
	"/(workspace)/_layout/settings/organization/",
)({
	beforeLoad: async () => {
		await requireOrgMemberRole({ data: { allowed: ["admin", "owner"] } });
	},
	component: OrganizationSettingsPage,
});

type PlanOption = "free" | "pro" | "enterprise";
const PLAN_OPTIONS: PlanOption[] = ["free", "pro", "enterprise"];

// R7: 压缩目标 ≤ ~200KB。data-url 会比原始二进制大 ~33%（base64），因此
// compression 目标定得略低（0.15MB），保留余量。
const MAX_LOGO_BYTES = 200 * 1024;
const COMPRESSION_OPTIONS = {
	maxSizeMB: 0.15,
	maxWidthOrHeight: 512,
	useWebWorker: true,
} as const;

interface OrgSettingsForm {
	name: string;
	slug: string;
	logo: string;
	plan: PlanOption;
	industry: string;
	billingEmail: string;
}

interface FormErrors {
	name?: string;
	logo?: string;
	billingEmail?: string;
}

/**
 * BA `getFullOrganization` 返回的 org 是原始表行，additionalFields 通过
 * `inferOrgAdditionalFields` 在 authClient 层已 TS 化。运行时字段可能缺席
 * （旧数据迁移前），统一走 `?? default`。
 */
interface FullOrgShape {
	id: string;
	name: string;
	slug: string;
	logo?: string | null;
	plan?: string | null;
	industry?: string | null;
	billingEmail?: string | null;
	members?: unknown[];
}

function OrganizationSettingsPage() {
	const { data: activeOrg, isPending: orgPending } =
		authClient.useActiveOrganization();

	if (orgPending) {
		return (
			<div className="text-sm text-muted-foreground">{m.common_loading()}</div>
		);
	}

	if (!activeOrg) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{m.org_settings_no_active_title()}</CardTitle>
					<CardDescription>{m.org_settings_no_active_desc()}</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	// key prop 保证切换组织时表单完全重建，避免脏状态渗透
	return <OrganizationSettingsForm key={activeOrg.id} orgId={activeOrg.id} />;
}

function OrganizationSettingsForm({ orgId }: { orgId: string }) {
	const queryClient = useQueryClient();

	const {
		data: fullOrg,
		isPending: fullOrgPending,
		refetch: refetchOrg,
	} = useQuery({
		queryKey: ["organization", "full", orgId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.getFullOrganization(
				{ query: { organizationId: orgId } },
			);
			if (error) throw new Error(error.message);
			return data as unknown as FullOrgShape;
		},
	});

	const [form, setForm] = useState<OrgSettingsForm>({
		name: "",
		slug: "",
		logo: "",
		plan: "free",
		industry: "",
		billingEmail: "",
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [uploading, setUploading] = useState(false);
	const [dissolveOpen, setDissolveOpen] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const navigate = useNavigate();

	useEffect(() => {
		if (!fullOrg) return;
		setForm({
			name: fullOrg.name ?? "",
			slug: fullOrg.slug ?? "",
			logo: fullOrg.logo ?? "",
			plan: (fullOrg.plan as PlanOption | undefined) ?? "free",
			industry: fullOrg.industry ?? "",
			billingEmail: fullOrg.billingEmail ?? "",
		});
		setErrors({});
	}, [fullOrg]);

	const memberCount = fullOrg?.members?.length ?? 0;

	const saveMutation = useMutation({
		mutationFn: async (data: OrgSettingsForm) => {
			// slug 在 UI 层已 readOnly，这里也不传到 PATCH 请求体，
			// 避免任何 "相同值也触发 server-side slug diff 检查" 的边界。
			// 服务端 `beforeUpdateOrganization` 是第二道兜底。
			const { error } = await authClient.organization.update({
				organizationId: orgId,
				data: {
					name: data.name,
					logo: data.logo,
					// additionalFields — TS types flow via inferOrgAdditionalFields
					plan: data.plan,
					industry: data.industry,
					billingEmail: data.billingEmail,
				},
			});
			if (error) throw new Error(translateAuthError(error));
		},
		onSuccess: () => {
			toast.success(m.org_settings_saved());
			queryClient.invalidateQueries({
				queryKey: ["organization", "full", orgId],
			});
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	const dissolveMutation = useMutation({
		mutationFn: async () => {
			const { error } = await authClient.organization.delete({
				organizationId: orgId,
			});
			if (error) throw new Error(translateAuthError(error));
		},
		onSuccess: () => {
			toast.success(m.org_settings_dissolved_toast());
			setDissolveOpen(false);
			queryClient.invalidateQueries({ queryKey: ["organization"] });
			navigate({ to: "/dashboard" });
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});

	function validate(data: OrgSettingsForm): FormErrors {
		const next: FormErrors = {};
		if (data.name.trim().length < 2) {
			next.name = m.org_settings_error_name_min();
		}
		// slug is readOnly in the UI and never submitted; skip slug validation.
		if (data.logo && data.logo.length > MAX_LOGO_BYTES) {
			next.logo = m.org_settings_logo_error_too_large();
		}
		if (data.billingEmail.trim().length > 0) {
			// 最小邮箱格式校验；详细校验交给后端/zod
			if (!/.+@.+\..+/.test(data.billingEmail)) {
				next.billingEmail = m.org_settings_error_email_invalid();
			}
		}
		return next;
	}

	async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;

		setUploading(true);
		setErrors((prev) => ({ ...prev, logo: undefined }));
		try {
			const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
			const dataUrl = await imageCompression.getDataUrlFromFile(compressed);
			if (dataUrl.length > MAX_LOGO_BYTES) {
				setErrors((prev) => ({
					...prev,
					logo: m.org_settings_logo_error_too_large(),
				}));
				return;
			}
			setForm((prev) => ({ ...prev, logo: dataUrl }));
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: m.org_settings_logo_error_process();
			setErrors((prev) => ({ ...prev, logo: msg }));
		} finally {
			setUploading(false);
			// 清空 input 以允许选择同一文件
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	}

	function handleLogoClear() {
		setForm((prev) => ({ ...prev, logo: "" }));
		setErrors((prev) => ({ ...prev, logo: undefined }));
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const nextErrors = validate(form);
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return;
		saveMutation.mutate(form);
	}

	// 解散按钮门控：私有部署模式永远禁用；最后一个成员禁用
	const isPrivateMode = env.VITE_PRODUCT_MODE === "private";
	const isSoloMember = memberCount <= 1;
	const dissolveDisabled = isPrivateMode || isSoloMember;
	const dissolveDisabledReason = isPrivateMode
		? m.org_settings_dissolve_blocked_single()
		: isSoloMember
			? m.org_settings_dissolve_blocked_solo()
			: null;

	if (fullOrgPending) {
		return (
			<div className="text-sm text-muted-foreground">
				{m.org_settings_loading_info()}
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6">
			<form onSubmit={handleSubmit} className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>{m.org_settings_section_basic_title()}</CardTitle>
						<CardDescription>
							{m.org_settings_section_basic_desc()}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="org-name">{m.org_settings_field_name()}</Label>
							<Input
								id="org-name"
								value={form.name}
								onChange={(e) =>
									setForm((prev) => ({ ...prev, name: e.target.value }))
								}
								required
								minLength={2}
								aria-invalid={errors.name ? true : undefined}
							/>
							{errors.name && (
								<p className="text-sm text-destructive">{errors.name}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="org-slug">{m.org_settings_field_slug()}</Label>
							<Input
								id="org-slug"
								value={form.slug}
								readOnly
								disabled
								placeholder="my-org"
							/>
							<p className="text-xs text-muted-foreground">
								{m.organization_slug_readonly_hint()}
							</p>
						</div>

						<div className="space-y-2">
							<Label>{m.org_settings_logo_label()}</Label>
							<div className="flex items-start gap-4">
								<div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
									{form.logo ? (
										// data-url 或 URL 浏览器都认；<img> 直接渲染
										<img
											src={form.logo}
											alt={m.org_settings_logo_preview_alt()}
											className="size-full object-cover"
										/>
									) : (
										<span className="text-xs text-muted-foreground">
											{m.org_settings_logo_no()}
										</span>
									)}
								</div>
								<div className="flex flex-col gap-2">
									<div className="flex gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={uploading}
											onClick={() => fileInputRef.current?.click()}
										>
											<UploadIcon className="size-4" />
											{uploading
												? m.common_processing()
												: m.org_settings_logo_upload()}
										</Button>
										{form.logo && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={handleLogoClear}
												disabled={uploading}
											>
												<TrashIcon className="size-4" />
												{m.common_clear()}
											</Button>
										)}
									</div>
									<p className="text-xs text-muted-foreground">
										{m.org_settings_logo_hint()}
									</p>
									<input
										ref={fileInputRef}
										type="file"
										accept="image/*"
										className="hidden"
										onChange={handleLogoChange}
									/>
								</div>
							</div>
							{errors.logo && (
								<p className="text-sm text-destructive">{errors.logo}</p>
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{m.org_settings_section_profile_title()}</CardTitle>
						<CardDescription>
							{m.org_settings_section_profile_desc()}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="org-plan">{m.org_settings_field_plan()}</Label>
							<Select
								value={form.plan}
								onValueChange={(v) =>
									setForm((prev) => ({ ...prev, plan: v as PlanOption }))
								}
							>
								<SelectTrigger id="org-plan">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PLAN_OPTIONS.map((p) => (
										<SelectItem key={p} value={p}>
											{p}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="org-industry">
								{m.org_settings_field_industry()}
							</Label>
							<Input
								id="org-industry"
								value={form.industry}
								onChange={(e) =>
									setForm((prev) => ({ ...prev, industry: e.target.value }))
								}
								placeholder={m.org_settings_industry_placeholder()}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="org-billing-email">
								{m.org_settings_field_billing_email()}
							</Label>
							<Input
								id="org-billing-email"
								type="email"
								value={form.billingEmail}
								onChange={(e) =>
									setForm((prev) => ({ ...prev, billingEmail: e.target.value }))
								}
								placeholder={m.org_settings_billing_email_placeholder()}
								aria-invalid={errors.billingEmail ? true : undefined}
							/>
							{errors.billingEmail && (
								<p className="text-sm text-destructive">
									{errors.billingEmail}
								</p>
							)}
						</div>
					</CardContent>
				</Card>

				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => refetchOrg()}
						disabled={saveMutation.isPending}
					>
						{m.common_reset()}
					</Button>
					<Button type="submit" disabled={saveMutation.isPending || uploading}>
						{saveMutation.isPending
							? m.common_saving()
							: m.org_settings_save_submit()}
					</Button>
				</div>
			</form>

			{/* 危险操作区 */}
			<Card className="border-destructive/50">
				<CardHeader>
					<CardTitle className="text-destructive">
						{m.org_settings_danger_title()}
					</CardTitle>
					<CardDescription>{m.org_settings_danger_desc()}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="font-medium">{m.org_settings_dissolve_action()}</p>
							<p className="text-sm text-muted-foreground">
								{m.org_settings_dissolve_desc()}
							</p>
							{dissolveDisabledReason && (
								<p className="mt-1 text-xs text-muted-foreground">
									{dissolveDisabledReason}
								</p>
							)}
						</div>
						<Button
							type="button"
							variant="destructive"
							disabled={dissolveDisabled}
							onClick={() => setDissolveOpen(true)}
							title={dissolveDisabledReason ?? undefined}
						>
							{m.org_settings_dissolve_action()}
						</Button>
					</div>
				</CardContent>
			</Card>

			<ConfirmDialog
				open={dissolveOpen}
				onOpenChange={setDissolveOpen}
				title={m.org_settings_dissolve_confirm_title()}
				description={
					<>
						{m.org_settings_dissolve_desc()}{" "}
						<span className="font-medium text-foreground">
							{form.name || fullOrg?.name}
						</span>
					</>
				}
				confirmText={m.org_settings_dissolve_confirm_action()}
				confirming={dissolveMutation.isPending}
				requireTypedConfirm={form.slug || fullOrg?.slug}
				onConfirm={() => dissolveMutation.mutate()}
			/>
		</div>
	);
}
