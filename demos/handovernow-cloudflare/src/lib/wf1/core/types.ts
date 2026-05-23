import type { DomainRow, DomainStore, UserContext } from "../../domain/types.js";

export type WorkflowActorRole = "owner" | "applicant" | "renter";

export type WorkflowScopeKind =
	| "asset_application"
	| "asset_handover"
	| "asset_return"
	| "settlement";

export type WorkflowEventKind = "card_created" | "card_answered" | "card_decided" | "action_run";

export type WorkflowDefinition = {
	id: string;
	version: number;
	scopeKind: WorkflowScopeKind;
	initialState: string;
	initialCards?: WorkflowInitialCardDefinition[];
	states: Record<string, WorkflowStateDefinition>;
	cardTypes: Record<string, WorkflowCardDefinition>;
	actions: Record<string, WorkflowActionDefinition>;
};

export type WorkflowInitialCardDefinition = {
	cardType: string;
	createdByRole: WorkflowActorRole;
	promptSource?: "interest.message" | "interest.name" | "static";
	fallbackPrompt: string;
	cardState?: string;
	cardSpec?: Record<string, unknown>;
};

export type WorkflowStageTone =
	| "neutral"
	| "pending"
	| "accepted"
	| "blocked"
	| "rented"
	| "danger";

export type WorkflowStateDefinition = {
	id: string;
	label: string;
	terminal?: boolean;
	tone?: WorkflowStageTone;
	descriptionByRole?: Partial<Record<WorkflowActorRole, string>>;
	waitingMessageByRole?: Partial<Record<WorkflowActorRole, string>>;
};

export type WorkflowCardResolutionPolicy = {
	required?: boolean;
	unresolvedActionPolicy?: "allow" | "warn" | "block";
};

export type WorkflowCardUiDefinition = {
	defaultPrompt?: string;
	promptLabel?: string;
	answerLabel?: string;
	submitLabel?: string;
	helpText?: string;
	displayTitle?: string;
};

export type WorkflowCardDefinition = {
	id: string;
	label: string;
	createdBy: WorkflowActorRole[];
	answeredBy: WorkflowActorRole[];
	allowedWorkflowStates: string[];
	allowedAssetStates: string[];
	answerSchema: WorkflowAnswerSchema;
	evidencePolicy: WorkflowEvidencePolicy;
	decisionPolicy?: WorkflowDecisionPolicy;
	resolutionPolicy?: WorkflowCardResolutionPolicy;
	ui?: WorkflowCardUiDefinition;
	defaultCardSpec?: Record<string, unknown>;
	transitions?: WorkflowTransitionRule[];
};

export type WorkflowAnswerSchema =
	| { kind: "none" }
	| { kind: "free_text"; minLength?: number; maxLength?: number }
	| { kind: "yes_no" }
	| { kind: "mcq_single"; options: Array<{ value: string; label: string }> }
	| { kind: "mcq_multi"; options: Array<{ value: string; label: string }> }
	| { kind: "amount_proof"; amountRequired?: boolean; referenceRequired?: boolean }
	| { kind: "document_upload"; reusableTenantDocumentAllowed: boolean }
	| { kind: "agreement_review"; allowAccept: boolean; allowChangeRequest: boolean }
	| { kind: "signed_document_upload" };

export type WorkflowEvidencePolicy = {
	attachment: "forbidden" | "optional" | "required";
	allowedDocumentKinds?: string[];
	allowedMimeTypes?: string[];
	reusableTenantDocumentAllowed?: boolean;
};

export type WorkflowDecisionPolicy = {
	decidedBy: WorkflowActorRole[];
	decisions: Array<"accept" | "reject" | "request_change" | "verify_paid" | "mark_refunded">;
};

export type WorkflowTransitionRule = {
	when: WorkflowEventKind;
	decision?: string;
	nextWorkflowState?: string;
	nextAssetState?: string;
	nextVisibilityState?: string;
	activateApplication?: boolean;
	activateRenter?: boolean;
	grantAccess?: WorkflowActorRole[];
	closeOtherApplications?: boolean;
	otherApplicationState?: string;
};

export type WorkflowActionDefinition = {
	id: string;
	label: string;
	runBy: WorkflowActorRole[];
	allowedWorkflowStates: string[];
	allowedAssetStates: string[];
	transitions: WorkflowTransitionRule[];
	unresolvedCardPolicy?: "allow" | "warn" | "block";
	confirmationMessage?: string;
};

export type WorkflowAvailableCardType = {
	id: string;
	label: string;
	answerSchema: WorkflowAnswerSchema;
	evidencePolicy: WorkflowEvidencePolicy;
	resolutionPolicy: WorkflowCardResolutionPolicy;
	ui: WorkflowCardUiDefinition;
	defaultCardSpec: Record<string, unknown>;
};

export type WorkflowAvailableAction = {
	id: string;
	label: string;
	confirmationMessage?: string;
	unresolvedCardPolicy: "allow" | "warn" | "block";
	blocked: boolean;
	warnings: string[];
};

export type WorkflowWorkspaceProjection = {
	stage: {
		id: string;
		label: string;
		tone: WorkflowStageTone;
		message: string;
	};
	applicationState: {
		id: string;
		label: string;
		tone: WorkflowStageTone;
		message: string;
	};
	assetState: {
		id: string;
		label: string;
		tone: WorkflowStageTone;
	};
	statusPills: string[];
	availableCardTypes: WorkflowAvailableCardType[];
	availableActions: WorkflowAvailableAction[];
	pendingCardsForViewer: DomainRow[];
	unresolvedCards: DomainRow[];
	unresolvedRequiredCards: DomainRow[];
	taskBuckets: {
		myOpenTasks: DomainRow[];
		otherSideOpenTasks: DomainRow[];
		requiredUnresolvedTasks: DomainRow[];
		completedCards: DomainRow[];
		historyCards: DomainRow[];
	};
	waitingMessage: string | null;
	primaryNextStep: string | null;
};

export type WorkflowWorkspace = {
	asset: DomainRow;
	interest: DomainRow | null;
	instance: DomainRow | null;
	cards: DomainRow[];
	responses: DomainRow[];
	events: DomainRow[];
	assetConfigItems: DomainRow[];
	viewerRole: WorkflowActorRole | "anonymous" | "other";
	pendingRequestCount: number;
	projection?: WorkflowWorkspaceProjection;
};

export type WorkflowCommandContext = {
	store: DomainStore;
	user: UserContext;
};
