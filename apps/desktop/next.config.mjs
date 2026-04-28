"use client";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
/** @type {import('next').NextConfig} */
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../..");
const isDev = process.env.NODE_ENV !== "production";

const nextConfig = {
	output: "export",
	pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
	images: {
		unoptimized: true,
	},
	transpilePackages: ["@tm9657/flow-like-ui", "@flow-like/dexie-tauri-blob-offload", "tauri-plugin-remote-push-api"],
	staticPageGenerationTimeout: 120,
	reactCompiler: true,
	experimental: {
		serverComponentsHmrCache: true,
		webpackMemoryOptimizations: true,
		preloadEntriesOnStart: false,
		turbopackFileSystemCacheForDev: false,
	},
	turbopack: {
		root: monorepoRoot,
	},
	devIndicators: {
		appIsrStatus: false,
	},
	env: {
		SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING: "1",
	},
	webpack: (config, { dev }) => {
		// Avoid ENOSPC crashes from persistent webpack cache writes in local dev.
		if (dev) {
			config.cache = false;
		}
		return config;
	},
};

const sentryNextConfig = withSentryConfig(nextConfig, {
	org: "good-code",
	project: "flow-like-desktop",

	// An auth token is required for uploading source maps.
	authToken: process.env.SENTRY_AUTH_TOKEN,

	silent: false, // Can be used to suppress logs
});

export default isDev ? nextConfig : sentryNextConfig;
