import type { ContentBylineCredit, MediaValue, PortableTextBlock } from "emdash";

type BaseEntry = {
	id: string;
	slug: string | null;
	status: string;
	createdAt: Date;
	updatedAt: Date;
	publishedAt: Date | null;
	bylines?: ContentBylineCredit[];
};

export interface BlogPost extends BaseEntry {
	title: string;
	featured_image?: MediaValue;
	content?: PortableTextBlock[];
	excerpt?: string;
}

export interface SitePage extends BaseEntry {
	title: string;
	content?: PortableTextBlock[];
}

type WfEntry = BaseEntry & Record<string, unknown>;

declare module "emdash" {
	interface EmDashCollections {
		posts: BlogPost;
		pages: SitePage;
		wf_assets: WfEntry;
		wf_asset_config_items: WfEntry;
		wf_asset_interests: WfEntry;
		wf_workflow_definitions: WfEntry;
		wf_workflow_instances: WfEntry;
		wf_workflow_cards: WfEntry;
		wf_workflow_card_responses: WfEntry;
		wf_tenant_documents: WfEntry;
		wf_evidence_attachments: WfEntry;
		wf_asset_access: WfEntry;
		wf_asset_events: WfEntry;
	}
}
