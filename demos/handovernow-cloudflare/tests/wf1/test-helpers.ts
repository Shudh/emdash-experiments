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
export const adminReviewer: UserContext = {
	id: "admin_reviewer",
	email: "shudh.datta@gmail.com",
	name: "Admin Reviewer",
	role: "50",
};

export type Wf1TestWorkflowProfile = {
	workflowDefinitionId: string;
	workflowDefinitionVersion: number;
	initialApplicationFormState: string;
	acceptedApplicationFormState: string;
	acceptActionId: string;
	plainTextCardType: string;
	requiredEvidenceCardType: string;
	missingEvidenceAnswer: Record<string, unknown>;
	requiredEvidenceAnswer: Record<string, unknown>;
	requiredEvidenceAnswerMatch: Record<string, unknown>;
};

export const WF1_TEST_WORKFLOWS = {
	simpleAvailableRented: {
		workflowDefinitionId: "simple-available-rented",
		workflowDefinitionVersion: 1,
		initialApplicationFormState: "available",
		acceptedApplicationFormState: "rented",
		acceptActionId: "mark_rented",
		plainTextCardType: "owner_task",
		requiredEvidenceCardType: "payment_proof_task",
		missingEvidenceAnswer: { reference: "UPI-MISSING-EVIDENCE" },
		requiredEvidenceAnswer: { reference: "UPI-TEST-001" },
		requiredEvidenceAnswerMatch: { reference: "UPI-TEST-001" },
	},
	rentalApplicationFormBasic: {
		workflowDefinitionId: "rental-application-form-basic",
		workflowDefinitionVersion: 1,
		initialApplicationFormState: "application_under_review",
		acceptedApplicationFormState: "accepted_as_tenant",
		acceptActionId: "accept_as_tenant",
		plainTextCardType: "free_text",
		requiredEvidenceCardType: "free_text_required_evidence",
		missingEvidenceAnswer: { text: "Evidence text without attachment." },
		requiredEvidenceAnswer: { text: "Evidence attached." },
		requiredEvidenceAnswerMatch: { text: "Evidence attached." },
	},
} as const satisfies Record<string, Wf1TestWorkflowProfile>;

export function createWf1Store(): DomainStore {
	return new MemoryDomainStore({ fixedNow: "2026-05-19T10:00:00.000Z" });
}

export async function seedSimpleApplication(
	store = createWf1Store(),
	workflow: Wf1TestWorkflowProfile = WF1_TEST_WORKFLOWS.rentalApplicationFormBasic,
) {
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
		items: [
			{
				itemKind: "fixture",
				itemGroup: "main door",
				itemLabel: "Door",
				ownerDeclaredState: "good",
				itemSpec: {
					quantity: 1,
					room: "main door",
					conditionDetails: "Main entrance door is in good condition.",
				},
				mediaRefs: [],
			},
		],
	});

	const published = await publishWorkflowAsset(store, adminReviewer, created.asset.id);

	const interestResult = await expressWorkflowInterest(store, rakesh, published.asset.id, {
		name: "Rakesh",
		officialEmail: "tenant_manual_created_1@example.com",
		message: "Eva, I am interested in this flat.",
		acceptedConditionsVersion: Number(published.asset.conditions_version),
		acceptedConditionsHash: String(published.asset.conditions_hash),
		workflowDefinitionId: workflow.workflowDefinitionId,
		workflowDefinitionVersion: workflow.workflowDefinitionVersion,
	});

	return {
		store,
		asset: published.asset,
		interest: interestResult.interest,
		instance: interestResult.instance,
		workflow,
	};
}
