import { describe, expect, test } from "vitest";

import { DomainError } from "../../src/lib/domain/types.js";
import {
	workflowDefinitionById,
	workflowDefinitions,
} from "../../src/lib/wf1/definitions/registry.js";

describe("wf1 definition registry", () => {
	test("returns simple workflow by id and version", () => {
		const definition = workflowDefinitionById("simple-available-rented", 1);
		expect(definition.id).toBe("simple-available-rented");
		expect(definition.initialState).toBe("available");
	});

	test("returns parity workflow by id and version", () => {
		const definition = workflowDefinitionById("alm-current-parity", 1);
		expect(definition.id).toBe("alm-current-parity");
	});

	test("lists registered definitions", () => {
		expect(workflowDefinitions().map((definition) => definition.id)).toContain(
			"simple-available-rented",
		);
	});

	test("unknown workflow definition throws", () => {
		expect(() => workflowDefinitionById("missing", 1)).toThrow(DomainError);
	});
});
