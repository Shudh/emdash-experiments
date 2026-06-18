# HandoverNow owner full edit clean drop-in

This replaces the small inline owner-dashboard edit panel with one full edit surface.

It adds `src/pages/test-corridor/wf1/owner/assets/[assetId]/edit.astro`, links to it from the owner dashboard, removes the earlier inline partial edit form/handler, and minimally extends the existing config update API to accept asset identity fields (`assetKind`, `title`, `locationLabel`).

Apply from `demos/handovernow-cloudflare` after unzipping from repo root:

```bash
python3 scripts/wf1/apply-owner-full-edit-clean-dropin.py
pnpm run typecheck:d1-cloud
pnpm run build:d1-cloud
pnpm exec wrangler deploy
```
