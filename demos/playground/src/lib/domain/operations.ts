import type { AddNegotiationRoundRequest } from "./api-contracts.js";
import { ASSET_BUSINESS_STATE, HANDOVER_KIND, ROUND_KIND, ROUND_PHASE } from "./constants.js";
import type { LifecycleContext } from "./lifecycle-context.js";
import type { AlmRelationshipRole } from "./relationship.js";
import type { DomainRow } from "./types.js";
import { DomainError, asString } from "./types.js";

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

export type OperationPolicyInput = {
	operationId: OperationId;
	relationship: AlmRelationshipRole;
	asset?: DomainRow;
	lifecycleContext?: LifecycleContext;
	payload?: unknown;
	allowLegacyRentedMoveOut?: boolean;
};

export function assertOperationAllowed(
	operationOrInput: OperationId | OperationPolicyInput,
	relationship?: AlmRelationshipRole,
): void {
	const input =
		typeof operationOrInput === "string"
			? { operationId: operationOrInput, relationship }
			: operationOrInput;
	const operationId = input.operationId;
	const resolvedRelationship = input.relationship;
	if (!resolvedRelationship) {
		throw new DomainError("OPERATION_NOT_ALLOWED", `${operationId} has no relationship`, 403);
	}
	const allowed =
		(resolvedRelationship === "owner" && OWNER_OPERATIONS.has(operationId)) ||
		(resolvedRelationship === "renter" && RENTER_OPERATIONS.has(operationId)) ||
		(resolvedRelationship === "applicant" && APPLICANT_OPERATIONS.has(operationId));
	if (!allowed) {
		throw new DomainError(
			"OPERATION_NOT_ALLOWED",
			`${operationId} is not allowed for ${resolvedRelationship}`,
			403,
		);
	}
	assertLifecycleAllowed(input as OperationPolicyInput & { relationship: AlmRelationshipRole });
}

function assertLifecycleAllowed(input: OperationPolicyInput & { relationship: AlmRelationshipRole }) {
	if (!input.asset) return;
	const state = asString(input.asset.business_state);
	if (input.operationId === "handover.start_move_in") {
		if (state !== ASSET_BUSINESS_STATE.BOOKED) {
			throw new DomainError(
				"INVALID_ASSET_STATE",
				"Move-in handover can only start after booking",
				409,
			);
		}
		if (input.lifecycleContext?.activeHandover) {
			throw new DomainError("ACTIVE_HANDOVER_EXISTS", "Asset already has an active handover", 409);
		}
		return;
	}
	if (input.operationId === "handover.start_move_out") {
		const legacyAllowed =
			input.allowLegacyRentedMoveOut && state === ASSET_BUSINESS_STATE.RENTED;
		if (state !== ASSET_BUSINESS_STATE.RETURN_PENDING && !legacyAllowed) {
			throw new DomainError(
				"INVALID_ASSET_STATE",
				"Move-out handover requires return pending state",
				409,
			);
		}
		if (input.lifecycleContext?.activeHandover) {
			throw new DomainError("ACTIVE_HANDOVER_EXISTS", "Asset already has an active handover", 409);
		}
		return;
	}
	if (input.operationId === "handover.tenant_accept_move_in") {
		if (state !== ASSET_BUSINESS_STATE.BOOKED) {
			throw new DomainError(
				"INVALID_ASSET_STATE",
				"Move-in handover can only be accepted while asset is booked",
				409,
			);
		}
		const handoverKind = asString(input.payload);
		if (handoverKind && handoverKind !== HANDOVER_KIND.MOVE_IN) {
			throw new DomainError(
				"OPERATION_NOT_ALLOWED",
				"Only move-in handovers can be accepted through this action",
				403,
			);
		}
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
