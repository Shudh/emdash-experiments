# ALM Workflow-Card Engine

ALM Rentals has an approved rental flow under `/`, `/owner`, `/marketplace`, `/interests/:id`, and `/api/rental`. That flow remains the stable baseline.

The workflow-card engine exists beside it under `/wf` and `/api/wf-rental` so the product can move from hardcoded rental commands to generic workflow operations:

- create a card
- answer a card
- decide a card
- run a workflow action
- create reusable tenant documents
- attach private evidence

The first goal is parity, not a richer business process. If the generic engine can reproduce the current Eva/Rakesh flow, it is a credible replacement path for the hardcoded backend. Future steps such as payment proof, salary slips, agreement review, signed agreement upload, and refund notices should mostly become workflow definition data instead of new backend commands.

## Isolation

The existing ALM app and `/api/rental` routes are not changed. Workflow data is stored in separate tables with the `ec_wf_*` prefix:

- `ec_wf_assets`
- `ec_wf_asset_config_items`
- `ec_wf_asset_interests`
- `ec_wf_workflow_definitions`
- `ec_wf_workflow_instances`
- `ec_wf_workflow_cards`
- `ec_wf_workflow_card_responses`
- `ec_wf_tenant_documents`
- `ec_wf_evidence_attachments`
- `ec_wf_asset_access`
- `ec_wf_asset_events`

The workflow sandbox DB is `.local/workflow-rental-sandbox/test.db`. On first start it is copied from `.local/rental-sandbox/test.db`, then workflow tables are created. This preserves the existing local EmDash auth setup, users, passkeys, and sessions while isolating workflow writes from the approved ALM tables.

## Auth

Auth is reused. The workflow engine does not add login, logout, passkey, or EmDash admin behavior. Local manual testing uses:

- Owner/Eva: `owner_manual_created_1@example.com`
- Tenant/Rakesh: `tenant_manual_created_1@example.com`

Public users are not sent to `/_emdash/admin/login`.

## Definitions

Workflow behavior is driven by definitions in `demos/playground/src/lib/workflow-rental/definitions/`.

The parity definition is `alm-current-parity-v1.ts`. It declares workflow states, card types, action permissions, answer schemas, evidence policies, and transition effects. Cards remain generic tasks with states such as `open`, `answered`, `accepted`, `rejected`, and `waived`. Stage movement is performed by declared transitions and explicit owner actions rather than by adding one backend command per business step.

## Cards And Actions

The backend verbs are implemented in `demos/playground/src/lib/workflow-rental/commands/`:

- `create-workflow-card.ts`
- `answer-workflow-card.ts`
- `decide-workflow-card.ts`
- `run-workflow-action.ts`
- `create-tenant-document.ts`
- `attach-evidence.ts`

Every mutation runs transactionally through the workflow store and appends an event in `ec_wf_asset_events`.

## Evidence And Documents

Tenant documents are reusable applicant-owned records in `ec_wf_tenant_documents`. Evidence attachments are scoped links in `ec_wf_evidence_attachments` that attach a document or storage reference to a specific asset, application, card, or response.

Private evidence access goes through:

```bash
GET /api/wf-rental/evidence/:attachmentId/download
```

The handler checks workflow participation before returning download metadata.

## Manual Sandbox

Run:

```bash
bash scripts/run-workflow-rental-local-sandbox.sh
```

Open:

```text
http://localhost:4450/wf
```

Expected startup output includes:

```text
Workflow rental sandbox: http://localhost:4450/wf
Workflow rental DB: .local/workflow-rental-sandbox/test.db
Source auth DB copied from: .local/rental-sandbox/test.db
Owner: owner_manual_created_1@example.com
Tenant: tenant_manual_created_1@example.com
```

## Tests

Workflow unit/integration tests:

```bash
pnpm --dir demos/playground exec vitest run tests/workflow-rental
```

Workflow e2e tests expect the workflow sandbox on port `4450`:

```bash
pnpm exec playwright test -c e2e/workflow-rental.playwright.config.ts workflow-rental-parity-ui.spec.ts workflow-rental-access-negative.spec.ts
```

Existing approved ALM tests remain unchanged and should continue to run against the approved sandbox.
