# HandoverNow WF1 Form Guard + Free DB Rate Limit Combined Drop-in

This single drop-in includes the full shared form guard contract and the WF1 free DB-backed rate limiter.

Use this when the current repo/local laptop has **not** applied either of these older zips:

- `hn-form-guard-contract-dropin.zip`
- `hn-form-guard-rate-limit-dropin.zip`

Run only this one script:

```bash
cd ~/PycharmProjects/emdash-experiments
unzip -o ~/Downloads/hn-form-guard-combined-dropin.zip -d .
cd demos/handovernow-cloudflare
python3 scripts/wf1/apply-form-guard-combined-dropin.py
```

Then run:

```bash
pnpm exec wrangler d1 execute handovernow_cms --remote --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name='_emdash_rate_limits';"
pnpm run typecheck:d1-cloud
pnpm run build:d1-cloud
```

## What it does

- Creates one shared server form guard used by applicant screening and owner asset creation.
- Keeps existing applicant lead-specific duplicate checks.
- Adds server-verified asset draft intent tokens.
- Requires the signed draft token for asset primary image upload and asset creation.
- Makes primary property image mandatory for asset creation.
- Locks server-calling buttons until Turnstile verification is complete.
- Preserves user-entered data through login redirect for: normal express-interest form, chatbotify screening, and asset creation.
- Adds WF1 rate limiting using EmDash core's `_emdash_rate_limits` DB-backed pattern, not paid WAF.

## Rate-limited surfaces

- `POST /api/wf1-rental/marketplace/assets/:assetId/express-interest`
- `POST /api/wf1-rental/owner/assets/draft-intent`
- `POST /api/wf1-rental/uploads`
- `POST /api/wf1-rental/owner/assets/add`

The limiter is centralized in `src/lib/wf1/security/rate-limit.ts` and is called from `src/lib/wf1/api/handler.ts` before body parsing.
