import { isTauri } from "./platform";

type TauriModuleMap = {
	"@tauri-apps/api/core": {
		invoke: <T = unknown>(
			command: string,
			args?: Record<string, unknown>,
		) => Promise<T>;
	};
	"@tauri-apps/plugin-dialog": {
		save: (options?: Record<string, unknown>) => Promise<string | null>;
	};
	"@tauri-apps/plugin-fs": {
		writeTextFile: (path: string, contents: string) => Promise<void>;
		writeFile: (path: string, contents: Uint8Array) => Promise<void>;
	};
	"@tauri-apps/plugin-http": {
		fetch: typeof fetch;
	};
	"@tauri-apps/plugin-opener": {
		openUrl: (url: string) => Promise<void>;
	};
};

async function importTauriModule<K extends keyof TauriModuleMap>(
	specifier: K,
): Promise<TauriModuleMap[K]> {
	if (!isTauri()) {
		throw new Error(`Tauri module ${specifier} requested outside a Tauri runtime`);
	}

	const importer = new Function(
		"specifier",
		"return import(specifier);",
	) as (specifier: string) => Promise<TauriModuleMap[K]>;

	return importer(specifier);
}

export async function tauriInvoke<T = unknown>(
	command: string,
	args?: Record<string, unknown>,
): Promise<T> {
	const { invoke } = await importTauriModule("@tauri-apps/api/core");
	return invoke<T>(command, args);
}

export async function tauriSave(options?: Record<string, unknown>) {
	const { save } = await importTauriModule("@tauri-apps/plugin-dialog");
	return save(options);
}

export async function tauriWriteTextFile(path: string, contents: string) {
	const { writeTextFile } = await importTauriModule("@tauri-apps/plugin-fs");
	return writeTextFile(path, contents);
}

export async function tauriWriteBinaryFile(path: string, contents: Uint8Array) {
	const { writeFile } = await importTauriModule("@tauri-apps/plugin-fs");
	return writeFile(path, contents);
}

export async function tauriFetch(
	input: string,
	init?: Parameters<typeof fetch>[1],
) {
	const { fetch: tauriPluginFetch } = await importTauriModule(
		"@tauri-apps/plugin-http",
	);
	return tauriPluginFetch(input, init);
}

export async function tauriOpenUrl(url: string) {
	const { openUrl } = await importTauriModule("@tauri-apps/plugin-opener");
	return openUrl(url);
}
