import { describe, expect, test } from "vitest";

import { answerWorkflowCard } from "../../../src/lib/wf1/commands/answer-workflow-card.js";
import { createWorkflowCard } from "../../../src/lib/wf1/commands/create-workflow-card.js";
import { runWorkflowAction } from "../../../src/lib/wf1/commands/run-workflow-action.js";
import { workflowDefinitionById } from "../../../src/lib/wf1/definitions/registry.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../../../src/lib/wf1/store/collections.js";
import { eva, rakesh, seedSimpleApplication, WF1_TEST_WORKFLOWS } from "../test-helpers.js";

const PDF_ATTACHMENT = {
	mediaId: "media_old_workflow_1",
	storageKey: "wf1/test/old-workflow-proof.pdf",
	mimeType: "application/pdf",
	filename: "old-workflow-proof.pdf",
	url: "/_emdash/api/media/file/wf1/test/old-workflow-proof.pdf",
};

describe("simple-available-rented@1", () => {
	test("definition remains registered for rollback and old instances", () => {
		const definition = workflowDefinitionById("simple-available-rented", 1);

		expect(definition.initialState).toBe("available");
		expect(definition.cardTypes.owner_task.allowedAssetStates).toContain("listed");
		expect(definition.cardTypes.payment_proof_task.allowedAssetStates).toContain("listed");
		expect(definition.actions.mark_rented.transitions[0]).toMatchObject({
			nextWorkflowState: "rented",
			nextAssetState: "rented",
		});
	});

	test("old workflow remains executable with old card names and old action name", async () => {
		const workflow = WF1_TEST_WORKFLOWS.simpleAvailableRented;
		const { store, instance } = await seedSimpleApplication(undefined, workflow);

		expect(instance.workflow_state).toBe(workflow.initialApplicationFormState);

		const ownerTaskWorkspace = await createWorkflowCard(store, eva, {
			workflowInstanceId: instance.id,
			cardType: workflow.plainTextCardType,
			prompt: "Please confirm your move-in date.",
		});

		expect(ownerTaskWorkspace.instance?.workflow_state).toBe(workflow.initialApplicationFormState);

		const ownerTaskCard = ownerTaskWorkspace.cards.find(
			(card) => card.card_type === workflow.plainTextCardType,
		);
		expect(ownerTaskCard).toBeTruthy();

		await answerWorkflowCard(store, rakesh, ownerTaskCard!.id, {
			answer: { text: "I can move in next week." },
			message: "I can move in next week.",
		});

		const evidenceWorkspace = await createWorkflowCard(store, eva, {
			workflowInstanceId: instance.id,
			cardType: workflow.requiredEvidenceCardType,
			prompt: "Please submit payment proof.",
		});

		const evidenceCard = evidenceWorkspace.cards.find(
			(card) => card.card_type === workflow.requiredEvidenceCardType,
		);
		expect(evidenceCard).toBeTruthy();

		await expect(
			runWorkflowAction(store, eva, {
				workflowInstanceId: instance.id,
				actionId: workflow.acceptActionId,
			}),
		).rejects.toMatchObject({ code: "UNRESOLVED_REQUIRED_CARDS" });

		await expect(
			answerWorkflowCard(store, rakesh, evidenceCard!.id, {
				answer: workflow.missingEvidenceAnswer,
			}),
		).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });

		await answerWorkflowCard(store, rakesh, evidenceCard!.id, {
			answer: workflow.requiredEvidenceAnswer,
			attachments: [PDF_ATTACHMENT],
		});

		const responses = await store.list(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARD_RESPONSES, {
			card_id: evidenceCard!.id,
		});

		expect(responses).toHaveLength(1);
		expect(responses[0]?.answer_value).toMatchObject({
			...workflow.requiredEvidenceAnswerMatch,
			attachments: [PDF_ATTACHMENT],
		});

		const rented = await runWorkflowAction(store, eva, {
			workflowInstanceId: instance.id,
			actionId: workflow.acceptActionId,
		});

		expect(rented.instance?.workflow_state).toBe(workflow.acceptedApplicationFormState);
		expect(rented.asset.business_state).toBe("rented");
	});
});
