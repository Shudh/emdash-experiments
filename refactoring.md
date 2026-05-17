# ALM Rental Refactor Log

## Completed Migration Map

- Added shared ALM relationship resolution in `demos/playground/src/lib/domain/relationship.ts`.
- Added operation IDs and role-aware operation guards in `demos/playground/src/lib/domain/operations.ts`.
- Added lifecycle action projection helpers in `demos/playground/src/lib/domain/lifecycle.ts`.
- Added a lightweight lifecycle context loader in `demos/playground/src/lib/domain/lifecycle-context.ts`.
- Added shared rental catch-all dispatch in `demos/playground/src/lib/domain/rental-route-handler.ts`.
- Replaced duplicate permanent and fixture `/api/rental/[...path]` logic with calls to the shared handler.
- Preserved reset policy split:
  - Permanent playground bridge: `resetPolicy: "disabled"`.
  - E2E fixture bridge: `resetPolicy: "enabled-memory-only"`.
- Added mutation CSRF/origin guards in `demos/playground/src/pages/api/_domain-route-utils.ts`.
- Wrapped permanent playground POST route files with `withRentalMutationGuard()`.
- Wired negotiation, handover round, damage claim, and settlement commands through operation policy.
- Added `availableActions` to shared bridge responses for owner assets, negotiation threads, handover sessions, and marketplace assets.
- Updated owner dashboard action rendering to prefer `availableActions` while preserving current visible button labels.
- Added a non-destructive schema verifier at `scripts/verify-alm-prod-schema.mjs`.
- Added `docs/ALM_PRODUCTION_DEPLOYMENT_CHECKLIST.md`.

## Changed Files

- `demos/playground/src/lib/domain/commands/add-negotiation-round.ts`
- `demos/playground/src/lib/domain/commands/add-handover-negotiation-round.ts`
- `demos/playground/src/lib/domain/commands/claim-handover-damage.ts`
- `demos/playground/src/lib/domain/commands/settle-handover.ts`
- `demos/playground/src/pages/api/_domain-route-utils.ts`
- All permanent playground ALM POST route wrappers under `demos/playground/src/pages/api`
- `demos/playground/src/pages/api/rental/[...path].ts`
- `e2e/fixture/src/pages/api/rental/[...path].ts`
- `demos/playground/src/pages/owner/index.astro`
- `demos/playground/tests/domain/routes.test.ts`
- `scripts/verify-alm-frontend.sh`

## Added Files

- `demos/playground/src/lib/domain/relationship.ts`
- `demos/playground/src/lib/domain/operations.ts`
- `demos/playground/src/lib/domain/lifecycle.ts`
- `demos/playground/src/lib/domain/lifecycle-context.ts`
- `demos/playground/src/lib/domain/rental-route-handler.ts`
- `demos/playground/tests/domain/relationship.test.ts`
- `demos/playground/tests/domain/operations.test.ts`
- `demos/playground/tests/domain/lifecycle.test.ts`
- `scripts/verify-alm-prod-schema.mjs`
- `docs/ALM_PRODUCTION_DEPLOYMENT_CHECKLIST.md`
- `refactoring.md`

## Removed Or Moved Helpers

- Moved duplicated route-local viewer/relationship helpers out of:
  - `demos/playground/src/pages/api/rental/[...path].ts`
  - `e2e/fixture/src/pages/api/rental/[...path].ts`
- The legacy individual route files remain as thin wrappers because `routes.test.ts` imports them directly.
- Compatibility command `acceptFinalTerms()` was not renamed in this pass; current tests and UI still depend on it.

## Updated Tests

- Added relationship tests for owner/applicant/renter/unrelated/anonymous resolution.
- Added operation policy tests for negotiation and handover action gates.
- Added lifecycle action projection tests.
- Extended route tests for:
  - missing `X-EmDash-Request`
  - foreign `Origin`
  - wrong negotiation actors
  - wrong handover actors
  - permanent bridge reset remains forbidden

## Verification Results

- `pnpm --silent lint:json`
  - Failed before edits on existing repository diagnostics, including `e2e/tests/rental-local-existing-users.spec.ts` lint errors and unrelated package warnings.
- `pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit`
  - Passed.
- `packages/blocks/node_modules/.bin/vitest run demos/playground/tests/domain`
  - Passed: 5 files, 21 tests.
- `pnpm --filter emdash typecheck`
  - Passed.
- `pnpm exec playwright test -c playwright.rental-local.config.ts e2e/tests/rental-local-existing-users.spec.ts --project=chromium`
  - Passed: 1 test.
- `pnpm exec playwright test -c playwright.rental-local.config.ts e2e/tests/rental-local-ui-smoke.spec.ts --project=chromium`
  - Passed: 1 test.
- `pnpm exec playwright test e2e/tests/rental-saas-flow.spec.ts --project=chromium`
  - First run failed because the local sandbox already occupied `127.0.0.1:4445`.
  - Rerun after stopping the sandbox passed: 1 test.
- `scripts/verify-alm-frontend.sh`
  - Passed.
- `node scripts/verify-alm-prod-schema.mjs --db .local/rental-sandbox/test.db`
  - Passed non-strict verification and reported missing ALM `ec_*` rental tables in the current local DB; `media` exists.
- `pnpm exec playwright test e2e/tests/media-library.spec.ts --project=chromium`
  - Failed: first media library test timed out in `admin.devBypassAuth()` waiting for the admin shell; 4 later tests passed.

## Not Migrated In This Pass

- Agreement lifecycle split into proposed/signed/activated states.
- Tenant notice collection and enforced notice-before-move-out flow.
- Strict item-only settlement closure semantics.
- ALM private evidence upload/download wrapper.
- Strict ALM admin allowlist middleware.
- Archive asset command.

Those items require broader backend/data-model changes and full e2e flow rewrites; they were not included in this surgical pass to avoid breaking the currently passing ALM lifecycle.

# Handover Operation Enforcement Follow-Up

This follow-up completes the command-level guard slice started by the shared relationship and route-handler migration.

## Migration Map

- `startHandover()` now resolves the asset relationship, maps handover kind to a canonical operation, and asserts lifecycle state before creating a handover.
- `acceptHandover()` now resolves the handover relationship and only permits the renter-side move-in acceptance operation.
- `assetAvailableActions()` no longer treats `rented` as a normal move-out start state by default. Current e2e compatibility uses an explicit `allowLegacyRentedMoveOut` option until tenancy notice is implemented.
- Owner dashboard action rendering now trusts `availableActions`; the old `business_state` fallback buttons were removed.

## Changed Files

- `demos/playground/src/lib/domain/commands/start-handover.ts`
- `demos/playground/src/lib/domain/commands/accept-handover.ts`
- `demos/playground/src/lib/domain/lifecycle-context.ts`
- `demos/playground/src/lib/domain/lifecycle.ts`
- `demos/playground/src/lib/domain/operations.ts`
- `demos/playground/src/lib/domain/rental-route-handler.ts`
- `demos/playground/src/pages/owner/index.astro`
- `demos/playground/tests/domain/lifecycle.test.ts`
- `demos/playground/tests/domain/operations.test.ts`
- `demos/playground/tests/domain/routes.test.ts`

## Updated Tests

- Added state-aware operation policy checks for move-in and move-out handover operations.
- Added route coverage proving:
  - owner cannot start move-in from a listed asset
  - renter cannot start move-in
  - owner cannot accept move-in as tenant
  - unrelated user cannot accept move-in
  - renter cannot start move-out
  - unrelated user cannot settle handover
- Updated lifecycle projection tests so direct `rented -> start_move_out` is not the default policy.

## Verification Results

- `pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit`
  - Passed.
- `packages/blocks/node_modules/.bin/vitest run demos/playground/tests/domain`
  - Passed: 5 files, 23 tests.
- `pnpm exec playwright test -c playwright.rental-local.config.ts e2e/tests/rental-local-existing-users.spec.ts --project=chromium`
  - First run failed because no local server was listening on port 4444.
  - Rerun after starting `scripts/run-rental-local-sandbox.sh` passed: 1 test.
- `pnpm exec playwright test -c playwright.rental-local.config.ts e2e/tests/rental-local-ui-smoke.spec.ts --project=chromium`
  - Passed: 1 test.
- `pnpm exec playwright test e2e/tests/rental-saas-flow.spec.ts --project=chromium`
  - Passed: 1 test.
- `pnpm --filter emdash typecheck`
  - Passed.
- `scripts/verify-alm-frontend.sh`
  - Passed and confirmed `.local/rental-sandbox/users.json`, owner/tenant registrations, `.local/rental-sandbox/test.db`, and the permanent `/api/rental` bridge are present.

## Still Deferred

- Full tenancy notice flow; legacy rented move-out compatibility remains explicit until that migration lands.
- Agreement pending/sign/activate booking split.
- Strict item-only settlement closure.
- Evidence upload/download wrapper.
- Strict ALM admin allowlist middleware.
