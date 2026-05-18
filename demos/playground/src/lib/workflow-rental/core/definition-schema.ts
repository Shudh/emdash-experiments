import { DomainError } from "../../domain/types.js";
import type { WorkflowDefinition, WorkflowTransitionRule } from "./types.js";

function assertKnownWorkflowState(
	definition: WorkflowDefinition,
	state: string | undefined,
	context: string,
): void {
	if (!state) return;
	if (!definition.states[state]) {
		throw new DomainError(
			"INVALID_WORKFLOW_DEFINITION",
			`${context} references unknown workflow state ${state}`,
			500,
		);
	}
}

function validateTransitions(
	definition: WorkflowDefinition,
	transitions: WorkflowTransitionRule[] | undefined,
	context: string,
): void {
	for (const transition of transitions ?? []) {
		assertKnownWorkflowState(definition, transition.nextWorkflowState, context);
	}
}

export function validateWorkflowDefinition(definition: WorkflowDefinition): WorkflowDefinition {
	if (!definition.id) {
		throw new DomainError("INVALID_WORKFLOW_DEFINITION", "Definition id is required", 500);
	}

	if (!definition.states[definition.initialState]) {
		throw new DomainError("INVALID_WORKFLOW_DEFINITION", "Initial workflow state is missing", 500);
	}

	for (const [stateId, state] of Object.entries(definition.states)) {
		if (state.id !== stateId) {
			throw new DomainError("INVALID_WORKFLOW_DEFINITION", `State key mismatch: ${stateId}`, 500);
		}
	}

	for (const initialCard of definition.initialCards ?? []) {
		if (!definition.cardTypes[initialCard.cardType]) {
			throw new DomainError(
				"INVALID_WORKFLOW_DEFINITION",
				`Initial card references unknown card type ${initialCard.cardType}`,
				500,
			);
		}
	}

	for (const [cardType, card] of Object.entries(definition.cardTypes)) {
		if (card.id !== cardType) {
			throw new DomainError("INVALID_WORKFLOW_DEFINITION", `Card key mismatch: ${cardType}`, 500);
		}

		for (const state of card.allowedWorkflowStates) {
			assertKnownWorkflowState(definition, state, `Card ${cardType}`);
		}

		validateTransitions(definition, card.transitions, `Card ${cardType}`);
	}

	for (const [actionId, action] of Object.entries(definition.actions)) {
		if (action.id !== actionId) {
			throw new DomainError("INVALID_WORKFLOW_DEFINITION", `Action key mismatch: ${actionId}`, 500);
		}

		for (const state of action.allowedWorkflowStates) {
			assertKnownWorkflowState(definition, state, `Action ${actionId}`);
		}

		validateTransitions(definition, action.transitions, `Action ${actionId}`);
	}

	return definition;
}