import { describe, expect, test } from "vitest";

import { assertWorkflowRole } from "../../src/lib/workflow-rental/core/policy.js";

describe("workflow policy", () => {
	test("rejects anonymous and wrong actors", () => {
		expect(() => assertWorkflowRole("anonymous", ["owner"])).toThrow("Login required");
		expect(() => assertWorkflowRole("applicant", ["owner"])).toThrow("Actor is not allowed");
		expect(assertWorkflowRole("owner", ["owner"])).toBe("owner");
	});
});
