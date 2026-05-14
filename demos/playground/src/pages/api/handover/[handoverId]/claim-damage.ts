import type { ClaimDamageInput } from "../../../../lib/domain/api-contracts.js";
import { claimDamage } from "../../../../lib/domain/commands/handover.js";
import { parseJson, requireParam, route, success } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ params, request }, store) => {
	const handoverId = requireParam(params, "handoverId");
	const body = await parseJson<Omit<ClaimDamageInput, "handoverId">>(request);
	return success(await claimDamage(store, { ...body, handoverId }));
});
