import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const upstreamApiUrl = (
	process.env.FLOWLIKE_UPSTREAM_API_URL ||
	process.env.NEXT_PUBLIC_FLOWLIKE_TASK_API_URL ||
	process.env.NEXT_PUBLIC_API_URL ||
	"https://api.flow-like.com"
).replace(/\/+$/, "");
/** @param {string} phase */
function createNextConfig(phase) {
	const isDev = phase === PHASE_DEVELOPMENT_SERVER;

	/** @type {import('next').NextConfig} */
	const nextConfig = {
		reactStrictMode: false,
		...(isDev ? {} : { output: "export" }),
		pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
		reactCompiler: true,
		images: {
			unoptimized: true,
		},
		transpilePackages: ["@tm9657/flow-like-ui"],
		experimental: {
			serverComponentsHmrCache: true,
			webpackMemoryOptimizations: true,
			preloadEntriesOnStart: false,
			turbopackFileSystemCacheForDev: true,
		},
		turbopack: {
			root: repoRoot,
		},
		...(isDev
			? {
					async rewrites() {
						return [
							{
								source: "/api/v1/:path*",
								destination: `${upstreamApiUrl}/api/v1/:path*`,
							},
						];
					},
				}
			: {}),
		webpack: (config) => {
			config.resolve.fallback = {
				...config.resolve.fallback,
				fs: false,
				net: false,
				tls: false,
			};
			return config;
		},
	};

	return withSentryConfig(nextConfig, {
		// For all available options, see:
		// https://www.npmjs.com/package/@sentry/webpack-plugin#options

		org: "good-code",

		project: "flow-like-web-app",

		// Only print logs for uploading source maps in CI
		silent: !process.env.CI,

		// For all available options, see:
		// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

		// Upload a larger set of source maps for prettier stack traces (increases build time)
		widenClientFileUpload: true,

		// Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
		// This can increase your server load as well as your hosting bill.
		// Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
		// side errors will fail.
		// tunnelRoute: "/monitoring",

		webpack: {
			// Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
			// See the following for more information:
			// https://docs.sentry.io/product/crons/
			// https://vercel.com/docs/cron-jobs
			automaticVercelMonitors: true,

			// Tree-shaking options for reducing bundle size
			treeshake: {
				// Automatically tree-shake Sentry logger statements to reduce bundle size
				removeDebugLogging: true,
			},
		},
	});
}

export default createNextConfig;
