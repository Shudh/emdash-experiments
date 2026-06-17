import type { DomainRow } from "../../domain/types.js";
import { asNumber, asString } from "../../domain/types.js";

type JsonObject = Record<string, unknown>;

export type MarketplaceViewerRelationship =
	| "anonymous"
	| "owner"
	| "applicant"
	| "renter"
	| "interested_applicant"
	| "logged_in";

export type MarketplaceViewer = {
	relationship: MarketplaceViewerRelationship;
	role: string;
	canExpressInterest: boolean;
	message?: string;
	interestId?: string;
	interestState?: string;
	workflowInstanceId?: string;
};

type PublicMedia = {
	url: string;
	filename: string;
	mimeType: string;
	kind: string;
	isImage: boolean;
};

const PUBLIC_CONFIG_KEYS = new Set([
	"bedrooms",
	"bathrooms",
	"balconies",
	"furnishing",
	"propertyType",
	"property_type",
	"builtUpAreaSqft",
	"built_up_area_sqft",
	"carpetAreaSqft",
	"carpet_area_sqft",
	"superBuiltUpSqft",
	"super_built_up_sqft",
	"floor",
	"totalFloors",
	"total_floors",
	"facing",
	"parking",
	"availableFrom",
	"available_from",
	"propertyAge",
	"property_age",
	"kitchen",
]);

const PUBLIC_OWNER_CONDITION_KEYS = new Set([
	"depositPolicy",
	"deposit_policy",
	"maintenancePolicy",
	"maintenance_policy",
	"petPolicy",
	"pet_policy",
	"paintingPolicy",
	"painting_policy",
	"moveInPolicy",
	"move_in_policy",
	"moveOutPolicy",
	"move_out_policy",
	"utilityPolicy",
	"utility_policy",
	"houseRules",
	"house_rules",
	"notes",
	"documentsRequired",
	"documents_required",
]);

const PUBLIC_QUESTION_KINDS = new Set([
	"text",
	"textarea",
	"phone",
	"email",
	"date",
	"number",
	"single_choice",
]);

function isObjectRecord(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function objectValue(value: unknown): JsonObject {
	if (isObjectRecord(value)) return value;

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

function stringOrNull(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function numberOrNull(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;

	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

function booleanOrNull(value: unknown): boolean | null {
	if (typeof value === "boolean") return value;
	return null;
}

function safeScalar(value: unknown): string | number | boolean | null | undefined {
	return stringOrNull(value) ?? numberOrNull(value) ?? booleanOrNull(value) ?? undefined;
}

function safeScalarArray(value: unknown): Array<string | number | boolean> | undefined {
	if (!Array.isArray(value)) return undefined;

	const normalized = value
		.map((entry) => safeScalar(entry))
		.filter((entry): entry is string | number | boolean => entry !== undefined && entry !== null);

	return normalized.length ? normalized : undefined;
}

function safeDisplayValue(value: unknown): string | number | boolean | Array<string | number | boolean> | undefined {
	const scalar = safeScalar(value);

	if (scalar !== undefined && scalar !== null) {
		return scalar;
	}

	const scalarArray = safeScalarArray(value);

	if (scalarArray !== undefined) {
		return scalarArray;
	}

	return undefined;
}

function storageKeyToMediaUrl(storageKey: string): string {
	return `/_emdash/api/media/file/${storageKey
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/")}`;
}

function publicMediaFrom(value: unknown): PublicMedia | null {
	if (!isObjectRecord(value)) return null;

	const rawUrl = stringOrNull(value.url);
	const rawStorageKey = stringOrNull(value.storageKey) ?? stringOrNull(value.storage_key);
	const url = rawUrl ?? (rawStorageKey ? storageKeyToMediaUrl(rawStorageKey) : null);

	if (!url) return null;

	const mimeType = stringOrNull(value.mimeType) ?? stringOrNull(value.mime_type) ?? "";
	const filename = stringOrNull(value.filename) ?? stringOrNull(value.name) ?? "Asset media";
	const kind = stringOrNull(value.kind) ?? "asset_media";

	return {
		url,
		filename,
		mimeType,
		kind,
		isImage: mimeType.startsWith("image/"),
	};
}

function uniqueMedia(items: PublicMedia[]): PublicMedia[] {
	const seen = new Set<string>();
	const result: PublicMedia[] = [];

	for (const item of items) {
		if (seen.has(item.url)) continue;
		seen.add(item.url);
		result.push(item);
	}

	return result;
}

export function publicMediaForAsset(asset: DomainRow): PublicMedia[] {
	const config = objectValue(asset.config_spec);
	const refs: unknown[] = [];

	if (config.thumbnailMediaRef) refs.push(config.thumbnailMediaRef);

	if (Array.isArray(config.mediaRefs)) {
		refs.push(...config.mediaRefs);
	}

	return uniqueMedia(
		refs
			.map((entry) => publicMediaFrom(entry))
			.filter((entry): entry is PublicMedia => entry !== null),
	);
}

export function publicConfigForAsset(asset: DomainRow): JsonObject {
	const config = objectValue(asset.config_spec);
	const publicConfig: JsonObject = {};

	for (const [key, value] of Object.entries(config)) {
		if (!PUBLIC_CONFIG_KEYS.has(key)) continue;

		const safeValue = safeDisplayValue(value);

		if (safeValue !== undefined) {
			publicConfig[key] = safeValue;
		}
	}

	return publicConfig;
}

export function publicConditionForAsset(asset: DomainRow): JsonObject {
	const condition = objectValue(asset.condition_spec);
	const publicCondition: JsonObject = {};

	for (const [key, value] of Object.entries(condition)) {
		const safeValue = safeDisplayValue(value);

		if (safeValue !== undefined) {
			publicCondition[key] = safeValue;
		}
	}

	return publicCondition;
}

function publicDocumentRequirement(value: unknown): JsonObject | string | null {
	if (typeof value === "string" && value.trim() !== "") return value.trim();

	if (!isObjectRecord(value)) return null;

	const result: JsonObject = {};
	const label = stringOrNull(value.label) ?? stringOrNull(value.key);
	const description = stringOrNull(value.description);
	const required = typeof value.required === "boolean" ? value.required : undefined;
	const attachmentRequired =
		typeof value.attachmentRequired === "boolean"
			? value.attachmentRequired
			: typeof value.attachment_required === "boolean"
				? value.attachment_required
				: undefined;

	if (label) result.label = label;
	if (description) result.description = description;
	if (required !== undefined) result.required = required;
	if (attachmentRequired !== undefined) result.attachmentRequired = attachmentRequired;

	return Object.keys(result).length ? result : null;
}

function publicDocuments(value: unknown): Array<JsonObject | string> | undefined {
	if (!Array.isArray(value)) return undefined;

	const documents = value
		.map((entry) => publicDocumentRequirement(entry))
		.filter((entry): entry is JsonObject | string => entry !== null);

	return documents.length ? documents : undefined;
}

export function publicOwnerConditionsForAsset(asset: DomainRow): { spec: JsonObject } {
	const spec = objectValue(asset.owner_conditions_spec);
	const publicSpec: JsonObject = {};

	for (const [key, value] of Object.entries(spec)) {
		if (!PUBLIC_OWNER_CONDITION_KEYS.has(key)) continue;

		if (key === "documentsRequired" || key === "documents_required") {
			const documents = publicDocuments(value);
			if (documents !== undefined) {
				publicSpec.documentsRequired = documents;
			}
			continue;
		}

		const safeValue = safeDisplayValue(value);

		if (safeValue !== undefined) {
			publicSpec[key] = safeValue;
		}
	}

	return { spec: publicSpec };
}

function normalizedQuestionKind(value: unknown): string {
	const kind = stringOrNull(value) ?? "text";
	return PUBLIC_QUESTION_KINDS.has(kind) ? kind : "text";
}

function normalizedQuestion(value: unknown): JsonObject | null {
	if (!isObjectRecord(value)) return null;

	const key = stringOrNull(value.key);
	const label = stringOrNull(value.label);

	if (!key || !label) return null;

	const question: JsonObject = {
		key,
		label,
		kind: normalizedQuestionKind(value.kind),
		required: value.required === false ? false : true,
	};

	const target = stringOrNull(value.target);
	const placeholder = stringOrNull(value.placeholder);
	const options = safeScalarArray(value.options)?.map(String) ?? [];

	if (target) question.target = target;
	if (placeholder) question.placeholder = placeholder;
	if (options.length) question.options = options;

	return question;
}

function normalizedPrescreenQuestions(asset: DomainRow): JsonObject[] {
	const spec = objectValue(asset.owner_conditions_spec);
	const rawQuestions = Array.isArray(spec.preScreenQuestions) ? spec.preScreenQuestions : [];

	return rawQuestions
		.map((entry) => normalizedQuestion(entry))
		.filter((entry): entry is JsonObject => entry !== null);
}

export function marketplaceApplicationContextForAsset(asset: DomainRow): JsonObject {
	return {
		acceptedConditionsVersion: asNumber(asset.conditions_version, 0),
		acceptedConditionsHash: asString(asset.conditions_hash),
		prescreenQuestions: normalizedPrescreenQuestions(asset),
	};
}

export function publicMarketplaceAssetForAsset(asset: DomainRow, viewer: MarketplaceViewer): JsonObject {
	const media = publicMediaForAsset(asset);
	const thumbnail = media[0] ?? null;

	return {
		id: asset.id,
		slug: asString(asset.slug),
		status: asString(asset.status),
		title: asString(asset.title, "Untitled asset"),
		asset_kind: asString(asset.asset_kind, "asset"),
		location_label: asset.location_label ?? null,
		public_price: numberOrNull(asset.public_price),
		currency: asString(asset.currency, "INR"),
		minimum_months: numberOrNull(asset.minimum_months),
		business_state: asString(asset.business_state),
		visibility_state: asString(asset.visibility_state),
		published_at: asset.published_at ?? null,
		created_at: asset.created_at,
		updated_at: asset.updated_at,
		config_spec: publicConfigForAsset(asset),
		condition_spec: publicConditionForAsset(asset),
		thumbnail,
		photos: media.filter((entry) => entry.isImage),
		media,
		viewer,
	};
}
