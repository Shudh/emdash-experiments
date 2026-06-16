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
	workflowDefinitionForInstance,
} from "../store/repository.js";

export type AnswerWorkflowCardInput = {
	answer: Record<string, unknown>;
	message?: string;
	attachments?: Array<Record<string, unknown>>;
};

function attachmentLabel(attachment: Record<string, unknown>): string {
	return (
		asString(attachment.attachmentLabel) ||
		asString(attachment.filename) ||
		asString(attachment.mediaId) ||
		"Evidence"
	);
}

async function persistAnswerEvidence(input: {
	tx: DomainStore;
	user: UserContext;
	asset: Record<string, unknown>;
	interest: Record<string, unknown>;
	instance: Record<string, unknown>;
	card: Record<string, unknown>;
	responseId: string;
	attachments: Array<Record<string, unknown>>;
}): Promise<void> {
	for (const attachment of input.attachments) {
		const storageKey = asString(attachment.storageKey);
		const mediaId = asString(attachment.mediaId);
		const uploadId = asString(attachment.uploadId);

		if (!storageKey && !mediaId) continue;

		if (uploadId) {
			await input.tx.update(WORKFLOW_RENTAL_COLLECTIONS.MEDIA_UPLOADS, uploadId, {
				attached_state: "attached",
				upload_spec: {
					...(typeof attachment === "object" && attachment ? attachment : {}),
					attachedVia: "workflow_card_answer",
					responseId: input.responseId,
				},
			});
		}

		await input.tx.insert(WORKFLOW_RENTAL_COLLECTIONS.EVIDENCE_ATTACHMENTS, {
			status: WF_STATUS.PUBLISHED,
			author_id: input.user.id,
			tenant_document_id: asString(attachment.tenantDocumentId) || null,
			asset_id: input.asset.id,
			interest_id: input.interest.id,
			workflow_instance_id: input.instance.id,
			card_id: input.card.id,
			response_id: input.responseId,
			owner_user_id: input.asset.owner_user_id,
			applicant_user_id: input.interest.interested_user_id,
			document_kind: asString(attachment.documentKind) || null,
			storage_key: storageKey || null,
			mime_type: asString(attachment.mimeType) || null,
			attachment_label: attachmentLabel(attachment),
			attachment_spec: {
				mediaId,
				uploadId,
				filename: asString(attachment.filename),
				url: asString(attachment.url),
			},
		});
	}
}

export async function answerWorkflowCard(
	store: DomainStore,
	user: UserContext,
	cardId: string,
	input: AnswerWorkflowCardInput,
) {
	return store.transaction(async (tx) => {
		const card = await getCardOrThrow(tx, cardId);
		const instance = await getInstanceOrThrow(tx, asString(card.workflow_instance_id));
		const definition = workflowDefinitionForInstance(instance);
		const cardDefinition = definition.cardTypes[asString(card.card_type)];

		if (!cardDefinition) {
			throw new DomainError("CARD_TYPE_NOT_FOUND", "Workflow card type not found", 404);
		}

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

		const attachments = input.attachments ?? [];

		validateEvidencePolicy(cardDefinition.evidencePolicy, attachments);

		const answerValue = validateAnswer(cardDefinition.answerSchema, input.answer);

		const response = await tx.insert(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARD_RESPONSES, {
			status: WF_STATUS.PUBLISHED,
			author_id: user.id,
			workflow_instance_id: instance.id,
			card_id: card.id,
			asset_id: asset.id,
			interest_id: interest.id,
			responded_by_user_id: user.id,
			responded_by_role: role,
			answer_value: {
				...answerValue,
				attachments,
			},
			message: input.message ?? answerValue.text ?? null,
		});

		await persistAnswerEvidence({
			tx,
			user,
			asset,
			interest,
			instance,
			card,
			responseId: response.id,
			attachments,
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
			eventSpec: {
				attachments,
				responseId: response.id,
			},
		});

		return listWorkspace(tx, user, transitioned.instance);
	});
}
