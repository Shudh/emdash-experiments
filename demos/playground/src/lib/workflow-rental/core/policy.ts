import type { DomainRow, UserContext } from "../../domain/types.js";
import { asString, DomainError } from "../../domain/types.js";
import type {
	WorkflowActorRole,
	WorkflowCardDefinition,
	WorkflowActionDefinition,
} from "./types.js";

export function assertWorkflowRole(
	role: WorkflowActorRole | "anonymous" | "other",
	allowed: WorkflowActorRole[],
	message = "Actor is not allowed",
): WorkflowActorRole {
	if (role === "anonymous") throw new DomainError("UNAUTHORIZED", "Login required", 401);
	if (role === "other" || !allowed.includes(role)) throw new DomainError("FORBIDDEN", message, 403);
	return role;
}

export function assertStateAllowed(
	workflowState: string,
	assetState: string,
	definition: WorkflowCardDefinition | WorkflowActionDefinition,
): void {
	if (!definition.allowedWorkflowStates.includes(workflowState)) {
		throw new DomainError(
			"WORKFLOW_STATE_NOT_ALLOWED",
			"Workflow state does not allow this action",
			409,
		);
	}
	if (!definition.allowedAssetStates.includes(assetState)) {
		throw new DomainError("ASSET_STATE_NOT_ALLOWED", "Asset state does not allow this action", 409);
	}
}

export function assertOwner(user: UserContext, asset: DomainRow): void {
	if (asString(asset.owner_user_id) !== user.id) {
		throw new DomainError("FORBIDDEN", "Only the asset owner can perform this action", 403);
	}
}
