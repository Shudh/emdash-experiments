import { validateWorkflowDefinition } from "../core/definition-schema.js";
import type { WorkflowDefinition } from "../core/types.js";
import { WF_ASSET_STATE, WF_VISIBILITY } from "../store/collections.js";

const OPEN_FORM_STATES = [
	"application_under_review",
	"accepted_as_tenant",
	"moveout_requested",
];

const ACTIVE_ASSET_STATES = [
	WF_ASSET_STATE.LISTED,
	WF_ASSET_STATE.RENTED,
	WF_ASSET_STATE.RETURN_PENDING,
];

const DEFAULT_MCQ_OPTIONS = [
	{ value: "yes", label: "Yes" },
	{ value: "no", label: "No" },
	{ value: "not_applicable", label: "Not applicable" },
];

export const RENTAL_APPLICATION_FORM_BASIC_V1: WorkflowDefinition =
	validateWorkflowDefinition({
		id: "rental-application-form-basic",
		version: 1,
		scopeKind: "asset_application",
		initialState: "application_under_review",
		initialCards: [
			{
				cardType: "info_ack_to_owner",
				createdByRole: "applicant",
				promptSource: "interest.message",
				fallbackPrompt: "Application submitted.",
				cardState: "accepted",
				cardSpec: {
					displayTitle: "Application form note",
					displayState: "submitted",
					source: "interest.message",
				},
			},
		],
		states: {
			application_under_review: {
				id: "application_under_review",
				label: "Application under review",
				tone: "pending",
				descriptionByRole: {
					owner:
						"This application form is under review. You can create generic task cards and later accept this participant as tenant.",
					applicant:
						"Your application form is under review. Please answer any open task cards.",
					renter:
						"Your application form is under review. Please answer any open task cards.",
				},
				waitingMessageByRole: {
					applicant: "No open task for you now. Waiting for the owner.",
					renter: "No open task for you now. Waiting for the owner.",
				},
			},
			accepted_as_tenant: {
				id: "accepted_as_tenant",
				label: "Accepted as tenant",
				tone: "rented",
				descriptionByRole: {
					owner:
						"This application form was accepted. The applicant is now the tenant.",
					applicant: "Your application form was accepted. You are now the tenant.",
					renter: "Your application form was accepted. You are now the tenant.",
				},
			},
			moveout_requested: {
				id: "moveout_requested",
				label: "Move-out requested",
				tone: "blocked",
				descriptionByRole: {
					owner:
						"Move-out is active. Create return-check task cards from asset config items, then close move-out.",
					applicant:
						"Move-out is active. Please answer any open return-check task cards.",
					renter:
						"Move-out is active. Please answer any open return-check task cards.",
				},
				waitingMessageByRole: {
					owner:
						"No open task is pending. You may close move-out when required checks are complete.",
					renter: "No open task for you now. Waiting for the owner.",
				},
			},
			moveout_closed: {
				id: "moveout_closed",
				label: "Move-out closed",
				tone: "accepted",
				terminal: true,
				descriptionByRole: {
					owner: "Move-out is closed. The asset can be listed again.",
					applicant: "Move-out is closed.",
					renter: "Move-out is closed.",
				},
			},
			rejected: {
				id: "rejected",
				label: "Rejected",
				tone: "danger",
				terminal: true,
				descriptionByRole: {
					owner: "This application form was not accepted.",
					applicant: "This application form was not accepted.",
					renter: "This application form was not accepted.",
				},
			},
		},
		cardTypes: {
			info_ack_to_counterparty: {
				id: "info_ack_to_counterparty",
				label: "Information / acknowledge",
				createdBy: ["owner"],
				answeredBy: ["applicant", "renter"],
				allowedWorkflowStates: OPEN_FORM_STATES,
				allowedAssetStates: ACTIVE_ASSET_STATES,
				answerSchema: {
					kind: "mcq_single",
					options: [{ value: "acknowledged", label: "Acknowledged" }],
				},
				evidencePolicy: { attachment: "forbidden" },
				resolutionPolicy: {
					required: false,
					unresolvedActionPolicy: "allow",
				},
				ui: {
					displayTitle: "Information / acknowledge",
					defaultPrompt: "Please acknowledge this information.",
					promptLabel: "Information",
					answerLabel: "Acknowledgement",
					submitLabel: "Send information card",
					helpText:
						"Use this for plain information exchange. The other side acknowledges it.",
				},
				transitions: [],
			},
			info_ack_to_owner: {
				id: "info_ack_to_owner",
				label: "Information / acknowledge",
				createdBy: ["applicant", "renter"],
				answeredBy: ["owner"],
				allowedWorkflowStates: OPEN_FORM_STATES,
				allowedAssetStates: ACTIVE_ASSET_STATES,
				answerSchema: {
					kind: "mcq_single",
					options: [{ value: "acknowledged", label: "Acknowledged" }],
				},
				evidencePolicy: { attachment: "forbidden" },
				resolutionPolicy: {
					required: false,
					unresolvedActionPolicy: "allow",
				},
				ui: {
					displayTitle: "Information / acknowledge",
					defaultPrompt: "Please acknowledge this information.",
					promptLabel: "Information",
					answerLabel: "Acknowledgement",
					submitLabel: "Send information card",
					helpText:
						"Use this for plain information exchange. The owner acknowledges it.",
				},
				transitions: [],
			},
			mcq_single: {
				id: "mcq_single",
				label: "Multiple choice",
				createdBy: ["owner"],
				answeredBy: ["applicant", "renter"],
				allowedWorkflowStates: OPEN_FORM_STATES,
				allowedAssetStates: ACTIVE_ASSET_STATES,
				answerSchema: {
					kind: "mcq_single",
					options: DEFAULT_MCQ_OPTIONS,
				},
				evidencePolicy: { attachment: "forbidden" },
				resolutionPolicy: {
					required: false,
					unresolvedActionPolicy: "warn",
				},
				ui: {
					displayTitle: "Multiple choice",
					defaultPrompt: "Please choose one option.",
					promptLabel: "Question",
					answerLabel: "Choice",
					submitLabel: "Create MCQ task",
					helpText:
						"Generic task card. The prompt gives this card its business meaning.",
				},
				transitions: [],
			},
			mcq_single_required_evidence: {
				id: "mcq_single_required_evidence",
				label: "Multiple choice + evidence",
				createdBy: ["owner"],
				answeredBy: ["applicant", "renter"],
				allowedWorkflowStates: OPEN_FORM_STATES,
				allowedAssetStates: ACTIVE_ASSET_STATES,
				answerSchema: {
					kind: "mcq_single",
					options: DEFAULT_MCQ_OPTIONS,
				},
				evidencePolicy: {
					attachment: "required",
					allowedMimeTypes: ["image/*", "application/pdf"],
					reusableTenantDocumentAllowed: false,
				},
				resolutionPolicy: {
					required: true,
					unresolvedActionPolicy: "block",
				},
				ui: {
					displayTitle: "Multiple choice + evidence",
					defaultPrompt: "Please choose one option and attach evidence.",
					promptLabel: "Question",
					answerLabel: "Choice",
					submitLabel: "Create MCQ evidence task",
					helpText:
						"Generic required task. The answering side must attach image/PDF evidence.",
				},
				transitions: [],
			},
			mcq_multi: {
				id: "mcq_multi",
				label: "Multiple select",
				createdBy: ["owner"],
				answeredBy: ["applicant", "renter"],
				allowedWorkflowStates: OPEN_FORM_STATES,
				allowedAssetStates: ACTIVE_ASSET_STATES,
				answerSchema: {
					kind: "mcq_multi",
					options: DEFAULT_MCQ_OPTIONS,
				},
				evidencePolicy: { attachment: "forbidden" },
				resolutionPolicy: {
					required: false,
					unresolvedActionPolicy: "warn",
				},
				ui: {
					displayTitle: "Multiple select",
					defaultPrompt: "Please choose all matching options.",
					promptLabel: "Question",
					answerLabel: "Choices",
					submitLabel: "Create multi-select task",
					helpText: "Generic multi-select task card.",
				},
				transitions: [],
			},
			mcq_multi_required_evidence: {
				id: "mcq_multi_required_evidence",
				label: "Multiple select + evidence",
				createdBy: ["owner"],
				answeredBy: ["applicant", "renter"],
				allowedWorkflowStates: OPEN_FORM_STATES,
				allowedAssetStates: ACTIVE_ASSET_STATES,
				answerSchema: {
					kind: "mcq_multi",
					options: DEFAULT_MCQ_OPTIONS,
				},
				evidencePolicy: {
					attachment: "required",
					allowedMimeTypes: ["image/*", "application/pdf"],
					reusableTenantDocumentAllowed: false,
				},
				resolutionPolicy: {
					required: true,
					unresolvedActionPolicy: "block",
				},
				ui: {
					displayTitle: "Multiple select + evidence",
					defaultPrompt:
						"Please choose all matching options and attach evidence.",
					promptLabel: "Question",
					answerLabel: "Choices",
					submitLabel: "Create multi-select evidence task",
					helpText:
						"Generic required multi-select task. The answering side must attach image/PDF evidence.",
				},
				transitions: [],
			},
			free_text: {
				id: "free_text",
				label: "Free text",
				createdBy: ["owner"],
				answeredBy: ["applicant", "renter"],
				allowedWorkflowStates: OPEN_FORM_STATES,
				allowedAssetStates: ACTIVE_ASSET_STATES,
				answerSchema: { kind: "free_text", minLength: 1, maxLength: 4000 },
				evidencePolicy: { attachment: "forbidden" },
				resolutionPolicy: {
					required: false,
					unresolvedActionPolicy: "warn",
				},
				ui: {
					displayTitle: "Free text",
					defaultPrompt: "Please answer this task.",
					promptLabel: "Task",
					answerLabel: "Answer",
					submitLabel: "Create free-text task",
					helpText:
						"Generic text task. The prompt gives this card its business meaning.",
				},
				transitions: [],
			},
			free_text_required_evidence: {
				id: "free_text_required_evidence",
				label: "Free text + evidence",
				createdBy: ["owner"],
				answeredBy: ["applicant", "renter"],
				allowedWorkflowStates: OPEN_FORM_STATES,
				allowedAssetStates: ACTIVE_ASSET_STATES,
				answerSchema: { kind: "free_text", minLength: 1, maxLength: 4000 },
				evidencePolicy: {
					attachment: "required",
					allowedMimeTypes: ["image/*", "application/pdf"],
					reusableTenantDocumentAllowed: false,
				},
				resolutionPolicy: {
					required: true,
					unresolvedActionPolicy: "block",
				},
				ui: {
					displayTitle: "Free text + evidence",
					defaultPrompt: "Please answer this task and attach evidence.",
					promptLabel: "Task",
					answerLabel: "Answer",
					submitLabel: "Create evidence task",
					helpText:
						"Generic required task. The answering side must attach image/PDF evidence.",
				},
				transitions: [],
			},
		},
		actions: {
			accept_as_tenant: {
				id: "accept_as_tenant",
				label: "Accept as tenant",
				runBy: ["owner"],
				allowedWorkflowStates: ["application_under_review"],
				allowedAssetStates: [WF_ASSET_STATE.LISTED],
				transitions: [
					{
						when: "action_run",
						nextWorkflowState: "accepted_as_tenant",
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
				confirmationMessage:
					"Accept this participant as tenant and reject other applications.",
			},
			request_moveout: {
				id: "request_moveout",
				label: "Request move-out",
				runBy: ["owner", "renter"],
				allowedWorkflowStates: ["accepted_as_tenant"],
				allowedAssetStates: [WF_ASSET_STATE.RENTED],
				transitions: [
					{
						when: "action_run",
						nextWorkflowState: "moveout_requested",
						nextAssetState: WF_ASSET_STATE.RETURN_PENDING,
						nextVisibilityState: WF_VISIBILITY.RESTRICTED,
						grantAccess: ["owner", "renter"],
					},
				],
				unresolvedCardPolicy: "allow",
				confirmationMessage:
					"Start move-out and move this asset into return pending.",
			},
			close_moveout: {
				id: "close_moveout",
				label: "Close move-out",
				runBy: ["owner"],
				allowedWorkflowStates: ["moveout_requested"],
				allowedAssetStates: [WF_ASSET_STATE.RETURN_PENDING],
				transitions: [
					{
						when: "action_run",
						nextWorkflowState: "moveout_closed",
						nextAssetState: WF_ASSET_STATE.LISTED,
						nextVisibilityState: WF_VISIBILITY.MARKETPLACE,
						grantAccess: ["owner"],
					},
				],
				unresolvedCardPolicy: "block",
				confirmationMessage: "Close move-out and list this asset again.",
			},
		},
	});