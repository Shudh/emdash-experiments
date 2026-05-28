import { sql, type Kysely, type Transaction } from "kysely";

import { CMS_STATUS } from "./constants.js";
import type { DomainRow, DomainStore, InsertRow, ListOptions, UpdateRow } from "./types.js";
import { DomainError } from "./types.js";
import { createSlug } from "./validation.js";

type AnyDb = Record<string, unknown>;

const IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdentifier(value: string, label: string): string {
	if (!IDENTIFIER_PATTERN.test(value)) {
		throw new DomainError(
			"INVALID_IDENTIFIER",
			`${label} is not a safe SQL identifier: ${value}`,
			400,
		);
	}
	return value;
}

function tableName(collection: string): string {
	assertIdentifier(collection, "collection");
	return `ec_${collection}`;
}

function serializeValue(value: unknown): unknown {
	if (value === undefined) return null;
	if (value === null) return null;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (typeof value === "object") return JSON.stringify(value);
	return value;
}

function deserializeValue(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return value;
	}
}

function isDomainRow(row: Record<string, unknown>): row is DomainRow {
	return (
		typeof row.id === "string" &&
		typeof row.slug === "string" &&
		typeof row.status === "string" &&
		(row.author_id === null || typeof row.author_id === "string") &&
		typeof row.created_at === "string" &&
		typeof row.updated_at === "string" &&
		(row.published_at === null || typeof row.published_at === "string") &&
		(row.scheduled_at === null || typeof row.scheduled_at === "string") &&
		(row.deleted_at === null || typeof row.deleted_at === "string") &&
		typeof row.version === "number" &&
		(row.live_revision_id === null || typeof row.live_revision_id === "string") &&
		(row.draft_revision_id === null || typeof row.draft_revision_id === "string")
	);
}

function deserializeRow(row: Record<string, unknown>): DomainRow {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) out[key] = deserializeValue(value);
	if (!isDomainRow(out))
		throw new DomainError("INVALID_ROW", "Database row is missing domain columns", 500);
	return out;
}

const ID_PREFIX_CLEANUP_PATTERN = /[^a-z0-9_]/gi;

function randomId(prefix: string): string {
	const suffix = Math.random().toString(36).slice(2, 10);
	return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}

export class KyselyDomainStore implements DomainStore {
	constructor(private readonly db: Kysely<AnyDb> | Transaction<AnyDb>) {}

	now(): string {
		return new Date().toISOString();
	}

	async insert(collection: string, row: InsertRow): Promise<DomainRow> {
		const tbl = tableName(collection);
		const now = this.now();
		const id =
			typeof row.id === "string"
				? row.id
				: randomId(collection.replace(ID_PREFIX_CLEANUP_PATTERN, ""));
		const title = typeof row.title === "string" ? row.title : id;
		const data: Record<string, unknown> = {
			id,
			slug: typeof row.slug === "string" ? row.slug : createSlug(title, id.slice(-8)),
			status: typeof row.status === "string" ? row.status : CMS_STATUS.DRAFT,
			author_id: typeof row.author_id === "string" ? row.author_id : null,
			created_at: now,
			updated_at: now,
			published_at: row.published_at ?? null,
			scheduled_at: row.scheduled_at ?? null,
			deleted_at: null,
			version: 1,
			live_revision_id: null,
			draft_revision_id: null,
			...row,
		};
		const columns = Object.keys(data).map((column) => assertIdentifier(column, "column"));
		const values = columns.map((column) => serializeValue(data[column]));
		await sql`
      INSERT INTO ${sql.ref(tbl)} (${sql.join(
				columns.map((column) => sql.ref(column)),
				sql`, `,
			)})
      VALUES (${sql.join(values, sql`, `)})
    `.execute(this.db);
		const created = await this.get(collection, id);
		if (!created)
			throw new DomainError("INSERT_FAILED", `Could not read created ${collection}:${id}`, 500);
		return created;
	}

	async get(collection: string, id: string): Promise<DomainRow | null> {
		const tbl = tableName(collection);
		const result = await sql<Record<string, unknown>>`
      SELECT * FROM ${sql.ref(tbl)}
      WHERE id = ${id}
      AND deleted_at IS NULL
      LIMIT 1
    `.execute(this.db);
		const row = result.rows[0];
		return row ? deserializeRow(row) : null;
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
		const tbl = tableName(collection);
		const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
		const orderBy = assertIdentifier(options.orderBy ?? "created_at", "orderBy");
		const direction = options.direction === "desc" ? sql`DESC` : sql`ASC`;
		const clauses = [sql`deleted_at IS NULL`];
		for (const [key, value] of Object.entries(filter)) {
			const column = assertIdentifier(key, "filter column");
			if (Array.isArray(value)) {
				clauses.push(sql`${sql.ref(column)} IN (${sql.join(value.map(serializeValue), sql`, `)})`);
			} else {
				clauses.push(sql`${sql.ref(column)} = ${serializeValue(value)}`);
			}
		}
		const result = await sql<Record<string, unknown>>`
      SELECT * FROM ${sql.ref(tbl)}
      WHERE ${sql.join(clauses, sql` AND `)}
      ORDER BY ${sql.ref(orderBy)} ${direction}, id ${direction}
      LIMIT ${limit}
    `.execute(this.db);
		return result.rows.map((row) => deserializeRow(row));
	}

	async update(collection: string, id: string, patch: UpdateRow): Promise<DomainRow> {
		const tbl = tableName(collection);
		const assignments = Object.entries({ ...patch, updated_at: this.now() })
			.filter(([key]) => key !== "id")
			.map(
				([key, value]) =>
					sql`${sql.ref(assertIdentifier(key, "patch column"))} = ${serializeValue(value)}`,
			);
		assignments.push(sql`version = version + 1`);
		if (!assignments.length) {
			const existing = await this.get(collection, id);
			if (!existing) throw new DomainError("NOT_FOUND", `${collection}:${id} not found`, 404);
			return existing;
		}
		await sql`
      UPDATE ${sql.ref(tbl)}
      SET ${sql.join(assignments, sql`, `)}
      WHERE id = ${id}
      AND deleted_at IS NULL
    `.execute(this.db);
		const updated = await this.get(collection, id);
		if (!updated)
			throw new DomainError("NOT_FOUND", `${collection}:${id} not found after update`, 404);
		return updated;
	}

	async softDelete(collection: string, id: string): Promise<void> {
		const existing = await this.get(collection, id);

		if (!existing) {
			throw new DomainError("NOT_FOUND", `${collection}:${id} not found`, 404);
		}

		const tbl = tableName(collection);
		const now = this.now();

		await sql`
		UPDATE ${sql.ref(tbl)}
		SET deleted_at = ${now},
			updated_at = ${now},
			version = version + 1
		WHERE id = ${id}
		AND deleted_at IS NULL
	`.execute(this.db);
	}

		// Removed trannsactions as d1 failed in prod due to this..
		async transaction<T>(callback: (tx: DomainStore) => Promise<T>): Promise<T> {
		return callback(this);
	}
}
