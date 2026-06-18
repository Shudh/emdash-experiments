#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")
    print(f"patched {path}")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            print(f"already patched {label}")
            return text
        raise SystemExit(f"Could not find patch anchor for {label}")
    return text.replace(old, new, 1)

# Issue 1: marketplace express-interest page: lock both Express Interest and Chat until Turnstile success for logged-in submitters.
path = "src/pages/test-corridor/wf1/marketplace/assets/[id].astro"
text = read(path)
text = replace_once(
    text,
    '<button class="rental-button" type="submit" data-express-interest-submit hidden={turnstileSiteKey !== ""} disabled={turnstileSiteKey !== ""}>',
    '<button class="rental-button" type="submit" data-express-interest-submit data-express-locked-action hidden={turnstileSiteKey !== "" && canExpressInterest} disabled={turnstileSiteKey !== "" && canExpressInterest}>',
    "express-interest submit button lock",
)
text = replace_once(
    text,
    '<button class="rental-button secondary" type="button" data-chatbotify-open>\n\t\t\t\t\t\t\t\t\t\t\t\t\tChat with agent\n\t\t\t\t\t\t\t\t\t\t\t\t</button>',
    '<button class="rental-button secondary" type="button" data-chatbotify-open data-express-locked-action hidden={turnstileSiteKey !== "" && canExpressInterest} disabled={turnstileSiteKey !== "" && canExpressInterest}>\n\t\t\t\t\t\t\t\t\t\t\t\t\tChat with agent\n\t\t\t\t\t\t\t\t\t\t\t\t</button>',
    "chat button lock on express-interest form",
)
old = """\t\t\tconst submit = document.querySelector("[data-express-interest-submit]");

\t\t\tfunction setSubmitReady(ready, message) {
\t\t\t\tif (submit instanceof HTMLButtonElement) {
\t\t\t\t\tsubmit.disabled = !ready;
\t\t\t\t\tsubmit.hidden = !ready;
\t\t\t\t}
\t\t\t\tif (status instanceof HTMLElement && message) status.textContent = message;
\t\t\t}
"""
new = """\t\t\tconst submit = document.querySelector("[data-express-interest-submit]");
\t\t\tconst lockedActions = document.querySelectorAll("[data-express-locked-action]");

\t\t\tfunction setSubmitReady(ready, message) {
\t\t\t\tfor (const action of lockedActions) {
\t\t\t\t\tif (action instanceof HTMLButtonElement) {
\t\t\t\t\t\taction.disabled = !ready;
\t\t\t\t\t\taction.hidden = !ready;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tif (submit instanceof HTMLButtonElement) {
\t\t\t\t\tsubmit.disabled = !ready;
\t\t\t\t\tsubmit.hidden = !ready;
\t\t\t\t}
\t\t\t\tif (status instanceof HTMLElement && message) status.textContent = message;
\t\t\t}
"""
text = replace_once(text, old, new, "Turnstile action locking")
write(path, text)

# Issue 2: applicant workspace must not show Owner dashboard link.
path = "src/pages/test-corridor/wf1/workspaces/[workflowInstanceId].astro"
text = read(path)
text = replace_once(
    text,
    '<a class="rental-button secondary" href="/test-corridor/wf1/owner">Owner dashboard</a>',
    '{viewerRole === "owner" ? <a class="rental-button secondary" href="/test-corridor/wf1/owner">Owner dashboard</a> : null}',
    "owner dashboard link visibility in workspace",
)
write(path, text)

# Issue 4: ActionForm must not silently drop dotted hidden field names if the element lookup fails.
path = "src/components/rental/ActionForm.astro"
text = read(path)
old = """\t\t\tfor (const [name, raw] of data.entries()) {
\t\t\t\tconst element = form.querySelector(`[name="${CSS.escape(name)}"]`);
\t\t\t\tif (!element) continue;
\t\t\t\tconst value = valueFrom(raw, element);
\t\t\t\tif (value === undefined || value === false) continue;
\t\t\t\tsetNested(body, name, value);
\t\t\t}
"""
new = """\t\t\tfor (const [name, raw] of data.entries()) {
\t\t\t\tconst element = form.querySelector(`[name="${CSS.escape(name)}"]`);
\t\t\t\tconst value = element ? valueFrom(raw, element) : String(raw).trim() || undefined;
\t\t\t\tif (value === undefined || value === false) continue;
\t\t\t\tsetNested(body, name, value);
\t\t\t}
"""
text = replace_once(text, old, new, "ActionForm dotted hidden field fallback")
write(path, text)

# Issues 3 and 6: owner dashboard query should include review snapshot.
path = "src/lib/wf1/queries/owner-dashboard.ts"
text = read(path)
text = replace_once(
    text,
    'import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";\n',
    'import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";\nimport { marketplaceReviewSnapshot } from "../core/marketplace-review.js";\n',
    "owner dashboard marketplace review import",
)
old = """\treturn {
\t\tassets: visibleAssets.map((asset) => ({
\t\t\t...asset,
\t\t\tviewer: { relationship: "owner" },
\t\t\tassetState: {
\t\t\t\tid: asString(asset.business_state, "draft"),
\t\t\t\tlabel: asString(asset.business_state, "draft").replaceAll("_", " "),
\t\t\t},
\t\t\tapplications: applicationRowsByAssetId.get(asset.id) ?? [],
\t\t})),
\t\tinbox: applicationRows,
\t\tapplicationRows,
\t};
"""
new = """\tconst assetsWithReview = await Promise.all(
\t\tvisibleAssets.map(async (asset) => {
\t\t\tconst events = await store.list(
\t\t\t\tWORKFLOW_RENTAL_COLLECTIONS.ASSET_EVENTS,
\t\t\t\t{ asset_id: asset.id },
\t\t\t\t{ orderBy: "created_at", direction: "desc", limit: 50 },
\t\t\t);

\t\t\treturn {
\t\t\t\t...asset,
\t\t\t\tviewer: { relationship: "owner" },
\t\t\t\tassetState: {
\t\t\t\t\tid: asString(asset.business_state, "draft"),
\t\t\t\t\tlabel: asString(asset.business_state, "draft").replaceAll("_", " "),
\t\t\t\t},
\t\t\t\tmarketplaceReview: marketplaceReviewSnapshot(events),
\t\t\t\tapplications: applicationRowsByAssetId.get(asset.id) ?? [],
\t\t\t};
\t\t}),
\t);

\treturn {
\t\tassets: assetsWithReview,
\t\tinbox: applicationRows,
\t\tapplicationRows,
\t};
"""
text = replace_once(text, old, new, "owner dashboard asset review snapshot")
write(path, text)

# Issues 3, 5, 6: owner dashboard UI.
path = "src/pages/test-corridor/wf1/owner/index.astro"
text = read(path)
text = replace_once(
    text,
    'import { getRequiredWf1PageContext } from "../../../../lib/wf1/server/context.js";\n',
    'import { getRequiredWf1PageContext } from "../../../../lib/wf1/server/context.js";\nimport { isWf1Superadmin } from "../../../../lib/wf1/core/marketplace-review.js";\n',
    "owner dashboard superadmin import",
)
text = replace_once(text, "\t\t\tapplicationRows: Array<JsonObject>;\n\t\t\terror: null;", "\t\t\tapplicationRows: Array<JsonObject>;\n\t\t\tisSuperadmin: boolean;\n\t\t\terror: null;", "dashboard ok type")
text = replace_once(text, "\t\t\tapplicationRows: Array<JsonObject>;\n\t\t\terror: string;", "\t\t\tapplicationRows: Array<JsonObject>;\n\t\t\tisSuperadmin: boolean;\n\t\t\terror: string;", "dashboard error type")
text = replace_once(text, "\t\t\tapplicationRows: Array.isArray(dashboard.applicationRows)\n\t\t\t\t? (dashboard.applicationRows as Array<JsonObject>)\n\t\t\t\t: [],\n\t\t\terror: null,", "\t\t\tapplicationRows: Array.isArray(dashboard.applicationRows)\n\t\t\t\t? (dashboard.applicationRows as Array<JsonObject>)\n\t\t\t\t: [],\n\t\t\tisSuperadmin: isWf1Superadmin(user),\n\t\t\terror: null,", "dashboard superadmin true return")
text = text.replace("""\t\t\t\tassets: [],
\t\t\t\tapplicationRows: [],
\t\t\t\terror: `${error.code}: ${error.message}`,""", """\t\t\t\tassets: [],
\t\t\t\tapplicationRows: [],
\t\t\t\tisSuperadmin: false,
\t\t\t\terror: `${error.code}: ${error.message}`,""")
text = text.replace("""\t\t\tassets: [],
\t\t\tapplicationRows: [],
\t\t\terror: "Owner dashboard could not be loaded.",""", """\t\t\tassets: [],
\t\t\tapplicationRows: [],
\t\t\tisSuperadmin: false,
\t\t\terror: "Owner dashboard could not be loaded.",""")
old = """function rowsFrom(value: unknown): Array<JsonObject> {
\treturn Array.isArray(value)
\t\t? value.filter((item): item is JsonObject => item !== null && typeof item === "object" && !Array.isArray(item))
\t\t: [];
}
"""
new = old + """
function objectValue(value: unknown): JsonObject {
\treturn value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
"""
text = replace_once(text, old, new, "owner dashboard objectValue helper")
text = replace_once(
    text,
    '<a class="rental-button secondary" href="/test-corridor/wf1/admin/publish-queue">Review queue</a>',
    '{dashboard.ok && dashboard.isSuperadmin ? <a class="rental-button secondary" href="/test-corridor/wf1/admin/publish-queue">Review queue</a> : null}',
    "superadmin-only review queue link",
)
old = """\t\t\t\t\t\tconst assetId = String(row.asset.id ?? "");
\t\t\t\t\t\tconst assetState = String(row.asset.business_state ?? "draft");
\t\t\t\t\t\tconst visibilityState = String(row.asset.visibility_state ?? "private");
\t\t\t\t\t\tconst canPublish = (assetState === "draft_asset" || assetState === "listed") && visibilityState !== "marketplace";
"""
new = """\t\t\t\t\t\tconst assetId = String(row.asset.id ?? "");
\t\t\t\t\t\tconst assetState = String(row.asset.business_state ?? "draft");
\t\t\t\t\t\tconst visibilityState = String(row.asset.visibility_state ?? "private");
\t\t\t\t\t\tconst review = objectValue(row.asset.marketplaceReview);
\t\t\t\t\t\tconst reviewState = String(review.state ?? "not_requested");
\t\t\t\t\t\tconst rejectReason = String(review.rejectReason ?? "").trim();
\t\t\t\t\t\tconst configSpec = objectValue(row.asset.config_spec);
\t\t\t\t\t\tconst conditionSpec = objectValue(row.asset.condition_spec);
\t\t\t\t\t\tconst ownerConditionsSpec = objectValue(row.asset.owner_conditions_spec);
\t\t\t\t\t\tconst canPublish = (assetState === "draft_asset" || assetState === "listed") && visibilityState !== "marketplace";
\t\t\t\t\t\tconst canRequestReview = canPublish && reviewState !== "requested";
"""
text = replace_once(text, old, new, "owner dashboard per-asset review/edit variables")
text = text.replace("{canPublish ? (", "{canRequestReview ? (")
old = """\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t<h3>Applications</h3>
"""
new = """\t\t\t\t\t\t\t\t</div>

\t\t\t\t\t\t\t\t{reviewState === "requested" ? (
\t\t\t\t\t\t\t\t\t<p class="rental-muted wf1-review-status">Marketplace review is waiting for superadmin approval.</p>
\t\t\t\t\t\t\t\t) : null}

\t\t\t\t\t\t\t\t{reviewState === "rejected" ? (
\t\t\t\t\t\t\t\t\t<div class="wf1-review-rejected">
\t\t\t\t\t\t\t\t\t\t<strong>Marketplace review rejected.</strong>
\t\t\t\t\t\t\t\t\t\t<p>{rejectReason || "No reason was provided."}</p>
\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t) : null}

\t\t\t\t\t\t\t\t<details class="wf1-owner-edit-panel">
\t\t\t\t\t\t\t\t\t<summary>Edit listing details</summary>
\t\t\t\t\t\t\t\t\t<form data-wf1-owner-config-form action={`/test-corridor/api/wf1-rental/owner/assets/${assetId}/config`}>
\t\t\t\t\t\t\t\t\t\t<div class="rental-form-grid">
\t\t\t\t\t\t\t\t\t\t\t<div class="rental-field"><label>Price<input name="publicPrice" type="number" value={String(row.asset.public_price ?? "")} /></label></div>
\t\t\t\t\t\t\t\t\t\t\t<div class="rental-field"><label>Minimum months<input name="minimumMonths" type="number" value={String(row.asset.minimum_months ?? "")} /></label></div>
\t\t\t\t\t\t\t\t\t\t\t<div class="rental-field"><label>Bedrooms<input name="bedrooms" type="number" value={String(configSpec.bedrooms ?? "")} /></label></div>
\t\t\t\t\t\t\t\t\t\t\t<div class="rental-field"><label>Furnishing<input name="furnishing" value={String(configSpec.furnishing ?? "")} /></label></div>
\t\t\t\t\t\t\t\t\t\t\t<div class="rental-field"><label>Physical condition<input name="walls" value={String(conditionSpec.walls ?? "")} /></label></div>
\t\t\t\t\t\t\t\t\t\t\t<div class="rental-field full"><label>Owner rental conditions<textarea name="depositPolicy">{String(ownerConditionsSpec.depositPolicy ?? "")}</textarea></label></div>
\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t<button class="rental-button secondary" type="submit">Save changes</button>
\t\t\t\t\t\t\t\t\t\t<span class="rental-muted" data-wf1-owner-config-status></span>
\t\t\t\t\t\t\t\t\t</form>
\t\t\t\t\t\t\t\t</details>

\t\t\t\t\t\t\t\t<h3>Applications</h3>
"""
text = replace_once(text, old, new, "owner dashboard review notice and edit details")
old = """\tfor (const form of document.querySelectorAll<HTMLFormElement>("[data-wf1-publish-form]")) {
"""
new = """\tfor (const form of document.querySelectorAll<HTMLFormElement>("[data-wf1-owner-config-form]")) {
\t\tform.addEventListener("submit", async (event) => {
\t\t\tevent.preventDefault();
\t\t\tconst status = form.querySelector<HTMLElement>("[data-wf1-owner-config-status]");
\t\t\tconst submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
\t\t\tconst data = new FormData(form);
\t\t\tif (submit) submit.disabled = true;
\t\t\tif (status) status.textContent = "Saving changes...";
\t\t\ttry {
\t\t\t\tconst response = await fetch(form.action, {
\t\t\t\t\tmethod: "POST",
\t\t\t\t\tcredentials: "same-origin",
\t\t\t\t\theaders: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
\t\t\t\t\tbody: JSON.stringify({
\t\t\t\t\t\tpublicPrice: Number(data.get("publicPrice") || "0"),
\t\t\t\t\t\tminimumMonths: Number(data.get("minimumMonths") || "0"),
\t\t\t\t\t\tconfigSpec: {
\t\t\t\t\t\t\tbedrooms: Number(data.get("bedrooms") || "0"),
\t\t\t\t\t\t\tfurnishing: data.get("furnishing"),
\t\t\t\t\t\t},
\t\t\t\t\t\tconditionSpec: { walls: data.get("walls") },
\t\t\t\t\t\townerConditionsSpec: { depositPolicy: data.get("depositPolicy"), documentsRequired: [] },
\t\t\t\t\t}),
\t\t\t\t});
\t\t\t\tconst payload = await response.json().catch(() => ({}));
\t\t\t\tif (!response.ok) throw new Error(payload?.error?.message ?? "Save failed");
\t\t\t\tif (status) status.textContent = "Saved.";
\t\t\t\tsetTimeout(() => location.reload(), 250);
\t\t\t} catch (error) {
\t\t\t\tif (status) status.textContent = error instanceof Error ? error.message : "Save failed";
\t\t\t\tif (submit) submit.disabled = false;
\t\t\t}
\t\t});
\t}

\tfor (const form of document.querySelectorAll<HTMLFormElement>("[data-wf1-publish-form]")) {
"""
text = replace_once(text, old, new, "owner dashboard edit details submit handler")
text = text.replace("""\t.wf1-inline-publish {
\t\tdisplay: flex;
\t\tflex-wrap: wrap;
\t\talign-items: center;
\t\tgap: 8px;
\t}
""", """\t.wf1-inline-publish,
\t.wf1-owner-edit-panel form {
\t\tdisplay: grid;
\t\tgap: 10px;
\t}

\t.wf1-review-rejected {
\t\tborder: 1px solid rgba(220, 38, 38, 0.28);
\t\tborder-radius: var(--r-radius);
\t\tbackground: rgba(254, 242, 242, 0.9);
\t\tpadding: 12px;
\t}

\t.wf1-review-rejected p {
\t\tmargin: 6px 0 0;
\t}

\t.wf1-inline-publish {
\t\tdisplay: flex;
\t\tflex-wrap: wrap;
\t\talign-items: center;
\t\tgap: 8px;
\t}
""")
write(path, text)

print("HN test QA root fixes applied.")
