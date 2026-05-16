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
} from "../../../lib/domain/api-contracts.js";
import {
	requireAgreementParticipant,
	requireHandoverParticipant,
	requireInterestParticipant,
} from "../../../lib/domain/auth.js";
import { acceptFinalTerms } from "../../../lib/domain/commands/accept-final-terms.js";
import { acceptHandover } from "../../../lib/domain/commands/accept-handover.js";
import { addAsset } from "../../../lib/domain/commands/add-asset.js";
import { addHandoverNegotiationRound } from "../../../lib/domain/commands/add-handover-negotiation-round.js";
import { addNegotiationRound } from "../../../lib/domain/commands/add-negotiation-round.js";
import { claimHandoverDamage } from "../../../lib/domain/commands/claim-handover-damage.js";
import { expressInterest } from "../../../lib/domain/commands/express-interest.js";
import { publishAssetToMarketplace } from "../../../lib/domain/commands/publish-asset-to-marketplace.js";
import { settleHandover } from "../../../lib/domain/commands/settle-handover.js";
import { startHandover } from "../../../lib/domain/commands/start-handover.js";
import { updateAssetConfig } from "../../../lib/domain/commands/update-asset-config.js";
import { COLLECTIONS } from "../../../lib/domain/constants.js";
import { getAgreementPrintQuery } from "../../../lib/domain/queries/agreement-print.js";
import { getHandoverSessionQuery } from "../../../lib/domain/queries/handover-session.js";
import { listMarketplaceAssetsQuery } from "../../../lib/domain/queries/marketplace.js";
import { getNegotiationThreadQuery } from "../../../lib/domain/queries/negotiation-thread.js";
import {
	listOwnerAssetsQuery,
	listOwnerInterestsQuery,
} from "../../../lib/domain/queries/owner-dashboard.js";
import {
	listRenterAssetAccessQuery,
	listRenterInterestsQuery,
} from "../../../lib/domain/queries/renter-dashboard.js";
import type { DomainRow, DomainStore, UserContext } from "../../../lib/domain/types.js";
import { DomainError, asString } from "../../../lib/domain/types.js";
import {
	getOptionalUser,
	getStore,
	getUser,
	jsonError,
	jsonOk,
	readJson,
} from "../_domain-route-utils.js";

export const prerender = false;

type RentalContext = Parameters<APIRoute>[0];

function notFound(): Response {
	return jsonError(new DomainError("NOT_FOUND", "Not found", 404));
}

function resetForbidden(): Response {
	return jsonError(new DomainError("FORBIDDEN", "Rental reset is only available in local dev", 403));
}

function canResetRentalStore(context: RentalContext): boolean {
	const env = typeof process !== "undefined" && process.env ? process.env : {};
	return env.NODE_ENV !== "production" && context.url.searchParams.get("confirm") === "local-dev-reset";
}

async function viewerForAsset(
	store: DomainStore,
	user: UserContext | null,
	asset: DomainRow,
): Promise<Record<string, unknown>> {
	if (!user) return { relationship: "anonymous", canExpressInterest: false };
	if (asString(asset.owner_user_id) === user.id) {
		return { relationship: "owner", canExpressInterest: false, message: "This is your asset" };
	}
	if (asString(asset.active_renter_user_id) === user.id) {
		return { relationship: "renter", canExpressInterest: false };
	}
	const interest = await store.findOne(COLLECTIONS.ASSET_INTERESTS, {
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
	store: DomainStore,
	user: UserContext | null,
	asset: DomainRow,
): Promise<DomainRow & { viewer: Record<string, unknown> }> {
	return { ...asset, viewer: await viewerForAsset(store, user, asset) };
}

async function publicMarketplaceDetails(
	store: DomainStore,
	user: UserContext | null,
	assetId: string,
) {
	const asset = await store.get(COLLECTIONS.ASSETS, assetId);
	if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	return {
		asset: await withViewer(store, user, asset),
		ownerConditions: {
			version: asset.conditions_version,
			hash: asset.conditions_hash,
			spec: asset.owner_conditions_spec,
		},
	};
}

async function enrichInterests(store: DomainStore, interests: DomainRow[]) {
	return Promise.all(
		interests.map(async (interest) => {
			const asset =
				typeof interest.asset_id === "string"
					? await store.get(COLLECTIONS.ASSETS, interest.asset_id)
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

function viewerRoleForInterest(user: UserContext, interest: DomainRow | undefined): string {
	if (!interest) return "unknown";
	if (asString(interest.owner_user_id) === user.id) return "owner";
	if (asString(interest.interested_user_id) === user.id) return "renter";
	return "unrelated";
}

export const ALL: APIRoute = async (context) => {
	const { request, params } = context;
	const store = getStore(context);
	const path = params.path ?? "";
	const parts = path.split("/").filter(Boolean);

	try {
		if (request.method === "POST" && path === "reset") {
			if (!canResetRentalStore(context)) return resetForbidden();
			throw new DomainError(
				"RESET_UNAVAILABLE",
				"The permanent playground bridge does not reset persistent rental data",
				501,
			);
		}

		if (request.method === "GET" && path === "marketplace/assets") {
			const user = getOptionalUser(context);
			const items = await Promise.all(
				(await listMarketplaceAssetsQuery(store)).map((asset) => withViewer(store, user, asset)),
			);
			return jsonOk({ items });
		}

		if (
			request.method === "GET" &&
			parts[0] === "marketplace" &&
			parts[1] === "assets" &&
			parts[2]
		) {
			return jsonOk(await publicMarketplaceDetails(store, getOptionalUser(context), parts[2]));
		}

		const user = getUser(context);
		const body = request.method === "GET" ? {} : await readJson(request);

		if (request.method === "POST" && path === "owner/assets/add") {
			return jsonOk(await addAsset(store, user, parseAddAssetRequest(body)), 201);
		}

		if (request.method === "GET" && path === "owner/dashboard") {
			const [assets, inbox] = await Promise.all([
				listOwnerAssetsQuery(store, user.id),
				listOwnerInterestsQuery(store, user.id),
			]);
			return jsonOk({ assets, inbox: await enrichInterests(store, inbox) });
		}

		if (request.method === "GET" && path === "renter/dashboard") {
			const [interests, access] = await Promise.all([
				listRenterInterestsQuery(store, user.id),
				listRenterAssetAccessQuery(store, user.id),
			]);
			return jsonOk({ interests: await enrichInterests(store, interests), access });
		}

		if (request.method === "POST" && parts[0] === "owner" && parts[1] === "assets" && parts[2]) {
			if (parts[3] === "config") {
				return jsonOk(
					await updateAssetConfig(store, user, parts[2], parseUpdateAssetConfigRequest(body)),
				);
			}
			if (parts[3] === "publish-to-marketplace") {
				return jsonOk(await publishAssetToMarketplace(store, user, parts[2]));
			}
		}

		if (
			request.method === "POST" &&
			parts[0] === "marketplace" &&
			parts[1] === "assets" &&
			parts[2] &&
			parts[3] === "express-interest"
		) {
			return jsonOk(await expressInterest(store, user, parts[2], parseExpressInterestRequest(body)), 201);
		}

		if (request.method === "GET" && parts[0] === "negotiations" && parts[1]) {
			await requireInterestParticipant(store, user, parts[1]);
			const thread = await getNegotiationThreadQuery(store, parts[1]);
			return jsonOk({
				...thread,
				viewerRole: viewerRoleForInterest(user, thread?.interest as DomainRow | undefined),
			});
		}

		if (request.method === "POST" && parts[0] === "negotiations" && parts[1]) {
			if (parts[2] === "add-round") {
				return jsonOk(
					await addNegotiationRound(store, user, parts[1], parseAddNegotiationRoundRequest(body)),
					201,
				);
			}
			if (parts[2] === "accept-final-terms") {
				return jsonOk(
					await acceptFinalTerms(store, user, parts[1], parseAcceptFinalTermsRequest(body)),
					201,
				);
			}
		}

		if (request.method === "GET" && parts[0] === "agreements" && parts[1]) {
			await requireAgreementParticipant(store, user, parts[1]);
			return jsonOk(await getAgreementPrintQuery(store, parts[1]));
		}

		if (request.method === "POST" && parts[0] === "handover" && parts[1]) {
			if (parts[2] === "start") {
				return jsonOk(await startHandover(store, user, parts[1], parseStartHandoverRequest(body)), 201);
			}
			if (parts[2] === "accept") return jsonOk(await acceptHandover(store, user, parts[1]));
			if (parts[2] === "claim-damage") {
				return jsonOk(
					await claimHandoverDamage(store, user, parts[1], parseClaimHandoverDamageRequest(body)),
				);
			}
			if (parts[2] === "add-round") {
				return jsonOk(
					await addHandoverNegotiationRound(
						store,
						user,
						parts[1],
						parseAddNegotiationRoundRequest(body),
					),
					201,
				);
			}
			if (parts[2] === "settle") {
				return jsonOk(await settleHandover(store, user, parts[1], parseSettleHandoverRequest(body)));
			}
		}

		if (request.method === "GET" && parts[0] === "handover" && parts[1]) {
			await requireHandoverParticipant(store, user, parts[1]);
			return jsonOk(await getHandoverSessionQuery(store, parts[1]));
		}

		return notFound();
	} catch (error) {
		return jsonError(error);
	}
};
