# WF1 draft-intent lane guard hotfix

Fixes `POST /owner/assets/draft-intent` being interpreted by the WF1 lane guard as `owner/assets/:assetId`, causing `Workflow asset not found` after Turnstile success.

Apply from repo root:

```bash
unzip -o ~/Downloads/hn-form-guard-draft-intent-lane-hotfix.zip -d .
cd demos/handovernow-cloudflare
python3 scripts/wf1/apply-form-guard-draft-intent-lane-hotfix.py
```

Then run:

```bash
pnpm run typecheck:d1-cloud
pnpm run build:d1-cloud
```
