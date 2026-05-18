import { validateWorkflowDefinition } from "../core/definition-schema.js";
import type { WorkflowDefinition } from "../core/types.js";
import { WF_ASSET_STATE, WF_VISIBILITY } from "../store/collections.js";

const applicationStates = {
	submitted: {
		id: "submitted",
		label: "Submitted",
		tone: "pending",
		descriptionByRole: {
			owner: "A renter has submitted interest. You can begin screening with cards.",
			applicant: "Your interest has been sent to the owner. Please wait for the next request.",
			renter: "Your interest has been sent to the owner. Please wait for the next request.",
		},
		waitingMessageByRole: {
			applicant: "No action needed now. The owner will send the next request.",
			renter: "No action needed now. The owner will send the next request.",
		},
	},
	screening: {
		id: "screening",
		label: "Screening",
		tone: "pending",
		descriptionByRole: {
			owner: "Screening is in progress. Review answers and send more task cards if needed.",
			applicant: "Please answer any open owner requests.",
			renter: "Please answer any open owner requests.",
		},
	},
	answer_received: {
		id: "answer_received",
		label: "Answer received",
		tone: "pending",
		descriptionByRole: {
			owner: "The renter has answered an owner request. You can ask more questions, counter, or accept terms.",
			applicant: "Your answer was submitted. Please wait for the owner’s next step.",
			renter: "Your answer was submitted. Please wait for the owner’s next step.",
		},
		waitingMessageByRole: {
			applicant: "No action needed now. Waiting for the owner.",
			renter: "No action needed now. Waiting for the owner.",
		},
	},
	offer_made: {
		id: "offer_made",
		label: "Offer made",
		tone: "pending",
		descriptionByRole: {
			owner: "The renter has made an offer. You can counter or accept final terms.",
			applicant: "Your offer was sent. Please wait for the owner.",
			renter: "Your offer was sent. Please wait for the owner.",
		},
		waitingMessageByRole: {
			applicant: "No action needed now. Waiting for the owner to review your offer.",
			renter: "No action needed now. Waiting for the owner to review your offer.",
		},
	},
	countered: {
		id: "countered",
		label: "Countered",
		tone: "pending",
		descriptionByRole: {
			owner: "Counter terms were sent. You can still accept final terms if the offline discussion is complete.",
			applicant: "The owner has countered. You can accept or send another offer.",
			renter: "The owner has countered. You can accept or send another offer.",
		},
	},
	accepted: {
		id: "accepted",
		label: "Accepted",
		tone: "accepted",
		descriptionByRole: {
			owner: "The renter accepted terms. You can freeze the final terms when ready.",
			applicant: "You accepted the terms. Please wait for the owner to finalize.",
			renter: "You accepted the terms. Please wait for the owner to finalize.",
		},
		waitingMessageByRole: {
			applicant: "No action needed now. Waiting for the owner to finalize terms.",
			renter: "No action needed now. Waiting for the owner to finalize terms.",
		},
	},
	booked: {
		id: "booked",
		label: "Agreement accepted",
		tone: "accepted",
		descriptionByRole: {
			owner: "Terms are accepted. You can send booking/deposit task cards or explicitly start move-in.",
			applicant: "Agreement is accepted. Please wait for the owner’s next request.",
			renter: "Agreement is accepted. Please wait for the owner’s next request.",
		},
		waitingMessageByRole: {
			applicant: "No action needed now. The owner will send the next request.",
			renter: "No action needed now. The owner will send the next request.",
		},
	},
	move_in_started: {
		id: "move_in_started",
		label: "Move-in started",
		tone: "pending",
		descriptionByRole: {
			owner: "Move-in has started. Waiting for the renter to accept the handover.",
			applicant: "Move-in is ready. Please accept the handover when checked.",
			renter: "Move-in is ready. Please accept the handover when checked.",
		},
		waitingMessageByRole: {
			owner: "No action needed now. Waiting for renter handover acceptance.",
		},
	},
	rented: {
		id: "rented",
		label: "Rented",
		tone: "rented",
		descriptionByRole: {
			owner: "The asset is rented. Future return and settlement workflows can begin later.",
			applicant: "You are now the renter for this asset.",
			renter: "You are now the renter for this asset.",
		},
	},
	withdrawn: { id: "withdrawn", label: "Withdrawn", terminal: true, tone: "neutral" },
	rejected: { id: "rejected", label: "Rejected", terminal: true, tone: "danger" },
} satisfies WorkflowDefinition["states"];

const negotiableAssetStates = [
	WF_ASSET_STATE.LISTED,
	WF_ASSET_STATE.INTEREST_RECEIVED,
	WF_ASSET_STATE.NEGOTIATING,
	WF_ASSET_STATE.BOOKED,
];

export const ALM_CURRENT_PARITY_V1: WorkflowDefinition = validateWorkflowDefinition({
	id: "alm-current-parity",
	version: 1,
	scopeKind: "asset_application",
	initialState: "submitted",
	initialCards: [
	{
		cardType: "application_submission",
		createdByRole: "applicant",
		promptSource: "interest.message",
		fallbackPrompt: "Application submitted.",
		cardState: "accepted",
		cardSpec: {
			displayState: "submitted",
			displayTitle: "Application submitted",
		},
	},
],
	states: applicationStates,
	cardTypes: {
		application_submission: {
	id: "application_submission",
	label: "Application submitted",
	createdBy: [],
	answeredBy: [],
	allowedWorkflowStates: ["submitted"],
	allowedAssetStates: negotiableAssetStates,
	answerSchema: { kind: "none" },
	evidencePolicy: {
		attachment: "optional",
		reusableTenantDocumentAllowed: true,
	},
	resolutionPolicy: {
		required: false,
		unresolvedActionPolicy: "allow",
	},
	ui: {
		displayTitle: "Application submitted",
		defaultPrompt: "Application submitted.",
		promptLabel: "Application message",
		submitLabel: "Submit application",
		helpText: "This card is created automatically when an applicant expresses interest.",
	},
	transitions: [],
},
		owner_question: {
			id: "owner_question",
			label: "Create request card",
			createdBy: ["owner"],
			answeredBy: ["applicant", "renter"],
			allowedWorkflowStates: ["submitted", "screening", "answer_received", "offer_made", "countered"],
			allowedAssetStates: negotiableAssetStates,
			answerSchema: { kind: "free_text", minLength: 1, maxLength: 4000 },
			evidencePolicy: {
				attachment: "optional",
				reusableTenantDocumentAllowed: true,
			},
			resolutionPolicy: {
				required: false,
				unresolvedActionPolicy: "allow",
			},
			ui: {
				defaultPrompt: "Please upload company ID and salary slip.",
				promptLabel: "Owner request",
				answerLabel: "Answer",
				submitLabel: "Create request card",
				helpText: "Use this card for screening questions, document references, or owner clarification.",
			},
			transitions: [
				{ when: "card_created", nextWorkflowState: "screening", nextAssetState: WF_ASSET_STATE.NEGOTIATING },
				{ when: "card_answered", nextWorkflowState: "answer_received" },
			],
		},
		applicant_offer: {
			id: "applicant_offer",
			label: "Rent concession offer",
			createdBy: ["applicant", "renter"],
			answeredBy: ["owner"],
			allowedWorkflowStates: ["submitted", "screening", "answer_received", "countered"],
			allowedAssetStates: negotiableAssetStates,
			answerSchema: { kind: "none" },
			evidencePolicy: { attachment: "forbidden" },
			resolutionPolicy: {
				required: false,
				unresolvedActionPolicy: "allow",
			},
			ui: {
				defaultPrompt: "I can move in quickly if rent is reduced.",
				promptLabel: "Offer message",
				submitLabel: "Send offer",
			},
			transitions: [{ when: "card_created", nextWorkflowState: "offer_made" }],
		},
		owner_counter: {
			id: "owner_counter",
			label: "Owner counter",
			createdBy: ["owner"],
			answeredBy: ["applicant", "renter"],
			allowedWorkflowStates: ["offer_made", "answer_received", "countered"],
			allowedAssetStates: negotiableAssetStates,
			answerSchema: { kind: "none" },
			evidencePolicy: { attachment: "forbidden" },
			resolutionPolicy: {
				required: false,
				unresolvedActionPolicy: "allow",
			},
			ui: {
				defaultPrompt: "Owner counter terms shared.",
				promptLabel: "Counter terms",
				submitLabel: "Send counter",
			},
			transitions: [{ when: "card_created", nextWorkflowState: "countered" }],
		},
		applicant_acceptance: {
			id: "applicant_acceptance",
			label: "Accept owner terms",
			createdBy: ["applicant", "renter"],
			answeredBy: ["owner"],
			allowedWorkflowStates: ["countered", "offer_made"],
			allowedAssetStates: negotiableAssetStates,
			answerSchema: { kind: "none" },
			evidencePolicy: { attachment: "forbidden" },
			resolutionPolicy: {
				required: false,
				unresolvedActionPolicy: "allow",
			},
			ui: {
				defaultPrompt: "I accept the owner terms.",
				promptLabel: "Acceptance note",
				submitLabel: "Accept owner terms",
			},
			transitions: [{ when: "card_created", nextWorkflowState: "accepted" }],
		},
		booking_payment_request: {
			id: "booking_payment_request",
			label: "Request booking payment confirmation",
			createdBy: ["owner"],
			answeredBy: ["applicant", "renter"],
			allowedWorkflowStates: ["booked"],
			allowedAssetStates: [WF_ASSET_STATE.BOOKED],
			answerSchema: {
				kind: "amount_proof",
				amountRequired: false,
				referenceRequired: true,
			},
			evidencePolicy: {
				attachment: "optional",
				allowedDocumentKinds: ["payment_proof"],
				allowedMimeTypes: ["image/*", "application/pdf"],
				reusableTenantDocumentAllowed: false,
			},
			resolutionPolicy: {
				required: true,
				unresolvedActionPolicy: "warn",
			},
			ui: {
				defaultPrompt: "Please share booking payment reference or proof.",
				promptLabel: "Payment request",
				answerLabel: "Payment reference",
				submitLabel: "Request booking payment confirmation",
				helpText: "This is a task card. It does not move the workflow stage by itself.",
			},
			defaultCardSpec: {
				paymentKind: "booking_amount",
				currency: "INR",
			},
			transitions: [],
		},
	},
	actions: {
		accept_applicant: {
	id: "accept_applicant",
	label: "Accept applicant",
	runBy: ["owner"],
	allowedWorkflowStates: ["submitted", "screening", "answer_received", "offer_made", "countered", "accepted"],
	allowedAssetStates: negotiableAssetStates,
	transitions: [
		{
			when: "action_run",
			nextWorkflowState: "booked",
			nextAssetState: WF_ASSET_STATE.BOOKED,
			nextVisibilityState: WF_VISIBILITY.RESTRICTED,
			grantAccess: ["owner", "renter"],
			closeOtherApplications: true,
		},
	],
	unresolvedCardPolicy: "warn",
	confirmationMessage: "Accept this applicant and restrict the asset to this renter.",
},
		accept_final_terms: {
			id: "accept_final_terms",
			label: "Accept final terms",
			runBy: ["owner"],
			allowedWorkflowStates: ["accepted", "countered", "offer_made", "answer_received"],
			allowedAssetStates: negotiableAssetStates,
			transitions: [
				{
					when: "action_run",
					nextWorkflowState: "booked",
					nextAssetState: WF_ASSET_STATE.BOOKED,
					nextVisibilityState: WF_VISIBILITY.RESTRICTED,
					grantAccess: ["owner", "renter"],
					closeOtherApplications: true,
				},
			],
		},
		start_move_in: {
			id: "start_move_in",
			label: "Start move-in",
			runBy: ["owner"],
			allowedWorkflowStates: ["booked"],
			allowedAssetStates: [WF_ASSET_STATE.BOOKED],
			transitions: [{ when: "action_run", nextWorkflowState: "move_in_started" }],
			unresolvedCardPolicy: "warn",
			confirmationMessage: "Start move-in even if some task cards are still unresolved?",
		},
		accept_move_in: {
			id: "accept_move_in",
			label: "Accept move-in",
			runBy: ["renter", "applicant"],
			allowedWorkflowStates: ["move_in_started"],
			allowedAssetStates: [WF_ASSET_STATE.BOOKED],
			transitions: [
				{ when: "action_run", nextWorkflowState: "rented", nextAssetState: WF_ASSET_STATE.RENTED },
			],
		},
		reject_application: {
			id: "reject_application",
			label: "Reject application",
			runBy: ["owner"],
			allowedWorkflowStates: [
				"submitted",
				"screening",
				"answer_received",
				"offer_made",
				"countered",
			],
			allowedAssetStates: negotiableAssetStates,
			transitions: [{ when: "action_run", nextWorkflowState: "rejected" }],
		},
	},
});