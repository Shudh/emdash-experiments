#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text, encoding="utf-8")
    print(f"patched {rel}")


def main() -> None:
    rel = "src/lib/wf1/routing/lane-guard.ts"
    text = read(rel)

    if 'parts[2] === "draft-intent"' in text:
        print(f"already patched {rel}")
        return

    old = '''\tif (method === "POST" && parts[0] === "owner" && parts[1] === "assets" && parts[2] === "add") {\n\t\treturn;\n\t}\n\n'''
    new = '''\tif (method === "POST" && parts[0] === "owner" && parts[1] === "assets" && parts[2] === "draft-intent") {\n\t\treturn;\n\t}\n\n\tif (method === "POST" && parts[0] === "owner" && parts[1] === "assets" && parts[2] === "add") {\n\t\treturn;\n\t}\n\n'''

    if old not in text:
        raise SystemExit(f"Could not find expected owner/assets/add lane-guard block in {rel}. Stop and inspect manually.")

    write(rel, text.replace(old, new, 1))
    print("WF1 draft-intent lane guard hotfix complete.")


if __name__ == "__main__":
    main()
