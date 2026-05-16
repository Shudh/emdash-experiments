import type { ExpressInterestRequest } from "../api-contracts.js";
import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
	EVENT_KIND,
	INTEREST_STATE,
	VISIBILITY_STATE,
} from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { getAssetOrThrow } from "../repositories/assets.js";
import { assertAllowedAssetTransition } from "../transitions.js";
import type { DomainStore, UserContext } from "../types.js";
import { DomainError, asJsonObject, asNumber, asString } from "../types.js";

export async function expressInterest(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	input: ExpressInterestRequest,
) {
	return store.transaction(async (tx) => {
		const asset = await getAssetOrThrow(tx, assetId);
		if (
			asset.status !== CMS_STATUS.PUBLISHED ||
			asset.visibility_state !== VISIBILITY_STATE.MARKETPLACE
		) {
			throw new DomainError(
				"ASSET_NOT_MARKETPLACE_VISIBLE",
				"Asset is not available for marketplace interest",
				409,
			);
		}

		const fromState = asString(asset.business_state);
		const rentableStates = new Set<string>([
			ASSET_BUSINESS_STATE.LISTED,
			ASSET_BUSINESS_STATE.INTEREST_RECEIVED,
			ASSET_BUSINESS_STATE.NEGOTIATING,
		]);
		if (!rentableStates.has(fromState)) {
			throw new DomainError("ASSET_NOT_AVAILABLE", "Asset is not accepting interests", 409);
		}

		const conditionsVersion = asNumber(asset.conditions_version, 1);
		const conditionsHash = asString(asset.conditions_hash);
		if (input.acceptedConditionsVersion === undefined || !input.acceptedConditionsHash) {
			throw new DomainError(
				"CONDITIONS_ACCEPTANCE_REQUIRED",
				"Current owner rental conditions must be accepted before expressing interest",
				422,
			);
		}
		if (
			input.acceptedConditionsVersion !== conditionsVersion ||
			input.acceptedConditionsHash !== conditionsHash
		) {
			throw new DomainError(
				"STALE_CONDITIONS_ACCEPTANCE",
				"Owner rental conditions changed; review and accept the latest conditions",
				409,
			);
		}

		const acceptedAt = tx.now();
		const ownerConditionsSnapshot = asJsonObject(asset.owner_conditions_spec);
		const interest = await tx.insert(COLLECTIONS.ASSET_INTERESTS, {
			status: CMS_STATUS.PUBLISHED,
			author_id: user.id,
			asset_id: assetId,
			asset_title: asString(asset.title),
			asset_slug: asString(asset.slug),
			asset_kind: asString(asset.asset_kind),
			asset_location_label: asString(asset.location_label),
			asset_public_price: asset.public_price ?? null,
			owner_user_id: asString(asset.owner_user_id),
			interested_user_id: user.id,
			interest_state: INTEREST_STATE.SUBMITTED,
			name: input.name ?? user.name ?? null,
			official_email: input.officialEmail ?? user.email ?? null,
			phone: input.phone ?? null,
			employer_name: input.employerName ?? null,
			offered_price: input.offeredPrice ?? null,
			requested_start_date: input.requestedStartDate ?? null,
			requested_minimum_months: input.requestedMinimumMonths ?? null,
			requested_km_limit: input.requestedKmLimit ?? null,
			message: input.message ?? null,
			interest_spec: input.interestSpec ?? {},
			accepted_conditions_version: conditionsVersion,
			accepted_conditions_hash: conditionsHash,
			accepted_conditions_at: acceptedAt,
			accepted_conditions_snapshot: ownerConditionsSnapshot,
		});

		let updatedAsset = asset;
		if (fromState === ASSET_BUSINESS_STATE.LISTED) {
			assertAllowedAssetTransition(
				fromState,
				ASSET_BUSINESS_STATE.INTEREST_RECEIVED,
				"expressInterest",
			);
			updatedAsset = await tx.update(COLLECTIONS.ASSETS, assetId, {
				business_state: ASSET_BUSINESS_STATE.INTEREST_RECEIVED,
				active_interest_id: interest.id,
			});
		}

		await appendAssetEvent(tx, {
			assetId,
			eventKind: EVENT_KIND.INTEREST_SUBMITTED,
			actor: user,
			fromBusinessState: fromState,
			toBusinessState: asString(updatedAsset.business_state),
			eventSpec: { interestId: interest.id },
		});

		return { interest, asset: updatedAsset };
	});
}
