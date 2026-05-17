import { describe, expect, test } from "vitest";

import { ROUND_KIND, ROUND_PHASE } from "../../src/lib/domain/constants.js";
import {
	assertOperationAllowed,
	resolveHandoverRoundOperation,
	resolveNegotiationOperation,
} from "../../src/lib/domain/operations.js";

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
});
