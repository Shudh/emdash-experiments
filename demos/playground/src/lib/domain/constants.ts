export const COLLECTIONS = {
	ASSETS: "assets",
	ASSET_CONFIG_ITEMS: "asset_config_items",
	ASSET_INTERESTS: "asset_interests",
	NEGOTIATION_ROUNDS: "negotiation_rounds",
	AGREEMENT_VERSIONS: "agreement_versions",
	AGREEMENT_TERMS: "agreement_terms",
	HANDOVER_SESSIONS: "handover_sessions",
	HANDOVER_ITEM_CHECKS: "handover_item_checks",
	ASSET_ACCESS: "asset_access",
	ASSET_EVENTS: "asset_events",
} as const;

export const CMS_STATUS = {
	DRAFT: "draft",
	PUBLISHED: "published",
	SCHEDULED: "scheduled",
	DELETED: "deleted",
} as const;

export const ASSET_BUSINESS_STATE = {
	DRAFT_ASSET: "draft_asset",
	LISTED: "listed",
	INTEREST_RECEIVED: "interest_received",
	NEGOTIATING: "negotiating",
	BOOKED: "booked",
	RENTED: "rented",
	RETURN_PENDING: "return_pending",
	MAINTENANCE: "maintenance",
	ARCHIVED: "archived",
} as const;

export const VISIBILITY_STATE = {
	PRIVATE: "private",
	MARKETPLACE: "marketplace",
	RESTRICTED: "restricted",
	ARCHIVED: "archived",
} as const;

export const INTEREST_STATE = {
	SUBMITTED: "submitted",
	OWNER_REVIEWING: "owner_reviewing",
	NEGOTIATING: "negotiating",
	ACCEPTED: "accepted",
	REJECTED: "rejected",
	WITHDRAWN: "withdrawn",
} as const;

export const ROUND_PHASE = {
	PRE_AGREEMENT: "pre_agreement",
	HANDOVER: "handover",
	RETURN: "return",
	SETTLEMENT: "settlement",
} as const;

export const ROUND_KIND = {
	QUESTION: "question",
	ANSWER: "answer",
	OFFER: "offer",
	COUNTER: "counter",
	ACCEPTANCE: "acceptance",
	REJECTION: "rejection",
	DAMAGE_CLAIM: "damage_claim",
	SETTLEMENT_OFFER: "settlement_offer",
} as const;

export const ROUND_STATE = {
	PROPOSED: "proposed",
	ANSWERED: "answered",
	COUNTERED: "countered",
	ACCEPTED: "accepted",
	REJECTED: "rejected",
	WITHDRAWN: "withdrawn",
} as const;

export const AGREEMENT_STATE = {
	DRAFT: "draft",
	PROPOSED: "proposed",
	OWNER_ACCEPTED: "owner_accepted",
	RENTER_ACCEPTED: "renter_accepted",
	FULLY_ACCEPTED: "fully_accepted",
	SIGNED: "signed",
	ACTIVE: "active",
	TERMINATED: "terminated",
} as const;

export const HANDOVER_KIND = {
	MOVE_IN: "move_in",
	MOVE_OUT: "move_out",
	CAR_PICKUP: "car_pickup",
	CAR_RETURN: "car_return",
} as const;

export const HANDOVER_STATE = {
	DRAFT: "draft",
	OWNER_SUBMITTED: "owner_submitted",
	RENTER_REVIEWING: "renter_reviewing",
	DISPUTED: "disputed",
	ACCEPTED: "accepted",
	CLOSED: "closed",
} as const;

export const DISPUTE_STATE = {
	NONE: "none",
	DISPUTED: "disputed",
	ACCEPTED: "accepted",
	REJECTED: "rejected",
	SETTLEMENT_AGREED: "settlement_agreed",
} as const;

export const ACCESS_ROLE = {
	OWNER: "owner",
	RENTER: "renter",
} as const;

export const ACCESS_STATE = {
	ACTIVE: "active",
	REVOKED: "revoked",
} as const;

export const EVENT_KIND = {
	ASSET_ADDED: "asset_added",
	ASSET_CONFIG_UPDATED: "asset_config_updated",
	ASSET_PUBLISHED: "asset_published",
	INTEREST_SUBMITTED: "interest_submitted",
	NEGOTIATION_ROUND_ADDED: "negotiation_round_added",
	AGREEMENT_FROZEN: "agreement_frozen",
	AGREEMENT_SIGNED: "agreement_signed",
	HANDOVER_STARTED: "handover_started",
	HANDOVER_ACCEPTED: "handover_accepted",
	DAMAGE_CLAIMED: "damage_claimed",
	HANDOVER_SETTLED: "handover_settled",
	ASSET_RETURNED_TO_DRAFT: "asset_returned_to_draft",
	ASSET_RELISTED: "asset_relisted",
} as const;
