import { MemoryDomainStore } from "../../src/lib/domain/db.js";
import type { DomainStore, UserContext } from "../../src/lib/domain/types.js";
import { createWorkflowAsset } from "../../src/lib/wf1/commands/create-asset.js";
import { expressWorkflowInterest } from "../../src/lib/wf1/commands/express-interest.js";
import { publishWorkflowAsset } from "../../src/lib/wf1/commands/publish-asset.js";
import { updateWorkflowAssetConfig } from "../../src/lib/wf1/commands/update-asset-config.js";

export const eva: UserContext = {
	id: "eva_owner",
	email: "owner_manual_created_1@example.com",
	name: "Eva",
};

export const rakesh: UserContext = {
	id: "rakesh_applicant",
	email: "tenant_manual_created_1@example.com",
	name: "Rakesh",
};

export const kavya: UserContext = {
	id: "kavya_other",
	email: "kavya@example.com",
	name: "Kavya",
};

export function createWf1Store(): DomainStore {
	return new MemoryDomainStore({ fixedNow: "2026-05-19T10:00:00.000Z" });
}

export async function seedSimpleApplication(store = createWf1Store()) {
	const created = await createWorkflowAsset(store, eva, {
		assetKind: "flat",
		title: "WF1 Eva Flat",
		locationLabel: "Bangalore",
		publicPrice: 60_000,
		ownerConditionsSpec: { depositPolicy: "Two months deposit covers chargeable damage." },
	});
	await updateWorkflowAssetConfig(store, eva, created.asset.id, {
		configSpec: { bedrooms: 2 },
		conditionSpec: { walls: "freshly_painted" },
		ownerConditionsSpec: { depositPolicy: "Two months deposit covers chargeable damage." },
		items: [{ itemKind: "fixture", itemLabel: "Door", ownerDeclaredState: "good" }],
	});
	const published = await publishWorkflowAsset(store, eva, created.asset.id);
	const interestResult = await expressWorkflowInterest(store, rakesh, published.asset.id, {
		name: "Rakesh",
		officialEmail: "tenant_manual_created_1@example.com",
		message: "Eva, I am interested in this flat.",
		acceptedConditionsVersion: Number(published.asset.conditions_version),
		acceptedConditionsHash: String(published.asset.conditions_hash),
		workflowDefinitionId: "simple-available-rented",
		workflowDefinitionVersion: 1,
	});

	return {
		store,
		asset: published.asset,
		interest: interestResult.interest,
		instance: interestResult.instance,
	};
}
