#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SENSITIVE_DRAFT_KEYS = '["companyWebsite", "_hp", "website", "assetDraftToken", "draftId", "formStartedAt"]'


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")
    print(f"patched {rel}")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Could not find expected block for {label}. Stop and inspect manually.")
    return text.replace(old, new, 1)


def replace_all_if_present(text: str, old: str, new: str) -> tuple[str, int]:
    count = text.count(old)
    if count:
        text = text.replace(old, new)
    return text, count


def patch_owner_asset_page() -> None:
    rel = "src/pages/test-corridor/wf1/owner/assets/new.astro"
    text = read(rel)
    original = text

    # Fail-closed form state. The form starts locked in HTML/CSS; JS unlocks only after server-issued assetDraftToken.
    if 'data-asset-create-locked="true"' not in text:
        text = replace_once(
            text,
            'data-turnstile-site-key={turnstileSiteKey} data-form-started-at={formStartedAt}',
            'data-turnstile-site-key={turnstileSiteKey} data-form-started-at={formStartedAt} data-asset-create-locked="true"',
            f"{rel} fail-closed form locked attribute",
        )

    # The honeypot must never be visible or restorable as user-entered data.
    old_honeypot = '<input class="hn-hidden-trap-input" type="text" name="companyWebsite" autocomplete="off" tabindex="-1" aria-hidden="true" />'
    new_honeypot = '<input class="hn-hidden-trap-input" type="text" name="companyWebsite" autocomplete="off" tabindex="-1" aria-hidden="true" style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;" />'
    if old_honeypot in text:
        text = text.replace(old_honeypot, new_honeypot, 1)

    # The create button is a server-action button. It must not be visible by default.
    if '<button class="rental-button" type="submit">Create asset</button>' in text:
        text = text.replace(
            '<button class="rental-button" type="submit">Create asset</button>',
            '<button class="rental-button" type="submit" hidden disabled data-asset-create-submit>Create asset</button>',
            1,
        )

    # Draft persistence must not save/restore honeypot/security fields.
    save_old = '''if (!control.name && !control.id) continue;
\t\t\tif (control instanceof HTMLInputElement && control.type === "file") continue;
\t\t\tif (control instanceof HTMLInputElement && control.type === "password") continue;
\t\t\tconst key = control.name || control.id;'''
    save_new = f'''if (!control.name && !control.id) continue;
\t\t\tconst key = control.name || control.id;
\t\t\tif ({SENSITIVE_DRAFT_KEYS}.includes(key)) continue;
\t\t\tif (control instanceof HTMLInputElement && control.type === "hidden") continue;
\t\t\tif (control instanceof HTMLInputElement && control.type === "file") continue;
\t\t\tif (control instanceof HTMLInputElement && control.type === "password") continue;'''
    text, _ = replace_all_if_present(text, save_old, save_new)

    save_old_inline = '''if (!key) continue;
\t\t\tif (control.type === "checkbox" || control.type === "radio") {'''
    save_new_inline = f'''if (!key) continue;
\t\t\tif ({SENSITIVE_DRAFT_KEYS}.includes(key)) continue;
\t\t\tif (control instanceof HTMLInputElement && control.type === "hidden") continue;
\t\t\tif (control.type === "checkbox" || control.type === "radio") {{'''
    text, _ = replace_all_if_present(text, save_old_inline, save_new_inline)

    restore_old = '''const key = control.name || control.id;
\t\t\tconst saved = parsed.fields[key];'''
    restore_new = f'''const key = control.name || control.id;
\t\t\tif ({SENSITIVE_DRAFT_KEYS}.includes(key)) continue;
\t\t\tif (control instanceof HTMLInputElement && control.type === "hidden") continue;
\t\t\tconst saved = parsed.fields[key];'''
    text, _ = replace_all_if_present(text, restore_old, restore_new)

    # When locked/unlocked, reflect it as a form dataset state so CSS cannot show upload/create controls accidentally.
    lock_old = '''function setAssetCreateLocked(locked: boolean, message: string) {
\t\tconst controls = createAssetControls();'''
    lock_new = '''function setAssetCreateLocked(locked: boolean, message: string) {
\t\tif (form) {
\t\t\tif (locked) {
\t\t\t\tform.dataset.assetCreateLocked = "true";
\t\t\t} else {
\t\t\t\tdelete form.dataset.assetCreateLocked;
\t\t\t}
\t\t}
\t\tconst controls = createAssetControls();'''
    if lock_old in text and 'form.dataset.assetCreateLocked = "true"' not in text:
        text = text.replace(lock_old, lock_new, 1)

    # Add fail-closed CSS. This protects first paint before JS has run.
    if 'data-asset-create-locked="true"] input[type="file"' not in text:
        css = '''
\t.hn-hidden-trap-input {
\t\tposition: absolute !important;
\t\tleft: -10000px !important;
\t\ttop: auto !important;
\t\twidth: 1px !important;
\t\theight: 1px !important;
\t\toverflow: hidden !important;
\t\topacity: 0 !important;
\t\tpointer-events: none !important;
\t}

\t[data-asset-create-locked="true"] input[type="file"],
\t[data-asset-create-locked="true"] button[type="submit"] {
\t\tdisplay: none !important;
\t}
'''
        if '<style is:global>' in text:
            text = text.replace('<style is:global>\n', '<style is:global>\n' + css, 1)
        else:
            text += '\n<style is:global>\n' + css + '\n</style>\n'

    if text == original:
        print(f"already patched {rel}")
    else:
        write(rel, text)


def patch_marketplace_asset_page() -> None:
    rel = "src/pages/test-corridor/wf1/marketplace/assets/[id].astro"
    text = read(rel)
    original = text

    # Normal express-interest submit is also a server-action button. If Turnstile is configured,
    # render fail-closed and let the Turnstile callback reveal it.
    old = '<button class="rental-button" type="submit" data-express-interest-submit>'
    new = '<button class="rental-button" type="submit" data-express-interest-submit hidden={turnstileSiteKey !== ""} disabled={turnstileSiteKey !== ""}>'
    if old in text and 'hidden={turnstileSiteKey !== ""}' not in text:
        text = text.replace(old, new, 1)

    if text == original:
        print(f"already patched {rel}")
    else:
        write(rel, text)


def main() -> None:
    patch_owner_asset_page()
    patch_marketplace_asset_page()
    print("WF1 UI lock / honeypot visibility hotfix complete.")


if __name__ == "__main__":
    main()
