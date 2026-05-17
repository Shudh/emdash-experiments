import type { AddNegotiationRoundRequest } from "./api-contracts.js";
import { ROUND_KIND, ROUND_PHASE } from "./constants.js";
import type { AlmRelationshipRole } from "./relationship.js";
import { DomainError } from "./types.js";

export type OperationId =
	| "asset.create"
	| "asset.update_config"
	| "asset.publish"
	| "asset.return_to_draft"
	| "asset.archive"
	| "asset.relist"
	| "interest.express"
	| "interest.owner_request"
	| "interest.tenant_answer"
	| "interest.tenant_offer"
	| "interest.owner_counter"
	| "interest.reject"
	| "interest.owner_propose_terms"
	| "interest.tenant_accept_terms"
	| "agreement.owner_sign"
	| "agreement.tenant_sign"
	| "agreement.activate_booking"
	| "handover.start_move_in"
	| "handover.tenant_accept_move_in"
	| "notice.tenant_submit"
	| "notice.owner_acknowledge"
	| "handover.start_move_out"
	| "handover.owner_claim_damage"
	| "handover.tenant_respond_damage"
	| "handover.owner_propose_settlement"
	| "handover.tenant_accept_settlement"
	| "handover.close_settlement";

const OWNER_OPERATIONS = new Set<OperationId>([
	"asset.create",
	"asset.update_config",
	"asset.publish",
	"asset.return_to_draft",
	"asset.archive",
	"asset.relist",
	"interest.owner_request",
	"interest.owner_counter",
	"interest.reject",
	"interest.owner_propose_terms",
	"agreement.owner_sign",
	"agreement.activate_booking",
	"handover.start_move_in",
	"notice.owner_acknowledge",
	"handover.start_move_out",
	"handover.owner_claim_damage",
	"handover.owner_propose_settlement",
]);

const RENTER_OPERATIONS = new Set<OperationId>([
	"interest.express",
	"interest.tenant_answer",
	"interest.tenant_offer",
	"interest.tenant_accept_terms",
	"agreement.tenant_sign",
	"handover.tenant_accept_move_in",
	"notice.tenant_submit",
	"handover.tenant_respond_damage",
	"handover.tenant_accept_settlement",
	"handover.close_settlement",
]);

const APPLICANT_OPERATIONS = new Set<OperationId>([
	"interest.express",
	"interest.tenant_answer",
	"interest.tenant_offer",
	"interest.tenant_accept_terms",
	"agreement.tenant_sign",
]);

export function assertOperationAllowed(
	operationId: OperationId,
	relationship: AlmRelationshipRole,
): void {
	const allowed =
		(relationship === "owner" && OWNER_OPERATIONS.has(operationId)) ||
		(relationship === "renter" && RENTER_OPERATIONS.has(operationId)) ||
		(relationship === "applicant" && APPLICANT_OPERATIONS.has(operationId));
	if (!allowed) {
		throw new DomainError(
			"OPERATION_NOT_ALLOWED",
			`${operationId} is not allowed for ${relationship}`,
			403,
		);
	}
}

export function resolveNegotiationOperation(
	input: AddNegotiationRoundRequest,
	relationship: AlmRelationshipRole,
): OperationId {
	if (input.roundPhase !== ROUND_PHASE.PRE_AGREEMENT) {
		throw new DomainError("OPERATION_NOT_ALLOWED", "Unsupported negotiation phase", 403);
	}
	if (relationship === "owner") {
		if (input.roundKind === ROUND_KIND.QUESTION) return "interest.owner_request";
		if (input.roundKind === ROUND_KIND.COUNTER) return "interest.owner_counter";
		if (input.roundKind === ROUND_KIND.REJECTION) return "interest.reject";
		if (input.roundKind === ROUND_KIND.ACCEPTANCE) return "interest.owner_propose_terms";
	}
	if (relationship === "applicant" || relationship === "renter") {
		if (input.roundKind === ROUND_KIND.ANSWER) return "interest.tenant_answer";
		if (input.roundKind === ROUND_KIND.OFFER) return "interest.tenant_offer";
		if (input.roundKind === ROUND_KIND.COUNTER) return "interest.tenant_offer";
		if (input.roundKind === ROUND_KIND.ACCEPTANCE) return "interest.tenant_accept_terms";
	}
	throw new DomainError("OPERATION_NOT_ALLOWED", "Round kind is not allowed for this actor", 403);
}

export function resolveHandoverRoundOperation(
	input: AddNegotiationRoundRequest,
	relationship: AlmRelationshipRole,
): OperationId {
	if (relationship === "owner") {
		if (input.roundKind === ROUND_KIND.SETTLEMENT_OFFER) return "handover.owner_propose_settlement";
		if (input.roundKind === ROUND_KIND.COUNTER) return "handover.owner_propose_settlement";
	}
	if (relationship === "renter") {
		if (input.roundKind === ROUND_KIND.ANSWER) return "handover.tenant_respond_damage";
		if (input.roundKind === ROUND_KIND.COUNTER) return "handover.tenant_respond_damage";
		if (input.roundKind === ROUND_KIND.ACCEPTANCE) return "handover.tenant_accept_settlement";
	}
	throw new DomainError("OPERATION_NOT_ALLOWED", "Handover round kind is not allowed for this actor", 403);
}
