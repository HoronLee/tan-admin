import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

type Theme = NonNullable<ToasterProps["theme"]>;

function readHtmlTheme(): Theme {
	if (typeof document === "undefined") {
		return "system";
	}
	const root = document.documentElement;
	if (root.classList.contains("dark")) return "dark";
	if (root.classList.contains("light")) return "light";
	return "system";
}

function useHtmlTheme(): Theme {
	const [theme, setTheme] = useState<Theme>("system");

	useEffect(() => {
		setTheme(readHtmlTheme());
		const observer = new MutationObserver(() => setTheme(readHtmlTheme()));
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => observer.disconnect();
	}, []);

	return theme;
}

const Toaster = ({ ...props }: ToasterProps) => {
	const theme = useHtmlTheme();

	return (
		<Sonner
			theme={theme}
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
