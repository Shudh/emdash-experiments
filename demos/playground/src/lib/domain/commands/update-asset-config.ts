import type { UpdateAssetConfigRequest } from "../api-contracts.js";
import { requireAssetOwner } from "../auth.js";
import { CMS_STATUS, COLLECTIONS, EVENT_KIND } from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { getAssetOrThrow } from "../repositories/assets.js";
import type { DomainStore, UserContext } from "../types.js";
import { asNumber, asString } from "../types.js";
import { createSlug, ownerConditionsHash } from "../validation.js";

export async function updateAssetConfig(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	input: UpdateAssetConfigRequest,
) {
	return store.transaction(async (tx) => {
		await requireAssetOwner(tx, user, assetId);
		const asset = await getAssetOrThrow(tx, assetId);
		const patch: Record<string, unknown> = {};

		const itemInputs = input.items ?? [];
		const hasReplacementItems = itemInputs.length > 0;
		const shouldBumpConfigVersion =
			input.configSpec !== undefined || input.conditionSpec !== undefined || hasReplacementItems;
		const currentConfigVersion = asNumber(asset.config_version, 1);
		const nextConfigVersion = shouldBumpConfigVersion
			? currentConfigVersion + 1
			: currentConfigVersion;

		if (input.publicPrice !== undefined) patch.public_price = input.publicPrice;
		if (input.currency !== undefined) patch.currency = input.currency;
		if (input.minimumMonths !== undefined) patch.minimum_months = input.minimumMonths;
		if (input.includedKm !== undefined) patch.included_km = input.includedKm;
		if (input.featuredImage !== undefined) patch.featured_image = input.featuredImage;
		if (input.galleryImages !== undefined) patch.gallery_images = input.galleryImages;
		if (input.configSpec !== undefined) patch.config_spec = input.configSpec;
		if (input.conditionSpec !== undefined) patch.condition_spec = input.conditionSpec;
		if (shouldBumpConfigVersion) patch.config_version = nextConfigVersion;

		if (input.ownerConditionsSpec !== undefined) {
			patch.owner_conditions_spec = input.ownerConditionsSpec;
			patch.conditions_version = asNumber(asset.conditions_version, 1) + 1;
			patch.conditions_hash = ownerConditionsHash(input.ownerConditionsSpec);
		}

		if (hasReplacementItems) {
			const activeItems = await tx.list(
				COLLECTIONS.ASSET_CONFIG_ITEMS,
				{ asset_id: assetId, item_state: "active" },
				{ orderBy: "created_at", direction: "asc", limit: 500 },
			);
			for (const item of activeItems) {
				await tx.update(COLLECTIONS.ASSET_CONFIG_ITEMS, item.id, {
					item_state: "retired",
				});
			}
		}

		const updatedAsset = Object.keys(patch).length
			? await tx.update(COLLECTIONS.ASSETS, assetId, patch)
			: asset;

		const insertedItems = [];
		for (const item of itemInputs) {
			insertedItems.push(
				await tx.insert(COLLECTIONS.ASSET_CONFIG_ITEMS, {
					slug: createSlug(`${updatedAsset.slug}-${item.itemLabel}`),
					status: CMS_STATUS.PUBLISHED,
					author_id: user.id,
					asset_id: assetId,
					config_version: nextConfigVersion,
					item_state: "active",
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

		await appendAssetEvent(tx, {
			assetId,
			eventKind: EVENT_KIND.ASSET_CONFIG_UPDATED,
			actor: user,
			fromBusinessState: asString(asset.business_state),
			toBusinessState: asString(updatedAsset.business_state),
			eventSpec: {
				updatedFields: Object.keys(patch),
				insertedItemCount: insertedItems.length,
				configVersion: updatedAsset.config_version ?? nextConfigVersion,
			},
		});

		return { asset: updatedAsset, insertedItems };
	});
}
