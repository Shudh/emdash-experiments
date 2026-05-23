import { describe, expect, it } from "vitest";

import { withRentalMutationGuard } from "../../src/pages/api/_domain-route-utils.js";
import { handleWorkflowRentalRoute } from "../../src/lib/wf1/api/handler.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../../src/lib/wf1/store/collections.js";
import { createWf1Store, eva, rakesh, WF1_TEST_WORKFLOWS } from "./test-helpers.js";

async function json(response: Response) {
	return response.json() as Promise<{
		ok: boolean;
		data?: Record<string, unknown>;
		error?: { code: string; message: string };
	}>;
}

function request(method: string, body?: unknown, headers?: HeadersInit): Request {
	return new Request("http://localhost/api/wf1-rental/test", {
		method,
		headers: {
			...(body === undefined ? {} : { "content-type": "application/json" }),
			...headers,
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

describe("WF1 API routes", () => {
	it("allows marketplace reads without a user", async () => {
		const response = await handleWorkflowRentalRoute({
			request: request("GET"),
			path: "marketplace/assets",
			store: createWf1Store(),
			user: null,
		});

		expect(response.status).toBe(200);
		const body = await json(response);
		expect(body.ok).toBe(true);
		expect(body.data?.items).toEqual([]);
	});

	it("rejects mutations without the EmDash mutation header", async () => {
		await expect(
			withRentalMutationGuard(
				{
					request: request("POST", { title: "No CSRF" }),
					locals: {},
					params: {},
				},
				async () => true,
			),
		).rejects.toMatchObject({ code: "CSRF_REJECTED", status: 403 });
	});

	it("returns INVALID_JSON for malformed request JSON", async () => {
		const response = await handleWorkflowRentalRoute({
			request: new Request("http://localhost/api/wf1-rental/owner/assets/add", {
				method: "POST",
				body: "{",
			}),
			path: "owner/assets/add",
			store: createWf1Store(),
			user: eva,
		});

		expect(response.status).toBe(400);
		expect(await json(response)).toMatchObject({
			ok: false,
			error: { code: "INVALID_JSON" },
		});
	});

	it("creates, publishes, accepts interest, and returns a workspace projection", async () => {
		const store = createWf1Store();
		const createResponse = await handleWorkflowRentalRoute({
			request: request("POST", {
				assetKind: "flat",
				title: "Route Test Flat",
				locationLabel: "Bangalore",
				publicPrice: 42_000,
				ownerConditionsSpec: { depositPolicy: "One month deposit." },
			}),
			path: "owner/assets/add",
			store,
			user: eva,
		});
		expect(createResponse.status).toBe(201);
		const created = await json(createResponse);
		const createdAsset = created.data?.asset as { id: string } | undefined;
		expect(createdAsset).toBeDefined();
		const assetId = createdAsset?.id ?? "";
		expect(await store.get(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId)).toMatchObject({
			title: "Route Test Flat",
		});

		const publishResponse = await handleWorkflowRentalRoute({
			request: request("POST"),
			path: `owner/assets/${assetId}/publish-to-marketplace`,
			store,
			user: eva,
		});
		expect(publishResponse.status).toBe(200);
		const published = await json(publishResponse);
		const publishedAsset = published.data?.asset as {
			conditions_hash: string;
			conditions_version: number;
			visibility_state: string;
		};
		expect(publishedAsset.visibility_state).toBe("marketplace");

		const interestResponse = await handleWorkflowRentalRoute({
			request: request("POST", {
				name: "Rakesh",
				officialEmail: "tenant_manual_created_1@example.com",
				message: "I am interested.",
				acceptedConditionsVersion: publishedAsset.conditions_version,
				acceptedConditionsHash: publishedAsset.conditions_hash,
				workflowDefinitionId: WF1_TEST_WORKFLOWS.rentalApplicationFormBasic.workflowDefinitionId,
				workflowDefinitionVersion:
					WF1_TEST_WORKFLOWS.rentalApplicationFormBasic.workflowDefinitionVersion,
			}),
			path: `marketplace/assets/${assetId}/express-interest`,
			store,
			user: rakesh,
		});
		expect(interestResponse.status).toBe(201);
		const interest = await json(interestResponse);
		const workflowInstanceId = interest.data?.workflowInstanceId as string;
		expect(await store.list(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS)).toHaveLength(1);
		expect(await store.list(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES)).toHaveLength(1);

		const workspaceResponse = await handleWorkflowRentalRoute({
			request: request("GET"),
			path: `workspaces/${workflowInstanceId}`,
			store,
			user: rakesh,
		});
		expect(workspaceResponse.status).toBe(200);
		const workspace = await json(workspaceResponse);
		expect(workspace.data?.projection).toMatchObject({
			applicationState: { id: "application_under_review" },
			assetState: { id: "listed" },
		});
	});
});
