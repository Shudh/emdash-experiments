# ALM Production Deployment Checklist

This checklist documents the production hardening checks for the ALM rental frontend/runtime bridge.

## Runtime Gates

- The permanent playground route must exist at `demos/playground/src/pages/api/rental/[...path].ts`.
- The e2e fixture route may reset its memory store, but the permanent playground route must not reset persistent data.
- Mutating rental routes require `X-EmDash-Request: 1` and reject foreign `Origin` headers.
- Asset relationship and operation checks are centralized in domain modules, not page templates.
- Restricted/private asset detail reads are allowed only for owner, renter, or interested applicant relationships.

## Schema Gates

Run:

```bash
node scripts/verify-alm-prod-schema.mjs --db .local/rental-sandbox/test.db
```

Required tables:

- `ec_assets`
- `ec_asset_config_items`
- `ec_asset_interests`
- `ec_negotiation_rounds`
- `ec_agreement_versions`
- `ec_agreement_terms`
- `ec_handover_sessions`
- `ec_handover_item_checks`
- `ec_asset_access`
- `ec_asset_events`
- `media`

`ec_tenancy_notices` is a documented follow-up table for the future notice-before-move-out workflow.

## Local Data Safety

Do not delete:

- `.local/rental-sandbox/test.db`
- `.local/rental-sandbox/users.json`

Do not recreate passkeys when `users.json` already contains registered owner and tenant users.
