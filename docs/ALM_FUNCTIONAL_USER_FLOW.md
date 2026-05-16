# ALM Functional User Flow

This document describes the ALM rental flow as a product journey for local development and smoke testing.

## Roles

- **Superadmin** manages the EmDash admin app. In local ALM runs this is `dev@emdash.local`.
- **Owner** creates assets, publishes listings, reviews interest, negotiates, accepts final terms, and manages handover.
- **Tenant/renter** browses listings, accepts owner conditions, submits interest, negotiates, and participates in move-in and return.
- **Anonymous visitor** can browse public marketplace assets but must login or register before expressing interest.
- **Unrelated logged-in user** can browse public listings but cannot read restricted agreements, negotiations, or handovers they do not participate in.

## Asset Relationships

An owner can own many assets. A tenant can rent many assets and can submit interest for many listed assets. An asset can receive many interests while it is listed. Each interest has an append-only negotiation thread with many rounds. When final terms are accepted, the agreement freezes the accepted terms and the asset leaves the public marketplace. A handover tracks item checks for move-in and move-out, and return negotiation rounds handle damage claims, disputes, counters, and settlement.

## Owner Flow

1. Login as an owner.
2. Create an asset with kind, title, location, public price, config spec, physical condition spec, owner rental conditions, and granular config items.
3. Publish the asset to the marketplace.
4. Confirm the asset shows `status = published`, `business_state = listed`, and `visibility_state = marketplace`.
5. Use the owner dashboard to see owned asset state and the submitted interest inbox.
6. Open an interest thread, ask questions, request documents, counter, reject, or accept final terms.
7. Accepting final terms creates a frozen agreement, marks the asset booked/restricted, and removes it from the public marketplace.
8. Start move-in handover, review item checks, and wait for renter acceptance.
9. For return, start move-out handover, claim damage, negotiate dispute and settlement, and close the handover.
10. Relist, draft, or maintenance transitions only appear when the backend supports them. Delete is not implemented.

## Tenant Flow

1. Browse marketplace assets anonymously.
2. Login or register before expressing interest.
3. Review public asset details and owner conditions.
4. Explicitly accept the current owner condition version and hash.
5. Submit interest with renter details, employer, official email, offer, and message.
6. Land on the negotiation thread confirmation instead of the empty application form.
7. Reopening the asset shows the submitted interest state and a link to the thread, not a second application form.
8. Read owner questions or document requests and answer, offer, or counter.
9. After final terms are accepted, see the accepted agreement state on the thread.
10. Accept move-in handover, dispute move-out damage if needed, and accept settlement when agreed.

## Admin Safety

Normal SaaS owners and tenants are not EmDash admin users for this ALM product flow. They can login/register and use `/marketplace`, `/owner`, `/interests/:interestId`, and `/handover/:handoverId`, but direct access to `/_emdash/admin` is redirected away when ALM admin safety is enabled. Superadmin access remains available for `dev@emdash.local`, emails listed in `ALM_SUPERADMIN_EMAILS`, and users with the core admin role.

The login and registration paths remain open where needed:

- `/_emdash/admin/login`
- `/_emdash/admin/invite/accept`
- required `/_emdash/api/auth/*` routes

## Local Development

Persistent local auth users are stored in the local EmDash SQLite database at `.local/rental-sandbox/test.db`. The synced user map lives at `.local/rental-sandbox/users.json`.

The local persistent users are:

- `owner_manual_created_1@example.com`
- `tenant_manual_created_1@example.com`

Use `scripts/create-rental-local-users.mjs` to create or sync those users. The script checks `users.json` and the local DB before doing invite work, so it should not recreate passkeys for already registered users. Use `scripts/run-rental-local-sandbox.sh` to start the local sandbox on `http://localhost:4444`; it preserves `.local/rental-sandbox/test.db` and `.local/rental-sandbox/users.json`.

Do not delete:

- `.local/rental-sandbox/test.db`
- `.local/rental-sandbox/users.json`

For the permanent playground app, `demos/playground/src/pages/api/rental/[...path].ts` uses `getStore()` from `_domain-route-utils.ts`: it prefers `locals.emdash.domainStore`, otherwise uses `KyselyDomainStore` over the EmDash DB. The e2e fixture still has a resettable `/api/rental` route backed by `MemoryDomainStore` so smoke tests can start from a clean rental domain without deleting persistent auth users.

Verify registered local users without recreating invites:

```bash
node scripts/create-rental-local-users.mjs
scripts/verify-alm-frontend.sh
```

Traps avoided:

- Use `/api/setup/dev-login-as` and `/api/setup/dev-logout-local`, not `/_emdash/api/setup/...`.
- Do not call browser-side `fetch("/api/...")` from `about:blank`; first load `/`.
- Do not recreate passkeys when `users.json` already has registered owner and tenant users.
- Do not rely on the fixture-only `/api/rental` route as the permanent playground route.
- Avoid hydration waits in the server-first Astro UI; use small progressive form scripts only.
- Do not create a duplicate dev admin user.
- Treat stale `.pid` files as local process bookkeeping, not source artifacts.
