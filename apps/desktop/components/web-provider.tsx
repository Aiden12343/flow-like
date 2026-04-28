"use client";

import type { QueryClient } from "@tanstack/react-query";
import {
	type IApiKeyState,
	type IApiState,
	type IAppRouteState,
	type IAppState,
	type IBackendState,
	type IBitState,
	type IBoardState,
	type ICapabilities,
	type IDatabaseState,
	type IEventState,
	type IGenericCommand,
	type IHelperState,
	type IPageState,
	type IProfile,
	type IRegistryState,
	type IRoleState,
	type ISalesState,
	type ISinkState,
	type IStorageState,
	type ITeamState,
	type ITemplateState,
	type IUsageState,
	type IUserState,
	type IWidgetState,
	LoadingScreen,
	useBackendStore,
	useQueryClient,
} from "@tm9657/flow-like-ui";
import type { ICommandSync } from "@tm9657/flow-like-ui/lib";
import type { IAIState } from "@tm9657/flow-like-ui/state/backend-state/ai-state";
import type { IAnalyticsState } from "@tm9657/flow-like-ui/state/backend-state/analytics-state";
import { useEffect } from "react";
import type { AuthContextProps } from "react-oidc-context";
import {
	WebAIState,
	WebApiKeyState,
	WebApiState,
	WebAppState,
	WebBitState,
	WebBoardState,
	WebDatabaseState,
	WebEventState,
	WebHelperState,
	WebPageState,
	WebRegistryState,
	WebRoleState,
	WebRouteState,
	WebSinkState,
	WebStorageState,
	WebTeamState,
	WebTemplateState,
	WebUsageState,
	WebUserState,
	WebWidgetState,
} from "../../web/lib/web-states";
import { WebSalesState } from "../../web/lib/web-states/sales-state";
import { WebAnalyticsState } from "../../web/lib/web-states/analytics-state";
import type { WebBackendRef } from "../../web/lib/web-states/api-utils";

export class WebBackend implements IBackendState {
	appState: IAppState;
	apiState: IApiState;
	apiKeyState: IApiKeyState;
	bitState: IBitState;
	boardState: IBoardState;
	eventState: IEventState;
	helperState: IHelperState;
	roleState: IRoleState;
	routeState: IAppRouteState;
	storageState: IStorageState;
	teamState: ITeamState;
	templateState: ITemplateState;
	userState: IUserState;
	aiState: IAIState;
	dbState: IDatabaseState;
	widgetState: IWidgetState;
	pageState: IPageState;
	registryState: IRegistryState;
	sinkState: ISinkState;
	salesState: ISalesState;
	usageState: IUsageState;
	analyticsState: IAnalyticsState;

	private backendRef: WebBackendRef;

	constructor(
		public readonly backgroundTaskHandler: (task: Promise<any>) => void,
		public queryClient?: QueryClient,
		public auth?: AuthContextProps,
		public profile?: IProfile,
	) {
		this.backendRef = { profile, auth, queryClient };

		this.apiState = new WebApiState(this.backendRef);
		this.apiKeyState = new WebApiKeyState(this.backendRef);
		this.appState = new WebAppState(this.backendRef);
		this.bitState = new WebBitState(this.backendRef);
		this.boardState = new WebBoardState(this.backendRef);
		this.eventState = new WebEventState(this.backendRef);
		this.helperState = new WebHelperState(this.backendRef);
		this.roleState = new WebRoleState(this.backendRef);
		this.routeState = new WebRouteState(this.backendRef);
		this.storageState = new WebStorageState(this.backendRef);
		this.teamState = new WebTeamState(this.backendRef);
		this.templateState = new WebTemplateState(this.backendRef);
		this.userState = new WebUserState(this.backendRef);
		this.aiState = new WebAIState(this.backendRef);
		this.dbState = new WebDatabaseState(this.backendRef);
		this.widgetState = new WebWidgetState(this.backendRef);
		this.pageState = new WebPageState(this.backendRef);
		this.registryState = new WebRegistryState(this.backendRef);
		this.sinkState = new WebSinkState(this.backendRef);
		this.salesState = new WebSalesState(this.backendRef);
		this.usageState = new WebUsageState(this.backendRef);
		this.analyticsState = new WebAnalyticsState(this.backendRef);
	}

	capabilities(): ICapabilities {
		return {
			needsSignIn: true,
			canHostLlamaCPP: false,
			canHostEmbeddings: false,
			canExecuteLocally: false,
		};
	}

	pushProfile(profile: IProfile) {
		this.profile = profile;
		this.backendRef.profile = profile;
	}

	pushAuthContext(auth: AuthContextProps) {
		this.auth = auth;
		this.backendRef.auth = auth;
	}

	pushQueryClient(queryClient: QueryClient) {
		this.queryClient = queryClient;
		this.backendRef.queryClient = queryClient;
	}

	async isOffline(_appId: string): Promise<boolean> {
		return false;
	}

	async pushOfflineSyncCommand(
		_appId: string,
		_boardId: string,
		_commands: IGenericCommand[],
	) {}

	async getOfflineSyncCommands(
		_appId: string,
		_boardId: string,
	): Promise<ICommandSync[]> {
		return [];
	}

	async clearOfflineSyncCommands(
		_commandId: string,
		_appId: string,
		_boardId: string,
	): Promise<void> {}

	async uploadSignedUrl(
		signedUrl: string,
		file: File,
		completedFiles: number,
		totalFiles: number,
		onProgress?: (progress: number) => void,
	): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			xhr.upload.addEventListener("progress", (event) => {
				if (event.lengthComputable) {
					const fileProgress = event.loaded / event.total;
					const totalProgress =
						((completedFiles + fileProgress) / totalFiles) * 100;
					onProgress?.(totalProgress);
				}
			});

			xhr.addEventListener("load", () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve();
				} else {
					reject(
						new Error(
							`Upload failed with status ${xhr.status}: ${xhr.statusText}`,
						),
					);
				}
			});

			xhr.addEventListener("error", () => {
				reject(new Error("Upload failed: Network error"));
			});

			xhr.open("PUT", signedUrl);
			xhr.setRequestHeader(
				"Content-Type",
				file.type || "application/octet-stream",
			);

			if (signedUrl.includes(".blob.core.windows.net")) {
				xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
			}

			xhr.send(file);
		});

		onProgress?.((completedFiles / totalFiles) * 100);
	}
}

export function WebProvider({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const queryClient = useQueryClient();
	const { backend, setBackend } = useBackendStore();

	useEffect(() => {
		if (backend && queryClient && backend instanceof WebBackend) {
			backend.pushQueryClient(queryClient);
		}
	}, [backend, queryClient]);

	useEffect(() => {
		const nextBackend = new WebBackend((promise) => {
			promise.catch((error) => {
				console.error("Background task failed:", error);
			});
		}, queryClient);

		setBackend(nextBackend);
	}, [queryClient, setBackend]);

	if (!backend) {
		return <LoadingScreen progress={50} />;
	}

	return <>{children}</>;
}
