import type { AcceptFinalTermsInput } from "../../../../lib/domain/api-contracts.js";
import { acceptFinalTerms } from "../../../../lib/domain/commands/negotiations.js";
import { parseJson, requireParam, route, success } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ params, request }, store) => {
	const interestId = requireParam(params, "interestId");
	const body = await parseJson<Omit<AcceptFinalTermsInput, "interestId">>(request);
	return success(await acceptFinalTerms(store, { ...body, interestId }));
});
