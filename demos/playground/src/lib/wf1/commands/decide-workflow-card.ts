import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import { assertStateAllowed, assertWorkflowRole } from "../core/policy.js";
import { applyTransitionRules } from "../core/transition-effects.js";
import type { WorkflowAnswerSchema, WorkflowCardDefinition } from "../core/types.js";
import { WF_CARD_STATE, WF_STATUS, WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import {
	actorRoleFor,
	appendWorkflowEvent,
	getAssetOrThrow,
	getInterestOrThrow,
	getInstanceOrThrow,
	listWorkspace,
	workflowDefinitionForInstance,
} from "../store/repository.js";

export type CreateWorkflowCardInput = {
	workflowInstanceId: string;
	cardType: string;
	prompt?: string;
	cardSpec?: Record<string, unknown>;
	attachments?: Array<Record<string, unknown>>;
};

type McqOption = {
	value: string;
	label: string;
};

export async function createWorkflowCard(
	store: DomainStore,
	user: UserContext,
	input: CreateWorkflowCardInput,
) {
	return store.transaction(async (tx) => {
		const instance = await getInstanceOrThrow(tx, input.workflowInstanceId);
		const definition = workflowDefinitionForInstance(instance);
		const cardDefinition = definition.cardTypes[input.cardType];

		if (!cardDefinition) {
			throw new DomainError("CARD_TYPE_NOT_FOUND", "Workflow card type not found", 404);
		}

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

		const cardSpec = {
			...cardDefinition.defaultCardSpec,
			...(input.cardSpec ?? {}),
		};

		const answerSchema = answerSchemaForCreatedCard(cardDefinition, cardSpec);

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
			answer_schema: answerSchema,
			evidence_policy: cardDefinition.evidencePolicy,
			decision_policy: cardDefinition.decisionPolicy ?? null,
			card_spec: cardSpec,
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
				cardSpec,
			},
		});

		return listWorkspace(tx, user, transitioned.instance);
	});
}

function answerSchemaForCreatedCard(
	cardDefinition: WorkflowCardDefinition,
	cardSpec: Record<string, unknown>,
): WorkflowAnswerSchema {
	const schema = cardDefinition.answerSchema;

	if (schema.kind !== "mcq_single" && schema.kind !== "mcq_multi") {
		return schema;
	}

	const customOptions = mcqOptionsFromCardSpec(cardSpec);

	if (customOptions.length < 2) {
		return schema;
	}

	return {
		...schema,
		options: customOptions,
	};
}

function mcqOptionsFromCardSpec(cardSpec: Record<string, unknown>): McqOption[] {
	if (!Array.isArray(cardSpec.options)) {
		return [];
	}

	return cardSpec.options
		.filter((option) => option && typeof option === "object" && !Array.isArray(option))
		.map((option) => {
			const row = option as Record<string, unknown>;
			const label = String(row.label ?? "").trim();
			const rawValue = String(row.value ?? "").trim();
			const value = rawValue || optionValueFromLabel(label);

			return { value, label };
		})
		.filter((option) => option.value && option.label)
		.filter(uniqueOptionValue);
}

function optionValueFromLabel(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function uniqueOptionValue(option: McqOption, index: number, options: McqOption[]): boolean {
	return options.findIndex((candidate) => candidate.value === option.value) === index;
}