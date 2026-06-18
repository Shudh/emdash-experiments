#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()

EDIT_PAGE = """---
import Wf1TestBase from "../../../../../../components/wf1-test/Wf1TestBase.astro";
import Wf1TestLaneBanner from "../../../../../../components/wf1-test/Wf1TestLaneBanner.astro";

import { DomainError, asString } from "../../../../../../lib/domain/types.js";
import { getRequiredWf1PageContext } from "../../../../../../lib/wf1/server/context.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../../../../../../lib/wf1/store/collections.js";
import { assertAssetIdInLane } from "../../../../../../lib/wf1/routing/lane-guard.js";
import { getRuntimeEnvFromLocals } from "../../../../../../lib/wf1/security/runtime-env.js";
import { publicTurnstileSiteKeyFromEnv } from "../../../../../../lib/wf1/security/turnstile.js";
import {
	applyTestLaneNoStoreHeaders,
	testLaneHostRejectionResponse,
} from "../../../../../../lib/wf1/routing/host-policy.js";

export const prerender = false;

const rejection = testLaneHostRejectionResponse(Astro.request);
if (rejection) return rejection;
applyTestLaneNoStoreHeaders(Astro.response.headers);

type JsonObject = Record<string, unknown>;

const assetId = Astro.params.assetId ?? "";
const { store, user } = await getRequiredWf1PageContext(Astro);
await assertAssetIdInLane(store, "test", assetId);

const asset = await store.get(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId);
if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
if (asString(asset.owner_user_id) !== user.id) {
	throw new DomainError("FORBIDDEN", "Only the asset owner can edit this asset", 403);
}

const assetConfigItems = await store.list(
	WORKFLOW_RENTAL_COLLECTIONS.ASSET_CONFIG_ITEMS,
	{ asset_id: asset.id },
	{ orderBy: "created_at", direction: "asc", limit: 500 },
);

const runtimeEnv = getRuntimeEnvFromLocals(Astro.locals);
const turnstileSiteKey = publicTurnstileSiteKeyFromEnv(runtimeEnv) ?? "";
const formStartedAt = new Date().toISOString();
const assetDraftId = `${asset.id}:edit:${crypto.randomUUID()}`;
const wf1UploadUrl = "/test-corridor/api/wf1-rental/uploads";

function isObjectRecord(value: unknown): value is JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function objectValue(value: unknown): JsonObject {
	return isObjectRecord(value) ? value : {};
}

function arrayValue(value: unknown): JsonObject[] {
	return Array.isArray(value) ? value.filter((item): item is JsonObject => isObjectRecord(item)) : [];
}

function stringValue(value: unknown, fallback = ""): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return fallback;
}

function numberValue(value: unknown, fallback = ""): string {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (typeof value === "string" && value.trim()) return value.trim();
	return fallback;
}

function normalizedMediaRef(value: unknown, fallbackKind = "asset_media", fallbackScope = "asset"): JsonObject | null {
	const row = objectValue(value);
	const mediaId = stringValue(row.mediaId ?? row.media_id);
	const uploadId = stringValue(row.uploadId ?? row.upload_id);
	const storageKey = stringValue(row.storageKey ?? row.storage_key);
	const mimeType = stringValue(row.mimeType ?? row.mime_type);
	const filename = stringValue(row.filename ?? row.name, "Asset media");
	const url = stringValue(row.url);
	if (!mediaId && !storageKey && !url) return null;
	return {
		mediaId,
		uploadId,
		storageKey,
		mimeType,
		filename,
		url,
		kind: stringValue(row.kind, fallbackKind),
		scope: stringValue(row.scope, fallbackScope),
		createdAt: stringValue(row.createdAt ?? row.created_at, new Date().toISOString()),
	};
}

function uniqueMediaRefs(values: Array<JsonObject | null>): JsonObject[] {
	const seen = new Set<string>();
	const result: JsonObject[] = [];
	for (const value of values) {
		if (!value) continue;
		const key = stringValue(value.mediaId) || stringValue(value.storageKey) || stringValue(value.url);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}
	return result;
}

const configSpec = objectValue(asset.config_spec);
const conditionSpec = objectValue(asset.condition_spec);
const ownerConditionsSpec = objectValue(asset.owner_conditions_spec);
const initialMediaRefs = uniqueMediaRefs([
	normalizedMediaRef(configSpec.thumbnailMediaRef, "asset_thumbnail", "asset"),
	...arrayValue(configSpec.mediaRefs).map((item) => normalizedMediaRef(item, "asset_gallery", "asset")),
]);

const initialItems = assetConfigItems.map((item) => {
	const spec = objectValue(item.item_spec);
	return {
		id: stringValue(item.id),
		itemKind: stringValue(item.item_kind, "fixture"),
		itemGroup: stringValue(item.item_group),
		itemLabel: stringValue(item.item_label, "Item"),
		quantity: numberValue(spec.quantity, "1"),
		ownerDeclaredState: stringValue(item.owner_declared_state, "working"),
		conditionDetails: stringValue(spec.conditionDetails),
		mediaRefs: arrayValue(item.media_refs).map((media) => normalizedMediaRef(media, "item_evidence", "asset_config_item")).filter(Boolean),
	};
});

function safeJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

const preScreenQuestionsText = JSON.stringify(
	Array.isArray(ownerConditionsSpec.preScreenQuestions) ? ownerConditionsSpec.preScreenQuestions : [],
	null,
	2,
);
---

<Wf1TestBase title="Edit asset" description="Edit WF1 asset details">
	<Wf1TestLaneBanner />

	<section class="rental-section">
		<div class="rental-shell edit-grid">
			<div class="rental-section-header">
				<div>
					<p class="rental-kicker">Owner asset</p>
					<h1>Edit {String(asset.title ?? "asset")}</h1>
					<p class="rental-muted">Edit the full listing, gallery, screening questions, and inventory before sending it for marketplace review again.</p>
				</div>
				<div class="asset-links">
					<a class="rental-button secondary" href="/test-corridor/wf1/owner">Owner dashboard</a>
					<a class="rental-button secondary" href={`/test-corridor/wf1/marketplace/assets/${asset.id}`}>View listing</a>
				</div>
			</div>

			<form
				class="rental-panel edit-asset-form"
				id="asset-edit-form"
				data-asset-id={asset.id}
				data-asset-draft-id={assetDraftId}
				data-wf1-upload-url={wf1UploadUrl}
				data-turnstile-site-key={turnstileSiteKey}
				data-form-started-at={formStartedAt}
				data-edit-locked="true"
			>
				<input type="hidden" name="assetDraftToken" value="" data-asset-draft-token />
				<input type="hidden" name="draftId" value={assetDraftId} />
				<input type="hidden" name="formStartedAt" value={formStartedAt} />
				<input class="hn-hidden-trap-input" type="text" name="companyWebsite" autocomplete="off" tabindex="-1" aria-hidden="true" value="" hidden style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;" />

				<div class="asset-draft-guard" data-hn-asset-edit-guard-v1>
					<p class="rental-muted" data-asset-edit-guard-status>Complete verification to unlock media upload and save edits.</p>
					<div data-asset-edit-turnstile data-site-key={turnstileSiteKey}></div>
				</div>

				<section class="form-section">
					<div>
						<p class="rental-kicker">Listing</p>
						<h2>Core details</h2>
					</div>
					<div class="rental-form-grid">
						<div class="rental-field">
							<label for="assetKind">Asset kind</label>
							<select id="assetKind" name="assetKind">
								{["flat", "villa", "independent_house", "room", "commercial_unit", "rentable_asset"].map((kind) => (
									<option value={kind} selected={String(asset.asset_kind ?? "flat") === kind}>{kind.replaceAll("_", " ")}</option>
								))}
							</select>
						</div>
						<div class="rental-field">
							<label for="title">Title</label>
							<input id="title" name="title" required value={String(asset.title ?? "")} />
						</div>
						<div class="rental-field">
							<label for="locationLabel">Location</label>
							<input id="locationLabel" name="locationLabel" value={String(asset.location_label ?? "")} />
						</div>
						<div class="rental-field">
							<label for="publicPrice">Price</label>
							<input id="publicPrice" name="publicPrice" type="number" value={numberValue(asset.public_price)} />
						</div>
						<div class="rental-field">
							<label for="minimumMonths">Minimum months</label>
							<input id="minimumMonths" name="minimumMonths" type="number" value={numberValue(asset.minimum_months)} />
						</div>
						<div class="rental-field">
							<label for="bedrooms">Bedrooms</label>
							<input id="bedrooms" name="bedrooms" type="number" value={numberValue(configSpec.bedrooms)} />
						</div>
						<div class="rental-field">
							<label for="furnishing">Furnishing</label>
							<input id="furnishing" name="furnishing" value={stringValue(configSpec.furnishing)} />
						</div>
						<div class="rental-field">
							<label for="walls">Physical condition</label>
							<input id="walls" name="walls" value={stringValue(conditionSpec.walls)} />
						</div>
						<div class="rental-field full">
							<label for="depositPolicy">Owner rental conditions</label>
							<textarea id="depositPolicy" name="depositPolicy">{String(ownerConditionsSpec.depositPolicy ?? "")}</textarea>
						</div>
						<div class="rental-field full">
							<label for="preScreenQuestionsJson">Screening questions JSON</label>
							<textarea id="preScreenQuestionsJson" name="preScreenQuestionsJson" rows="8">{preScreenQuestionsText}</textarea>
							<p class="rental-muted">Keep as a JSON array. This preserves the headless owner condition contract.</p>
						</div>
					</div>
				</section>

				<section class="form-section">
					<div class="section-head">
						<div>
							<p class="rental-kicker">Media</p>
							<h2>Images and files</h2>
							<p class="rental-muted">At least one image is required. Drag primary media to the top by using Make primary.</p>
						</div>
						<label class="rental-button secondary upload-label">
							Add image/PDF
							<input type="file" accept="image/*,application/pdf" data-add-asset-media hidden />
						</label>
					</div>
					<div class="media-editor" data-media-editor></div>
				</section>

				<section class="form-section">
					<div class="section-head">
						<div>
							<p class="rental-kicker">Inventory</p>
							<h2>Asset config items</h2>
							<p class="rental-muted">Add, remove, and update item rows. Each item can carry optional image/PDF evidence.</p>
						</div>
						<button class="rental-button secondary" type="button" data-add-inventory-row>Add row</button>
					</div>
					<div class="inventory-editor" data-inventory-editor></div>
				</section>

				<button class="rental-button" type="submit" hidden disabled data-save-asset-edit>Save full listing</button>
				<p class="rental-status" data-edit-status></p>
			</form>
		</div>
	</section>
</Wf1TestBase>

<script type="application/json" id="hn-edit-initial-media" set:html={safeJson(initialMediaRefs)} />
<script type="application/json" id="hn-edit-initial-items" set:html={safeJson(initialItems)} />

<script>
	const form = document.querySelector("#asset-edit-form");
	const mediaEditor = document.querySelector("[data-media-editor]");
	const inventoryEditor = document.querySelector("[data-inventory-editor]");
	const status = document.querySelector("[data-edit-status]");
	const addInventoryButton = document.querySelector("[data-add-inventory-row]");
	const addMediaInput = document.querySelector("[data-add-asset-media]");
	const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

	function parseJsonScript(id, fallback) {
		try {
			const node = document.getElementById(id);
			return node?.textContent ? JSON.parse(node.textContent) : fallback;
		} catch {
			return fallback;
		}
	}

	let mediaRefs = parseJsonScript("hn-edit-initial-media", []);
	let inventoryItems = parseJsonScript("hn-edit-initial-items", []);

	function htmlEscape(value = "") {
		return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
	}

	function browserTurnstile() {
		return window.turnstile;
	}

	function controls() {
		return {
			fileInputs: [...document.querySelectorAll("#asset-edit-form input[type='file']")],
			submitButton: document.querySelector("[data-save-asset-edit]"),
			status: document.querySelector("[data-asset-edit-guard-status]"),
			turnstileSlot: document.querySelector("[data-asset-edit-turnstile]"),
			tokenInput: document.querySelector("[data-asset-draft-token]"),
		};
	}

	function setEditLocked(locked, message) {
		if (!form) return;
		if (locked) form.dataset.editLocked = "true";
		else delete form.dataset.editLocked;
		const ui = controls();
		for (const input of ui.fileInputs) input.disabled = locked;
		if (ui.submitButton) {
			ui.submitButton.disabled = locked;
			ui.submitButton.hidden = locked;
		}
		if (ui.status) ui.status.textContent = message;
	}

	async function loadTurnstileScript() {
		if (browserTurnstile()) return;
		const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
		if (existing) {
			await new Promise((resolve, reject) => {
				existing.addEventListener("load", resolve, { once: true });
				existing.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), { once: true });
			});
			return;
		}
		await new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = TURNSTILE_SCRIPT_URL;
			script.async = true;
			script.addEventListener("load", resolve, { once: true });
			script.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), { once: true });
			document.head.appendChild(script);
		});
	}

	async function issueAssetDraftIntent(turnstileToken) {
		if (!form) throw new Error("Edit form is missing.");
		const response = await fetch("/test-corridor/api/wf1-rental/owner/assets/draft-intent", {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
			body: JSON.stringify({
				draftId: form.dataset.assetDraftId,
				turnstileToken,
				formStartedAt: form.dataset.formStartedAt || new Date().toISOString(),
				companyWebsite: form.querySelector("[name='companyWebsite']")?.value || "",
			}),
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload?.error?.message || "Verification failed.");
		return String((payload?.data || payload)?.assetDraftToken || "");
	}

	async function initEditGuard() {
		if (!form) return;
		const ui = controls();
		const siteKey = form.dataset.turnstileSiteKey || ui.turnstileSlot?.dataset.siteKey || "";
		if (!siteKey || !ui.turnstileSlot || !ui.tokenInput) {
			setEditLocked(true, "Verification is not configured. Ask admin to configure Turnstile before editing media.");
			return;
		}
		setEditLocked(true, "Complete verification to unlock media upload and save edits.");
		try {
			await loadTurnstileScript();
			const api = browserTurnstile();
			if (!api) throw new Error("Turnstile API is unavailable.");
			api.render(ui.turnstileSlot, {
				sitekey: siteKey,
				appearance: "interaction-only",
				callback: async (token) => {
					try {
						ui.tokenInput.value = await issueAssetDraftIntent(String(token));
						setEditLocked(false, "Verified. You can now edit media, inventory, and listing details.");
					} catch (error) {
						ui.tokenInput.value = "";
						setEditLocked(true, error instanceof Error ? error.message : "Verification failed.");
					}
				},
				"expired-callback": () => {
					ui.tokenInput.value = "";
					setEditLocked(true, "Verification expired. Please verify again.");
				},
				"error-callback": () => {
					ui.tokenInput.value = "";
					setEditLocked(true, "Verification failed. Please retry.");
				},
			});
		} catch (error) {
			setEditLocked(true, error instanceof Error ? error.message : "Verification could not load.");
		}
	}

	function assetDraftToken() {
		return form?.querySelector("[name='assetDraftToken']")?.value || "";
	}

	async function uploadMediaFile(file, kind, scope, clientItemId) {
		if (!form) throw new Error("Edit form is missing.");
		const token = assetDraftToken();
		if (!token) throw new Error("Complete verification before uploading media.");
		const body = new FormData();
		body.append("file", file);
		body.append("purpose", "asset_draft_media");
		body.append("draftId", form.dataset.assetDraftId || "");
		body.append("assetDraftToken", token);
		body.append("clientItemId", clientItemId);
		const response = await fetch(form.dataset.wf1UploadUrl || "/test-corridor/api/wf1-rental/uploads", {
			method: "POST",
			credentials: "same-origin",
			headers: { "X-EmDash-Request": "1" },
			body,
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload?.error?.message || "Media upload failed");
		const data = payload?.data || payload;
		const item = data?.item || data?.media || {};
		const upload = data?.upload || {};
		return {
			mediaId: String(item?.id || ""),
			uploadId: String(upload?.id || ""),
			storageKey: String(item?.storageKey || ""),
			mimeType: String(item?.mimeType || file.type),
			filename: String(item?.filename || file.name),
			url: String(item?.url || ""),
			kind,
			scope,
			createdAt: new Date().toISOString(),
		};
	}

	function renderMediaList() {
		if (!mediaEditor) return;
		mediaEditor.innerHTML = mediaRefs.length ? mediaRefs.map((media, index) => `
			<article class="media-row" data-media-index="${index}">
				<div>
					<strong>${htmlEscape(media.filename || "Asset media")}</strong>
					<span class="rental-muted">${htmlEscape(media.mimeType || "unknown")}</span>
				</div>
				<div class="asset-links">
					${String(media.url || "") ? `<a class="rental-button secondary" href="${htmlEscape(media.url)}" target="_blank" rel="noreferrer">Open</a>` : ""}
					${index > 0 && String(media.mimeType || "").startsWith("image/") ? `<button class="rental-button secondary" type="button" data-make-primary="${index}">Make primary</button>` : ""}
					<button class="rental-button secondary" type="button" data-remove-media="${index}">Remove</button>
				</div>
			</article>
		`).join("") : `<p class="rental-muted">No media saved yet. Add at least one image before saving.</p>`;
		mediaEditor.querySelectorAll("[data-remove-media]").forEach((button) => button.addEventListener("click", () => {
			mediaRefs.splice(Number(button.dataset.removeMedia), 1);
			renderMediaList();
		}));
		mediaEditor.querySelectorAll("[data-make-primary]").forEach((button) => button.addEventListener("click", () => {
			const index = Number(button.dataset.makePrimary);
			const [item] = mediaRefs.splice(index, 1);
			if (item) mediaRefs.unshift(item);
			renderMediaList();
		}));
	}

	function renderInventoryRows() {
		if (!inventoryEditor) return;
		inventoryEditor.innerHTML = inventoryItems.map((item, index) => `
			<article class="inventory-row" data-inventory-index="${index}">
				<label>Item label <input name="itemLabel" value="${htmlEscape(item.itemLabel || "")}" /></label>
				<label>Item kind <input name="itemKind" value="${htmlEscape(item.itemKind || "fixture")}" /></label>
				<label>Room / group <input name="itemGroup" value="${htmlEscape(item.itemGroup || "")}" /></label>
				<label>Quantity <input name="quantity" type="number" value="${htmlEscape(item.quantity || "1")}" /></label>
				<label>Owner declared state <input name="ownerDeclaredState" value="${htmlEscape(item.ownerDeclaredState || "working")}" /></label>
				<label>Item image/PDF evidence <input name="mediaFile" type="file" accept="image/*,application/pdf" /></label>
				<label class="wide">Condition details <textarea name="conditionDetails">${htmlEscape(item.conditionDetails || "")}</textarea></label>
				<div class="wide asset-links">
					<span class="rental-muted" data-item-media-status>${(item.mediaRefs || []).length} media attached</span>
					<button class="rental-button secondary" type="button" data-remove-inventory-row="${index}">Delete row</button>
				</div>
			</article>
		`).join("");
		inventoryEditor.querySelectorAll("[data-remove-inventory-row]").forEach((button) => button.addEventListener("click", () => {
			inventoryItems.splice(Number(button.dataset.removeInventoryRow), 1);
			renderInventoryRows();
		}));
		inventoryEditor.querySelectorAll("[data-inventory-index]").forEach((row) => {
			const input = row.querySelector("input[name='mediaFile']");
			const mediaStatus = row.querySelector("[data-item-media-status]");
			input?.addEventListener("change", async () => {
				const file = input.files?.[0];
				if (!file) return;
				const index = Number(row.dataset.inventoryIndex);
				try {
					if (mediaStatus) mediaStatus.textContent = "Uploading...";
					const media = await uploadMediaFile(file, "item_evidence", "asset_config_item", inventoryItems[index]?.id || crypto.randomUUID());
					inventoryItems[index].mediaRefs = [...(inventoryItems[index].mediaRefs || []), media];
					if (mediaStatus) mediaStatus.textContent = `${inventoryItems[index].mediaRefs.length} media attached`;
				} catch (error) {
					if (mediaStatus) mediaStatus.textContent = error instanceof Error ? error.message : "Upload failed";
					input.value = "";
				}
			});
		});
	}

	function collectInventoryRows() {
		const rows = [...document.querySelectorAll("[data-inventory-index]")];
		return rows.map((row) => {
			const index = Number(row.dataset.inventoryIndex);
			const read = (name) => row.querySelector(`[name="${name}"]`)?.value?.trim() || "";
			const itemLabel = read("itemLabel");
			if (!itemLabel) return null;
			return {
				itemKind: read("itemKind") || "fixture",
				itemGroup: read("itemGroup"),
				itemLabel,
				ownerDeclaredState: read("ownerDeclaredState") || "working",
				itemSpec: {
					quantity: Number(read("quantity") || "1"),
					room: read("itemGroup"),
					conditionDetails: read("conditionDetails"),
				},
				mediaRefs: inventoryItems[index]?.mediaRefs || [],
			};
		}).filter(Boolean);
	}

	function readPreScreenQuestions(raw) {
		try {
			const parsed = JSON.parse(raw || "[]");
			if (!Array.isArray(parsed)) throw new Error("Screening questions must be an array.");
			return parsed.filter((item) => item && typeof item === "object" && !Array.isArray(item));
		} catch (error) {
			throw new Error(error instanceof Error ? `Screening questions are invalid: ${error.message}` : "Screening questions are invalid.");
		}
	}

	async function postJson(url, body) {
		const response = await fetch(url, {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
			body: JSON.stringify(body),
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload?.error?.message || "Save failed");
		return payload.data || payload;
	}

	addMediaInput?.addEventListener("change", async () => {
		const file = addMediaInput.files?.[0];
		if (!file) return;
		try {
			if (status) status.textContent = "Uploading media...";
			mediaRefs.push(await uploadMediaFile(file, file.type.startsWith("image/") ? "asset_gallery" : "asset_file", "asset", crypto.randomUUID()));
			renderMediaList();
			if (status) status.textContent = "Media uploaded.";
		} catch (error) {
			if (status) status.textContent = error instanceof Error ? error.message : "Upload failed";
		} finally {
			addMediaInput.value = "";
		}
	});

	addInventoryButton?.addEventListener("click", () => {
		inventoryItems.push({ id: crypto.randomUUID(), itemKind: "fixture", itemGroup: "", itemLabel: "", quantity: "1", ownerDeclaredState: "working", conditionDetails: "", mediaRefs: [] });
		renderInventoryRows();
	});

	form?.addEventListener("submit", async (event) => {
		event.preventDefault();
		try {
			if (!assetDraftToken()) throw new Error("Complete verification before saving edits.");
			const data = new FormData(form);
			const primaryMediaRef = mediaRefs.find((media) => String(media.mimeType || "").startsWith("image/"));
			if (!primaryMediaRef) throw new Error("At least one property image is required before saving.");
			if (status) status.textContent = "Saving full listing...";
			await postJson(`/test-corridor/api/wf1-rental/owner/assets/${form.dataset.assetId}/config`, {
				assetKind: data.get("assetKind"),
				title: data.get("title"),
				locationLabel: data.get("locationLabel"),
				publicPrice: Number(data.get("publicPrice")),
				currency: "INR",
				minimumMonths: Number(data.get("minimumMonths")),
				configSpec: {
					bedrooms: Number(data.get("bedrooms")),
					furnishing: data.get("furnishing"),
					thumbnailMediaRef: primaryMediaRef,
					mediaRefs,
					draftId: form.dataset.assetDraftId,
				},
				conditionSpec: { walls: data.get("walls") },
				ownerConditionsSpec: {
					depositPolicy: data.get("depositPolicy"),
					documentsRequired: [],
					preScreenQuestions: readPreScreenQuestions(String(data.get("preScreenQuestionsJson") || "[]")),
				},
				items: collectInventoryRows(),
			});
			if (status) status.textContent = "Saved. Returning to owner dashboard...";
			location.href = "/test-corridor/wf1/owner";
		} catch (error) {
			if (status) status.textContent = error instanceof Error ? error.message : "Save failed";
		}
	});

	renderMediaList();
	renderInventoryRows();
	void initEditGuard();
</script>

<style>
	.edit-grid,
	.edit-asset-form,
	.form-section,
	.media-editor,
	.inventory-editor {
		display: grid;
		gap: 16px;
	}

	[data-edit-locked="true"] input[type="file"],
	[data-edit-locked="true"] button[type="submit"] {
		display: none !important;
	}

	.section-head,
	.asset-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.media-row,
	.inventory-row {
		display: grid;
		gap: 10px;
		border: 1px solid var(--r-border);
		border-radius: var(--r-radius);
		padding: 12px;
		background: var(--r-bg);
	}

	.inventory-row {
		grid-template-columns: repeat(3, minmax(150px, 1fr));
	}

	.inventory-row .wide {
		grid-column: 1 / -1;
	}

	.upload-label input {
		display: none;
	}

	@media (max-width: 760px) {
		.inventory-row {
			grid-template-columns: 1fr;
		}
	}
</style>
"""

def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    print(f"patched {path}")

def remove_between(text: str, start_marker: str, end_marker: str, label: str) -> str:
    start = text.find(start_marker)
    if start == -1:
        print(f"{label} block not present")
        return text
    end = text.find(end_marker, start)
    if end == -1:
        raise SystemExit(f"Could not find end marker while removing {label}")
    return text[:start] + text[end:]

def remove_matching_for_block(text: str, marker: str, label: str) -> str:
    start = text.find(marker)
    if start == -1:
        print(f"{label} handler not present")
        return text
    brace = text.find("{", start)
    if brace == -1:
        raise SystemExit(f"Could not find opening brace for {label}")
    depth = 0
    index = brace
    while index < len(text):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                while end < len(text) and text[end] in "\r\n\t ;":
                    end += 1
                return text[:start] + text[end:]
        index += 1
    raise SystemExit(f"Could not find closing brace for {label}")

def patch_owner_dashboard() -> None:
    path = ROOT / "src/pages/test-corridor/wf1/owner/index.astro"
    text = path.read_text(encoding="utf-8")

    # The previous QA rootfix added a small inline edit panel. That is now intentionally removed.
    # The dashboard should only link to the full editor so we do not keep two edit surfaces alive.
    text = remove_between(
        text,
        '\n\t\t\t\t\t\t\t\t<details class="wf1-owner-edit-panel">',
        '\n\n\t\t\t\t\t\t\t\t<h3>Applications</h3>',
        "inline owner edit details",
    )

    text = remove_matching_for_block(
        text,
        '\n\tfor (const form of document.querySelectorAll<HTMLFormElement>("[data-wf1-owner-config-form]"))',
        "inline owner config form",
    )

    if "/test-corridor/wf1/owner/assets/${assetId}/edit" not in text:
        old = '<a class="rental-button secondary" href={`/test-corridor/wf1/marketplace/assets/${assetId}`}>View listing</a>'
        new = old + '\n\t\t\t\t\t\t\t\t\t<a class="rental-button secondary" href={`/test-corridor/wf1/owner/assets/${assetId}/edit`}>Edit full listing</a>'
        if old not in text:
            raise SystemExit("Could not find owner dashboard View listing link. Stop and inspect owner/index.astro.")
        text = text.replace(old, new, 1)
    else:
        print("owner dashboard already links to full edit page")

    path.write_text(text, encoding="utf-8")
    print(f"patched {path.relative_to(ROOT)}")

def patch_handler_config_identity_fields() -> None:
    path = ROOT / "src/lib/wf1/api/handler.ts"
    text = path.read_text(encoding="utf-8")
    marker = "\t\t\t\tconst configInput: UpdateWorkflowAssetConfigInput = {};\n"
    insert = """\n\t\t\t\tif (hasOwn(body, \"assetKind\")) {\n\t\t\t\t\tconfigInput.assetKind = asOptionalString(body.assetKind);\n\t\t\t\t}\n\n\t\t\t\tif (hasOwn(body, \"title\")) {\n\t\t\t\t\tconfigInput.title = asOptionalString(body.title);\n\t\t\t\t}\n\n\t\t\t\tif (hasOwn(body, \"locationLabel\")) {\n\t\t\t\t\tconfigInput.locationLabel = asOptionalString(body.locationLabel);\n\t\t\t\t}\n"""
    if "configInput.title = asOptionalString(body.title)" in text:
        print("handler already accepts asset identity fields in config route")
        return
    if marker not in text:
        raise SystemExit("Could not find configInput marker in handler.ts")
    text = text.replace(marker, marker + insert, 1)
    path.write_text(text, encoding="utf-8")
    print(f"patched {path.relative_to(ROOT)}")

def patch_update_asset_config_identity_fields() -> None:
    path = ROOT / "src/lib/wf1/commands/update-asset-config.ts"
    text = path.read_text(encoding="utf-8")
    if "assetKind?: string;" not in text:
        text = text.replace("export type UpdateWorkflowAssetConfigInput = {\n", "export type UpdateWorkflowAssetConfigInput = {\n\tassetKind?: string;\n\ttitle?: string;\n\tlocationLabel?: string;\n", 1)
    if "asset_kind?: string;" not in text:
        text = text.replace("type AssetPatch = {\n", "type AssetPatch = {\n\tasset_kind?: string;\n\ttitle?: string;\n\tlocation_label?: string;\n", 1)
    if "requiredText(input.title" not in text:
        marker = "\t\tlet configChanged = false;\n"
        insert = """\n\t\tif (hasOwn(input, \"assetKind\")) {\n\t\t\tassetPatch.asset_kind = requiredText(input.assetKind, \"assetKind\");\n\t\t\tconfigChanged = true;\n\t\t}\n\n\t\tif (hasOwn(input, \"title\")) {\n\t\t\tassetPatch.title = requiredText(input.title, \"title\");\n\t\t\tconfigChanged = true;\n\t\t}\n\n\t\tif (hasOwn(input, \"locationLabel\")) {\n\t\t\tassetPatch.location_label = input.locationLabel?.trim() || null;\n\t\t\tconfigChanged = true;\n\t\t}\n"""
        if marker not in text:
            raise SystemExit("Could not find configChanged marker in update-asset-config.ts")
        text = text.replace(marker, marker + insert, 1)
    if "function requiredText(" not in text:
        text += """\n\nfunction requiredText(value: string | undefined, label: string): string {\n\tconst text = value?.trim() ?? \"\";\n\tif (!text) {\n\t\tthrow new DomainError(\"VALIDATION_ERROR\", `${label} is required`, 400);\n\t}\n\treturn text;\n}\n"""
    path.write_text(text, encoding="utf-8")
    print(f"patched {path.relative_to(ROOT)}")

def main() -> None:
    write("src/pages/test-corridor/wf1/owner/assets/[assetId]/edit.astro", EDIT_PAGE)
    patch_owner_dashboard()
    patch_handler_config_identity_fields()
    patch_update_asset_config_identity_fields()
    print("Owner full edit drop-in complete.")

if __name__ == "__main__":
    main()
