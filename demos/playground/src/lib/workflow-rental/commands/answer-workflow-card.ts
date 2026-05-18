import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import { validateAnswer, validateEvidencePolicy } from "../core/card-validation.js";
import { assertStateAllowed, assertWorkflowRole } from "../core/policy.js";
import { applyTransitionRules } from "../core/transition-effects.js";
import { WF_CARD_STATE, WF_STATUS, WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
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

export type AnswerWorkflowCardInput = {
	answer: Record<string, unknown>;
	message?: string;
	attachments?: Array<Record<string, unknown>>;
};

export async function answerWorkflowCard(
	store: DomainStore,
	user: UserContext,
	cardId: string,
	input: AnswerWorkflowCardInput,
) {
	return store.transaction(async (tx) => {
		const card = await getCardOrThrow(tx, cardId);
		const definition = workflowDefinition();
		const cardDefinition = definition.cardTypes[asString(card.card_type)];
		if (!cardDefinition)
			throw new DomainError("CARD_TYPE_NOT_FOUND", "Workflow card type not found", 404);
		const instance = await getInstanceOrThrow(tx, asString(card.workflow_instance_id));
		const [asset, interest] = await Promise.all([
			getAssetOrThrow(tx, asString(instance.asset_id)),
			getInterestOrThrow(tx, asString(instance.interest_id)),
		]);
		const role = assertWorkflowRole(actorRoleFor(user, asset, interest), cardDefinition.answeredBy);
		assertStateAllowed(
			asString(instance.workflow_state),
			asString(asset.business_state),
			cardDefinition,
		);
		validateEvidencePolicy(cardDefinition.evidencePolicy, input.attachments ?? []);
		const answerValue = validateAnswer(cardDefinition.answerSchema, input.answer);
		await tx.insert(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARD_RESPONSES, {
			status: WF_STATUS.PUBLISHED,
			author_id: user.id,
			workflow_instance_id: instance.id,
			card_id: card.id,
			asset_id: asset.id,
			interest_id: interest.id,
			responded_by_user_id: user.id,
			responded_by_role: role,
			answer_value: answerValue,
			message: input.message ?? answerValue.text ?? null,
		});
		await tx.update(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS, card.id, {
			card_state: WF_CARD_STATE.ANSWERED,
		});
		const transitioned = await applyTransitionRules(tx, {
			rules: cardDefinition.transitions ?? [],
			when: "card_answered",
			asset,
			interest,
			instance,
			actor: user,
		});
		await appendWorkflowEvent(tx, {
			asset: transitioned.asset,
			interest,
			instance: transitioned.instance,
			cardId: card.id,
			eventKind: "card_answered",
			actor: user,
			actorRole: role,
			fromWorkflowState: asString(instance.workflow_state),
			toWorkflowState: asString(transitioned.instance.workflow_state),
			fromAssetState: asString(asset.business_state),
			toAssetState: asString(transitioned.asset.business_state),
		});
		return listWorkspace(tx, user, transitioned.instance);
	});
}
