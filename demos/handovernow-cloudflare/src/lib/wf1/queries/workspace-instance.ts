import type { DomainStore, UserContext } from "../../domain/types.js";
import { DomainError } from "../../domain/types.js";
import {
	actorRoleFor,
	getAssetOrThrow,
	getInterestOrThrow,
	getInstanceOrThrow,
	listWorkspace,
} from "../store/repository.js";
import { projectWorkflowWorkspace } from "./workspace-projection.js";

export async function getWf1WorkflowInstanceWorkspace(
	store: DomainStore,
	user: UserContext | null,
	workflowInstanceId: string,
) {
	const instance = await getInstanceOrThrow(store, workflowInstanceId);
	const [asset, interest] = await Promise.all([
		getAssetOrThrow(store, String(instance.asset_id ?? "")),
		getInterestOrThrow(store, String(instance.interest_id ?? "")),
	]);

	const role = actorRoleFor(user, asset, interest);
	if (role !== "owner" && role !== "applicant" && role !== "renter") {
		throw new DomainError("FORBIDDEN", "Only workflow participants can view this workspace", 403);
	}

	const workspace = await listWorkspace(store, user, instance);
	return projectWorkflowWorkspace(workspace);
}
