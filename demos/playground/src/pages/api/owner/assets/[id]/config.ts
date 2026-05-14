import type { UpdateAssetConfigInput } from "../../../../../lib/domain/api-contracts.js";
import { updateAssetConfig } from "../../../../../lib/domain/commands/assets.js";
import { parseJson, requireParam, route, success } from "../../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ params, request }, store) => {
	const assetId = requireParam(params, "id");
	const body = await parseJson<Omit<UpdateAssetConfigInput, "assetId">>(request);
	return success(await updateAssetConfig(store, { ...body, assetId }));
});
