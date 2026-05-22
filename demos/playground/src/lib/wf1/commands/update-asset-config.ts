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

type AssetPatch = {
	public_price?: number | null;
	currency?: string;
	minimum_months?: number | null;
	config_spec?: Record<string, unknown>;
	condition_spec?: Record<string, unknown>;
	config_version?: number;
	owner_conditions_spec?: Record<string, unknown>;
	conditions_version?: number;
	conditions_hash?: string;
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

		if (hasOwn(input, "items") && input.items !== undefined && !Array.isArray(input.items)) {
			throw new DomainError("INVALID_ASSET_CONFIG_ITEMS", "Asset config items must be an array", 422);
		}

		const assetPatch: AssetPatch = {};
		let configChanged = false;

		if (hasOwn(input, "publicPrice")) {
			assetPatch.public_price = input.publicPrice ?? null;
			configChanged = true;
		}

		if (hasOwn(input, "currency")) {
			assetPatch.currency = input.currency ?? "INR";
			configChanged = true;
		}

		if (hasOwn(input, "minimumMonths")) {
			assetPatch.minimum_months = input.minimumMonths ?? null;
			configChanged = true;
		}

		if (hasOwn(input, "configSpec")) {
			assetPatch.config_spec = input.configSpec ?? {};
			configChanged = true;
		}

		if (hasOwn(input, "conditionSpec")) {
			assetPatch.condition_spec = input.conditionSpec ?? {};
			configChanged = true;
		}

		if (hasOwn(input, "items")) {
			configChanged = true;
		}

		if (configChanged) {
			assetPatch.config_version = Number(asset.config_version ?? 1) + 1;
		}

		if (hasOwn(input, "ownerConditionsSpec")) {
			const ownerConditionsSpec = input.ownerConditionsSpec ?? {};
			assetPatch.owner_conditions_spec = ownerConditionsSpec;
			assetPatch.conditions_version = Number(asset.conditions_version ?? 1) + 1;
			assetPatch.conditions_hash = ownerConditionsHash(ownerConditionsSpec);
		}

		const updated =
			Object.keys(assetPatch).length > 0
				? await tx.update(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId, assetPatch)
				: asset;

		const insertedItems = [];

		if (input.items !== undefined) {
			const existing = await tx.list(
				WORKFLOW_RENTAL_COLLECTIONS.ASSET_CONFIG_ITEMS,
				{ asset_id: assetId },
				{ limit: 500 },
			);

			for (const item of existing) {
				await tx.softDelete(WORKFLOW_RENTAL_COLLECTIONS.ASSET_CONFIG_ITEMS, asString(item.id));
			}

			for (const item of input.items) {
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
		}

		return { asset: updated, insertedItems };
	});
}

function hasOwn(object: object, key: PropertyKey): boolean {
	return Object.prototype.hasOwnProperty.call(object, key);
}