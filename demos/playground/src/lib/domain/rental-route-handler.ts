import {
	parseAcceptFinalTermsRequest,
	parseAddAssetRequest,
	parseAddNegotiationRoundRequest,
	parseClaimHandoverDamageRequest,
	parseExpressInterestRequest,
	parseSettleHandoverRequest,
	parseStartHandoverRequest,
	parseUpdateAssetConfigRequest,
} from "./api-contracts.js";
import {
	requireAgreementParticipant,
	requireHandoverParticipant,
	requireInterestParticipant,
} from "./auth.js";
import { acceptFinalTerms } from "./commands/accept-final-terms.js";
import { acceptHandover } from "./commands/accept-handover.js";
import { addAsset } from "./commands/add-asset.js";
import { addHandoverNegotiationRound } from "./commands/add-handover-negotiation-round.js";
import { addNegotiationRound } from "./commands/add-negotiation-round.js";
import { claimHandoverDamage } from "./commands/claim-handover-damage.js";
import { expressInterest } from "./commands/express-interest.js";
import { publishAssetToMarketplace } from "./commands/publish-asset-to-marketplace.js";
import { settleHandover } from "./commands/settle-handover.js";
import { startHandover } from "./commands/start-handover.js";
import { updateAssetConfig } from "./commands/update-asset-config.js";
import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
	VISIBILITY_STATE,
} from "./constants.js";
import {
	assetAvailableActions,
	handoverAvailableActions,
	negotiationAvailableActions,
} from "./lifecycle.js";
import { getAgreementPrintQuery } from "./queries/agreement-print.js";
import { getHandoverSessionQuery } from "./queries/handover-session.js";
import { listMarketplaceAssetsQuery } from "./queries/marketplace.js";
import { getNegotiationThreadQuery } from "./queries/negotiation-thread.js";
import { listOwnerAssetsQuery, listOwnerInterestsQuery } from "./queries/owner-dashboard.js";
import {
	listRenterAssetAccessQuery,
	listRenterInterestsQuery,
} from "./queries/renter-dashboard.js";
import {
	resolveAssetRelationship,
	resolveHandoverRelationship,
	resolveInterestRelationship,
} from "./relationship.js";
import type { DomainRow, DomainStore, UserContext } from "./types.js";
import { DomainError, asJsonObject, asString } from "./types.js";

export type RentalResetPolicy = "disabled" | "enabled-memory-only";

export type RentalRouteHandlerInput = {
	request: Request;
	path: string;
	store: DomainStore;
	user: UserContext | null;
	resetPolicy: RentalResetPolicy;
	resetStore?: () => DomainStore;
};

export async function handleRentalRoute(input: RentalRouteHandlerInput): Promise<Response> {
	const parts = input.path.split("/").filter(Boolean);
	try {
		if (input.request.method === "POST" && input.path === "reset") {
			if (input.resetPolicy === "enabled-memory-only" && input.resetStore) {
				input.resetStore();
				return jsonOk({ reset: true });
			}
			throw new DomainError("FORBIDDEN", "Rental reset is only available in local dev", 403);
		}

		if (input.request.method === "GET" && input.path === "marketplace/assets") {
			const items = await Promise.all(
				(await listMarketplaceAssetsQuery(input.store)).map((asset) =>
					withViewer(input.store, input.user, asset),
				),
			);
			return jsonOk({ items });
		}

		if (
			input.request.method === "GET" &&
			parts[0] === "marketplace" &&
			parts[1] === "assets" &&
			parts[2]
		) {
			return jsonOk(await publicMarketplaceDetails(input.store, input.user, parts[2]));
		}

		const user = requireRouteUser(input.user);
		const body = input.request.method === "GET" ? {} : await readJson(input.request);

		if (input.request.method === "POST" && input.path === "owner/assets/add") {
			return jsonOk(await addAsset(input.store, user, parseAddAssetRequest(body)), 201);
		}

		if (input.request.method === "GET" && input.path === "owner/dashboard") {
			const [assets, inbox] = await Promise.all([
				listOwnerAssetsQuery(input.store, user.id),
				listOwnerInterestsQuery(input.store, user.id),
			]);
			return jsonOk({
				assets: assets.map((asset) => ({
					...asset,
					availableActions: assetAvailableActions(asset, "owner", {
						allowLegacyRentedMoveOut: true,
					}),
				})),
				inbox: await enrichInterests(input.store, inbox),
			});
		}

		if (input.request.method === "GET" && input.path === "renter/dashboard") {
			const [interests, access] = await Promise.all([
				listRenterInterestsQuery(input.store, user.id),
				listRenterAssetAccessQuery(input.store, user.id),
			]);
			return jsonOk({ interests: await enrichInterests(input.store, interests), access });
		}

		if (input.request.method === "POST" && parts[0] === "owner" && parts[1] === "assets" && parts[2]) {
			if (parts[3] === "config") {
				return jsonOk(
					await updateAssetConfig(input.store, user, parts[2], parseUpdateAssetConfigRequest(body)),
				);
			}
			if (parts[3] === "publish-to-marketplace") {
				return jsonOk(await publishAssetToMarketplace(input.store, user, parts[2]));
			}
		}

		if (
			input.request.method === "POST" &&
			parts[0] === "marketplace" &&
			parts[1] === "assets" &&
			parts[2] &&
			parts[3] === "express-interest"
		) {
			return jsonOk(
				await expressInterest(input.store, user, parts[2], parseExpressInterestRequest(body)),
				201,
			);
		}

		if (input.request.method === "GET" && parts[0] === "negotiations" && parts[1]) {
			await requireInterestParticipant(input.store, user, parts[1]);
			const thread = await getNegotiationThreadQuery(input.store, parts[1]);
			const relationship = await resolveInterestRelationship(input.store, user, parts[1]);
			return jsonOk({
				...thread,
				viewerRole: threadViewerRole(relationship.role),
				pendingRequestCount: countPendingRequestCards((thread?.rounds as DomainRow[] | undefined) ?? []),
				availableActions: negotiationAvailableActions(relationship.role),
			});
		}

		if (input.request.method === "POST" && parts[0] === "negotiations" && parts[1]) {
			if (parts[2] === "add-round") {
				return jsonOk(
					await addNegotiationRound(
						input.store,
						user,
						parts[1],
						parseAddNegotiationRoundRequest(body),
					),
					201,
				);
			}
			if (parts[2] === "accept-final-terms") {
				return jsonOk(
					await acceptFinalTerms(input.store, user, parts[1], parseAcceptFinalTermsRequest(body)),
					201,
				);
			}
		}

		if (input.request.method === "GET" && parts[0] === "agreements" && parts[1]) {
			await requireAgreementParticipant(input.store, user, parts[1]);
			return jsonOk(await getAgreementPrintQuery(input.store, parts[1]));
		}

		if (input.request.method === "POST" && parts[0] === "handover" && parts[1]) {
			if (parts[2] === "start") {
				return jsonOk(
					await startHandover(input.store, user, parts[1], parseStartHandoverRequest(body)),
					201,
				);
			}
			if (parts[2] === "accept") return jsonOk(await acceptHandover(input.store, user, parts[1]));
			if (parts[2] === "claim-damage") {
				return jsonOk(
					await claimHandoverDamage(input.store, user, parts[1], parseClaimHandoverDamageRequest(body)),
				);
			}
			if (parts[2] === "add-round") {
				return jsonOk(
					await addHandoverNegotiationRound(
						input.store,
						user,
						parts[1],
						parseAddNegotiationRoundRequest(body),
					),
					201,
				);
			}
			if (parts[2] === "settle") {
				return jsonOk(await settleHandover(input.store, user, parts[1], parseSettleHandoverRequest(body)));
			}
		}

		if (input.request.method === "GET" && parts[0] === "handover" && parts[1]) {
			await requireHandoverParticipant(input.store, user, parts[1]);
			const session = await getHandoverSessionQuery(input.store, parts[1]);
			const relationship = await resolveHandoverRelationship(input.store, user, parts[1]);
			return jsonOk({
				...session,
				viewerRole: threadViewerRole(relationship.role),
				availableActions: session?.handover
					? handoverAvailableActions(session.handover, relationship.role)
					: [],
			});
		}

		return jsonError(new DomainError("NOT_FOUND", "Not found", 404));
	} catch (error) {
		return jsonError(error);
	}
}

async function readJson(request: Request): Promise<unknown> {
	const text = await request.text();
	if (!text.trim()) return {};
	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new DomainError("INVALID_JSON", "Request body must be valid JSON", 400, { cause: error });
	}
}

function requireRouteUser(user: UserContext | null): UserContext {
	if (!user?.id) throw new DomainError("UNAUTHORIZED", "Login required", 401);
	return user;
}

async function publicMarketplaceDetails(
	store: DomainStore,
	user: UserContext | null,
	assetId: string,
) {
	const relationship = await resolveAssetRelationship(store, user, assetId);
	const asset = relationship.asset;
	const isPublicMarketplaceAsset =
		asString(asset.status) === CMS_STATUS.PUBLISHED &&
		asString(asset.business_state) === ASSET_BUSINESS_STATE.LISTED &&
		asString(asset.visibility_state) === VISIBILITY_STATE.MARKETPLACE;
	const canReadRestrictedDetail =
		relationship.role === "owner" ||
		relationship.role === "renter" ||
		relationship.role === "applicant";
	if (!isPublicMarketplaceAsset && !canReadRestrictedDetail) {
		throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	}
	return {
		asset: { ...asset, viewer: viewerFromRelationship(relationship) },
		ownerConditions: {
			version: asset.conditions_version,
			hash: asset.conditions_hash,
			spec: asset.owner_conditions_spec,
		},
	};
}

async function withViewer(
	store: DomainStore,
	user: UserContext | null,
	asset: DomainRow,
): Promise<DomainRow & { viewer: Record<string, unknown>; availableActions: unknown[] }> {
	const relationship = await resolveAssetRelationship(store, user, asset.id);
	return {
		...asset,
		viewer: viewerFromRelationship(relationship),
		availableActions: assetAvailableActions(asset, relationship.role, {
			allowLegacyRentedMoveOut: true,
		}),
	};
}

function viewerFromRelationship(relationship: Awaited<ReturnType<typeof resolveAssetRelationship>>) {
	if (relationship.role === "anonymous") {
		return { relationship: "anonymous", canExpressInterest: false };
	}
	if (relationship.role === "owner") {
		return { relationship: "owner", canExpressInterest: false, message: "This is your asset" };
	}
	if (relationship.role === "renter") {
		return { relationship: "renter", canExpressInterest: false };
	}
	if (relationship.role === "applicant") {
		return {
			relationship: "interested_applicant",
			canExpressInterest: false,
			interestId: relationship.interest?.id,
			interestState: relationship.interest?.interest_state,
		};
	}
	return { relationship: "logged_in", canExpressInterest: true };
}

async function enrichInterests(store: DomainStore, interests: DomainRow[]) {
	return Promise.all(
		interests.map(async (interest) => {
			const asset =
				typeof interest.asset_id === "string"
					? await store.get(COLLECTIONS.ASSETS, interest.asset_id)
					: null;
			const rounds = await store.list(
				COLLECTIONS.NEGOTIATION_ROUNDS,
				{ interest_id: interest.id },
				{ orderBy: "created_at", direction: "asc", limit: 200 },
			);
			return {
				...interest,
				asset_title: asset?.title ?? null,
				asset_location_label: asset?.location_label ?? null,
				asset,
				pending_request_count: countPendingRequestCards(rounds),
			};
		}),
	);
}

function threadViewerRole(role: string): string {
	return role === "applicant" ? "renter" : role;
}

function countPendingRequestCards(rounds: DomainRow[]): number {
	const answered = new Set(
		rounds
			.map((round) => asString(asJsonObject(asJsonObject(round.terms_spec).cardAnswer).cardId))
			.filter(Boolean),
	);
	return rounds.filter((round) => {
		const card = asJsonObject(asJsonObject(round.terms_spec).card);
		const cardId = asString(card.cardId);
		return cardId && !answered.has(cardId) && asString(card.cardState) !== "answered";
	}).length;
}

function jsonOk(data: unknown, status = 200): Response {
	return Response.json({ ok: true, data }, { status });
}

function jsonError(error: unknown): Response {
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
