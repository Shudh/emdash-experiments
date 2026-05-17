import { describe, expect, test } from "vitest";

import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
	HANDOVER_KIND,
	ROUND_KIND,
	ROUND_PHASE,
	VISIBILITY_STATE,
} from "../../src/lib/domain/constants.js";
import { MemoryDomainStore } from "../../src/lib/domain/db.js";
import type { DomainStore, UserContext } from "../../src/lib/domain/types.js";
import { POST as expressInterestPost } from "../../src/pages/api/marketplace/assets/[id]/express-interest.js";
import { POST as handoverAddRoundPost } from "../../src/pages/api/handover/[handoverId]/add-round.js";
import { POST as handoverAcceptPost } from "../../src/pages/api/handover/[handoverId]/accept.js";
import { POST as handoverClaimDamagePost } from "../../src/pages/api/handover/[handoverId]/claim-damage.js";
import { POST as handoverSettlePost } from "../../src/pages/api/handover/[handoverId]/settle.js";
import { POST as handoverStartPost } from "../../src/pages/api/handover/[assetId]/start.js";
import { POST as addRoundPost } from "../../src/pages/api/negotiations/[interestId]/add-round.js";
import { ALL as rentalBridgeAll } from "../../src/pages/api/rental/[...path].js";
import { POST as updateConfigPost } from "../../src/pages/api/owner/assets/[id]/config.js";
import { POST as publishPost } from "../../src/pages/api/owner/assets/[id]/publish-to-marketplace.js";
import { POST as addAssetPost } from "../../src/pages/api/owner/assets/add.js";

const owner: UserContext = { id: "route_owner", email: "owner@example.com", role: "author" };
const renter: UserContext = { id: "route_renter", email: "renter@example.com", role: "author" };
const unrelated: UserContext = { id: "route_unrelated", email: "other@example.com", role: "author" };

type RouteContext = Parameters<typeof addAssetPost>[0];
type RentalBridgeContext = Parameters<typeof rentalBridgeAll>[0];

function rentalHeaders(extra?: HeadersInit): HeadersInit {
	return {
		"Content-Type": "application/json",
		"X-EmDash-Request": "1",
		Origin: "http://localhost",
		...extra,
	};
}

function jsonRequest(body: unknown, url = "http://localhost/api", headers?: HeadersInit): Request {
	return new Request(url, {
		method: "POST",
		headers: headers ?? rentalHeaders(),
		body: JSON.stringify(body),
	});
}

function routeRequest(method: string, path: string, body?: unknown): Request {
	const init: RequestInit = {
		method,
		headers:
			method === "GET"
				? { Accept: "application/json", "Content-Type": "application/json" }
				: { Accept: "application/json", ...rentalHeaders() },
	};
	if (method !== "GET" && body !== undefined) init.body = JSON.stringify(body);
	return new Request(`http://localhost/api/rental/${path}`, init);
}

function context(
	store: DomainStore,
	user: UserContext | null,
	body: unknown,
	params = {},
	request?: Request,
): RouteContext {
	return {
		request: request ?? jsonRequest(body),
		locals: { user, emdash: { domainStore: store } },
		params,
	} as unknown as RouteContext;
}

function bridgeContext(
	store: DomainStore,
	user: UserContext | null,
	method: string,
	path: string,
	body?: unknown,
): RentalBridgeContext {
	return {
		request: routeRequest(method, path, body),
		url: new URL(`http://localhost/api/rental/${path}`),
		locals: { user, emdash: { domainStore: store } },
		params: { path },
	} as unknown as RentalBridgeContext;
}

async function bodyOf(response: Response) {
	return (await response.json()) as { ok: boolean; data?: any; error?: { code: string } };
}

async function createPublishedAsset(store: DomainStore) {
	const addResponse = await addAssetPost(
		context(store, owner, {
			assetKind: "flat",
			title: "Route Test Flat",
			ownerConditionsSpec: { depositPolicy: "Deposit covers chargeable damage." },
		}),
	);
	const addBody = await bodyOf(addResponse);
	const assetId = addBody.data.asset.id as string;
	await updateConfigPost(
		context(
			store,
			owner,
			{
				configSpec: { bedrooms: 2 },
				items: [{ itemKind: "fixture", itemLabel: "Door", ownerDeclaredState: "good" }],
			},
			{ id: assetId },
		),
	);
	const publishResponse = await publishPost(context(store, owner, {}, { id: assetId }));
	const publishBody = await bodyOf(publishResponse);
	return publishBody.data.asset as Record<string, unknown>;
}

async function createInterest(store: DomainStore) {
	const asset = await createPublishedAsset(store);
	const response = await expressInterestPost(
		context(
			store,
			renter,
			{
				name: "Renter",
				acceptedConditionsVersion: Number(asset.conditions_version),
				acceptedConditionsHash: String(asset.conditions_hash),
			},
			{ id: asset.id },
		),
	);
	const body = await bodyOf(response);
	return { asset, interest: body.data.interest as Record<string, unknown> };
}

describe("rental API route auth and validation", () => {
	test("unauthenticated protected route returns 401", async () => {
		const store = new MemoryDomainStore();
		const response = await addAssetPost(
			context(store, null, { assetKind: "flat", title: "No Session" }),
		);
		const body = await bodyOf(response);

		expect(response.status).toBe(401);
		expect(body.error?.code).toBe("UNAUTHORIZED");
	});

	test("invalid body returns 400 VALIDATION_ERROR", async () => {
		const store = new MemoryDomainStore();
		const response = await addAssetPost(context(store, owner, { title: "Missing kind" }));
		const body = await bodyOf(response);

		expect(response.status).toBe(400);
		expect(body.error?.code).toBe("VALIDATION_ERROR");
	});

	test("authenticated add asset uses locals.user.id for author and owner", async () => {
		const store = new MemoryDomainStore();
		const response = await addAssetPost(
			context(store, owner, { assetKind: "flat", title: "Owner Created Flat" }),
		);
		const body = await bodyOf(response);

		expect(response.status).toBe(201);
		expect(body.data.asset.author_id).toBe(owner.id);
		expect(body.data.asset.owner_user_id).toBe(owner.id);
		expect(body.data.asset.business_state).toBe(ASSET_BUSINESS_STATE.DRAFT_ASSET);
	});

	test("express interest requires accepted current owner conditions", async () => {
		const store = new MemoryDomainStore();
		const asset = await createPublishedAsset(store);

		const ownerApply = await expressInterestPost(
			context(
				store,
				owner,
				{
					name: "Owner",
					acceptedConditionsVersion: Number(asset.conditions_version),
					acceptedConditionsHash: String(asset.conditions_hash),
				},
				{ id: asset.id },
			),
		);
		expect(ownerApply.status).toBe(403);
		expect((await bodyOf(ownerApply)).error?.code).toBe("OWNER_CANNOT_EXPRESS_INTEREST");

		const missing = await expressInterestPost(
			context(store, renter, { name: "Renter" }, { id: asset.id }),
		);
		expect(missing.status).toBe(422);
		expect((await bodyOf(missing)).error?.code).toBe("CONDITIONS_ACCEPTANCE_REQUIRED");

		const stale = await expressInterestPost(
			context(
				store,
				renter,
				{ name: "Renter", acceptedConditionsVersion: 1, acceptedConditionsHash: "stale" },
				{ id: asset.id },
			),
		);
		expect(stale.status).toBe(409);
		expect((await bodyOf(stale)).error?.code).toBe("STALE_CONDITIONS_ACCEPTANCE");

		const accepted = await expressInterestPost(
			context(
				store,
				renter,
				{
					name: "Renter",
					acceptedConditionsVersion: Number(asset.conditions_version),
					acceptedConditionsHash: String(asset.conditions_hash),
				},
				{ id: asset.id },
			),
		);
		expect(accepted.status).toBe(201);
		expect((await bodyOf(accepted)).data.interest.accepted_conditions_snapshot).toEqual(
			asset.owner_conditions_spec,
		);

		const duplicate = await expressInterestPost(
			context(
				store,
				renter,
				{
					name: "Renter",
					acceptedConditionsVersion: Number(asset.conditions_version),
					acceptedConditionsHash: String(asset.conditions_hash),
				},
				{ id: asset.id },
			),
		);
		expect(duplicate.status).toBe(409);
		expect((await bodyOf(duplicate)).error?.code).toBe("INTEREST_ALREADY_SUBMITTED");
	});

	test("negotiation actor_role is derived from relationship, not request JSON", async () => {
		const store = new MemoryDomainStore();
		const { interest } = await createInterest(store);

		const roundResponse = await addRoundPost(
			context(
				store,
				owner,
				{
					roundPhase: ROUND_PHASE.PRE_AGREEMENT,
					roundKind: ROUND_KIND.QUESTION,
					actorRole: "renter",
					message: "Please upload salary proof.",
				},
				{ interestId: interest.id },
			),
		);
		const body = await bodyOf(roundResponse);

		expect(roundResponse.status).toBe(201);
		expect(body.data.round.actor_user_id).toBe(owner.id);
		expect(body.data.round.actor_role).toBe("owner");
		expect(body.data.round.status).toBe(CMS_STATUS.PUBLISHED);
	});

	test("operation policy rejects wrong negotiation actors", async () => {
		const store = new MemoryDomainStore();
		const { interest } = await createInterest(store);

		const tenantQuestion = await addRoundPost(
			context(
				store,
				renter,
				{
					roundPhase: ROUND_PHASE.PRE_AGREEMENT,
					roundKind: ROUND_KIND.QUESTION,
					message: "I should not create owner questions.",
				},
				{ interestId: interest.id },
			),
		);
		expect(tenantQuestion.status).toBe(403);
		expect((await bodyOf(tenantQuestion)).error?.code).toBe("OPERATION_NOT_ALLOWED");

		const ownerAnswer = await addRoundPost(
			context(
				store,
				owner,
				{
					roundPhase: ROUND_PHASE.PRE_AGREEMENT,
					roundKind: ROUND_KIND.ANSWER,
					message: "I should not answer as tenant.",
				},
				{ interestId: interest.id },
			),
		);
		expect(ownerAnswer.status).toBe(403);
		expect((await bodyOf(ownerAnswer)).error?.code).toBe("OPERATION_NOT_ALLOWED");

		const unrelatedRound = await addRoundPost(
			context(
				store,
				unrelated,
				{
					roundPhase: ROUND_PHASE.PRE_AGREEMENT,
					roundKind: ROUND_KIND.OFFER,
					message: "Unrelated offer.",
				},
				{ interestId: interest.id },
			),
		);
		expect(unrelatedRound.status).toBe(403);
		expect((await bodyOf(unrelatedRound)).error?.code).toBe("OPERATION_NOT_ALLOWED");
	});

	test("operation policy rejects wrong handover actors", async () => {
		const store = new MemoryDomainStore();
		const asset = await createPublishedAsset(store);
		const handover = await store.insert(COLLECTIONS.HANDOVER_SESSIONS, {
			status: CMS_STATUS.PUBLISHED,
			asset_id: asset.id,
			owner_user_id: owner.id,
			renter_user_id: renter.id,
			handover_kind: "move_out",
			handover_state: "disputed",
		});
		const check = await store.insert(COLLECTIONS.HANDOVER_ITEM_CHECKS, {
			status: CMS_STATUS.PUBLISHED,
			asset_id: asset.id,
			handover_id: handover.id,
			item_label: "Door",
			dispute_state: "disputed",
		});

		const renterClaim = await handoverClaimDamagePost(
			context(
				store,
				renter,
				{
					handoverItemCheckId: check.id,
					ownerClaimedState: "damaged",
				},
				{ handoverId: handover.id },
			),
		);
		expect(renterClaim.status).toBe(403);
		expect((await bodyOf(renterClaim)).error?.code).toBe("OPERATION_NOT_ALLOWED");

		const ownerAnswer = await handoverAddRoundPost(
			context(
				store,
				owner,
				{
					roundPhase: ROUND_PHASE.RETURN,
					roundKind: ROUND_KIND.ANSWER,
					message: "Owner cannot submit tenant damage response.",
				},
				{ handoverId: handover.id },
			),
		);
		expect(ownerAnswer.status).toBe(403);
		expect((await bodyOf(ownerAnswer)).error?.code).toBe("OPERATION_NOT_ALLOWED");

		const ownerSettle = await handoverSettlePost(
			context(
				store,
				owner,
				{
					settlementSpec: { agreedRepairCost: 1000, renterAccepted: true },
				},
				{ handoverId: handover.id },
			),
		);
		expect(ownerSettle.status).toBe(403);
		expect((await bodyOf(ownerSettle)).error?.code).toBe("OPERATION_NOT_ALLOWED");

		const unrelatedSettle = await handoverSettlePost(
			context(
				store,
				unrelated,
				{
					settlementSpec: { agreedRepairCost: 1000, renterAccepted: true },
				},
				{ handoverId: handover.id },
			),
		);
		expect(unrelatedSettle.status).toBe(403);
		expect((await bodyOf(unrelatedSettle)).error?.code).toBe("OPERATION_NOT_ALLOWED");
	});

	test("handover start and accept enforce relationship and asset state", async () => {
		const store = new MemoryDomainStore();
		const asset = await createPublishedAsset(store);

		const ownerListedMoveIn = await handoverStartPost(
			context(
				store,
				owner,
				{ handoverKind: HANDOVER_KIND.MOVE_IN },
				{ assetId: asset.id },
			),
		);
		expect(ownerListedMoveIn.status).toBe(409);
		expect((await bodyOf(ownerListedMoveIn)).error?.code).toBe("INVALID_ASSET_STATE");

		const bookedAsset = await store.update(COLLECTIONS.ASSETS, String(asset.id), {
			business_state: ASSET_BUSINESS_STATE.BOOKED,
			visibility_state: VISIBILITY_STATE.RESTRICTED,
			active_agreement_id: "agreement_route",
			active_renter_user_id: renter.id,
		});

		const renterMoveIn = await handoverStartPost(
			context(
				store,
				renter,
				{ handoverKind: HANDOVER_KIND.MOVE_IN },
				{ assetId: bookedAsset.id },
			),
		);
		expect(renterMoveIn.status).toBe(403);
		expect((await bodyOf(renterMoveIn)).error?.code).toBe("OPERATION_NOT_ALLOWED");

		const ownerMoveIn = await handoverStartPost(
			context(
				store,
				owner,
				{ handoverKind: HANDOVER_KIND.MOVE_IN },
				{ assetId: bookedAsset.id },
			),
		);
		expect(ownerMoveIn.status).toBe(201);
		const handover = (await bodyOf(ownerMoveIn)).data.handover as Record<string, unknown>;

		const ownerAcceptMoveIn = await handoverAcceptPost(
			context(store, owner, {}, { handoverId: handover.id }),
		);
		expect(ownerAcceptMoveIn.status).toBe(403);
		expect((await bodyOf(ownerAcceptMoveIn)).error?.code).toBe("OPERATION_NOT_ALLOWED");

		const unrelatedAcceptMoveIn = await handoverAcceptPost(
			context(store, unrelated, {}, { handoverId: handover.id }),
		);
		expect(unrelatedAcceptMoveIn.status).toBe(403);
		expect((await bodyOf(unrelatedAcceptMoveIn)).error?.code).toBe("OPERATION_NOT_ALLOWED");

		const renterAcceptMoveIn = await handoverAcceptPost(
			context(store, renter, {}, { handoverId: handover.id }),
		);
		expect(renterAcceptMoveIn.status).toBe(200);

		const renterMoveOut = await handoverStartPost(
			context(
				store,
				renter,
				{ handoverKind: HANDOVER_KIND.MOVE_OUT },
				{ assetId: bookedAsset.id },
			),
		);
		expect(renterMoveOut.status).toBe(403);
		expect((await bodyOf(renterMoveOut)).error?.code).toBe("OPERATION_NOT_ALLOWED");
	});

	test("rental mutation guard rejects missing CSRF header and foreign origins", async () => {
		const store = new MemoryDomainStore();
		const noCsrf = await addAssetPost(
			context(
				store,
				owner,
				{ assetKind: "flat", title: "Missing CSRF" },
				{},
				jsonRequest(
					{ assetKind: "flat", title: "Missing CSRF" },
					"http://localhost/api",
					{ "Content-Type": "application/json" },
				),
			),
		);
		expect(noCsrf.status).toBe(403);
		expect((await bodyOf(noCsrf)).error?.code).toBe("CSRF_REJECTED");

		const foreignOrigin = await addAssetPost(
			context(
				store,
				owner,
				{ assetKind: "flat", title: "Foreign Origin" },
				{},
				jsonRequest(
					{ assetKind: "flat", title: "Foreign Origin" },
					"http://localhost/api",
					rentalHeaders({ Origin: "https://evil.example" }),
				),
			),
		);
		expect(foreignOrigin.status).toBe(403);
		expect((await bodyOf(foreignOrigin)).error?.code).toBe("CSRF_REJECTED");

		const marketplace = await rentalBridgeAll(bridgeContext(store, null, "GET", "marketplace/assets"));
		expect(marketplace.status).toBe(200);
	});

	test("permanent /api/rental bridge exposes marketplace relationship metadata", async () => {
		const store = new MemoryDomainStore();
		const addResponse = await rentalBridgeAll(
			bridgeContext(store, owner, "POST", "owner/assets/add", {
				assetKind: "flat",
				title: "Permanent Bridge Flat",
				ownerConditionsSpec: { depositPolicy: "Two months deposit." },
			}),
		);
		expect(addResponse.status).toBe(201);
		const assetId = (await bodyOf(addResponse)).data.asset.id as string;

		await rentalBridgeAll(
			bridgeContext(store, owner, "POST", `owner/assets/${assetId}/config`, {
				configSpec: { bedrooms: 2 },
				conditionSpec: { walls: "fresh" },
				items: [{ itemKind: "fixture", itemLabel: "Door", ownerDeclaredState: "good" }],
			}),
		);
		const publishResponse = await rentalBridgeAll(
			bridgeContext(store, owner, "POST", `owner/assets/${assetId}/publish-to-marketplace`, {}),
		);
		expect(publishResponse.status).toBe(200);
		const publishedAsset = (await bodyOf(publishResponse)).data.asset as Record<string, unknown>;

		const ownerDetail = await rentalBridgeAll(
			bridgeContext(store, owner, "GET", `marketplace/assets/${assetId}`),
		);
		expect(ownerDetail.status).toBe(200);
		expect((await bodyOf(ownerDetail)).data.asset.viewer.relationship).toBe("owner");

		const renterDetail = await rentalBridgeAll(
			bridgeContext(store, renter, "GET", `marketplace/assets/${assetId}`),
		);
		const renterBody = await bodyOf(renterDetail);
		expect(renterBody.data.asset.viewer.canExpressInterest).toBe(true);

		const interestResponse = await rentalBridgeAll(
			bridgeContext(store, renter, "POST", `marketplace/assets/${assetId}/express-interest`, {
				name: "Route Renter",
				acceptedConditionsVersion: Number(publishedAsset.conditions_version),
				acceptedConditionsHash: String(publishedAsset.conditions_hash),
			}),
		);
		expect(interestResponse.status).toBe(201);
		const interestId = (await bodyOf(interestResponse)).data.interest.id as string;

		const agreementResponse = await rentalBridgeAll(
			bridgeContext(store, owner, "POST", `negotiations/${interestId}/accept-final-terms`, {
				agreementKind: "flat_rental",
				effectiveFrom: "2026-07-01",
			}),
		);
		expect(agreementResponse.status).toBe(201);
		const agreementId = (await bodyOf(agreementResponse)).data.agreement.id as string;

		const anonymousRestrictedDetail = await rentalBridgeAll(
			bridgeContext(store, null, "GET", `marketplace/assets/${assetId}`),
		);
		expect([403, 404]).toContain(anonymousRestrictedDetail.status);

		const unrelatedRestrictedDetail = await rentalBridgeAll(
			bridgeContext(store, unrelated, "GET", `marketplace/assets/${assetId}`),
		);
		expect([403, 404]).toContain(unrelatedRestrictedDetail.status);

		const ownerRestrictedDetail = await rentalBridgeAll(
			bridgeContext(store, owner, "GET", `marketplace/assets/${assetId}`),
		);
		expect(ownerRestrictedDetail.status).toBe(200);
		expect((await bodyOf(ownerRestrictedDetail)).data.asset.viewer.relationship).toBe("owner");

		const renterRestrictedDetail = await rentalBridgeAll(
			bridgeContext(store, renter, "GET", `marketplace/assets/${assetId}`),
		);
		expect(renterRestrictedDetail.status).toBe(200);
		expect((await bodyOf(renterRestrictedDetail)).data.asset.viewer.relationship).toBe("renter");

		expect(
			await rentalBridgeAll(bridgeContext(store, owner, "GET", `negotiations/${interestId}`)),
		).toHaveProperty("status", 200);
		expect(
			await rentalBridgeAll(bridgeContext(store, renter, "GET", `agreements/${agreementId}`)),
		).toHaveProperty("status", 200);

		const resetResponse = await rentalBridgeAll(
			bridgeContext(store, owner, "POST", "reset", {}),
		);
		expect(resetResponse.status).toBe(403);
	});
});
