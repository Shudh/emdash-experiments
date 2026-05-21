Create this file:

`how_to_test.md`

Paste this full content.

````md
# How to Test WF1 Workflow Definitions

This project treats WF1 workflow definitions as data, even though they currently live in TypeScript files.

That means a workflow definition change can legitimately change:

- allowed states
- card types
- evidence policy
- action names
- transition gates
- asset-state transitions
- application-form-state transitions

So tests must not silently depend on whichever workflow definition is currently the default.

The rule is simple:

`demos/playground/tests/wf1/<workflow-definition-id>/`

Each workflow definition gets its own test folder.

Examples:

```text
demos/playground/tests/wf1/simple-available-rented/
demos/playground/tests/wf1/rental-application-form-basic/
````

Do not rewrite old workflow tests to fit a new workflow.

Do not delete old workflow tests when adding a new workflow.

Do not test workflow behavior through “whatever the current default is,” except in `definition-registry.test.ts`.

---

## 1. Current WF1 Test Layout

Expected layout:

```text
demos/playground/tests/wf1/
  definition-registry.test.ts
  test-helpers.ts

  simple-available-rented/
    workflow.test.ts
    projection.test.ts

  rental-application-form-basic/
    workflow.test.ts
    projection.test.ts
```

Meaning:

`definition-registry.test.ts`

Tests which definitions are registered and which one is the current default.

`test-helpers.ts`

Contains shared users, store setup, and workflow test profiles.

`simple-available-rented/`

Tests the old simple workflow definition.

`rental-application-form-basic/`

Tests the new generic application-form workflow definition.

---

## 2. Workflow Definition Rule

When a workflow definition is added:

1. Add the workflow definition file.
2. Register it in the workflow registry.
3. Add a profile in `test-helpers.ts`.
4. Create a folder named exactly after the workflow definition id.
5. Add workflow/projection/route tests under that folder.
6. Run only that folder first.
7. Then run the full WF1 suite.

Example new workflow id:

```text
vehicle-return-basic
```

Create:

```text
demos/playground/tests/wf1/vehicle-return-basic/
```

Recommended files:

```text
workflow.test.ts
projection.test.ts
routes.test.ts
```

The command to run only this new definition should be:

```bash
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1/vehicle-return-basic
```

---

## 3. Test Helper Rule

Every definition-specific test should seed data with an explicit workflow profile.

Good:

```ts
const workflow = WF1_TEST_WORKFLOWS.rentalApplicationFormBasic;
const { store, instance } = await seedSimpleApplication(undefined, workflow);
```

Bad:

```ts
const { store, instance } = await seedSimpleApplication();
```

The default helper is allowed for convenience, but definition tests should be explicit.

This prevents old tests from accidentally changing behavior when the default workflow changes.

---

## 4. Current Workflow Profiles

Current profiles live in:

```text
demos/playground/tests/wf1/test-helpers.ts
```

Known profiles:

```ts
WF1_TEST_WORKFLOWS.simpleAvailableRented
WF1_TEST_WORKFLOWS.rentalApplicationFormBasic
```

The old workflow profile expects:

```text
definition id: simple-available-rented
initial application form state: available
accepted application form state: rented
accept action: mark_rented
plain text card: owner_task
required evidence card: payment_proof_task
```

The new workflow profile expects:

```text
definition id: rental-application-form-basic
initial application form state: application_under_review
accepted application form state: accepted_as_tenant
accept action: accept_as_tenant
plain text card: free_text
required evidence card: free_text_required_evidence
move-out state: moveout_requested
closed state: moveout_closed
asset return state: return_pending
```

---

## 5. Run TypeScript Test Compile

Run this before WF1 test execution:

```bash
cd ~/PycharmProjects/emdash-experiments
pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit
```

This catches import mistakes, type mistakes, and broken test helper signatures.

---

## 6. Run One Workflow Definition Test Folder

Run old workflow only:

```bash
cd ~/PycharmProjects/emdash-experiments
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1/simple-available-rented
```

Run new workflow only:

```bash
cd ~/PycharmProjects/emdash-experiments
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1/rental-application-form-basic
```

This is the main daily command when editing a workflow definition.

---

## 7. Run Definition Registry Tests

Run only registry/default-definition tests:

```bash
cd ~/PycharmProjects/emdash-experiments
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1/definition-registry.test.ts
```

Use this after changing:

```text
demos/playground/src/lib/wf1/definitions/registry.ts
```

This test should verify:

* old definitions remain registered
* new definitions are registered
* the intended default workflow is correct
* missing workflow id/version throws correctly

---

## 8. Run All WF1 Unit and Projection Tests

Run:

```bash
cd ~/PycharmProjects/emdash-experiments
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1
```

Expected result after the current pass:

```text
Test Files  5 passed
Tests       12 passed
```

If a backup folder appears inside the repo and contains `.test.ts` files, Vitest may accidentally run it.

Backups should not be inside the repo.

Use:

```text
/tmp/emdash-wf1-test-backups/
```

not:

```text
.wf1-test-backups/
```

If this accidentally exists, remove it before running tests:

```bash
cd ~/PycharmProjects/emdash-experiments
rm -rf .wf1-test-backups
```

---

## 9. Run Package Typecheck

Run:

```bash
cd ~/PycharmProjects/emdash-experiments
pnpm --filter emdash typecheck
```

Use this before commit.

---

## 10. Run WF1 Headed Browser E2E

Start the WF1 local sandbox in one terminal:

```bash
cd ~/PycharmProjects/emdash-experiments
bash scripts/run-wf1-rental-local-sandbox.sh
```

In another terminal, run the headed browser test:

```bash
cd ~/PycharmProjects/emdash-experiments
pnpm exec playwright test -c e2e/workflow-rental.playwright.config.ts e2e/tests/wf1-simple-ui.spec.ts --project=chromium --headed
```

Run headless version:

```bash
cd ~/PycharmProjects/emdash-experiments
pnpm exec playwright test -c e2e/workflow-rental.playwright.config.ts e2e/tests/wf1-simple-ui.spec.ts --project=chromium
```

Open latest Playwright HTML report:

```bash
cd ~/PycharmProjects/emdash-experiments
pnpm exec playwright show-report
```

---

## 11. What the Current Headed E2E Covers

Current WF1 headed test covers:

1. Eva logs in as owner.
2. Eva creates a WF1 asset.
3. Eva adds starter flat inventory.
4. Eva publishes asset to marketplace.
5. Anonymous user sees login-to-apply state.
6. Rakesh logs in as tenant.
7. Rakesh applies using `rental-application-form-basic`.
8. Workspace shows:

```text
Asset State: listed
Application Form State: application_under_review
```

9. Rakesh can reopen his application workspace from marketplace.
10. Eva opens owner dashboard.
11. Eva opens the application workspace.
12. Eva creates a generic `free_text_required_evidence` task.
13. `Accept as tenant` is disabled while the required evidence task is unresolved.
14. Rakesh answers with text and evidence.
15. Eva sees answer text and attachment UI.
16. Eva accepts Rakesh as tenant.
17. Workspace shows:

```text
Asset State: rented
Application Form State: accepted_as_tenant
```

18. Eva requests move-out.
19. Workspace shows:

```text
Asset State: return_pending
Application Form State: moveout_requested
```

20. Eva sees move-out return-check generator.
21. Eva generates return-check evidence task from asset config item.
22. `Close move-out` is disabled while return-check task is unresolved.
23. Rakesh answers return-check task with text and evidence.
24. Eva closes move-out.
25. Workspace shows:

```text
Asset State: listed
Application Form State: moveout_closed
```

26. WF1 home does not leak old `/wf/` links.

---

## 12. When a Workflow Definition Changes

When changing only workflow definition data, do not edit old test folders.

Example: changing the new workflow:

```text
demos/playground/src/lib/wf1/definitions/rental-application-form-basic-v1.ts
```

Only update tests under:

```text
demos/playground/tests/wf1/rental-application-form-basic/
```

Then run:

```bash
cd ~/PycharmProjects/emdash-experiments
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1/rental-application-form-basic
```

Then run:

```bash
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1
```

Then run headed E2E if the user-visible UI path changed:

```bash
pnpm exec playwright test -c e2e/workflow-rental.playwright.config.ts e2e/tests/wf1-simple-ui.spec.ts --project=chromium --headed
```

---

## 13. When Adding a New Workflow Definition

Suppose the new workflow id is:

```text
tenant-renewal-basic
```

Add definition file:

```text
demos/playground/src/lib/wf1/definitions/tenant-renewal-basic-v1.ts
```

Register it in:

```text
demos/playground/src/lib/wf1/definitions/registry.ts
```

Add a profile in:

```text
demos/playground/tests/wf1/test-helpers.ts
```

Example profile name:

```ts
WF1_TEST_WORKFLOWS.tenantRenewalBasic
```

Create test folder:

```text
demos/playground/tests/wf1/tenant-renewal-basic/
```

Add:

```text
workflow.test.ts
projection.test.ts
routes.test.ts
```

Run:

```bash
cd ~/PycharmProjects/emdash-experiments
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1/tenant-renewal-basic
```

Then:

```bash
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1
```

If the workflow becomes the new default, also update:

```text
definition-registry.test.ts
```

and run:

```bash
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1/definition-registry.test.ts
```

---

## 14. How to Roll Back Default Workflow

Rollback means changing the default workflow definition, not deleting newer definitions.

Open:

```text
demos/playground/src/lib/wf1/definitions/registry.ts
```

Change:

```ts
const DEFAULT_WORKFLOW_DEFINITION = RENTAL_APPLICATION_FORM_BASIC_V1;
```

to the desired rollback definition, for example:

```ts
const DEFAULT_WORKFLOW_DEFINITION = SIMPLE_AVAILABLE_RENTED_V1;
```

Do not remove `RENTAL_APPLICATION_FORM_BASIC_V1` from `WORKFLOW_DEFINITIONS`.

Old instances still need their registered definition.

Then update only:

```text
demos/playground/tests/wf1/definition-registry.test.ts
```

to expect the rollback default.

Then run:

```bash
cd ~/PycharmProjects/emdash-experiments
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1/definition-registry.test.ts
```

Then run the old definition folder:

```bash
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1/simple-available-rented
```

Then run all WF1 tests:

```bash
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1
```

If headed E2E is still written for the new default path, either:

1. keep it selecting `rental-application-form-basic` explicitly, or
2. add a separate headed E2E for the rollback default.

Do not silently mutate the new E2E into an old E2E.

Use separate E2E files when needed:

```text
e2e/tests/wf1-simple-available-rented.spec.ts
e2e/tests/wf1-rental-application-form-basic.spec.ts
```

---

## 15. Safe Commit Checklist

Before commit:

```bash
cd ~/PycharmProjects/emdash-experiments
git branch --show-current
```

Confirm branch:

```text
feat/wf1-clean-workflow-engine
```

Remove temporary backup folders from repo tree:

```bash
rm -rf demos/playground/tests/wf1/_mixed-disabled
rm -rf .wf1-test-backups
```

Check status:

```bash
git status --short
```

Run final tests:

```bash
pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/wf1
pnpm --filter emdash typecheck
pnpm exec playwright test -c e2e/workflow-rental.playwright.config.ts e2e/tests/wf1-simple-ui.spec.ts --project=chromium --headed
```

Stage real files only:

```bash
git add \
  demos/playground/src/lib/wf1 \
  demos/playground/src/components/wf1 \
  demos/playground/src/components/rental/ActionForm.astro \
  demos/playground/src/pages/wf1 \
  demos/playground/tests/wf1 \
  e2e/tests/wf1-simple-ui.spec.ts \
  how_to_test.md
```

Confirm no backup files are staged:

```bash
git diff --cached --name-only | grep -E '_mixed-disabled|\.wf1-test-backups|\.bak' || true
```

Expected: no output.

Commit:

```bash
git commit -m "Add generic WF1 application form workflow and moveout tests"
```

Push:

```bash
git push origin HEAD
```

---

## 16. Failure Interpretation Rules

If state expectation fails:

Check whether the test is running against the intended definition folder.

If card type expectation fails:

Check the workflow profile in `test-helpers.ts`.

If evidence answer fails with `Answer text is too short`:

The test sent `answer.reference` to a generic `free_text_required_evidence` card. Send `answer.text`.

If Playwright cannot find `Application Form State`:

Use regex helpers that tolerate wording polish, but still check the state id.

If Playwright cannot find `Open <filename>`:

Do not assert the exact filename. Assert answer text and attachment UI.

If Vitest runs backup tests:

Move backups outside the repo or remove `.wf1-test-backups`.

---

## 17. Golden Rule

Workflow behavior tests belong to workflow definition folders.

Definition registry tests are the only tests that should care about the current default.

Headed browser E2E should test one clear user journey.

Do not mutate old definition tests to fit new definitions.

Do not delete old definition tests when adding new definitions.

````

Then stage it:

```bash
git add how_to_test.md
````

Before commit, run:

```bash
git diff --cached --stat
```
