import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const EXPECTED_FIELDS = {
	wf_assets: [
		"title",
		"asset_kind",
		"owner_user_id",
		"business_state",
		"visibility_state",
		"public_price",
		"currency",
		"location_label",
		"minimum_months",
		"active_interest_id",
		"active_workflow_instance_id",
		"active_renter_user_id",
		"config_spec",
		"condition_spec",
		"config_version",
		"owner_conditions_spec",
		"conditions_version",
		"conditions_hash",
	],
	wf_asset_config_items: [
		"asset_id",
		"item_kind",
		"item_group",
		"item_label",
		"item_state",
		"owner_declared_state",
		"item_spec",
		"media_refs",
	],
	wf_asset_interests: [
		"asset_id",
		"asset_title",
		"asset_slug",
		"asset_kind",
		"asset_location_label",
		"asset_public_price",
		"owner_user_id",
		"interested_user_id",
		"workflow_instance_id",
		"interest_state",
		"name",
		"official_email",
		"phone",
		"employer_name",
		"offered_price",
		"requested_start_date",
		"requested_minimum_months",
		"message",
		"interest_spec",
		"accepted_conditions_version",
		"accepted_conditions_hash",
		"accepted_conditions_at",
		"accepted_conditions_snapshot",
	],
	wf_workflow_definitions: [
		"definition_id",
		"definition_version",
		"scope_kind",
		"definition_spec",
	],
	wf_workflow_instances: [
		"definition_id",
		"definition_version",
		"scope_kind",
		"asset_id",
		"interest_id",
		"owner_user_id",
		"applicant_user_id",
		"workflow_state",
		"instance_spec",
	],
	wf_workflow_cards: [
		"workflow_instance_id",
		"asset_id",
		"interest_id",
		"card_type",
		"card_state",
		"created_by_user_id",
		"created_by_role",
		"prompt",
		"answer_schema",
		"evidence_policy",
		"decision_policy",
		"card_spec",
		"decided_at",
		"decision",
	],
	wf_workflow_card_responses: [
		"workflow_instance_id",
		"card_id",
		"asset_id",
		"interest_id",
		"responded_by_user_id",
		"responded_by_role",
		"answer_value",
		"message",
	],
	wf_tenant_documents: [
		"owner_user_id",
		"document_kind",
		"document_label",
		"storage_key",
		"mime_type",
		"document_spec",
	],
	wf_evidence_attachments: [
		"tenant_document_id",
		"asset_id",
		"interest_id",
		"workflow_instance_id",
		"card_id",
		"response_id",
		"owner_user_id",
		"applicant_user_id",
		"document_kind",
		"storage_key",
		"mime_type",
		"attachment_label",
		"attachment_spec",
	],
	wf_asset_access: ["asset_id", "user_id", "access_role", "access_state", "granted_at", "revoked_at"],
	wf_asset_events: [
		"asset_id",
		"interest_id",
		"workflow_instance_id",
		"card_id",
		"event_kind",
		"actor_user_id",
		"actor_role",
		"from_workflow_state",
		"to_workflow_state",
		"from_asset_state",
		"to_asset_state",
		"event_spec",
	],
} as const;

const JSON_FIELDS = new Set([
	"config_spec",
	"condition_spec",
	"owner_conditions_spec",
	"item_spec",
	"media_refs",
	"interest_spec",
	"accepted_conditions_snapshot",
	"definition_spec",
	"instance_spec",
	"answer_schema",
	"evidence_policy",
	"decision_policy",
	"card_spec",
	"answer_value",
	"document_spec",
	"attachment_spec",
	"event_spec",
]);

type SeedCollection = {
	slug: string;
	fields: Array<{ slug: string; type: string }>;
};

describe("WF1 seed schema", () => {
	it("defines the approved WF1 collection slugs and fields", () => {
		const seedPath = fileURLToPath(new URL("../../seed/seed.json", import.meta.url));
		const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
			collections: SeedCollection[];
		};
		const collections = new Map(
			seed.collections
				.filter((collection) => collection.slug.startsWith("wf_"))
				.map((collection) => [collection.slug, collection]),
		);

		expect([...collections.keys()].toSorted()).toEqual(Object.keys(EXPECTED_FIELDS).toSorted());

		for (const [slug, expectedFields] of Object.entries(EXPECTED_FIELDS)) {
			const collection = collections.get(slug);
			expect(collection?.fields.map((field: { slug: string }) => field.slug)).toEqual(expectedFields);
			for (const field of collection?.fields ?? []) {
				if (JSON_FIELDS.has(field.slug)) expect(field.type).toBe("json");
			}
		}
	});
});
