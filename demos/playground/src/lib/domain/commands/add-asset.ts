import type { AddAssetRequest } from "../api-contracts.js";
import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
	EVENT_KIND,
	VISIBILITY_STATE,
} from "../constants.js";
import { appendAssetEvent } from "../events.js";
import type { DomainStore, UserContext } from "../types.js";
import { createSlug } from "../validation.js";

export async function addAsset(store: DomainStore, user: UserContext, input: AddAssetRequest) {
	const asset = await store.insert(COLLECTIONS.ASSETS, {
		slug: createSlug(input.title),
		status: CMS_STATUS.DRAFT,
		author_id: user.id,
		title: input.title,
		asset_kind: input.assetKind,
		owner_user_id: user.id,
		business_state: ASSET_BUSINESS_STATE.DRAFT_ASSET,
		visibility_state: VISIBILITY_STATE.PRIVATE,
		public_price: input.publicPrice ?? null,
		currency: input.currency ?? "INR",
		location_label: input.locationLabel ?? null,
		minimum_months: null,
		included_km: null,
		active_interest_id: null,
		active_agreement_id: null,
		active_handover_id: null,
		active_renter_user_id: null,
		featured_image: null,
		gallery_images: [],
		config_spec: {},
		condition_spec: {},
	});
	await appendAssetEvent(store, {
		assetId: asset.id,
		eventKind: EVENT_KIND.ASSET_ADDED,
		actor: user,
		toBusinessState: ASSET_BUSINESS_STATE.DRAFT_ASSET,
		eventSpec: { title: input.title, assetKind: input.assetKind },
	});
	return { asset };
}
