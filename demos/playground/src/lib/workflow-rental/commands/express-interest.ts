import { DomainError, asJsonObject, asNumber, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import {
	WF_ASSET_STATE,
	WF_STATUS,
	WF_VISIBILITY,
	WORKFLOW_RENTAL_COLLECTIONS,
} from "../store/collections.js";
import {
	appendWorkflowEvent,
	createInitialWorkflowCards,
	createInitialWorkflowInstance,
	getAssetOrThrow,
	listWorkspace,
} from "../store/repository.js";

export type ExpressWorkflowInterestInput = {
	name?: string;
	officialEmail?: string;
	phone?: string;
	employerName?: string;
	offeredPrice?: number;
	requestedStartDate?: string;
	requestedMinimumMonths?: number;
	message?: string;
	interestSpec?: Record<string, unknown>;
	acceptedConditionsVersion?: number;
	acceptedConditionsHash?: string;
};

export async function expressWorkflowInterest(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	input: ExpressWorkflowInterestInput,
) {
	return store.transaction(async (tx) => {
		const asset = await getAssetOrThrow(tx, assetId);

		if (asString(asset.owner_user_id) === user.id) {
			throw new DomainError(
				"OWNER_CANNOT_EXPRESS_INTEREST",
				"Owners cannot express interest in their own asset",
				403,
			);
		}

		if (asset.status !== WF_STATUS.PUBLISHED || asset.visibility_state !== WF_VISIBILITY.MARKETPLACE) {
			throw new DomainError(
				"ASSET_NOT_MARKETPLACE_VISIBLE",
				"Asset is not available for marketplace interest",
				409,
			);
		}

		if (asset.business_state !== WF_ASSET_STATE.LISTED) {
			throw new DomainError(
				"ASSET_NOT_LISTED",
				"Asset is not currently accepting new workflow applications",
				409,
			);
		}

		const existing = await tx.findOne(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, {
			asset_id: assetId,
			interested_user_id: user.id,
		});

		if (existing) {
			throw new DomainError("INTEREST_ALREADY_SUBMITTED", "Interest already submitted for this asset", 409);
		}

		if (input.acceptedConditionsVersion === undefined || !input.acceptedConditionsHash) {
			throw new DomainError(
				"CONDITIONS_ACCEPTANCE_REQUIRED",
				"Current owner rental conditions must be accepted before expressing interest",
				422,
			);
		}

		const interest = await tx.insert(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, {
			status: WF_STATUS.PUBLISHED,
			author_id: user.id,
			asset_id: asset.id,
			asset_title: asset.title,
			asset_slug: asset.slug,
			asset_kind: asset.asset_kind,
			asset_location_label: asset.location_label,
			asset_public_price: asset.public_price,
			owner_user_id: asset.owner_user_id,
			interested_user_id: user.id,
			workflow_instance_id: null,
			interest_state: "submitted",
			name: input.name ?? user.name ?? null,
			official_email: input.officialEmail ?? user.email ?? null,
			phone: input.phone ?? null,
			employer_name: input.employerName ?? null,
			offered_price: input.offeredPrice === undefined ? null : asNumber(input.offeredPrice),
			requested_start_date: input.requestedStartDate ?? null,
			requested_minimum_months: input.requestedMinimumMonths ?? null,
			message: input.message ?? null,
			interest_spec: asJsonObject(input.interestSpec ?? {}),
			accepted_conditions_version: input.acceptedConditionsVersion,
			accepted_conditions_hash: input.acceptedConditionsHash,
			accepted_conditions_at: tx.now(),
			accepted_conditions_snapshot: asset.owner_conditions_spec ?? {},
		});

		const instance = await createInitialWorkflowInstance(tx, asset, interest, user);

		const updatedInterest = await tx.update(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, interest.id, {
			workflow_instance_id: instance.id,
		});

		const cards = await createInitialWorkflowCards(tx, {
			asset,
			interest: updatedInterest,
			instance,
			actor: user,
		});

		await appendWorkflowEvent(tx, {
			asset,
			interest: updatedInterest,
			instance,
			eventKind: "interest_submitted",
			actor: user,
			actorRole: "applicant",
			fromWorkflowState: null,
			toWorkflowState: asString(instance.workflow_state),
			fromAssetState: asString(asset.business_state),
			toAssetState: asString(asset.business_state),
			eventSpec: {
				message: input.message ?? null,
				initialCardIds: cards.map((card) => card.id),
			},
		});

		const workspace = await listWorkspace(tx, user, instance);

		return {
			asset,
			interest: updatedInterest,
			instance,
			cards,
			workspace,
		};
	});
}