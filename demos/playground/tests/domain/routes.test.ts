import { describe, expect, test } from "vitest";

import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	ROUND_KIND,
	ROUND_PHASE,
} from "../../src/lib/domain/constants.js";
import { MemoryDomainStore } from "../../src/lib/domain/db.js";
import type { DomainStore, UserContext } from "../../src/lib/domain/types.js";
import { POST as expressInterestPost } from "../../src/pages/api/marketplace/assets/[id]/express-interest.js";
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

function jsonRequest(body: unknown, url = "http://localhost/api"): Request {
	return new Request(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

function routeRequest(method: string, path: string, body?: unknown): Request {
	const init: RequestInit = {
		method,
		headers: { Accept: "application/json", "Content-Type": "application/json" },
	};
	if (method !== "GET" && body !== undefined) init.body = JSON.stringify(body);
	return new Request(`http://localhost/api/rental/${path}`, init);
}

function context(
	store: DomainStore,
	user: UserContext | null,
	body: unknown,
	params = {},
): RouteContext {
	return {
		request: jsonRequest(body),
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
		const asset = await createPublishedAsset(store);
		const interestResponse = await expressInterestPost(
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
		const interest = (await bodyOf(interestResponse)).data.interest;

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
