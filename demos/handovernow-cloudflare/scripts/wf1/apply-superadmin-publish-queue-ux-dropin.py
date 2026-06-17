#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CREATE_UX_MARKER = "hn-create-asset-ux-v2"
HIDE_TECH_MARKER = "hn-hide-technical-asset-config-v2"
ADMIN_NAV_MARKER = "isWf1SuperadminViewer"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Could not find expected block for {label}. Stop and inspect manually.")
    return text.replace(old, new, 1)


def patch_test_shell_admin_link() -> None:
    path = "src/components/wf1-test/Wf1TestBase.astro"
    file_path = ROOT / path
    if not file_path.exists():
        print(f"skipped {path}: not found")
        return

    text = read(path)

    if ADMIN_NAV_MARKER not in text:
        text = replace_once(
            text,
            'const user = Astro.locals.user as { email?: string | null } | undefined;\n',
            'const user = Astro.locals.user as { email?: string | null; role?: string | null } | undefined;\nconst isWf1SuperadminViewer = String(user?.role ?? "") === "50" || user?.email === "shudh.datta@gmail.com";\n',
            "test shell superadmin flag",
        )

    if 'href="/test-corridor/wf1/admin"' not in text:
        admin_link = '{isWf1SuperadminViewer ? (\n\t\t\t\t\t\t<a class="rental-button secondary" href="/test-corridor/wf1/admin">Admin</a>\n\t\t\t\t\t) : null}'
        patterns = [
            r'(<a[^>]+href="/test-corridor/wf1/owner/assets/new"[^>]*>.*?</a>)',
            r'(<a[^>]+href="/test-corridor/wf1/owner"[^>]*>.*?</a>)',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.DOTALL)
            if match:
                text = text[: match.end()] + "\n\t\t\t\t\t" + admin_link + text[match.end():]
                break
        else:
            print(f"warning: could not find nav anchor in {path}; admin hub still exists at /test-corridor/wf1/admin")

    write(path, text)
    print(f"patched {path}")


def patch_create_asset_page_ux() -> None:
    path = "src/pages/test-corridor/wf1/owner/assets/new.astro"
    file_path = ROOT / path
    if not file_path.exists():
        print(f"skipped {path}: not found")
        return

    text = read(path)

    if CREATE_UX_MARKER in text:
        print(f"skipped {path}: create UX patch already present")
        return

    script = r'''

<script is:inline data-hn-create-asset-ux-v2>
(() => {
	const DRAFT_KEY = "hn:wf1:test:create-asset:draft:v2";
	const NOTICE_CLASS = "hn-create-asset-auth-notice";

	function loggedIn() {
		const bodyText = document.body.textContent || "";
		return bodyText.includes("Logout") || /Welcome\s+[^\s@]+@[^\s@]+/.test(bodyText);
	}

	function safeLoginUrl() {
		return `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
	}

	function candidateForms() {
		return Array.from(document.querySelectorAll("form")).filter((form) => form.querySelector("input, textarea, select"));
	}

	function mainForm() {
		const forms = candidateForms();
		return forms.find((form) => /asset|flat|property|marketplace|bedroom|furnishing/i.test(form.textContent || "")) || forms[0] || null;
	}

	function controlsFor(form) {
		return Array.from(form.querySelectorAll("input, textarea, select")).filter((control) => {
			if (!control.name && !control.id) return false;
			if (control.type === "file") return false;
			if (control.type === "password") return false;
			return true;
		});
	}

	function saveDraft() {
		const form = mainForm();
		if (!form) return;
		const fields = {};
		for (const control of controlsFor(form)) {
			const key = control.name || control.id;
			if (!key) continue;
			if (control.type === "checkbox" || control.type === "radio") {
				fields[key] = { checked: Boolean(control.checked), value: control.value };
			} else {
				fields[key] = { value: control.value };
			}
		}
		try {
			sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), fields }));
		} catch {}
	}

	function restoreDraft() {
		const form = mainForm();
		if (!form) return;
		let parsed = null;
		try {
			parsed = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
		} catch {}
		if (!parsed || !parsed.fields) return;
		for (const control of controlsFor(form)) {
			const key = control.name || control.id;
			const saved = parsed.fields[key];
			if (!saved) continue;
			if (control.type === "checkbox" || control.type === "radio") {
				control.checked = Boolean(saved.checked);
			} else if (typeof saved.value === "string" && !control.value) {
				control.value = saved.value;
			}
		}
		showNotice("We restored your saved form after login. Please reselect the photo/PDF, because browsers do not restore file inputs for security.");
	}

	function showNotice(message) {
		const form = mainForm();
		if (!form) return;
		let notice = document.querySelector(`.${NOTICE_CLASS}`);
		if (!notice) {
			notice = document.createElement("div");
			notice.className = NOTICE_CLASS;
			form.prepend(notice);
		}
		notice.textContent = message;
	}

	function guardLogin(event, message) {
		if (loggedIn()) return false;
		event.preventDefault();
		saveDraft();
		showNotice(message);
		setTimeout(() => {
			location.href = safeLoginUrl();
		}, 120);
		return true;
	}

	function improveMandatoryReviewCheckbox() {
		for (const checkbox of document.querySelectorAll("input[type='checkbox']")) {
			const label = checkbox.closest("label") || checkbox.parentElement;
			const labelText = label?.textContent || "";
			if (!/request marketplace review/i.test(labelText)) continue;
			checkbox.checked = true;
			checkbox.style.position = "absolute";
			checkbox.style.opacity = "0";
			checkbox.style.pointerEvents = "none";
			if (label && !label.querySelector("[data-review-required-pill]")) {
				const pill = document.createElement("span");
				pill.dataset.reviewRequiredPill = "true";
				pill.className = "hn-review-required-pill";
				pill.textContent = "Marketplace review is required before listing";
				label.textContent = "";
				label.append(checkbox, pill);
			}
		}
	}

	function attachGuards() {
		const form = mainForm();
		if (!form) return;

		form.addEventListener("input", saveDraft, { passive: true });
		form.addEventListener("change", saveDraft, { passive: true });

		for (const fileInput of form.querySelectorAll("input[type='file']")) {
			fileInput.addEventListener("click", (event) => {
				guardLogin(event, "Login is needed before photo/PDF upload. Your typed listing details are saved and will be restored after login.");
			});
		}

		form.addEventListener("submit", (event) => {
			guardLogin(event, "Login is needed before sending the asset for marketplace review. Your typed listing details are saved and will be restored after login.");
		});

		if (!loggedIn()) {
			showNotice("You can fill the listing now. Login is needed only before upload or final review request; typed fields are saved in this browser.");
		}
	}

	restoreDraft();
	improveMandatoryReviewCheckbox();
	attachGuards();
})();
</script>

<style is:global>
	.hn-create-asset-auth-notice {
		border: 1px solid rgba(234, 88, 12, 0.35);
		border-radius: var(--r-radius);
		padding: 12px 14px;
		margin: 0 0 16px;
		background: rgba(255, 247, 237, 0.92);
		color: var(--r-brand-strong);
		font-weight: 750;
	}

	.hn-review-required-pill {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--r-border);
		border-radius: 999px;
		padding: 6px 10px;
		background: var(--r-panel-soft);
		color: var(--r-muted);
		font-weight: 800;
	}
</style>
'''

    if "</Wf1TestBase>" in text:
        text = text.replace("</Wf1TestBase>", script + "\n</Wf1TestBase>", 1)
    else:
        text += script

    write(path, text)
    print(f"patched {path}")


def patch_marketplace_asset_technical_rows() -> None:
    path = "src/pages/test-corridor/wf1/marketplace/assets/[assetId].astro"
    file_path = ROOT / path
    if not file_path.exists():
        print(f"skipped {path}: not found")
        return

    text = read(path)
    if HIDE_TECH_MARKER in text:
        print(f"skipped {path}: technical row hider already present")
        return

    script = r'''

<script is:inline data-hn-hide-technical-asset-config-v2>
(() => {
	const hiddenLabels = new Set([
		"thumbnail media ref",
		"media refs",
		"draft id",
		"test lane",
		"storage key",
		"upload id",
		"media id",
	]);

	for (const labelNode of document.querySelectorAll("dt, th, strong")) {
		const normalized = (labelNode.textContent || "").trim().toLowerCase();
		if (!hiddenLabels.has(normalized)) continue;
		const row = labelNode.closest("div, tr, li");
		if (row) row.setAttribute("hidden", "hidden");
	}
})();
</script>
'''

    if "</Wf1TestBase>" in text:
        text = text.replace("</Wf1TestBase>", script + "\n</Wf1TestBase>", 1)
    else:
        text += script

    write(path, text)
    print(f"patched {path}")


def main() -> None:
    patch_test_shell_admin_link()
    patch_create_asset_page_ux()
    patch_marketplace_asset_technical_rows()
    print("Superadmin publish queue UX drop-in patch complete.")


if __name__ == "__main__":
    main()
