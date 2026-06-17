#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    full = ROOT / path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")
    print(f"patched {path}")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Could not find expected block for {label}. Stop and inspect manually.")
    return text.replace(old, new, 1)


def patch_host_policy() -> None:
    path = "src/lib/wf1/routing/host-policy.ts"
    text = read(path)
    old = '''export function applyTestLaneNoStoreHeaders(headers: Headers): void {
\theaders.set("cache-control", "no-store");
\theaders.set("x-robots-tag", "noindex, nofollow");
}
'''
    new = '''export function applyTestLaneNoStoreHeaders(headers: Headers): void {
\theaders.set("cache-control", "no-store, no-cache, max-age=0, must-revalidate");
\theaders.set("pragma", "no-cache");
\theaders.set("expires", "0");
\theaders.set("x-robots-tag", "noindex, nofollow");
}
'''
    if old in text:
        text = text.replace(old, new, 1)
        write(path, text)
    elif 'no-store, no-cache, max-age=0, must-revalidate' in text:
        print(f"already patched {path}")
    else:
        raise SystemExit(f"Could not find expected block for {path} no-store headers. Stop and inspect manually.")


def patch_chat_storage() -> None:
    path = "src/features/wf1-chatbotify/prescreenStorage.ts"
    text = read(path)
    updated = text.replace("window.localStorage", "window.sessionStorage")
    if updated != text:
        write(path, updated)
    elif "window.sessionStorage" in text:
        print(f"already patched {path}")
    else:
        raise SystemExit(f"Could not find browser storage usage in {path}. Stop and inspect manually.")


def strip_legacy_owner_autosave_script(text: str) -> str:
    # This old UX script auto-saved every input/change and showed the noisy restore notice.
    text, script_count = re.subn(
        r"\n<script is:inline data-hn-create-asset-ux-v2>.*?</script>\s*",
        "\n",
        text,
        flags=re.S,
    )
    if script_count:
        print("removed legacy create-asset autosave/login script")

    # Remove the matching legacy notice/pill style block if present.
    text, style_count = re.subn(
        r"\n<style is:global>\s*\.hn-create-asset-auth-notice.*?</style>\s*",
        "\n",
        text,
        flags=re.S,
    )
    if style_count:
        print("removed legacy create-asset notice style")
    return text


def patch_owner_page() -> None:
    path = "src/pages/test-corridor/wf1/owner/assets/new.astro"
    text = read(path)

    text = strip_legacy_owner_autosave_script(text)

    # Honeypot must never be visible and must never be draft-restored.
    honeypot_replacement = (
        '<input class="hn-hidden-trap-input" type="text" name="companyWebsite" autocomplete="off" tabindex="-1" '
        'aria-hidden="true" value="" hidden '
        'style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;" />'
    )
    text, honeypot_count = re.subn(
        r'<input class="hn-hidden-trap-input"[^>]*name="companyWebsite"[^>]*/>',
        honeypot_replacement,
        text,
        count=1,
    )
    if honeypot_count != 1 and "hn-hidden-trap-input" not in text:
        print("honeypot input not present; skipped honeypot hard-hide")
    elif honeypot_count:
        print("hard-hidden owner create honeypot input")

    # Make the review checkbox deterministic without the removed legacy script.
    text = text.replace(
        '<input name="publish" type="checkbox" />\n\t\t\t\t\t\t\tRequest marketplace review',
        '<input name="publish" type="checkbox" checked hidden />\n\t\t\t\t\t\t\tMarketplace review is required before listing',
    )

    # New login-redirect-only draft key. No continuous storage, no old-key restore.
    text = re.sub(
        r'const CREATE_DRAFT_KEY = "[^"]+";',
        'const CREATE_DRAFT_KEY = "hn:wf1:test:create-asset:login-redirect:v4";\n\tconst CREATE_DRAFT_SCHEMA_VERSION = 4;',
        text,
        count=1,
    )

    # Replace save/restore helpers. They now use an allowlist, sessionStorage only, clear after restore,
    # and never show any restore notice.
    save_restore_re = re.compile(
        r"\n\tfunction saveCreateAssetDraft\(\) \{.*?\n\tfunction safeLoginUrl\(\) \{",
        re.S,
    )
    save_restore_new = r'''
	const CREATE_DRAFT_ALLOWED_FIELD_NAMES = new Set([
		"assetKind",
		"title",
		"locationLabel",
		"publicPrice",
		"minimumMonths",
		"bedrooms",
		"furnishing",
		"walls",
		"depositPolicy",
		"preScreenQuestionsJson",
		"publish",
	]);

	const CREATE_DRAFT_ALLOWED_FIELD_PREFIXES = ["inventory."];

	function createAssetDraftKeyForControl(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
		const key = control.name || control.id;
		if (!key) return "";
		if (CREATE_DRAFT_ALLOWED_FIELD_NAMES.has(key)) return key;
		if (CREATE_DRAFT_ALLOWED_FIELD_PREFIXES.some((prefix) => key.startsWith(prefix))) return key;
		return "";
	}

	function purgeOldCreateAssetDrafts() {
		for (const storage of [window.sessionStorage, window.localStorage]) {
			for (const key of Object.keys(storage)) {
				if (key === CREATE_DRAFT_KEY) continue;
				if (key.startsWith("hn:wf1:test:create-asset")) storage.removeItem(key);
			}
		}
	}

	function draftControlHasMeaningfulValue(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
		if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
			return control.checked;
		}
		return control.value.trim() !== "";
	}

	function saveCreateAssetDraft() {
		if (!form) return false;
		const fields: Record<string, unknown> = {};
		let hasMeaningfulField = false;

		for (const control of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")) {
			if (control instanceof HTMLInputElement && control.type === "file") continue;
			if (control instanceof HTMLInputElement && control.type === "password") continue;

			const key = createAssetDraftKeyForControl(control);
			if (!key) continue;

			if (draftControlHasMeaningfulValue(control)) hasMeaningfulField = true;

			if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
				fields[key] = { checked: control.checked, value: control.value };
			} else {
				fields[key] = { value: control.value };
			}
		}

		if (!hasMeaningfulField) return false;

		try {
			window.sessionStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify({
				schemaVersion: CREATE_DRAFT_SCHEMA_VERSION,
				savedAt: Date.now(),
				fields,
			}));
			return true;
		} catch {
			return false;
		}
	}

	function restoreCreateAssetDraft() {
		purgeOldCreateAssetDrafts();
		if (!form) return false;

		let parsed: { schemaVersion?: number; fields?: Record<string, { value?: string; checked?: boolean }> } | null = null;
		try { parsed = JSON.parse(window.sessionStorage.getItem(CREATE_DRAFT_KEY) || "null"); } catch {}
		if (!parsed?.fields || parsed.schemaVersion !== CREATE_DRAFT_SCHEMA_VERSION) return false;

		let restored = false;
		for (const control of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")) {
			const key = createAssetDraftKeyForControl(control);
			if (!key) continue;

			const saved = parsed.fields[key];
			if (!saved) continue;

			if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
				control.checked = Boolean(saved.checked);
				restored = true;
			} else if (typeof saved.value === "string" && control.value === "") {
				control.value = saved.value;
				restored = true;
			}
		}

		window.sessionStorage.removeItem(CREATE_DRAFT_KEY);
		return restored;
	}

	function clearCreateAssetDraft() {
		window.sessionStorage.removeItem(CREATE_DRAFT_KEY);
	}

	function safeLoginUrl() {'''
    text, sr_count = save_restore_re.subn("\n" + save_restore_new, text, count=1)
    if sr_count != 1:
        raise SystemExit("Could not replace owner create save/restore helpers. Stop and inspect manually.")

    # Stop continuous autosave. Draft is saved only when login redirect is needed.
    text = text.replace('\n\t\tform.addEventListener("input", saveCreateAssetDraft, { passive: true });', "")
    text = text.replace('\n\t\tform.addEventListener("change", saveCreateAssetDraft, { passive: true });', "")

    # Make restore silent and one-shot. Add bfcache reload guard.
    text = text.replace("\n\t\trestoreCreateAssetDraft();\n", "\n\t\trestoreCreateAssetDraft();\n")
    if "event.persisted" not in text:
        marker = "\n\tvoid initAssetCreateGuard();\n"
        text = replace_once(
            text,
            marker,
            """
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) window.location.reload();
	});

	void initAssetCreateGuard();
""",
            "owner bfcache reload guard",
        )

    # Clear one-shot draft after successful create.
    if "clearCreateAssetDraft();" not in text:
        text = replace_once(
            text,
            "\n\t\t\tlocation.href = `/test-corridor/wf1/marketplace/assets/${assetId}`;",
            "\n\t\t\tclearCreateAssetDraft();\n\t\t\tlocation.href = `/test-corridor/wf1/marketplace/assets/${assetId}`;",
            "owner clear create draft on success",
        )

    # Add a CSS belt-and-suspenders rule in the main style block.
    if ".hn-hidden-trap-input" not in text.split("<style>")[-1]:
        text = text.replace(
            "<style>\n",
            "<style>\n\t.hn-hidden-trap-input {\n\t\tposition: absolute !important;\n\t\tleft: -10000px !important;\n\t\ttop: auto !important;\n\t\twidth: 1px !important;\n\t\theight: 1px !important;\n\t\toverflow: hidden !important;\n\t\topacity: 0 !important;\n\t\tpointer-events: none !important;\n\t}\n\n",
            1,
        )

    write(path, text)


def main() -> None:
    patch_owner_page()
    patch_host_policy()
    patch_chat_storage()
    print("WF1 form state/cache hotfix complete.")


if __name__ == "__main__":
    main()
