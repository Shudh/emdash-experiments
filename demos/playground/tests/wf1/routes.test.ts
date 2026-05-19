import { describe, expect, test } from "vitest";

import { handleWorkflowRentalRoute } from "../../src/lib/wf1/api/handler.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../../src/lib/wf1/store/collections.js";
import { eva, kavya, rakesh, seedSimpleApplication } from "./test-helpers.js";

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

	test("Eva creates tasks, Rakesh answers, and Eva marks rented", async () => {
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
		);

		const wrongAnswer = await routeJson({
			request: jsonRequest("POST", { answer: { text: "Wrong applicant" } }),
			path: `workflow/cards/${ownerTaskCard.id}/answer`,
			store,
			user: kavya,
		});
		expect(wrongAnswer.response.status).toBe(403);

		const answeredOwnerTask = await routeJson({
			request: jsonRequest("POST", {
				answer: { text: "I can move in next week." },
				message: "I can move in next week.",
			}),
			path: `workflow/cards/${ownerTaskCard.id}/answer`,
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
		const paymentCard = paymentTask.payload.data.cards.find(
			(card: Record<string, unknown>) => card.card_type === "payment_proof_task",
		);
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

		await routeJson({
			request: jsonRequest("POST", {
				answer: { reference: "UPI-TEST-001" },
				attachments: [{ storageKey: "proof.pdf", mimeType: "application/pdf" }],
			}),
			path: `workflow/cards/${paymentCard.id}/answer`,
			store,
			user: rakesh,
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
