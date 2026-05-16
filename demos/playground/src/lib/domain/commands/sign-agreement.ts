import type { SignAgreementRequest } from "../api-contracts.js";
import { requireAgreementParticipant } from "../auth.js";
import { AGREEMENT_STATE, COLLECTIONS, EVENT_KIND } from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { getAgreementOrThrow } from "../repositories/agreements.js";
import type { DomainStore, UserContext } from "../types.js";
import { asJsonObject, asString } from "../types.js";

export async function signAgreement(
	store: DomainStore,
	user: UserContext,
	agreementId: string,
	input: SignAgreementRequest,
) {
	await requireAgreementParticipant(store, user, agreementId);
	const agreement = await getAgreementOrThrow(store, agreementId);
	const now = store.now();
	const updatedSignature = {
		...asJsonObject(agreement.signature_spec),
		[user.id]: input.signatureSpec ?? { signedAt: now },
	};
	const patch: Record<string, unknown> = {
		signature_spec: updatedSignature,
		notarization_spec: input.notarizationSpec ?? agreement.notarization_spec ?? {},
	};
	if (asString(agreement.owner_user_id) === user.id)
		patch.owner_accepted_at = agreement.owner_accepted_at ?? now;
	if (asString(agreement.renter_user_id) === user.id)
		patch.renter_accepted_at = agreement.renter_accepted_at ?? now;
	const ownerAccepted = patch.owner_accepted_at ?? agreement.owner_accepted_at;
	const renterAccepted = patch.renter_accepted_at ?? agreement.renter_accepted_at;
	if (ownerAccepted && renterAccepted) {
		patch.agreement_state = AGREEMENT_STATE.SIGNED;
		patch.signed_at = now;
	}
	const updated = await store.update(COLLECTIONS.AGREEMENT_VERSIONS, agreementId, patch);
	await appendAssetEvent(store, {
		assetId: asString(agreement.asset_id),
		eventKind: EVENT_KIND.AGREEMENT_SIGNED,
		actor: user,
		eventSpec: { agreementId, agreementState: updated.agreement_state },
	});
	return { agreement: updated };
}
