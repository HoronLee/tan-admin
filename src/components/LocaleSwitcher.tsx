// LocaleSwitcher — shadcn DropdownMenu variant.
//
// Uses Paraglide v2 runtime. Strategy `["cookie", "preferredLanguage", "baseLocale"]`
// means `setLocale` writes the PARAGLIDE_LOCALE cookie and the default
// `reload: true` triggers a full page reload so SSR picks up the new locale
// on the next render (no hydration mismatch).
//
// Refs:
// - https://inlang.com/m/gerre34r/library-inlang-paraglideJs/basics (setLocale reload behavior)
// - https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide

import { Check, Globe } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { m } from "#/paraglide/messages";
import {
	getLocale,
	type Locale,
	locales,
	setLocale,
} from "#/paraglide/runtime";

const LABEL_GETTERS: Record<string, () => string> = {
	zh: m.locale_zh,
	en: m.locale_en,
};

function getLocaleLabel(locale: Locale): string {
	const getter = LABEL_GETTERS[locale];
	if (getter) {
		const label = getter();
		if (label) return label;
	}
	return locale.toUpperCase();
}

export default function LocaleSwitcher() {
	const current = getLocale();
	const label = m.locale_switcher_label() || "Switch language";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label={label}>
					<Globe className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{locales.map((locale) => (
					<DropdownMenuItem
						key={locale}
						onSelect={() => setLocale(locale)}
						className="justify-between gap-4"
					>
						<span>{getLocaleLabel(locale)}</span>
						{locale === current && <Check className="size-4" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
