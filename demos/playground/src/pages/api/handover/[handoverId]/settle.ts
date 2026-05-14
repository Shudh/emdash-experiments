import { settleHandover } from "../../../../lib/domain/commands/handover.js";
import { requireParam, route, success } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ params }, store) =>
	success(await settleHandover(store, { handoverId: requireParam(params, "handoverId") })),
);
