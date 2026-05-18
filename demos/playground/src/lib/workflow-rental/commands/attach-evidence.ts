import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import { WF_STATUS, WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import {
	actorRoleFor,
	getAssetOrThrow,
	getCardOrThrow,
	getInterestOrThrow,
	getInstanceOrThrow,
} from "../store/repository.js";

export async function attachEvidence(
	store: DomainStore,
	user: UserContext,
	input: {
		cardId: string;
		tenantDocumentId?: string;
		attachmentLabel?: string;
		storageKey?: string;
		mimeType?: string;
		attachmentSpec?: Record<string, unknown>;
	},
) {
	return store.transaction(async (tx) => {
		const card = await getCardOrThrow(tx, input.cardId);
		const instance = await getInstanceOrThrow(tx, asString(card.workflow_instance_id));
		const [asset, interest] = await Promise.all([
			getAssetOrThrow(tx, asString(instance.asset_id)),
			getInterestOrThrow(tx, asString(instance.interest_id)),
		]);
		const role = actorRoleFor(user, asset, interest);
		if (role === "anonymous" || role === "other") {
			throw new DomainError("FORBIDDEN", "Only workflow participants can attach evidence", 403);
		}
		const attachment = await tx.insert(WORKFLOW_RENTAL_COLLECTIONS.EVIDENCE_ATTACHMENTS, {
			status: WF_STATUS.PUBLISHED,
			author_id: user.id,
			tenant_document_id: input.tenantDocumentId ?? null,
			asset_id: asset.id,
			interest_id: interest.id,
			workflow_instance_id: instance.id,
			card_id: card.id,
			response_id: null,
			owner_user_id: asset.owner_user_id,
			applicant_user_id: interest.interested_user_id,
			document_kind: input.attachmentSpec?.documentKind ?? null,
			storage_key: input.storageKey ?? null,
			mime_type: input.mimeType ?? null,
			attachment_label: input.attachmentLabel ?? "Evidence",
			attachment_spec: input.attachmentSpec ?? {},
		});
		return { attachment };
	});
}
