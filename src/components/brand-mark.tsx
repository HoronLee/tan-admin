import { brandConfig } from "#/config/brand";
import { cn } from "#/lib/utils";

type BrandMarkSize = "sm" | "md" | "lg";

interface BrandMarkProps {
	/** Render size. `sm` = 20px, `md` = 24px, `lg` = 32px. */
	size?: BrandMarkSize;
	/** When true, always render the brand name next to the logo. */
	showName?: boolean;
	/** Additional className forwarded to the outer wrapper. */
	className?: string;
	/**
	 * Override the name shown. Defaults to `brandConfig.name`.
	 * Useful for meta contexts (page titles) where the global brand
	 * should be suffixed with e.g. a section label.
	 */
	name?: string;
}

const SIZE_CLASSES: Record<BrandMarkSize, { img: string; text: string }> = {
	sm: { img: "h-5 w-5", text: "text-sm" },
	md: { img: "h-6 w-6", text: "text-base" },
	lg: { img: "h-8 w-8", text: "text-lg" },
};

/**
 * Single entry point for brand rendering (logo + name). Reads
 * `brandConfig` so ops can swap the brand via `VITE_BRAND_*` env
 * without touching code.
 *
 * Behavior:
 * - `logoURL` set → render `<img>` (+ `<picture>` with light/dark `<source>`
 *   when `logoDarkURL` is also set).
 * - `logoURL` unset → render brand name `<span>` (no image).
 *
 * See spec/frontend/theming.md § Brand integration.
 */
export function BrandMark({
	size = "md",
	showName = true,
	className,
	name,
}: BrandMarkProps) {
	const { logoURL, logoDarkURL } = brandConfig;
	const brandName = name ?? brandConfig.name;
	const sizeClass = SIZE_CLASSES[size];

	if (!logoURL) {
		return (
			<span
				className={cn("font-semibold", sizeClass.text, className)}
				data-slot="brand-mark"
			>
				{brandName}
			</span>
		);
	}

	const logoNode = logoDarkURL ? (
		<picture>
			<source media="(prefers-color-scheme: dark)" srcSet={logoDarkURL} />
			<img
				src={logoURL}
				alt={brandName}
				className={cn(sizeClass.img, "object-contain")}
			/>
		</picture>
	) : (
		<img
			src={logoURL}
			alt={brandName}
			className={cn(sizeClass.img, "object-contain")}
		/>
	);

	return (
		<span
			className={cn("inline-flex items-center gap-2", className)}
			data-slot="brand-mark"
		>
			{logoNode}
			{showName ? (
				<span className={cn("font-semibold", sizeClass.text)}>{brandName}</span>
			) : null}
		</span>
	);
}

export default BrandMark;
