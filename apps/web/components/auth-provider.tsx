"use client";

import { LoadingScreen, useBackend } from "@tm9657/flow-like-ui";
import type { IProfile } from "@tm9657/flow-like-ui";
import { Amplify } from "aws-amplify";
import {
	type AuthTokens,
	type TokenProvider,
	decodeJWT,
} from "aws-amplify/auth";
import { usePathname } from "next/navigation";
import {
	UserManager,
	type UserManagerSettings,
	WebStorageStateStore,
} from "oidc-client-ts";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "react-oidc-context";
import { get } from "../lib/api";
import { SignInRequired } from "./sign-in-required";
import { WebBackend } from "./web-provider";

const PUBLIC_PATHS = [
	"/thirdparty/callback",
	"/store",
	"/store/explore",
];

const DEFAULT_PROFILE: IProfile = {
	name: "default",
	bits: [],
	created: new Date().toISOString(),
	updated: new Date().toISOString(),
	hub: process.env.NEXT_PUBLIC_API_URL || "https://api.flow-like.com",
};

export class OIDCTokenProvider implements TokenProvider {
	constructor(private readonly userManager: UserManager) {}
	async getTokens(options?: {
		forceRefresh?: boolean;
	}): Promise<AuthTokens | null> {
		const user = await this.userManager.getUser();
		if (!user?.access_token || !user?.id_token) {
			return null;
		}

		const accessToken = decodeJWT(user.access_token);
		const idToken = decodeJWT(user.id_token);

		return {
			accessToken: accessToken,
			idToken: idToken,
		};
	}
}

// ---------------------------------------------------------------------------
// Embedded auth bridge — used when Flow-Like is loaded inside an iframe
// from the Bulltrackers web2.0 shell. The parent window sends a Firebase
// ID token via postMessage; we inject it as a fake OIDC auth context so
// the rest of the app works unchanged.
// ---------------------------------------------------------------------------

function isEmbedded(): boolean {
	if (typeof window === "undefined") return false;
	const params = new URLSearchParams(window.location.search);
	return params.get("surface") === "bulltrackers-task-builder";
}

function EmbeddedAuthBridge({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const backend = useBackend();
	const [ready, setReady] = useState(false);

	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			if (event.data?.type !== "AUTH_READY") return;
			const { token, apiBaseMain, apiBaseTask } =
				event.data.payload ?? {};
			if (!token) return;

			// Build a minimal auth-shaped object so WebBackend can set the
			// Authorization: Bearer header on all API calls.
			const fakeAuth = {
				isAuthenticated: true,
				isLoading: false,
				user: {
					access_token: token,
					id_token: token,
					profile: { sub: "embedded" },
					expired: false,
				},
				signinRedirect: () => Promise.resolve(),
				signinSilent: () => Promise.resolve(null),
				signoutRedirect: () => Promise.resolve(),
				startSilentRenew: () => {},
				activeNavigator: undefined,
			} as unknown as import("react-oidc-context").AuthContextProps;

			if (backend instanceof WebBackend) {
				backend.pushAuthContext(fakeAuth);
				backend.pushProfile({
					...DEFAULT_PROFILE,
					hub: apiBaseMain || apiBaseTask || DEFAULT_PROFILE.hub,
				});
			}
			setReady(true);
		}

		window.addEventListener("message", handleMessage);

		// Immediately ask the parent for a token
		if (window.parent !== window) {
			const params = new URLSearchParams(window.location.search);
			const hostOrigin = params.get("hostOrigin") || "*";
			window.parent.postMessage({ type: "REQUEST_AUTH" }, hostOrigin);
		}

		return () => window.removeEventListener("message", handleMessage);
	}, [backend]);

	if (!ready) {
		return <LoadingScreen progress={80} />;
	}

	return (
		<AuthProvider
			authority="https://noop.invalid"
			client_id="embedded-noop"
			redirect_uri="https://noop.invalid"
		>
			{children}
		</AuthProvider>
	);
}

// ---------------------------------------------------------------------------
// Main auth provider — OIDC flow for standalone, embedded bridge for iframe
// ---------------------------------------------------------------------------

export function WebAuthProvider({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	// In embedded mode (inside web2.0 iframe), bypass OIDC entirely
	if (isEmbedded()) {
		return <EmbeddedAuthBridge>{children}</EmbeddedAuthBridge>;
	}

	const [openIdAuthConfig, setOpenIdAuthConfig] =
		useState<UserManagerSettings>();
	const [userManager, setUserManager] = useState<UserManager>();
	const [loadingProgress, setLoadingProgress] = useState(10);
	const [authConfigError, setAuthConfigError] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			setLoadingProgress(30);
			let response: any;
			try {
				response = await get<any>(DEFAULT_PROFILE, "auth/openid");
			} catch (error) {
				console.error("Failed to load OpenID configuration:", error);
				setAuthConfigError(
					"Flow-Like could not reach the auth configuration endpoint.",
				);
				setLoadingProgress(100);
				return;
			}
			if (!response) {
				setAuthConfigError(
					"Flow-Like auth is unavailable. Check the devkit API deployment or local API proxy.",
				);
				setLoadingProgress(100);
				return;
			}
			if (response) {
				setLoadingProgress(60);
				if (process.env.NEXT_PUBLIC_REDIRECT_URL)
					response.redirect_uri = process.env.NEXT_PUBLIC_REDIRECT_URL;
				if (process.env.NEXT_PUBLIC_REDIRECT_LOGOUT_URL)
					response.post_logout_redirect_uri =
						process.env.NEXT_PUBLIC_REDIRECT_LOGOUT_URL;
				const store = new WebStorageStateStore({
					store: localStorage,
				});
				response.userStore = store;
				response.automaticSilentRenew = true;
				const userManagerInstance = new UserManager(response);
				response.userManager = userManagerInstance;
				const tokenProvider = new OIDCTokenProvider(userManagerInstance);
				if (response.cognito)
					Amplify.configure(
						{
							Auth: {
								Cognito: {
									userPoolClientId: response.client_id,
									userPoolId: response.cognito.user_pool_id,
								},
							},
						},
						{
							Auth: {
								tokenProvider: tokenProvider,
							},
						},
					);
				setLoadingProgress(90);
				setUserManager(userManagerInstance);
				setOpenIdAuthConfig(response);
			}
		})();
	}, []);

	if (authConfigError) {
		return <AuthConfigError message={authConfigError} />;
	}

	if (!openIdAuthConfig) {
		return <LoadingScreen progress={loadingProgress} />;
	}

	return (
		<AuthProvider
			key={openIdAuthConfig.client_id}
			{...openIdAuthConfig}
			automaticSilentRenew={true}
			userStore={
				new WebStorageStateStore({
					store: localStorage,
				})
			}
		>
			<AuthInner>{children}</AuthInner>
		</AuthProvider>
	);
}

function AuthConfigError({ message }: Readonly<{ message: string }>) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6 text-foreground">
			<div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-lg">
				<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Flow-Like startup blocked
				</p>
				<h1 className="mt-3 text-2xl font-semibold">Auth API unavailable</h1>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">
					{message}
				</p>
				<p className="mt-4 rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
					/api/v1/auth/openid
				</p>
				<button
					type="button"
					className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
					onClick={() => window.location.reload()}
				>
					Retry
				</button>
			</div>
		</div>
	);
}

const AUTH_CHANNEL = "flow-like-auth";

function AuthInner({ children }: Readonly<{ children: React.ReactNode }>) {
	const auth = useAuth();
	const backend = useBackend();
	const pathname = usePathname();
	const [profileLoaded, setProfileLoaded] = useState(false);
	const [authPushed, setAuthPushed] = useState(false);

	const isPublicPath = PUBLIC_PATHS.some((path) => pathname?.startsWith(path));

	// Listen for auth changes from other tabs
	useEffect(() => {
		let channel: BroadcastChannel | null = null;

		const handleAuthMessage = async (event: MessageEvent) => {
			if (event.data?.type === "AUTH_SUCCESS" && !auth.isAuthenticated) {
				try {
					await auth.signinSilent();
				} catch {
					window.location.reload();
				}
			}
		};

		// Fallback for browsers without BroadcastChannel
		const handleStorageChange = async (event: StorageEvent) => {
			if (event.key?.includes("oidc.") && !auth.isAuthenticated) {
				try {
					await auth.signinSilent();
				} catch {
					window.location.reload();
				}
			}
		};

		try {
			channel = new BroadcastChannel(AUTH_CHANNEL);
			channel.addEventListener("message", handleAuthMessage);
		} catch {
			// BroadcastChannel not supported, use storage events as fallback
			window.addEventListener("storage", handleStorageChange);
		}

		return () => {
			if (channel) {
				channel.removeEventListener("message", handleAuthMessage);
				channel.close();
			} else {
				window.removeEventListener("storage", handleStorageChange);
			}
		};
	}, [auth]);

	// Push auth context to backend (always, so unsigned users can trigger signinRedirect)
	useEffect(() => {
		if (!auth) return;

		if (backend instanceof WebBackend) {
			backend.pushAuthContext(auth);
		}

		if (!auth.isAuthenticated) {
			setAuthPushed(false);
			return;
		}

		if (!auth.user?.id_token) {
			console.warn("User is authenticated but no ID token found.");
			return;
		}

		setAuthPushed(true);
	}, [
		auth?.isAuthenticated,
		auth?.isLoading,
		auth?.user?.id_token,
		auth?.activeNavigator,
		backend,
	]);

	// Ensure user exists in DB, then fetch and push profile
	useEffect(() => {
		if (
			!authPushed ||
			!auth?.isAuthenticated ||
			!auth?.user?.access_token ||
			!backend
		) {
			return;
		}

		let cancelled = false;

		(async () => {
			const MAX_RETRIES = 5;
			const BASE_DELAY = 500;

			for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
				if (cancelled) return;

				try {
					await backend.userState.getInfo();
					break;
				} catch (error) {
					if (attempt === MAX_RETRIES) {
						console.error(
							"Failed to ensure user exists after retries:",
							error,
						);
					} else {
						const delay = BASE_DELAY * 2 ** attempt;
						await new Promise((r) => setTimeout(r, delay));
					}
				}
			}

			if (cancelled) return;

			try {
				const profile = await backend.userState.getProfile();
				if (profile && backend instanceof WebBackend) {
					backend.pushProfile(profile);
					setProfileLoaded(true);
				}
			} catch (error) {
				console.error("Failed to fetch profile:", error);
				if (backend instanceof WebBackend) {
					backend.pushProfile(DEFAULT_PROFILE);
					setProfileLoaded(true);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [authPushed, auth?.isAuthenticated, auth?.user?.access_token, backend]);

	useEffect(() => {
		if (!auth) return;

		(async () => {
			try {
				const existingUser = auth.user;

				if (existingUser && !existingUser.expired) {
					return;
				}

				if (existingUser?.expired) {
					try {
						const user = await auth?.signinSilent();
						if (!user) {
							console.warn(
								"Silent login returned no user, attempting redirect login.",
							);
							await auth?.signinRedirect();
						}
					} catch (silentError) {
						console.warn(
							"Silent login failed, attempting normal login:",
							silentError,
						);

						try {
							await auth?.signinRedirect();
						} catch (redirectError) {
							console.error(
								"Both silent and redirect login failed:",
								redirectError,
							);
						}
					}
				}
			} catch (error) {
				console.error("Login process failed:", error);
			}
		})();
	}, [auth.user?.profile?.sub]);

	// Show loading state while auth is initializing
	if (auth.isLoading && !isPublicPath) {
		return <LoadingScreen progress={95} />;
	}

	// Show loading state while redirecting to sign-in
	if (!auth.isAuthenticated && auth.activeNavigator && !isPublicPath) {
		return <LoadingScreen progress={98} />;
	}

	// Show sign-in required screen when not authenticated (skip for public paths)
	if (!auth.isAuthenticated && !isPublicPath) {
		if (typeof window !== "undefined" && pathname) {
			const returnUrl = window.location.pathname + window.location.search;
			if (returnUrl && returnUrl !== "/") {
				// Use both storages: localStorage survives cross-context mobile
				// redirects, sessionStorage is the fallback
				try {
					localStorage.setItem("flow-like-return-url", returnUrl);
				} catch {}
				sessionStorage.setItem("flow-like-return-url", returnUrl);
			}
		}
		return <SignInRequired />;
	}

	// Show loading while profile is being fetched (skip for public paths)
	if (!profileLoaded && !isPublicPath) {
		return <LoadingScreen progress={99} />;
	}

	return <>{children}</>;
}
