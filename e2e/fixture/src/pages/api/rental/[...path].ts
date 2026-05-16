import type { APIRoute } from "astro";

import {
	parseAcceptFinalTermsRequest,
	parseAddAssetRequest,
	parseAddNegotiationRoundRequest,
	parseClaimHandoverDamageRequest,
	parseExpressInterestRequest,
	parseSettleHandoverRequest,
	parseStartHandoverRequest,
	parseUpdateAssetConfigRequest,
} from "../../../../../../demos/playground/src/lib/domain/api-contracts.js";
import {
	requireAgreementParticipant,
	requireHandoverParticipant,
} from "../../../../../../demos/playground/src/lib/domain/auth.js";
import { acceptFinalTerms } from "../../../../../../demos/playground/src/lib/domain/commands/accept-final-terms.js";
import { acceptHandover } from "../../../../../../demos/playground/src/lib/domain/commands/accept-handover.js";
import { addAsset } from "../../../../../../demos/playground/src/lib/domain/commands/add-asset.js";
import { addHandoverNegotiationRound } from "../../../../../../demos/playground/src/lib/domain/commands/add-handover-negotiation-round.js";
import { addNegotiationRound } from "../../../../../../demos/playground/src/lib/domain/commands/add-negotiation-round.js";
import { claimHandoverDamage } from "../../../../../../demos/playground/src/lib/domain/commands/claim-handover-damage.js";
import { expressInterest } from "../../../../../../demos/playground/src/lib/domain/commands/express-interest.js";
import { publishAssetToMarketplace } from "../../../../../../demos/playground/src/lib/domain/commands/publish-asset-to-marketplace.js";
import { settleHandover } from "../../../../../../demos/playground/src/lib/domain/commands/settle-handover.js";
import { startHandover } from "../../../../../../demos/playground/src/lib/domain/commands/start-handover.js";
import { updateAssetConfig } from "../../../../../../demos/playground/src/lib/domain/commands/update-asset-config.js";
import { COLLECTIONS } from "../../../../../../demos/playground/src/lib/domain/constants.js";
import { MemoryDomainStore } from "../../../../../../demos/playground/src/lib/domain/db.js";
import { getAgreementPrintQuery } from "../../../../../../demos/playground/src/lib/domain/queries/agreement-print.js";
import { getHandoverSessionQuery } from "../../../../../../demos/playground/src/lib/domain/queries/handover-session.js";
import { listMarketplaceAssetsQuery } from "../../../../../../demos/playground/src/lib/domain/queries/marketplace.js";
import { getNegotiationThreadQuery } from "../../../../../../demos/playground/src/lib/domain/queries/negotiation-thread.js";
import {
	listOwnerAssetsQuery,
	listOwnerInterestsQuery,
} from "../../../../../../demos/playground/src/lib/domain/queries/owner-dashboard.js";
import {
	listRenterAssetAccessQuery,
	listRenterInterestsQuery,
} from "../../../../../../demos/playground/src/lib/domain/queries/renter-dashboard.js";
import type {
	DomainStore,
	UserContext,
} from "../../../../../../demos/playground/src/lib/domain/types.js";
import { DomainError } from "../../../../../../demos/playground/src/lib/domain/types.js";

export const prerender = false;

const STORE_KEY = Symbol.for("emdash.playground-rental.e2e-store");

type GlobalWithRentalStore = typeof globalThis & { [STORE_KEY]?: MemoryDomainStore };
type UserLike = { id?: string; email?: string | null; name?: string | null; role?: unknown };

function holder(): GlobalWithRentalStore {
	return globalThis as GlobalWithRentalStore;
}

function store(): MemoryDomainStore {
	const globalHolder = holder();
	globalHolder[STORE_KEY] ??= new MemoryDomainStore();
	return globalHolder[STORE_KEY];
}

function resetStore(): MemoryDomainStore {
	const globalHolder = holder();
	globalHolder[STORE_KEY] = new MemoryDomainStore();
	return globalHolder[STORE_KEY];
}

function userFrom(locals: { user?: UserLike | null }): UserContext {
	const user = locals.user;
	if (!user?.id) throw new DomainError("UNAUTHORIZED", "Login required", 401);
	return {
		id: user.id,
		email: user.email ?? undefined,
		name: user.name ?? undefined,
		role:
			typeof user.role === "string" || typeof user.role === "number"
				? String(user.role)
				: undefined,
	};
}

async function readJson(request: Request): Promise<unknown> {
	const text = await request.text();
	if (!text.trim()) return {};
	return JSON.parse(text) as unknown;
}

function ok(data: unknown, status = 200): Response {
	return Response.json({ ok: true, data }, { status });
}

function notFound(): Response {
	return Response.json(
		{ ok: false, error: { code: "NOT_FOUND", message: "Not found" } },
		{ status: 404 },
	);
}

function fail(error: unknown): Response {
	if (error instanceof DomainError) {
		return Response.json(
			{ ok: false, error: { code: error.code, message: error.message } },
			{ status: error.status },
		);
	}
	return Response.json(
		{ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal error" } },
		{ status: 500 },
	);
}

async function publicMarketplaceDetails(
	domainStore: DomainStore,
	assetId: string,
): Promise<unknown> {
	const asset = await domainStore.get(COLLECTIONS.ASSETS, assetId);
	if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	return {
		asset,
		ownerConditions: {
			version: asset.conditions_version,
			hash: asset.conditions_hash,
			spec: asset.owner_conditions_spec,
		},
	};
}

export const ALL: APIRoute = async ({ request, locals, params }) => {
	const domainStore = store();
	const path = params.path ?? "";
	const parts = path.split("/").filter(Boolean);

	try {
		if (request.method === "POST" && path === "reset") return ok({ reset: !!resetStore() });

		if (request.method === "GET" && path === "marketplace/assets") {
			return ok({ items: await listMarketplaceAssetsQuery(domainStore) });
		}
		if (
			request.method === "GET" &&
			parts[0] === "marketplace" &&
			parts[1] === "assets" &&
			parts[2]
		) {
			return ok(await publicMarketplaceDetails(domainStore, parts[2]));
		}

		const user = userFrom(locals);
		const body = request.method === "GET" ? {} : await readJson(request);

		if (request.method === "POST" && path === "owner/assets/add") {
			return ok(await addAsset(domainStore, user, parseAddAssetRequest(body)), 201);
		}
		if (request.method === "GET" && path === "owner/dashboard") {
			return ok({
				assets: await listOwnerAssetsQuery(domainStore, user.id),
				inbox: await listOwnerInterestsQuery(domainStore, user.id),
			});
		}
		if (request.method === "GET" && path === "renter/dashboard") {
			return ok({
				interests: await listRenterInterestsQuery(domainStore, user.id),
				access: await listRenterAssetAccessQuery(domainStore, user.id),
			});
		}
		if (request.method === "POST" && parts[0] === "owner" && parts[1] === "assets" && parts[2]) {
			if (parts[3] === "config")
				return ok(
					await updateAssetConfig(domainStore, user, parts[2], parseUpdateAssetConfigRequest(body)),
				);
			if (parts[3] === "publish-to-marketplace")
				return ok(await publishAssetToMarketplace(domainStore, user, parts[2]));
		}
		if (
			request.method === "POST" &&
			parts[0] === "marketplace" &&
			parts[1] === "assets" &&
			parts[2] &&
			parts[3] === "express-interest"
		) {
			return ok(
				await expressInterest(domainStore, user, parts[2], parseExpressInterestRequest(body)),
				201,
			);
		}
		if (request.method === "GET" && parts[0] === "negotiations" && parts[1]) {
			return ok(await getNegotiationThreadQuery(domainStore, parts[1]));
		}
		if (request.method === "POST" && parts[0] === "negotiations" && parts[1]) {
			if (parts[2] === "add-round")
				return ok(
					await addNegotiationRound(
						domainStore,
						user,
						parts[1],
						parseAddNegotiationRoundRequest(body),
					),
					201,
				);
			if (parts[2] === "accept-final-terms")
				return ok(
					await acceptFinalTerms(domainStore, user, parts[1], parseAcceptFinalTermsRequest(body)),
					201,
				);
		}
		if (request.method === "GET" && parts[0] === "agreements" && parts[1]) {
			await requireAgreementParticipant(domainStore, user, parts[1]);
			return ok(await getAgreementPrintQuery(domainStore, parts[1]));
		}
		if (request.method === "POST" && parts[0] === "handover" && parts[1]) {
			if (parts[2] === "start")
				return ok(
					await startHandover(domainStore, user, parts[1], parseStartHandoverRequest(body)),
					201,
				);
			if (parts[2] === "accept") return ok(await acceptHandover(domainStore, user, parts[1]));
			if (parts[2] === "claim-damage")
				return ok(
					await claimHandoverDamage(
						domainStore,
						user,
						parts[1],
						parseClaimHandoverDamageRequest(body),
					),
				);
			if (parts[2] === "add-round")
				return ok(
					await addHandoverNegotiationRound(
						domainStore,
						user,
						parts[1],
						parseAddNegotiationRoundRequest(body),
					),
					201,
				);
			if (parts[2] === "settle")
				return ok(
					await settleHandover(domainStore, user, parts[1], parseSettleHandoverRequest(body)),
				);
		}
		if (request.method === "GET" && parts[0] === "handover" && parts[1]) {
			await requireHandoverParticipant(domainStore, user, parts[1]);
			return ok(await getHandoverSessionQuery(domainStore, parts[1]));
		}

		return notFound();
	} catch (error) {
		return fail(error);
	}
};
