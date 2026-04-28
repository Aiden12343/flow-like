"use client";
import {
  ExecutionEngineProviderComponent,
  ExecutionServiceProvider,
  PersistQueryClientProvider,
  QueryClient,
  ReactFlowProvider,
} from "@tm9657/flow-like-ui";
import { ThemeProvider } from "@tm9657/flow-like-ui/components/theme-provider";
import { NetworkStatusIndicator } from "@tm9657/flow-like-ui/components/ui/network-status-indicator";
import { Toaster } from "@tm9657/flow-like-ui/components/ui/sonner";
import { TooltipProvider } from "@tm9657/flow-like-ui/components/ui/tooltip";
import { useNetworkStatus } from "@tm9657/flow-like-ui/hooks/use-network-status";
import { createIDBPersister } from "@tm9657/flow-like-ui/lib/persister";
import { useEffect, useState } from "react";
import { AppSidebar } from "../components/app-sidebar";
import { DesktopAuthProvider } from "../components/auth-provider";
import { DeeplinkNavigationHandler } from "../components/deeplink-navigation-handler";
import DownloadNotificationProvider from "../components/download-notification-provider";
import { EmbedQueryPersistence } from "../components/embed-query-persistence";
import GlobalAnchorHandler from "../components/global-anchor-component";
import { IOSWebviewHardening } from "../components/ios-webview-hardening";
import NotificationProvider from "../components/notification-provider";
import { OAuthCallbackHandler } from "../components/oauth-callback-handler";
import { OAuthExecutionProvider } from "../components/oauth-execution-provider";
import { RuntimeVariablesProviderComponent } from "../components/runtime-variables-provider";
import { SpotlightWrapper } from "../components/spotlight-wrapper";
import { TauriProvider } from "../components/tauri-provider";
import { ThemeLoader } from "../components/theme-loader";
import ToastProvider from "../components/toast-provider";
import TrayProvider from "../components/tray-provider";
import { UpdateProvider } from "../components/update-provider";
import { WebProvider } from "../components/web-provider";
import { initBlobOffload } from "../lib/init-blob-offload";
import PostHogPageView from "./PostHogPageView";
import { PHProvider } from "./provider";

initBlobOffload();

const persister = createIDBPersister();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      staleTime: 30 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

function NetworkAwareProvider({ children }: { children: React.ReactNode }) {
  const isOnline = useNetworkStatus();

  useEffect(() => {
    if (isOnline) {
      queryClient.refetchQueries({
        type: "active",
        stale: true,
      });
    }
  }, [isOnline]);

  return <>{children}</>;
}

export default function ClientShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const [runtimeFlags, setRuntimeFlags] = useState({
    resolved: false,
    isBulltrackers: false,
    isTauriRuntime: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isBulltrackers = params.get("surface") === "bulltrackers-task-builder";
    const isTauriRuntime =
      "__TAURI__" in (window as any) ||
      "__TAURI_IPC__" in (window as any) ||
      "__TAURI_INTERNALS__" in (window as any);
    setRuntimeFlags({ resolved: true, isBulltrackers, isTauriRuntime });
  }, []);

  const isEmbedWebMode = runtimeFlags.isBulltrackers && !runtimeFlags.isTauriRuntime;

  if (!runtimeFlags.resolved) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background text-muted-foreground">
        Loading workspace...
      </div>
    );
  }

  const innerContent = (
    <>
      {!isEmbedWebMode && <NotificationProvider />}
      <RuntimeVariablesProviderComponent>
        <ExecutionServiceProvider>
          <ExecutionEngineProviderComponent>
            <SpotlightWrapper>
              {!runtimeFlags.isBulltrackers && <PostHogPageView />}
              <ThemeLoader />
              <AppSidebar>{children}</AppSidebar>
            </SpotlightWrapper>
          </ExecutionEngineProviderComponent>
        </ExecutionServiceProvider>
      </RuntimeVariablesProviderComponent>
    </>
  );

  return (
    <PHProvider>
      <ReactFlowProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 60 * 60 * 1000,
          }}
        >
          <NetworkAwareProvider>
            {!isEmbedWebMode && (
              <>
                <IOSWebviewHardening />
                <NetworkStatusIndicator />
                <UpdateProvider />
                <TrayProvider />
                <GlobalAnchorHandler />
              </>
            )}
            <EmbedQueryPersistence />
            {isEmbedWebMode ? (
              <div className="dark h-full w-full bg-background text-foreground">
                <TooltipProvider>
                  <Toaster />
                  <DesktopAuthProvider>
                    <WebProvider>{innerContent}</WebProvider>
                  </DesktopAuthProvider>
                </TooltipProvider>
              </div>
            ) : (
              <ThemeProvider
                attribute="class"
                defaultTheme="dark"
                enableSystem={false}
                storageKey="theme"
                disableTransitionOnChange
              >
                <TooltipProvider>
                  <Toaster />
                  <ToastProvider />
                  <TauriProvider>
                    <DownloadNotificationProvider />
                    <DeeplinkNavigationHandler>
                      <OAuthCallbackHandler>
                        <OAuthExecutionProvider>
                          <DesktopAuthProvider>{innerContent}</DesktopAuthProvider>
                        </OAuthExecutionProvider>
                      </OAuthCallbackHandler>
                    </DeeplinkNavigationHandler>
                  </TauriProvider>
                </TooltipProvider>
              </ThemeProvider>
            )}
          </NetworkAwareProvider>
        </PersistQueryClientProvider>
      </ReactFlowProvider>
    </PHProvider>
  );
}
