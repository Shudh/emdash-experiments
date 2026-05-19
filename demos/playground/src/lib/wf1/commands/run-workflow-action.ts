import { DomainError, asString } from "../../domain/types.js";
import type { DomainRow, DomainStore, UserContext } from "../../domain/types.js";
import { assertStateAllowed, assertWorkflowRole } from "../core/policy.js";
import { applyTransitionRules } from "../core/transition-effects.js";
import type { WorkflowDefinition } from "../core/types.js";
import { WF_CARD_STATE, WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import {
	actorRoleFor,
	appendWorkflowEvent,
	getAssetOrThrow,
	getInterestOrThrow,
	getInstanceOrThrow,
	listWorkspace,
	workflowDefinitionForInstance,
} from "../store/repository.js";

function isRequiredCard(card: DomainRow, definition: WorkflowDefinition): boolean {
	const cardDefinition = definition.cardTypes[asString(card.card_type)];

	return (
		cardDefinition?.resolutionPolicy?.required === true ||
		cardDefinition?.evidencePolicy.attachment === "required"
	);
}

function isUnresolvedCard(card: DomainRow): boolean {
	const state = asString(card.card_state);
	return ![
		WF_CARD_STATE.ANSWERED,
		WF_CARD_STATE.ACCEPTED,
		WF_CARD_STATE.REJECTED,
		WF_CARD_STATE.WAIVED,
		"resolved",
		"closed",
	].includes(state);
}

async function unresolvedRequiredCardsForInstance(
	store: DomainStore,
	workflowInstanceId: string,
	definition: WorkflowDefinition,
): Promise<DomainRow[]> {
	const cards = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS,
		{ workflow_instance_id: workflowInstanceId },
		{ orderBy: "created_at", direction: "desc", limit: 300 },
	);

	return cards.filter((card) => isRequiredCard(card, definition) && isUnresolvedCard(card));
}

export async function runWorkflowAction(
	store: DomainStore,
	user: UserContext,
	input: { workflowInstanceId: string; actionId: string; actionSpec?: Record<string, unknown> },
) {
	return store.transaction(async (tx) => {
		const instance = await getInstanceOrThrow(tx, input.workflowInstanceId);
		const definition = workflowDefinitionForInstance(instance);
		const action = definition.actions[input.actionId];

		if (!action) {
			throw new DomainError("ACTION_NOT_FOUND", "Workflow action not found", 404);
		}

		const [asset, interest] = await Promise.all([
			getAssetOrThrow(tx, asString(instance.asset_id)),
			getInterestOrThrow(tx, asString(instance.interest_id)),
		]);

		const role = assertWorkflowRole(actorRoleFor(user, asset, interest), action.runBy);
		assertStateAllowed(asString(instance.workflow_state), asString(asset.business_state), action);

		const unresolvedRequiredCards = await unresolvedRequiredCardsForInstance(
			tx,
			instance.id,
			definition,
		);

		if (
			(action.unresolvedCardPolicy ?? "allow") === "block" &&
			unresolvedRequiredCards.length > 0
		) {
			throw new DomainError(
				"UNRESOLVED_REQUIRED_CARDS",
				`${unresolvedRequiredCards.length} required task card${unresolvedRequiredCards.length === 1 ? " is" : "s are"} unresolved`,
				409,
			);
		}

		const transitioned = await applyTransitionRules(tx, {
			rules: action.transitions,
			when: "action_run",
			asset,
			interest,
			instance,
			actor: user,
		});

		await appendWorkflowEvent(tx, {
			asset: transitioned.asset,
			interest,
			instance: transitioned.instance,
			eventKind: "action_run",
			actor: user,
			actorRole: role,
			fromWorkflowState: asString(instance.workflow_state),
			toWorkflowState: asString(transitioned.instance.workflow_state),
			fromAssetState: asString(asset.business_state),
			toAssetState: asString(transitioned.asset.business_state),
			eventSpec: {
				actionId: input.actionId,
				actionSpec: input.actionSpec ?? {},
				unresolvedRequiredCardIds: unresolvedRequiredCards.map((card) => card.id),
				unresolvedCardPolicy: action.unresolvedCardPolicy ?? "allow",
			},
		});

		return listWorkspace(tx, user, transitioned.instance);
	});
}
