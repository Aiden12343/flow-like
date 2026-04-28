type RequestErrorHandler = (...args: unknown[]) => void;

const sentryEnabled = process.env.NEXT_PUBLIC_SENTRY_ENABLED === "true";

export async function register() {
	if (!sentryEnabled) return;

	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("./sentry.server.config");
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("./sentry.edge.config");
	}
}

export const onRequestError: RequestErrorHandler = async (...args) => {
	if (!sentryEnabled) return;
	const Sentry = await import("@sentry/nextjs");
	Sentry.captureRequestError(...(args as Parameters<typeof Sentry.captureRequestError>));
};
