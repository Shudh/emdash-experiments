export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = unknown;
export type JsonObject = Record<string, unknown>;

export type UserContext = {
	id: string;
	email?: string;
	role?: string;
	name?: string;
};

export type DomainRow = {
	id: string;
	slug: string;
	status: string;
	author_id: string | null;
	created_at: string;
	updated_at: string;
	published_at: string | null;
	scheduled_at: string | null;
	deleted_at: string | null;
	version: number;
	live_revision_id: string | null;
	draft_revision_id: string | null;
	[key: string]: unknown;
};

export type InsertRow = Record<string, unknown> & {
	slug?: string;
	status?: string;
	author_id?: string | null;
};

export type UpdateRow = Record<string, unknown>;

export type ListOptions = {
	orderBy?: string;
	direction?: "asc" | "desc";
	limit?: number;
};

export type DomainStore = {
	now(): string;
	insert(collection: string, row: InsertRow): Promise<DomainRow>;
	get(collection: string, id: string): Promise<DomainRow | null>;
	findOne(collection: string, filter: Record<string, unknown>): Promise<DomainRow | null>;
	list(
		collection: string,
		filter?: Record<string, unknown>,
		options?: ListOptions,
	): Promise<DomainRow[]>;
	update(collection: string, id: string, patch: UpdateRow): Promise<DomainRow>;
	softDelete(collection: string, id: string): Promise<void>;
	transaction<T>(callback: (tx: DomainStore) => Promise<T>): Promise<T>;
};

export class DomainError extends Error {
	public readonly code: string;
	public readonly status: number;

	constructor(code: string, message: string, status = 400, options?: ErrorOptions) {
		super(message, options);
		this.name = "DomainError";
		this.code = code;
		this.status = status;
	}
}

export function assertRecord(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new DomainError("INVALID_RECORD", `${label} must be an object`, 400);
	}
	return Object.fromEntries(Object.entries(value));
}

export function asString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asNullableString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function asJsonObject(value: unknown): JsonObject {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value));
}
