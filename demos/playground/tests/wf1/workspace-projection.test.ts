import { describe, expect, test } from "vitest";

import { createWorkflowCard } from "../../src/lib/wf1/commands/create-workflow-card.js";
import { getWf1WorkflowInstanceWorkspace } from "../../src/lib/wf1/queries/workspace-instance.js";
import { eva, rakesh, seedSimpleApplication } from "./test-helpers.js";

describe("wf1 workspace projection", () => {
	test("returns manager-facing Asset State, Application State, buckets, cards, and actions", async () => {
		const { store, instance } = await seedSimpleApplication();
		const ownerWorkspace = await getWf1WorkflowInstanceWorkspace(store, eva, instance.id);
		expect(ownerWorkspace.projection?.assetState.id).toBe("listed");
		expect(ownerWorkspace.projection?.applicationState.id).toBe("available");
		expect(ownerWorkspace.projection?.availableActions.map((action) => action.id)).toContain(
			"mark_rented",
		);
		expect(ownerWorkspace.projection?.availableCardTypes.map((cardType) => cardType.id)).toContain(
			"payment_proof_task",
		);

		await createWorkflowCard(store, eva, {
			workflowInstanceId: instance.id,
			cardType: "payment_proof_task",
			prompt: "Please submit payment proof.",
		});
		const applicantWorkspace = await getWf1WorkflowInstanceWorkspace(store, rakesh, instance.id);
		expect(
			applicantWorkspace.projection?.taskBuckets.myOpenTasks.map((card) => card.card_type),
		).toContain("payment_proof_task");
		const refreshedOwnerWorkspace = await getWf1WorkflowInstanceWorkspace(store, eva, instance.id);
		expect(
			refreshedOwnerWorkspace.projection?.taskBuckets.otherSideOpenTasks.map(
				(card) => card.card_type,
			),
		).toContain("payment_proof_task");
		expect(
			refreshedOwnerWorkspace.projection?.availableActions.find(
				(action) => action.id === "mark_rented",
			)?.blocked,
		).toBe(true);
	});
});
