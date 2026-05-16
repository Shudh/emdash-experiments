import type { AcceptFinalTermsRequest } from "../api-contracts.js";
import { requireInterestParticipant } from "../auth.js";
import {
	ACCESS_ROLE,
	AGREEMENT_STATE,
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
	EVENT_KIND,
	INTEREST_STATE,
	VISIBILITY_STATE,
} from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { grantAssetAccess } from "../repositories/access.js";
import { getAssetOrThrow } from "../repositories/assets.js";
import { getInterestOrThrow, listInterestRounds } from "../repositories/interests.js";
import { findAcceptedRound } from "../repositories/negotiations.js";
import { assertAllowedAssetTransition } from "../transitions.js";
import type { DomainRow, DomainStore, JsonObject, UserContext } from "../types.js";
import { DomainError, asJsonObject, asNumber, asString } from "../types.js";
import { makeAgreementNumber } from "../validation.js";

const UNDERSCORE_PATTERN = /_/g;

function agreementTermsFromRound(
	agreementId: string,
	assetId: string,
	round: DomainRow | null,
	input: AcceptFinalTermsRequest,
) {
	const terms: Record<string, unknown>[] = [];
	const roundId = round?.id ?? null;
	const price = round ? asNumber(round.price, NaN) : NaN;
	const minimumMonths = round ? asNumber(round.minimum_months, NaN) : NaN;
	const kmLimit = round ? asNumber(round.km_limit, NaN) : NaN;
	if (Number.isFinite(price))
		terms.push({
			agreement_id: agreementId,
			asset_id: assetId,
			term_kind: "price",
			term_label: "Agreed price",
			term_value_number: price,
			term_state: "accepted",
			source_round_id: roundId,
		});
	if (Number.isFinite(minimumMonths))
		terms.push({
			agreement_id: agreementId,
			asset_id: assetId,
			term_kind: "minimum_months",
			term_label: "Minimum months",
			term_value_number: minimumMonths,
			term_state: "accepted",
			source_round_id: roundId,
		});
	if (Number.isFinite(kmLimit))
		terms.push({
			agreement_id: agreementId,
			asset_id: assetId,
			term_kind: "km_limit",
			term_label: "Included kilometre limit",
			term_value_number: kmLimit,
			term_state: "accepted",
			source_round_id: roundId,
		});
	for (const [key, value] of Object.entries(input.extraTerms ?? {})) {
		terms.push({
			agreement_id: agreementId,
			asset_id: assetId,
			term_kind: key,
			term_label: key.replace(UNDERSCORE_PATTERN, " "),
			term_value_text: typeof value === "string" ? value : JSON.stringify(value),
			term_state: "accepted",
			source_round_id: roundId,
			term_spec: { value },
		});
	}
	return terms;
}

export async function acceptFinalTerms(
	store: DomainStore,
	user: UserContext,
	interestId: string,
	input: AcceptFinalTermsRequest,
) {
	return store.transaction(async (tx) => {
		await requireInterestParticipant(tx, user, interestId);
		const interest = await getInterestOrThrow(tx, interestId);
		const asset = await getAssetOrThrow(tx, asString(interest.asset_id));
		const fromState = asString(asset.business_state);
		assertAllowedAssetTransition(fromState, ASSET_BUSINESS_STATE.BOOKED, "acceptFinalTerms");
		const acceptedRound = await findAcceptedRound(tx, interestId, input.acceptedRoundId);
		if (!acceptedRound && input.acceptedRoundId)
			throw new DomainError("ROUND_NOT_FOUND", "Accepted negotiation round not found", 404);
		const rounds = await listInterestRounds(tx, interestId);
		const configItems = await tx.list(
			COLLECTIONS.ASSET_CONFIG_ITEMS,
			{ asset_id: asset.id, item_state: "active" },
			{ orderBy: "created_at", direction: "asc", limit: 500 },
		);
		const now = tx.now();
		const ownerUserId = asString(interest.owner_user_id);
		const renterUserId = asString(interest.interested_user_id);
		const acceptedItems: JsonObject[] = configItems.map((item) => ({
			id: item.id,
			label: item.item_label,
			state: item.owner_declared_state,
			spec: asJsonObject(item.item_spec),
		}));
		const snapshot: JsonObject = {
			asset: {
				id: asset.id,
				slug: asset.slug,
				title: asString(asset.title),
				asset_kind: asString(asset.asset_kind),
				location_label: asString(asset.location_label),
			},
			parties: {
				owner_user_id: ownerUserId,
				renter_user_id: renterUserId,
				renter_name: asString(interest.name),
				renter_official_email: asString(interest.official_email),
			},
			commercial_terms: {
				price: acceptedRound?.price ?? interest.offered_price ?? asset.public_price ?? null,
				currency: acceptedRound?.currency ?? asset.currency ?? "INR",
				minimum_months:
					acceptedRound?.minimum_months ??
					interest.requested_minimum_months ??
					asset.minimum_months ??
					null,
				km_limit:
					acceptedRound?.km_limit ?? interest.requested_km_limit ?? asset.included_km ?? null,
				effective_from: input.effectiveFrom ?? null,
				effective_to: input.effectiveTo ?? null,
			},
			config_spec: asJsonObject(asset.config_spec),
			condition_spec: asJsonObject(asset.condition_spec),
			owner_conditions: {
				version: asset.conditions_version ?? null,
				hash: asset.conditions_hash ?? null,
				spec: asJsonObject(asset.owner_conditions_spec),
			},
			renter_accepted_conditions: {
				version: interest.accepted_conditions_version ?? null,
				hash: interest.accepted_conditions_hash ?? null,
				accepted_at: interest.accepted_conditions_at ?? null,
				snapshot: asJsonObject(interest.accepted_conditions_snapshot),
			},
			accepted_items: acceptedItems,
			accepted_round: acceptedRound
				? {
						id: acceptedRound.id,
						round_kind: acceptedRound.round_kind,
						round_state: acceptedRound.round_state,
						message: acceptedRound.message,
						price: acceptedRound.price ?? null,
						currency: acceptedRound.currency ?? null,
						minimum_months: acceptedRound.minimum_months ?? null,
						km_limit: acceptedRound.km_limit ?? null,
						deposit_amount: acceptedRound.deposit_amount ?? null,
						start_date: acceptedRound.start_date ?? null,
						end_date: acceptedRound.end_date ?? null,
						terms_spec: asJsonObject(acceptedRound.terms_spec),
					}
				: null,
			negotiation_round_ids: rounds.map((round) => round.id),
			extra_terms: input.extraTerms ?? {},
		};
		const agreement = await tx.insert(COLLECTIONS.AGREEMENT_VERSIONS, {
			status: CMS_STATUS.PUBLISHED,
			author_id: user.id,
			asset_id: asset.id,
			interest_id: interestId,
			owner_user_id: ownerUserId,
			renter_user_id: renterUserId,
			agreement_state: AGREEMENT_STATE.FULLY_ACCEPTED,
			agreement_number: makeAgreementNumber(now, asset.id),
			agreement_kind: input.agreementKind,
			accepted_offer_round_id: acceptedRound?.id ?? null,
			owner_accepted_at: ownerUserId === user.id ? now : null,
			renter_accepted_at: renterUserId === user.id ? now : null,
			signed_at: null,
			effective_from: input.effectiveFrom ?? null,
			effective_to: input.effectiveTo ?? null,
			printable_snapshot: snapshot,
			contract_text: input.contractText ?? "Agreement snapshot accepted by both parties.",
			signature_spec: {},
			notarization_spec: {},
		});
		const termInputs = agreementTermsFromRound(agreement.id, asset.id, acceptedRound, input);
		const terms = [];
		for (const term of termInputs) {
			terms.push(
				await tx.insert(COLLECTIONS.AGREEMENT_TERMS, {
					status: CMS_STATUS.PUBLISHED,
					author_id: user.id,
					...term,
				}),
			);
		}
		await tx.update(COLLECTIONS.ASSET_INTERESTS, interestId, {
			interest_state: INTEREST_STATE.ACCEPTED,
		});
		const updatedAsset = await tx.update(COLLECTIONS.ASSETS, asset.id, {
			business_state: ASSET_BUSINESS_STATE.BOOKED,
			visibility_state: VISIBILITY_STATE.RESTRICTED,
			active_interest_id: interestId,
			active_agreement_id: agreement.id,
			active_renter_user_id: renterUserId,
		});
		const ownerAccess = await grantAssetAccess(tx, {
			assetId: asset.id,
			userId: ownerUserId,
			role: ACCESS_ROLE.OWNER,
			authorId: user.id,
		});
		const renterAccess = await grantAssetAccess(tx, {
			assetId: asset.id,
			userId: renterUserId,
			role: ACCESS_ROLE.RENTER,
			authorId: user.id,
		});
		await appendAssetEvent(tx, {
			assetId: asset.id,
			eventKind: EVENT_KIND.AGREEMENT_FROZEN,
			actor: user,
			fromBusinessState: fromState,
			toBusinessState: ASSET_BUSINESS_STATE.BOOKED,
			eventSpec: { agreementId: agreement.id, interestId, termCount: terms.length },
		});
		return { agreement, terms, asset: updatedAsset, access: [ownerAccess, renterAccess] };
	});
}
