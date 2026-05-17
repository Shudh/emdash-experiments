import { describe, expect, test } from "vitest";

import {
	ACCESS_ROLE,
	ACCESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
} from "../../src/lib/domain/constants.js";
import { MemoryDomainStore } from "../../src/lib/domain/db.js";
import {
	resolveAgreementRelationship,
	resolveAssetRelationship,
	resolveHandoverRelationship,
	resolveInterestRelationship,
} from "../../src/lib/domain/relationship.js";

const owner = { id: "relationship_owner", email: "owner@example.com" };
const tenant = { id: "relationship_tenant", email: "tenant@example.com" };
const unrelated = { id: "relationship_other", email: "other@example.com" };

async function seedAsset(store: MemoryDomainStore) {
	return store.insert(COLLECTIONS.ASSETS, {
		status: CMS_STATUS.PUBLISHED,
		author_id: owner.id,
		asset_kind: "flat",
		title: "Relationship Flat",
		owner_user_id: owner.id,
		active_renter_user_id: null,
	});
}

describe("ALM relationship resolver", () => {
	test("resolves asset owner, applicant, renter, unrelated, and anonymous roles", async () => {
		const store = new MemoryDomainStore();
		const asset = await seedAsset(store);

		expect((await resolveAssetRelationship(store, owner, asset.id)).role).toBe("owner");
		expect((await resolveAssetRelationship(store, tenant, asset.id)).role).toBe("unrelated");
		expect((await resolveAssetRelationship(store, null, asset.id)).role).toBe("anonymous");

		await store.insert(COLLECTIONS.ASSET_INTERESTS, {
			status: CMS_STATUS.PUBLISHED,
			asset_id: asset.id,
			owner_user_id: owner.id,
			interested_user_id: tenant.id,
			interest_state: "submitted",
		});
		expect((await resolveAssetRelationship(store, tenant, asset.id)).role).toBe("applicant");

		await store.insert(COLLECTIONS.ASSET_ACCESS, {
			status: CMS_STATUS.PUBLISHED,
			asset_id: asset.id,
			user_id: tenant.id,
			access_role: ACCESS_ROLE.RENTER,
			access_state: ACCESS_STATE.ACTIVE,
		});
		expect((await resolveAssetRelationship(store, tenant, asset.id)).role).toBe("renter");
		expect((await resolveAssetRelationship(store, unrelated, asset.id)).role).toBe("unrelated");
	});

	test("resolves interest, agreement, and handover participants", async () => {
		const store = new MemoryDomainStore();
		const asset = await seedAsset(store);
		const interest = await store.insert(COLLECTIONS.ASSET_INTERESTS, {
			status: CMS_STATUS.PUBLISHED,
			asset_id: asset.id,
			owner_user_id: owner.id,
			interested_user_id: tenant.id,
			interest_state: "submitted",
		});
		const agreement = await store.insert(COLLECTIONS.AGREEMENT_VERSIONS, {
			status: CMS_STATUS.PUBLISHED,
			asset_id: asset.id,
			owner_user_id: owner.id,
			renter_user_id: tenant.id,
			agreement_state: "active",
		});
		const handover = await store.insert(COLLECTIONS.HANDOVER_SESSIONS, {
			status: CMS_STATUS.PUBLISHED,
			asset_id: asset.id,
			agreement_id: agreement.id,
			owner_user_id: owner.id,
			renter_user_id: tenant.id,
			handover_kind: "move_in",
			handover_state: "owner_submitted",
		});

		expect((await resolveInterestRelationship(store, owner, interest.id)).role).toBe("owner");
		expect((await resolveInterestRelationship(store, tenant, interest.id)).role).toBe("applicant");
		expect((await resolveInterestRelationship(store, unrelated, interest.id)).role).toBe(
			"unrelated",
		);
		expect((await resolveAgreementRelationship(store, owner, agreement.id)).role).toBe("owner");
		expect((await resolveAgreementRelationship(store, tenant, agreement.id)).role).toBe("renter");
		expect((await resolveHandoverRelationship(store, owner, handover.id)).role).toBe("owner");
		expect((await resolveHandoverRelationship(store, tenant, handover.id)).role).toBe("renter");
	});
});
