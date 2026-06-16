export const WORKFLOW_RENTAL_COLLECTIONS = {
	ASSETS: "wf_assets",
	ASSET_CONFIG_ITEMS: "wf_asset_config_items",
	INTERESTS: "wf_asset_interests",
	WORKFLOW_DEFINITIONS: "wf_workflow_definitions",
	WORKFLOW_INSTANCES: "wf_workflow_instances",
	WORKFLOW_CARDS: "wf_workflow_cards",
	WORKFLOW_CARD_RESPONSES: "wf_workflow_card_responses",
	TENANT_DOCUMENTS: "wf_tenant_documents",
	EVIDENCE_ATTACHMENTS: "wf_evidence_attachments",
	ASSET_ACCESS: "wf_asset_access",
	ASSET_EVENTS: "wf_asset_events",
	MEDIA_UPLOADS: "wf_media_uploads",
} as const;

export const WF_STATUS = {
	DRAFT: "draft",
	PUBLISHED: "published",
} as const;

export const WF_ASSET_STATE = {
	DRAFT_ASSET: "draft_asset",
	LISTED: "listed",
	INTEREST_RECEIVED: "interest_received",
	NEGOTIATING: "negotiating",
	BOOKED: "booked",
	RENTED: "rented",
	RETURN_PENDING: "return_pending",
} as const;

export const WF_VISIBILITY = {
	PRIVATE: "private",
	MARKETPLACE: "marketplace",
	RESTRICTED: "restricted",
} as const;

export const WF_CARD_STATE = {
	OPEN: "open",
	ANSWERED: "answered",
	ACCEPTED: "accepted",
	REJECTED: "rejected",
	WAIVED: "waived",
} as const;
