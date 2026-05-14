import { getDb } from "emdash/runtime";

import { KyselyRentalDomainStore } from "./repositories/kysely-store.js";
import type { RentalDomainStore } from "./types.js";

export type EmDashLikeLocals = {
	emdash?: {
		db?: unknown;
	};
};

export async function getRentalDomainStore(locals?: EmDashLikeLocals): Promise<RentalDomainStore> {
	const db = locals?.emdash?.db ?? (await getDb());
	return new KyselyRentalDomainStore(db);
}
