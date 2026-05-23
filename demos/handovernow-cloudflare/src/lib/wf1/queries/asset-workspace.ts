import type { DomainStore, UserContext } from "../../domain/types.js";
import { DomainError, asString } from "../../domain/types.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import { actorRoleFor, getAssetOrThrow, listWorkspace } from "../store/repository.js";
import { projectWorkflowWorkspace } from "./workspace-projection.js";

export async function getWorkflowAssetWorkspace(
	store: DomainStore,
	user: UserContext | null,
	assetId: string,
) {
	const asset = await getAssetOrThrow(store, assetId);
	const interest = user
		? await store.findOne(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, {
				asset_id: assetId,
				interested_user_id: user.id,
			})
		: null;

	const role = actorRoleFor(user, asset, interest);

	if (role !== "owner" && role !== "applicant" && role !== "renter") {
		throw new DomainError("FORBIDDEN", "Only workflow participants can view this workspace", 403);
	}

	const instanceId = asString(interest?.workflow_instance_id ?? asset.active_workflow_instance_id);
	const instance = instanceId
		? await store.get(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, instanceId)
		: null;

	if (!instance) {
		throw new DomainError("WORKFLOW_NOT_FOUND", "Workflow instance not found", 404);
	}

	const workspace = await listWorkspace(store, user, instance);
	return projectWorkflowWorkspace(workspace);
}
