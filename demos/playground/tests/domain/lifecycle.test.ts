import { describe, expect, test } from "vitest";

import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	HANDOVER_KIND,
	HANDOVER_STATE,
	VISIBILITY_STATE,
} from "../../src/lib/domain/constants.js";
import {
	assetAvailableActions,
	handoverAvailableActions,
	negotiationAvailableActions,
} from "../../src/lib/domain/lifecycle.js";
import type { DomainRow } from "../../src/lib/domain/types.js";

function row(patch: Record<string, unknown>): DomainRow {
	return {
		id: "row_1",
		slug: "row-1",
		status: CMS_STATUS.PUBLISHED,
		author_id: null,
		created_at: "2026-01-01T00:00:00.000Z",
		updated_at: "2026-01-01T00:00:00.000Z",
		published_at: null,
		scheduled_at: null,
		deleted_at: null,
		version: 1,
		live_revision_id: null,
		draft_revision_id: null,
		...patch,
	};
}

describe("ALM lifecycle action projection", () => {
	test("owner asset actions follow lifecycle state", () => {
		expect(
			assetAvailableActions(
				row({
					business_state: ASSET_BUSINESS_STATE.BOOKED,
					visibility_state: VISIBILITY_STATE.RESTRICTED,
				}),
				"owner",
			).map((action) => action.id),
		).toContain("handover.start_move_in");
		expect(
			assetAvailableActions(
				row({
					business_state: ASSET_BUSINESS_STATE.RENTED,
					visibility_state: VISIBILITY_STATE.RESTRICTED,
				}),
				"owner",
			).map((action) => action.id),
		).toContain("handover.start_move_out");
		expect(
			assetAvailableActions(
				row({
					business_state: ASSET_BUSINESS_STATE.RENTED,
					visibility_state: VISIBILITY_STATE.RESTRICTED,
				}),
				"renter",
			),
		).toEqual([]);
	});

	test("negotiation actions are relationship-aware", () => {
		expect(negotiationAvailableActions("owner").map((action) => action.id)).toContain(
			"interest.owner_request",
		);
		expect(negotiationAvailableActions("applicant").map((action) => action.id)).toContain(
			"interest.tenant_answer",
		);
		expect(negotiationAvailableActions("unrelated")).toEqual([]);
	});

	test("handover actions are relationship-aware", () => {
		expect(
			handoverAvailableActions(
				row({
					handover_kind: HANDOVER_KIND.MOVE_IN,
					handover_state: HANDOVER_STATE.OWNER_SUBMITTED,
				}),
				"renter",
			).map((action) => action.id),
		).toContain("handover.tenant_accept_move_in");
		expect(
			handoverAvailableActions(
				row({
					handover_kind: HANDOVER_KIND.MOVE_OUT,
					handover_state: HANDOVER_STATE.DISPUTED,
				}),
				"owner",
			).map((action) => action.id),
		).toContain("handover.owner_claim_damage");
	});
});
