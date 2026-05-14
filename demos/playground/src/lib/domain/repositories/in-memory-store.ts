import { createId } from "../ids.js";
import type {
	AddAssetInput,
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
	AddRoundInput,
} from "../types.js";

function clone<T>(value: T): T {
	return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

export class InMemoryRentalDomainStore implements RentalDomainStore {
	assets = new Map<string, AssetRecord>();
	configItems = new Map<string, AssetConfigItemRecord>();
	interests = new Map<string, AssetInterestRecord>();
	rounds = new Map<string, NegotiationRoundRecord>();
	agreements = new Map<string, AgreementVersionRecord>();
	terms = new Map<string, AgreementTermRecord>();
	handovers = new Map<string, HandoverSessionRecord>();
	checks = new Map<string, HandoverItemCheckRecord>();

	async createAsset(
		input: AddAssetInput & { id: string; now: string; slug: string },
	): Promise<AssetRecord> {
		const asset: AssetRecord = {
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
		this.assets.set(asset.id, clone(asset));
		return clone(asset);
	}

	async getAsset(assetId: string): Promise<AssetRecord | null> {
		return clone(this.assets.get(assetId) ?? null);
	}

	async updateAsset(assetId: string, patch: Partial<AssetRecord>): Promise<AssetRecord> {
		const current = this.assets.get(assetId);
		if (!current) throw new Error(`Asset not found: ${assetId}`);
		const next = { ...current, ...clone(patch) };
		this.assets.set(assetId, clone(next));
		return clone(next);
	}

	async replaceAssetConfigItems(
		assetId: string,
		items: Array<AssetConfigItemInput & { id: string; slug: string; now: string }>,
	): Promise<AssetConfigItemRecord[]> {
		for (const [id, item] of this.configItems) {
			if (item.asset_id === assetId) this.configItems.delete(id);
		}
		const records = items.map((item) => ({
			id: item.id,
			slug: item.slug,
			status: "published" as const,
			asset_id: assetId,
			item_key: item.itemKey,
			label: item.label,
			expected_condition: item.expectedCondition,
			sort_order: item.sortOrder ?? 0,
			created_at: item.now,
			updated_at: item.now,
		}));
		for (const record of records) this.configItems.set(record.id, clone(record));
		return clone(records);
	}

	async listAssetConfigItems(assetId: string): Promise<AssetConfigItemRecord[]> {
		return clone(
			[...this.configItems.values()]
				.filter((item) => item.asset_id === assetId)
				.toSorted((a, b) => a.sort_order - b.sort_order),
		);
	}

	async createInterest(
		input: ExpressInterestInput & { id: string; now: string; slug: string },
	): Promise<AssetInterestRecord> {
		const record: AssetInterestRecord = {
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
		this.interests.set(record.id, clone(record));
		return clone(record);
	}

	async getInterest(interestId: string): Promise<AssetInterestRecord | null> {
		return clone(this.interests.get(interestId) ?? null);
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
		const record: NegotiationRoundRecord = {
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
			terms: clone(input.terms),
			created_at: input.now,
			updated_at: input.now,
		};
		this.rounds.set(record.id, clone(record));
		return clone(record);
	}

	async listRounds(interestId: string): Promise<NegotiationRoundRecord[]> {
		return clone(
			[...this.rounds.values()]
				.filter((round) => round.interest_id === interestId)
				.toSorted((a, b) => a.created_at.localeCompare(b.created_at)),
		);
	}

	async createAgreement(input: {
		id: string;
		slug: string;
		now: string;
		assetId: string;
		interestId: string;
		printableSnapshot: unknown;
	}): Promise<AgreementVersionRecord> {
		const record: AgreementVersionRecord = {
			id: input.id,
			slug: input.slug,
			status: "published",
			asset_id: input.assetId,
			interest_id: input.interestId,
			agreement_state: "frozen",
			printable_snapshot: clone(input.printableSnapshot),
			created_at: input.now,
			updated_at: input.now,
		};
		this.agreements.set(record.id, clone(record));
		return clone(record);
	}

	async createAgreementTerms(
		agreementId: string,
		terms: Record<string, unknown>,
		now: string,
	): Promise<AgreementTermRecord[]> {
		const records = Object.entries(terms).map(([key, value]) => ({
			id: createId("term"),
			slug: `${agreementId}-${key}`,
			status: "published" as const,
			agreement_id: agreementId,
			term_key: key,
			term_value: clone(value),
			created_at: now,
			updated_at: now,
		}));
		for (const record of records) this.terms.set(record.id, clone(record));
		return clone(records);
	}

	async listAgreementTerms(agreementId: string): Promise<AgreementTermRecord[]> {
		return clone([...this.terms.values()].filter((term) => term.agreement_id === agreementId));
	}

	async getAgreement(agreementId: string): Promise<AgreementVersionRecord | null> {
		return clone(this.agreements.get(agreementId) ?? null);
	}

	async createHandover(input: {
		id: string;
		slug: string;
		now: string;
		assetId: string;
		agreementId: string;
	}): Promise<HandoverSessionRecord> {
		const record: HandoverSessionRecord = {
			id: input.id,
			slug: input.slug,
			status: "published",
			asset_id: input.assetId,
			agreement_id: input.agreementId,
			handover_state: "started",
			created_at: input.now,
			updated_at: input.now,
		};
		this.handovers.set(record.id, clone(record));
		return clone(record);
	}

	async getHandover(handoverId: string): Promise<HandoverSessionRecord | null> {
		return clone(this.handovers.get(handoverId) ?? null);
	}

	async updateHandover(
		handoverId: string,
		patch: Partial<HandoverSessionRecord>,
	): Promise<HandoverSessionRecord> {
		const current = this.handovers.get(handoverId);
		if (!current) throw new Error(`Handover not found: ${handoverId}`);
		const next = { ...current, ...clone(patch) };
		this.handovers.set(handoverId, clone(next));
		return clone(next);
	}

	async createHandoverChecks(
		handoverId: string,
		items: AssetConfigItemRecord[],
		now: string,
	): Promise<HandoverItemCheckRecord[]> {
		const records = items.map((item) => ({
			id: createId("check"),
			slug: `${handoverId}-${item.item_key}`,
			status: "published" as const,
			handover_id: handoverId,
			asset_config_item_id: item.id,
			baseline_condition: item.expected_condition,
			return_condition: null,
			dispute_state: null,
			dispute_notes: null,
			created_at: now,
			updated_at: now,
		}));
		for (const record of records) this.checks.set(record.id, clone(record));
		return clone(records);
	}

	async listHandoverChecks(handoverId: string): Promise<HandoverItemCheckRecord[]> {
		return clone([...this.checks.values()].filter((check) => check.handover_id === handoverId));
	}

	async updateHandoverCheck(
		checkId: string,
		patch: Partial<HandoverItemCheckRecord>,
	): Promise<HandoverItemCheckRecord> {
		const current = this.checks.get(checkId);
		if (!current) throw new Error(`Handover check not found: ${checkId}`);
		const next = { ...current, ...clone(patch) };
		this.checks.set(checkId, clone(next));
		return clone(next);
	}

	async listMarketplaceAssets(limit: number): Promise<AssetRecord[]> {
		return clone(
			[...this.assets.values()]
				.filter(
					(asset) =>
						asset.status === "published" &&
						asset.business_state === "listed" &&
						asset.visibility_state === "marketplace",
				)
				.slice(0, limit),
		);
	}
}
