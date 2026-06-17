# HandoverNow WF1 superadmin publish queue drop-in

Scope:
- Test-corridor only.
- No production route changes.
- No new table.
- Uses existing `ec_wf_asset_events` for request/reject/publish audit.
- Approve path reuses existing `publishWorkflowAsset()`.

New page:
- `/test-corridor/wf1/admin/publish-queue`

New API routes:
- `GET /test-corridor/api/wf1-rental/admin/publish-queue`
- `POST /test-corridor/api/wf1-rental/owner/assets/:assetId/request-marketplace-review`
- `POST /test-corridor/api/wf1-rental/admin/assets/:assetId/approve-marketplace`
- `POST /test-corridor/api/wf1-rental/admin/assets/:assetId/reject-marketplace`

Apply:

```bash
cd ~/PycharmProjects/emdash-experiments
unzip -o ~/Downloads/hn-superadmin-publish-queue-dropin.zip -d .
cd demos/handovernow-cloudflare
python3 scripts/wf1/apply-superadmin-publish-queue-dropin.py
pnpm run typecheck:d1-cloud
pnpm run build:d1-cloud
pnpm exec wrangler deploy
```

Smoke test:
1. Create or use a test-corridor draft/listed asset.
2. Click `Request marketplace review` on owner dashboard.
3. Open `/test-corridor/wf1/admin/publish-queue` as Shudh.
4. Approve or reject.
5. Approval should publish to marketplace via existing `publishWorkflowAsset()`.

No DB migration is required for this drop-in.
