import type { QueryClient } from "@tanstack/react-query";
import type { IProfile } from "@tm9657/flow-like-ui";
import type { AuthContextProps } from "react-oidc-context";

export interface WebBackendRef {
	profile?: IProfile;
	auth?: AuthContextProps;
	queryClient?: QueryClient;
}

type ApiTarget = "main" | "task";

type ApiBases = {
	main: string;
	task: string;
};

const MAIN_API_PREFIXES = [
	"auth/",
	"user/",
	"profile",
	"billing/",
];

function normalizeBase(base: string): string {
	return base.endsWith("/") ? base.slice(0, -1) : base;
}

function getApiBases(): ApiBases {
	const queryParams =
		typeof window !== "undefined"
			? new URLSearchParams(window.location.search)
			: null;

	const queryMain = queryParams?.get("apiBaseMain") ?? undefined;
	const queryTask = queryParams?.get("apiBaseTask") ?? undefined;
	const queryLegacy = queryParams?.get("apiBase") ?? undefined;

	const runtimeGlobals =
		typeof globalThis !== "undefined"
			? (globalThis as {
					__FLOW_LIKE_API_BASE_MAIN__?: string;
					__FLOW_LIKE_API_BASE_TASK__?: string;
					__FLOW_LIKE_API_BASE__?: string;
				})
			: undefined;

	const runtimeMain = runtimeGlobals?.__FLOW_LIKE_API_BASE_MAIN__;
	const runtimeTask = runtimeGlobals?.__FLOW_LIKE_API_BASE_TASK__;
	const runtimeLegacy = runtimeGlobals?.__FLOW_LIKE_API_BASE__;

	const envMain = process.env.NEXT_PUBLIC_API_URL;
	const envTask = process.env.NEXT_PUBLIC_FLOWLIKE_TASK_API_URL;
	const envLegacy = process.env.NEXT_PUBLIC_FLOWLIKE_API_URL;
	const hardDefault = "https://api.flow-like.com";

	const mainBase = normalizeBase(
		queryMain || runtimeMain || queryLegacy || runtimeLegacy || envMain || envLegacy || hardDefault,
	);
	const taskBase = normalizeBase(
		queryTask || runtimeTask || queryLegacy || runtimeLegacy || envTask || envLegacy || envMain || hardDefault,
	);

	return {
		main: mainBase,
		task: taskBase,
	};
}

export function getApiBaseUrl(): string {
	// Backward-compatible default for older callsites that expect a single base.
	return getApiBases().task;
}

function getPreferredTarget(path: string): ApiTarget {
	const normalizedPath = path.replace(/^\/+/, "").toLowerCase();
	if (MAIN_API_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
		return "main";
	}
	return "task";
}

export function constructApiUrl(path: string, target: ApiTarget): string {
	const bases = getApiBases();
	return `${bases[target]}/api/v1/${path.replace(/^\/+/, "")}`;
}

function jsonStringify(value: unknown): string {
	return JSON.stringify(value, (_key, v) =>
		typeof v === "bigint" ? Number(v) : v,
	);
}

export async function apiFetch<T>(
	path: string,
	options?: RequestInit,
	auth?: AuthContextProps,
): Promise<T> {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};

	if (auth?.user?.access_token) {
		headers["Authorization"] = `Bearer ${auth.user.access_token}`;
	}

	const preferredTarget = getPreferredTarget(path);
	const fallbackTarget: ApiTarget = preferredTarget === "main" ? "task" : "main";
	const requestInit: RequestInit = {
		...options,
		headers: {
			...headers,
			...options?.headers,
		},
	};

	let response = await fetch(constructApiUrl(path, preferredTarget), requestInit);
	// If a route group is misclassified or not deployed on the preferred API yet,
	// try the alternate API base once before failing.
	if (!response.ok && response.status === 404) {
		response = await fetch(constructApiUrl(path, fallbackTarget), requestInit);
	}

	if (!response.ok) {
		if (response.status === 401 && auth?.isAuthenticated) {
			auth.startSilentRenew();
		}
		const errorText = await response.text();
		console.error(`API error ${response.status} for ${path}:`, errorText);
		throw new Error(`API error: ${response.status}`);
	}

	const text = await response.text();
	if (!text) return undefined as T;

	try {
		return JSON.parse(text) as T;
	} catch {
		return text as T;
	}
}

export async function apiGet<T>(
	path: string,
	auth?: AuthContextProps,
): Promise<T> {
	return apiFetch<T>(path, { method: "GET" }, auth);
}

export async function apiPost<T>(
	path: string,
	body?: unknown,
	auth?: AuthContextProps,
): Promise<T> {
	return apiFetch<T>(
		path,
		{
			method: "POST",
			body: body ? jsonStringify(body) : undefined,
		},
		auth,
	);
}

export async function apiPut<T>(
	path: string,
	body?: unknown,
	auth?: AuthContextProps,
): Promise<T> {
	return apiFetch<T>(
		path,
		{
			method: "PUT",
			body: body ? jsonStringify(body) : undefined,
		},
		auth,
	);
}

export async function apiPatch<T>(
	path: string,
	body?: unknown,
	auth?: AuthContextProps,
): Promise<T> {
	return apiFetch<T>(
		path,
		{
			method: "PATCH",
			body: body ? jsonStringify(body) : undefined,
		},
		auth,
	);
}

export async function apiDelete<T>(
	path: string,
	auth?: AuthContextProps,
	body?: unknown,
): Promise<T> {
	return apiFetch<T>(
		path,
		{
			method: "DELETE",
			...(body
				? {
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(body),
					}
				: {}),
		},
		auth,
	);
}
