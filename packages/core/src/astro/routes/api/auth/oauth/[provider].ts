/**
 * GET /_emdash/api/auth/oauth/[provider]
 *
 * Start OAuth flow - redirects to provider authorization URL
 */

import type { APIRoute } from "astro";
import { env as cloudflareEnv } from "cloudflare:workers";
export const prerender = false;

import {
	createAuthorizationUrl,
	type OAuthConsumerConfig,
	type OAuthState,
	type StateStore,
} from "@emdash-cms/auth";

import { getPublicOrigin } from "#api/public-url.js";
import { createOAuthStateStore } from "#auth/oauth-state-store.js";

type ProviderName = "github" | "google";

type OAuthStateWithPublicRedirect = OAuthState & {
	redirectTo?: string;
	errorRedirectBase?: string;
};

const VALID_PROVIDERS = new Set<string>(["github", "google"]);

function isValidProvider(provider: string): provider is ProviderName {
	return VALID_PROVIDERS.has(provider);
}

/** Safely extract a string value from an env-like record */
function envString(env: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const val = env[key];
		if (typeof val === "string" && val) return val;
	}
	return undefined;
}

function safePublicRedirect(value: string | null): string | null {
	if (!value) return null;

	const trimmed = value.trim();

	if (!trimmed) return null;
	if (!trimmed.startsWith("/")) return null;
	if (trimmed.startsWith("//")) return null;
	if (trimmed.startsWith("/_emdash")) return null;
	if (trimmed.includes("\\")) return null;

	return trimmed;
}

function publicLoginErrorRedirect(redirectTo: string | null): string | null {
	if (!redirectTo) return null;

	return `/login?redirect=${encodeURIComponent(redirectTo)}`;
}

function appendAuthError(base: string, code: string, message: string): string {
	const separator = base.includes("?") ? "&" : "?";

	return `${base}${separator}error=${encodeURIComponent(code)}&message=${encodeURIComponent(message)}`;
}

function getRuntimeEnv(): Record<string, unknown> {
	return {
		...(import.meta.env as Record<string, unknown>),
		...(cloudflareEnv as Record<string, unknown>),
	};
}

/**
 * Get OAuth config from environment variables
 */
function getOAuthConfig(env: Record<string, unknown>): OAuthConsumerConfig["providers"] {
	const providers: OAuthConsumerConfig["providers"] = {};

	// GitHub
	const githubClientId = envString(env, "EMDASH_OAUTH_GITHUB_CLIENT_ID", "GITHUB_CLIENT_ID");
	const githubClientSecret = envString(
		env,
		"EMDASH_OAUTH_GITHUB_CLIENT_SECRET",
		"GITHUB_CLIENT_SECRET",
	);
	if (githubClientId && githubClientSecret) {
		providers.github = {
			clientId: githubClientId,
			clientSecret: githubClientSecret,
		};
	}

	// Google
	const googleClientId = envString(env, "EMDASH_OAUTH_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID");
	const googleClientSecret = envString(
		env,
		"EMDASH_OAUTH_GOOGLE_CLIENT_SECRET",
		"GOOGLE_CLIENT_SECRET",
	);
	if (googleClientId && googleClientSecret) {
		providers.google = {
			clientId: googleClientId,
			clientSecret: googleClientSecret,
		};
	}

	return providers;
}

function createPublicRedirectStateStore(
	baseStateStore: StateStore,
	redirectTo: string | null,
	errorRedirectBase: string | null,
): StateStore {
	if (!redirectTo || !errorRedirectBase) {
		return baseStateStore;
	}

	return {
		async set(state: string, data: OAuthState): Promise<void> {
			await baseStateStore.set(state, {
				...data,
				redirectTo,
				errorRedirectBase,
			} satisfies OAuthStateWithPublicRedirect);
		},

		async get(state: string): Promise<OAuthState | null> {
			return baseStateStore.get(state);
		},

		async delete(state: string): Promise<void> {
			await baseStateStore.delete(state);
		},
	};
}

export const GET: APIRoute = async ({ params, request, locals, redirect }) => {
	const { emdash } = locals;
	const provider = params.provider;
	const url = new URL(request.url);
	const redirectTo = safePublicRedirect(url.searchParams.get("redirect"));
	const publicErrorRedirectBase = publicLoginErrorRedirect(redirectTo);

	// Determine where to redirect errors.
	// Public login gets public errors; admin/setup keeps upstream admin behavior.
	const referer = request.headers.get("referer") ?? "";
	const adminErrorRedirectBase = referer.includes("/setup")
		? "/_emdash/admin/setup"
		: "/_emdash/admin/login";
	const errorRedirectBase = publicErrorRedirectBase ?? adminErrorRedirectBase;

	// Validate provider
	if (!provider || !isValidProvider(provider)) {
		return redirect(
			appendAuthError(errorRedirectBase, "invalid_provider", "Invalid OAuth provider"),
		);
	}

	if (!emdash?.db) {
		return redirect(appendAuthError(errorRedirectBase, "server_error", "Database not configured"));
	}

	try {
		// Get OAuth providers from runtime environment.
		// Astro v6 removed Astro.locals.runtime; Cloudflare secrets are read from cloudflare:workers.
		const providers = getOAuthConfig(getRuntimeEnv());

		if (!providers[provider]) {
			return redirect(
				appendAuthError(
					errorRedirectBase,
					"provider_not_configured",
					`OAuth provider ${provider} is not configured. Set either EMDASH_OAUTH_${provider.toUpperCase()}_CLIENT_ID and EMDASH_OAUTH_${provider.toUpperCase()}_CLIENT_SECRET, or ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET.`,
				),
			);
		}

		const config: OAuthConsumerConfig = {
			baseUrl: `${redirectTo?.startsWith("/test-corridor/") ? url.origin : getPublicOrigin(url, emdash?.config)}/_emdash`,
			providers,
		};

		const baseStateStore = createOAuthStateStore(emdash.db);
		const stateStore = createPublicRedirectStateStore(
			baseStateStore,
			redirectTo,
			publicErrorRedirectBase,
		);

		const { url: authUrl } = await createAuthorizationUrl(config, provider, stateStore);

		return redirect(authUrl);
	} catch (error) {
		console.error("OAuth initiation error:", error);
		return redirect(
			appendAuthError(
				errorRedirectBase,
				"oauth_error",
				"Failed to start OAuth flow. Please try again.",
			),
		);
	}
};
