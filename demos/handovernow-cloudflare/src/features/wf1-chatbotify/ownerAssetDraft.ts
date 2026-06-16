import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaUploadResult, PrescreenQuestion } from "./types";

export type OwnerAssetDraftSection = "core" | "screening" | "config" | "inventory" | "publish";

export type OwnerAssetCoreDraft = {
	title: string;
	assetKind: string;
	locationLabel: string;
	publicPrice: number | null;
	minimumMonths: number | null;
	currency: string;
};

export type OwnerAssetConfigItemDraft = {
	localId: string;
	itemKind: string;
	itemGroup: string;
	itemLabel: string;
	ownerDeclaredState: string;
	itemSpec: Record<string, unknown>;
	mediaRefs: MediaUploadResult[];
};

export type OwnerAssetDraft = {
	draftSchemaVersion: 1;
	draftId: string;
	mode: "new_asset" | "existing_asset";
	assetId: string | null;
	core: OwnerAssetCoreDraft;
	ownerConditionsSpec: {
		preScreenQuestions: PrescreenQuestion[];
	};
	configSpec: Record<string, unknown>;
	conditionSpec: Record<string, unknown>;
	items: OwnerAssetConfigItemDraft[];
	mediaRefs: MediaUploadResult[];
	publishIntent: boolean;
	dirtySections: Record<OwnerAssetDraftSection, boolean>;
	revision: number;
	initialFingerprint: string;
	lastLocalSaveAt: string | null;
	lastServerSaveAt: string | null;
};

export type OwnerAssetDraftAction =
	| { type: "CORE_PATCHED"; patch: Partial<OwnerAssetCoreDraft> }
	| { type: "SCREENING_QUESTIONS_REPLACED"; questions: PrescreenQuestion[] }
	| { type: "SCREENING_QUESTION_ADDED"; question: PrescreenQuestion }
	| { type: "SCREENING_QUESTION_UPDATED"; index: number; question: PrescreenQuestion }
	| { type: "SCREENING_QUESTION_REMOVED"; index: number }
	| { type: "SCREENING_QUESTION_MOVED"; index: number; direction: -1 | 1 }
	| { type: "CONFIG_PATCHED"; patch: Record<string, unknown> }
	| { type: "CONDITION_PATCHED"; patch: Record<string, unknown> }
	| { type: "ITEM_ADDED"; item: OwnerAssetConfigItemDraft }
	| { type: "ITEM_UPDATED"; localId: string; patch: Partial<OwnerAssetConfigItemDraft> }
	| { type: "ITEM_REMOVED"; localId: string }
	| { type: "MEDIA_UPLOADED"; media: MediaUploadResult }
	| { type: "PUBLISH_INTENT_CHANGED"; publishIntent: boolean }
	| { type: "SERVER_REBASED"; assetId: string; savedAt: string }
	| { type: "DRAFT_RESET"; draft: OwnerAssetDraft };

export type OwnerAssetDraftStore = {
	state: OwnerAssetDraft;
	dispatch: (action: OwnerAssetDraftAction) => void;
	getSnapshot: () => OwnerAssetDraft;
	clearStoredDraft: () => void;
};

type UseOwnerAssetDraftInput = {
	draftKey: string;
	initialQuestions: PrescreenQuestion[];
	mode?: "new_asset" | "existing_asset";
	assetId?: string | null;
};

const EMPTY_DIRTY_SECTIONS: Record<OwnerAssetDraftSection, boolean> = {
	core: false,
	screening: false,
	config: false,
	inventory: false,
	publish: false,
};

function nowIso(): string {
	return new Date().toISOString();
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
		.join(",")}}`;
}

export function fingerprintQuestions(questions: PrescreenQuestion[]): string {
	return stableStringify(questions);
}

function randomDraftId(): string {
	return `asset_draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyDraft(input: UseOwnerAssetDraftInput): OwnerAssetDraft {
	return {
		draftSchemaVersion: 1,
		draftId: randomDraftId(),
		mode: input.mode ?? "new_asset",
		assetId: input.assetId ?? null,
		core: {
			title: "",
			assetKind: "apartment",
			locationLabel: "",
			publicPrice: null,
			minimumMonths: null,
			currency: "INR",
		},
		ownerConditionsSpec: {
			preScreenQuestions: input.initialQuestions,
		},
		configSpec: {},
		conditionSpec: {},
		items: [],
		mediaRefs: [],
		publishIntent: false,
		dirtySections: { ...EMPTY_DIRTY_SECTIONS },
		revision: 1,
		initialFingerprint: fingerprintQuestions(input.initialQuestions),
		lastLocalSaveAt: null,
		lastServerSaveAt: null,
	};
}

function isDraft(value: unknown): value is OwnerAssetDraft {
	return Boolean(
		value &&
			typeof value === "object" &&
			(value as OwnerAssetDraft).draftSchemaVersion === 1 &&
			(value as OwnerAssetDraft).ownerConditionsSpec &&
			Array.isArray((value as OwnerAssetDraft).ownerConditionsSpec.preScreenQuestions),
	);
}

function loadStoredDraft(key: string, initialFingerprint: string): OwnerAssetDraft | null {
	if (typeof window === "undefined") return null;

	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return null;

		const parsed = JSON.parse(raw) as unknown;
		if (!isDraft(parsed)) return null;
		if (parsed.initialFingerprint !== initialFingerprint) return null;

		return parsed;
	} catch {
		return null;
	}
}

function saveStoredDraft(key: string, draft: OwnerAssetDraft): void {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(key, JSON.stringify({ ...draft, lastLocalSaveAt: nowIso() }));
	} catch {
		// localStorage is a convenience cache, never a business-state dependency.
	}
}

function markDirty(draft: OwnerAssetDraft, section: OwnerAssetDraftSection): OwnerAssetDraft {
	return {
		...draft,
		revision: draft.revision + 1,
		lastLocalSaveAt: nowIso(),
		dirtySections: {
			...draft.dirtySections,
			[section]: true,
		},
	};
}

function moveQuestion(questions: PrescreenQuestion[], index: number, direction: -1 | 1): PrescreenQuestion[] {
	const nextIndex = index + direction;
	if (nextIndex < 0 || nextIndex >= questions.length) return questions;

	const copy = [...questions];
	const current = copy[index];
	const next = copy[nextIndex];
	if (!current || !next) return questions;

	copy[index] = next;
	copy[nextIndex] = current;
	return copy;
}

export function ownerAssetDraftReducer(draft: OwnerAssetDraft, action: OwnerAssetDraftAction): OwnerAssetDraft {
	switch (action.type) {
		case "CORE_PATCHED":
			return markDirty({ ...draft, core: { ...draft.core, ...action.patch } }, "core");

		case "SCREENING_QUESTIONS_REPLACED":
			return markDirty(
				{
					...draft,
					ownerConditionsSpec: {
						...draft.ownerConditionsSpec,
						preScreenQuestions: action.questions,
					},
				},
				"screening",
			);

		case "SCREENING_QUESTION_ADDED":
			return ownerAssetDraftReducer(draft, {
				type: "SCREENING_QUESTIONS_REPLACED",
				questions: [...draft.ownerConditionsSpec.preScreenQuestions, action.question],
			});

		case "SCREENING_QUESTION_UPDATED":
			return ownerAssetDraftReducer(draft, {
				type: "SCREENING_QUESTIONS_REPLACED",
				questions: draft.ownerConditionsSpec.preScreenQuestions.map((question, index) =>
					index === action.index ? action.question : question,
				),
			});

		case "SCREENING_QUESTION_REMOVED":
			return ownerAssetDraftReducer(draft, {
				type: "SCREENING_QUESTIONS_REPLACED",
				questions: draft.ownerConditionsSpec.preScreenQuestions.filter((_question, index) => index !== action.index),
			});

		case "SCREENING_QUESTION_MOVED":
			return ownerAssetDraftReducer(draft, {
				type: "SCREENING_QUESTIONS_REPLACED",
				questions: moveQuestion(draft.ownerConditionsSpec.preScreenQuestions, action.index, action.direction),
			});

		case "CONFIG_PATCHED":
			return markDirty({ ...draft, configSpec: { ...draft.configSpec, ...action.patch } }, "config");

		case "CONDITION_PATCHED":
			return markDirty({ ...draft, conditionSpec: { ...draft.conditionSpec, ...action.patch } }, "config");

		case "ITEM_ADDED":
			return markDirty({ ...draft, items: [...draft.items, action.item] }, "inventory");

		case "ITEM_UPDATED":
			return markDirty(
				{
					...draft,
					items: draft.items.map((item) =>
						item.localId === action.localId ? { ...item, ...action.patch } : item,
					),
				},
				"inventory",
			);

		case "ITEM_REMOVED":
			return markDirty(
				{ ...draft, items: draft.items.filter((item) => item.localId !== action.localId) },
				"inventory",
			);

		case "MEDIA_UPLOADED":
			return markDirty({ ...draft, mediaRefs: [...draft.mediaRefs, action.media] }, "config");

		case "PUBLISH_INTENT_CHANGED":
			return markDirty({ ...draft, publishIntent: action.publishIntent }, "publish");

		case "SERVER_REBASED":
			return {
				...draft,
				assetId: action.assetId,
				mode: "existing_asset",
				dirtySections: { ...EMPTY_DIRTY_SECTIONS },
				revision: draft.revision + 1,
				lastServerSaveAt: action.savedAt,
			};

		case "DRAFT_RESET":
			return action.draft;

		default:
			return draft;
	}
}

export function useOwnerAssetDraft(input: UseOwnerAssetDraftInput): OwnerAssetDraftStore {
	const initialFingerprint = useMemo(() => fingerprintQuestions(input.initialQuestions), [input.initialQuestions]);
	const initialDraft = useMemo(() => {
		const empty = createEmptyDraft(input);
		return loadStoredDraft(input.draftKey, initialFingerprint) ?? empty;
	}, [input.draftKey, initialFingerprint, input.mode, input.assetId]);

	const [state, setState] = useState<OwnerAssetDraft>(initialDraft);
	const stateRef = useRef<OwnerAssetDraft>(initialDraft);

	useEffect(() => {
		stateRef.current = state;
		saveStoredDraft(input.draftKey, state);
	}, [input.draftKey, state]);

	const dispatch = useCallback((action: OwnerAssetDraftAction) => {
		const next = ownerAssetDraftReducer(stateRef.current, action);
		stateRef.current = next;
		setState(next);
	}, []);

	const getSnapshot = useCallback(() => stateRef.current, []);

	const clearStoredDraft = useCallback(() => {
		if (typeof window === "undefined") return;
		window.localStorage.removeItem(input.draftKey);
	}, [input.draftKey]);

	return { state, dispatch, getSnapshot, clearStoredDraft };
}
