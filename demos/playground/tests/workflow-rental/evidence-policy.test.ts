import { describe, expect, test } from "vitest";

import { validateEvidencePolicy } from "../../src/lib/workflow-rental/core/card-validation.js";

describe("workflow evidence policy", () => {
	test("enforces forbidden and required attachment policies", () => {
		expect(() => validateEvidencePolicy({ attachment: "forbidden" }, [{ id: "a" }])).toThrow(
			"does not accept evidence",
		);
		expect(() => validateEvidencePolicy({ attachment: "required" }, [])).toThrow(
			"Evidence is required",
		);
		expect(() => validateEvidencePolicy({ attachment: "optional" }, [])).not.toThrow();
	});
});
