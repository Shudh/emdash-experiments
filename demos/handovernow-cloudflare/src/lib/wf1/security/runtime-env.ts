import { env as cloudflareWorkersEnv } from "cloudflare:workers";

export type RuntimeEnv = Record<string, unknown>;

function readProperty(container: Record<string, unknown>, key: string): unknown {
	try {
		return container[key];
	} catch {
		return undefined;
	}
}

function cloudflareWorkersRuntimeEnv(): RuntimeEnv | null {
	return isRecord(cloudflareWorkersEnv) ? cloudflareWorkersEnv : null;
}

function nestedEnv(container: Record<string, unknown>, key: string): RuntimeEnv | null {
	const nested = readProperty(container, key);

	if (!isRecord(nested)) {
		return null;
	}

	const env = readProperty(nested, "env");

	if (!isRecord(env)) {
		return null;
	}

	return env;
}

export function getRuntimeEnvFromLocals(locals: unknown): RuntimeEnv {
	if (!isRecord(locals)) {
		return getRuntimeEnv();
	}

	const directLocalsEnv = readProperty(locals, "env");

	const candidates: Array<RuntimeEnv | null> = [
		getRuntimeEnv(),
		nestedEnv(locals, "cloudflare"),
		nestedEnv(locals, "platform"),
		isRecord(directLocalsEnv) ? directLocalsEnv : null,
	];

	for (const candidate of candidates) {
		if (candidate !== null) {
			return candidate;
		}
	}

	return {};
}

export function getRuntimeEnv(): RuntimeEnv {
	return cloudflareWorkersRuntimeEnv() ?? {};
}

export function envString(runtimeEnv: RuntimeEnv | undefined, ...keys: string[]): string | undefined {
	if (runtimeEnv === undefined) {
		return undefined;
	}

	for (const key of keys) {
		const rawValue = runtimeEnv[key];

		if (typeof rawValue === "string") {
			const trimmedValue = rawValue.trim();

			if (trimmedValue !== "") {
				return trimmedValue;
			}
		}
	}

	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	if (value === null) {
		return false;
	}

	if (value === undefined) {
		return false;
	}

	if (typeof value !== "object") {
		return false;
	}

	if (Array.isArray(value) === true) {
		return false;
	}

	return true;
}