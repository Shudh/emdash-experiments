import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";

import seed from "../../seed/seed.json" with { type: "json" };
import { parseAddAssetRequest } from "../../src/lib/domain/api-contracts.js";
import { acceptFinalTerms } from "../../src/lib/domain/commands/accept-final-terms.js";
import { acceptHandover } from "../../src/lib/domain/commands/accept-handover.js";
import { addAsset } from "../../src/lib/domain/commands/add-asset.js";
import { addNegotiationRound } from "../../src/lib/domain/commands/add-negotiation-round.js";
import { claimHandoverDamage } from "../../src/lib/domain/commands/claim-handover-damage.js";
import { expressInterest } from "../../src/lib/domain/commands/express-interest.js";
import { publishAssetToMarketplace } from "../../src/lib/domain/commands/publish-asset-to-marketplace.js";
import { relistAsset } from "../../src/lib/domain/commands/relist-asset.js";
import { returnAssetToDraft } from "../../src/lib/domain/commands/return-asset-to-draft.js";
import { settleHandover } from "../../src/lib/domain/commands/settle-handover.js";
import { signAgreement } from "../../src/lib/domain/commands/sign-agreement.js";
import { startHandover } from "../../src/lib/domain/commands/start-handover.js";
import { updateAssetConfig } from "../../src/lib/domain/commands/update-asset-config.js";
import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
	EVENT_KIND,
	HANDOVER_KIND,
	ROUND_KIND,
	ROUND_PHASE,
	ROUND_STATE,
	VISIBILITY_STATE,
} from "../../src/lib/domain/constants.js";
import { MemoryDomainStore } from "../../src/lib/domain/db.js";
import { KyselyDomainStore } from "../../src/lib/domain/kysely-store.js";
import { getAgreementPrintQuery } from "../../src/lib/domain/queries/agreement-print.js";
import { listMarketplaceAssetsQuery } from "../../src/lib/domain/queries/marketplace.js";
import type { DomainStore } from "../../src/lib/domain/types.js";

const owner = { id: "user_owner", email: "owner@example.com", name: "Owner" };
const renter = { id: "user_renter", email: "renter@company.com", name: "Renter" };
const dbs: Kysely<Record<string, unknown>>[] = [];

async function createRentalTables(db: Kysely<Record<string, unknown>>): Promise<void> {
	const standardColumns = [
		["id", "text primary key"],
		["slug", "text not null"],
		["status", "text not null"],
		["author_id", "text"],
		["created_at", "text not null"],
		["updated_at", "text not null"],
		["published_at", "text"],
		["scheduled_at", "text"],
		["deleted_at", "text"],
		["version", "integer not null"],
		["live_revision_id", "text"],
		["draft_revision_id", "text"],
	];
	const rentalCollections = new Set<string>(Object.values(COLLECTIONS));
	for (const collection of seed.collections.filter((candidate) =>
		rentalCollections.has(candidate.slug),
	)) {
		const fieldColumns = collection.fields.map((field) => [
			field.slug,
			field.type === "number" ? "real" : "text",
		]);
		const columns = [...standardColumns, ...fieldColumns]
			.filter(([name], index, all) => all.findIndex(([candidate]) => candidate === name) === index)
			.map(([name, type]) => sql`${sql.ref(name)} ${sql.raw(type)}`);
		await sql`CREATE TABLE ${sql.ref(`ec_${collection.slug}`)} (${sql.join(columns, sql`, `)})`.execute(
			db,
		);
		await sql`CREATE INDEX ${sql.ref(`idx_ec_${collection.slug}_status`)} ON ${sql.ref(`ec_${collection.slug}`)} (status)`.execute(
			db,
		);
	}
}

async function createKyselyStore(): Promise<DomainStore> {
	const db = new Kysely<Record<string, unknown>>({
		dialect: new SqliteDialect({ database: new Database(":memory:") }),
	});
	dbs.push(db);
	await createRentalTables(db);
	return new KyselyDomainStore(db);
}

async function runLifecycle(store: DomainStore) {
	const added = await addAsset(store, owner, {
		assetKind: "flat",
		title: "Confident Aquila 3BHK",
		locationLabel: "Sarjapur Road",
		publicPrice: 55_000,
		currency: "INR",
	});
	expect(added.asset.status).toBe(CMS_STATUS.DRAFT);
	expect(added.asset.business_state).toBe(ASSET_BUSINESS_STATE.DRAFT_ASSET);
	expect(added.asset.visibility_state).toBe(VISIBILITY_STATE.PRIVATE);

	const configured = await updateAssetConfig(store, owner, added.asset.id, {
		publicPrice: 55_000,
		currency: "INR",
		minimumMonths: 11,
		featuredImage: "media_flat_main",
		configSpec: { bedrooms: 3, bathrooms: 2, furnishing: "fully_furnished" },
		conditionSpec: { walls: "good", flooring: "good" },
		ownerConditionsSpec: {
			deposit_policy: "Deposit covers damage beyond normal wear.",
			documents_required: ["company_id", "salary_slip"],
		},
		items: [
			{
				itemKind: "furniture",
				itemGroup: "living_room",
				itemLabel: "Rajasthani wooden cabinet",
				ownerDeclaredState: "good",
				itemSpec: { material: "wood" },
			},
			{
				itemKind: "appliance",
				itemGroup: "bathroom",
				itemLabel: "Bathroom mirror",
				ownerDeclaredState: "good",
				itemSpec: { kind: "mirror" },
			},
		],
	});
	expect(configured.asset.config_spec).toEqual({
		bedrooms: 3,
		bathrooms: 2,
		furnishing: "fully_furnished",
	});
	expect(configured.asset.condition_spec).toEqual({ walls: "good", flooring: "good" });
	expect(configured.insertedItems).toHaveLength(2);

	const published = await publishAssetToMarketplace(store, owner, added.asset.id);
	expect(published.asset.status).toBe(CMS_STATUS.PUBLISHED);
	expect(published.asset.business_state).toBe(ASSET_BUSINESS_STATE.LISTED);
	expect(published.asset.visibility_state).toBe(VISIBILITY_STATE.MARKETPLACE);
	expect(await listMarketplaceAssetsQuery(store)).toHaveLength(1);

	const interest = await expressInterest(store, renter, added.asset.id, {
		name: "Renter",
		officialEmail: "renter@company.com",
		employerName: "ACME Corp",
		offeredPrice: 52_000,
		requestedMinimumMonths: 11,
		message: "Interested if owner can include deep cleaning before move-in.",
		acceptedConditionsVersion: Number(published.asset.conditions_version),
		acceptedConditionsHash: String(published.asset.conditions_hash),
	});
	expect(interest.interest.interest_state).toBe("submitted");
	expect(interest.interest.interested_user_id).toBe(renter.id);
	expect(await listMarketplaceAssetsQuery(store)).toHaveLength(1);

	await addNegotiationRound(store, owner, interest.interest.id, {
		roundPhase: ROUND_PHASE.PRE_AGREEMENT,
		roundKind: ROUND_KIND.QUESTION,
		message: "Please confirm official ID and intended move-in date.",
	});
	await addNegotiationRound(store, renter, interest.interest.id, {
		roundPhase: ROUND_PHASE.PRE_AGREEMENT,
		roundKind: ROUND_KIND.ANSWER,
		roundState: ROUND_STATE.ANSWERED,
		message: "Official ID shared. Move-in from 2026-06-01.",
	});
	const acceptedRound = await addNegotiationRound(store, owner, interest.interest.id, {
		roundPhase: ROUND_PHASE.PRE_AGREEMENT,
		roundKind: ROUND_KIND.ACCEPTANCE,
		roundState: ROUND_STATE.ACCEPTED,
		price: 54_000,
		currency: "INR",
		minimumMonths: 11,
		depositAmount: 130_000,
		startDate: "2026-06-01",
		message: "Accepted at 54k rent, 1.3L deposit, 11 months minimum.",
		termsSpec: { cleaningBeforeMoveIn: true, damageBeyondWearChargeable: true },
	});
	const rounds = await store.list(
		COLLECTIONS.NEGOTIATION_ROUNDS,
		{ interest_id: interest.interest.id },
		{ orderBy: "created_at", direction: "asc" },
	);
	expect(rounds.map((round) => round.round_kind)).toEqual([
		ROUND_KIND.QUESTION,
		ROUND_KIND.ANSWER,
		ROUND_KIND.ACCEPTANCE,
	]);
	expect(rounds.every((round) => round.round_phase === ROUND_PHASE.PRE_AGREEMENT)).toBe(true);
	expect(rounds.map((round) => round.actor_role)).toEqual(["owner", "renter", "owner"]);

	const agreementResult = await acceptFinalTerms(store, owner, interest.interest.id, {
		acceptedRoundId: acceptedRound.round.id,
		agreementKind: "flat_rental",
		effectiveFrom: "2026-06-01",
		contractText:
			"Formal rental agreement generated from accepted asset spec and negotiated terms.",
		extraTerms: {
			notice_period_days: 60,
			damage_liability: "Renter pays for damage beyond normal wear and tear.",
		},
	});
	expect(agreementResult.asset.business_state).toBe(ASSET_BUSINESS_STATE.BOOKED);
	expect(agreementResult.asset.visibility_state).toBe(VISIBILITY_STATE.RESTRICTED);
	expect(agreementResult.terms.length).toBeGreaterThanOrEqual(4);
	expect(await store.list(COLLECTIONS.ASSET_ACCESS, { asset_id: added.asset.id })).toHaveLength(2);
	expect(await listMarketplaceAssetsQuery(store)).toHaveLength(0);

	const agreementPrintBeforeEdit = await getAgreementPrintQuery(
		store,
		agreementResult.agreement.id,
	);
	expect(agreementPrintBeforeEdit).toBeTruthy();
	expect(agreementPrintBeforeEdit?.agreement.printable_snapshot).toMatchObject({
		owner_conditions: { version: 2, hash: published.asset.conditions_hash },
		renter_accepted_conditions: { version: 2, hash: published.asset.conditions_hash },
	});
	const snapshotBeforeEdit = JSON.stringify(agreementPrintBeforeEdit?.agreement.printable_snapshot);

	await signAgreement(store, owner, agreementResult.agreement.id, {
		signatureSpec: { method: "passkey", signedBy: owner.id },
	});
	const signed = await signAgreement(store, renter, agreementResult.agreement.id, {
		signatureSpec: { method: "passkey", signedBy: renter.id },
	});
	expect(signed.agreement.agreement_state).toBe("signed");

	const moveIn = await startHandover(store, owner, added.asset.id, {
		handoverKind: HANDOVER_KIND.MOVE_IN,
		summarySpec: { keys: 2, electricityMeter: "E-123" },
	});
	expect(moveIn.checks).toHaveLength(2);
	const acceptedMoveIn = await acceptHandover(store, renter, moveIn.handover.id);
	expect(acceptedMoveIn.asset.business_state).toBe(ASSET_BUSINESS_STATE.RENTED);

	const moveOut = await startHandover(store, owner, added.asset.id, {
		handoverKind: HANDOVER_KIND.MOVE_OUT,
		baselineHandoverId: moveIn.handover.id,
		summarySpec: { reason: "move_out" },
	});
	const mirrorCheck = moveOut.checks.find((check) =>
		String(check.item_label).includes("Bathroom mirror"),
	);
	expect(mirrorCheck).toBeTruthy();
	const damage = await claimHandoverDamage(store, owner, moveOut.handover.id, {
		handoverItemCheckId: String(mirrorCheck?.id),
		ownerClaimedState: "water_damage_swelling",
		observedState: "damaged",
		estimatedRepairCost: 3000,
		message: "Bathroom mirror frame has moisture swelling beyond accepted baseline.",
	});
	expect(damage.check.dispute_state).toBe("disputed");
	const returnRounds = await store.list(COLLECTIONS.NEGOTIATION_ROUNDS, {
		handover_id: moveOut.handover.id,
		round_phase: ROUND_PHASE.RETURN,
	});
	expect(returnRounds).toHaveLength(1);

	const settled = await settleHandover(store, renter, moveOut.handover.id, {
		settlementSpec: { agreedRepairCost: 2500, renterAccepted: true },
	});
	expect(settled.asset.business_state).toBe(ASSET_BUSINESS_STATE.MAINTENANCE);
	expect(settled.asset.visibility_state).toBe(VISIBILITY_STATE.PRIVATE);

	const draftAgain = await returnAssetToDraft(store, owner, added.asset.id);
	expect(draftAgain.asset.status).toBe(CMS_STATUS.DRAFT);
	expect(draftAgain.asset.business_state).toBe(ASSET_BUSINESS_STATE.DRAFT_ASSET);

	await updateAssetConfig(store, owner, added.asset.id, {
		items: [],
		publicPrice: 57_000,
		configSpec: {
			bedrooms: 3,
			bathrooms: 2,
			furnishing: "fully_furnished",
			repairedAfterMoveOut: true,
		},
		conditionSpec: { walls: "repainted", flooring: "good", mirror: "replaced" },
		ownerConditionsSpec: {
			deposit_policy: "Updated for future renters only.",
			documents_required: ["company_id", "salary_slip", "reference_letter"],
		},
	});
	const agreementPrintAfterEdit = await getAgreementPrintQuery(store, agreementResult.agreement.id);
	expect(JSON.stringify(agreementPrintAfterEdit?.agreement.printable_snapshot)).toBe(
		snapshotBeforeEdit,
	);

	const relisted = await relistAsset(store, owner, added.asset.id);
	expect(relisted.asset.status).toBe(CMS_STATUS.PUBLISHED);
	expect(relisted.asset.business_state).toBe(ASSET_BUSINESS_STATE.LISTED);
	expect(relisted.asset.visibility_state).toBe(VISIBILITY_STATE.MARKETPLACE);
	expect(await listMarketplaceAssetsQuery(store)).toHaveLength(1);

	const events = await store.list(COLLECTIONS.ASSET_EVENTS, {}, { limit: 100 });
	expect(events.map((event) => event.event_kind)).toEqual(
		expect.arrayContaining([
			EVENT_KIND.ASSET_ADDED,
			EVENT_KIND.ASSET_CONFIG_UPDATED,
			EVENT_KIND.ASSET_PUBLISHED,
			EVENT_KIND.INTEREST_SUBMITTED,
			EVENT_KIND.NEGOTIATION_ROUND_ADDED,
			EVENT_KIND.AGREEMENT_FROZEN,
			EVENT_KIND.HANDOVER_STARTED,
			EVENT_KIND.HANDOVER_ACCEPTED,
			EVENT_KIND.DAMAGE_CLAIMED,
			EVENT_KIND.HANDOVER_SETTLED,
			EVENT_KIND.ASSET_RETURNED_TO_DRAFT,
			EVENT_KIND.ASSET_RELISTED,
		]),
	);
	return {
		assetId: added.asset.id,
		agreementId: agreementResult.agreement.id,
		eventCount: events.length,
	};
}

afterEach(async () => {
	await Promise.all(dbs.splice(0).map((db) => db.destroy()));
});

describe("rental backend lifecycle", () => {
	it("validates API payloads at runtime", () => {
		expect(() => parseAddAssetRequest({ title: "Missing kind" })).toThrow(/assetKind/);
	});

	it("passes the full lifecycle with the in-memory store", async () => {
		const result = await runLifecycle(
			new MemoryDomainStore({ fixedNow: "2026-05-14T12:00:00.000Z" }),
		);
		expect(result.eventCount).toBeGreaterThanOrEqual(12);
	});

	it("passes the full lifecycle against real Kysely SQLite tables", async () => {
		const result = await runLifecycle(await createKyselyStore());
		expect(result.assetId).toBeTruthy();
	});
});
