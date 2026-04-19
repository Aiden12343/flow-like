"use client";

/** @type {import('next').NextConfig} */
const nextConfig = {
	pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
	images: {
		unoptimized: true,
	},
	staticPageGenerationTimeout: 120,
	devIndicators: {
		appIsrStatus: false,
	},
};

export default nextConfig;
