import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import { assertWorkflowRole } from "../core/policy.js";
import { applyTransitionRules } from "../core/transition-effects.js";
import { WF_CARD_STATE, WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import {
	actorRoleFor,
	appendWorkflowEvent,
	getAssetOrThrow,
	getCardOrThrow,
	getInterestOrThrow,
	getInstanceOrThrow,
	listWorkspace,
	workflowDefinition,
} from "../store/repository.js";

export async function decideWorkflowCard(
	store: DomainStore,
	user: UserContext,
	cardId: string,
	input: { decision: "accept" | "reject" | "request_change" | "verify_paid" | "mark_refunded" },
) {
	return store.transaction(async (tx) => {
		const card = await getCardOrThrow(tx, cardId);
		const definition = workflowDefinition();
		const cardDefinition = definition.cardTypes[asString(card.card_type)];
		if (!cardDefinition?.decisionPolicy) {
			throw new DomainError("DECISION_NOT_SUPPORTED", "This card cannot be decided", 409);
		}
		if (!cardDefinition.decisionPolicy.decisions.includes(input.decision)) {
			throw new DomainError("DECISION_NOT_ALLOWED", "Decision is not allowed for this card", 422);
		}
		const instance = await getInstanceOrThrow(tx, asString(card.workflow_instance_id));
		const [asset, interest] = await Promise.all([
			getAssetOrThrow(tx, asString(instance.asset_id)),
			getInterestOrThrow(tx, asString(instance.interest_id)),
		]);
		const role = assertWorkflowRole(
			actorRoleFor(user, asset, interest),
			cardDefinition.decisionPolicy.decidedBy,
		);
		const transitioned = await applyTransitionRules(tx, {
			rules: cardDefinition.transitions ?? [],
			when: "card_decided",
			decision: input.decision,
			asset,
			interest,
			instance,
			actor: user,
		});
		await tx.update(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS, card.id, {
			card_state:
				input.decision === "accept" || input.decision === "verify_paid"
					? WF_CARD_STATE.ACCEPTED
					: WF_CARD_STATE.REJECTED,
			decision: input.decision,
			decided_at: tx.now(),
		});
		await appendWorkflowEvent(tx, {
			asset: transitioned.asset,
			interest,
			instance: transitioned.instance,
			cardId: card.id,
			eventKind: "card_decided",
			actor: user,
			actorRole: role,
			fromWorkflowState: asString(instance.workflow_state),
			toWorkflowState: asString(transitioned.instance.workflow_state),
			eventSpec: { decision: input.decision },
		});
		return listWorkspace(tx, user, transitioned.instance);
	});
}
