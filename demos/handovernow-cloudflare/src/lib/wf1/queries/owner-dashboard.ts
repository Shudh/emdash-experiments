import type { DomainStore, UserContext } from "../../domain/types.js";
import { asString } from "../../domain/types.js";
import {
	filterAssetsForLane,
	wf1WorkspaceHref,
	type Wf1Lane,
} from "../routing/lane.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import { listWorkspace } from "../store/repository.js";
import { projectWorkflowWorkspace } from "./workspace-projection.js";

export async function getWorkflowOwnerDashboard(
	store: DomainStore,
	user: UserContext,
	options: { lane?: Wf1Lane } = {},
) {
	const lane = options.lane ?? "public";

	const assets = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.ASSETS,
		{ owner_user_id: user.id },
		{ orderBy: "created_at", direction: "desc", limit: 100 },
	);

	const visibleAssets = filterAssetsForLane(assets, lane);
	const visibleAssetIds = new Set(visibleAssets.map((asset) => asset.id));

	const interests = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.INTERESTS,
		{ owner_user_id: user.id },
		{ orderBy: "created_at", direction: "desc", limit: 100 },
	);

	const visibleInterests = interests.filter((interest) =>
		visibleAssetIds.has(asString(interest.asset_id)),
	);

	const applicationRows = await Promise.all(
		visibleInterests.map(async (interest) => {
			const instanceId = asString(interest.workflow_instance_id);
			const instance = instanceId
				? await store.get(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, instanceId)
				: null;
			const projected = instance
				? projectWorkflowWorkspace(await listWorkspace(store, user, instance))
				: null;
			const projection = projected?.projection;

			return {
				...interest,
				asset_title: interest.asset_title,
				interest,
				instance,
				applicationState: projection?.applicationState ?? {
					id: asString(interest.interest_state, "submitted"),
					label: asString(interest.interest_state, "submitted"),
				},
				availableActions: projection?.availableActions ?? [],
				workspaceHref: instance ? wf1WorkspaceHref(lane, String(instance.id)) : "",
				pending_request_count: projection?.taskBuckets.otherSideOpenTasks.length ?? 0,
			};
		}),
	);

	const applicationRowsByAssetId = new Map<string, typeof applicationRows>();

	for (const row of applicationRows) {
		const assetId = asString((row as Record<string, unknown>).asset_id);
		applicationRowsByAssetId.set(assetId, [...(applicationRowsByAssetId.get(assetId) ?? []), row]);
	}

	return {
		assets: visibleAssets.map((asset) => ({
			...asset,
			viewer: { relationship: "owner" },
			assetState: {
				id: asString(asset.business_state, "draft"),
				label: asString(asset.business_state, "draft").replaceAll("_", " "),
			},
			applications: applicationRowsByAssetId.get(asset.id) ?? [],
		})),
		inbox: applicationRows,
		applicationRows,
	};
}
