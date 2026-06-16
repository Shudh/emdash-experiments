# Production owner asset page upload replacement

The production page `src/pages/wf1/owner/assets/new.astro` contains the same custom `uploadMediaFile()` bug as the test-corridor page: it posts to `/_emdash/api/media`.

Use the same pattern from the replacement test-corridor page:

1. In frontmatter, add:

```ts
const assetDraftId = crypto.randomUUID();
const wf1UploadUrl = "/api/wf1-rental/uploads";
```

2. On the `<form id="asset-form">`, add:

```astro
data-asset-draft-id={assetDraftId} data-wf1-upload-url={wf1UploadUrl}
```

3. On the primary `<Wf1MediaUpload />`, add:

```astro
uploadUrl={wf1UploadUrl}
purpose="asset_draft_media"
draftId={assetDraftId}
clientItemId="primary"
```

4. Replace the page-local `uploadMediaFile(file, kind, scope)` function with the version from the test-corridor replacement file, but change the URL fallback from `/test-corridor/api/wf1-rental/uploads` to `/api/wf1-rental/uploads`.

5. In `addInventoryRow`, assign:

```ts
row.dataset.clientItemId = crypto.randomUUID();
```

6. In `collectInventoryRows`, pass that `clientItemId` into `uploadMediaFile(...)` and include `draftId`/`clientItemId` in `itemSpec`.

This file is not overwritten in the main zip because its current production logic has hardcoded screening defaults that differ from the test-corridor page. Do this as a deliberate small mechanical edit, not a broad page replacement.
