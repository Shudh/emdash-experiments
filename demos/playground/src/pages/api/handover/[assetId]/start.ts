import type { StartHandoverInput } from "../../../../lib/domain/api-contracts.js";
import { startHandover } from "../../../../lib/domain/commands/handover.js";
import { parseJson, requireParam, route, success } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ params, request }, store) => {
	const assetId = requireParam(params, "assetId");
	const body = await parseJson<Omit<StartHandoverInput, "assetId">>(request);
	return success(await startHandover(store, { ...body, assetId }), 201);
});
