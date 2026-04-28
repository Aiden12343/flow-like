import type { Config } from "tailwindcss";

const config = {
	content: [
		"./app/**/*.{js,jsx,ts,tsx,md,mdx}",
		"./components/**/*.{js,jsx,ts,tsx}",
		"../../packages/ui/components/**/*.{js,jsx,ts,tsx}",
		"../../packages/ui/hooks/**/*.{js,jsx,ts,tsx}",
		"../../packages/ui/plugins/**/*.{js,jsx,ts,tsx}",
	],
	theme: {
		extend: {},
	},
	plugins: [],
} satisfies Config;

export default config;
