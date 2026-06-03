import { env } from "cloudflare:workers";

export type RuntimeEnv = Record<string, unknown>;

export function getRuntimeEnvFromLocals(_locals: unknown): RuntimeEnv {
	const runtimeEnv = getRuntimeEnv();

	return runtimeEnv;
}

export function getRuntimeEnv(): RuntimeEnv {
	const cloudflareRuntimeEnv = env as unknown;
	let runtimeEnv: RuntimeEnv = {};

	if (isRecord(cloudflareRuntimeEnv) === true) {
		runtimeEnv = cloudflareRuntimeEnv;
	}

	return runtimeEnv;
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