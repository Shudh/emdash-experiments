import { describe, expect, test } from "vitest";

import { handleWorkflowRentalRoute } from "../../src/lib/wf1/api/handler.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../../src/lib/wf1/store/collections.js";
import { createWf1Store, eva, kavya, rakesh, seedSimpleApplication } from "./test-helpers.js";

function jsonRequest(method: string, body?: Record<string, unknown>) {
	return new Request("http://local.test/api/wf1-rental", {
		method,
		body: body ? JSON.stringify(body) : undefined,
	});
}

async function routeJson(input: Parameters<typeof handleWorkflowRentalRoute>[0]) {
	const response = await handleWorkflowRentalRoute(input);
	const payload = await response.json();
	return { response, payload };
}

function findAsset(items: Array<Record<string, unknown>>, assetId: string) {
	const asset = items.find((item) => item.id === assetId);
	expect(asset).toBeTruthy();
	return asset as Record<string, unknown>;
}

function viewerOf(asset: Record<string, unknown>) {
	expect(asset.viewer).toBeTruthy();
	expect(typeof asset.viewer).toBe("object");
	return asset.viewer as Record<string, unknown>;
}

describe("wf1 API routes", () => {
	test("workspace route exposes Asset State and Application State", async () => {
		const { store, instance } = await seedSimpleApplication();

		const { response, payload } = await routeJson({
			request: jsonRequest("GET"),
			path: `workspaces/${instance.id}`,
			store,
			user: eva,
		});

		expect(response.status).toBe(200);
		expect(payload.data.projection.assetState.id).toBe("listed");
		expect(payload.data.projection.applicationState.id).toBe("available");
	});

	test("Eva can create, configure, and publish a flat without optional media", async () => {
		const store = createWf1Store();

		const created = await routeJson({
			request: jsonRequest("POST", {
				assetKind: "flat",
				title: "WF1 Eva No Media Flat",
				locationLabel: "Bangalore",
				publicPrice: 60_000,
				ownerConditionsSpec: {
					depositPolicy: "Two months deposit covers chargeable damage.",
				},
			}),
			path: "owner/assets/add",
			store,
			user: eva,
		});

		expect(created.response.status).toBe(201);
		const asset = created.payload.data.asset as Record<string, unknown>;

		const configured = await routeJson({
			request: jsonRequest("POST", {
				publicPrice: 60_000,
				minimumMonths: 11,
				configSpec: {
					bedrooms: 2,
					furnishing: "semi_furnished",
				},
				conditionSpec: {
					walls: "freshly_painted",
				},
				ownerConditionsSpec: {
					depositPolicy: "Two months deposit covers chargeable damage.",
				},
				items: [
					{
						itemKind: "fixture",
						itemLabel: "Door",
						ownerDeclaredState: "good",
					},
				],
			}),
			path: `owner/assets/${String(asset.id)}/config`,
			store,
			user: eva,
		});

		expect(configured.response.status).toBe(200);

		const published = await routeJson({
			request: jsonRequest("POST"),
			path: `owner/assets/${String(asset.id)}/publish-to-marketplace`,
			store,
			user: eva,
		});

		expect(published.response.status).toBe(200);
		expect(published.payload.data.asset.business_state).toBe("listed");
		expect(published.payload.data.asset.visibility_state).toBe("marketplace");

		const marketplace = await routeJson({
			request: jsonRequest("GET"),
			path: "marketplace/assets",
			store,
			user: null,
		});

		expect(marketplace.response.status).toBe(200);
		expect(findAsset(marketplace.payload.data.items, String(asset.id))).toBeTruthy();
	});

	test("marketplace viewer data supports anonymous, owner, applicant, and apply CTA states", async () => {
		const { store, asset, instance } = await seedSimpleApplication();

		const anonymousResult = await routeJson({
			request: jsonRequest("GET"),
			path: "marketplace/assets",
			store,
			user: null,
		});
		expect(anonymousResult.response.status).toBe(200);
		const anonymousAsset = findAsset(anonymousResult.payload.data.items, asset.id);
		expect(viewerOf(anonymousAsset)).toMatchObject({
			relationship: "anonymous",
			canExpressInterest: false,
		});

		const ownerResult = await routeJson({
			request: jsonRequest("GET"),
			path: "marketplace/assets",
			store,
			user: eva,
		});
		expect(ownerResult.response.status).toBe(200);
		const ownerAsset = findAsset(ownerResult.payload.data.items, asset.id);
		expect(viewerOf(ownerAsset)).toMatchObject({
			relationship: "owner",
			canExpressInterest: false,
		});

		const unrelatedResult = await routeJson({
			request: jsonRequest("GET"),
			path: "marketplace/assets",
			store,
			user: kavya,
		});
		expect(unrelatedResult.response.status).toBe(200);
		const unrelatedAsset = findAsset(unrelatedResult.payload.data.items, asset.id);
		expect(viewerOf(unrelatedAsset)).toMatchObject({
			relationship: "logged_in",
			canExpressInterest: true,
		});

		const applicantResult = await routeJson({
			request: jsonRequest("GET"),
			path: "marketplace/assets",
			store,
			user: rakesh,
		});
		expect(applicantResult.response.status).toBe(200);
		const applicantAsset = findAsset(applicantResult.payload.data.items, asset.id);
		expect(viewerOf(applicantAsset)).toMatchObject({
			relationship: "interested_applicant",
			canExpressInterest: false,
			workflowInstanceId: instance.id,
		});
	});

	test("marketplace detail includes workspace id for an existing applicant", async () => {
		const { store, asset, instance } = await seedSimpleApplication();

		const { response, payload } = await routeJson({
			request: jsonRequest("GET"),
			path: `marketplace/assets/${asset.id}`,
			store,
			user: rakesh,
		});

		expect(response.status).toBe(200);
		expect(payload.data.asset.viewer).toMatchObject({
			relationship: "interested_applicant",
			canExpressInterest: false,
			workflowInstanceId: instance.id,
		});
	});

	test("Eva creates tasks, Rakesh answers with required evidence, and Eva marks rented", async () => {
		const { store, instance } = await seedSimpleApplication();

		const ownerTask = await routeJson({
			request: jsonRequest("POST", {
				workflowInstanceId: instance.id,
				cardType: "owner_task",
				prompt: "Please confirm your move-in date.",
			}),
			path: "workflow/cards",
			store,
			user: eva,
		});

		expect(ownerTask.response.status).toBe(201);

		const ownerTaskCard = ownerTask.payload.data.cards.find(
			(card: Record<string, unknown>) => card.card_type === "owner_task",
		) as Record<string, unknown> | undefined;

		expect(ownerTaskCard).toBeTruthy();

		const wrongAnswer = await routeJson({
			request: jsonRequest("POST", {
				answer: { text: "Wrong applicant" },
			}),
			path: `workflow/cards/${String(ownerTaskCard!.id)}/answer`,
			store,
			user: kavya,
		});

		expect(wrongAnswer.response.status).toBe(403);

		const answeredOwnerTask = await routeJson({
			request: jsonRequest("POST", {
				answer: { text: "I can move in next week." },
				message: "I can move in next week.",
			}),
			path: `workflow/cards/${String(ownerTaskCard!.id)}/answer`,
			store,
			user: rakesh,
		});

		expect(answeredOwnerTask.response.status).toBe(201);

		const paymentTask = await routeJson({
			request: jsonRequest("POST", {
				workflowInstanceId: instance.id,
				cardType: "payment_proof_task",
				prompt: "Please submit payment proof.",
			}),
			path: "workflow/cards",
			store,
			user: eva,
		});

		expect(paymentTask.response.status).toBe(201);

		const paymentCard = paymentTask.payload.data.cards.find(
			(card: Record<string, unknown>) => card.card_type === "payment_proof_task",
		) as Record<string, unknown> | undefined;

		expect(paymentCard).toBeTruthy();

		const missingPaymentProof = await routeJson({
			request: jsonRequest("POST", {
				answer: { reference: "UPI-MISSING-EVIDENCE" },
			}),
			path: `workflow/cards/${String(paymentCard!.id)}/answer`,
			store,
			user: rakesh,
		});

		expect(missingPaymentProof.response.status).toBe(422);
		expect(missingPaymentProof.payload.error.code).toBe("EVIDENCE_REQUIRED");

		const blocked = await routeJson({
			request: jsonRequest("POST", {
				workflowInstanceId: instance.id,
				actionId: "mark_rented",
			}),
			path: "workflow/actions",
			store,
			user: eva,
		});

		expect(blocked.response.status).toBe(409);

		const paymentAttachment = {
			mediaId: "media_payment_1",
			storageKey: "wf1/test/payment-proof.pdf",
			mimeType: "application/pdf",
			filename: "payment-proof.pdf",
			url: "/_emdash/api/media/file/wf1/test/payment-proof.pdf",
		};

		const answeredPayment = await routeJson({
			request: jsonRequest("POST", {
				answer: { reference: "UPI-TEST-001" },
				attachments: [paymentAttachment],
			}),
			path: `workflow/cards/${String(paymentCard!.id)}/answer`,
			store,
			user: rakesh,
		});

		expect(answeredPayment.response.status).toBe(201);

		const paymentResponses = await store.list(
			WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARD_RESPONSES,
			{
				card_id: String(paymentCard!.id),
			},
		);

		expect(paymentResponses).toHaveLength(1);
		expect(paymentResponses[0]?.answer_value).toMatchObject({
			reference: "UPI-TEST-001",
			attachments: [paymentAttachment],
		});

		const rented = await routeJson({
			request: jsonRequest("POST", {
				workflowInstanceId: instance.id,
				actionId: "mark_rented",
			}),
			path: "workflow/actions",
			store,
			user: eva,
		});

		expect(rented.response.status).toBe(200);
		expect(rented.payload.data.asset.business_state).toBe("rented");
		expect(rented.payload.data.instance.workflow_state).toBe("rented");
	});

	test("unrelated user cannot open private workspace", async () => {
		const { store, instance } = await seedSimpleApplication();

		const result = await routeJson({
			request: jsonRequest("GET"),
			path: `workspaces/${instance.id}`,
			store,
			user: kavya,
		});

		expect(result.response.status).toBe(403);
	});

	test("express-interest accepts explicit workflow definition", async () => {
		const { store, asset } = await seedSimpleApplication();
		const secondApplicant = { id: "ramu", email: "ramu@example.com", name: "Ramu" };

		const result = await routeJson({
			request: jsonRequest("POST", {
				name: "Ramu",
				acceptedConditionsVersion: Number(asset.conditions_version),
				acceptedConditionsHash: String(asset.conditions_hash),
				workflowDefinitionId: "simple-available-rented",
				workflowDefinitionVersion: 1,
			}),
			path: `marketplace/assets/${asset.id}/express-interest`,
			store,
			user: secondApplicant,
		});

		expect(result.response.status).toBe(201);
		expect(result.payload.data.instance.definition_id).toBe("simple-available-rented");

		const instances = await store.list(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, {
			asset_id: asset.id,
		});

		expect(instances).toHaveLength(2);
	});
});