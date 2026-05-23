import { describe, expect, test } from "vitest";

import { createWorkflowCard } from "../../../src/lib/wf1/commands/create-workflow-card.js";
import { runWorkflowAction } from "../../../src/lib/wf1/commands/run-workflow-action.js";
import { getWf1WorkflowInstanceWorkspace } from "../../../src/lib/wf1/queries/workspace-instance.js";
import { eva, rakesh, seedSimpleApplication, WF1_TEST_WORKFLOWS } from "../test-helpers.js";

describe("rental-application-form-basic@1 projection", () => {
	test("projects generic cards and form actions for new definition", async () => {
		const workflow = WF1_TEST_WORKFLOWS.rentalApplicationFormBasic;
		const { store, instance } = await seedSimpleApplication(undefined, workflow);

		const ownerWorkspace = await getWf1WorkflowInstanceWorkspace(store, eva, instance.id);

		expect(ownerWorkspace.projection?.assetState.id).toBe("listed");
		expect(ownerWorkspace.projection?.applicationState.id).toBe(
			workflow.initialApplicationFormState,
		);
		expect(ownerWorkspace.projection?.statusPills).toContain("Asset State: listed");
		expect(ownerWorkspace.projection?.statusPills).toContain(
			`Application Form State: ${workflow.initialApplicationFormState}`,
		);
		expect(ownerWorkspace.projection?.availableActions.map((action) => action.id)).toContain(
			workflow.acceptActionId,
		);
		expect(ownerWorkspace.projection?.availableCardTypes.map((cardType) => cardType.id)).toContain(
			workflow.requiredEvidenceCardType,
		);
		expect(
			ownerWorkspace.projection?.availableCardTypes.map((cardType) => cardType.id),
		).not.toContain("payment_proof_task");

		await createWorkflowCard(store, eva, {
			workflowInstanceId: instance.id,
			cardType: workflow.requiredEvidenceCardType,
			prompt: "Please submit text and evidence.",
		});

		const applicantWorkspace = await getWf1WorkflowInstanceWorkspace(store, rakesh, instance.id);

		expect(
			applicantWorkspace.projection?.taskBuckets.myOpenTasks.map((card) => card.card_type),
		).toContain(workflow.requiredEvidenceCardType);
	});

	test("projects moveout actions and asset config items", async () => {
		const workflow = WF1_TEST_WORKFLOWS.rentalApplicationFormBasic;
		const { store, instance } = await seedSimpleApplication(undefined, workflow);

		await runWorkflowAction(store, eva, {
			workflowInstanceId: instance.id,
			actionId: workflow.acceptActionId,
		});

		const tenantWorkspace = await getWf1WorkflowInstanceWorkspace(store, rakesh, instance.id);

		expect(tenantWorkspace.projection?.availableActions.map((action) => action.id)).toContain(
			"request_moveout",
		);

		await runWorkflowAction(store, rakesh, {
			workflowInstanceId: instance.id,
			actionId: "request_moveout",
		});

		const ownerMoveoutWorkspace = await getWf1WorkflowInstanceWorkspace(store, eva, instance.id);

		expect(ownerMoveoutWorkspace.assetConfigItems).toHaveLength(1);
		expect(ownerMoveoutWorkspace.projection?.applicationState.id).toBe("moveout_requested");
		expect(ownerMoveoutWorkspace.projection?.assetState.id).toBe("return_pending");
		expect(ownerMoveoutWorkspace.projection?.availableActions.map((action) => action.id)).toContain(
			"close_moveout",
		);
	});
});
