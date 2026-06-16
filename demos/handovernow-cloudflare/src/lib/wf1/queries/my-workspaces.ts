import type { DomainRow, DomainStore, UserContext } from "../../domain/types.js";
import { asString } from "../../domain/types.js";
import type { WorkflowActorRole } from "../core/types.js";
import {
	filterAssetsForLane,
	wf1AssetHref,
	wf1WorkspaceHref,
	type Wf1Lane,
} from "../routing/lane.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import { actorRoleFor, workflowDefinitionForInstance } from "../store/repository.js";

type WorkspaceKind = "asset" | "application";
type WorkspaceRelationship = "owner" | "applicant" | "renter";
type WorkspaceSource = "owned_asset" | "submitted_interest" | "granted_access" | "active_renter";

type JsonObject = Record<string, unknown>;

export type MyWorkflowWorkspaceIndexOptions = {
	lane?: Wf1Lane;
	limit?: number;
};

export type MyWorkflowWorkspaceIndexRow = {
	id: string;
	kind: WorkspaceKind;
	relationship: WorkspaceRelationship;
	sources: WorkspaceSource[];
	assetId: string;
	interestId: string | null;
	workflowInstanceId: string | null;
	assetTitle: string;
	assetKind: string;
	locationLabel: string;
	assetState: {
		id: string;
		label: string;
		visibility: string;
	};
	applicationState: {
		id: string;
		label: string;
		tone: string;
		description: string;
		terminal: boolean;
	} | null;
	viewer: {
		role: WorkspaceRelationship;
		canOpenWorkspace: boolean;
		canManageAsset: boolean;
		accessRole: string | null;
	};
	links: {
		asset: string;
		workspace: string | null;
	};
	refs: {
		ownerUserId: string;
		applicantUserId: string | null;
		activeRenterUserId: string | null;
	};
	timestamps: {
		assetCreatedAt: string;
		assetUpdatedAt: string;
		interestCreatedAt: string | null;
		interestUpdatedAt: string | null;
		workflowCreatedAt: string | null;
		workflowUpdatedAt: string | null;
		sortAt: string;
	};
};

export type MyWorkflowWorkspacesIndex = {
	user: {
		id: string;
		email: string | null;
	};
	lane: Wf1Lane;
	items: MyWorkflowWorkspaceIndexRow[];
	counts: {
		total: number;
		owner: number;
		applicant: number;
		renter: number;
		assets: number;
		applications: number;
	};
};

type HydratedContext = {
	asset: DomainRow;
	interest: DomainRow | null;
	instance: DomainRow | null;
	accessRole: string | null;
	source: WorkspaceSource;
	kind: WorkspaceKind;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

function clampLimit(value: number | undefined): number {
	if (!Number.isFinite(value ?? NaN)) return DEFAULT_LIMIT;
	return Math.min(Math.max(Math.trunc(value as number), 1), MAX_LIMIT);
}

function uniqueStrings(values: Array<unknown>): string[] {
	return [...new Set(values.map((value) => asString(value).trim()).filter((value) => value !== ""))];
}

function rowMap(rows: DomainRow[]): Map<string, DomainRow> {
	return new Map(rows.map((row) => [row.id, row]));
}

function latestIso(values: Array<unknown>): string {
	let bestValue = "";
	let bestTime = 0;

	for (const value of values) {
		const raw = asString(value);
		if (!raw) continue;
		const time = Date.parse(raw);
		if (Number.isFinite(time) && time >= bestTime) {
			bestTime = time;
			bestValue = raw;
		}
	}

	return bestValue;
}

function stateLabel(value: string): string {
	return value.trim() ? value.replaceAll("_", " ") : "unknown";
}

function roleForContext(user: UserContext, asset: DomainRow, interest: DomainRow | null): WorkspaceRelationship | null {
	const role = actorRoleFor(user, asset, interest);
	return role === "owner" || role === "applicant" || role === "renter" ? role : null;
}

function applicationStateFor(
	instance: DomainRow | null,
	role: WorkspaceRelationship,
): MyWorkflowWorkspaceIndexRow["applicationState"] {
	if (!instance) return null;

	const stateId = asString(instance.workflow_state, "unknown");

	try {
		const definition = workflowDefinitionForInstance(instance);
		const state = definition.states[stateId];
		const workflowRole = role as WorkflowActorRole;
		const description = state?.descriptionByRole?.[workflowRole] ?? "";

		return {
			id: stateId,
			label: state?.label ?? stateLabel(stateId),
			tone: state?.tone ?? "neutral",
			description,
			terminal: state?.terminal === true,
		};
	} catch {
		return {
			id: stateId,
			label: stateLabel(stateId),
			tone: "neutral",
			description: "",
			terminal: false,
		};
	}
}

function rowId(kind: WorkspaceKind, role: WorkspaceRelationship, asset: DomainRow, instance: DomainRow | null): string {
	if (instance) return `${kind}:${role}:workflow:${instance.id}`;
	return `${kind}:${role}:asset:${asset.id}`;
}

function indexRowForContext(
	lane: Wf1Lane,
	user: UserContext,
	context: HydratedContext,
): MyWorkflowWorkspaceIndexRow | null {
	const { asset, interest, instance } = context;
	const role = roleForContext(user, asset, interest);

	if (!role) return null;

	const assetStateId = asString(asset.business_state, "unknown");
	const visibility = asString(asset.visibility_state, "unknown");
	const sortAt = latestIso([
		instance?.updated_at,
		interest?.updated_at,
		asset.updated_at,
		instance?.created_at,
		interest?.created_at,
		asset.created_at,
	]);

	return {
		id: rowId(context.kind, role, asset, instance),
		kind: context.kind,
		relationship: role,
		sources: [context.source],
		assetId: asset.id,
		interestId: interest?.id ?? null,
		workflowInstanceId: instance?.id ?? null,
		assetTitle: asString(asset.title, "Untitled asset"),
		assetKind: asString(asset.asset_kind, "asset"),
		locationLabel: asString(asset.location_label, ""),
		assetState: {
			id: assetStateId,
			label: stateLabel(assetStateId),
			visibility,
		},
		applicationState: applicationStateFor(instance, role),
		viewer: {
			role,
			canOpenWorkspace: Boolean(instance?.id),
			canManageAsset: role === "owner",
			accessRole: context.accessRole,
		},
		links: {
			asset: wf1AssetHref(lane, asset.id),
			workspace: instance?.id ? wf1WorkspaceHref(lane, instance.id) : null,
		},
		refs: {
			ownerUserId: asString(asset.owner_user_id),
			applicantUserId: interest ? asString(interest.interested_user_id) : asString(instance?.applicant_user_id) || null,
			activeRenterUserId: asString(asset.active_renter_user_id) || null,
		},
		timestamps: {
			assetCreatedAt: asString(asset.created_at),
			assetUpdatedAt: asString(asset.updated_at),
			interestCreatedAt: interest ? asString(interest.created_at) : null,
			interestUpdatedAt: interest ? asString(interest.updated_at) : null,
			workflowCreatedAt: instance ? asString(instance.created_at) : null,
			workflowUpdatedAt: instance ? asString(instance.updated_at) : null,
			sortAt,
		},
	};
}

function upsertRow(rows: Map<string, MyWorkflowWorkspaceIndexRow>, row: MyWorkflowWorkspaceIndexRow): void {
	const existing = rows.get(row.id);
	if (!existing) {
		rows.set(row.id, row);
		return;
	}

	rows.set(row.id, {
		...existing,
		sources: uniqueStrings([...existing.sources, ...row.sources]) as WorkspaceSource[],
	});
}

async function listIfAny(
	store: DomainStore,
	collection: string,
	ids: string[],
	limit: number,
): Promise<DomainRow[]> {
	if (ids.length === 0) return [];
	return store.list(collection, { id: ids }, { orderBy: "created_at", direction: "desc", limit });
}

export async function listMyWorkflowWorkspaces(
	store: DomainStore,
	user: UserContext,
	options: MyWorkflowWorkspaceIndexOptions = {},
): Promise<MyWorkflowWorkspacesIndex> {
	const lane = options.lane ?? "public";
	const limit = clampLimit(options.limit);

	const [ownedAssetsSeed, ownedInterests, submittedInterests, accessRows] = await Promise.all([
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSETS,
			{ owner_user_id: user.id },
			{ orderBy: "updated_at", direction: "desc", limit },
		),
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.INTERESTS,
			{ owner_user_id: user.id },
			{ orderBy: "updated_at", direction: "desc", limit },
		),
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.INTERESTS,
			{ interested_user_id: user.id },
			{ orderBy: "updated_at", direction: "desc", limit },
		),
		store.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_ACCESS,
			{ user_id: user.id, access_state: "active" },
			{ orderBy: "updated_at", direction: "desc", limit },
		),
	]);

	const assetIds = uniqueStrings([
		...ownedAssetsSeed.map((asset) => asset.id),
		...ownedInterests.map((interest) => interest.asset_id),
		...submittedInterests.map((interest) => interest.asset_id),
		...accessRows.map((access) => access.asset_id),
	]);

	const extraAssets = await listIfAny(store, WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetIds, Math.max(limit, assetIds.length));
	const assets = filterAssetsForLane([...rowMap([...ownedAssetsSeed, ...extraAssets]).values()], lane);
	const assetsById = rowMap(assets);

	const interestIds = uniqueStrings([
		...ownedInterests.map((interest) => interest.id),
		...submittedInterests.map((interest) => interest.id),
		...assets.map((asset) => asset.active_interest_id),
	]);

	const extraInterests = await listIfAny(
		store,
		WORKFLOW_RENTAL_COLLECTIONS.INTERESTS,
		interestIds,
		Math.max(limit, interestIds.length),
	);
	const interests = [...rowMap([...ownedInterests, ...submittedInterests, ...extraInterests]).values()]
		.filter((interest) => assetsById.has(asString(interest.asset_id)));
	const interestsById = rowMap(interests);

	const instanceIds = uniqueStrings([
		...interests.map((interest) => interest.workflow_instance_id),
		...assets.map((asset) => asset.active_workflow_instance_id),
	]);

	const instances = await listIfAny(
		store,
		WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES,
		instanceIds,
		Math.max(limit, instanceIds.length),
	);
	const instancesById = rowMap(instances);
	const rows = new Map<string, MyWorkflowWorkspaceIndexRow>();

	for (const interest of interests) {
		const asset = assetsById.get(asString(interest.asset_id));
		if (!asset) continue;
		const instance = instancesById.get(asString(interest.workflow_instance_id)) ?? null;
		const source: WorkspaceSource = asString(interest.interested_user_id) === user.id
			? "submitted_interest"
			: "owned_asset";
		const row = indexRowForContext(lane, user, {
			asset,
			interest,
			instance,
			accessRole: null,
			source,
			kind: "application",
		});
		if (row) upsertRow(rows, row);
	}

	for (const access of accessRows) {
		const asset = assetsById.get(asString(access.asset_id));
		if (!asset) continue;
		const activeInterest = interestsById.get(asString(asset.active_interest_id)) ?? null;
		const instance = instancesById.get(asString(activeInterest?.workflow_instance_id ?? asset.active_workflow_instance_id)) ?? null;
		const source: WorkspaceSource = asString(asset.active_renter_user_id) === user.id ? "active_renter" : "granted_access";
		const row = indexRowForContext(lane, user, {
			asset,
			interest: activeInterest,
			instance,
			accessRole: asString(access.access_role) || null,
			source,
			kind: instance ? "application" : "asset",
		});
		if (row) upsertRow(rows, row);
	}

	for (const asset of assets) {
		if (asString(asset.owner_user_id) !== user.id) continue;
		const activeInterest = interestsById.get(asString(asset.active_interest_id)) ?? null;
		const activeInstance = instancesById.get(asString(activeInterest?.workflow_instance_id ?? asset.active_workflow_instance_id)) ?? null;
		const row = indexRowForContext(lane, user, {
			asset,
			interest: activeInterest,
			instance: activeInstance,
			accessRole: "owner",
			source: "owned_asset",
			kind: "asset",
		});
		if (row) upsertRow(rows, row);
	}

	const items = [...rows.values()]
		.sort((left, right) => Date.parse(right.timestamps.sortAt || "") - Date.parse(left.timestamps.sortAt || ""))
		.slice(0, limit);

	return {
		user: {
			id: user.id,
			email: user.email ?? null,
		},
		lane,
		items,
		counts: {
			total: items.length,
			owner: items.filter((item) => item.relationship === "owner").length,
			applicant: items.filter((item) => item.relationship === "applicant").length,
			renter: items.filter((item) => item.relationship === "renter").length,
			assets: items.filter((item) => item.kind === "asset").length,
			applications: items.filter((item) => item.kind === "application").length,
		},
	};
}
