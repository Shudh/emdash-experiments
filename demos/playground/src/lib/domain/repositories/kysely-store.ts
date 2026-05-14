import { createId } from "../ids.js";
import type {
	AddAssetInput,
	AddRoundInput,
	AgreementTermRecord,
	AgreementVersionRecord,
	AssetConfigItemInput,
	AssetConfigItemRecord,
	AssetInterestRecord,
	AssetRecord,
	ExpressInterestInput,
	HandoverItemCheckRecord,
	HandoverSessionRecord,
	NegotiationRoundRecord,
	RentalDomainStore,
} from "../types.js";

const tables = {
	assets: "ec_rental_assets",
	configItems: "ec_asset_config_items",
	interests: "ec_asset_interest",
	rounds: "ec_negotiation_rounds",
	agreements: "ec_agreement_versions",
	terms: "ec_agreement_terms",
	handovers: "ec_handover_sessions",
	checks: "ec_handover_item_checks",
} as const;

function encode(value: unknown): unknown {
	if (value === undefined) return null;
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	)
		return value;
	return JSON.stringify(value);
}

function decode(row: object): any {
	const decoded: any = { ...row };
	for (const key of [
		"config_spec",
		"condition_spec",
		"terms",
		"printable_snapshot",
		"term_value",
	]) {
		const value = decoded[key];
		if (typeof value === "string") {
			try {
				decoded[key] = JSON.parse(value);
			} catch {
				decoded[key] = value;
			}
		}
	}
	return decoded;
}

export class KyselyRentalDomainStore implements RentalDomainStore {
	constructor(private readonly db: any) {}

	async createAsset(
		input: AddAssetInput & { id: string; now: string; slug: string },
	): Promise<AssetRecord> {
		const row: AssetRecord = {
			id: input.id,
			slug: input.slug,
			status: "draft",
			author_id: input.ownerId,
			title: input.title,
			business_state: "draft_asset",
			visibility_state: "private",
			config_spec: null,
			condition_spec: null,
			created_at: input.now,
			updated_at: input.now,
			published_at: null,
			scheduled_at: null,
			deleted_at: null,
			version: 1,
			locale: "en",
			translation_group: input.id,
		};
		await this.db
			.insertInto(tables.assets)
			.values({
				...row,
				config_spec: encode(row.config_spec),
				condition_spec: encode(row.condition_spec),
			})
			.execute();
		return row;
	}

	async getAsset(assetId: string): Promise<AssetRecord | null> {
		const row = await this.db
			.selectFrom(tables.assets)
			.selectAll()
			.where("id", "=", assetId)
			.executeTakeFirst();
		return row ? decode(row) : null;
	}

	async updateAsset(assetId: string, patch: Partial<AssetRecord>): Promise<AssetRecord> {
		const encoded = Object.fromEntries(
			Object.entries(patch).map(([key, value]) => [key, encode(value)]),
		);
		await this.db.updateTable(tables.assets).set(encoded).where("id", "=", assetId).execute();
		const asset = await this.getAsset(assetId);
		if (!asset) throw new Error(`Asset not found: ${assetId}`);
		return asset;
	}

	async replaceAssetConfigItems(
		assetId: string,
		items: Array<AssetConfigItemInput & { id: string; slug: string; now: string }>,
	): Promise<AssetConfigItemRecord[]> {
		await this.db.deleteFrom(tables.configItems).where("asset_id", "=", assetId).execute();
		const rows: AssetConfigItemRecord[] = items.map((item) => ({
			id: item.id,
			slug: item.slug,
			status: "published",
			asset_id: assetId,
			item_key: item.itemKey,
			label: item.label,
			expected_condition: item.expectedCondition,
			sort_order: item.sortOrder ?? 0,
			created_at: item.now,
			updated_at: item.now,
		}));
		if (rows.length > 0) await this.db.insertInto(tables.configItems).values(rows).execute();
		return rows;
	}

	async listAssetConfigItems(assetId: string): Promise<AssetConfigItemRecord[]> {
		const rows = await this.db
			.selectFrom(tables.configItems)
			.selectAll()
			.where("asset_id", "=", assetId)
			.orderBy("sort_order")
			.execute();
		return rows;
	}

	async createInterest(
		input: ExpressInterestInput & { id: string; now: string; slug: string },
	): Promise<AssetInterestRecord> {
		const row: AssetInterestRecord = {
			id: input.id,
			slug: input.slug,
			status: "published",
			asset_id: input.assetId,
			renter_id: input.renterId,
			interest_state: "open",
			message: input.message ?? "",
			created_at: input.now,
			updated_at: input.now,
		};
		await this.db.insertInto(tables.interests).values(row).execute();
		return row;
	}

	async getInterest(interestId: string): Promise<AssetInterestRecord | null> {
		const row = await this.db
			.selectFrom(tables.interests)
			.selectAll()
			.where("id", "=", interestId)
			.executeTakeFirst();
		return row ?? null;
	}

	async createRound(
		input: AddRoundInput & {
			id: string;
			assetId: string;
			now: string;
			slug: string;
			roundState?: "open" | "accepted" | "closed";
		},
	): Promise<NegotiationRoundRecord> {
		const row: NegotiationRoundRecord = {
			id: input.id,
			slug: input.slug,
			status: "published",
			asset_id: input.assetId,
			interest_id: input.interestId,
			handover_id: input.handoverId ?? null,
			round_phase: input.roundPhase ?? "pre_agreement",
			round_kind: input.roundKind,
			round_state: input.roundState ?? "open",
			actor_id: input.actorId,
			terms: input.terms,
			created_at: input.now,
			updated_at: input.now,
		};
		await this.db
			.insertInto(tables.rounds)
			.values({ ...row, terms: encode(row.terms) })
			.execute();
		return row;
	}

	async listRounds(interestId: string): Promise<NegotiationRoundRecord[]> {
		const rows = await this.db
			.selectFrom(tables.rounds)
			.selectAll()
			.where("interest_id", "=", interestId)
			.orderBy("created_at")
			.execute();
		return rows.map((row: object) => decode(row));
	}

	async createAgreement(input: {
		id: string;
		slug: string;
		now: string;
		assetId: string;
		interestId: string;
		printableSnapshot: unknown;
	}): Promise<AgreementVersionRecord> {
		const row: AgreementVersionRecord = {
			id: input.id,
			slug: input.slug,
			status: "published",
			asset_id: input.assetId,
			interest_id: input.interestId,
			agreement_state: "frozen",
			printable_snapshot: input.printableSnapshot,
			created_at: input.now,
			updated_at: input.now,
		};
		await this.db
			.insertInto(tables.agreements)
			.values({ ...row, printable_snapshot: encode(row.printable_snapshot) })
			.execute();
		return row;
	}

	async createAgreementTerms(
		agreementId: string,
		terms: Record<string, unknown>,
		now: string,
	): Promise<AgreementTermRecord[]> {
		const rows: AgreementTermRecord[] = Object.entries(terms).map(([key, value]) => ({
			id: createId("term"),
			slug: `${agreementId}-${key}`,
			status: "published",
			agreement_id: agreementId,
			term_key: key,
			term_value: encode(value),
			created_at: now,
			updated_at: now,
		}));
		if (rows.length > 0)
			await this.db
				.insertInto(tables.terms)
				.values(rows.map((row) => ({ ...row, term_value: encode(row.term_value) })))
				.execute();
		return rows.map((row: object) => decode(row));
	}

	async listAgreementTerms(agreementId: string): Promise<AgreementTermRecord[]> {
		const rows = await this.db
			.selectFrom(tables.terms)
			.selectAll()
			.where("agreement_id", "=", agreementId)
			.execute();
		return rows.map((row: object) => decode(row));
	}

	async getAgreement(agreementId: string): Promise<AgreementVersionRecord | null> {
		const row = await this.db
			.selectFrom(tables.agreements)
			.selectAll()
			.where("id", "=", agreementId)
			.executeTakeFirst();
		return row ? decode(row) : null;
	}

	async createHandover(input: {
		id: string;
		slug: string;
		now: string;
		assetId: string;
		agreementId: string;
	}): Promise<HandoverSessionRecord> {
		const row: HandoverSessionRecord = {
			id: input.id,
			slug: input.slug,
			status: "published",
			asset_id: input.assetId,
			agreement_id: input.agreementId,
			handover_state: "started",
			created_at: input.now,
			updated_at: input.now,
		};
		await this.db.insertInto(tables.handovers).values(row).execute();
		return row;
	}

	async getHandover(handoverId: string): Promise<HandoverSessionRecord | null> {
		const row = await this.db
			.selectFrom(tables.handovers)
			.selectAll()
			.where("id", "=", handoverId)
			.executeTakeFirst();
		return row ?? null;
	}

	async updateHandover(
		handoverId: string,
		patch: Partial<HandoverSessionRecord>,
	): Promise<HandoverSessionRecord> {
		await this.db.updateTable(tables.handovers).set(patch).where("id", "=", handoverId).execute();
		const handover = await this.getHandover(handoverId);
		if (!handover) throw new Error(`Handover not found: ${handoverId}`);
		return handover;
	}

	async createHandoverChecks(
		handoverId: string,
		items: AssetConfigItemRecord[],
		now: string,
	): Promise<HandoverItemCheckRecord[]> {
		const rows: HandoverItemCheckRecord[] = items.map((item) => ({
			id: createId("check"),
			slug: `${handoverId}-${item.item_key}`,
			status: "published",
			handover_id: handoverId,
			asset_config_item_id: item.id,
			baseline_condition: item.expected_condition,
			return_condition: null,
			dispute_state: null,
			dispute_notes: null,
			created_at: now,
			updated_at: now,
		}));
		if (rows.length > 0) await this.db.insertInto(tables.checks).values(rows).execute();
		return rows;
	}

	async listHandoverChecks(handoverId: string): Promise<HandoverItemCheckRecord[]> {
		const rows = await this.db
			.selectFrom(tables.checks)
			.selectAll()
			.where("handover_id", "=", handoverId)
			.execute();
		return rows;
	}

	async updateHandoverCheck(
		checkId: string,
		patch: Partial<HandoverItemCheckRecord>,
	): Promise<HandoverItemCheckRecord> {
		await this.db.updateTable(tables.checks).set(patch).where("id", "=", checkId).execute();
		const row = await this.db
			.selectFrom(tables.checks)
			.selectAll()
			.where("id", "=", checkId)
			.executeTakeFirst();
		if (!row) throw new Error(`Handover check not found: ${checkId}`);
		return row;
	}

	async listMarketplaceAssets(limit: number): Promise<AssetRecord[]> {
		const rows = await this.db
			.selectFrom(tables.assets)
			.selectAll()
			.where("status", "=", "published")
			.where("business_state", "=", "listed")
			.where("visibility_state", "=", "marketplace")
			.orderBy("published_at", "desc")
			.limit(Math.min(Math.max(limit, 1), 100))
			.execute();
		return rows.map((row: object) => decode(row));
	}
}
