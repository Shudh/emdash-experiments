import type { DomainRow, UserContext } from "../../domain/types.js";
import { asJsonObject, asString, DomainError } from "../../domain/types.js";

export const WF1_SUPERADMIN_ROLE = "50";
export const WF1_SUPERADMIN_EMAIL = "shudh.datta@gmail.com";

export const MARKETPLACE_REVIEW_EVENT = {
	REQUESTED: "marketplace_review_requested",
	REJECTED: "marketplace_review_rejected",
	PUBLISHED: "asset_published",
} as const;

export type MarketplaceReviewEventKind =
	(typeof MARKETPLACE_REVIEW_EVENT)[keyof typeof MARKETPLACE_REVIEW_EVENT];

export type MarketplaceReviewState =
	| "not_requested"
	| "requested"
	| "rejected"
	| "published";

export type MarketplaceReviewSnapshot = {
	state: MarketplaceReviewState;
	event: DomainRow | null;
	requestedAt: string | null;
	requestedByUserId: string | null;
	rejectedAt: string | null;
	rejectedByUserId: string | null;
	rejectReason: string | null;
	publishedAt: string | null;
	publishedByUserId: string | null;
};

export function isWf1Superadmin(user: UserContext | null | undefined): user is UserContext {
	if (!user?.id) return false;
	return String(user.role ?? "") === WF1_SUPERADMIN_ROLE || user.email === WF1_SUPERADMIN_EMAIL;
}

export function assertWf1Superadmin(user: UserContext): void {
	if (!isWf1Superadmin(user)) {
		throw new DomainError(
			"FORBIDDEN",
			"HandoverNow marketplace review requires superadmin access",
			403,
		);
	}
}

export function isMarketplaceReviewEvent(row: DomainRow): boolean {
	const eventKind = asString(row.event_kind);
	return (
		eventKind === MARKETPLACE_REVIEW_EVENT.REQUESTED ||
		eventKind === MARKETPLACE_REVIEW_EVENT.REJECTED ||
		eventKind === MARKETPLACE_REVIEW_EVENT.PUBLISHED
	);
}

export function latestMarketplaceReviewEvent(events: DomainRow[]): DomainRow | null {
	const relevant = events
		.filter(isMarketplaceReviewEvent)
		.toSorted((left, right) => timestamp(right) - timestamp(left));

	return relevant[0] ?? null;
}

export function marketplaceReviewSnapshot(events: DomainRow[]): MarketplaceReviewSnapshot {
	const latest = latestMarketplaceReviewEvent(events);

	if (!latest) {
		return emptySnapshot("not_requested", null);
	}

	const eventKind = asString(latest.event_kind);
	const spec = asJsonObject(latest.event_spec);

	if (eventKind === MARKETPLACE_REVIEW_EVENT.REQUESTED) {
		return {
			...emptySnapshot("requested", latest),
			requestedAt: asString(latest.created_at) || null,
			requestedByUserId: asString(latest.actor_user_id) || asString(latest.author_id) || null,
		};
	}

	if (eventKind === MARKETPLACE_REVIEW_EVENT.REJECTED) {
		return {
			...emptySnapshot("rejected", latest),
			rejectedAt: asString(latest.created_at) || null,
			rejectedByUserId: asString(latest.actor_user_id) || asString(latest.author_id) || null,
			rejectReason: asString(spec.reason) || null,
		};
	}

	if (eventKind === MARKETPLACE_REVIEW_EVENT.PUBLISHED) {
		return {
			...emptySnapshot("published", latest),
			publishedAt: asString(latest.created_at) || asString(latest.published_at) || null,
			publishedByUserId: asString(latest.actor_user_id) || asString(latest.author_id) || null,
		};
	}

	return emptySnapshot("not_requested", null);
}

export function requireReviewReason(value: unknown): string {
	const reason = typeof value === "string" ? value.trim() : "";

	if (reason.length < 3) {
		throw new DomainError("REJECT_REASON_REQUIRED", "Reject reason must be at least 3 characters", 422);
	}

	if (reason.length > 1000) {
		throw new DomainError("REJECT_REASON_TOO_LONG", "Reject reason must be 1000 characters or less", 422);
	}

	return reason;
}

export function safeAdminAssetSummary(asset: DomainRow): string {
	const parts = [
		asString(asset.title, "Untitled asset"),
		asString(asset.location_label),
		asset.public_price === null || asset.public_price === undefined ? "" : `₹${String(asset.public_price)}`,
	].filter(Boolean);

	return parts.join(" · ");
}

function emptySnapshot(state: MarketplaceReviewState, event: DomainRow | null): MarketplaceReviewSnapshot {
	return {
		state,
		event,
		requestedAt: null,
		requestedByUserId: null,
		rejectedAt: null,
		rejectedByUserId: null,
		rejectReason: null,
		publishedAt: null,
		publishedByUserId: null,
	};
}

function timestamp(row: DomainRow): number {
	const raw = asString(row.created_at) || asString(row.updated_at) || asString(row.published_at);
	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? parsed : 0;
}
