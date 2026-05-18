import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import { ownerConditionsHash } from "../../domain/validation.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import { getAssetOrThrow } from "../store/repository.js";

export type UpdateWorkflowAssetConfigInput = {
	publicPrice?: number;
	currency?: string;
	minimumMonths?: number;
	configSpec?: Record<string, unknown>;
	conditionSpec?: Record<string, unknown>;
	ownerConditionsSpec?: Record<string, unknown>;
	items?: Array<Record<string, unknown>>;
};

export async function updateWorkflowAssetConfig(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	input: UpdateWorkflowAssetConfigInput,
) {
	return store.transaction(async (tx) => {
		const asset = await getAssetOrThrow(tx, assetId);
		if (asString(asset.owner_user_id) !== user.id) {
			throw new DomainError("FORBIDDEN", "Only the asset owner can update config", 403);
		}
		const ownerConditionsSpec =
			input.ownerConditionsSpec ?? (asset.owner_conditions_spec as Record<string, unknown>) ?? {};
		const updated = await tx.update(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId, {
			public_price: input.publicPrice ?? asset.public_price ?? null,
			currency: input.currency ?? asset.currency ?? "INR",
			minimum_months: input.minimumMonths ?? asset.minimum_months ?? null,
			config_spec: input.configSpec ?? asset.config_spec ?? {},
			condition_spec: input.conditionSpec ?? asset.condition_spec ?? {},
			config_version: Number(asset.config_version ?? 1) + 1,
			owner_conditions_spec: ownerConditionsSpec,
			conditions_version: Number(asset.conditions_version ?? 1) + 1,
			conditions_hash: ownerConditionsHash(ownerConditionsSpec),
		});
		const existing = await tx.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_CONFIG_ITEMS,
			{ asset_id: assetId },
			{ limit: 500 },
		);
		for (const item of existing)
			await tx.softDelete(WORKFLOW_RENTAL_COLLECTIONS.ASSET_CONFIG_ITEMS, item.id);
		const insertedItems = [];
		for (const item of input.items ?? []) {
			insertedItems.push(
				await tx.insert(WORKFLOW_RENTAL_COLLECTIONS.ASSET_CONFIG_ITEMS, {
					status: "published",
					author_id: user.id,
					asset_id: assetId,
					item_kind: item.itemKind ?? "fixture",
					item_group: item.itemGroup ?? null,
					item_label: item.itemLabel ?? "Item",
					item_state: "active",
					owner_declared_state: item.ownerDeclaredState ?? "working",
					item_spec: item.itemSpec ?? {},
					media_refs: item.mediaRefs ?? [],
				}),
			);
		}
		return { asset: updated, insertedItems };
	});
}
