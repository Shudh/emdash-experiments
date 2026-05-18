import { describe, expect, test } from "vitest";

import { validateAnswer } from "../../src/lib/workflow-rental/core/card-validation.js";

describe("workflow answer validation", () => {
	test("validates answer schemas generically", () => {
		expect(validateAnswer({ kind: "free_text", minLength: 2 }, { text: "ok" })).toEqual({
			text: "ok",
		});
		expect(() => validateAnswer({ kind: "yes_no" }, { value: "maybe" })).toThrow("yes or no");
		expect(
			validateAnswer({ kind: "amount_proof", amountRequired: true }, { amount: "59000" }),
		).toMatchObject({ amount: 59000 });
	});
});
