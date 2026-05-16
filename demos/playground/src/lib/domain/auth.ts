import { COLLECTIONS } from "./constants.js";
import type { DomainStore, UserContext } from "./types.js";
import { DomainError, asString } from "./types.js";

export function requireUser(user: UserContext | null | undefined): UserContext {
	if (!user?.id) throw new DomainError("UNAUTHORIZED", "Login required", 401);
	return user;
}

export const requireLogin = requireUser;

export async function requireAssetOwner(
	store: DomainStore,
	user: UserContext,
	assetId: string,
): Promise<void> {
	const asset = await store.get(COLLECTIONS.ASSETS, assetId);
	if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	if (asString(asset.owner_user_id) !== user.id)
		throw new DomainError("FORBIDDEN", "Asset owner access required", 403);
}

export async function requireAssetParticipant(
	store: DomainStore,
	user: UserContext,
	assetId: string,
): Promise<void> {
	const asset = await store.get(COLLECTIONS.ASSETS, assetId);
	if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	if (
		asString(asset.owner_user_id) === user.id ||
		asString(asset.active_renter_user_id) === user.id
	)
		return;
	const access = await store.findOne(COLLECTIONS.ASSET_ACCESS, {
		asset_id: assetId,
		user_id: user.id,
		access_state: "active",
	});
	if (!access) throw new DomainError("FORBIDDEN", "Asset participant access required", 403);
}

export async function requireInterestParticipant(
	store: DomainStore,
	user: UserContext,
	interestId: string,
): Promise<void> {
	const interest = await store.get(COLLECTIONS.ASSET_INTERESTS, interestId);
	if (!interest) throw new DomainError("INTEREST_NOT_FOUND", "Interest not found", 404);
	if (
		asString(interest.owner_user_id) === user.id ||
		asString(interest.interested_user_id) === user.id
	)
		return;
	throw new DomainError("FORBIDDEN", "Interest participant access required", 403);
}

export async function requireAgreementParticipant(
	store: DomainStore,
	user: UserContext,
	agreementId: string,
): Promise<void> {
	const agreement = await store.get(COLLECTIONS.AGREEMENT_VERSIONS, agreementId);
	if (!agreement) throw new DomainError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
	if (
		asString(agreement.owner_user_id) === user.id ||
		asString(agreement.renter_user_id) === user.id
	)
		return;
	throw new DomainError("FORBIDDEN", "Agreement participant access required", 403);
}

export async function requireHandoverParticipant(
	store: DomainStore,
	user: UserContext,
	handoverId: string,
): Promise<void> {
	const handover = await store.get(COLLECTIONS.HANDOVER_SESSIONS, handoverId);
	if (!handover) throw new DomainError("HANDOVER_NOT_FOUND", "Handover not found", 404);
	if (asString(handover.owner_user_id) === user.id || asString(handover.renter_user_id) === user.id)
		return;
	throw new DomainError("FORBIDDEN", "Handover participant access required", 403);
}
