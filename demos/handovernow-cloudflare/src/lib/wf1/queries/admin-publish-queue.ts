import type { DomainRow, DomainStore, UserContext } from "../../domain/types.js";
import { asJsonObject, asNumber, asString, DomainError } from "../../domain/types.js";
import { assertWf1Superadmin, marketplaceReviewSnapshot } from "../core/marketplace-review.js";
import { filterAssetsForLane, isAssetVisibleInLane, wf1AssetHref, type Wf1Lane } from "../routing/lane.js";
import { WF_ASSET_STATE, WF_VISIBILITY, WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";

export type AdminMediaPreview = {
	id: string;
	label: string;
	url: string;
	filename: string;
	mimeType: string;
	kind: string;
	source: string;
	storageKey: string;
};

export type AdminFact = {
	label: string;
	value: string;
};

export type AdminConfigItemSummary = {
	id: string;
	label: string;
	kind: string;
	room: string;
	quantity: string;
	state: string;
};

export type AdminPublishQueueItem = {
	asset: DomainRow;
	review: ReturnType<typeof marketplaceReviewSnapshot>;
	summary: {
		title: string;
		locationLabel: string;
		publicPrice: number | null;
		currency: string;
		assetKind: string;
		ownerUserId: string;
		adminHref: string;
		marketplaceHref: string;
		mediaCount: number;
		configItemCount: number;
	};
	facts: AdminFact[];
	mediaPreviews: AdminMediaPreview[];
	riskFlags: string[];
	events: DomainRow[];
	configItems: DomainRow[];
	configItemSummaries: AdminConfigItemSummary[];
};

export type AdminPublishQueueResult = {
	items: AdminPublishQueueItem[];
	counts: {
		pending: number;
		candidateAssets: number;
		loadedEvents: number;
	};
	generatedAt: string;
};

export async function listAdminPublishQueue(
	store: DomainStore,
	user: UserContext,
	options: { lane?: Wf1Lane; limit?: number } = {},
): Promise<AdminPublishQueueResult> {
	assertWf1Superadmin(user);

	const lane = options.lane ?? "public";
	const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 300);

	const [assets, events, configItems] = await Promise.all([
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSETS,
			{},
			{ orderBy: "created_at", direction: "desc", limit: 500 },
		),
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_EVENTS,
			{},
			{ orderBy: "created_at", direction: "desc", limit: 5000 },
		),
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_CONFIG_ITEMS,
			{},
			{ orderBy: "created_at", direction: "desc", limit: 5000 },
		),
	]);

	const visibleAssets = filterAssetsForLane(assets, lane).filter(isReviewCandidate);
	const eventsByAsset = groupBy(events, (event) => asString(event.asset_id));
	const configItemsByAsset = groupBy(configItems, (item) => asString(item.asset_id));

	const items = visibleAssets
		.map((asset): AdminPublishQueueItem | null => {
			const assetEvents = eventsByAsset.get(asset.id) ?? [];
			const review = marketplaceReviewSnapshot(assetEvents);

			if (review.state !== "requested") {
				return null;
			}

			return buildAdminPublishQueueItem(asset, assetEvents, configItemsByAsset.get(asset.id) ?? [], lane);
		})
		.filter((item): item is AdminPublishQueueItem => item !== null)
		.toSorted((left, right) => timestamp(right.review.requestedAt) - timestamp(left.review.requestedAt))
		.slice(0, limit);

	return {
		items,
		counts: {
			pending: items.length,
			candidateAssets: visibleAssets.length,
			loadedEvents: events.length,
		},
		generatedAt: store.now(),
	};
}

export async function getAdminPublishQueueAsset(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	options: { lane?: Wf1Lane } = {},
): Promise<AdminPublishQueueItem> {
	assertWf1Superadmin(user);

	const lane = options.lane ?? "public";
	const asset = await store.get(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId);

	if (!asset || !isAssetVisibleInLane(asset, lane)) {
		throw new DomainError("ASSET_NOT_FOUND", "Admin review asset was not found in this lane", 404);
	}

	const [events, configItems] = await Promise.all([
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_EVENTS,
			{ asset_id: asset.id },
			{ orderBy: "created_at", direction: "desc", limit: 100 },
		),
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_CONFIG_ITEMS,
			{ asset_id: asset.id },
			{ orderBy: "created_at", direction: "asc", limit: 500 },
		),
	]);

	return buildAdminPublishQueueItem(asset, events, configItems, lane);
}

function buildAdminPublishQueueItem(
	asset: DomainRow,
	events: DomainRow[],
	configItems: DomainRow[],
	lane: Wf1Lane,
): AdminPublishQueueItem {
	const review = marketplaceReviewSnapshot(events);
	const configSpec = asJsonObject(asset.config_spec);
	const mediaPreviews = mediaPreviewsForAsset(asset, configItems);
	const summary = summaryForAsset(asset, configItems, mediaPreviews, lane);
	const facts = factsForAsset(asset, configSpec);
	const configItemSummaries = configItems.map(configItemSummary);
	const riskFlags = riskFlagsForAsset(asset, configItems, summary, mediaPreviews);

	return {
		asset,
		review,
		summary,
		facts,
		mediaPreviews,
		riskFlags,
		events: events.slice(0, 12),
		configItems,
		configItemSummaries,
	};
}

function isReviewCandidate(asset: DomainRow): boolean {
	const businessState = asString(asset.business_state);
	const visibilityState = asString(asset.visibility_state);

	return (
		visibilityState !== WF_VISIBILITY.MARKETPLACE &&
		(businessState === WF_ASSET_STATE.DRAFT_ASSET || businessState === WF_ASSET_STATE.LISTED)
	);
}

function summaryForAsset(
	asset: DomainRow,
	configItems: DomainRow[],
	mediaPreviews: AdminMediaPreview[],
	lane: Wf1Lane,
): AdminPublishQueueItem["summary"] {
	const publicPrice = asNumber(asset.public_price, Number.NaN);

	return {
		title: asString(asset.title, "Untitled asset"),
		locationLabel: asString(asset.location_label, "Location not set"),
		publicPrice: Number.isFinite(publicPrice) ? publicPrice : null,
		currency: asString(asset.currency, "INR"),
		assetKind: asString(asset.asset_kind, "asset"),
		ownerUserId: asString(asset.owner_user_id),
		adminHref: `/test-corridor/wf1/admin/assets/${encodeURIComponent(asset.id)}`,
		marketplaceHref: wf1AssetHref(lane, asset.id),
		mediaCount: mediaPreviews.length,
		configItemCount: configItems.length,
	};
}

function factsForAsset(asset: DomainRow, configSpec: Record<string, unknown>): AdminFact[] {
	const facts: AdminFact[] = [];
	addFact(facts, "Price", priceLabel(asset));
	addFact(facts, "Location", asString(asset.location_label));
	addFact(facts, "Asset kind", humanize(asString(asset.asset_kind)));
	addFact(facts, "Bedrooms", valueLabel(configSpec.bedrooms));
	addFact(facts, "Furnishing", humanize(valueLabel(configSpec.furnishing)));
	addFact(facts, "Minimum months", valueLabel(asset.minimum_months));

	const conditionSpec = asJsonObject(asset.condition_spec);
	for (const [key, value] of Object.entries(conditionSpec)) {
		if (technicalFactKey(key)) continue;
		addFact(facts, humanize(key), humanize(valueLabel(value)));
	}

	return facts;
}

function priceLabel(asset: DomainRow): string {
	const price = asNumber(asset.public_price, Number.NaN);
	if (!Number.isFinite(price) || price <= 0) return "";
	return `${asString(asset.currency, "INR")} ${price}`;
}

function configItemSummary(item: DomainRow): AdminConfigItemSummary {
	return {
		id: item.id,
		label: asString(item.item_label, "Inventory item"),
		kind: humanize(asString(item.item_kind, "item")),
		room: humanize(asString(item.room_group)),
		quantity: valueLabel(item.quantity) || "1",
		state: humanize(asString(item.owner_declared_state)),
	};
}

function mediaPreviewsForAsset(asset: DomainRow, configItems: DomainRow[]): AdminMediaPreview[] {
	const previews: AdminMediaPreview[] = [];
	const configSpec = asJsonObject(asset.config_spec);

	pushMediaRef(previews, configSpec.thumbnailMediaRef, "Primary media", "asset.thumbnailMediaRef");

	const mediaRefs = Array.isArray(configSpec.mediaRefs) ? configSpec.mediaRefs : [];
	for (const [index, mediaRef] of mediaRefs.entries()) {
		pushMediaRef(previews, mediaRef, index === 0 ? "Asset media" : `Asset media ${index + 1}`, "asset.mediaRefs");
	}

	for (const item of configItems) {
		const label = asString(item.item_label, "Inventory item");
		const itemSpec = asJsonObject(item.item_spec);
		const conditionSpec = asJsonObject(item.condition_spec);
		pushMediaRef(previews, itemSpec.mediaRef, `${label} media`, "config.item_spec.mediaRef");
		pushMediaRef(previews, conditionSpec.mediaRef, `${label} condition media`, "config.condition_spec.mediaRef");

		const itemMediaRefs = Array.isArray(itemSpec.mediaRefs) ? itemSpec.mediaRefs : [];
		for (const [index, mediaRef] of itemMediaRefs.entries()) {
			pushMediaRef(previews, mediaRef, `${label} media ${index + 1}`, "config.item_spec.mediaRefs");
		}
	}

	return dedupeMedia(previews).slice(0, 12);
}

function pushMediaRef(
	previews: AdminMediaPreview[],
	value: unknown,
	label: string,
	source: string,
): void {
	const ref = asJsonObject(value);
	const url = asString(ref.url);
	const storageKey = asString(ref.storageKey);
	const id = asString(ref.uploadId) || asString(ref.mediaId) || storageKey || url;

	if (!url && !storageKey) return;

	previews.push({
		id,
		label,
		url: url || (storageKey ? `/_emdash/api/media/file/${storageKey}` : ""),
		filename: asString(ref.filename),
		mimeType: asString(ref.mimeType),
		kind: asString(ref.kind),
		source,
		storageKey,
	});
}

function dedupeMedia(previews: AdminMediaPreview[]): AdminMediaPreview[] {
	const seen = new Set<string>();
	const result: AdminMediaPreview[] = [];

	for (const preview of previews) {
		const key = preview.storageKey || preview.url || preview.id;
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(preview);
	}

	return result;
}

function riskFlagsForAsset(
	asset: DomainRow,
	configItems: DomainRow[],
	summary: AdminPublishQueueItem["summary"],
	mediaPreviews: AdminMediaPreview[],
): string[] {
	const flags: string[] = [];

	if (!summary.title || summary.title === "Untitled asset" || summary.title.trim().length < 6) {
		flags.push("title looks weak");
	}

	if (!summary.locationLabel || summary.locationLabel === "Location not set") {
		flags.push("location missing");
	}

	if (summary.publicPrice === null || summary.publicPrice <= 0) {
		flags.push("price missing");
	}

	if (!mediaPreviews.length) {
		flags.push("no primary media");
	}

	if (!configItems.length) {
		flags.push("no inventory/config items");
	}

	if (asString(asset.visibility_state) === WF_VISIBILITY.PRIVATE) {
		flags.push("currently private");
	}

	return flags;
}

function addFact(facts: AdminFact[], label: string, value: string): void {
	if (!value.trim()) return;
	facts.push({ label, value });
}

function valueLabel(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (typeof value === "boolean") return value ? "Yes" : "No";
	return "";
}

function humanize(value: string): string {
	return value
		.replaceAll("_", " ")
		.replaceAll("-", " ")
		.trim()
		.replace(/\s+/g, " ")
		.replace(/^./, (first) => first.toUpperCase());
}

function technicalFactKey(key: string): boolean {
	return [
		"thumbnailMediaRef",
		"mediaRefs",
		"draftId",
		"testLane",
		"storageKey",
		"uploadId",
		"mediaId",
	].includes(key);
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
	const grouped = new Map<string, T[]>();

	for (const item of items) {
		const key = keyFor(item);
		if (!key) continue;
		const existing = grouped.get(key) ?? [];
		existing.push(item);
		grouped.set(key, existing);
	}

	return grouped;
}

function timestamp(value: string | null): number {
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}
