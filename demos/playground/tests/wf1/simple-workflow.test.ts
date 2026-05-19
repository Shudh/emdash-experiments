import { describe, expect, test } from "vitest";

import { answerWorkflowCard } from "../../src/lib/wf1/commands/answer-workflow-card.js";
import { createWorkflowCard } from "../../src/lib/wf1/commands/create-workflow-card.js";
import { runWorkflowAction } from "../../src/lib/wf1/commands/run-workflow-action.js";
import { workflowDefinitionById } from "../../src/lib/wf1/definitions/registry.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../../src/lib/wf1/store/collections.js";
import { eva, rakesh, seedSimpleApplication } from "./test-helpers.js";

describe("simple-available-rented@1", () => {
	test("defines the teaching model", () => {
		const definition = workflowDefinitionById("simple-available-rented", 1);
		expect(definition.initialState).toBe("available");
		expect(definition.cardTypes.owner_task.allowedAssetStates).toContain("listed");
		expect(definition.cardTypes.owner_task.transitions).toEqual([]);
		expect(definition.cardTypes.payment_proof_task.transitions).toEqual([]);
		expect(definition.actions.mark_rented.transitions[0]).toMatchObject({
			nextWorkflowState: "rented",
			nextAssetState: "rented",
		});
	});

	test("cards do not change application state and action changes application and asset state", async () => {
		const { store, instance } = await seedSimpleApplication();
		const ownerTaskWorkspace = await createWorkflowCard(store, eva, {
			workflowInstanceId: instance.id,
			cardType: "owner_task",
			prompt: "Please confirm your move-in date.",
		});
		expect(ownerTaskWorkspace.instance?.workflow_state).toBe("available");
		const card = ownerTaskWorkspace.cards.find((item) => item.card_type === "owner_task");
		expect(card).toBeTruthy();
		const answered = await answerWorkflowCard(store, rakesh, card!.id, {
			answer: { text: "I can move in next week." },
			message: "I can move in next week.",
		});
		expect(answered.instance?.workflow_state).toBe("available");
		const rented = await runWorkflowAction(store, eva, {
			workflowInstanceId: instance.id,
			actionId: "mark_rented",
		});
		expect(rented.instance?.workflow_state).toBe("rented");
		expect(rented.asset.business_state).toBe("rented");
	});

	test("unresolved payment proof blocks mark_rented until Rakesh answers", async () => {
		const { store, instance } = await seedSimpleApplication();
		const paymentTaskWorkspace = await createWorkflowCard(store, eva, {
			workflowInstanceId: instance.id,
			cardType: "payment_proof_task",
			prompt: "Please submit payment proof.",
		});
		await expect(
			runWorkflowAction(store, eva, {
				workflowInstanceId: instance.id,
				actionId: "mark_rented",
			}),
		).rejects.toMatchObject({ code: "UNRESOLVED_REQUIRED_CARDS" });
		const paymentCard = paymentTaskWorkspace.cards.find(
			(item) => item.card_type === "payment_proof_task",
		);
		expect(paymentCard).toBeTruthy();
		await answerWorkflowCard(store, rakesh, paymentCard!.id, {
			answer: { reference: "UPI-TEST-001" },
			attachments: [{ storageKey: "local-proof.pdf", mimeType: "application/pdf" }],
		});
		const rented = await runWorkflowAction(store, eva, {
			workflowInstanceId: instance.id,
			actionId: "mark_rented",
		});
		expect(rented.instance?.workflow_state).toBe("rented");
		expect(
			(
				await store.list(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS, {
					workflow_instance_id: instance.id,
				})
			).find((card) => card.card_type === "payment_proof_task")?.card_state,
		).toBe("answered");
	});
});
