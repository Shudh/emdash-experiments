import type { AddAssetRequest } from "../api-contracts.js";
import {
	ACCESS_ROLE,
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
	EVENT_KIND,
	VISIBILITY_STATE,
} from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { grantAssetAccess } from "../repositories/access.js";
import type { DomainStore, UserContext } from "../types.js";
import { createSlug, ownerConditionsHash } from "../validation.js";

export async function addAsset(store: DomainStore, user: UserContext, input: AddAssetRequest) {
	return store.transaction(async (tx) => {
		const ownerConditionsSpec = input.ownerConditionsSpec ?? {};
		const asset = await tx.insert(COLLECTIONS.ASSETS, {
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
			config_version: 1,
			owner_conditions_spec: ownerConditionsSpec,
			conditions_version: 1,
			conditions_hash: ownerConditionsHash(ownerConditionsSpec),
		});

		await grantAssetAccess(tx, {
			assetId: asset.id,
			userId: user.id,
			role: ACCESS_ROLE.OWNER,
			authorId: user.id,
		});

		await appendAssetEvent(tx, {
			assetId: asset.id,
			eventKind: EVENT_KIND.ASSET_ADDED,
			actor: user,
			toBusinessState: ASSET_BUSINESS_STATE.DRAFT_ASSET,
			eventSpec: { title: input.title, assetKind: input.assetKind },
		});

		return { asset };
	});
}
