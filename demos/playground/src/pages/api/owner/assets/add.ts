import type { AddAssetInput } from "../../../../lib/domain/api-contracts.js";
import { addAsset } from "../../../../lib/domain/commands/assets.js";
import { parseJson, route, success } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ request }, store) => {
	const body = await parseJson<AddAssetInput>(request);
	return success(await addAsset(store, body), 201);
});
