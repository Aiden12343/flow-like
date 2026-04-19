import "./globals.css";
import type { Viewport } from "next";

import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
	interactiveWidget: "overlays-content",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning suppressContentEditableWarning>
			<body className={inter.className}>{children}</body>
		</html>
	);
}
