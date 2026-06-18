#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()


def patch_edit_page() -> None:
    path = ROOT / "src/pages/test-corridor/wf1/owner/assets/[assetId]/edit.astro"
    if not path.exists():
        raise SystemExit(f"Missing expected edit page: {path}")

    text = path.read_text(encoding="utf-8")

    # Astro processes a plain <script> as TypeScript. The generated edit-page
    # client script is intentionally browser-side JS; keep it inline so astro
    # check does not typecheck DOM querySelector values as Element.
    text = text.replace(
        '<script type="application/json" id="hn-edit-initial-media" set:html={safeJson(initialMediaRefs)} />',
        '<script is:inline type="application/json" id="hn-edit-initial-media" set:html={safeJson(initialMediaRefs)} />',
    )
    text = text.replace(
        '<script type="application/json" id="hn-edit-initial-items" set:html={safeJson(initialItems)} />',
        '<script is:inline type="application/json" id="hn-edit-initial-items" set:html={safeJson(initialItems)} />',
    )

    marker = '<script>\n\tconst form = document.querySelector("#asset-edit-form");'
    if marker in text:
        text = text.replace(marker, '<script is:inline>\n\tconst form = document.querySelector("#asset-edit-form");', 1)
    elif '<script is:inline>\n\tconst form = document.querySelector("#asset-edit-form");' in text:
        pass
    else:
        raise SystemExit("Could not find edit-page browser script marker. Stop and inspect edit.astro manually.")

    path.write_text(text, encoding="utf-8")
    print(f"patched {path}")


def patch_update_asset_config() -> None:
    path = ROOT / "src/lib/wf1/commands/update-asset-config.ts"
    if not path.exists():
        raise SystemExit(f"Missing expected command file: {path}")

    text = path.read_text(encoding="utf-8")
    original = text

    # The edit drop-in intentionally writes null for a cleared location label.
    # The patch type must match that nullable domain field.
    text = text.replace("\tlocation_label?: string;", "\tlocation_label?: string | null;")

    # In case the field was not inserted as a typed AssetPatch property by a
    # previous patch variant, insert it after title.
    if "location_label?: string | null;" not in text and "\ttitle?: string;" in text:
        text = text.replace("\ttitle?: string;\n", "\ttitle?: string;\n\tlocation_label?: string | null;\n", 1)

    if text == original:
        print(f"no nullable location_label type change needed in {path}")
    else:
        path.write_text(text, encoding="utf-8")
        print(f"patched {path}")


def patch_owner_dashboard_unused_vars() -> None:
    path = ROOT / "src/pages/test-corridor/wf1/owner/index.astro"
    if not path.exists():
        raise SystemExit(f"Missing expected owner dashboard: {path}")

    text = path.read_text(encoding="utf-8")
    original = text

    for line in [
        '\t\t\t\t\t\tconst configSpec = objectValue(row.asset.config_spec);\n',
        '\t\t\t\t\t\tconst conditionSpec = objectValue(row.asset.condition_spec);\n',
        '\t\t\t\t\t\tconst ownerConditionsSpec = objectValue(row.asset.owner_conditions_spec);\n',
        '      const configSpec = objectValue(row.asset.config_spec);\n',
        '      const conditionSpec = objectValue(row.asset.condition_spec);\n',
        '      const ownerConditionsSpec = objectValue(row.asset.owner_conditions_spec);\n',
    ]:
        text = text.replace(line, "")

    if text == original:
        print(f"no unused dashboard vars found in {path}")
    else:
        path.write_text(text, encoding="utf-8")
        print(f"patched {path}")


patch_edit_page()
patch_update_asset_config()
patch_owner_dashboard_unused_vars()
print("Owner full edit typecheck hotfix complete.")
