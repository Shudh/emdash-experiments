import { describe, expect, test } from "vitest";

import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	ROUND_KIND,
	ROUND_PHASE,
} from "../../src/lib/domain/constants.js";
import {
	assertOperationAllowed,
	resolveHandoverRoundOperation,
	resolveNegotiationOperation,
} from "../../src/lib/domain/operations.js";
import type { DomainRow } from "../../src/lib/domain/types.js";

function asset(state: string): DomainRow {
	return {
		id: "asset_1",
		slug: "asset-1",
		status: CMS_STATUS.PUBLISHED,
		author_id: "owner",
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		published_at: null,
		scheduled_at: null,
		deleted_at: null,
		version: 1,
		live_revision_id: null,
		draft_revision_id: null,
		business_state: state,
	};
}

describe("ALM operation policy", () => {
	test("maps valid owner and tenant negotiation rounds", () => {
		expect(
			resolveNegotiationOperation(
				{ roundPhase: ROUND_PHASE.PRE_AGREEMENT, roundKind: ROUND_KIND.QUESTION },
				"owner",
			),
		).toBe("interest.owner_request");
		expect(
			resolveNegotiationOperation(
				{ roundPhase: ROUND_PHASE.PRE_AGREEMENT, roundKind: ROUND_KIND.ANSWER },
				"applicant",
			),
		).toBe("interest.tenant_answer");
		expect(
			resolveNegotiationOperation(
				{ roundPhase: ROUND_PHASE.PRE_AGREEMENT, roundKind: ROUND_KIND.OFFER },
				"renter",
			),
		).toBe("interest.tenant_offer");
	});

	test("rejects semantically wrong negotiation actors", () => {
		expect(() =>
			resolveNegotiationOperation(
				{ roundPhase: ROUND_PHASE.PRE_AGREEMENT, roundKind: ROUND_KIND.QUESTION },
				"applicant",
			),
		).toThrow("not allowed");
		expect(() =>
			resolveNegotiationOperation(
				{ roundPhase: ROUND_PHASE.PRE_AGREEMENT, roundKind: ROUND_KIND.OFFER },
				"owner",
			),
		).toThrow("not allowed");
	});

	test("maps and gates handover damage and settlement rounds", () => {
		expect(
			resolveHandoverRoundOperation(
				{ roundPhase: ROUND_PHASE.RETURN, roundKind: ROUND_KIND.SETTLEMENT_OFFER },
				"owner",
			),
		).toBe("handover.owner_propose_settlement");
		expect(
			resolveHandoverRoundOperation(
				{ roundPhase: ROUND_PHASE.RETURN, roundKind: ROUND_KIND.ANSWER },
				"renter",
			),
		).toBe("handover.tenant_respond_damage");
		expect(() =>
			resolveHandoverRoundOperation(
				{ roundPhase: ROUND_PHASE.RETURN, roundKind: ROUND_KIND.SETTLEMENT_OFFER },
				"renter",
			),
		).toThrow("not allowed");
	});

	test("canonical operations are role-aware", () => {
		expect(() => assertOperationAllowed("handover.owner_claim_damage", "owner")).not.toThrow();
		expect(() => assertOperationAllowed("handover.owner_claim_damage", "renter")).toThrow(
			"not allowed",
		);
		expect(() => assertOperationAllowed("handover.close_settlement", "renter")).not.toThrow();
		expect(() => assertOperationAllowed("handover.close_settlement", "owner")).toThrow(
			"not allowed",
		);
	});

	test("handover lifecycle operations are state-aware", () => {
		expect(() =>
			assertOperationAllowed({
				operationId: "handover.start_move_in",
				relationship: "owner",
				asset: asset(ASSET_BUSINESS_STATE.BOOKED),
			}),
		).not.toThrow();
		expect(() =>
			assertOperationAllowed({
				operationId: "handover.start_move_in",
				relationship: "owner",
				asset: asset(ASSET_BUSINESS_STATE.LISTED),
			}),
		).toThrow("Move-in handover can only start after booking");
		expect(() =>
			assertOperationAllowed({
				operationId: "handover.start_move_out",
				relationship: "owner",
				asset: asset(ASSET_BUSINESS_STATE.RENTED),
			}),
		).toThrow("Move-out handover requires return pending state");
		expect(() =>
			assertOperationAllowed({
				operationId: "handover.start_move_out",
				relationship: "owner",
				asset: asset(ASSET_BUSINESS_STATE.RENTED),
				allowLegacyRentedMoveOut: true,
			}),
		).not.toThrow();
	});
});
