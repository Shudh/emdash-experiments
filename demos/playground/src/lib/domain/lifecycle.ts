import {
	ASSET_BUSINESS_STATE,
	HANDOVER_KIND,
	HANDOVER_STATE,
	VISIBILITY_STATE,
} from "./constants.js";
import type { OperationId } from "./operations.js";
import type { AlmRelationshipRole } from "./relationship.js";
import type { DomainRow } from "./types.js";
import { asString } from "./types.js";

export type AvailableAction = {
	id: OperationId;
	label: string;
	cardKind?: string;
};

export function assetAvailableActions(
	asset: DomainRow,
	relationship: AlmRelationshipRole,
): AvailableAction[] {
	const state = asString(asset.business_state);
	const visibility = asString(asset.visibility_state);
	const actions: AvailableAction[] = [];
	if (relationship !== "owner") return actions;
	if (state === ASSET_BUSINESS_STATE.DRAFT_ASSET) {
		actions.push({ id: "asset.update_config", label: "Edit draft/config" });
		actions.push({ id: "asset.publish", label: "Publish" });
	}
	if (state === ASSET_BUSINESS_STATE.LISTED && visibility === VISIBILITY_STATE.MARKETPLACE) {
		actions.push({ id: "asset.return_to_draft", label: "Return to draft" });
	}
	if (state === ASSET_BUSINESS_STATE.BOOKED) {
		actions.push({
			id: "handover.start_move_in",
			label: "Start move-in handover",
			cardKind: "move_in_handover",
		});
	}
	if (state === ASSET_BUSINESS_STATE.RENTED) {
		actions.push({
			id: "handover.start_move_out",
			label: "Start move-out handover",
			cardKind: "move_out_handover",
		});
	}
	if (state === ASSET_BUSINESS_STATE.MAINTENANCE) {
		actions.push({ id: "asset.relist", label: "Relist" });
		actions.push({ id: "asset.return_to_draft", label: "Return to draft" });
	}
	return actions;
}

export function negotiationAvailableActions(relationship: AlmRelationshipRole): AvailableAction[] {
	if (relationship === "owner") {
		return [
			{ id: "interest.owner_request", label: "Ask question" },
			{ id: "interest.owner_counter", label: "Counter" },
			{ id: "interest.reject", label: "Reject" },
			{ id: "interest.owner_propose_terms", label: "Accept final terms" },
		];
	}
	if (relationship === "applicant" || relationship === "renter") {
		return [
			{ id: "interest.tenant_answer", label: "Answer" },
			{ id: "interest.tenant_offer", label: "Offer" },
			{ id: "interest.tenant_accept_terms", label: "Accept/counter final terms" },
		];
	}
	return [];
}

export function handoverAvailableActions(
	handover: DomainRow,
	relationship: AlmRelationshipRole,
): AvailableAction[] {
	const kind = asString(handover.handover_kind);
	const state = asString(handover.handover_state);
	const actions: AvailableAction[] = [];
	if (
		relationship === "renter" &&
		kind === HANDOVER_KIND.MOVE_IN &&
		(state === HANDOVER_STATE.OWNER_SUBMITTED || state === HANDOVER_STATE.RENTER_REVIEWING)
	) {
		actions.push({ id: "handover.tenant_accept_move_in", label: "Accept move-in handover" });
	}
	if (relationship === "owner" && kind === HANDOVER_KIND.MOVE_OUT) {
		actions.push({ id: "handover.owner_claim_damage", label: "Claim damage" });
		actions.push({ id: "handover.owner_propose_settlement", label: "Propose settlement" });
	}
	if (relationship === "renter" && kind === HANDOVER_KIND.MOVE_OUT) {
		actions.push({ id: "handover.tenant_respond_damage", label: "Respond to damage" });
		actions.push({ id: "handover.tenant_accept_settlement", label: "Accept settlement" });
	}
	return actions;
}
