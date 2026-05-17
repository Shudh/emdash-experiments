import { COLLECTIONS, HANDOVER_STATE } from "./constants.js";
import type { DomainRow, DomainStore } from "./types.js";
import { asString } from "./types.js";

export type LifecycleContext = {
	activeAgreement?: DomainRow;
	activeHandover?: DomainRow;
	disputedCheckCount: number;
};

export async function loadAssetLifecycleContext(
	store: DomainStore,
	asset: DomainRow,
): Promise<LifecycleContext> {
	const activeAgreementId = asString(asset.active_agreement_id);
	const activeHandoverId = asString(asset.active_handover_id);
	const activeAgreement = activeAgreementId
		? ((await store.get(COLLECTIONS.AGREEMENT_VERSIONS, activeAgreementId)) ?? undefined)
		: undefined;
	const loadedHandover = activeHandoverId
		? ((await store.get(COLLECTIONS.HANDOVER_SESSIONS, activeHandoverId)) ?? undefined)
		: undefined;
	const loadedHandoverState = asString(loadedHandover?.handover_state);
	const activeHandover =
		loadedHandover &&
		loadedHandoverState !== HANDOVER_STATE.ACCEPTED &&
		loadedHandoverState !== HANDOVER_STATE.CLOSED
			? loadedHandover
			: undefined;
	const disputedCheckCount = activeHandover
		? (
				await store.list(COLLECTIONS.HANDOVER_ITEM_CHECKS, {
					handover_id: activeHandover.id,
					dispute_state: "disputed",
				})
			).length
		: 0;
	return { activeAgreement, activeHandover, disputedCheckCount };
}

export function hasOpenHandover(context: LifecycleContext): boolean {
	return !!context.activeHandover && asString(context.activeHandover.handover_state) !== HANDOVER_STATE.CLOSED;
}
