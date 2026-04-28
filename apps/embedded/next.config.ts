"use client";

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "export",
	basePath: "/flow-like",
	assetPrefix: "/flow-like/",
	pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
	outputFileTracingRoot: "C:/Users/aiden/Desktop/code_projects/bulltrackers-flow-like",
	images: {
		unoptimized: true,
	},
	experimental: {
		webpackBuildWorker: false,
		workerThreads: false,
		cpus: 1,
	},
	staticPageGenerationTimeout: 120,
	devIndicators: {
		appIsrStatus: false,
	},
	webpack: (config) => {
		config.cache = false;
		return config;
	},
};

export default nextConfig;
