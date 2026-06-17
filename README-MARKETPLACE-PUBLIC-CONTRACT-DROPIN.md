# HandoverNow marketplace public API contract drop-in

This fixes the root API/query contract leak.

Apply from repo root:

```bash
cd ~/PycharmProjects/emdash-experiments
unzip -o ~/Downloads/hn-marketplace-public-contract-dropin.zip -d .
cd demos/handovernow-cloudflare
python3 scripts/wf1/apply-marketplace-public-contract-dropin.py
pnpm run typecheck:d1-cloud
pnpm run build:d1-cloud
pnpm exec wrangler deploy
```

No DB migration.
