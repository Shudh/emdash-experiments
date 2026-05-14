import type { RentalDomainStore } from "../types.js";

export async function listMarketplaceAssets(store: RentalDomainStore, limit = 50) {
	return { items: await store.listMarketplaceAssets(Math.min(Math.max(limit, 1), 100)) };
}
