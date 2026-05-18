#!/usr/bin/env bash

set -u
set -o pipefail

REPO_DIR="${REPO_DIR:-$HOME/PycharmProjects/emdash-experiments}"
OUT_ROOT="${OUT_ROOT:-$HOME/digests}"
STAMP="$(date '+%Y%m%d_%H%M%S')"
OUT_DIR="$OUT_ROOT/wf-core-review-$STAMP"
OUT_FILE="$OUT_DIR/wf-core-review-$STAMP.txt"
DB_FILE="$REPO_DIR/.local/workflow-rental-sandbox/test.db"

mkdir -p "$OUT_DIR"

cd "$REPO_DIR" || {
  echo "Cannot cd into repo: $REPO_DIR"
  exit 1
}

critical_files=(
  "demos/playground/src/lib/workflow-rental/core/types.ts"
  "demos/playground/src/lib/workflow-rental/core/definition-schema.ts"
  "demos/playground/src/lib/workflow-rental/core/policy.ts"
  "demos/playground/src/lib/workflow-rental/core/card-validation.ts"
  "demos/playground/src/lib/workflow-rental/core/transition-effects.ts"

  "demos/playground/src/lib/workflow-rental/definitions/alm-current-parity-v1.ts"
  "demos/playground/src/lib/workflow-rental/definitions/rental-application-v1.ts"
  "demos/playground/src/lib/workflow-rental/definitions/rental-return-v1.ts"

  "demos/playground/src/lib/workflow-rental/store/collections.ts"
  "demos/playground/src/lib/workflow-rental/store/repository.ts"
  "demos/playground/src/lib/workflow-rental/store/kysely-workflow-store.ts"

  "demos/playground/src/lib/workflow-rental/commands/create-asset.ts"
  "demos/playground/src/lib/workflow-rental/commands/update-asset-config.ts"
  "demos/playground/src/lib/workflow-rental/commands/publish-asset.ts"
  "demos/playground/src/lib/workflow-rental/commands/express-interest.ts"
  "demos/playground/src/lib/workflow-rental/commands/create-workflow-card.ts"
  "demos/playground/src/lib/workflow-rental/commands/answer-workflow-card.ts"
  "demos/playground/src/lib/workflow-rental/commands/decide-workflow-card.ts"
  "demos/playground/src/lib/workflow-rental/commands/run-workflow-action.ts"
  "demos/playground/src/lib/workflow-rental/commands/create-tenant-document.ts"
  "demos/playground/src/lib/workflow-rental/commands/attach-evidence.ts"

  "demos/playground/src/lib/workflow-rental/queries/marketplace.ts"
  "demos/playground/src/lib/workflow-rental/queries/owner-dashboard.ts"
  "demos/playground/src/lib/workflow-rental/queries/asset-workspace.ts"
  "demos/playground/src/lib/workflow-rental/queries/interest-workspace.ts"
  "demos/playground/src/lib/workflow-rental/queries/workspace-projection.ts"

  "demos/playground/src/lib/workflow-rental/api/contracts.ts"
  "demos/playground/src/lib/workflow-rental/api/handler.ts"

  "demos/playground/src/pages/api/wf-rental/[...path].ts"
  "demos/playground/src/pages/wf/index.astro"
  "demos/playground/src/pages/wf/owner/index.astro"
  "demos/playground/src/pages/wf/owner/assets/new.astro"
  "demos/playground/src/pages/wf/marketplace/index.astro"
  "demos/playground/src/pages/wf/marketplace/assets/[id].astro"
  "demos/playground/src/pages/wf/interests/[interestId].astro"

  "demos/playground/src/components/workflow-rental/WorkflowRentalBase.astro"
  "demos/playground/src/components/workflow-rental/WorkflowAssetCard.astro"
  "demos/playground/src/components/workflow-rental/WorkflowCard.astro"
  "demos/playground/src/components/workflow-rental/WorkflowTimeline.astro"
  "demos/playground/src/components/workflow-rental/WorkflowDashboardStats.astro"
  "demos/playground/src/components/workflow-rental/WorkflowInventoryEditor.astro"
  "demos/playground/src/components/workflow-rental/WorkflowWorkspace.astro"
  "demos/playground/src/components/workflow-rental/WorkflowCardComposer.astro"
  "demos/playground/src/components/workflow-rental/WorkflowCardAnswerForm.astro"
  "demos/playground/src/components/workflow-rental/WorkflowDecisionButtons.astro"
  "demos/playground/src/components/workflow-rental/WorkflowDocumentPicker.astro"
  "demos/playground/src/components/workflow-rental/WorkflowEvidenceList.astro"

  "demos/playground/tests/workflow-rental/definition.test.ts"
  "demos/playground/tests/workflow-rental/engine.test.ts"
  "demos/playground/tests/workflow-rental/policy.test.ts"
  "demos/playground/tests/workflow-rental/evidence-policy.test.ts"
  "demos/playground/tests/workflow-rental/full-flow.test.ts"
  "demos/playground/tests/workflow-rental/test-db.ts"

  "e2e/workflow-rental-flow-utils.ts"
  "e2e/workflow-rental.playwright.config.ts"
  "e2e/tests/workflow-rental-parity-ui.spec.ts"
  "e2e/tests/workflow-rental-access-negative.spec.ts"
  "e2e/tests/workflow-rental-route-boundary.spec.ts"

  "e2e/fixture/src/pages/api/wf-rental/[...path].ts"
  "e2e/fixture/src/pages/wf/index.astro"
  "e2e/fixture/src/pages/wf/owner/index.astro"
  "e2e/fixture/src/pages/wf/owner/assets/new.astro"
  "e2e/fixture/src/pages/wf/marketplace/index.astro"
  "e2e/fixture/src/pages/wf/marketplace/assets/[id].astro"
  "e2e/fixture/src/pages/wf/interests/[interestId].astro"

  "scripts/ensure-workflow-rental-local-db.mjs"
  "scripts/run-workflow-rental-local-sandbox.sh"
  "scripts/collect-wf-core-review.sh"
  "docs/ALM_WORKFLOW_CARD_ENGINE.md"
)

{
  echo "WF CORE REVIEW DIGEST V2"
  echo "Generated: $(date -Is)"
  echo "Repo: $REPO_DIR"
  echo

  echo "================================================================================"
  echo "GIT SUMMARY"
  echo "================================================================================"
  echo
  echo "Branch:"
  git branch --show-current || true
  echo
  echo "Status:"
  git status --short || true
  echo
  echo "Recent commits:"
  git log --oneline -12 || true
  echo
  echo "Diff stat vs origin/feature/alm if available:"
  git diff --stat origin/feature/alm...HEAD 2>/dev/null || true
  echo
  echo "Changed files vs origin/feature/alm if available:"
  git diff --name-status origin/feature/alm...HEAD 2>/dev/null || true
  echo

  echo "================================================================================"
  echo "CRITICAL SYMBOL SEARCH"
  echo "================================================================================"
  echo
  for symbol in \
    "initialCards" \
    "WorkflowInitialCardDefinition" \
    "application_submission" \
    "accept_applicant" \
    "booking_payment_request" \
    "createInitialWorkflowCards" \
    "projectWorkflowWorkspace" \
    "availableCardTypes" \
    "availableActions" \
    "pendingCardsForViewer" \
    "runWorkflowAction" \
    "answerWorkflowCard" \
    "createWorkflowCard"; do
    echo
    echo "---- $symbol ----"
    grep -RIn "$symbol" \
      demos/playground/src/lib/workflow-rental \
      demos/playground/src/pages/wf \
      demos/playground/src/components/workflow-rental \
      demos/playground/tests/workflow-rental \
      e2e/tests \
      2>/dev/null || true
  done
  echo

  echo "================================================================================"
  echo "DB SNAPSHOT"
  echo "================================================================================"
  echo
  echo "DB path: $DB_FILE"
  if [ -f "$DB_FILE" ]; then
    WF_REVIEW_DB_FILE="$DB_FILE" python3 <<'PY'
import json
import os
import sqlite3

db_path = os.environ["WF_REVIEW_DB_FILE"]

def safe_all(conn, sql):
    try:
        cur = conn.execute(sql)
        columns = [item[0] for item in cur.description] if cur.description else []
        return [dict(zip(columns, row)) for row in cur.fetchall()]
    except Exception as error:
        return [{"error": str(error), "sql": sql}]

conn = sqlite3.connect(db_path)

queries = [
    ("Tables", "select name from sqlite_master where type='table' and name like 'ec_wf_%' order by name"),
    ("Asset count/state summary", "select business_state, visibility_state, count(*) as count from ec_wf_assets group by business_state, visibility_state order by business_state, visibility_state"),
    ("Latest workflow assets", "select id, title, business_state, visibility_state, active_interest_id, active_workflow_instance_id, active_renter_user_id from ec_wf_assets order by created_at desc limit 20"),
    ("Latest workflow interests", "select id, asset_id, interested_user_id, workflow_instance_id, interest_state, message from ec_wf_asset_interests order by created_at desc limit 20"),
    ("Latest workflow instances", "select id, asset_id, interest_id, workflow_state from ec_wf_workflow_instances order by created_at desc limit 20"),
    ("Latest workflow cards", "select id, workflow_instance_id, card_type, card_state, created_by_role, prompt from ec_wf_workflow_cards order by created_at desc limit 50"),
    ("Latest workflow responses", "select id, workflow_instance_id, card_id, responded_by_role, answer_value, message from ec_wf_workflow_card_responses order by created_at desc limit 50"),
    ("Latest workflow events", "select id, workflow_instance_id, card_id, event_kind, actor_role, from_workflow_state, to_workflow_state, from_asset_state, to_asset_state, event_spec from ec_wf_asset_events order by created_at desc limit 50"),
]

for title, sql in queries:
    print()
    print(f"---- {title} ----")
    print(json.dumps(safe_all(conn, sql), indent=2, ensure_ascii=False))

conn.close()
PY
  else
    echo "Workflow DB not found yet."
  fi
  echo

  echo "================================================================================"
  echo "FILE CONTENTS WITH LINE NUMBERS"
  echo "================================================================================"
  echo

  for file in "${critical_files[@]}"; do
    echo
    echo "--------------------------------------------------------------------------------"
    echo "FILE: $file"
    echo "--------------------------------------------------------------------------------"
    if [ -f "$file" ]; then
      nl -ba "$file"
    else
      echo "[MISSING FILE]"
    fi
  done
} > "$OUT_FILE"

echo "Review digest created:"
echo "$OUT_FILE"
echo
echo "Upload this file here for line-by-line review."