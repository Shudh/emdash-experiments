import { afterEach, describe, expect, test } from "vitest";

import { answerWorkflowCard } from "../../src/lib/workflow-rental/commands/answer-workflow-card.js";
import { createWorkflowAsset } from "../../src/lib/workflow-rental/commands/create-asset.js";
import { createWorkflowCard } from "../../src/lib/workflow-rental/commands/create-workflow-card.js";
import { expressWorkflowInterest } from "../../src/lib/workflow-rental/commands/express-interest.js";
import { publishWorkflowAsset } from "../../src/lib/workflow-rental/commands/publish-asset.js";
import { runWorkflowAction } from "../../src/lib/workflow-rental/commands/run-workflow-action.js";
import { updateWorkflowAssetConfig } from "../../src/lib/workflow-rental/commands/update-asset-config.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../../src/lib/workflow-rental/store/collections.js";
import { createWorkflowTestStore } from "./test-db.js";

const owner = { id: "wf_owner", email: "owner@example.com", name: "Owner" };
const renter = { id: "wf_renter", email: "renter@example.com", name: "Renter" };
const dbs: Array<{ destroy: () => Promise<void> }> = [];

afterEach(async () => {
	await Promise.all(dbs.splice(0).map((db) => db.destroy()));
});

describe("workflow rental full flow", () => {
	test("reproduces current ALM negotiation states with workflow cards", async () => {
		const { store, db } = await createWorkflowTestStore();
		dbs.push(db);
		const created = await createWorkflowAsset(store, owner, {
			assetKind: "flat",
			title: "Workflow Habitat Mayflower",
			locationLabel: "Bangalore",
			publicPrice: 60_000,
			ownerConditionsSpec: { depositPolicy: "Two months deposit covers chargeable damage." },
		});
		await updateWorkflowAssetConfig(store, owner, created.asset.id, {
			configSpec: { bedrooms: 2 },
			conditionSpec: { walls: "freshly_painted" },
			items: [{ itemKind: "fixture", itemLabel: "Door", ownerDeclaredState: "good" }],
		});
		const published = await publishWorkflowAsset(store, owner, created.asset.id);
		const interestResult = await expressWorkflowInterest(store, renter, created.asset.id, {
			name: "Renter",
			acceptedConditionsVersion: Number(published.asset.conditions_version),
			acceptedConditionsHash: String(published.asset.conditions_hash),
		});
		expect(interestResult.instance.workflow_state).toBe("submitted");
		const ownerQuestion = await createWorkflowCard(store, owner, {
			workflowInstanceId: interestResult.instance.id,
			cardType: "owner_question",
			prompt: "Please upload company ID and salary slip.",
		});
		expect(ownerQuestion.instance?.workflow_state).toBe("screening");
		const card = ownerQuestion.cards[0];
		const answered = await answerWorkflowCard(store, renter, card.id, {
			answer: { text: "Company ID and salary slip shared." },
			message: "Company ID and salary slip shared.",
		});
		expect(answered.responses).toHaveLength(1);
		await createWorkflowCard(store, renter, {
			workflowInstanceId: interestResult.instance.id,
			cardType: "applicant_offer",
			prompt: "Offer at 59000 with two months deposit.",
			cardSpec: { price: 59_000, depositAmount: 118_000 },
		});
		const countered = await createWorkflowCard(store, owner, {
			workflowInstanceId: interestResult.instance.id,
			cardType: "owner_counter",
			prompt: "Counter at listed rent with deep cleaning included.",
			cardSpec: { price: 60_000, depositAmount: 120_000 },
		});
		expect(countered.instance?.workflow_state).toBe("countered");
		const booked = await runWorkflowAction(store, owner, {
			workflowInstanceId: interestResult.instance.id,
			actionId: "accept_final_terms",
		});
		expect(booked.asset.business_state).toBe("booked");
		expect(booked.asset.visibility_state).toBe("restricted");
		expect(
			await store.list(WORKFLOW_RENTAL_COLLECTIONS.ASSET_ACCESS, { asset_id: created.asset.id }),
		).toHaveLength(2);
	});
	test("express interest creates an application submission card and owner can accept immediately", async () => {
	const { store, db } = await createWorkflowTestStore();
	dbs.push(db);

	const created = await createWorkflowAsset(store, owner, {
		assetKind: "flat",
		title: "Workflow Application Card Flat",
		locationLabel: "Bangalore",
		publicPrice: 60_000,
		ownerConditionsSpec: { depositPolicy: "Two months deposit covers chargeable damage." },
	});

	await updateWorkflowAssetConfig(store, owner, created.asset.id, {
		configSpec: { bedrooms: 2 },
		ownerConditionsSpec: { depositPolicy: "Two months deposit covers chargeable damage." },
	});

	const published = await publishWorkflowAsset(store, owner, created.asset.id);

	const interestResult = await expressWorkflowInterest(store, renter, published.asset.id, {
		name: "Rakesh Datta",
		officialEmail: "rakesh@tcs.com",
		employerName: "TCS",
		offeredPrice: 60_000,
		message: "Please take me.",
		acceptedConditionsVersion: published.asset.conditions_version as number,
		acceptedConditionsHash: published.asset.conditions_hash as string,
	});

	const cards = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS,
		{ workflow_instance_id: interestResult.instance.id },
		{ orderBy: "created_at", direction: "desc", limit: 20 },
	);

	expect(cards).toHaveLength(1);
	expect(cards[0].card_type).toBe("application_submission");
	expect(cards[0].created_by_role).toBe("applicant");
	expect(cards[0].prompt).toContain("Please take me");

	const accepted = await runWorkflowAction(store, owner, {
		workflowInstanceId: interestResult.instance.id,
		actionId: "accept_applicant",
	});

	expect(accepted.asset.business_state).toBe("booked");
	expect(accepted.asset.visibility_state).toBe("restricted");
	expect(accepted.instance.workflow_state).toBe("booked");
	expect(accepted.cards.some((card) => card.card_type === "application_submission")).toBe(true);
});
});
