import type { StartHandoverRequest } from "../api-contracts.js";
import { requireAssetParticipant } from "../auth.js";
import { CMS_STATUS, COLLECTIONS, EVENT_KIND, HANDOVER_STATE } from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { getAssetOrThrow } from "../repositories/assets.js";
import type { DomainStore, UserContext } from "../types.js";
import { asString } from "../types.js";

export async function startHandover(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	input: StartHandoverRequest,
) {
	return store.transaction(async (tx) => {
		await requireAssetParticipant(tx, user, assetId);
		const asset = await getAssetOrThrow(tx, assetId);
		const agreementId = asString(asset.active_agreement_id);
		const renterUserId = asString(asset.active_renter_user_id);
		const ownerUserId = asString(asset.owner_user_id);
		const handover = await tx.insert(COLLECTIONS.HANDOVER_SESSIONS, {
			status: CMS_STATUS.PUBLISHED,
			author_id: user.id,
			asset_id: assetId,
			agreement_id: agreementId,
			owner_user_id: ownerUserId,
			renter_user_id: renterUserId,
			handover_kind: input.handoverKind,
			handover_state: HANDOVER_STATE.RENTER_REVIEWING,
			baseline_handover_id: input.baselineHandoverId ?? null,
			started_at: tx.now(),
			submitted_at: tx.now(),
			accepted_at: null,
			closed_at: null,
			summary_spec: input.summarySpec ?? {},
		});
		const configItems = await tx.list(
			COLLECTIONS.ASSET_CONFIG_ITEMS,
			{ asset_id: assetId },
			{ orderBy: "created_at", direction: "asc", limit: 500 },
		);
		const checks = [];
		for (const item of configItems) {
			checks.push(
				await tx.insert(COLLECTIONS.HANDOVER_ITEM_CHECKS, {
					status: CMS_STATUS.PUBLISHED,
					author_id: user.id,
					handover_id: handover.id,
					baseline_handover_id: input.baselineHandoverId ?? null,
					asset_id: assetId,
					asset_config_item_id: item.id,
					item_label: asString(item.item_label),
					expected_state:
						asString(item.renter_accepted_state) || asString(item.owner_declared_state),
					observed_state:
						asString(item.renter_accepted_state) || asString(item.owner_declared_state),
					owner_claimed_state: null,
					renter_response_state: null,
					dispute_state: "none",
					estimated_repair_cost: null,
					agreed_repair_cost: null,
					media_refs: item.media_refs ?? [],
					check_spec: { sourceItemSpec: item.item_spec ?? {} },
				}),
			);
		}
		await tx.update(COLLECTIONS.ASSETS, assetId, { active_handover_id: handover.id });
		await appendAssetEvent(tx, {
			assetId,
			eventKind: EVENT_KIND.HANDOVER_STARTED,
			actor: user,
			eventSpec: {
				handoverId: handover.id,
				handoverKind: input.handoverKind,
				checkCount: checks.length,
			},
		});
		return { handover, checks };
	});
}
