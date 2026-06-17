# HandoverNow WF1 superadmin publish queue UX drop-in v2

This patch assumes the first `hn-superadmin-publish-queue-dropin.zip` is already deployed.
It keeps the same scope: **test-corridor only**, no production WF1 route changes, no DB migration.

What this v2 fixes:

1. Adds a permanent test-corridor admin hub:
   - `/test-corridor/wf1/admin`

2. Improves the superadmin publish queue:
   - inline image/PDF media preview
   - compact owner-entered facts
   - compact inventory/config preview
   - approve/reject still happens directly from queue
   - `View asset` no longer points to public marketplace for private draft assets

3. Adds an admin-only asset review detail page:
   - `/test-corridor/wf1/admin/assets/:assetId`
   - shows media, facts, inventory, risk flags, and review history

4. Improves create-asset UX without changing backend flow:
   - owner can type first without login wall
   - typed fields are autosaved in browser storage
   - if upload/submit needs login, the form draft is preserved across login
   - the mandatory “Request marketplace review” checkbox is visually converted into a locked notice

5. Adds a test-corridor Admin nav link for Shudh/superadmin where the base test shell can be patched safely.

Apply from repo root:

```bash
cd ~/PycharmProjects/emdash-experiments
unzip -o ~/Downloads/hn-superadmin-publish-queue-ux-dropin.zip -d .
cd demos/handovernow-cloudflare
python3 scripts/wf1/apply-superadmin-publish-queue-ux-dropin.py
git status --short
pnpm run typecheck:d1-cloud
pnpm run build:d1-cloud
pnpm exec wrangler deploy
```

Smoke test:

1. Open `/test-corridor/wf1/admin` as Shudh.
2. Open `Marketplace review queue`.
3. Confirm pending asset card shows image/media and facts, not raw storage keys.
4. Click `Review details`; it should open `/test-corridor/wf1/admin/assets/:assetId`, not the marketplace route.
5. Approve.
6. The asset should become visible in marketplace after approval.

No DB migration required.
