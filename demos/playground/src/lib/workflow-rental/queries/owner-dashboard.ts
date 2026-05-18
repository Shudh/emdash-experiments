import type { DomainStore, UserContext } from "../../domain/types.js";
import { asString } from "../../domain/types.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";

export async function getWorkflowOwnerDashboard(store: DomainStore, user: UserContext) {
	const assets = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.ASSETS,
		{ owner_user_id: user.id },
		{ orderBy: "created_at", direction: "desc", limit: 100 },
	);
	const interests = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.INTERESTS,
		{ owner_user_id: user.id },
		{ orderBy: "created_at", direction: "desc", limit: 100 },
	);
	const inbox = await Promise.all(
		interests.map(async (interest) => {
			const instanceId = asString(interest.workflow_instance_id);
			const cards = instanceId
				? await store.list(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS, {
						workflow_instance_id: instanceId,
					})
				: [];
			return {
				...interest,
				asset_title: interest.asset_title,
				pending_request_count: cards.filter((card) => card.card_state === "open").length,
			};
		}),
	);
	return {
		assets: assets.map((asset) => ({
			...asset,
			viewer: { relationship: "owner" },
			availableActions: ownerAssetActions(asset),
		})),
		inbox,
	};
}

function ownerAssetActions(asset: Record<string, unknown>) {
	if (asset.business_state === "booked")
		return [{ id: "workflow.start_move_in", label: "Start move-in" }];
	if (asset.business_state === "rented")
		return [{ id: "workflow.start_move_out", label: "Start move-out" }];
	return [];
}
