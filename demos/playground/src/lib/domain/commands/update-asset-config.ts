import type { UpdateAssetConfigRequest } from "../api-contracts.js";
import { requireAssetOwner } from "../auth.js";
import { COLLECTIONS, CMS_STATUS, EVENT_KIND } from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { getAssetOrThrow } from "../repositories/assets.js";
import type { DomainStore, UserContext } from "../types.js";
import { asNumber } from "../types.js";
import { createSlug, ownerConditionsHash } from "../validation.js";

export async function updateAssetConfig(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	input: UpdateAssetConfigRequest,
) {
	await requireAssetOwner(store, user, assetId);
	const asset = await getAssetOrThrow(store, assetId);
	const patch: Record<string, unknown> = {};
	if (input.publicPrice !== undefined) patch.public_price = input.publicPrice;
	if (input.currency !== undefined) patch.currency = input.currency;
	if (input.minimumMonths !== undefined) patch.minimum_months = input.minimumMonths;
	if (input.includedKm !== undefined) patch.included_km = input.includedKm;
	if (input.featuredImage !== undefined) patch.featured_image = input.featuredImage;
	if (input.galleryImages !== undefined) patch.gallery_images = input.galleryImages;
	if (input.configSpec !== undefined) patch.config_spec = input.configSpec;
	if (input.conditionSpec !== undefined) patch.condition_spec = input.conditionSpec;
	if (input.ownerConditionsSpec !== undefined) {
		patch.owner_conditions_spec = input.ownerConditionsSpec;
		patch.conditions_version = asNumber(asset.conditions_version, 1) + 1;
		patch.conditions_hash = ownerConditionsHash(input.ownerConditionsSpec);
	}
	const updatedAsset = Object.keys(patch).length
		? await store.update(COLLECTIONS.ASSETS, assetId, patch)
		: asset;

	const insertedItems = [];
	for (const item of input.items ?? []) {
		insertedItems.push(
			await store.insert(COLLECTIONS.ASSET_CONFIG_ITEMS, {
				slug: createSlug(`${updatedAsset.slug}-${item.itemLabel}`),
				status: CMS_STATUS.PUBLISHED,
				author_id: user.id,
				asset_id: assetId,
				item_kind: item.itemKind,
				item_group: item.itemGroup ?? null,
				item_label: item.itemLabel,
				owner_declared_state: item.ownerDeclaredState ?? null,
				renter_accepted_state: null,
				return_observed_state: null,
				chargeable_state: null,
				estimated_repair_cost: null,
				media_refs: item.mediaRefs ?? [],
				item_spec: item.itemSpec ?? {},
			}),
		);
	}

	await appendAssetEvent(store, {
		assetId,
		eventKind: EVENT_KIND.ASSET_CONFIG_UPDATED,
		actor: user,
		fromBusinessState: String(asset.business_state),
		toBusinessState: String(updatedAsset.business_state),
		eventSpec: { updatedFields: Object.keys(patch), insertedItemCount: insertedItems.length },
	});

	return { asset: updatedAsset, insertedItems };
}
