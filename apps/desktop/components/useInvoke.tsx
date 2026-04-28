import { invoke } from "@tauri-apps/api/core";
import {
	type UseQueryResult,
	useQuery,
	useQueryClient,
} from "@tm9657/flow-like-ui";

export function useTauriInvoke<T>(
	path: string,
	args: any,
	deps: string[] = [],
	enabled = true,
): UseQueryResult<T, any> {
	const hasTauriRuntime =
		typeof window !== "undefined" &&
		("__TAURI__" in (window as any) ||
			"__TAURI_IPC__" in (window as any) ||
			"__TAURI_INTERNALS__" in (window as any));
	const hasInvokeFunction = typeof invoke === "function";

	const query = useQuery({
		queryKey: [...path.split("_"), ...deps],
		queryFn: async () => {
			try {
				if (!hasTauriRuntime || !hasInvokeFunction) {
					throw new Error(
						`Tauri runtime unavailable for invoke(${path}) in web mode.`,
					);
				}
				const response = await invoke(path, args);
				return response as T;
			} catch (error) {
				console.error(error);
				throw error;
			}
		},
		enabled: enabled && hasTauriRuntime && hasInvokeFunction,
	});

	return query;
}

export function useInvalidateTauriInvoke() {
	const queryClient = useQueryClient();
	return (path: string, deps: string[] = []) =>
		queryClient.invalidateQueries({
			queryKey: [...path.split("_"), ...deps],
		});
}
