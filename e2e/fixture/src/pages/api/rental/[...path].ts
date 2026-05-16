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
	requireInterestParticipant,
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
import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
	VISIBILITY_STATE,
} from "../../../../../../demos/playground/src/lib/domain/constants.js";
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
import { DomainError, asString } from "../../../../../../demos/playground/src/lib/domain/types.js";

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

function optionalUserFrom(locals: { user?: UserLike | null }): UserContext | null {
	try {
		return userFrom(locals);
	} catch (error) {
		if (error instanceof DomainError && error.code === "UNAUTHORIZED") return null;
		throw error;
	}
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
	user: UserContext | null,
	assetId: string,
): Promise<unknown> {
	const asset = await domainStore.get(COLLECTIONS.ASSETS, assetId);
	if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	const isPublicMarketplaceAsset =
		asString(asset.status) === CMS_STATUS.PUBLISHED &&
		asString(asset.business_state) === ASSET_BUSINESS_STATE.LISTED &&
		asString(asset.visibility_state) === VISIBILITY_STATE.MARKETPLACE;
	const viewer = await viewerForAsset(domainStore, user, asset);
	const relationship = asString(viewer.relationship);
	const canReadRestrictedDetail =
		relationship === "owner" ||
		relationship === "renter" ||
		relationship === "interested_applicant";
	if (!isPublicMarketplaceAsset && !canReadRestrictedDetail) {
		throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	}
	return {
		asset: { ...asset, viewer },
		ownerConditions: {
			version: asset.conditions_version,
			hash: asset.conditions_hash,
			spec: asset.owner_conditions_spec,
		},
	};
}

async function viewerForAsset(
	domainStore: DomainStore,
	user: UserContext | null,
	asset: Record<string, unknown> & { id: string },
): Promise<Record<string, unknown>> {
	if (!user) return { relationship: "anonymous", canExpressInterest: false };
	if (asString(asset.owner_user_id) === user.id) {
		return { relationship: "owner", canExpressInterest: false, message: "This is your asset" };
	}
	if (asString(asset.active_renter_user_id) === user.id) {
		return { relationship: "renter", canExpressInterest: false };
	}
	const interest = await domainStore.findOne(COLLECTIONS.ASSET_INTERESTS, {
		asset_id: asset.id,
		interested_user_id: user.id,
	});
	if (interest) {
		return {
			relationship: "interested_applicant",
			canExpressInterest: false,
			interestId: interest.id,
			interestState: interest.interest_state,
		};
	}
	return { relationship: "logged_in", canExpressInterest: true };
}

async function withViewer(
	domainStore: DomainStore,
	user: UserContext | null,
	asset: Record<string, unknown> & { id: string },
) {
	return { ...asset, viewer: await viewerForAsset(domainStore, user, asset) };
}

async function enrichInterests(domainStore: DomainStore, interests: Array<Record<string, unknown>>) {
	return Promise.all(
		interests.map(async (interest) => {
			const asset =
				typeof interest.asset_id === "string"
					? await domainStore.get(COLLECTIONS.ASSETS, interest.asset_id)
					: null;
			return {
				...interest,
				asset_title: asset?.title ?? null,
				asset_location_label: asset?.location_label ?? null,
				asset,
			};
		}),
	);
}

function viewerRoleForInterest(user: UserContext, interest: Record<string, unknown> | undefined): string {
	if (!interest) return "unknown";
	if (asString(interest.owner_user_id) === user.id) return "owner";
	if (asString(interest.interested_user_id) === user.id) return "renter";
	return "unrelated";
}

export const ALL: APIRoute = async ({ request, locals, params }) => {
	const domainStore = store();
	const path = params.path ?? "";
	const parts = path.split("/").filter(Boolean);

	try {
		if (request.method === "POST" && path === "reset") return ok({ reset: !!resetStore() });

		if (request.method === "GET" && path === "marketplace/assets") {
			const user = optionalUserFrom(locals);
			const items = await Promise.all(
				(await listMarketplaceAssetsQuery(domainStore)).map((asset) =>
					withViewer(domainStore, user, asset),
				),
			);
			return ok({ items });
		}
		if (
			request.method === "GET" &&
			parts[0] === "marketplace" &&
			parts[1] === "assets" &&
			parts[2]
		) {
			return ok(await publicMarketplaceDetails(domainStore, optionalUserFrom(locals), parts[2]));
		}

		const user = userFrom(locals);
		const body = request.method === "GET" ? {} : await readJson(request);

		if (request.method === "POST" && path === "owner/assets/add") {
			return ok(await addAsset(domainStore, user, parseAddAssetRequest(body)), 201);
		}
		if (request.method === "GET" && path === "owner/dashboard") {
			const [assets, inbox] = await Promise.all([
				listOwnerAssetsQuery(domainStore, user.id),
				listOwnerInterestsQuery(domainStore, user.id),
			]);
			return ok({ assets, inbox: await enrichInterests(domainStore, inbox) });
		}
		if (request.method === "GET" && path === "renter/dashboard") {
			return ok({
				interests: await enrichInterests(
					domainStore,
					await listRenterInterestsQuery(domainStore, user.id),
				),
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
			await requireInterestParticipant(domainStore, user, parts[1]);
			const thread = await getNegotiationThreadQuery(domainStore, parts[1]);
			return ok({
				...thread,
				viewerRole: viewerRoleForInterest(user, thread?.interest as Record<string, unknown> | undefined),
			});
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
