"use client";

import { useEffect } from "react";

const EMBED_SURFACE_ID = "bulltrackers-task-builder";

function toAbsoluteUrl(input: string | URL | null | undefined): URL | null {
	if (!input) return null;
	try {
		if (input instanceof URL) return new URL(input.toString(), window.location.href);
		return new URL(input, window.location.href);
	} catch {
		return null;
	}
}

export function EmbedQueryPersistence() {
	useEffect(() => {
		const current = new URL(window.location.href);
		if (current.searchParams.get("surface") !== EMBED_SURFACE_ID) {
			return;
		}

		const preservedKeys = ["surface", "hostOrigin"] as const;
		const preserved = new URLSearchParams();
		for (const key of preservedKeys) {
			const value = current.searchParams.get(key);
			if (value) preserved.set(key, value);
		}

		if (!preserved.get("surface")) {
			preserved.set("surface", EMBED_SURFACE_ID);
		}

		const ensureEmbedParams = (candidate: string | URL | null | undefined): string | URL | null | undefined => {
			const absolute = toAbsoluteUrl(candidate);
			if (!absolute || absolute.origin !== window.location.origin) {
				return candidate;
			}
			for (const [key, value] of preserved.entries()) {
				if (!absolute.searchParams.has(key)) {
					absolute.searchParams.set(key, value);
				}
			}
			return `${absolute.pathname}${absolute.search}${absolute.hash}`;
		};

		const originalPushState = window.history.pushState.bind(window.history);
		const originalReplaceState = window.history.replaceState.bind(window.history);

		window.history.pushState = function pushState(data, unused, url) {
			return originalPushState(data, unused, ensureEmbedParams(url) as string | URL | null);
		};

		window.history.replaceState = function replaceState(data, unused, url) {
			return originalReplaceState(data, unused, ensureEmbedParams(url) as string | URL | null);
		};

		const normalized = ensureEmbedParams(window.location.href);
		if (typeof normalized === "string") {
			const target = new URL(normalized, window.location.origin);
			const expected = `${target.pathname}${target.search}${target.hash}`;
			const actual = `${window.location.pathname}${window.location.search}${window.location.hash}`;
			if (expected !== actual) {
				originalReplaceState(window.history.state, "", expected);
			}
		}

		return () => {
			window.history.pushState = originalPushState;
			window.history.replaceState = originalReplaceState;
		};
	}, []);

	return null;
}

