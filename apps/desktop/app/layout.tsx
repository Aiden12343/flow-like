import "@tm9657/flow-like-ui/global.css";
import { Inter } from "next/font/google";
import ClientShell from "./client-shell";

const inter = Inter({ subsets: ["latin"], preload: true });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-desktop-app="true"
      suppressHydrationWarning
      suppressContentEditableWarning
      className="min-h-screen"
    >
      <body className={inter.className} data-desktop-app="true">
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
