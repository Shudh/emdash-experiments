import { CMS_STATUS } from "./constants.js";
import type { DomainRow, DomainStore, InsertRow, ListOptions, UpdateRow } from "./types.js";
import { DomainError } from "./types.js";
import { createSlug } from "./validation.js";

const ID_PREFIX_CLEANUP_PATTERN = /[^a-z0-9_]/gi;

const SYSTEM_DEFAULTS = {
	status: CMS_STATUS.DRAFT,
	author_id: null,
	published_at: null,
	scheduled_at: null,
	deleted_at: null,
	live_revision_id: null,
	draft_revision_id: null,
};

function isDomainStore(value: unknown): value is DomainStore {
	return (
		!!value &&
		typeof value === "object" &&
		"now" in value &&
		typeof value.now === "function" &&
		"insert" in value &&
		typeof value.insert === "function" &&
		"get" in value &&
		typeof value.get === "function" &&
		"findOne" in value &&
		typeof value.findOne === "function" &&
		"list" in value &&
		typeof value.list === "function" &&
		"update" in value &&
		typeof value.update === "function" &&
		"softDelete" in value &&
		typeof value.softDelete === "function" &&
		"transaction" in value &&
		typeof value.transaction === "function"
	);
}

function sortableValue(value: unknown): string {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
		return String(value);
	return "";
}

function stableId(prefix: string): string {
	const suffix = Math.random().toString(36).slice(2, 10);
	return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}

export class MemoryDomainStore implements DomainStore {
	private readonly rows = new Map<string, Map<string, DomainRow>>();
	private readonly fixedNow?: string;

	constructor(options: { fixedNow?: string } = {}) {
		this.fixedNow = options.fixedNow;
	}

	now(): string {
		return this.fixedNow ?? new Date().toISOString();
	}

	async insert(collection: string, row: InsertRow): Promise<DomainRow> {
		const table = this.table(collection);
		const now = this.now();
		const id =
			typeof row.id === "string"
				? row.id
				: stableId(collection.replace(ID_PREFIX_CLEANUP_PATTERN, ""));
		const title = typeof row.title === "string" ? row.title : id;
		const inserted: DomainRow = {
			id,
			slug: typeof row.slug === "string" ? row.slug : createSlug(title, id.slice(-8)),
			status: typeof row.status === "string" ? row.status : SYSTEM_DEFAULTS.status,
			author_id: typeof row.author_id === "string" ? row.author_id : null,
			created_at: now,
			updated_at: now,
			published_at: null,
			scheduled_at: null,
			deleted_at: null,
			version: 1,
			live_revision_id: null,
			draft_revision_id: null,
			...row,
		};
		table.set(id, inserted);
		return { ...inserted };
	}

	async get(collection: string, id: string): Promise<DomainRow | null> {
		const row = this.table(collection).get(id);
		if (!row || row.deleted_at) return null;
		return { ...row };
	}

	async findOne(collection: string, filter: Record<string, unknown>): Promise<DomainRow | null> {
		const rows = await this.list(collection, filter, { limit: 1 });
		return rows[0] ?? null;
	}

	async list(
		collection: string,
		filter: Record<string, unknown> = {},
		options: ListOptions = {},
	): Promise<DomainRow[]> {
		const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
		const orderBy = options.orderBy ?? "created_at";
		const direction = options.direction ?? "asc";
		const rows = [...this.table(collection).values()]
			.filter((row) => !row.deleted_at)
			.filter((row) =>
				Object.entries(filter).every(([key, value]) => {
					if (Array.isArray(value)) return value.includes(row[key]);
					return row[key] === value;
				}),
			)
			.toSorted((a, b) => {
				const av = sortableValue(a[orderBy]);
				const bv = sortableValue(b[orderBy]);
				return direction === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
			})
			.slice(0, limit)
			.map((row) => ({ ...row }));
		return rows;
	}

	async update(collection: string, id: string, patch: UpdateRow): Promise<DomainRow> {
		const table = this.table(collection);
		const existing = table.get(id);
		if (!existing || existing.deleted_at)
			throw new DomainError("NOT_FOUND", `${collection}:${id} not found`, 404);
		const updated: DomainRow = {
			...existing,
			...patch,
			id: existing.id,
			slug: typeof patch.slug === "string" ? patch.slug : existing.slug,
			updated_at: this.now(),
			version: existing.version + 1,
		};
		table.set(id, updated);
		return { ...updated };
	}

	async softDelete(collection: string, id: string): Promise<void> {
		await this.update(collection, id, { deleted_at: this.now() });
	}

	dump(collection: string): DomainRow[] {
		return Array.from(this.table(collection).values(), (row) => ({ ...row }));
	}

	async transaction<T>(callback: (tx: DomainStore) => Promise<T>): Promise<T> {
		const snapshot = new Map<string, Map<string, DomainRow>>();
		for (const [collection, table] of this.rows.entries()) {
			snapshot.set(
				collection,
				new Map(Array.from(table.entries(), ([id, row]) => [id, { ...row }])),
			);
		}
		try {
			return await callback(this);
		} catch (error) {
			this.rows.clear();
			for (const [collection, table] of snapshot.entries()) {
				this.rows.set(collection, table);
			}
			throw error;
		}
	}

	private table(collection: string): Map<string, DomainRow> {
		let table = this.rows.get(collection);
		if (!table) {
			table = new Map<string, DomainRow>();
			this.rows.set(collection, table);
		}
		return table;
	}
}

export async function withTransaction<T>(
	store: DomainStore,
	callback: (tx: DomainStore) => Promise<T>,
): Promise<T> {
	return store.transaction(callback);
}

export function requireStore(value: unknown): DomainStore {
	if (!isDomainStore(value)) throw new DomainError("STORE_MISSING", "DomainStore is missing", 500);
	return value;
}
