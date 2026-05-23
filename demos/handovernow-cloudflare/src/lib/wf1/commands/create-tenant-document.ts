import type { DomainStore, UserContext } from "../../domain/types.js";
import { WF_STATUS, WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";

export async function createTenantDocument(
	store: DomainStore,
	user: UserContext,
	input: {
		documentKind: string;
		documentLabel: string;
		storageKey?: string;
		mimeType?: string;
		documentSpec?: Record<string, unknown>;
	},
) {
	const document = await store.insert(WORKFLOW_RENTAL_COLLECTIONS.TENANT_DOCUMENTS, {
		status: WF_STATUS.PUBLISHED,
		author_id: user.id,
		owner_user_id: user.id,
		document_kind: input.documentKind,
		document_label: input.documentLabel,
		storage_key: input.storageKey ?? null,
		mime_type: input.mimeType ?? null,
		document_spec: input.documentSpec ?? {},
	});
	return { document };
}
