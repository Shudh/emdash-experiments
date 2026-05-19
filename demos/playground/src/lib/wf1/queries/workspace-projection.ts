import type {
	WorkflowActionDefinition,
	WorkflowActorRole,
	WorkflowAvailableAction,
	WorkflowAvailableCardType,
	WorkflowCardDefinition,
	WorkflowDefinition,
	WorkflowWorkspace,
	WorkflowWorkspaceProjection,
} from "../core/types.js";
import { WF_CARD_STATE } from "../store/collections.js";
import { workflowDefinitionForInstance } from "../store/repository.js";

const OPEN_CARD_STATES = new Set<string>([WF_CARD_STATE.OPEN, "open", "pending", "proposed"]);

const RESOLVED_CARD_STATES = new Set<string>([
	"answered",
	"accepted",
	"resolved",
	"waived",
	"rejected",
	"closed",
]);

function valueText(value: unknown, fallback = ""): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return fallback;
}

function valueRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function isActorRole(role: WorkflowWorkspace["viewerRole"]): role is WorkflowActorRole {
	return role === "owner" || role === "applicant" || role === "renter";
}

function canUseState(
	workflowState: string,
	assetState: string,
	allowedWorkflowStates: string[],
	allowedAssetStates: string[],
): boolean {
	return allowedWorkflowStates.includes(workflowState) && allowedAssetStates.includes(assetState);
}

function canCreateCard(
	card: WorkflowCardDefinition,
	viewerRole: WorkflowWorkspace["viewerRole"],
	workflowState: string,
	assetState: string,
): boolean {
	if (!isActorRole(viewerRole)) return false;
	return (
		card.createdBy.includes(viewerRole) &&
		canUseState(workflowState, assetState, card.allowedWorkflowStates, card.allowedAssetStates)
	);
}

function canRunAction(
	action: WorkflowActionDefinition,
	viewerRole: WorkflowWorkspace["viewerRole"],
	workflowState: string,
	assetState: string,
): boolean {
	if (!isActorRole(viewerRole)) return false;
	return (
		action.runBy.includes(viewerRole) &&
		canUseState(workflowState, assetState, action.allowedWorkflowStates, action.allowedAssetStates)
	);
}

function cardState(card: Record<string, unknown>): string {
	return valueText(card.card_state, "open");
}

function cardType(card: Record<string, unknown>): string {
	return valueText(card.card_type);
}

function isUnresolvedCard(card: Record<string, unknown>): boolean {
	const state = cardState(card);
	if (RESOLVED_CARD_STATES.has(state)) return false;
	return OPEN_CARD_STATES.has(state) || state.length > 0;
}

function isPendingForViewer(
	card: Record<string, unknown>,
	workspace: WorkflowWorkspace,
	definition: WorkflowDefinition,
): boolean {
	if (!isActorRole(workspace.viewerRole)) return false;
	if (!isUnresolvedCard(card)) return false;

	const definitionCard = definition.cardTypes[cardType(card)];

	if (!definitionCard) return false;
	if (definitionCard.answerSchema.kind === "none") return false;

	const assignedUserId = valueText(card.assigned_to_user_id);
	const ownerUserId = valueText(workspace.asset.owner_user_id);
	const applicantUserId = valueText(workspace.interest?.interested_user_id);
	const renterUserId = valueText(workspace.asset.active_renter_user_id);

	if (assignedUserId) {
		if (workspace.viewerRole === "owner") return assignedUserId === ownerUserId;
		if (workspace.viewerRole === "applicant") return assignedUserId === applicantUserId;
		if (workspace.viewerRole === "renter")
			return assignedUserId === renterUserId || assignedUserId === applicantUserId;
	}

	return definitionCard.answeredBy.includes(workspace.viewerRole);
}

function pendingCardsForViewer(workspace: WorkflowWorkspace, definition: WorkflowDefinition) {
	return workspace.cards.filter((card) => isPendingForViewer(card, workspace, definition));
}

function unresolvedCards(workspace: WorkflowWorkspace) {
	return workspace.cards.filter((card) => isUnresolvedCard(card));
}

function unresolvedRequiredCards(workspace: WorkflowWorkspace, definition: WorkflowDefinition) {
	return unresolvedCards(workspace).filter((card) => {
		const definitionCard = definition.cardTypes[cardType(card)];
		return (
			definitionCard?.resolutionPolicy?.required === true ||
			definitionCard?.evidencePolicy.attachment === "required"
		);
	});
}

function actionWarnings(
	action: WorkflowActionDefinition,
	requiredCards: Record<string, unknown>[],
): string[] {
	const policy = action.unresolvedCardPolicy ?? "allow";

	if (!requiredCards.length || policy === "allow") {
		return [];
	}

	return [
		`${requiredCards.length} required task card${requiredCards.length === 1 ? " is" : "s are"} still unresolved.`,
	];
}

function isActionBlocked(
	action: WorkflowActionDefinition,
	requiredCards: Record<string, unknown>[],
): boolean {
	return requiredCards.length > 0 && (action.unresolvedCardPolicy ?? "allow") === "block";
}

function firstPrimaryNextStep(projection: {
	pendingCardsForViewer: WorkflowWorkspaceProjection["pendingCardsForViewer"];
	availableActions: WorkflowAvailableAction[];
	availableCardTypes: WorkflowAvailableCardType[];
	waitingMessage: string | null;
}): string | null {
	const firstPendingCard = projection.pendingCardsForViewer[0];
	if (firstPendingCard) return `Answer ${valueText(firstPendingCard.card_type, "pending card")}`;

	const firstUnblockedAction = projection.availableActions.find((action) => !action.blocked);
	if (firstUnblockedAction) return firstUnblockedAction.label;

	const firstCardType = projection.availableCardTypes[0];
	if (firstCardType) return firstCardType.label;

	return projection.waitingMessage;
}

function availableCardTypesFor(
	workspace: WorkflowWorkspace,
	workflowState: string,
	assetState: string,
	definition: WorkflowDefinition,
): WorkflowAvailableCardType[] {
	return Object.values(definition.cardTypes)
		.filter((card) => canCreateCard(card, workspace.viewerRole, workflowState, assetState))
		.map((card) => ({
			id: card.id,
			label: card.label,
			answerSchema: card.answerSchema,
			evidencePolicy: card.evidencePolicy,
			resolutionPolicy: card.resolutionPolicy ?? {
				required: false,
				unresolvedActionPolicy: "allow",
			},
			ui: card.ui ?? {},
			defaultCardSpec: valueRecord(card.defaultCardSpec),
		}));
}

function availableActionsFor(
	workspace: WorkflowWorkspace,
	workflowState: string,
	assetState: string,
	requiredCards: Record<string, unknown>[],
	definition: WorkflowDefinition,
): WorkflowAvailableAction[] {
	return Object.values(definition.actions)
		.filter((action) => canRunAction(action, workspace.viewerRole, workflowState, assetState))
		.map((action) => ({
			id: action.id,
			label: action.label,
			confirmationMessage: action.confirmationMessage,
			unresolvedCardPolicy: action.unresolvedCardPolicy ?? "allow",
			blocked: isActionBlocked(action, requiredCards),
			warnings: actionWarnings(action, requiredCards),
		}));
}

export function projectWorkflowWorkspace(workspace: WorkflowWorkspace): WorkflowWorkspace {
	if (!workspace.instance) return workspace;
	const definition = workflowDefinitionForInstance(workspace.instance);
	const workflowState = valueText(workspace.instance?.workflow_state, "submitted");
	const assetState = valueText(workspace.asset.business_state, "unknown");
	const visibilityState = valueText(workspace.asset.visibility_state, "unknown");
	const stageDefinition = definition.states[workflowState];

	const requiredCards = unresolvedRequiredCards(workspace, definition);
	const pendingCards = pendingCardsForViewer(workspace, definition);
	const allUnresolvedCards = unresolvedCards(workspace);
	const completedCards = workspace.cards.filter((card) => !isUnresolvedCard(card));
	const otherSideOpenTasks = allUnresolvedCards.filter((card) => !pendingCards.includes(card));
	const availableCardTypes = availableCardTypesFor(
		workspace,
		workflowState,
		assetState,
		definition,
	);
	const availableActions = availableActionsFor(
		workspace,
		workflowState,
		assetState,
		requiredCards,
		definition,
	);

	const viewerStageMessage =
		isActorRole(workspace.viewerRole) && stageDefinition?.descriptionByRole?.[workspace.viewerRole]
			? stageDefinition.descriptionByRole[workspace.viewerRole]
			: (stageDefinition?.label ?? workflowState);

	const waitingMessage =
		isActorRole(workspace.viewerRole) &&
		pendingCards.length === 0 &&
		availableCardTypes.length === 0 &&
		availableActions.filter((action) => !action.blocked).length === 0 &&
		stageDefinition?.waitingMessageByRole?.[workspace.viewerRole]
			? (stageDefinition.waitingMessageByRole[workspace.viewerRole] ?? null)
			: null;

	const projectionSeed = {
		pendingCardsForViewer: pendingCards,
		availableActions,
		availableCardTypes,
		waitingMessage,
	};

	const applicationState = {
		id: workflowState,
		label: stageDefinition?.label ?? workflowState,
		tone: stageDefinition?.tone ?? "neutral",
		message: viewerStageMessage ?? stageDefinition?.label ?? workflowState,
	};
	const readableAssetState = assetState.replaceAll("_", " ");
	const assetTone =
		assetState === "rented" ? "rented" : assetState === "listed" ? "pending" : "neutral";

	const projection: WorkflowWorkspaceProjection = {
		stage: applicationState,
		applicationState,
		assetState: {
			id: assetState,
			label: readableAssetState.charAt(0).toUpperCase() + readableAssetState.slice(1),
			tone: assetTone,
		},
		statusPills: [
			`Asset State: ${assetState}`,
			visibilityState,
			`Application State: ${workflowState}`,
			`role: ${workspace.viewerRole}`,
		],
		availableCardTypes,
		availableActions,
		pendingCardsForViewer: pendingCards,
		unresolvedCards: allUnresolvedCards,
		unresolvedRequiredCards: requiredCards,
		taskBuckets: {
			myOpenTasks: pendingCards,
			otherSideOpenTasks,
			requiredUnresolvedTasks: requiredCards,
			completedCards,
			historyCards: completedCards,
		},
		waitingMessage,
		primaryNextStep: firstPrimaryNextStep(projectionSeed),
	};

	return {
		...workspace,
		projection,
	};
}
