import type { AddRoundInput } from "../../../../lib/domain/api-contracts.js";
import { addNegotiationRound } from "../../../../lib/domain/commands/negotiations.js";
import { parseJson, requireParam, route, success } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ params, request }, store) => {
	const interestId = requireParam(params, "interestId");
	const body = await parseJson<Omit<AddRoundInput, "interestId">>(request);
	return success(await addNegotiationRound(store, { ...body, interestId }), 201);
});
