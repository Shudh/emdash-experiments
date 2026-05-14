import { describe, expect, it } from "vitest";

import {
	addAsset,
	publishAssetToMarketplace,
	relistAsset,
	returnAssetToDraft,
	updateAssetConfig,
} from "../../src/lib/domain/commands/assets.js";
import {
	acceptHandover,
	claimDamage,
	settleHandover,
	startHandover,
} from "../../src/lib/domain/commands/handover.js";
import { expressInterest } from "../../src/lib/domain/commands/interests.js";
import {
	acceptFinalTerms,
	addNegotiationRound,
} from "../../src/lib/domain/commands/negotiations.js";
import { listMarketplaceAssets } from "../../src/lib/domain/queries/marketplace.js";
import { InMemoryRentalDomainStore } from "../../src/lib/domain/repositories/in-memory-store.js";

const configSpec = { bedrooms: 2, furnished: true };
const conditionSpec = { inspection: "initial", notes: "clean" };

describe("rental lifecycle domain flow", () => {
	it("keeps rental workflow state in domain fields and freezes agreement snapshots", async () => {
		const store = new InMemoryRentalDomainStore();

		const asset = await addAsset(store, { title: "Downtown Loft", ownerId: "owner_1" });
		expect(asset).toMatchObject({
			status: "draft",
			business_state: "draft_asset",
			visibility_state: "private",
		});

		const configured = await updateAssetConfig(store, {
			assetId: asset.id,
			configSpec,
			conditionSpec,
			items: [
				{ itemKey: "front_door", label: "Front Door", expectedCondition: "No dents", sortOrder: 1 },
				{ itemKey: "flooring", label: "Flooring", expectedCondition: "No scratches", sortOrder: 2 },
			],
		});
		expect(configured.asset.config_spec).toEqual(configSpec);
		expect(configured.asset.condition_spec).toEqual(conditionSpec);
		expect(configured.items).toHaveLength(2);

		const listed = await publishAssetToMarketplace(store, asset.id);
		expect(listed).toMatchObject({
			status: "published",
			business_state: "listed",
			visibility_state: "marketplace",
		});
		expect((await listMarketplaceAssets(store)).items.map((item) => item.id)).toContain(asset.id);

		const interest = await expressInterest(store, {
			assetId: asset.id,
			renterId: "renter_1",
			message: "I am interested",
		});
		expect(interest).toMatchObject({ asset_id: asset.id, interest_state: "open" });
		expect((await store.getAsset(asset.id))?.visibility_state).toBe("marketplace");

		const offer = await addNegotiationRound(store, {
			interestId: interest.id,
			actorId: "renter_1",
			roundKind: "offer",
			terms: { monthlyRent: 2100 },
		});
		const counter = await addNegotiationRound(store, {
			interestId: interest.id,
			actorId: "owner_1",
			roundKind: "counter",
			terms: { monthlyRent: 2200 },
		});
		expect([offer, counter]).toEqual([
			expect.objectContaining({ round_phase: "pre_agreement", round_kind: "offer" }),
			expect.objectContaining({ round_phase: "pre_agreement", round_kind: "counter" }),
		]);

		const accepted = await acceptFinalTerms(store, {
			interestId: interest.id,
			actorId: "renter_1",
			finalTerms: { monthlyRent: 2200, deposit: 2200 },
		});
		expect(accepted.agreement).toMatchObject({ asset_id: asset.id, agreement_state: "frozen" });
		expect(accepted.terms).toHaveLength(2);
		expect(accepted.asset).toMatchObject({
			business_state: "booked",
			visibility_state: "restricted",
		});
		expect((await listMarketplaceAssets(store)).items).toHaveLength(0);

		const frozenSnapshot = accepted.agreement.printable_snapshot;
		await updateAssetConfig(store, {
			assetId: asset.id,
			configSpec: { bedrooms: 3, furnished: false },
			conditionSpec,
			items: [
				{
					itemKey: "front_door",
					label: "Front Door",
					expectedCondition: "Repainted",
					sortOrder: 1,
				},
			],
		}).catch(() => undefined);
		expect((await store.getAgreement(accepted.agreement.id))?.printable_snapshot).toEqual(
			frozenSnapshot,
		);

		const handoverStarted = await startHandover(store, {
			assetId: asset.id,
			agreementId: accepted.agreement.id,
		});
		expect(handoverStarted.handover).toMatchObject({
			asset_id: asset.id,
			handover_state: "started",
		});
		expect(handoverStarted.checks).toHaveLength(2);

		const rented = await acceptHandover(store, { handoverId: handoverStarted.handover.id });
		expect(rented.business_state).toBe("rented");

		const damage = await claimDamage(store, {
			handoverId: handoverStarted.handover.id,
			actorId: "owner_1",
			itemCheckId: handoverStarted.checks[0]!.id,
			returnCondition: "Dented",
			disputeNotes: "Door dent found on return",
		});
		expect(damage.round).toMatchObject({
			round_phase: "return",
			handover_id: handoverStarted.handover.id,
		});
		expect(damage.check).toMatchObject({
			dispute_state: "open",
			dispute_notes: "Door dent found on return",
		});

		const settled = await settleHandover(store, { handoverId: handoverStarted.handover.id });
		expect(settled.asset).toMatchObject({
			business_state: "maintenance",
			visibility_state: "private",
		});

		const draft = await returnAssetToDraft(store, asset.id);
		expect(draft).toMatchObject({
			status: "draft",
			business_state: "draft_asset",
			visibility_state: "private",
		});
		await updateAssetConfig(store, {
			assetId: asset.id,
			configSpec,
			conditionSpec,
			items: [
				{ itemKey: "front_door", label: "Front Door", expectedCondition: "Repaired", sortOrder: 1 },
			],
		});
		const relisted = await relistAsset(store, asset.id);
		expect(relisted).toMatchObject({
			status: "published",
			business_state: "listed",
			visibility_state: "marketplace",
		});
	});
});
