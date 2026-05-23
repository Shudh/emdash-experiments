# WF1 Non-UI Migration: All Actions and Tests

## 1. Source files copied

Copied minimal domain substrate:

```text
src/lib/domain/types.ts
src/lib/domain/validation.ts
src/lib/domain/constants.ts
src/lib/domain/kysely-store.ts
src/lib/domain/db.ts
```

Copied WF1 library and API:

```text
src/lib/wf1/**
src/pages/api/_domain-route-utils.ts
src/pages/api/wf1-rental/[...path].ts
```

## 2. Files intentionally not copied

Not copied:

```text
demos/playground/src/lib/workflow-rental
demos/playground/src/lib/domain/commands
demos/playground/src/lib/domain/queries
demos/playground/src/lib/domain/repositories
demos/playground/src/lib/domain/rental-route-handler.ts
demos/playground/src/pages/wf
demos/playground/src/pages/marketplace
demos/playground/src/pages/owner
demos/playground/src/pages/interests
demos/playground/src/pages/handover
```

## 3. Import audit

WF1 imports stay within the copied domain substrate and WF1 modules. No `workflow-rental`, old `/wf`, old marketplace, or old rental route handler imports are used by the target code.

The target API route uses `getDb()` from `emdash/runtime` as a fallback for anonymous public API requests where the EmDash public fast path omits `locals.emdash.db`.

## 4. Local DB test mode

`HANDOVERNOW_DB_TARGET=local` uses:

```text
db/handovernow_cms_local.db
```

Local API smoke:

```bash
curl -i http://127.0.0.1:4321/api/wf1-rental/marketplace/assets
```

Result after route fallback fix: `HTTP/1.1 200 OK` with `{ "ok": true, ... }`.

## 5. Real D1 test mode

`pnpm typecheck:d1-cloud` -> passed.

`pnpm build:d1-cloud` -> passed.

D1 dev API currently fails because the remote D1 database has not been activated with the new WF1 seed/schema:

```text
D1_ERROR: no such table: ec_wf_assets
```

No Cloudflare deploy/reset was run by Codex.

## 6. Unit/projection/definition tests

Copied playground WF1 tests to `demos/handovernow-cloudflare/tests/wf1`.

Added:

```text
tests/wf1/db-schema.test.ts
tests/wf1/api-routes.test.ts
tests/wf1/test-helpers.ts
```

Target command:

```bash
packages/blocks/node_modules/.bin/vitest run demos/handovernow-cloudflare/tests/wf1
```

Output:

```text
Test Files  7 passed (7)
Tests  17 passed (17)
```

## 7. API route tests

`tests/wf1/api-routes.test.ts` covers:

- marketplace assets without a user
- mutation CSRF rejection
- invalid JSON rejection
- authenticated asset create
- asset publish
- express interest creating interest/workflow instance
- workspace projection

Included in the 17 passing target tests.

## 8. Old playground parity test results

Commands:

```bash
pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1
```

Results:

```text
TypeScript: passed
Test Files 5 passed
Tests 12 passed
```

## 9. New handovernow local DB test results

Commands:

```bash
pnpm exec tsc -p demos/handovernow-cloudflare/tsconfig.test.json --noEmit
packages/blocks/node_modules/.bin/vitest run demos/handovernow-cloudflare/tests/wf1
pnpm typecheck:local-db
pnpm build:local-db
```

Results:

```text
TypeScript: passed
Vitest: 7 files, 17 tests passed
typecheck:local-db: 0 errors
build:local-db: passed
```

## 10. New handovernow D1 cloud test results

Commands:

```bash
pnpm typecheck:d1-cloud
pnpm build:d1-cloud
```

Results:

```text
typecheck:d1-cloud: 0 errors
build:d1-cloud: passed
```

Runtime D1 API remains pending manager deployment/activation of the WF1 schema.

## 11. Pass/fail summary

Passed:

- Playground WF1 compile/tests.
- Target WF1 compile/tests.
- Local DB API smoke.
- Local and D1-target typecheck/build.

Pending:

- Runtime D1 API parity after managers deploy/activate the WF1 seed schema.

Manager target statement:

```text
WF1 has been migrated into demos/handovernow-cloudflare as EmDash site code.

WF1 database tables are no longer created through the old manual root script. The WF1 collections are defined in demos/handovernow-cloudflare/seed/seed.json and created by EmDash’s normal schema/seed path.

The selected WF1 schema/data in old_wf1.db matches handovernow_cms_local.db for the approved WF1 tables. The same selected schema/data is present in the real Cloudflare D1 database handovernow_cms.

The playground WF1 tests still pass. The copied handovernow-cloudflare WF1 tests pass against local DB and D1. The UI E2E passes for the old playground baseline and the new handovernow-cloudflare target.
The new code must not be deployed to cloudflare by you.. We will deploy the code to cloudflare but you have full permission the real d1 db..and also r2 ..so when we move the code everything just works
```

Note: the D1 sentences above are the manager acceptance target, not the current verified state before manager deployment.
