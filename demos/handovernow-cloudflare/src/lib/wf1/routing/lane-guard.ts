import type { DomainRow, DomainStore } from "../../domain/types.js";
import { asString, DomainError } from "../../domain/types.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import {
	getAssetOrThrow,
	getCardOrThrow,
	getInstanceOrThrow,
	getInterestOrThrow,
} from "../store/repository.js";
import { isAssetVisibleInLane, type Wf1Lane } from "./lane.js";

type JsonObject = Record<string, unknown>;

function isObjectRecord(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function stringField(body: JsonObject, key: string): string {
	const value = body[key];

	if (typeof value !== "string" || value.trim() === "") {
		throw new DomainError("INVALID_INPUT", `${key} is required`, 400);
	}

	return value;
}

async function assertAssetRowInLane(asset: DomainRow, lane: Wf1Lane): Promise<void> {
	if (!isAssetVisibleInLane(asset, lane)) {
		throw new DomainError("NOT_FOUND", "Not found", 404);
	}
}

export async function assertAssetIdInLane(
	store: DomainStore,
	lane: Wf1Lane,
	assetId: string,
): Promise<void> {
	const asset = await getAssetOrThrow(store, assetId);
	await assertAssetRowInLane(asset, lane);
}

export async function assertInterestIdInLane(
	store: DomainStore,
	lane: Wf1Lane,
	interestId: string,
): Promise<void> {
	const interest = await getInterestOrThrow(store, interestId);
	await assertAssetIdInLane(store, lane, asString(interest.asset_id));
}

export async function assertWorkflowInstanceIdInLane(
	store: DomainStore,
	lane: Wf1Lane,
	workflowInstanceId: string,
): Promise<void> {
	const instance = await getInstanceOrThrow(store, workflowInstanceId);
	await assertAssetIdInLane(store, lane, asString(instance.asset_id));
}

export async function assertCardIdInLane(
	store: DomainStore,
	lane: Wf1Lane,
	cardId: string,
): Promise<void> {
	const card = await getCardOrThrow(store, cardId);
	await assertAssetIdInLane(store, lane, asString(card.asset_id));
}

export async function assertEvidenceAttachmentIdInLane(
	store: DomainStore,
	lane: Wf1Lane,
	attachmentId: string,
): Promise<void> {
	const attachment = await store.get(WORKFLOW_RENTAL_COLLECTIONS.EVIDENCE_ATTACHMENTS, attachmentId);

	if (!attachment) {
		throw new DomainError("EVIDENCE_NOT_FOUND", "Evidence attachment not found", 404);
	}

	await assertAssetIdInLane(store, lane, asString(attachment.asset_id));
}

export async function assertDocumentBodyInLane(
	store: DomainStore,
	lane: Wf1Lane,
	body: JsonObject,
): Promise<void> {
	const documentSpec = body.documentSpec;

	if (isObjectRecord(documentSpec)) {
		const assetId = documentSpec.assetId;
		const workflowInstanceId = documentSpec.workflowInstanceId;
		const interestId = documentSpec.interestId;

		if (typeof assetId === "string" && assetId.trim() !== "") {
			await assertAssetIdInLane(store, lane, assetId);
			return;
		}

		if (typeof workflowInstanceId === "string" && workflowInstanceId.trim() !== "") {
			await assertWorkflowInstanceIdInLane(store, lane, workflowInstanceId);
			return;
		}

		if (typeof interestId === "string" && interestId.trim() !== "") {
			await assertInterestIdInLane(store, lane, interestId);
			return;
		}
	}

	if (lane === "test") {
		throw new DomainError(
			"LANE_TARGET_REQUIRED",
			"Test-lane document creation must include documentSpec.assetId, documentSpec.workflowInstanceId, or documentSpec.interestId",
			400,
		);
	}

	return;
}

export async function assertWf1RouteLane(
	store: DomainStore,
	lane: Wf1Lane,
	method: string,
	parts: string[],
	body: JsonObject,
): Promise<void> {
	if (method === "GET" && parts[0] === "marketplace" && parts[1] === "assets" && !parts[2]) {
		return;
	}

	if (method === "POST" && parts[0] === "owner" && parts[1] === "assets" && parts[2] === "draft-intent") {
		return;
	}

	if (method === "POST" && parts[0] === "owner" && parts[1] === "assets" && parts[2] === "add") {
		return;
	}

	if (method === "GET" && parts[0] === "owner" && parts[1] === "dashboard") {
		return;
	}

	if (parts[0] === "marketplace" && parts[1] === "assets" && parts[2]) {
		await assertAssetIdInLane(store, lane, parts[2]);
		return;
	}

	if (parts[0] === "owner" && parts[1] === "assets" && parts[2]) {
		await assertAssetIdInLane(store, lane, parts[2]);
		return;
	}

	if (parts[0] === "workspaces" && parts[1]) {
		await assertWorkflowInstanceIdInLane(store, lane, parts[1]);
		return;
	}

	if (parts[0] === "assets" && parts[1] && parts[2] === "workspace") {
		await assertAssetIdInLane(store, lane, parts[1]);
		return;
	}

	if (parts[0] === "interests" && parts[1] && parts[2] === "workspace") {
		await assertInterestIdInLane(store, lane, parts[1]);
		return;
	}

	if (method === "POST" && parts[0] === "workflow" && parts[1] === "cards" && !parts[2]) {
		await assertWorkflowInstanceIdInLane(store, lane, stringField(body, "workflowInstanceId"));
		return;
	}

	if (parts[0] === "workflow" && parts[1] === "cards" && parts[2]) {
		await assertCardIdInLane(store, lane, parts[2]);
		return;
	}

	if (method === "POST" && parts[0] === "workflow" && parts[1] === "actions") {
		await assertWorkflowInstanceIdInLane(store, lane, stringField(body, "workflowInstanceId"));
		return;
	}

	if (method === "POST" && parts[0] === "documents" && !parts[1]) {
		await assertDocumentBodyInLane(store, lane, body);
		return;
	}

	if (method === "POST" && parts[0] === "evidence" && parts[1] === "attach") {
		await assertCardIdInLane(store, lane, stringField(body, "cardId"));
		return;
	}

	if (method === "GET" && parts[0] === "evidence" && parts[1] && parts[2] === "download") {
		await assertEvidenceAttachmentIdInLane(store, lane, parts[1]);
		return;
	}
}