import type { DomainStore, UserContext } from "../../domain/types.js";
import { createSlug } from "../../domain/validation.js";
import {
	WF_ASSET_STATE,
	WF_STATUS,
	WF_VISIBILITY,
	WORKFLOW_RENTAL_COLLECTIONS,
} from "../store/collections.js";
import {
	appendWorkflowEvent,
	grantWorkflowAssetAccess,
	ownerConditions,
} from "../store/repository.js";

export type CreateWorkflowAssetInput = {
	assetKind: string;
	title: string;
	locationLabel?: string;
	publicPrice?: number;
	currency?: string;
	ownerConditionsSpec?: Record<string, unknown>;
	configSpec?: Record<string, unknown>;
};

export async function createWorkflowAsset(
	store: DomainStore,
	user: UserContext,
	input: CreateWorkflowAssetInput,
) {
	return store.transaction(async (tx) => {
		const conditions = ownerConditions(input.ownerConditionsSpec ?? {});
		const asset = await tx.insert(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, {
			slug: createSlug(input.title),
			status: WF_STATUS.DRAFT,
			author_id: user.id,
			title: input.title,
			asset_kind: input.assetKind,
			owner_user_id: user.id,
			business_state: WF_ASSET_STATE.DRAFT_ASSET,
			visibility_state: WF_VISIBILITY.PRIVATE,
			public_price: input.publicPrice ?? null,
			currency: input.currency ?? "INR",
			location_label: input.locationLabel ?? null,
			minimum_months: null,
			active_interest_id: null,
			active_workflow_instance_id: null,
			active_renter_user_id: null,
			config_spec: input.configSpec ?? {},
			condition_spec: {},
			config_version: 1,
			owner_conditions_spec: conditions.spec,
			conditions_version: conditions.version,
			conditions_hash: conditions.hash,
		});
		await grantWorkflowAssetAccess(tx, {
			assetId: asset.id,
			userId: user.id,
			role: "owner",
			authorId: user.id,
		});
		await appendWorkflowEvent(tx, {
			asset,
			eventKind: "asset_created",
			actor: user,
			actorRole: "owner",
			toAssetState: WF_ASSET_STATE.DRAFT_ASSET,
		});
		return { asset };
	});
}
