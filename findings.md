# Rental backend pack integration findings

## Environment
- OS: Linux 53541c3e11df 6.12.47 x86_64 GNU/Linux.
- Node version: v24.15.0.
- npm version: 11.4.2.
- pnpm version: 10.28.0.
- Runtime setup: `scripts/setup-node22-pnpm.sh` verifies Node major >= 22, attempts npm upgrade, enables Corepack, prepares pnpm@10.28.0, prints versions, and fails fast only if Node remains below 22. The npm upgrade attempt was blocked by registry 403 in this environment, so the script continued with existing npm 11.4.2 after confirming Node was already >= 22.

## Repo baseline
- Branch: `feat/rental-backend-domain-pack`.
- Package manager: `pnpm@10.28.0`.
- Engine requirement: root `package.json` requires Node `>=22`.
- Selected target app/demo: `demos/playground`.
- Baseline `git status --short` before integration: only the new setup script was untracked after branch creation.
- Baseline package scripts inspected: root has `typecheck`, `typecheck:demos`, `lint:quick`, `lint`, `test`, `build`, and `format` scripts.

## Pack contents
- The expected zip was not present in the repo, `/workspace`, `/tmp`, or `/mnt`.
- Attempted download from `https://drive.google.com/uc?export=download&id=1KWmlxDZ4HhBrt0sMyaaHsNcvAUA1QrPa` failed with HTTP 403.
- Opening the provided Drive view URL showed a Google sign-in gate.
- Extraction command result: `emdash-rental-backend-pack.zip missing; Google Drive download returned 403/sign-in required`.
- Extracted file tree: empty (`tmp/rental-backend-pack` contains no files).
- Because the pack was inaccessible, there were no pack files to inspect directly. I implemented the backend/API pack from the requested contract and documented this as a blocker/gap below.
- Collections integrated in `demos/playground/seed/seed.json`:
  - `rental_assets`
  - `asset_config_items`
  - `asset_interest`
  - `negotiation_rounds`
  - `agreement_versions`
  - `agreement_terms`
  - `handover_sessions`
  - `handover_item_checks`
- Command files added:
  - `src/lib/domain/commands/assets.ts`
  - `src/lib/domain/commands/interests.ts`
  - `src/lib/domain/commands/negotiations.ts`
  - `src/lib/domain/commands/handover.ts`
- Repository files added:
  - `src/lib/domain/repositories/in-memory-store.ts`
  - `src/lib/domain/repositories/kysely-store.ts`
- Query files added:
  - `src/lib/domain/queries/marketplace.ts`
- API route files added:
  - `src/pages/api/owner/assets/add.ts`
  - `src/pages/api/owner/assets/[id]/config.ts`
  - `src/pages/api/owner/assets/[id]/publish-to-marketplace.ts`
  - `src/pages/api/marketplace/assets/index.ts`
  - `src/pages/api/marketplace/assets/[id]/express-interest.ts`
  - `src/pages/api/negotiations/[interestId]/add-round.ts`
  - `src/pages/api/negotiations/[interestId]/accept-final-terms.ts`
  - `src/pages/api/handover/[assetId]/start.ts`
  - `src/pages/api/handover/[handoverId]/accept.ts`
  - `src/pages/api/handover/[handoverId]/claim-damage.ts`
  - `src/pages/api/handover/[handoverId]/settle.ts`
  - `src/pages/api/assets/[assetId]/return-to-draft.ts`
  - `src/pages/api/assets/[assetId]/relist.ts`
- Assumptions implemented:
  - `locals.emdash?.db` is preferred when available.
  - `emdash/runtime` `getDb()` is the fallback for ambient request-scoped DB access.
  - `locals.user` is not required by these demo routes yet because this task is backend/API proof only and the playground auth path is special; payloads carry `ownerId`, `renterId`, and `actorId` explicitly.
- In-memory test begins and ends entirely in `demos/playground/tests/domain/full-flow.test.ts`; it uses `InMemoryRentalDomainStore` only and never imports Astro runtime.
- Runtime route/type integration test begins and ends in `demos/playground/tests/domain/route-imports.test.ts`; it imports all API route modules and verifies exported handlers.

## Integration changes
- Files added:
  - `scripts/setup-node22-pnpm.sh`: runtime setup/verification script requested in Step 0.
  - `findings.md`: this integration record.
  - `demos/playground/src/lib/domain/**`: rental lifecycle domain types, commands, queries, DB bridge, Kysely repository, and in-memory repository.
  - `demos/playground/src/pages/api/**`: backend-only API routes for owner asset workflow, marketplace interest, negotiation, handover, return-to-draft, and relist.
  - `demos/playground/tests/domain/**`: pure lifecycle and API route import tests.
- Files modified:
  - `demos/playground/seed/seed.json`: added rental domain collections and DB columns so domain states are first-class fields, not JSON-only blobs.
- Why target `demos/playground`:
  - It already contains Astro pages and EmDash playground wiring.
  - It is a demo app, not a published package.
  - The runtime provides a real EmDash integration and playground Durable Object DB path.
- No frontend UI pages were added.
- No EmDash admin pages were exposed or depended on.
- No published package behavior was changed, so no changeset was added.

## Runtime bridge findings
- Actual `locals.emdash` shape in core middleware:
  - For full runtime-initialized routes, `locals.emdash` includes content handlers, media handlers, plugin route handlers, `storage`, `db`, `hooks`, `email`, config, manifest accessor, sandbox runner, marketplace/registry sync methods, and plugin status helpers.
  - For anonymous public fast-path routes, `locals.emdash` can be a partial object containing page contribution/media helpers but no direct `db`.
- Actual `locals.user` shape:
  - Auth middleware writes `locals.user = user` when a session/auth token is accepted. Existing core routes destructure `{ emdash, user } = locals`.
- Whether `locals.emdash.db` exists:
  - Yes on full runtime-initialized routes.
  - Not guaranteed on anonymous public fast path.
- How DB access was solved:
  - `src/lib/domain/db.ts` first checks `locals.emdash?.db`.
  - If it is absent, it falls back to `getDb()` from `emdash/runtime`, which participates in EmDash's ALS request context and playground DB context.
- Kysely direct access:
  - Runtime exposes `runtime.db` through `locals.emdash.db` in core middleware. The demo bridge treats the DB as an advanced runtime object and keeps domain SQL isolated in `KyselyRentalDomainStore`.
- App.Locals augmentation:
  - No augmentation was needed for these demo routes because the route utility accepts the runtime locals structurally and falls back to `getDb()`.

## Test commands run
- `./scripts/setup-node22-pnpm.sh`: pass. Node v24.15.0, npm 11.4.2, Corepack 0.34.6, pnpm 10.28.0 printed; npm upgrade attempt warned due registry 403.
- `pwd`: pass. Output: `/workspace/emdash-experiments`.
- `git status --short`: pass. Used before and after changes.
- `node -v || true`: pass. Output: `v24.15.0`.
- `npm -v || true`: pass. Output: `11.4.2`.
- `corepack --version || true`: pass. Output: `0.34.6`.
- `pnpm -v || true`: pass. Output: `10.28.0`.
- Root package inspection command: pass. Confirmed `engines.node >=22`, `packageManager pnpm@10.28.0`, and scripts.
- `curl -L --fail --output emdash-rental-backend-pack.zip 'https://drive.google.com/uc?export=download&id=1KWmlxDZ4HhBrt0sMyaaHsNcvAUA1QrPa'`: fail/blocker. HTTP 403.
- `mkdir -p tmp/rental-backend-pack && unzip -o emdash-rental-backend-pack.zip -d tmp/rental-backend-pack && find tmp/rental-backend-pack -maxdepth 5 -type f | sort`: blocked by missing zip; extracted tree empty.
- `pnpm install --frozen-lockfile`: pass after avoiding new package dependencies. Lockfile already up to date.
- Earlier `pnpm install --no-frozen-lockfile`: fail/blocker when I briefly tried adding a `vitest` devDependency to playground; registry fetch for `vitest` returned 403, so I reverted that package.json change and used an already-installed workspace Vitest binary.
- `pnpm --silent lint:quick`: pass with existing workspace warnings only; no errors.
- `pnpm lint`: pass with existing workspace warnings only; no errors. Final output: `Found 45 warnings and 0 errors.` No warnings reference the added playground rental files.
- `pnpm typecheck`: pass after building workspace packages whose generated `dist` files were needed for type resolution.
- `pnpm --filter @emdash-cms/playground typecheck`: pass. Astro check reports 0 errors, 0 warnings, 0 hints; Google Fonts fetch warnings are environmental.
- `packages/blocks/node_modules/.bin/vitest run demos/playground/tests/domain/full-flow.test.ts demos/playground/tests/domain/route-imports.test.ts`: pass. 2 files passed, 14 tests passed.
- `pnpm --filter @emdash-cms/playground build`: pass. Build completed; Google Fonts fetch warnings are environmental.
- `pnpm test`: fail/warning due missing Playwright browser executable for admin browser tests. Package tests ran until `@emdash-cms/admin` failed with `Executable doesn't exist at /root/.cache/ms-playwright/.../chrome-headless-shell`. This is an environment dependency, not caused by this backend change.
- `pnpm format`: pass.

## Lifecycle verification
- [x] add_asset creates `status = draft`, `business_state = draft_asset`, `visibility_state = private`.
- [x] update_asset_config stores `config_spec`, `condition_spec`, and granular `asset_config_items`.
- [x] publish_asset_to_marketplace creates `status = published`, `business_state = listed`, `visibility_state = marketplace`.
- [x] express_interest creates an `asset_interest` row and asset remains marketplace-visible.
- [x] negotiation rounds are append-only rows with `round_phase = pre_agreement` and `round_kind = offer/counter/question/answer/acceptance` support.
- [x] accept_final_terms creates an `agreement_versions` row, frozen `printable_snapshot`, `agreement_terms` rows, sets asset `visibility_state = restricted`, and removes it from marketplace query.
- [x] agreement snapshot remains unchanged after later attempted asset edit.
- [x] start_handover creates `handover_session` and `handover_item_checks` from `asset_config_items`.
- [x] accept_handover sets asset `business_state = rented`.
- [x] return/move-out damage uses `negotiation_rounds.round_phase = return` and `handover_item_checks` dispute fields.
- [x] settle_handover moves asset to `maintenance/private`.
- [x] return_to_draft and relist returns asset to marketplace.

## Gaps / blockers
- The actual supplied zip could not be downloaded or inspected because Google Drive required sign-in / returned 403. This means the integrated code is a faithful implementation of the provided contract, not a direct adaptation of the unavailable pack files.
- Full HTTP endpoint exercising was not run. The playground app depends on Cloudflare/Worker runtime wiring and has external Google Fonts fetch warnings; route module import/typecheck and pure lifecycle tests were run instead.
- API payload validation is intentionally minimal for this proof. The routes parse JSON and delegate domain invariant enforcement to commands. A production hardening pass should add Zod schemas per payload.
- Authentication/authorization is not enforced in these demo routes yet. Payloads carry `ownerId`, `renterId`, and `actorId` so the backend lifecycle can be tested without UI/admin auth setup. Before exposure outside the playground, add permission checks and derive actor IDs from `locals.user`.
- Kysely repository uses fixed table names only and no dynamic SQL identifiers, but it has not been exercised against a live migrated playground DB over HTTP in this environment.
- Seed fields create first-class columns for domain states, but custom indexes for those fields are not created by this demo seed. If this moves beyond proof-of-concept, add explicit index/migration support for marketplace query predicates.

## Next safe step
- Make the zip accessible or attach it directly, then diff this integrated implementation against the original pack to identify any payload or contract differences.
- After backend/API is green with the original pack reconciled, add runtime HTTP tests with an authenticated playground session or a test-only request context, then harden route payload validation and authorization before any UI work.
