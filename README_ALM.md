# ALM Rental Backend Integration Notes

Last updated: 16 May 2026

This document records what was added for the ALM/rental workflow, what is now tested, what is still not tested, the traps discovered during implementation, and the fastest safe path from backend proof to frontend and controlled go-live.

---

## 1. Current status

The ALM/rental backend is now at a real working checkpoint.

The following local checks passed on the local Ubuntu machine in:

```text
~/PycharmProjects/emdash-experiments
```

TypeScript test target:

```bash
pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit
```

Domain tests:

```bash
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/domain
```

Result:

```text
Test Files  2 passed (2)
Tests       8 passed (8)
```

Local full rental lifecycle with real persistent users:

```bash
pnpm exec playwright test \
  -c playwright.rental-local.config.ts \
  e2e/tests/rental-local-existing-users.spec.ts \
  --project=chromium \
  --headed
```

Result:

```text
1 passed
```

This means the backend/domain/API flow is now proven through both direct domain tests and a real HTTP Playwright flow using real EmDash users.

---

## 2. Product truth implemented

The workflow now follows these product rules:

1. A registered EmDash user is not automatically an asset owner.
2. A user becomes the owner of an asset only when that user creates an asset.
3. Public visitors can view marketplace assets.
4. Public visitors can view owner rental conditions on published marketplace assets.
5. Public visitors cannot express interest.
6. A renter must be logged in before expressing interest.
7. A renter must explicitly accept the current owner conditions before expressing interest.
8. Submitted interest lands in the owner inbox/dashboard.
9. Owner and renter can negotiate through append-only rounds.
10. Actor identity comes from the authenticated session.
11. Actor role is derived from the owner/renter relationship, not trusted from request JSON.
12. Final accepted terms create an immutable agreement snapshot.
13. The agreement snapshot contains owner conditions, accepted renter conditions, accepted asset/config items, and accepted negotiation terms.
14. Asset becomes restricted/private after final agreement.
15. Asset leaves public marketplace after booking.
16. Owner and renter get asset access rows after final agreement.
17. Move-in handover starts from active asset config items.
18. Move-in acceptance makes the asset rented.
19. Move-out/return handover uses the same item-check model.
20. Damage/deposit/repair disputes use negotiation rounds with `round_phase = "return"`.
21. Settlement closes handover and moves the asset to maintenance/private.
22. Agreement snapshot remains unchanged after move-out settlement.

---

## 3. Main backend/domain folders

Primary rental domain code lives under:

```text
demos/playground/src/lib/domain
```

Important folders:

```text
demos/playground/src/lib/domain/commands
demos/playground/src/lib/domain/repositories
demos/playground/src/lib/domain/queries
```

Important support files:

```text
demos/playground/src/lib/domain/api-contracts.ts
demos/playground/src/lib/domain/auth.ts
demos/playground/src/lib/domain/constants.ts
demos/playground/src/lib/domain/db.ts
demos/playground/src/lib/domain/events.ts
demos/playground/src/lib/domain/types.ts
demos/playground/src/lib/domain/validation.ts
```

The Playwright fixture rental API bridge lives here:

```text
e2e/fixture/src/pages/api/rental/[...path].ts
```

The local persistent-user Playwright test lives here:

```text
e2e/tests/rental-local-existing-users.spec.ts
```

The direct domain tests live here:

```text
demos/playground/tests/domain/full-flow.test.ts
demos/playground/tests/domain/routes.test.ts
```

---

## 4. Local runtime and database map

Persistent local auth users live in the local EmDash SQLite database:

```text
.local/rental-sandbox/test.db
```

The synced local-user map lives here:

```text
.local/rental-sandbox/users.json
```

Current local meaning:

- `.local/rental-sandbox/test.db` is the persistent local EmDash auth/runtime DB used by the rental sandbox.
- `.local/rental-sandbox/users.json` records the already-created owner and tenant user IDs/emails so local tests can login without recreating passkeys.
- The e2e fixture `/api/rental` route is intentionally resettable and uses `MemoryDomainStore` for rental domain state only.
- The permanent playground `/api/rental` route at `demos/playground/src/pages/api/rental/[...path].ts` uses `_domain-route-utils.ts`: it prefers `locals.emdash.domainStore`, otherwise uses `KyselyDomainStore` over the EmDash DB.
- The permanent playground reset route is guarded and does not reset persistent rental data.

Local users:

```text
owner_manual_created_1@example.com
tenant_manual_created_1@example.com
```

Creation/sync script:

```bash
node scripts/create-rental-local-users.mjs
```

Sandbox start script:

```bash
bash scripts/run-rental-local-sandbox.sh
```

Do not delete:

```text
.local/rental-sandbox/test.db
.local/rental-sandbox/users.json
```

To verify users are registered without recreating invites, run:

```bash
node scripts/create-rental-local-users.mjs
scripts/verify-alm-frontend.sh
```

The user creation script checks existing records first. If `users.json` already contains registered owner and tenant entries, do not rerun invite creation manually.

---

## 5. Domain collections / tables represented

The ALM/rental model uses these major collections:

```text
assets
asset_config_items
asset_interests
negotiation_rounds
agreement_versions
agreement_terms
handover_sessions
handover_item_checks
asset_access
asset_events
```

These collections support the full lifecycle:

```text
asset draft
asset config
owner conditions
marketplace publish
tenant interest
condition acceptance
owner inbox
pre-agreement negotiation
final agreement
restricted access
move-in handover
move-out handover
damage dispute
settlement
maintenance/private state
relist cycle foundation
audit trail
```

---

## 6. State model

The design separates CMS workflow state from business workflow state.

CMS/content state:

```text
status = draft / published / scheduled / deleted
```

Business workflow fields:

```text
business_state
visibility_state
interest_state
round_phase
round_kind
round_state
agreement_state
handover_state
```

This is important. Rental workflow is not overloaded into `status`.

Example marketplace state:

```text
status = published
business_state = listed
visibility_state = marketplace
```

After agreement:

```text
status = published
business_state = booked
visibility_state = restricted
```

After move-in accepted:

```text
business_state = rented
```

After move-out settlement:

```text
business_state = maintenance
visibility_state = private
```

---

## 7. Core relationships

### 7.1 User owns asset

A user owns an asset through:

```text
assets.owner_user_id
assets.author_id
asset_access.user_id with access_role = owner
```

The user is not an owner merely by having an EmDash account. Ownership begins when the user creates an asset.

### 6.2 User is interested in asset

Interest is represented through:

```text
asset_interests.asset_id
asset_interests.owner_user_id
asset_interests.interested_user_id
```

The renter’s employer, official email, salary/company details, and message are stored on the interest row / interest spec.

### 6.3 User rents asset

Rental access is represented through:

```text
assets.active_renter_user_id
agreement_versions.renter_user_id
asset_access.user_id with access_role = renter
```

### 6.4 Owner/renter negotiation

Negotiation rounds are append-only.

Important fields:

```text
negotiation_rounds.interest_id
negotiation_rounds.asset_id
negotiation_rounds.owner_user_id
negotiation_rounds.renter_user_id
negotiation_rounds.actor_user_id
negotiation_rounds.actor_role
negotiation_rounds.round_phase
negotiation_rounds.round_kind
negotiation_rounds.round_state
```

Pre-agreement negotiation uses:

```text
round_phase = pre_agreement
```

Move-out/return dispute negotiation uses:

```text
round_phase = return
```

---

## 7. Owner conditions and renter acceptance

Owner conditions are separate from the physical asset condition spec.

Physical condition spec:

```text
condition_spec
```

Owner rental/legal/business conditions:

```text
owner_conditions_spec
conditions_version
conditions_hash
```

Interest stores renter acceptance:

```text
accepted_conditions_version
accepted_conditions_at
accepted_conditions_snapshot
```

This prevents stale-condition acceptance. A renter must accept the current owner conditions before submitting interest.

---

## 8. Agreement snapshot

The final agreement creates:

```text
agreement_versions.printable_snapshot
agreement_terms rows
asset_access rows
```

The printable snapshot freezes:

```text
asset identity
party identities
commercial terms
config spec
physical condition spec
owner conditions
renter accepted conditions
accepted config items
accepted negotiation round details
negotiation round IDs
extra terms
```

The accepted negotiation round is now embedded inside the snapshot as:

```text
accepted_round
```

with fields such as:

```text
id
round_kind
round_state
message
price
currency
minimum_months
km_limit
deposit_amount
start_date
end_date
terms_spec
```

This matters because the printable agreement must be self-contained. It must not merely point to negotiation round IDs.

---

## 9. Major backend fixes made during review

### 9.1 `acceptFinalTerms()` now returns access rows

Earlier, `acceptFinalTerms()` granted access internally but returned only:

```text
{ agreement, terms, asset }
```

The local E2E expected the final agreement API response to expose granted access rows.

The command now returns:

```text
{ agreement, terms, asset, access }
```

This matches the business meaning of the transition: final accepted terms create an agreement and grant restricted access to owner and renter.

### 9.2 Agreement snapshot now freezes accepted round text

Earlier, `printable_snapshot` only stored:

```text
negotiation_round_ids
```

That meant the printed agreement did not contain the actual accepted negotiation message:

```text
Accepted final terms.
```

The snapshot now includes:

```text
accepted_round
```

This fixed the agreement immutability/printability contract.

### 9.3 Handover damage claim now verifies check belongs to handover

`claimHandoverDamage()` now verifies that the supplied:

```text
handoverItemCheckId
```

belongs to the supplied:

```text
handoverId
```

This prevents updating a check from another handover.

### 9.4 Handover session read now checks participant access

The fixture route for:

```text
GET /api/rental/handover/:handoverId
```

now checks participant authorization before returning handover session data.

This aligns handover read access with handover mutation permissions.

---

## 10. Local fixture API routes

The rental API bridge for Playwright is:

```text
e2e/fixture/src/pages/api/rental/[...path].ts
```

This route maps HTTP paths such as:

```text
/api/rental/reset
/api/rental/marketplace/assets
/api/rental/marketplace/assets/:assetId
/api/rental/marketplace/assets/:assetId/express-interest
/api/rental/owner/assets/add
/api/rental/owner/assets/:assetId/config
/api/rental/owner/assets/:assetId/publish-to-marketplace
/api/rental/owner/dashboard
/api/rental/renter/dashboard
/api/rental/negotiations/:interestId
/api/rental/negotiations/:interestId/add-round
/api/rental/negotiations/:interestId/accept-final-terms
/api/rental/agreements/:agreementId
/api/rental/handover/:assetId/start
/api/rental/handover/:handoverId/accept
/api/rental/handover/:handoverId/claim-damage
/api/rental/handover/:handoverId/add-round
/api/rental/handover/:handoverId/settle
/api/rental/handover/:handoverId
```

to the underlying rental domain commands and queries.

---

## 11. Custom local auth helper routes

Correct local helper route files:

```text
e2e/fixture/src/pages/api/setup/dev-login-as.ts
e2e/fixture/src/pages/api/setup/dev-logout-local.ts
```

Correct URLs:

```text
/api/setup/dev-login-as
/api/setup/dev-logout-local
```

Incorrect URLs that caused 404 traps:

```text
/_emdash/api/setup/dev-login-as
/_emdash/api/setup/dev-logout-local
```

Do not put custom fixture helper routes under:

```text
e2e/fixture/src/pages/_emdash
```

Reason: EmDash owns/injects the `/_emdash/...` route space. Fixture helper routes must be normal Astro routes under:

```text
e2e/fixture/src/pages/api
```

---

## 12. Persistent local SQLite DB

The local rental sandbox uses a persistent SQLite DB:

```text
.local/rental-sandbox/test.db
```

This DB is not destroyed between test runs.

The local synced user file is:

```text
.local/rental-sandbox/users.json
```

The currently verified users are:

```text
owner_manual_created_1@example.com
tenant_manual_created_1@example.com
```

Current verified IDs from the passing run:

```text
owner_manual_created_1@example.com
id = 01KRNMVVJV3N502FG7EBRQYWY0

tenant_manual_created_1@example.com
id = 01KRQFHQ2SRBBJ18BC50WXVXKK
```

These are real EmDash users created through the real passkey invite flow.

---

## 13. Correct local user creation/sync process

Start sandbox:

```bash
cd ~/PycharmProjects/emdash-experiments
bash scripts/run-rental-local-sandbox.sh
```

Create or sync users:

```bash
cd ~/PycharmProjects/emdash-experiments
node scripts/create-rental-local-users.mjs
```

If the script prints:

```text
status: invite_created
```

open the invite URL in Chrome and complete passkey registration.

After accepting both invites, rerun:

```bash
node scripts/create-rental-local-users.mjs
```

Correct final output:

```text
Owner:
  status: registered
  inviteUrl: null
  user.id: present

Tenant:
  status: registered
  inviteUrl: null
  user.id: present

Both users are registered and synced into users.json.
```

Do not repeatedly create invites after both users are registered.

The script must remain sync-first:

1. Ask EmDash admin users API whether user already exists.
2. If user exists, sync ID into `users.json`.
3. If user does not exist, create invite.
4. If invite returns `USER_EXISTS`, do not crash blindly; lookup/sync the user.
5. Do not use `dev-login-as` to determine whether a real user exists.
6. `dev-login-as` is only for local session creation after `users.json` already contains real user IDs.

---

## 14. Dev/auth traps discovered

### 14.1 Do not put custom routes under `/_emdash`

Bad:

```text
e2e/fixture/src/pages/_emdash/api/setup/dev-login-as.ts
e2e/fixture/src/pages/_emdash/api/setup/dev-logout-local.ts
```

Good:

```text
e2e/fixture/src/pages/api/setup/dev-login-as.ts
e2e/fixture/src/pages/api/setup/dev-logout-local.ts
```

### 14.2 Browser page origin matters in Playwright

Inside `page.evaluate()`, this can fail:

```typescript
fetch("/api/setup/dev-login-as")
```

if the page is still:

```text
about:blank
```

Always navigate first:

```typescript
await page.goto("/", { waitUntil: "domcontentloaded" });
```

Then browser-side relative fetch works.

### 14.3 Owner page is not anonymous

A Playwright page in an owner browser context has owner cookies.

Do not use:

```text
owner.page
```

to test anonymous behavior.

Use:

```text
fresh browser context with no cookies
```

or direct fetch without a `Cookie` header.

### 14.4 Curl needs cookie jar

Curl does not remember cookies between requests unless explicitly told.

Chrome and Playwright remember cookies automatically.

In terminal-only curl testing:

```bash
-c /tmp/file.cookies
```

saves cookies.

```bash
-b /tmp/file.cookies
```

sends cookies.

The final local Playwright test avoids cookie confusion by extracting the session cookies from the browser context and using explicit cookie headers for workflow API requests.

### 14.5 Dev bypass duplicate user race

The dev-bypass/setup path can hit duplicate-user behavior if multiple setup attempts try to create the same dev admin user.

Observed failure class:

```text
UNIQUE constraint failed: users.email
```

This must be idempotent.

Expected behavior:

```text
If dev@emdash.local already exists, reuse it.
Do not insert duplicate dev admin users.
```

Agents must inspect the existing setup/dev-bypass flow before changing auth setup or Playwright global setup.

### 14.6 Hydration timeout needed increase

The EmDash admin shell can take longer than 15 seconds to hydrate in local headed Playwright runs, especially on a cold Vite/Astro dev server where dependency optimization happens.

The admin fixture hydration wait was increased to 60 seconds.

Agents running local headed e2e should not assume 15 seconds is enough on a cold machine.

### 14.7 Dev email shape

The dev email endpoint returns latest emails under:

```text
data.items[0].message.text
```

not:

```text
data.emails
```

The invite URL must be read from the dev email body when the invite API sends through the dev email provider.

### 14.8 Do not rerun user creation blindly

Once `.local/rental-sandbox/users.json` contains registered owner and tenant user IDs, do not rerun invite creation blindly.

Safe behavior is lookup/sync first.

---

## 15. Tests currently passing

### 15.1 TypeScript test target

```bash
cd ~/PycharmProjects/emdash-experiments
pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit
```

Passed.

### 15.2 Domain tests

```bash
cd ~/PycharmProjects/emdash-experiments
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/domain
```

Passed.

Result:

```text
Test Files  2 passed (2)
Tests       8 passed (8)
```

### 15.3 Full local Playwright lifecycle

```bash
cd ~/PycharmProjects/emdash-experiments
pnpm exec playwright test   -c playwright.rental-local.config.ts   e2e/tests/rental-local-existing-users.spec.ts   --project=chromium   --headed
```

Passed.

Result:

```text
1 passed
```

---

## 16. What the full local lifecycle test proves

The passing Playwright test proves:

1. Owner and tenant are real EmDash users.
2. The test does not recreate passkeys.
3. Custom local login reuses real user IDs.
4. Owner creates an asset.
5. User becomes asset owner only by creating asset.
6. Owner adds config spec.
7. Owner adds physical condition spec.
8. Owner adds owner rental/business conditions.
9. Owner adds granular asset config item.
10. Owner publishes asset to marketplace.
11. Public marketplace listing shows the asset.
12. Public asset detail shows owner conditions.
13. Anonymous express-interest fails.
14. Tenant express-interest without accepting owner conditions fails.
15. Tenant accepts current owner conditions.
16. Tenant submits interest.
17. Accepted condition snapshot is stored.
18. Owner dashboard inbox sees submitted interest.
19. Owner asks question / requests document.
20. Tenant answers.
21. Tenant makes offer.
22. Owner rejects/counters.
23. Tenant accepts final terms.
24. Negotiation rounds are append-only.
25. `actor_user_id` is derived from session.
26. `actor_role` is derived from owner/renter relationship.
27. Final accepted terms create agreement.
28. Agreement snapshot freezes owner conditions.
29. Agreement snapshot freezes accepted round details.
30. Asset becomes booked/restricted.
31. Asset leaves public marketplace.
32. Owner and tenant get access rows.
33. Tenant can read agreement.
34. Move-in handover starts from active config items.
35. Move-in creates item checks.
36. Tenant accepts move-in handover.
37. Asset becomes rented.
38. Owner starts move-out handover.
39. Owner claims damage.
40. Tenant disputes.
41. Owner makes settlement offer.
42. Tenant accepts settlement.
43. Settlement closes handover.
44. Asset moves to maintenance/private.
45. Handover session returns checks and return-phase rounds.
46. Disputed check moves to settlement-agreed.
47. Original agreement snapshot remains unchanged after move-out settlement.

---

## 17. What is still not tested

Backend/product gaps still not fully tested:

1. Production Cloudflare D1 persistence for all rental collections after the latest fixes.
2. Kysely-backed integration after the latest `acceptFinalTerms()` and handover fixes.
3. Real production login/signup pages for SaaS users.
4. Public self-registration flow outside EmDash admin invite UI.
5. Actual owner/renter UI forms.
6. Asset image/media upload.
7. Asset gallery rendering.
8. Handover evidence photo/video upload.
9. Printable PDF generation from `printable_snapshot`.
10. Digital signature / notarization workflow.
11. Payment/subscription/entitlement limits.
12. Email/WhatsApp/task notifications for owner/renter actions.
13. Multiple concurrent interests on the same asset.
14. Interest rejection flow through UI.
15. Relist cycle through HTTP/UI after settlement:
    - return asset to draft
    - edit config/spec
    - relist
    - verify old agreement remains unchanged
16. Authorization negative tests for unrelated logged-in users across every agreement/handover route.
17. CPU/load tests for marketplace queries against larger asset counts.
18. Real frontend smoke test over actual Astro pages.
19. Production migrations for a dedicated rental SaaS app outside the playground/demo context.
20. Cloudflare deployment smoke test.
21. Agreement snapshot rendering as a human-readable contract page.
22. Admin/business settings for reusable owner condition templates.
23. Bulk asset import.
24. Search/filter indexes for large marketplace data.
25. Audit/event viewer UI.

---

## 18. Backend pieces not added yet

Not yet added:

1. Production migration files for the rental SaaS collections.
2. Cloudflare D1/R2 binding verification.
3. Payment/subscription tables.
4. Notification queue.
5. Agreement PDF/export endpoint.
6. Public SaaS signup/login wrapper pages.
7. Media upload workflow for asset photos.
8. Media upload workflow for handover evidence.
9. Owner reusable condition templates.
10. Bulk import of assets.
11. Marketplace search/filter indexes beyond the current scalar-state query design.
12. Real production deployment config for this product shape.

---

## 19. Recommended final checks before merge

Run from repo root:

```bash
cd ~/PycharmProjects/emdash-experiments

pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit

packages/blocks/node_modules/.bin/vitest run demos/playground/tests/domain

pnpm exec playwright test   -c playwright.rental-local.config.ts   e2e/tests/rental-local-existing-users.spec.ts   --project=chromium   --headed

git status --short
```

Optional broader checks:

```bash
pnpm run build
pnpm --filter @emdash-cms/playground typecheck
pnpm --filter @emdash-cms/playground build
pnpm typecheck
pnpm lint
pnpm test
```

If broader workspace commands fail, capture exact output and compare with base branch. Do not label unrelated monorepo failures as rental backend failures without proof.

---

## 20. Files that should be included in the PR

Expected categories:

```text
demos/playground/src/lib/domain/**
demos/playground/src/pages/api/**
demos/playground/tests/domain/**
e2e/fixture/src/pages/api/rental/[...path].ts
e2e/fixture/src/pages/api/setup/dev-login-as.ts
e2e/fixture/src/pages/api/setup/dev-logout-local.ts
e2e/tests/rental-local-existing-users.spec.ts
e2e/tests/rental-saas-flow.spec.ts
e2e/global-setup.ts
e2e/fixtures/admin.ts
scripts/create-rental-local-users.mjs
scripts/run-rental-local-sandbox.sh
playwright.rental-local.config.ts
README_ALM.md
findings.md
package.json / pnpm-lock.yaml if dependencies changed
.gitignore if zip ignores were added
```

Expected not to include:

```text
zip-file/*.zip
*.zip binary archives
temporary screenshots
test-results
playwright-report
.local/rental-sandbox/test.db
.local/rental-sandbox/users.json
```

The persistent local DB and user JSON must stay local only. They are not committed.

---

## 21. Frontend direction

Next work should be a separate frontend PR.

Do not build a React app.

Do not build a heavy client-side state machine.

Do not expose EmDash admin to tenants/renters.

Use thin Astro pages and small reusable components.

The backend already has the right commands and queries. The frontend should mostly render state and submit forms.

Recommended UI files:

```text
demos/playground/src/layouts/RentalBase.astro

demos/playground/src/components/rental/RentalHeader.astro
demos/playground/src/components/rental/AssetCard.astro
demos/playground/src/components/rental/SpecTable.astro
demos/playground/src/components/rental/ConditionBox.astro
demos/playground/src/components/rental/ThreadPanel.astro
demos/playground/src/components/rental/ActionForm.astro
demos/playground/src/components/rental/HandoverChecklist.astro

demos/playground/src/pages/index.astro
demos/playground/src/pages/marketplace/index.astro
demos/playground/src/pages/marketplace/assets/[id].astro
demos/playground/src/pages/owner/index.astro
demos/playground/src/pages/owner/assets/new.astro
demos/playground/src/pages/interests/[interestId].astro
demos/playground/src/pages/handover/[handoverId].astro
```

---

## 22. Frontend page responsibilities

### 22.1 `/`

Sales landing page.

Use the EmDash marketing template style:

```text
hero
feature grid
how it works
pricing cards
FAQ
call to action
```

Primary CTAs:

```text
List a property
View marketplace
Continue as tenant
```

### 22.2 `/marketplace`

Public asset grid.

Shows:

```text
asset cards
price
location
short spec
owner condition summary
CTA to view details
```

### 22.3 `/marketplace/assets/[id]`

Public asset detail.

Shows:

```text
asset title
price
location
config spec
physical condition spec
owner conditions
photos later
express-interest form if logged in
login/register CTA if anonymous
explicit checkbox to accept current owner conditions
```

### 22.4 `/owner`

Owner dashboard.

Shows:

```text
owned assets
draft/listed/booked/rented/maintenance state
submitted interests inbox
active negotiation tasks
handover tasks
```

### 22.5 `/owner/assets/new`

Owner creates asset.

Fields:

```text
asset kind
title
location
price
config spec
physical condition spec
owner rental conditions
granular config items
publish button
```

### 22.6 `/interests/[interestId]`

Shared owner/renter negotiation page.

Uses one thread UI.

Owner actions:

```text
ask question
request document
reject
counter
accept final terms
```

Renter actions:

```text
answer
make offer
counter
accept
```

### 22.7 `/handover/[handoverId]`

Move-in/move-out handover page.

Shows:

```text
handover checklist
config item checks
damage claim form
dispute/settlement thread
settlement action
```

This page should reuse the same thread UI with:

```text
round_phase = return
```

---

## 23. UI component responsibilities

### 23.1 `RentalBase.astro`

Base layout for rental SaaS pages.

Should include:

```text
responsive shell
header
footer
main slot
shared styles
theme support if copied from marketing template
```

### 23.2 `RentalHeader.astro`

Header with:

```text
logo
marketplace link
owner dashboard link
login/register/logout state
current user email if logged in
primary CTA
```

### 23.3 `AssetCard.astro`

Card for marketplace and owner dashboard.

Shows:

```text
title
location
price
asset kind
state badge
short conditions summary
CTA
```

### 23.4 `SpecTable.astro`

Displays:

```text
config_spec
condition_spec
asset_config_items
```

### 23.5 `ConditionBox.astro`

Displays owner conditions and acceptance state.

Should clearly show:

```text
conditions_version
conditions_hash
accepted / not accepted
```

### 23.6 `ThreadPanel.astro`

Shared negotiation thread.

Used for:

```text
pre-agreement negotiation
return/move-out dispute negotiation
```

Shows:

```text
round kind
actor role
message
price/deposit/months if present
timestamp
state
```

### 23.7 `ActionForm.astro`

Small form component for submitting a next action.

Used for:

```text
ask question
answer
offer
counter
acceptance
reject
settlement offer
damage dispute response
```

### 23.8 `HandoverChecklist.astro`

Shows:

```text
handover item checks
owner declared state
observed state
claimed state
estimated repair cost
dispute state
```

---

## 24. EmDash template guidance for frontend

The public sales page should copy the direction of EmDash’s marketing template.

Useful source pattern:

```text
templates/marketing/src/pages/index.astro
templates/marketing/src/layouts/Base.astro
templates/marketing/src/components/MarketingBlocks.astro
templates/marketing/src/components/blocks/Hero.astro
templates/marketing/src/components/blocks/Pricing.astro
```

The screenshots under:

```text
assets/templates/marketing/latest
```

are generated screenshots, not the source code.

Use marketing template source for layout/style ideas.

The frontend should be:

```text
Astro-first
server-first
responsive
minimal JavaScript
simple forms
simple fetch/POST actions
no custom frontend state machine
```

---

## 25. Frontend test plan

After UI pages are added, add one focused UI e2e test using the same persistent local users.

Flow:

```text
owner logs in
owner creates asset through UI
owner publishes
tenant logs in
tenant views marketplace
tenant accepts conditions
tenant expresses interest
owner opens inbox
owner asks question
tenant answers
owner accepts final terms
```

Do not automate passkey creation in this UI smoke test.

Reuse:

```text
owner_manual_created_1@example.com
tenant_manual_created_1@example.com
.local/rental-sandbox/users.json
/api/setup/dev-login-as
/api/setup/dev-logout-local
```

---

## 26. Go-to-market recommendation

Do not launch as a generic marketplace first.

Do not launch as “CMS for assets.”

Launch as a controlled beta with a narrow, sharp promise.

Recommended initial positioning:

```text
Rental handover and negotiation ledger for Bangalore landlords.
```

Clear promise:

```text
List your flat, collect tenant interest, negotiate conditions, freeze agreement terms, and handle move-in/move-out damage disputes with an auditable trail.
```

First beta audience:

```text
Owners with 1-5 rental flats
Owners who personally negotiate tenant terms
Owners who have had move-out damage/deposit disputes
Owners who want a clean written trail without WhatsApp chaos
```

Initial public page CTAs:

```text
List a property
View marketplace
Start a handover
```

Initial pricing idea:

```text
Free:
  1 asset
  1 active negotiation

Owner Basic:
  ₹299/month
  3 assets
  agreement snapshot
  handover checklist

Owner Pro:
  ₹999/month
  unlimited assets
  printable agreement snapshots
  move-out dispute ledger
```

---

## 27. Next PR recommendation

This backend PR should be merged after final local checks.

The next PR should be:

```text
Thin Astro rental SaaS UI using the tested rental API
```

Scope of next PR:

```text
RentalBase layout
RentalHeader
marketplace listing
marketplace asset detail
owner dashboard
owner asset creation
interest negotiation screen
handover screen
one UI smoke e2e
```

Do not add:

```text
payments
PDF generation
notifications
media upload
advanced search
multi-tenant production deployment
```

until the basic UI is working.

---

## 28. Agent instructions for future work

Before changing files, agents must inspect current folder/file contents.

For frontend work, inspect or ingest:

```text
demos/playground/src
demos/playground/src/pages
demos/playground/src/components
demos/playground/src/layouts
e2e/fixture/src/pages
e2e/tests
scripts
```

For backend lifecycle changes, inspect or ingest:

```text
demos/playground/src/lib/domain
demos/playground/tests/domain
e2e/fixture/src/pages/api/rental/[...path].ts
e2e/tests/rental-local-existing-users.spec.ts
scripts/create-rental-local-users.mjs
scripts/run-rental-local-sandbox.sh
```

Rules:

1. No mutation command until relevant current files are inspected.
2. Do not guess route paths.
3. Do not put custom helper routes under `/_emdash`.
4. Do not recreate users if `.local/rental-sandbox/users.json` already has registered owner/tenant IDs.
5. Do not use `owner.page` to test anonymous behavior.
6. Do not call browser-side `fetch("/api/...")` from an `about:blank` page.
7. Do not weaken tests merely to pass.
8. If a test expects a real product contract, fix the backend contract instead of deleting the assertion.
9. Always run the local rental e2e after backend lifecycle changes.

Required local rental e2e command:

```bash
pnpm exec playwright test   -c playwright.rental-local.config.ts   e2e/tests/rental-local-existing-users.spec.ts   --project=chromium   --headed
```

---

## 29. Merge recommendation

This backend PR is ready for controlled merge if these remain green:

```text
tsconfig.test typecheck passes
domain vitest passes
local full rental lifecycle Playwright passes
git diff contains no binary zip file
local persistent DB/users files are not committed
```

After merge:

1. Create a new frontend branch.
2. Build the thin Astro SaaS pages.
3. Use the existing backend routes.
4. Add one UI smoke e2e.
5. Prepare controlled beta/demo.

---

## 30. Final verified commands from local machine

The following commands passed locally:

```bash
cd ~/PycharmProjects/emdash-experiments

pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit
```

```bash
cd ~/PycharmProjects/emdash-experiments

packages/blocks/node_modules/.bin/vitest run demos/playground/tests/domain
```

```bash
cd ~/PycharmProjects/emdash-experiments

pnpm exec playwright test   -c playwright.rental-local.config.ts   e2e/tests/rental-local-existing-users.spec.ts   --project=chromium   --headed
```

Latest Playwright result:

```text
1 passed
```

Latest domain result:

```text
Test Files  2 passed (2)
Tests       8 passed (8)
```

This is the backend checkpoint to preserve before moving to frontend.
