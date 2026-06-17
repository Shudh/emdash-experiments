#!/usr/bin/env python3
from pathlib import Path

ROOT = Path.cwd()

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')
    print(f'patched {path}')

def patch_asset_draft_token() -> None:
    path = 'src/lib/wf1/security/asset-draft-token.ts'
    text = read(path)
    old = '''function textBytes(value: string): Uint8Array {
\treturn new TextEncoder().encode(value);
}
'''
    new = '''function textBytes(value: string): Uint8Array<ArrayBuffer> {
\tconst bytes = new TextEncoder().encode(value);
\tconst copy = new Uint8Array(bytes.byteLength);
\tcopy.set(bytes);
\treturn copy;
}
'''
    if new in text:
        print(f'already patched {path}')
        return
    if old not in text:
        raise SystemExit(f'Could not find textBytes block in {path}. Stop and inspect manually.')
    write(path, text.replace(old, new, 1))

def patch_rate_limit_cast() -> None:
    path = 'src/lib/wf1/security/rate-limit.ts'
    text = read(path)
    old = 'const db = (await getDb()) as Kysely<AnyDb>;'
    new = 'const db = (await getDb()) as unknown as Kysely<AnyDb>;'
    if new in text:
        print(f'already patched {path}')
        return
    if old not in text:
        raise SystemExit(f'Could not find getDb cast in {path}. Stop and inspect manually.')
    write(path, text.replace(old, new, 1))

def patch_marketplace_unused_config_for() -> None:
    path = 'src/pages/test-corridor/wf1/marketplace/index.astro'
    text = read(path)
    old = '''function configFor(asset: AssetRow) {
\treturn asset.config_spec && typeof asset.config_spec === "object" && !Array.isArray(asset.config_spec)
\t\t? (asset.config_spec as Record<string, unknown>)
\t\t: {};
}

'''
    if old in text:
        write(path, text.replace(old, '', 1))
        return
    if 'function configFor(asset: AssetRow)' not in text:
        print(f'already patched {path}')
        return
    raise SystemExit(f'Found configFor in {path} but shape was unexpected. Stop and inspect manually.')

def main() -> None:
    patch_asset_draft_token()
    patch_rate_limit_cast()
    patch_marketplace_unused_config_for()
    print('WF1 form guard typecheck hotfix complete.')

if __name__ == '__main__':
    main()
