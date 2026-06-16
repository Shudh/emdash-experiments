# HandoverNow WF1 upload API drop-in

Guiding principle:

> We will not create a new media system. We will create a HandoverNow authorization wrapper around the EmDash media system.

## Files in this drop-in

New:
- `src/lib/wf1/uploads/mime.ts`
- `src/lib/wf1/uploads/types.ts`
- `src/lib/wf1/uploads/upload-policy.ts`
- `src/lib/wf1/uploads/emdash-media-upload.ts`
- `src/lib/wf1/api/upload-route.ts`
- `scripts/wf1/create-wf1-media-uploads-table.sql`

Modified:
- `src/lib/wf1/store/collections.ts`
- `src/lib/wf1/api/handler.ts`
- `src/pages/api/wf1-rental/[...path].ts`
- `src/pages/test-corridor/api/wf1-rental/[...path].ts`
- `src/components/wf1-test/Wf1MediaUpload.astro`
- `src/components/wf1/Wf1MediaUpload.astro`
- `src/components/wf1-test/Wf1PendingTaskCard.astro`
- `src/pages/test-corridor/wf1/owner/assets/new.astro`

## Required DB step before deploy

Run this once on remote D1:

```bash
cd demos/handovernow-cloudflare
pnpm exec wrangler d1 execute handovernow_cms --remote --file scripts/wf1/create-wf1-media-uploads-table.sql
```

## What changed

Old bug:
- WF1 upload widgets called `/_emdash/api/media`.
- That endpoint requires EmDash CMS `media:upload` permission.
- Shudh passed because he is admin; Raphael failed because he is tenant/renter.

New architecture:
- UI calls `/api/wf1-rental/uploads` or `/test-corridor/api/wf1-rental/uploads`.
- WF1 checks purpose + asset/workflow/card/role + quota.
- Then it reuses EmDash DB/media/storage primitives under the hood.

## Old calls replaced

Replace hardcoded `/_emdash/api/media` calls in:
- `src/components/wf1-test/Wf1MediaUpload.astro`
- `src/components/wf1/Wf1MediaUpload.astro`
- `src/pages/test-corridor/wf1/owner/assets/new.astro`

There is also a production page with the same old custom upload function:
- `src/pages/wf1/owner/assets/new.astro`

That production page should be brought to the same pattern before production owner uploads are re-enabled.
This drop-in includes the shared component fix, but the page-specific custom inventory uploader still needs the same `uploadMediaFile()` change if that production page is actively used.

## Test plan

1. `pnpm typecheck`
2. `pnpm build`
3. Login as Raphael.
4. Open a required-evidence task.
5. Select image/PDF.
6. Confirm status says `Uploaded.` and hidden fields are populated.
7. Submit answer.
8. Login as Shudh and verify task is completed.

## Current storage mode

The current HandoverNow config uses EmDash Cloudflare R2 binding storage. That adapter uploads through the Worker and explicitly does not support signed upload URLs.

Near-zero-byte-CPU signed upload is already available in EmDash via the S3-compatible storage adapter path, but it requires switching storage config to `s3()` with R2 S3 credentials. This patch is production-safe for the current binding mode: it caps upload size, rejects early by Content-Length, enforces WF1 role/purpose checks, and reuses EmDash media/storage internals.
