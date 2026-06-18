import type { DomainStore, UserContext } from "../../domain/types.js";
import { DomainError, asString } from "../../domain/types.js";
import { answerWorkflowCard } from "../commands/answer-workflow-card.js";
import { attachEvidence } from "../commands/attach-evidence.js";
import { createWorkflowAsset } from "../commands/create-asset.js";
import { createTenantDocument } from "../commands/create-tenant-document.js";
import { createWorkflowCard } from "../commands/create-workflow-card.js";
import { decideWorkflowCard } from "../commands/decide-workflow-card.js";
import { expressWorkflowInterest } from "../commands/express-interest.js";
import {
	approveMarketplaceReview,
	rejectMarketplaceReview,
	requestMarketplaceReview,
} from "../commands/marketplace-review.js";
import { publishWorkflowAsset } from "../commands/publish-asset.js";
import { runWorkflowAction } from "../commands/run-workflow-action.js";
import {
	updateWorkflowAssetConfig,
	type UpdateWorkflowAssetConfigInput,
} from "../commands/update-asset-config.js";
import { getWorkflowAssetWorkspace } from "../queries/asset-workspace.js";
import { getWorkflowInterestWorkspace } from "../queries/interest-workspace.js";
import {
	getWorkflowMarketplaceAsset,
	listWorkflowMarketplaceAssets,
} from "../queries/marketplace.js";
import { listMyWorkflowWorkspaces } from "../queries/my-workspaces.js";
import { getWorkflowOwnerDashboard } from "../queries/owner-dashboard.js";
import { listAdminPublishQueue } from "../queries/admin-publish-queue.js";
import { getWf1WorkflowInstanceWorkspace } from "../queries/workspace-instance.js";
import { assertWf1RouteLane } from "../routing/lane-guard.js";
import { wf1WorkspaceHref, type Wf1Lane } from "../routing/lane.js";
import {
	assertAssetCreationBodyGuarded,
	assertAssetDraftTokenForUser,
	assertMarketplaceReviewAssetReady,
	issueGuardedAssetDraftIntent,
} from "../security/asset-creation-guard.js";
import { validateLeadProtection } from "../security/lead-guard.js";
import { assertWf1ExposedPostRateLimit } from "../security/rate-limit.js";
import type { RuntimeEnv } from "../security/runtime-env.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import { actorRoleFor, getAssetOrThrow, getInterestOrThrow } from "../store/repository.js";
import type { Wf1EmDashMediaRuntime } from "../uploads/types.js";
import { handleWf1UploadRoute, streamWf1EvidenceAttachment } from "./upload-route.js";
import {
	optionalArray,
	optionalNumber,
	optionalRecord,
	parseRecord,
	stringField,
} from "./contracts.js";

const MAX_WF1_DEFAULT_JSON_BYTES = 256 * 1024;
const MAX_WF1_LEAD_JSON_BYTES = 32 * 1024;
const MAX_WF1_INDEX_LIMIT = 300;

export type WorkflowRentalRouteInput = {
	request: Request;
	path: string;
	store: DomainStore;
	user: UserContext | null;
	env?: RuntimeEnv;
	lane?: Wf1Lane;
	emdash?: Wf1EmDashMediaRuntime | null;
};

export async function handleWorkflowRentalRoute(
	input: WorkflowRentalRouteInput,
): Promise<Response> {
	try {
		const parts = input.path.split("/").filter(Boolean);
		const lane = input.lane ?? "public";

		await assertWf1ExposedPostRateLimit(input.request, input.path);

		if (input.request.method === "GET" && input.path === "marketplace/assets") {
			return jsonOk({ items: await listWorkflowMarketplaceAssets(input.store, input.user, { lane }) });
		}

		if (
			input.request.method === "GET" &&
			parts[0] === "marketplace" &&
			parts[1] === "assets" &&
			parts[2]
		) {
			const details = await getWorkflowMarketplaceAsset(input.store, input.user, parts[2], { lane });
			if (!details) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
			return jsonOk(details);
		}

		const user = requireUser(input.user);

		if (input.request.method === "POST" && input.path === "uploads") {
			return jsonOk(
				await handleWf1UploadRoute({
					request: input.request,
					store: input.store,
					user,
					lane,
					emdash: input.emdash,
					env: input.env,
				}),
				201,
			);
		}

		if (
			input.request.method === "GET" &&
			parts[0] === "evidence" &&
			parts[1] &&
			parts[2] === "file"
		) {
			return streamWf1EvidenceAttachment({
				store: input.store,
				user,
				emdash: input.emdash,
				attachmentId: parts[1],
			});
		}

		const jsonLimit = isExpressInterestRoute(input.request.method, parts)
			? MAX_WF1_LEAD_JSON_BYTES
			: MAX_WF1_DEFAULT_JSON_BYTES;
		const body = input.request.method === "GET" ? {} : parseRecord(await readJson(input.request, jsonLimit));

		await assertWf1RouteLane(input.store, lane, input.request.method, parts, body);

		if (input.request.method === "GET" && input.path === "my/workspaces") {
			return jsonOk(
				await listMyWorkflowWorkspaces(input.store, user, {
					lane,
					limit: numberQueryParam(input.request, "limit", 100, MAX_WF1_INDEX_LIMIT),
				}),
			);
		}

		if (input.request.method === "GET" && input.path === "owner/dashboard") {
			return jsonOk(await getWorkflowOwnerDashboard(input.store, user, { lane }));
		}

		if (input.request.method === "GET" && input.path === "admin/publish-queue") {
			return jsonOk(
				await listAdminPublishQueue(input.store, user, {
					lane,
					limit: numberQueryParam(input.request, "limit", 100, MAX_WF1_INDEX_LIMIT),
				}),
			);
		}

		if (input.request.method === "POST" && input.path === "owner/assets/draft-intent") {
			return jsonOk(
				await issueGuardedAssetDraftIntent({
					request: input.request,
					body,
					user,
					lane,
					env: input.env,
				}),
				201,
			);
		}

		if (input.request.method === "POST" && input.path === "owner/assets/add") {
			const assetCreateGuard = assertAssetCreationBodyGuarded({ body, lane });

			await assertAssetDraftTokenForUser({
				env: input.env,
				user,
				lane,
				draftId: assetCreateGuard.draftId,
				assetDraftToken: assetCreateGuard.assetDraftToken,
			});

			return jsonOk(
				await createWorkflowAsset(input.store, user, {
					assetKind: stringField(body, "assetKind"),
					title: stringField(body, "title"),
					locationLabel: asOptionalString(body.locationLabel),
					publicPrice: optionalNumber(body, "publicPrice"),
					currency: asOptionalString(body.currency) ?? "INR",
					ownerConditionsSpec: optionalRecord(body, "ownerConditionsSpec"),
					configSpec: lane === "test" ? withTestLaneConfigSpec(assetCreateGuard.configSpec, user) : assetCreateGuard.configSpec,
				}),
				201,
			);
		}

		if (
			input.request.method === "POST" &&
			parts[0] === "owner" &&
			parts[1] === "assets" &&
			parts[2]
		) {
			if (parts[3] === "config") {
				const configInput: UpdateWorkflowAssetConfigInput = {};

				if (hasOwn(body, "assetKind")) {
					configInput.assetKind = asOptionalString(body.assetKind);
				}

				if (hasOwn(body, "title")) {
					configInput.title = asOptionalString(body.title);
				}

				if (hasOwn(body, "locationLabel")) {
					configInput.locationLabel = asOptionalString(body.locationLabel);
				}

				if (hasOwn(body, "publicPrice")) {
					configInput.publicPrice = optionalNumber(body, "publicPrice");
				}

				if (hasOwn(body, "currency")) {
					configInput.currency = asOptionalString(body.currency);
				}

				if (hasOwn(body, "minimumMonths")) {
					configInput.minimumMonths = optionalNumber(body, "minimumMonths");
				}

				if (hasOwn(body, "configSpec")) {
					const configSpec = optionalRecord(body, "configSpec");
					configInput.configSpec = lane === "test" ? withTestLaneConfigSpec(configSpec, user) : configSpec;
				}

				if (hasOwn(body, "conditionSpec")) {
					configInput.conditionSpec = optionalRecord(body, "conditionSpec");
				}

				if (hasOwn(body, "ownerConditionsSpec")) {
					configInput.ownerConditionsSpec = optionalRecord(body, "ownerConditionsSpec");
				}

				if (hasOwn(body, "items")) {
					configInput.items = optionalArray(body, "items");
				}

				return jsonOk(await updateWorkflowAssetConfig(input.store, user, parts[2], configInput));
			}

			if (parts[3] === "request-marketplace-review") {
				await assertMarketplaceReviewAssetReady(input.store, user, parts[2]);

				return jsonOk(
					await requestMarketplaceReview(input.store, user, parts[2], {
						lane,
						summary: asOptionalString(body.summary),
						requestSpec: optionalRecord(body, "requestSpec"),
					}),
					201,
				);
			}

			if (parts[3] === "publish-to-marketplace") {
				return jsonOk(await publishWorkflowAsset(input.store, user, parts[2]));
			}
		}

		if (
			input.request.method === "POST" &&
			parts[0] === "admin" &&
			parts[1] === "assets" &&
			parts[2]
		) {
			if (parts[3] === "approve-marketplace") {
				return jsonOk(
					await approveMarketplaceReview(input.store, user, parts[2], {
						lane,
					}),
				);
			}

			if (parts[3] === "reject-marketplace") {
				return jsonOk(
					await rejectMarketplaceReview(input.store, user, parts[2], {
						lane,
						reason: asOptionalString(body.reason),
						reviewSpec: optionalRecord(body, "reviewSpec"),
					}),
				);
			}
		}

		if (
			input.request.method === "POST" &&
			parts[0] === "marketplace" &&
			parts[1] === "assets" &&
			parts[2] &&
			parts[3] === "express-interest"
		) {
			const details = await getWorkflowMarketplaceAsset(input.store, input.user, parts[2], { lane });
			if (!details) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);

			await validateLeadProtection({
				store: input.store,
				request: input.request,
				user,
				assetId: parts[2],
				body,
				env: input.env,
			});

			const result = await expressWorkflowInterest(input.store, user, parts[2], {
				name: asOptionalString(body.name),
				officialEmail: asOptionalString(body.officialEmail),
				phone: asOptionalString(body.phone),
				employerName: asOptionalString(body.employerName),
				offeredPrice: optionalNumber(body, "offeredPrice"),
				requestedStartDate: asOptionalString(body.requestedStartDate),
				requestedMinimumMonths: optionalNumber(body, "requestedMinimumMonths"),
				message: asOptionalString(body.message),
				interestSpec: optionalRecord(body, "interestSpec"),
				acceptedConditionsVersion: optionalNumber(body, "acceptedConditionsVersion"),
				acceptedConditionsHash: asOptionalString(body.acceptedConditionsHash),
				workflowDefinitionId: asOptionalString(body.workflowDefinitionId),
				workflowDefinitionVersion: optionalNumber(body, "workflowDefinitionVersion"),
			});

			return jsonOk(
				{
					interestId: result.interest.id,
					assetId: result.asset.id,
					workflowInstanceId: result.instance.id,
					redirectTo: wf1WorkspaceHref(lane, String(result.instance.id)),
					...result,
				},
				201,
			);
		}

		if (input.request.method === "GET" && parts[0] === "workspaces" && parts[1]) {
			return jsonOk(await getWf1WorkflowInstanceWorkspace(input.store, user, parts[1]));
		}

		if (
			input.request.method === "GET" &&
			parts[0] === "assets" &&
			parts[1] &&
			parts[2] === "workspace"
		) {
			return jsonOk(await getWorkflowAssetWorkspace(input.store, user, parts[1]));
		}

		if (
			input.request.method === "GET" &&
			parts[0] === "interests" &&
			parts[1] &&
			parts[2] === "workspace"
		) {
			return jsonOk(await getWorkflowInterestWorkspace(input.store, user, parts[1]));
		}

		if (input.request.method === "POST" && input.path === "workflow/cards") {
			return jsonOk(
				await createWorkflowCard(input.store, user, {
					workflowInstanceId: stringField(body, "workflowInstanceId"),
					cardType: stringField(body, "cardType"),
					prompt: asOptionalString(body.prompt),
					cardSpec: optionalRecord(body, "cardSpec"),
					attachments: optionalArray(body, "attachments"),
				}),
				201,
			);
		}

		if (
			input.request.method === "POST" &&
			parts[0] === "workflow" &&
			parts[1] === "cards" &&
			parts[2]
		) {
			if (parts[3] === "answer") {
				return jsonOk(
					await answerWorkflowCard(input.store, user, parts[2], {
						answer: optionalRecord(body, "answer") ?? {},
						message: asOptionalString(body.message),
						attachments: optionalArray(body, "attachments"),
					}),
					201,
				);
			}

			if (parts[3] === "decision") {
				return jsonOk(
					await decideWorkflowCard(input.store, user, parts[2], {
						decision: stringField(body, "decision") as "accept",
					}),
				);
			}
		}

		if (input.request.method === "POST" && input.path === "workflow/actions") {
			return jsonOk(
				await runWorkflowAction(input.store, user, {
					workflowInstanceId: stringField(body, "workflowInstanceId"),
					actionId: stringField(body, "actionId"),
					actionSpec: optionalRecord(body, "actionSpec"),
				}),
			);
		}

		if (input.request.method === "POST" && input.path === "documents") {
			return jsonOk(
				await createTenantDocument(input.store, user, {
					documentKind: stringField(body, "documentKind"),
					documentLabel: stringField(body, "documentLabel"),
					storageKey: asOptionalString(body.storageKey),
					mimeType: asOptionalString(body.mimeType),
					documentSpec: optionalRecord(body, "documentSpec"),
				}),
				201,
			);
		}

		if (input.request.method === "POST" && input.path === "evidence/attach") {
			return jsonOk(
				await attachEvidence(input.store, user, {
					cardId: stringField(body, "cardId"),
					tenantDocumentId: asOptionalString(body.tenantDocumentId),
					attachmentLabel: asOptionalString(body.attachmentLabel),
					storageKey: asOptionalString(body.storageKey),
					mimeType: asOptionalString(body.mimeType),
					attachmentSpec: optionalRecord(body, "attachmentSpec"),
				}),
				201,
			);
		}

		if (
			input.request.method === "GET" &&
			parts[0] === "evidence" &&
			parts[1] &&
			parts[2] === "download"
		) {
			return jsonOk(await evidenceDownload(input.store, user, parts[1]));
		}

		return jsonError(new DomainError("NOT_FOUND", "Not found", 404));
	} catch (error) {
		return jsonError(error);
	}
}

async function evidenceDownload(store: DomainStore, user: UserContext, attachmentId: string) {
	const attachment = await store.get(
		WORKFLOW_RENTAL_COLLECTIONS.EVIDENCE_ATTACHMENTS,
		attachmentId,
	);

	if (!attachment) {
		throw new DomainError("EVIDENCE_NOT_FOUND", "Evidence attachment not found", 404);
	}

	const [asset, interest] = await Promise.all([
		getAssetOrThrow(store, asString(attachment.asset_id)),
		getInterestOrThrow(store, asString(attachment.interest_id)),
	]);

	const role = actorRoleFor(user, asset, interest);

	if (role !== "owner" && role !== "applicant" && role !== "renter") {
		throw new DomainError("FORBIDDEN", "Evidence is private to workflow participants", 403);
	}

	return {
		attachment,
		download: {
			storageKey: attachment.storage_key,
			message: "Private evidence download authorization succeeded.",
		},
	};
}

function testLaneMarker(user: UserContext): Record<string, unknown> {
	return {
		enabled: true,
		fixtureSlug: "manual-test-asset",
		ownerEmail: user.email ?? "",
		createdFor: "manual-prod-test",
		visibleOnlyUnder: "/test-corridor",
	};
}

function withTestLaneConfigSpec(
	configSpec: Record<string, unknown> | undefined,
	user: UserContext,
): Record<string, unknown> {
	return {
		...(configSpec ?? {}),
		testLane: testLaneMarker(user),
	};
}

function isExpressInterestRoute(method: string, parts: string[]): boolean {
	return (
		method === "POST" &&
		parts[0] === "marketplace" &&
		parts[1] === "assets" &&
		typeof parts[2] === "string" &&
		parts[3] === "express-interest"
	);
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
	const rawLength = request.headers.get("content-length");

	if (rawLength) {
		const contentLength = Number(rawLength);
		if (Number.isFinite(contentLength) && contentLength > maxBytes) {
			throw new DomainError("PAYLOAD_TOO_LARGE", "Request payload is too large", 413);
		}
	}

	const text = await request.text();

	if (new TextEncoder().encode(text).byteLength > maxBytes) {
		throw new DomainError("PAYLOAD_TOO_LARGE", "Request payload is too large", 413);
	}

	if (!text.trim()) return {};

	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new DomainError("INVALID_JSON", "Request body must be valid JSON", 400, { cause: error });
	}
}

function requireUser(user: UserContext | null): UserContext {
	if (!user?.id) throw new DomainError("UNAUTHORIZED", "Login required", 401);
	return user;
}

function asOptionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasOwn(object: object, key: PropertyKey): boolean {
	return Object.hasOwn(object, key);
}

function numberQueryParam(request: Request, name: string, fallback: number, max: number): number {
	const url = new URL(request.url);
	const raw = url.searchParams.get(name);
	if (!raw) return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	return Math.min(Math.max(Math.trunc(value), 1), max);
}

function jsonOk(data: unknown, status = 200): Response {
	return Response.json({ ok: true, data }, { status });
}

function jsonError(error: unknown): Response {
	if (error instanceof DomainError) {
		return Response.json(
			{ ok: false, error: { code: error.code, message: error.message } },
			{ status: error.status },
		);
	}

	console.error("[wf-rental] API route failed", error);

	return Response.json(
		{ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal error" } },
		{ status: 500 },
	);
}
