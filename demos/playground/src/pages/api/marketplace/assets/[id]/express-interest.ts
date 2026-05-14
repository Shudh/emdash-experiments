import type { ExpressInterestInput } from "../../../../../lib/domain/api-contracts.js";
import { expressInterest } from "../../../../../lib/domain/commands/interests.js";
import { parseJson, requireParam, route, success } from "../../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ params, request }, store) => {
	const assetId = requireParam(params, "id");
	const body = await parseJson<Omit<ExpressInterestInput, "assetId">>(request);
	return success(await expressInterest(store, { ...body, assetId }), 201);
});
