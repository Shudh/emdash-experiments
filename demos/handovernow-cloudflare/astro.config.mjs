// @ts-check

import cloudflare from "@astrojs/cloudflare";
import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, fontProviders } from "astro/config";
import emdash, { local } from "emdash/astro";
import { google } from "emdash/auth/providers/google";
import { sqlite } from "emdash/db";

const dbTarget = process.env.HANDOVERNOW_DB_TARGET ?? "d1";
const useLocalDb = dbTarget === "local";
const cloudflareEmDash = useLocalDb ? null : await import("@emdash-cms/cloudflare");

export default defineConfig({
	output: "server",

	adapter: useLocalDb
		? node({ mode: "standalone" })
		: cloudflare({
				imageService: "cloudflare",
			}),

	i18n: {
		defaultLocale: "en",
		locales: ["en", "fr", "es"],
		fallback: {
			fr: "en",
			es: "en",
		},
	},

	image: {
		layout: "constrained",
		responsiveStyles: true,
	},

	integrations: [
		react(),

		emdash({
			siteUrl: "https://handovernow.com",
			allowedOrigins: ["https://www.handovernow.com", "https://cms.handovernow.com"],
			authProviders: [google()],

			database: useLocalDb
				? sqlite({ url: "file:./db/handovernow_cms_local.db" })
				: cloudflareEmDash.d1({
						binding: "handovernow_cms",
						session: "auto",
					}),

			storage: useLocalDb
				? local({
						directory: "./uploads",
						baseUrl: "/_emdash/api/media/file",
					})
				: cloudflareEmDash.r2({
						binding: "handovernow_cms_media",
					}),
		}),
	],

	experimental: useLocalDb
		? {}
		: {
				cache: {
					provider: cloudflareEmDash.cloudflareCache(),
				},
				routeRules: {
					"/": {
						maxAge: 3600,
						swr: 864000,
					},
					"/[...slug]": {
						maxAge: 3600,
						swr: 864000,
					},
				},
			},

	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-sans",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],

	devToolbar: {
		enabled: false,
	},
});
