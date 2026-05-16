import { ACCESS_STATE, COLLECTIONS, CMS_STATUS } from "../constants.js";
import type { DomainStore } from "../types.js";

export async function grantAssetAccess(
	store: DomainStore,
	input: { assetId: string; userId: string; role: string; authorId?: string | null },
) {
	const existing = await store.findOne(COLLECTIONS.ASSET_ACCESS, {
		asset_id: input.assetId,
		user_id: input.userId,
		access_role: input.role,
		access_state: ACCESS_STATE.ACTIVE,
	});
	if (existing) return existing;
	return store.insert(COLLECTIONS.ASSET_ACCESS, {
		slug: `${input.assetId}-${input.userId}-${input.role}`,
		status: CMS_STATUS.PUBLISHED,
		author_id: input.authorId ?? null,
		asset_id: input.assetId,
		user_id: input.userId,
		access_role: input.role,
		access_state: ACCESS_STATE.ACTIVE,
	});
}
