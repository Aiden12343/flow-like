import "./globals.css";
import type { Viewport } from "next";

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
		<html lang="en" suppressHydrationWarning suppressContentEditableWarning className="dark">
			<body className="m-0 p-0 h-dvh w-dvw flex flex-col overflow-hidden">
				{children}
			</body>
		</html>
	);
}
