export type AssetStatus = "draft" | "published" | "scheduled" | "deleted";
export type BusinessState = "draft_asset" | "listed" | "booked" | "rented" | "maintenance";
export type VisibilityState = "private" | "marketplace" | "restricted";
export type InterestState = "open" | "accepted" | "closed";
export type RoundPhase = "pre_agreement" | "return";
export type RoundKind = "offer" | "counter" | "question" | "answer" | "acceptance";
export type RoundState = "open" | "accepted" | "closed";
export type AgreementState = "frozen" | "printed" | "signed" | "notarized";
export type HandoverState = "started" | "accepted" | "return_open" | "settled";

export interface AssetRecord {
	id: string;
	slug: string;
	status: AssetStatus;
	author_id: string;
	title: string;
	business_state: BusinessState;
	visibility_state: VisibilityState;
	config_spec: unknown;
	condition_spec: unknown;
	created_at: string;
	updated_at: string;
	published_at: string | null;
	scheduled_at: string | null;
	deleted_at: string | null;
	version: number;
	locale: string;
	translation_group: string;
}

export interface AssetConfigItemRecord {
	id: string;
	slug: string;
	status: AssetStatus;
	asset_id: string;
	item_key: string;
	label: string;
	expected_condition: string;
	sort_order: number;
	created_at: string;
	updated_at: string;
}

export interface AssetInterestRecord {
	id: string;
	slug: string;
	status: AssetStatus;
	asset_id: string;
	renter_id: string;
	interest_state: InterestState;
	message: string;
	created_at: string;
	updated_at: string;
}

export interface NegotiationRoundRecord {
	id: string;
	slug: string;
	status: AssetStatus;
	asset_id: string;
	interest_id: string;
	handover_id: string | null;
	round_phase: RoundPhase;
	round_kind: RoundKind;
	round_state: RoundState;
	actor_id: string;
	terms: unknown;
	created_at: string;
	updated_at: string;
}

export interface AgreementVersionRecord {
	id: string;
	slug: string;
	status: AssetStatus;
	asset_id: string;
	interest_id: string;
	agreement_state: AgreementState;
	printable_snapshot: unknown;
	created_at: string;
	updated_at: string;
}

export interface AgreementTermRecord {
	id: string;
	slug: string;
	status: AssetStatus;
	agreement_id: string;
	term_key: string;
	term_value: unknown;
	created_at: string;
	updated_at: string;
}

export interface HandoverSessionRecord {
	id: string;
	slug: string;
	status: AssetStatus;
	asset_id: string;
	agreement_id: string;
	handover_state: HandoverState;
	created_at: string;
	updated_at: string;
}

export interface HandoverItemCheckRecord {
	id: string;
	slug: string;
	status: AssetStatus;
	handover_id: string;
	asset_config_item_id: string;
	baseline_condition: string;
	return_condition: string | null;
	dispute_state: string | null;
	dispute_notes: string | null;
	created_at: string;
	updated_at: string;
}

export interface AddAssetInput {
	title: string;
	ownerId: string;
	slug?: string;
}
export interface AssetConfigItemInput {
	itemKey: string;
	label: string;
	expectedCondition: string;
	sortOrder?: number;
}
export interface UpdateAssetConfigInput {
	assetId: string;
	configSpec: unknown;
	conditionSpec: unknown;
	items: AssetConfigItemInput[];
}
export interface ExpressInterestInput {
	assetId: string;
	renterId: string;
	message?: string;
}
export interface AddRoundInput {
	interestId: string;
	actorId: string;
	roundPhase?: RoundPhase;
	roundKind: RoundKind;
	terms: unknown;
	handoverId?: string | null;
}
export interface AcceptFinalTermsInput {
	interestId: string;
	actorId: string;
	finalTerms: Record<string, unknown>;
}
export interface StartHandoverInput {
	assetId: string;
	agreementId: string;
}
export interface AcceptHandoverInput {
	handoverId: string;
}
export interface ClaimDamageInput {
	handoverId: string;
	actorId: string;
	itemCheckId: string;
	returnCondition: string;
	disputeNotes: string;
}
export interface SettleHandoverInput {
	handoverId: string;
}

export interface RentalDomainStore {
	createAsset(
		input: AddAssetInput & { id: string; now: string; slug: string },
	): Promise<AssetRecord>;
	getAsset(assetId: string): Promise<AssetRecord | null>;
	updateAsset(assetId: string, patch: Partial<AssetRecord>): Promise<AssetRecord>;
	replaceAssetConfigItems(
		assetId: string,
		items: Array<AssetConfigItemInput & { id: string; slug: string; now: string }>,
	): Promise<AssetConfigItemRecord[]>;
	listAssetConfigItems(assetId: string): Promise<AssetConfigItemRecord[]>;
	createInterest(
		input: ExpressInterestInput & { id: string; now: string; slug: string },
	): Promise<AssetInterestRecord>;
	getInterest(interestId: string): Promise<AssetInterestRecord | null>;
	createRound(
		input: AddRoundInput & {
			id: string;
			assetId: string;
			now: string;
			slug: string;
			roundState?: RoundState;
		},
	): Promise<NegotiationRoundRecord>;
	listRounds(interestId: string): Promise<NegotiationRoundRecord[]>;
	createAgreement(input: {
		id: string;
		slug: string;
		now: string;
		assetId: string;
		interestId: string;
		printableSnapshot: unknown;
	}): Promise<AgreementVersionRecord>;
	createAgreementTerms(
		agreementId: string,
		terms: Record<string, unknown>,
		now: string,
	): Promise<AgreementTermRecord[]>;
	listAgreementTerms(agreementId: string): Promise<AgreementTermRecord[]>;
	getAgreement(agreementId: string): Promise<AgreementVersionRecord | null>;
	createHandover(input: {
		id: string;
		slug: string;
		now: string;
		assetId: string;
		agreementId: string;
	}): Promise<HandoverSessionRecord>;
	getHandover(handoverId: string): Promise<HandoverSessionRecord | null>;
	updateHandover(
		handoverId: string,
		patch: Partial<HandoverSessionRecord>,
	): Promise<HandoverSessionRecord>;
	createHandoverChecks(
		handoverId: string,
		items: AssetConfigItemRecord[],
		now: string,
	): Promise<HandoverItemCheckRecord[]>;
	listHandoverChecks(handoverId: string): Promise<HandoverItemCheckRecord[]>;
	updateHandoverCheck(
		checkId: string,
		patch: Partial<HandoverItemCheckRecord>,
	): Promise<HandoverItemCheckRecord>;
	listMarketplaceAssets(limit: number): Promise<AssetRecord[]>;
}
