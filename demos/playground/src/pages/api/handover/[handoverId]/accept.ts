import { acceptHandover } from "../../../../lib/domain/commands/handover.js";
import { requireParam, route, success } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ params }, store) =>
	success(await acceptHandover(store, { handoverId: requireParam(params, "handoverId") })),
);
