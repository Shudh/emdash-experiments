import { describe, expect, test } from "vitest";

import { getWf1WorkflowInstanceWorkspace } from "../../../src/lib/wf1/queries/workspace-instance.js";
import { eva, seedSimpleApplication, WF1_TEST_WORKFLOWS } from "../test-helpers.js";

describe("simple-available-rented@1 projection", () => {
	test("projects old workflow states, cards, and actions when old definition is selected", async () => {
		const workflow = WF1_TEST_WORKFLOWS.simpleAvailableRented;
		const { store, instance } = await seedSimpleApplication(undefined, workflow);

		const workspace = await getWf1WorkflowInstanceWorkspace(store, eva, instance.id);

		expect(workspace.projection?.assetState.id).toBe("listed");
		expect(workspace.projection?.applicationState.id).toBe(workflow.initialApplicationFormState);
		expect(workspace.projection?.availableActions.map((action) => action.id)).toContain(
			workflow.acceptActionId,
		);
		expect(workspace.projection?.availableCardTypes.map((cardType) => cardType.id)).toContain(
			workflow.plainTextCardType,
		);
		expect(workspace.projection?.availableCardTypes.map((cardType) => cardType.id)).toContain(
			workflow.requiredEvidenceCardType,
		);
	});
});
