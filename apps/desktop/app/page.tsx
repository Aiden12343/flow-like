"use client";
import {
	Skeleton,
} from "@tm9657/flow-like-ui";
import { TutorialDialog } from "@tm9657/flow-like-ui/components/pages/home/tutorial-dialog";
import { HomeSwimlanes } from "@tm9657/flow-like-ui/components/pages/home/swim-lanes";
import type { ISettingsProfile } from "@tm9657/flow-like-ui/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTauriInvoke } from "../components/useInvoke";

export default function Home() {
	const router = useRouter();
	const isTauriRuntime = useMemo(
		() =>
			typeof window !== "undefined" &&
			("__TAURI__" in (window as any) ||
				"__TAURI_IPC__" in (window as any) ||
				"__TAURI_INTERNALS__" in (window as any)),
		[],
	);
	const [isCheckingProfiles, setIsCheckingProfiles] = useState(true);
	const profiles = useTauriInvoke<Record<string, ISettingsProfile>>(
		"get_profiles",
		{},
		[],
		isTauriRuntime,
	);

	const checkProfiles = useCallback(async () => {
		if (profiles.isLoading) return;

		if (profiles.data) {
			const profileCount = Object.keys(profiles.data).length;

			if (profileCount > 0) {
				setIsCheckingProfiles(false);
				return;
			}

			// Cache may be stale after login sync — refetch before redirecting.
			const { data: fresh } = await profiles.refetch();
			if (fresh && Object.keys(fresh).length > 0) {
				setIsCheckingProfiles(false);
				return;
			}

			router.replace("/onboarding");
			return;
		}

		if (profiles.isError) {
			console.error("Failed to load profiles:", profiles.error);
			router.replace("/onboarding");
		}
	}, [
		profiles.data,
		profiles.isLoading,
		profiles.isError,
		profiles.error,
		router,
	]);

	useEffect(() => {
		if (!isTauriRuntime) {
			setIsCheckingProfiles(false);
			return;
		}
		checkProfiles();
	}, [checkProfiles, isTauriRuntime]);

	if (profiles.isLoading || isCheckingProfiles) {
		return (
			<main className="flex flex-col flex-1 w-full min-h-0 overflow-hidden">
				<TutorialDialog />
				<div className="flex-1 min-h-0 overflow-auto p-4 grid grid-cols-6 justify-start gap-2">
					<Skeleton className="col-span-6 h-full min-h-[30dvh]" />
					<Skeleton className="col-span-3 h-full min-h-[20dvh]" />
					<Skeleton className="col-span-3 h-full" />
					<Skeleton className="col-span-2 h-full" />
					<Skeleton className="col-span-2 h-full" />
					<Skeleton className="col-span-2 h-full" />
				</div>
			</main>
		);
	}

	return (
		<main className="flex flex-col flex-1 w-full min-h-0 overflow-hidden">
			<TutorialDialog />
			<HomeSwimlanes />
		</main>
	);
}
