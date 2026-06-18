# HN test QA rootfix drop-in

Near-zero-blast-radius fixes for the six QA issues:

1. Marketplace asset detail: logged-in Express Interest and Chat with agent actions stay hidden/disabled until Turnstile verification succeeds.
2. Applicant workspace: Owner dashboard link is only rendered for owner workspaces.
3. Owner dashboard: Review queue link is only rendered for WF1 superadmin.
4. Evidence upload card: ActionForm no longer silently drops dotted hidden fields if selector lookup fails; this protects `attachments.0.*` upload payloads.
5. Owner dashboard: owner gets an inline low-risk edit-details form using the existing `owner/assets/:id/config` API before resubmitting for review.
6. Owner dashboard: marketplace review snapshot and reject reason are projected into owner dashboard and displayed to the owner.

Apply from repo root:

```bash
cd ~/PycharmProjects/emdash-experiments
unzip -o ~/Downloads/hn-test-qa-rootfix-dropin.zip -d .
cd demos/handovernow-cloudflare
python3 scripts/wf1/apply-test-qa-rootfix-dropin.py
pnpm run typecheck:d1-cloud
pnpm run build:d1-cloud
pnpm exec wrangler deploy
```
