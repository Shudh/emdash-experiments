import type { DomainRow, DomainStore, UserContext } from "../../domain/types.js";
import { asString } from "../../domain/types.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import { grantWorkflowAssetAccess } from "../store/repository.js";
import type { WorkflowActorRole, WorkflowTransitionRule } from "./types.js";

export async function applyTransitionRules(
	store: DomainStore,
	input: {
		rules: WorkflowTransitionRule[];
		when: WorkflowTransitionRule["when"];
		decision?: string;
		asset: DomainRow;
		interest: DomainRow;
		instance: DomainRow;
		actor: UserContext;
	},
): Promise<{ asset: DomainRow; instance: DomainRow }> {
	let asset = input.asset;
	let instance = input.instance;
	for (const rule of input.rules) {
		if (rule.when !== input.when) continue;
		if (rule.decision && rule.decision !== input.decision) continue;
		if (rule.nextWorkflowState) {
			instance = await store.update(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, instance.id, {
				workflow_state: rule.nextWorkflowState,
			});
			await store.update(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, input.interest.id, {
				interest_state: rule.nextWorkflowState,
			});
		}
		if (rule.nextAssetState || rule.nextVisibilityState) {
			const patch: Record<string, unknown> = {};
			if (rule.nextAssetState) patch.business_state = rule.nextAssetState;
			if (rule.nextVisibilityState) patch.visibility_state = rule.nextVisibilityState;
			if (rule.nextAssetState === "booked") {
				patch.active_interest_id = input.interest.id;
				patch.active_workflow_instance_id = instance.id;
				patch.active_renter_user_id = asString(input.interest.interested_user_id);
			}
			asset = await store.update(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, asset.id, patch);
		}
		if (rule.grantAccess) {
			for (const role of rule.grantAccess) {
				const userId = userIdForRole(role, asset, input.interest);
				if (!userId) continue;
				await grantWorkflowAssetAccess(store, {
					assetId: asset.id,
					userId,
					role: role === "owner" ? "owner" : "renter",
					authorId: input.actor.id,
				});
			}
		}
	}
	return { asset, instance };
}

function userIdForRole(role: WorkflowActorRole, asset: DomainRow, interest: DomainRow): string {
	if (role === "owner") return asString(asset.owner_user_id);
	return asString(interest.interested_user_id);
}
