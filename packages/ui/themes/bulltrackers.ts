import { loadTheme, type ITheme } from "../lib/theme";

export const bulltrackersTheme: ITheme = {
	id: "bulltrackers",
	light: {},
	dark: {
		background: "48 10% 5%",
		foreground: "0 0% 92%",
		card: "42 11% 8%",
		cardForeground: "0 0% 92%",
		popover: "42 11% 8%",
		popoverForeground: "0 0% 92%",
		primary: "84 44% 64%",
		primaryForeground: "48 10% 5%",
		secondary: "40 10% 12%",
		secondaryForeground: "0 0% 85%",
		tertiary: "76 13% 23%",
		tertiaryForeground: "0 0% 92%",
		muted: "40 10% 12%",
		mutedForeground: "0 0% 58%",
		accent: "84 44% 64%",
		accentForeground: "48 10% 5%",
		destructive: "0 62% 44%",
		destructiveForeground: "0 0% 96%",
		border: "76 13% 23%",
		input: "40 10% 12%",
		ring: "84 44% 64%",
		sidebar: "42 11% 7%",
		sidebarForeground: "0 0% 85%",
		sidebarPrimary: "84 44% 64%",
		sidebarPrimaryForeground: "48 10% 5%",
		sidebarAccent: "40 10% 12%",
		sidebarAccentForeground: "0 0% 92%",
		sidebarBorder: "76 13% 23%",
		sidebarRing: "84 44% 64%",
		fontSans: "\"Segoe UI\", \"Inter\", sans-serif",
		fontMono: "\"JetBrains Mono\", \"Fira Code\", monospace",
		radius: "0.875rem",
		shadow: "0 25px 50px -12px rgb(0 0 0 / 0.55)",
		shadowMd: "0 12px 24px -10px rgb(0 0 0 / 0.48)",
		shadowLg: "0 20px 40px -12px rgb(0 0 0 / 0.55)",
	},
};

export function applyBulltrackersTheme(): void {
	loadTheme(bulltrackersTheme);
	if (typeof document === "undefined") return;
	document.documentElement.classList.add("dark");
	document.documentElement.dataset.theme = "dark";
}
