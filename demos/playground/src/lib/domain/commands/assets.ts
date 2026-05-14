import { DomainError, assertFound } from "../errors.js";
import { createId, nowIso, slugify } from "../ids.js";
import type { AddAssetInput, RentalDomainStore, UpdateAssetConfigInput } from "../types.js";

export async function addAsset(store: RentalDomainStore, input: AddAssetInput) {
	const now = nowIso();
	return store.createAsset({
		...input,
		id: createId("asset"),
		slug: input.slug ?? slugify(input.title),
		now,
	});
}

export async function updateAssetConfig(store: RentalDomainStore, input: UpdateAssetConfigInput) {
	const asset = assertFound(
		await store.getAsset(input.assetId),
		"ASSET_NOT_FOUND",
		"Asset not found",
	);
	if (asset.business_state !== "draft_asset" && asset.business_state !== "maintenance") {
		throw new DomainError(
			"ASSET_NOT_EDITABLE",
			"Only draft or maintenance assets can be configured",
		);
	}
	const now = nowIso();
	const updated = await store.updateAsset(input.assetId, {
		config_spec: input.configSpec,
		condition_spec: input.conditionSpec,
		updated_at: now,
		version: asset.version + 1,
	});
	const items = await store.replaceAssetConfigItems(
		input.assetId,
		input.items.map((item) => ({
			...item,
			id: createId("cfg"),
			slug: `${asset.slug}-${slugify(item.itemKey)}`,
			now,
		})),
	);
	return { asset: updated, items };
}

export async function publishAssetToMarketplace(store: RentalDomainStore, assetId: string) {
	const asset = assertFound(await store.getAsset(assetId), "ASSET_NOT_FOUND", "Asset not found");
	const items = await store.listAssetConfigItems(assetId);
	if (items.length === 0)
		throw new DomainError(
			"ASSET_CONFIG_REQUIRED",
			"Asset config items are required before publishing",
		);
	const now = nowIso();
	return store.updateAsset(assetId, {
		status: "published",
		business_state: "listed",
		visibility_state: "marketplace",
		published_at: asset.published_at ?? now,
		updated_at: now,
	});
}

export async function returnAssetToDraft(store: RentalDomainStore, assetId: string) {
	assertFound(await store.getAsset(assetId), "ASSET_NOT_FOUND", "Asset not found");
	const now = nowIso();
	return store.updateAsset(assetId, {
		status: "draft",
		business_state: "draft_asset",
		visibility_state: "private",
		updated_at: now,
	});
}

export async function relistAsset(store: RentalDomainStore, assetId: string) {
	return publishAssetToMarketplace(store, assetId);
}
