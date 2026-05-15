import { CMS_STATUS, COLLECTIONS } from "./constants.js";
import type { DomainStore, JsonObject, UserContext } from "./types.js";

export type AppendAssetEventInput = {
	assetId: string;
	eventKind: string;
	actor?: UserContext | null;
	fromBusinessState?: string | null;
	toBusinessState?: string | null;
	eventSpec?: JsonObject;
};

export async function appendAssetEvent(store: DomainStore, input: AppendAssetEventInput) {
	return store.insert(COLLECTIONS.ASSET_EVENTS, {
		slug: `${input.eventKind}-${input.assetId}-${Date.now()}`,
		status: CMS_STATUS.PUBLISHED,
		author_id: input.actor?.id ?? null,
		asset_id: input.assetId,
		event_kind: input.eventKind,
		actor_user_id: input.actor?.id ?? null,
		from_business_state: input.fromBusinessState ?? null,
		to_business_state: input.toBusinessState ?? null,
		event_spec: input.eventSpec ?? {},
	});
}
