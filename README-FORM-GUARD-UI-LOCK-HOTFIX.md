# WF1 UI Lock / Honeypot Visibility Hotfix

Apply after the combined form-guard patch and typecheck hotfix.

This hotfix makes server-action controls fail closed in the HTML/CSS layer and hides the honeypot field so it cannot be mistaken for a real user field.

Run from repo root:

```bash
unzip -o ~/Downloads/hn-form-guard-ui-lock-hotfix.zip -d .
cd demos/handovernow-cloudflare
python3 scripts/wf1/apply-form-guard-ui-lock-hotfix.py
rm -rf scripts/wf1/__pycache__
pnpm run typecheck:d1-cloud
```
