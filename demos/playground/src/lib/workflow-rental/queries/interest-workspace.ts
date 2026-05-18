import type { DomainStore, UserContext } from "../../domain/types.js";
import { DomainError, asString } from "../../domain/types.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import {
	actorRoleFor,
	getAssetOrThrow,
	getInterestOrThrow,
	listWorkspace,
} from "../store/repository.js";
import { projectWorkflowWorkspace } from "./workspace-projection.js";

export async function getWorkflowInterestWorkspace(
	store: DomainStore,
	user: UserContext | null,
	interestId: string,
) {
	const interest = await getInterestOrThrow(store, interestId);
	const asset = await getAssetOrThrow(store, asString(interest.asset_id));
	const role = actorRoleFor(user, asset, interest);

	if (role !== "owner" && role !== "applicant" && role !== "renter") {
		throw new DomainError("FORBIDDEN", "Only workflow participants can view this workspace", 403);
	}

	const instanceId = asString(interest.workflow_instance_id);
	const instance = instanceId
		? await store.get(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, instanceId)
		: null;

	if (!instance) {
		throw new DomainError("WORKFLOW_NOT_FOUND", "Workflow instance not found", 404);
	}

	const workspace = await listWorkspace(store, user, instance);
	return projectWorkflowWorkspace(workspace);
}