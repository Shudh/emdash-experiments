import { DomainError, assertFound } from "../errors.js";
import { createId, nowIso } from "../ids.js";
import type { ExpressInterestInput, RentalDomainStore } from "../types.js";

export async function expressInterest(store: RentalDomainStore, input: ExpressInterestInput) {
	const asset = assertFound(
		await store.getAsset(input.assetId),
		"ASSET_NOT_FOUND",
		"Asset not found",
	);
	if (
		asset.status !== "published" ||
		asset.business_state !== "listed" ||
		asset.visibility_state !== "marketplace"
	) {
		throw new DomainError(
			"ASSET_NOT_MARKETPLACE_VISIBLE",
			"Asset is not available in the marketplace",
		);
	}
	const now = nowIso();
	return store.createInterest({
		...input,
		id: createId("interest"),
		slug: `${asset.slug}-${input.renterId}`,
		now,
	});
}
