import { validateWorkflowDefinition } from "../core/definition-schema.js";
import type { WorkflowDefinition } from "../core/types.js";
import { WF_ASSET_STATE, WF_VISIBILITY } from "../store/collections.js";

export const SIMPLE_AVAILABLE_RENTED_V1: WorkflowDefinition = validateWorkflowDefinition({
	id: "simple-available-rented",
	version: 1,
	scopeKind: "asset_application",
	initialState: "available",
	initialCards: [
		{
			cardType: "application_note",
			createdByRole: "applicant",
			promptSource: "interest.message",
			fallbackPrompt: "Application submitted.",
			cardState: "accepted",
			cardSpec: {
				displayTitle: "Application note",
				displayState: "submitted",
			},
		},
	],
	states: {
		available: {
			id: "available",
			label: "Available",
			tone: "pending",
			descriptionByRole: {
				owner: "The asset is available. You can create task cards and later mark it rented.",
				applicant: "Your application is active. Please answer any open task cards.",
				renter: "Your application is active. Please answer any open task cards.",
			},
			waitingMessageByRole: {
				applicant: "No open task for you now. Waiting for the owner.",
				renter: "No open task for you now. Waiting for the owner.",
			},
		},
		rented: {
			id: "rented",
			label: "Rented",
			tone: "rented",
			terminal: true,
			descriptionByRole: {
				owner: "The asset is now rented to this applicant.",
				applicant: "You are now the renter.",
				renter: "You are now the renter.",
			},
		},
		rejected: {
			id: "rejected",
			label: "Rejected",
			tone: "danger",
			terminal: true,
		},
	},
	cardTypes: {
		application_note: {
			id: "application_note",
			label: "Application note",
			createdBy: [],
			answeredBy: [],
			allowedWorkflowStates: ["available"],
			allowedAssetStates: [WF_ASSET_STATE.LISTED],
			answerSchema: { kind: "none" },
			evidencePolicy: { attachment: "forbidden" },
			resolutionPolicy: {
				required: false,
				unresolvedActionPolicy: "allow",
			},
			ui: {
				displayTitle: "Application note",
				defaultPrompt: "Application submitted.",
				promptLabel: "Application note",
				submitLabel: "Submit application",
				helpText: "This automatic card records the applicant's initial note.",
			},
			transitions: [],
		},
		owner_task: {
			id: "owner_task",
			label: "Owner task card",
			createdBy: ["owner"],
			answeredBy: ["applicant", "renter"],
			allowedWorkflowStates: ["available"],
			allowedAssetStates: [WF_ASSET_STATE.LISTED],
			answerSchema: { kind: "free_text", minLength: 1, maxLength: 4000 },
			evidencePolicy: {
				attachment: "optional",
				reusableTenantDocumentAllowed: true,
			},
			resolutionPolicy: {
				required: false,
				unresolvedActionPolicy: "warn",
			},
			ui: {
				defaultPrompt: "Please answer this task.",
				promptLabel: "Task",
				answerLabel: "Answer",
				submitLabel: "Create task card",
				helpText: "This card creates work inside Available stage. It does not change the stage.",
			},
			transitions: [],
		},
		payment_proof_task: {
			id: "payment_proof_task",
			label: "Payment proof task",
			createdBy: ["owner"],
			answeredBy: ["applicant", "renter"],
			allowedWorkflowStates: ["available"],
			allowedAssetStates: [WF_ASSET_STATE.LISTED],
			answerSchema: {
				kind: "amount_proof",
				amountRequired: false,
				referenceRequired: true,
			},
			evidencePolicy: {
				attachment: "required",
				allowedDocumentKinds: ["payment_proof"],
				allowedMimeTypes: ["image/*", "application/pdf"],
				reusableTenantDocumentAllowed: false,
			},
			resolutionPolicy: {
				required: true,
				unresolvedActionPolicy: "block",
			},
			ui: {
				defaultPrompt: "Please submit payment reference/proof.",
				promptLabel: "Payment task",
				answerLabel: "Payment answer",
				submitLabel: "Create payment proof task",
				helpText: "This required card blocks mark-rented until answered.",
			},
			defaultCardSpec: {
				purpose: "demo_payment",
				currency: "INR",
			},
			transitions: [],
		},
	},
	actions: {
		mark_rented: {
			id: "mark_rented",
			label: "Mark rented",
			runBy: ["owner"],
			allowedWorkflowStates: ["available"],
			allowedAssetStates: [WF_ASSET_STATE.LISTED],
			transitions: [
				{
					when: "action_run",
					nextWorkflowState: "rented",
					nextAssetState: WF_ASSET_STATE.RENTED,
					nextVisibilityState: WF_VISIBILITY.RESTRICTED,
					activateApplication: true,
					activateRenter: true,
					grantAccess: ["owner", "renter"],
					closeOtherApplications: true,
					otherApplicationState: "rejected",
				},
			],
			unresolvedCardPolicy: "block",
			confirmationMessage: "Mark this applicant as renter and close other applications.",
		},
	},
});
