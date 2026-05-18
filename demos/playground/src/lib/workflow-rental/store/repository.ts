import { ownerConditionsHash } from "../../domain/validation.js";
import type { DomainRow, DomainStore, UserContext } from "../../domain/types.js";
import { asJsonObject, asString, DomainError } from "../../domain/types.js";
import { ALM_CURRENT_PARITY_V1 } from "../definitions/alm-current-parity-v1.js";
import type {
	WorkflowActorRole,
	WorkflowDefinition,
	WorkflowEventKind,
	WorkflowInitialCardDefinition,
} from "../core/types.js";
import {
	WF_ASSET_STATE,
	WF_CARD_STATE,
	WF_STATUS,
	WF_VISIBILITY,
	WORKFLOW_RENTAL_COLLECTIONS,
} from "./collections.js";

export function workflowDefinition(): WorkflowDefinition {
	return ALM_CURRENT_PARITY_V1;
}

export async function getAssetOrThrow(store: DomainStore, assetId: string): Promise<DomainRow> {
	const asset = await store.get(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId);
	if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Workflow asset not found", 404);
	return asset;
}

export async function getInterestOrThrow(store: DomainStore, interestId: string): Promise<DomainRow> {
	const interest = await store.get(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, interestId);
	if (!interest) throw new DomainError("INTEREST_NOT_FOUND", "Workflow interest not found", 404);
	return interest;
}

export async function getInstanceOrThrow(store: DomainStore, instanceId: string): Promise<DomainRow> {
	const instance = await store.get(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, instanceId);
	if (!instance) throw new DomainError("WORKFLOW_NOT_FOUND", "Workflow instance not found", 404);
	return instance;
}

export async function getCardOrThrow(store: DomainStore, cardId: string): Promise<DomainRow> {
	const card = await store.get(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS, cardId);
	if (!card) throw new DomainError("CARD_NOT_FOUND", "Workflow card not found", 404);
	return card;
}

export function actorRoleFor(
	user: UserContext | null,
	asset: DomainRow,
	interest: DomainRow | null,
): WorkflowActorRole | "anonymous" | "other" {
	if (!user?.id) return "anonymous";
	if (asString(asset.owner_user_id) === user.id) return "owner";
	if (interest && asString(interest.interested_user_id) === user.id) {
		return asString(asset.active_renter_user_id) === user.id ? "renter" : "applicant";
	}
	if (asString(asset.active_renter_user_id) === user.id) return "renter";
	return "other";
}

export async function appendWorkflowEvent(
	store: DomainStore,
	input: {
		asset: DomainRow;
		interest?: DomainRow | null;
		instance?: DomainRow | null;
		cardId?: string | null;
		eventKind: WorkflowEventKind | string;
		actor: UserContext;
		actorRole: string;
		fromWorkflowState?: string | null;
		toWorkflowState?: string | null;
		fromAssetState?: string | null;
		toAssetState?: string | null;
		eventSpec?: Record<string, unknown>;
	},
): Promise<DomainRow> {
	return store.insert(WORKFLOW_RENTAL_COLLECTIONS.ASSET_EVENTS, {
		status: WF_STATUS.PUBLISHED,
		author_id: input.actor.id,
		asset_id: input.asset.id,
		interest_id: input.interest?.id ?? null,
		workflow_instance_id: input.instance?.id ?? null,
		card_id: input.cardId ?? null,
		event_kind: input.eventKind,
		actor_user_id: input.actor.id,
		actor_role: input.actorRole,
		from_workflow_state: input.fromWorkflowState ?? null,
		to_workflow_state: input.toWorkflowState ?? null,
		from_asset_state: input.fromAssetState ?? null,
		to_asset_state: input.toAssetState ?? null,
		event_spec: input.eventSpec ?? {},
	});
}

export async function grantWorkflowAssetAccess(
	store: DomainStore,
	input: {
		assetId: string;
		userId: string;
		role: string;
		authorId: string;
	},
): Promise<void> {
	const existing = await store.findOne(WORKFLOW_RENTAL_COLLECTIONS.ASSET_ACCESS, {
		asset_id: input.assetId,
		user_id: input.userId,
		access_role: input.role,
	});

	if (existing) {
		await store.update(WORKFLOW_RENTAL_COLLECTIONS.ASSET_ACCESS, existing.id, {
			access_state: "active",
			revoked_at: null,
		});
		return;
	}

	await store.insert(WORKFLOW_RENTAL_COLLECTIONS.ASSET_ACCESS, {
		status: WF_STATUS.PUBLISHED,
		author_id: input.authorId,
		asset_id: input.assetId,
		user_id: input.userId,
		access_role: input.role,
		access_state: "active",
		granted_at: store.now(),
		revoked_at: null,
	});
}

export async function listWorkspace(
	store: DomainStore,
	user: UserContext | null,
	instance: DomainRow,
) {
	const [asset, interest] = await Promise.all([
		getAssetOrThrow(store, asString(instance.asset_id)),
		getInterestOrThrow(store, asString(instance.interest_id)),
	]);

	const [cards, events] = await Promise.all([
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS,
			{ workflow_instance_id: instance.id },
			{ orderBy: "created_at", direction: "desc", limit: 200 },
		),
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_EVENTS,
			{ workflow_instance_id: instance.id },
			{ orderBy: "created_at", direction: "desc", limit: 300 },
		),
	]);

	const responses = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARD_RESPONSES,
		{ workflow_instance_id: instance.id },
		{ orderBy: "created_at", direction: "asc", limit: 300 },
	);

	const answeredCardIds = new Set(responses.map((response) => asString(response.card_id)));
	const pendingRequestCount = cards.filter((card) => {
		const answered = answeredCardIds.has(card.id);
		return (
			asString(card.created_by_role) === "owner" &&
			!answered &&
			asString(card.card_state) === WF_CARD_STATE.OPEN
		);
	}).length;

	return {
		asset,
		interest,
		instance,
		cards,
		responses,
		events,
		viewerRole: actorRoleFor(user, asset, interest),
		pendingRequestCount,
	};
}

export async function createInitialWorkflowInstance(
	store: DomainStore,
	asset: DomainRow,
	interest: DomainRow,
	user: UserContext,
): Promise<DomainRow> {
	const definition = workflowDefinition();

	return store.insert(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, {
		status: WF_STATUS.PUBLISHED,
		author_id: user.id,
		definition_id: definition.id,
		definition_version: definition.version,
		scope_kind: definition.scopeKind,
		asset_id: asset.id,
		interest_id: interest.id,
		owner_user_id: asString(asset.owner_user_id),
		applicant_user_id: user.id,
		workflow_state: definition.initialState,
		instance_spec: {},
	});
}

// new code start
function promptForInitialCard(
	initialCard: WorkflowInitialCardDefinition,
	interest: DomainRow,
): string {
	if (initialCard.promptSource === "interest.message") {
		const message = asString(interest.message);
		return message.trim() ? message : initialCard.fallbackPrompt;
	}

	if (initialCard.promptSource === "interest.name") {
		const name = asString(interest.name);
		return name.trim() ? name : initialCard.fallbackPrompt;
	}

	return initialCard.fallbackPrompt;
}

function cardSpecForInitialCard(
	initialCard: WorkflowInitialCardDefinition,
	interest: DomainRow,
): Record<string, unknown> {
	return {
		...(initialCard.cardSpec ?? {}),
		interestId: interest.id,
		applicantName: interest.name ?? null,
		applicantEmail: interest.official_email ?? null,
		employerName: interest.employer_name ?? null,
		offeredPrice: interest.offered_price ?? null,
		requestedStartDate: interest.requested_start_date ?? null,
		requestedMinimumMonths: interest.requested_minimum_months ?? null,
	};
}

export async function createInitialWorkflowCards(
	store: DomainStore,
	input: {
		asset: DomainRow;
		interest: DomainRow;
		instance: DomainRow;
		actor: UserContext;
	},
): Promise<DomainRow[]> {
	const definition = workflowDefinition();
	const initialCards = definition.initialCards ?? [];
	const createdCards: DomainRow[] = [];

	for (const initialCard of initialCards) {
		const cardDefinition = definition.cardTypes[initialCard.cardType];

		if (!cardDefinition) {
			throw new DomainError(
				"CARD_TYPE_NOT_FOUND",
				`Initial workflow card type ${initialCard.cardType} not found`,
				500,
			);
		}

		const created = await store.insert(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_CARDS, {
			status: WF_STATUS.PUBLISHED,
			author_id: input.actor.id,
			workflow_instance_id: input.instance.id,
			asset_id: input.asset.id,
			interest_id: input.interest.id,
			card_type: initialCard.cardType,
			card_state: initialCard.cardState ?? WF_CARD_STATE.ACCEPTED,
			created_by_user_id: input.actor.id,
			created_by_role: initialCard.createdByRole,
			prompt: promptForInitialCard(initialCard, input.interest),
			answer_schema: cardDefinition.answerSchema,
			evidence_policy: cardDefinition.evidencePolicy,
			decision_policy: cardDefinition.decisionPolicy ?? null,
			card_spec: cardSpecForInitialCard(initialCard, input.interest),
			decided_at: null,
			decision: null,
		});

		await appendWorkflowEvent(store, {
			asset: input.asset,
			interest: input.interest,
			instance: input.instance,
			cardId: created.id,
			eventKind: "card_created",
			actor: input.actor,
			actorRole: initialCard.createdByRole,
			fromWorkflowState: asString(input.instance.workflow_state),
			toWorkflowState: asString(input.instance.workflow_state),
			fromAssetState: asString(input.asset.business_state),
			toAssetState: asString(input.asset.business_state),
			eventSpec: {
				cardType: initialCard.cardType,
				initialCard: true,
			},
		});

		createdCards.push(created);
	}

	return createdCards;
}

// new code end



export function ownerConditions(spec: unknown) {
	const value = asJsonObject(spec);
	return { spec: value, version: 1, hash: ownerConditionsHash(value) };
}

export function publicAssetPatch() {
	return {
		status: WF_STATUS.PUBLISHED,
		business_state: WF_ASSET_STATE.LISTED,
		visibility_state: WF_VISIBILITY.MARKETPLACE,
		published_at: new Date().toISOString(),
	};
}

export function restrictedAssetPatch() {
	return {
		visibility_state: WF_VISIBILITY.RESTRICTED,
	};
}