export type Wf1Lane = "public" | "test";

type JsonObject = Record<string, unknown>;

function isObjectRecord(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function objectFromMaybeJson(value: unknown): JsonObject {
	if (isObjectRecord(value)) {
		return value;
	}

	if (typeof value === "string" && value.trim() !== "") {
		try {
			const parsed = JSON.parse(value);
			return isObjectRecord(parsed) ? parsed : {};
		} catch {
			return {};
		}
	}

	return {};
}

export function wf1BasePath(lane: Wf1Lane): string {
	return lane === "test" ? "/test-corridor/wf1" : "/wf1";
}

export function wf1ApiBasePath(lane: Wf1Lane): string {
	return lane === "test" ? "/test-corridor/api/wf1-rental" : "/api/wf1-rental";
}

export function wf1MarketplaceHref(lane: Wf1Lane): string {
	return `${wf1BasePath(lane)}/marketplace`;
}

export function wf1AssetHref(lane: Wf1Lane, assetId: string): string {
	return `${wf1MarketplaceHref(lane)}/assets/${encodeURIComponent(assetId)}`;
}

export function wf1WorkspaceHref(lane: Wf1Lane, workflowInstanceId: string): string {
	return `${wf1BasePath(lane)}/workspaces/${encodeURIComponent(workflowInstanceId)}`;
}

export function wf1RentalApiPath(lane: Wf1Lane, path: string): string {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	return `${wf1ApiBasePath(lane)}${normalizedPath}`;
}

export function wf1LoginHref(redirectTo: string): string {
	return `/login?redirect=${encodeURIComponent(redirectTo)}`;
}

export function testLaneSpecForAsset(asset: JsonObject): JsonObject {
	const configSpec = objectFromMaybeJson(asset.config_spec);
	return objectFromMaybeJson(configSpec.testLane);
}

export function isTestLaneAsset(asset: JsonObject): boolean {
	const testLane = testLaneSpecForAsset(asset);
	return testLane.enabled === true || testLane.enabled === 1;
}

export function isAssetVisibleInLane(asset: JsonObject, lane: Wf1Lane): boolean {
	const testAsset = isTestLaneAsset(asset);

	if (lane === "test") {
		return testAsset;
	}

	return !testAsset;
}

export function filterAssetsForLane<T extends JsonObject>(assets: T[], lane: Wf1Lane): T[] {
	return assets.filter((asset) => isAssetVisibleInLane(asset, lane));
}