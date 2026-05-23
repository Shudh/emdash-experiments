# WF1 UI Migration: All Actions and Tests

## 1. Source UI files copied

Copied:

```text
src/components/wf1/**
src/pages/wf1/**
```

## 2. Shared UI files copied

Copied only required shared files:

```text
src/components/rental/ActionForm.astro
src/components/rental/ConditionBox.astro
src/components/rental/SpecTable.astro
src/styles/rental-responsive-hardening.css
```

## 3. Files intentionally not copied

Not copied:

```text
src/pages/wf
src/pages/marketplace
src/pages/owner
src/pages/interests
src/pages/handover
src/lib/workflow-rental
```

Import scan after copy found no old `/wf/`, `pages/wf`, or `workflow-rental` links in target WF1 UI.

## 4. Local DB UI smoke tests

With `HANDOVERNOW_DB_TARGET=local pnpm dev`:

```text
HEAD /_emdash/admin -> 302 /_emdash/admin/setup
HEAD /wf1 -> 200
HEAD /wf1/marketplace -> 200
HEAD /wf1/owner -> 200
GET /api/wf1-rental/marketplace/assets -> 200 { ok: true }
```

The admin setup redirect is expected for the local copied DB state.

## 5. D1 cloud UI smoke tests

D1 dev mode pages start and render, but API-backed checks fail until the real D1 database is activated with the new WF1 schema:

```text
D1_ERROR: no such table: ec_wf_assets
```

No deploy or D1 reset was run by Codex.

## 6. Playwright old playground baseline

The old playground baseline was not rerun after the target UI smoke due time. Earlier in this migration session, playground TypeScript and WF1 Vitest parity passed.

## 7. Playwright new handovernow local-db

Created:

```text
e2e/playwright.local-db.config.ts
e2e/wf1-handovernow-local-db.spec.ts
```

Command:

```bash
pnpm exec playwright test -c demos/handovernow-cloudflare/e2e/playwright.local-db.config.ts demos/handovernow-cloudflare/e2e/wf1-handovernow-local-db.spec.ts --project=chromium --headed
```

Output:

```text
1 passed
```

## 8. Playwright new handovernow d1-cloud

Created:

```text
e2e/playwright.d1-cloud.config.ts
e2e/wf1-handovernow-d1-cloud.spec.ts
```

Command was run and failed because remote D1 does not yet have WF1 tables:

```text
D1_ERROR: no such table: ec_wf_assets
```

This is pending manager deployment/activation.

## 9. Deployed cms.handovernow.com UI tests

Not run by Codex because the final instruction says Codex must not deploy the new code to Cloudflare.

## 10. Pass/fail summary

Passed:

- Target WF1 UI copied.
- Required shared UI copied.
- Local UI smoke passed.
- Local headed Playwright smoke passed.
- Local and D1-target typecheck/build passed.

Pending:

- Full old playground headed E2E rerun.
- Runtime D1 E2E and deployed UI verification after managers deploy/activate the WF1 schema.

Manager target statement:

```text
WF1 has been migrated into demos/handovernow-cloudflare as EmDash site code.

WF1 database tables are no longer created through the old manual root script. The WF1 collections are defined in demos/handovernow-cloudflare/seed/seed.json and created by EmDash’s normal schema/seed path.

The selected WF1 schema/data in old_wf1.db matches handovernow_cms_local.db for the approved WF1 tables. The same selected schema/data is present in the real Cloudflare D1 database handovernow_cms.

The playground WF1 tests still pass. The copied handovernow-cloudflare WF1 tests pass against local DB and D1. The UI E2E passes for the old playground baseline and the new handovernow-cloudflare target.
The new code must not be deployed to cloudflare by you.. We will deploy the code to cloudflare but you have full permission the real d1 db..and also r2 ..so when we move the code everything just works
```

Note: the D1/deployed E2E sentences above are the manager acceptance target, not the current verified state before manager deployment.
