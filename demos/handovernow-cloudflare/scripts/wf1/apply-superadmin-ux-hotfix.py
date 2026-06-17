#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARKETPLACE_FILE = "src/pages/test-corridor/wf1/marketplace/assets/[id].astro"
ADMIN_FORM_FILES = [
    "src/pages/test-corridor/wf1/admin/publish-queue.astro",
    "src/pages/test-corridor/wf1/admin/assets/[assetId].astro",
]
TECH_MARKER = "data-hn-hide-technical-asset-config-v2"
FORM_MARKER = "data-hn-admin-review-form-v2"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def patch_marketplace_asset_detail() -> None:
    path = MARKETPLACE_FILE
    file_path = ROOT / path
    if not file_path.exists():
        raise SystemExit(f"Expected marketplace asset route not found: {path}")

    text = read(path)

    # Remove any previous broken or partial version of this injected block.
    text = re.sub(
        r"\n*<script\s+is:inline\s+data-hn-hide-technical-asset-config-v2>[\s\S]*?</script>\n*",
        "\n",
        text,
        count=1,
    )

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

	function normalize(text) {
		return String(text || "")
			.replace(/\s+/g, " ")
			.replace(/:$/, "")
			.trim()
			.toLowerCase();
	}

	function hideRowForLabel(labelNode) {
		const label = normalize(labelNode.textContent);
		if (!hiddenLabels.has(label)) return;

		const row =
			labelNode.closest("tr") ||
			labelNode.closest("dl > div") ||
			labelNode.closest("li") ||
			labelNode.parentElement;

		if (row) {
			row.setAttribute("hidden", "hidden");
		}
	}

	for (const labelNode of document.querySelectorAll("dt, th, strong, b")) {
		hideRowForLabel(labelNode);
	}

	for (const row of document.querySelectorAll("tr, dl > div, li")) {
		const firstCell = row.querySelector("dt, th, strong, b") || row.firstElementChild;
		if (firstCell) hideRowForLabel(firstCell);
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


def patch_admin_form_script(path: str) -> None:
    file_path = ROOT / path
    if not file_path.exists():
        raise SystemExit(f"Expected admin page not found: {path}")

    text = read(path)

    if FORM_MARKER in text:
        print(f"skipped {path}: admin form script already patched")
        return

    old = 'for (const form of document.querySelectorAll("[data-admin-review-form]")) {'
    new = (
        f'for (const element of document.querySelectorAll("[data-admin-review-form]")) {{\n'
        f'\t\tconst form = element instanceof HTMLFormElement ? element : null;\n'
        f'\t\tif (!form) continue;\n'
        f'\t\tform.dataset.hnAdminReviewFormV2 = "true";'
    )

    if old not in text:
        raise SystemExit(f"Could not find admin review form loop in {path}. Stop and inspect manually.")

    text = text.replace(old, new, 1)
    write(path, text)
    print(f"patched {path}")


def main() -> None:
    patch_marketplace_asset_detail()
    for path in ADMIN_FORM_FILES:
        patch_admin_form_script(path)
    print("Superadmin UX hotfix complete.")


if __name__ == "__main__":
    main()
