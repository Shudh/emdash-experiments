import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import type { Wf1Lane } from "../routing/lane.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import { actorRoleFor, getAssetOrThrow, getInterestOrThrow } from "../store/repository.js";
import {
	assertWf1UploadContentLength,
	createWf1MediaUpload,
	defineStoreOnAuthorization,
	enforceWf1UploadQuota,
	requireWf1MediaRuntime,
} from "../uploads/emdash-media-upload.js";
import { authorizeWf1Upload, parseWf1UploadFormInput } from "../uploads/upload-policy.js";
import type { Wf1EmDashMediaRuntime, Wf1UploadRouteResult } from "../uploads/types.js";

function fileFromFormData(formData: FormData): File {
	const fileEntry = formData.get("file");
	const file = fileEntry instanceof File ? fileEntry : null;

	if (!file || file.size <= 0) {
		throw new DomainError("NO_FILE", "No upload file was provided", 400);
	}

	return file;
}

export async function handleWf1UploadRoute(input: {
	request: Request;
	store: DomainStore;
	user: UserContext;
	lane: Wf1Lane;
	emdash: Wf1EmDashMediaRuntime | null | undefined;
}): Promise<Wf1UploadRouteResult> {
	assertWf1UploadContentLength(input.request);
	requireWf1MediaRuntime(input.emdash);

	const formData = await input.request.formData();
	const file = fileFromFormData(formData);
	const formInput = parseWf1UploadFormInput(formData);
	const authorization = defineStoreOnAuthorization(
		await authorizeWf1Upload(input.store, input.user, input.lane, formInput),
		input.store,
	);

	await enforceWf1UploadQuota(authorization, file);

	return createWf1MediaUpload(input.emdash, authorization, file);
}

export async function streamWf1EvidenceAttachment(input: {
	store: DomainStore;
	user: UserContext;
	emdash: Wf1EmDashMediaRuntime | null | undefined;
	attachmentId: string;
}): Promise<Response> {
	const runtime = requireWf1MediaRuntime(input.emdash);
	const attachment = await input.store.get(
		WORKFLOW_RENTAL_COLLECTIONS.EVIDENCE_ATTACHMENTS,
		input.attachmentId,
	);

	if (!attachment) {
		throw new DomainError("EVIDENCE_NOT_FOUND", "Evidence attachment not found", 404);
	}

	const [asset, interest] = await Promise.all([
		getAssetOrThrow(input.store, asString(attachment.asset_id)),
		getInterestOrThrow(input.store, asString(attachment.interest_id)),
	]);
	const role = actorRoleFor(input.user, asset, interest);

	if (role !== "owner" && role !== "applicant" && role !== "renter") {
		throw new DomainError("FORBIDDEN", "Evidence is private to workflow participants", 403);
	}

	if (!runtime.storage.download) {
		throw new DomainError("DOWNLOAD_NOT_SUPPORTED", "Configured media storage cannot stream downloads", 501);
	}

	const storageKey = asString(attachment.storage_key);
	if (!storageKey) {
		throw new DomainError("EVIDENCE_FILE_MISSING", "Evidence attachment has no storage key", 404);
	}

	const file = await runtime.storage.download(storageKey);
	const headers = new Headers({
		"Content-Type": file.contentType || asString(attachment.mime_type, "application/octet-stream"),
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff",
	});

	if (file.size > 0) headers.set("Content-Length", String(file.size));

	const label = asString(attachment.attachment_label, "evidence").replace(/[\r\n"]/g, " ");
	headers.set("Content-Disposition", `inline; filename="${label}"`);

	return new Response(file.body, { status: 200, headers });
}
