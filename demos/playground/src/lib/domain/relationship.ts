import { ACCESS_ROLE, ACCESS_STATE, COLLECTIONS } from "./constants.js";
import type { DomainRow, DomainStore, UserContext } from "./types.js";
import { DomainError, asString } from "./types.js";

export type AlmRelationshipRole = "anonymous" | "owner" | "applicant" | "renter" | "unrelated";

export type AssetRelationship = {
	role: AlmRelationshipRole;
	asset: DomainRow;
	interest?: DomainRow;
	access?: DomainRow;
};

export type InterestRelationship = {
	role: AlmRelationshipRole;
	interest: DomainRow;
	asset?: DomainRow;
};

export type AgreementRelationship = {
	role: AlmRelationshipRole;
	agreement: DomainRow;
};

export type HandoverRelationship = {
	role: AlmRelationshipRole;
	handover: DomainRow;
};

export async function resolveAssetRelationship(
	store: DomainStore,
	user: UserContext | null | undefined,
	assetId: string,
): Promise<AssetRelationship> {
	const asset = await store.get(COLLECTIONS.ASSETS, assetId);
	if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	if (!user?.id) return { role: "anonymous", asset };
	if (asString(asset.owner_user_id) === user.id) return { role: "owner", asset };
	if (asString(asset.active_renter_user_id) === user.id) return { role: "renter", asset };

	const access = await store.findOne(COLLECTIONS.ASSET_ACCESS, {
		asset_id: assetId,
		user_id: user.id,
		access_state: ACCESS_STATE.ACTIVE,
	});
	if (access && asString(access.access_role) === ACCESS_ROLE.RENTER) {
		return { role: "renter", asset, access };
	}

	const interest = await store.findOne(COLLECTIONS.ASSET_INTERESTS, {
		asset_id: assetId,
		interested_user_id: user.id,
	});
	if (interest) return { role: "applicant", asset, interest };

	return { role: "unrelated", asset };
}

export async function resolveInterestRelationship(
	store: DomainStore,
	user: UserContext | null | undefined,
	interestId: string,
): Promise<InterestRelationship> {
	const interest = await store.get(COLLECTIONS.ASSET_INTERESTS, interestId);
	if (!interest) throw new DomainError("INTEREST_NOT_FOUND", "Interest not found", 404);
	if (!user?.id) return { role: "anonymous", interest };
	if (asString(interest.owner_user_id) === user.id) {
		return {
			role: "owner",
			interest,
			asset: await optionalAsset(store, asString(interest.asset_id)),
		};
	}
	if (asString(interest.interested_user_id) === user.id) {
		const asset = await optionalAsset(store, asString(interest.asset_id));
		return {
			role: asset && asString(asset.active_renter_user_id) === user.id ? "renter" : "applicant",
			interest,
			asset,
		};
	}
	return { role: "unrelated", interest };
}

export async function resolveAgreementRelationship(
	store: DomainStore,
	user: UserContext | null | undefined,
	agreementId: string,
): Promise<AgreementRelationship> {
	const agreement = await store.get(COLLECTIONS.AGREEMENT_VERSIONS, agreementId);
	if (!agreement) throw new DomainError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
	if (!user?.id) return { role: "anonymous", agreement };
	if (asString(agreement.owner_user_id) === user.id) return { role: "owner", agreement };
	if (asString(agreement.renter_user_id) === user.id) return { role: "renter", agreement };
	return { role: "unrelated", agreement };
}

export async function resolveHandoverRelationship(
	store: DomainStore,
	user: UserContext | null | undefined,
	handoverId: string,
): Promise<HandoverRelationship> {
	const handover = await store.get(COLLECTIONS.HANDOVER_SESSIONS, handoverId);
	if (!handover) throw new DomainError("HANDOVER_NOT_FOUND", "Handover not found", 404);
	if (!user?.id) return { role: "anonymous", handover };
	if (asString(handover.owner_user_id) === user.id) return { role: "owner", handover };
	if (asString(handover.renter_user_id) === user.id) return { role: "renter", handover };
	return { role: "unrelated", handover };
}

async function optionalAsset(store: DomainStore, assetId: string): Promise<DomainRow | undefined> {
	if (!assetId) return undefined;
	return (await store.get(COLLECTIONS.ASSETS, assetId)) ?? undefined;
}
