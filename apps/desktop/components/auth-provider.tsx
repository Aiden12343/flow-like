"use client";
import { listen } from "@tauri-apps/api/event";
import { getCurrent } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
	useBackend,
	useBackendStore,
	useInvalidateInfiniteInvoke,
	useInvalidateInvoke,
	useInvoke,
} from "@tm9657/flow-like-ui";
import type { IProfile } from "@tm9657/flow-like-ui";
import { Amplify } from "aws-amplify";
import {
	type AuthTokens,
	type TokenProvider,
	decodeJWT,
} from "aws-amplify/auth";
import {
	type INavigator,
	type IWindow,
	type NavigateParams,
	User,
	UserManager,
	type UserManagerSettings,
	WebStorageStateStore,
} from "oidc-client-ts";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "react-oidc-context";
import { get } from "../lib/api";
import { ProfileSyncer, TauriBackend } from "./tauri-provider";

const AUTH_CHANGED_EVENT = "fl-auth-changed";
const EMBED_SURFACE_ID = "bulltrackers-task-builder";
const AUTH_REQUEST_TIMEOUT_MS = 15_000;

type HostAuthPayload = {
	token: string;
	v4Base: string;
	apiBase?: string;
	apiBaseMain?: string;
	apiBaseTask?: string;
	hostOrigin?: string;
};

type SessionExchangeData = {
	accessToken: string;
	refreshToken: string;
	accessExpiresAt: string;
	refreshExpiresAt: string;
	identity?: {
		firebaseUid?: string;
		email?: string | null;
	};
};

type SessionEnvelope = {
	success?: boolean;
	error?: string;
	data?: SessionExchangeData;
};

function emitAuthChanged() {
	window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

const UserManagerContext = createContext<UserManager | null>(null);

export class OIDCTokenProvider implements TokenProvider {
	constructor(private readonly userManager: UserManager) {}
	async getTokens(options?: {
		forceRefresh?: boolean;
	}): Promise<AuthTokens | null> {
		console.warn("Getting tokens from OIDCTokenProvider...");
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

class TauriWindow implements IWindow {
	private abort: ((reason: Error) => void) | undefined;
	close() {
		return;
	}
	async navigate(params: NavigateParams): Promise<never> {
		openUrl(params.url);

		const promise = new Promise((resolve, reject) => {
			this.abort = reject;
		});

		return promise as Promise<never>;
	}
}

class TauriRedirectNavigator implements INavigator {
	async prepare(params: unknown): Promise<IWindow> {
		return new TauriWindow();
	}

	async callback(url: string, params?: unknown): Promise<void> {
		return;
	}
}

function isEmbeddedBulltrackersSurface(): boolean {
	if (typeof window === "undefined") return false;
	const params = new URLSearchParams(window.location.search);
	return params.get("surface") === EMBED_SURFACE_ID && window.parent !== window;
}

function getExpectedHostOrigin(): string | null {
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	const fromQuery = params.get("hostOrigin");
	if (fromQuery) {
		try {
			return new URL(fromQuery).origin;
		} catch {
			return null;
		}
	}
	if (document.referrer) {
		try {
			return new URL(document.referrer).origin;
		} catch {
			return null;
		}
	}
	return null;
}

async function requestHostAuth(expectedOrigin: string): Promise<HostAuthPayload> {
	return new Promise<HostAuthPayload>((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			window.removeEventListener("message", onMessage);
			reject(new Error("Timed out waiting for host auth response"));
		}, AUTH_REQUEST_TIMEOUT_MS);

		const onMessage = (event: MessageEvent) => {
			if (event.origin !== expectedOrigin) return;
			if (event.data?.type !== "AUTH_READY" || !event.data?.payload) return;

			const payload = event.data.payload as HostAuthPayload;
			if (!payload.token || !payload.v4Base) return;

			window.clearTimeout(timeout);
			window.removeEventListener("message", onMessage);
			resolve(payload);
		};

		window.addEventListener("message", onMessage);
		window.parent.postMessage({ type: "REQUEST_AUTH" }, expectedOrigin);
	});
}

async function exchangeSessionWithV4(
	v4Base: string,
	firebaseIdToken: string,
): Promise<SessionExchangeData> {
	const response = await fetch(`${v4Base}/auth/session`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ firebaseIdToken }),
	});

	const envelope = (await response.json().catch(() => ({}))) as SessionEnvelope;
	if (!response.ok || !envelope.success || !envelope.data) {
		throw new Error(envelope.error || `Session exchange failed (${response.status})`);
	}

	return envelope.data;
}

async function refreshSessionWithV4(
	v4Base: string,
	refreshToken: string,
): Promise<SessionExchangeData> {
	const response = await fetch(`${v4Base}/auth/refresh`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ refreshToken }),
	});

	const envelope = (await response.json().catch(() => ({}))) as SessionEnvelope;
	if (!response.ok || !envelope.success || !envelope.data) {
		throw new Error(envelope.error || `Session refresh failed (${response.status})`);
	}

	return envelope.data;
}

async function storeEmbeddedUser(
	userManager: UserManager,
	session: SessionExchangeData,
) {
	const expiresAtEpoch = Math.floor(new Date(session.accessExpiresAt).getTime() / 1000);
	const user = new User({
		access_token: session.accessToken,
		refresh_token: session.refreshToken,
		// Never persist the host Firebase token. We use the v4 session token as id_token placeholder.
		id_token: session.accessToken,
		token_type: "Bearer",
		scope: "openid profile email",
		expires_at: Number.isFinite(expiresAtEpoch) ? expiresAtEpoch : undefined,
		profile: {
			sub: session.identity?.firebaseUid || "embedded-user",
			email: session.identity?.email || undefined,
		} as any,
	});
	await userManager.storeUser(user);
	emitAuthChanged();
}

export function DesktopAuthProvider({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const [openIdAuthConfig, setOpenIdAuthConfig] =
		useState<UserManagerSettings>();
	const [userManager, setUserManager] = useState<UserManager>();
	const backend = useBackend();
	const backendInStore = useBackendStore((state) => state.backend);
	const embeddedMode =
		typeof window !== "undefined" && isEmbeddedBulltrackersSurface();
	const shouldLoadProfile = Boolean(backendInStore) && !embeddedMode;
	const currentProfile = useInvoke(
		async () => {
			if (!backendInStore) {
				throw new Error("Backend not ready");
			}
			return backendInStore.userState.getProfile();
		},
		null,
		[],
		shouldLoadProfile,
	);

	const hubUrl = currentProfile.data?.hub ?? "api.flow-like.com";
	const hubSecure = currentProfile.data?.secure ?? true;

	useEffect(() => {
		if (isEmbeddedBulltrackersSurface()) {
			let disposed = false;
			const expectedHostOrigin = getExpectedHostOrigin();
			if (!expectedHostOrigin) {
				console.error("[DesktopAuthProvider] Missing or invalid hostOrigin in embedded mode.");
				return;
			}

			const store = new WebStorageStateStore({
				store: sessionStorage,
			});

			const embeddedConfig: UserManagerSettings = {
				authority: expectedHostOrigin,
				client_id: "bulltrackers-embedded-shell",
				redirect_uri: `${window.location.origin}${window.location.pathname}`,
				post_logout_redirect_uri: `${window.location.origin}${window.location.pathname}`,
				response_type: "code",
				scope: "openid profile email",
				userStore: store,
				automaticSilentRenew: false,
				loadUserInfo: false,
				monitorSession: false,
				revokeTokensOnSignout: false,
			};
			const userManagerInstance = new UserManager(embeddedConfig);
			(embeddedConfig as any).userManager = userManagerInstance;

			let refreshTimer: ReturnType<typeof setInterval> | null = null;
			let currentV4Base = "";
			let currentRefreshToken = "";
			let currentIdentity: SessionExchangeData["identity"] | undefined;

			const refreshIfNeeded = async () => {
				if (!currentRefreshToken || !currentV4Base) return;
				const user = await userManagerInstance.getUser();
				if (!user?.expires_at) return;
				const expiresInMs = user.expires_at * 1000 - Date.now();
				if (expiresInMs > 60_000) return;

				const refreshed = await refreshSessionWithV4(currentV4Base, currentRefreshToken);
				currentRefreshToken = refreshed.refreshToken;
				currentIdentity = refreshed.identity || currentIdentity;
				await storeEmbeddedUser(userManagerInstance, {
					...refreshed,
					identity: currentIdentity,
				});
			};

			const bootstrapEmbedded = async () => {
				try {
					const payload = await requestHostAuth(expectedHostOrigin);
					if (disposed) return;

					currentV4Base = payload.v4Base;
					if (typeof window !== "undefined") {
						const apiBaseMain = payload.apiBaseMain ?? payload.apiBase;
						const apiBaseTask = payload.apiBaseTask ?? payload.v4Base;
						if (apiBaseMain) {
							(window as any).__FLOW_LIKE_API_BASE_MAIN__ = apiBaseMain;
						}
						if (apiBaseTask) {
							(window as any).__FLOW_LIKE_API_BASE_TASK__ = apiBaseTask;
						}
						if (apiBaseMain || apiBaseTask || payload.apiBase) {
							// Backward compatible fallback for older consumers.
							(window as any).__FLOW_LIKE_API_BASE__ =
								apiBaseTask ?? apiBaseMain ?? payload.apiBase;
						}
					}
					const session = await exchangeSessionWithV4(payload.v4Base, payload.token);
					if (disposed) return;

					currentRefreshToken = session.refreshToken;
					currentIdentity = session.identity;
					await storeEmbeddedUser(userManagerInstance, session);

					setUserManager(userManagerInstance);
					setOpenIdAuthConfig(embeddedConfig);

					refreshTimer = window.setInterval(() => {
						void refreshIfNeeded().catch(async (error) => {
							console.warn("[DesktopAuthProvider] Embedded session refresh failed:", error);
							try {
								await bootstrapEmbedded();
							} catch (bootstrapError) {
								console.error("[DesktopAuthProvider] Embedded auth re-bootstrap failed:", bootstrapError);
							}
						});
					}, 30_000);
				} catch (error) {
					console.error("[DesktopAuthProvider] Embedded auth bootstrap failed:", error);
				}
			};

			void bootstrapEmbedded();

			return () => {
				disposed = true;
				if (refreshTimer) {
					window.clearInterval(refreshTimer);
				}
			};
		}

		const effectiveProfile = {
			hub: hubUrl,
			secure: hubSecure,
			bits: [],
			created: new Date().toISOString(),
			updated: new Date().toISOString(),
			name: "default",
		} as IProfile;

		(async () => {
			try {
				const response = await get<any>(effectiveProfile, "auth/openid");
				if (response) {
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
					const navigator = new TauriRedirectNavigator();
					const userManagerInstance = new UserManager(response, navigator);
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
					console.log("[DESKTOPAUTH] Setting openIdAuthConfig and userManager");
					setUserManager(userManagerInstance);
					setOpenIdAuthConfig(response);
				} else {
					console.warn("OpenID response was falsy, not configuring auth");
				}
			} catch (error) {
				console.error("Failed to fetch OpenID config:", error);
			}
		})();
	}, [hubUrl, hubSecure]);

	useEffect(() => {
		if (!openIdAuthConfig) return;
		if (isEmbeddedBulltrackersSurface()) return;
		const seenUrls = new Set<string>();

		const normalizeTo = (target: string, source: string) => {
			try {
				const targetUrl = new URL(target);
				const sourceUrl = new URL(source);
				targetUrl.search = sourceUrl.search;
				targetUrl.hash = sourceUrl.hash;
				return targetUrl.toString();
			} catch {
				return source;
			}
		};

		const isUniversalAuthCallback = (rawUrl: string): boolean => {
			try {
				const parsed = new URL(rawUrl);
				if (!(parsed.protocol === "https:" || parsed.protocol === "http:")) {
					return false;
				}

				const host = parsed.hostname.toLowerCase();
				if (
					host !== "app.flow-like.com" &&
					host !== "flow-like.com" &&
					host !== "localhost" &&
					host !== "127.0.0.1"
				) {
					return false;
				}

				const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
				return path === "callback" || path === "desktop/callback";
			} catch {
				return false;
			}
		};

		const isUniversalLogoutCallback = (rawUrl: string): boolean => {
			try {
				const parsed = new URL(rawUrl);
				if (!(parsed.protocol === "https:" || parsed.protocol === "http:")) {
					return false;
				}

				const host = parsed.hostname.toLowerCase();
				if (
					host !== "app.flow-like.com" &&
					host !== "flow-like.com" &&
					host !== "localhost" &&
					host !== "127.0.0.1"
				) {
					return false;
				}

				const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
				return path === "logout" || path === "desktop/logout";
			} catch {
				return false;
			}
		};

		const closeOidcFlowWindows = async () => {
			try {
				const { getAllWindows } = await import("@tauri-apps/api/window");
				const windows = await getAllWindows();
				for (const window of windows) {
					if (window.label === "oidcFlow") {
						window.close();
					}
				}
			} catch {
				// Window API not available on mobile — no-op since mobile uses system browser
			}
		};

		const handleIncomingOidcUrl = async (rawUrl: string) => {
			if (!rawUrl || seenUrls.has(rawUrl)) return;
			seenUrls.add(rawUrl);

			try {
				const isDeepLink = rawUrl.startsWith("flow-like://");
				const signinUrl =
					isDeepLink || isUniversalAuthCallback(rawUrl)
						? normalizeTo(openIdAuthConfig.redirect_uri, rawUrl)
						: rawUrl;
				const logoutUrl =
					openIdAuthConfig.post_logout_redirect_uri &&
					(isDeepLink || isUniversalLogoutCallback(rawUrl))
						? normalizeTo(openIdAuthConfig.post_logout_redirect_uri, rawUrl)
						: rawUrl;

				console.log("[OIDC] Processing callback URL:", {
					rawUrl,
					signinUrl,
					logoutUrl,
				});

				if (signinUrl.startsWith(openIdAuthConfig.redirect_uri)) {
					await userManager?.signinRedirectCallback(signinUrl);
					emitAuthChanged();
					await closeOidcFlowWindows();
				}

				if (
					openIdAuthConfig.post_logout_redirect_uri &&
					logoutUrl.startsWith(openIdAuthConfig.post_logout_redirect_uri)
				) {
					emitAuthChanged();
					await closeOidcFlowWindows();
				}

				if (signinUrl.includes("/login?id_token_hint=")) {
					await closeOidcFlowWindows();
				}
			} catch (error) {
				seenUrls.delete(rawUrl);
				console.error("Failed to process OIDC callback URL:", rawUrl, error);
			}
		};

		const processStartupDeepLinks = async () => {
			try {
				const startupUrls = await getCurrent();
				if (!startupUrls || startupUrls.length === 0) {
					return;
				}

				for (const startupUrl of startupUrls) {
					await handleIncomingOidcUrl(startupUrl);
				}
			} catch (error) {
				console.warn("Failed to process startup deep links for OIDC:", error);
			}
		};

		async function debugListener(event: Event) {
			const url = (event as CustomEvent<{ url?: string }>).detail?.url;
			if (!url) return;
			console.log("Debug OIDC URL:", url);
			await handleIncomingOidcUrl(url);
		}

		window.addEventListener("debug-oidc", debugListener);

		const unlisten = listen<{ url: string }>("oidc/url", async (event) => {
			await handleIncomingOidcUrl(event.payload.url);
		});

		void processStartupDeepLinks();

		return () => {
			unlisten.then((unsub) => unsub());
			window.removeEventListener("debug-oidc", debugListener);
		};
	}, [userManager, openIdAuthConfig]);

	if (!openIdAuthConfig)
		return <AuthProvider key="loading-auth-config">{children}</AuthProvider>;

	return (
		<UserManagerContext.Provider value={userManager ?? null}>
			<AuthProvider
				key={openIdAuthConfig.client_id}
				{...openIdAuthConfig}
			>
				<AuthInner>{children}</AuthInner>
			</AuthProvider>
		</UserManagerContext.Provider>
	);
}

function AuthInner({ children }: Readonly<{ children: React.ReactNode }>) {
	const auth = useAuth();
	const backend = useBackend();
	const invalidate = useInvalidateInvoke();
	const invalidateInfinite = useInvalidateInfiniteInvoke();
	const userManager = useContext(UserManagerContext);

	// auth.events belongs to the AuthProvider's internal UserManager (captured
	// via useState on mount). userManager from context may be a newer instance
	// created after a profile refetch. We must fire userLoaded on the
	// AuthProvider's instance so react-oidc-context picks up the change.
	const authEventsRef = useRef(auth?.events);
	useEffect(() => {
		authEventsRef.current = auth?.events;
	});

	useEffect(() => {
		const onAuthChanged = async () => {
			if (!userManager) return;
			try {
				const user = await userManager.getUser();
				if (user && !user.expired) {
					console.log(
						"[AuthInner] fl-auth-changed: reloading user into context",
					);
					const events = authEventsRef.current;
					if (events) {
						await events.load(user);
					}
				}
			} catch (err) {
				console.warn("[AuthInner] Failed to reload user on auth change:", err);
			}
		};

		window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
		return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
	}, [userManager]);
	useEffect(() => {
		if (!auth) return;
		if (!auth.isAuthenticated) {
			return;
		}

		if (!auth.user?.id_token) {
			console.warn("User is authenticated but no ID token found.");
			return;
		}

		if (
			backend &&
			typeof (backend as any).pushAuthContext === "function"
		) {
			console.log("Pushing auth context to backend:", auth);
			(backend as any).pushAuthContext(auth);
		}
	}, [auth?.isAuthenticated, auth?.user?.id_token, backend]);

	useEffect(() => {
		if (!auth?.isAuthenticated || !backend) return;
		if (backend instanceof TauriBackend) return;
		if (typeof (backend as any).pushProfile !== "function") return;

		(async () => {
			try {
				const profile = await backend.userState.getProfile();
				if (profile) {
					(backend as any).pushProfile(profile);
				}
			} catch (error) {
				console.warn("[AuthInner] Failed to push profile to backend:", error);
			}
		})();
	}, [auth?.isAuthenticated, auth?.user?.profile?.sub, backend]);

	useEffect(() => {
		if (isEmbeddedBulltrackersSurface()) {
			return;
		}
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

	useEffect(() => {
		if (!(backend instanceof TauriBackend)) return;

		(async () => {
			// Ensure user record exists in DB before profile operations
			await invalidate(backend.userState.getInfo, []);

			void Promise.allSettled([
				invalidate(backend.userState.getNotifications, []),
				invalidateInfinite(backend.userState.listNotifications, [false]),
				invalidateInfinite(backend.teamState.getInvites, []),
				invalidate(backend.userState.getProfile, []),
				invalidate(backend.userState.getSettingsProfile, []),
				invalidate(backend.userState.getProfiles, []),
				invalidate(backend.appState.getApps, []),
			]);
		})();
	}, [
		backend,
		auth?.isAuthenticated,
		auth?.user?.profile?.sub,
		invalidate,
		invalidateInfinite,
	]);

	return (
		<>
			{backend instanceof TauriBackend && (
				<ProfileSyncer
					auth={{
						isAuthenticated: auth.isAuthenticated,
						accessToken: auth.user?.access_token,
					}}
				/>
			)}
			{children}
		</>
	);
}
