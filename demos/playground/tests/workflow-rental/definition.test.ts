import { describe, expect, test } from "vitest";

import { validateWorkflowDefinition } from "../../src/lib/workflow-rental/core/definition-schema.js";
import { ALM_CURRENT_PARITY_V1 } from "../../src/lib/workflow-rental/definitions/alm-current-parity-v1.js";

describe("workflow definition", () => {
	test("parity definition is internally valid", () => {
		expect(validateWorkflowDefinition(ALM_CURRENT_PARITY_V1)).toBe(ALM_CURRENT_PARITY_V1);
		expect(ALM_CURRENT_PARITY_V1.initialState).toBe("submitted");
		expect(ALM_CURRENT_PARITY_V1.cardTypes.owner_question.answerSchema.kind).toBe("free_text");
		expect(ALM_CURRENT_PARITY_V1.actions.accept_final_terms.transitions[0]?.nextAssetState).toBe(
			"booked",
		);
	});
});
