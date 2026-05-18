import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import { validateEvidencePolicy } from "../core/card-validation.js";
import { assertStateAllowed, assertWorkflowRole } from "../core/policy.js";
import { applyTransitionRules } from "../core/transition-effects.js";
import { WF_CARD_STATE, WF_STATUS, WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import {
	actorRoleFor,
	appendWorkflowEvent,
	getAssetOrThrow,
	getInterestOrThrow,
	getInstanceOrThrow,
	listWorkspace,
	workflowDefinition,
} from "../store/repository.js";

export type CreateWorkflowCardInput = {
	workflowInstanceId: string;
	cardType: string;
	prompt?: string;
	cardSpec?: Record<string, unknown>;
	attachments?: Array<Record<string, unknown>>;
};

export async function createWorkflowCard(
	store: DomainStore,
	user: UserContext,
	input: CreateWorkflowCardInput,
) {
	return store.transaction(async (tx) => {
		const definition = workflowDefinition();
		const cardDefinition = definition.cardTypes[input.cardType];

		if (!cardDefinition) {
			throw new DomainError("CARD_TYPE_NOT_FOUND", "Workflow card type not found", 404);
		}

		const instance = await getInstanceOrThrow(tx, input.workflowInstanceId);
		const [asset, interest] = await Promise.all([
			getAssetOrThrow(tx, asString(instance.asset_id)),
			getInterestOrThrow(tx, asString(instance.interest_id)),
		]);

		const role = assertWorkflowRole(actorRoleFor(user, asset, interest), cardDefinition.createdBy);

		assertStateAllowed(
			asString(instance.workflow_state),
			asString(asset.business_state),
			cardDefinition,
		);

		validateEvidencePolicy(cardDefinition.evidencePolicy, input.attachments ?? []);

		const card = await tx.insert(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS, {
			status: WF_STATUS.PUBLISHED,
			author_id: user.id,
			workflow_instance_id: instance.id,
			asset_id: asset.id,
			interest_id: interest.id,
			card_type: input.cardType,
			card_state: WF_CARD_STATE.OPEN,
			created_by_user_id: user.id,
			created_by_role: role,
			prompt: input.prompt ?? cardDefinition.ui?.defaultPrompt ?? cardDefinition.label,
			answer_schema: cardDefinition.answerSchema,
			evidence_policy: cardDefinition.evidencePolicy,
			decision_policy: cardDefinition.decisionPolicy ?? null,
			card_spec: {
				...(cardDefinition.defaultCardSpec ?? {}),
				...(input.cardSpec ?? {}),
			},
			decided_at: null,
			decision: null,
		});

		const transitioned = await applyTransitionRules(tx, {
			rules: cardDefinition.transitions ?? [],
			when: "card_created",
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
			eventKind: "card_created",
			actor: user,
			actorRole: role,
			fromWorkflowState: asString(instance.workflow_state),
			toWorkflowState: asString(transitioned.instance.workflow_state),
			fromAssetState: asString(asset.business_state),
			toAssetState: asString(transitioned.asset.business_state),
			eventSpec: {
				cardType: input.cardType,
				cardSpec: {
					...(cardDefinition.defaultCardSpec ?? {}),
					...(input.cardSpec ?? {}),
				},
			},
		});

		return listWorkspace(tx, user, transitioned.instance);
	});
}