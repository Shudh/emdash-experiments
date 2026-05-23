import { DomainError } from "../../domain/types.js";
import type { WorkflowDefinition } from "../core/types.js";
import { ALM_CURRENT_PARITY_V1 } from "./alm-current-parity-v1.js";
import { RENTAL_APPLICATION_FORM_BASIC_V1 } from "./rental-application-form-basic-v1.js";
import { RENTAL_APPLICATION_V1 } from "./rental-application-v1.js";
import { SIMPLE_AVAILABLE_RENTED_V1 } from "./simple-available-rented-v1.js";

const WORKFLOW_DEFINITIONS = [
	ALM_CURRENT_PARITY_V1,
	RENTAL_APPLICATION_V1,
	SIMPLE_AVAILABLE_RENTED_V1,
	RENTAL_APPLICATION_FORM_BASIC_V1,
] as const;

const DEFAULT_WORKFLOW_DEFINITION = RENTAL_APPLICATION_FORM_BASIC_V1;

function keyFor(id: string, version: number): string {
	return `${id}@${version}`;
}

const WORKFLOW_DEFINITION_MAP = new Map<string, WorkflowDefinition>(
	WORKFLOW_DEFINITIONS.map((definition) => [keyFor(definition.id, definition.version), definition]),
);

export function defaultWorkflowDefinition(): WorkflowDefinition {
	return DEFAULT_WORKFLOW_DEFINITION;
}

export function workflowDefinitionById(id: string, version: number): WorkflowDefinition {
	const definition = WORKFLOW_DEFINITION_MAP.get(keyFor(id, version));

	if (!definition) {
		throw new DomainError(
			"WORKFLOW_DEFINITION_NOT_FOUND",
			`Workflow definition ${id}@${version} was not found`,
			500,
		);
	}

	return definition;
}

export function workflowDefinitions(): WorkflowDefinition[] {
	return [...WORKFLOW_DEFINITION_MAP.values()];
}
