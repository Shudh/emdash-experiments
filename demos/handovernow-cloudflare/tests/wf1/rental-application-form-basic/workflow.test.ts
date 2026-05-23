import { describe, expect, test } from "vitest";

import { answerWorkflowCard } from "../../../src/lib/wf1/commands/answer-workflow-card.js";
import { createWorkflowCard } from "../../../src/lib/wf1/commands/create-workflow-card.js";
import { runWorkflowAction } from "../../../src/lib/wf1/commands/run-workflow-action.js";
import { workflowDefinitionById } from "../../../src/lib/wf1/definitions/registry.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../../../src/lib/wf1/store/collections.js";
import { eva, rakesh, seedSimpleApplication, WF1_TEST_WORKFLOWS } from "../test-helpers.js";

const PDF_ATTACHMENT = {
	mediaId: "media_new_workflow_1",
	storageKey: "wf1/test/new-workflow-evidence.pdf",
	mimeType: "application/pdf",
	filename: "new-workflow-evidence.pdf",
	url: "/_emdash/api/media/file/wf1/test/new-workflow-evidence.pdf",
};

describe("rental-application-form-basic@1", () => {
	test("definition has generic cards and two-stage moveout", () => {
		const definition = workflowDefinitionById("rental-application-form-basic", 1);

		expect(definition.initialState).toBe("application_under_review");
		expect(definition.states).toHaveProperty("application_under_review");
		expect(definition.states).toHaveProperty("accepted_as_tenant");
		expect(definition.states).toHaveProperty("moveout_requested");
		expect(definition.states).toHaveProperty("moveout_closed");
		expect(definition.cardTypes).toHaveProperty("free_text");
		expect(definition.cardTypes).toHaveProperty("free_text_required_evidence");
		expect(definition.cardTypes).toHaveProperty("mcq_single");
		expect(definition.cardTypes).toHaveProperty("mcq_multi");
		expect(definition.cardTypes).not.toHaveProperty("payment_proof_task");

		expect(definition.actions.accept_as_tenant.transitions[0]).toMatchObject({
			nextWorkflowState: "accepted_as_tenant",
			nextAssetState: "rented",
		});
		expect(definition.actions.request_moveout.transitions[0]).toMatchObject({
			nextWorkflowState: "moveout_requested",
			nextAssetState: "return_pending",
		});
		expect(definition.actions.close_moveout.transitions[0]).toMatchObject({
			nextWorkflowState: "moveout_closed",
			nextAssetState: "listed",
		});
	});

	test("generic cards do not move application form state; accept action moves form and asset state", async () => {
		const workflow = WF1_TEST_WORKFLOWS.rentalApplicationFormBasic;
		const { store, instance } = await seedSimpleApplication(undefined, workflow);

		const textWorkspace = await createWorkflowCard(store, eva, {
			workflowInstanceId: instance.id,
			cardType: workflow.plainTextCardType,
			prompt: "Please confirm your move-in date.",
		});

		expect(textWorkspace.instance?.workflow_state).toBe(workflow.initialApplicationFormState);

		const textCard = textWorkspace.cards.find(
			(card) => card.card_type === workflow.plainTextCardType,
		);
		expect(textCard).toBeTruthy();

		await answerWorkflowCard(store, rakesh, textCard!.id, {
			answer: { text: "I can move in next week." },
			message: "I can move in next week.",
		});

		const evidenceWorkspace = await createWorkflowCard(store, eva, {
			workflowInstanceId: instance.id,
			cardType: workflow.requiredEvidenceCardType,
			prompt: "Please submit confirmation text and evidence.",
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

		const accepted = await runWorkflowAction(store, eva, {
			workflowInstanceId: instance.id,
			actionId: workflow.acceptActionId,
		});

		expect(accepted.instance?.workflow_state).toBe(workflow.acceptedApplicationFormState);
		expect(accepted.asset.business_state).toBe("rented");
	});

	test("same application form supports moveout_requested and moveout_closed", async () => {
		const workflow = WF1_TEST_WORKFLOWS.rentalApplicationFormBasic;
		const { store, instance } = await seedSimpleApplication(undefined, workflow);

		await runWorkflowAction(store, eva, {
			workflowInstanceId: instance.id,
			actionId: workflow.acceptActionId,
		});

		const moveout = await runWorkflowAction(store, rakesh, {
			workflowInstanceId: instance.id,
			actionId: "request_moveout",
		});

		expect(moveout.instance?.workflow_state).toBe("moveout_requested");
		expect(moveout.asset.business_state).toBe("return_pending");

		const returnCheckWorkspace = await createWorkflowCard(store, eva, {
			workflowInstanceId: instance.id,
			cardType: workflow.requiredEvidenceCardType,
			prompt: "Check Door and attach return evidence.",
			cardSpec: {
				generatedPurpose: "moveout_return_check",
				assetConfigItemId: "door",
				itemLabel: "Door",
			},
		});

		const returnCheckCard = returnCheckWorkspace.cards.find(
			(card) =>
				card.card_type === workflow.requiredEvidenceCardType &&
				(card.card_spec as Record<string, unknown>)?.generatedPurpose === "moveout_return_check",
		);
		expect(returnCheckCard).toBeTruthy();

		await expect(
			runWorkflowAction(store, eva, {
				workflowInstanceId: instance.id,
				actionId: "close_moveout",
			}),
		).rejects.toMatchObject({ code: "UNRESOLVED_REQUIRED_CARDS" });

		await answerWorkflowCard(store, rakesh, returnCheckCard!.id, {
			answer: { text: "Door returned in good condition." },
			attachments: [PDF_ATTACHMENT],
		});

		const closed = await runWorkflowAction(store, eva, {
			workflowInstanceId: instance.id,
			actionId: "close_moveout",
		});

		expect(closed.instance?.workflow_state).toBe("moveout_closed");
		expect(closed.asset.business_state).toBe("listed");
	});
});
