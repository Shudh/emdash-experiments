# ALM Real-World Workflow Requirements

This document tracks the rental workflow that the thin Astro UI is expected to expose over the ALM backend. The UI must stay server-first and must not duplicate backend business rules.

## Roles

- **Superadmin**: can access EmDash admin and manage platform content.
- **Owner**: creates assets, configures inventory, publishes listings, reviews interests, negotiates, starts handovers, and settles returns.
- **Tenant/renter**: browses, applies, answers request cards, negotiates terms, accepts move-in inventory, disputes return damage, and settles.
- **Anonymous visitor**: browses public marketplace listings and is prompted to login/register before expressing interest.
- **Unrelated logged-in user**: can browse listed assets but cannot read restricted agreements or apply to someone else's restricted/booked asset.

## Implemented Now

- Role-aware home launchpad with marketplace, dashboard, add-property, assets, applications, handovers, and pending task badges.
- Inventory-first asset creation UI using existing `asset_config_items`.
- Flat starter inventory rows: Geyser, Fridge, Washing machine, RO purifier, Fans, Lights, Curtains, Wardrobe, Sofa, Dining table, Bed, Mattress, Keys, Remote controls.
- Structured owner document requirements in `owner_conditions_spec.documentsRequired`, while rendering older array-style document lists as chips/rows.
- Relationship-aware marketplace cards and asset detail CTAs.
- Owner self-apply prevention through backend permission checks and UI hiding.
- Tenant duplicate-application prevention through backend checks and UI state.
- Prominent owner inbox with renter details, offered rent, state, pending request count, and View details action.
- Structured request/quiz cards stored inside `negotiation_rounds.terms_spec.card`.
- Tenant answers stored inside `negotiation_rounds.terms_spec.cardAnswer`.
- Rent concession offers and owner counters through normal negotiation rounds.
- Agreement accepted view showing frozen terms, next booking/handover step, and printable agreement concept.
- Move-in handover checklist from `handover_item_checks`, copied from active `asset_config_items`.
- Tenant move-in acceptance from the handover page.
- Move-out damage claim UI over `handover_item_checks`.
- Settlement UI with estimated/agreed damage and deposit/refund summary.
- Settlement command persists `agreed_repair_cost` on disputed `handover_item_checks`.

## Source of Truth

- `asset_config_items` remains the inventory/config source of truth.
- `owner_conditions_spec` remains the owner condition and document requirement source.
- `accepted_conditions_snapshot` remains the renter's accepted condition snapshot at interest time.
- `negotiation_rounds` remains the request-card, answer, concession, counter, return dispute, and settlement thread source.
- `handover_item_checks` remains the move-in and move-out item-check source.
- `asset_access` remains the restricted agreement access source.
- `agreement_versions.printable_snapshot` remains immutable after final terms are accepted.

## Request / Quiz Cards

Request cards use `negotiation_rounds.terms_spec.card`:

```json
{
	"card": {
		"cardId": "card_...",
		"cardType": "document_upload",
		"prompt": "Please upload company ID.",
		"options": [],
		"attachmentRequired": true,
		"attachmentKind": "document_or_reference",
		"cardState": "pending"
	}
}
```

Tenant answers use `negotiation_rounds.terms_spec.cardAnswer`:

```json
{
	"cardAnswer": {
		"cardId": "card_...",
		"answerText": "I will provide this.",
		"selectedOptions": ["Yes"],
		"attachmentNote": "Reference or EmDash media id placeholder",
		"cardState": "answered"
	}
}
```

Supported card types are `free_text`, `free_text_with_attachment`, `mcq_single`, `mcq_single_with_attachment`, `mcq_multi`, `mcq_multi_with_attachment`, `document_upload`, `payment_confirmation`, `owner_action_request`, `damage_response`, and `settlement_response`.

## Media and Attachments

EmDash already exposes media upload through `POST /_emdash/api/media`, signed upload through `POST /_emdash/api/media/upload-url`, and file serving through `/_emdash/api/media/file/:key`.

This UI does not implement a second upload subsystem. Inventory evidence, document proof, booking screenshots, signed agreement PDFs, and damage photos are currently represented as text/reference placeholders in `mediaRefs`, `itemSpec.evidenceNote`, or card answer attachment notes.

Follow-up: wire ALM evidence fields to the existing EmDash media library and persist media item IDs/refs in the existing `media_refs` and terms spec fields.

## Owner Flow

1. Login.
2. Open the launchpad.
3. Create asset.
4. Add config spec and physical condition.
5. Add structured document requirements.
6. Add/edit/delete inventory rows.
7. Publish to marketplace.
8. Review inbox.
9. Create request cards and negotiate.
10. Accept final terms.
11. Start move-in handover.
12. Review move-out handover and claim damage item by item.
13. Settle return and move the asset to maintenance/private.
14. Relist or return to draft where backend transition commands allow it.

## Tenant Flow

1. Browse marketplace anonymously.
2. Login/register before applying.
3. Review owner conditions.
4. Explicitly accept current condition version/hash.
5. Submit interest and land on confirmation.
6. Wait for owner review until request cards exist.
7. Answer request cards and make rent/deposit offers.
8. Review accepted agreement state and next booking/handover step.
9. Accept move-in inventory.
10. During return, dispute damage and settle deductions.

## Move-Out and Deposit Settlement

Move-out is item based. Each damaged item should map to `handover_item_checks` and return-phase `negotiation_rounds`.

Current UI supports:

- Item selection for damage claim.
- Estimated repair cost.
- Tenant dispute round.
- Owner settlement offer round.
- Final settlement action.
- Total estimated damage, total agreed damage, security deposit held, and refund due display.

Follow-up backend/UI work:

- Item-specific tenant responses directly on `handover_item_checks.renter_response_state`.
- Per-item settlement cards with emotional concession/appeal notes.
- Security deposit capture during move-in.
- Final bank transfer proof using EmDash media.

## Deferred Requirements

The following are intentionally documented rather than faked:

- Tenant notice command and notice-period state.
- Move-out-notice, key handover, damage verification, and final refund phases as explicit backend states.
- Extra item/service requests during active tenancy outside the existing interest/handover thread.
- Offline existing-tenancy import and move-out-only asset entry.
- Signed agreement PDF upload/share using EmDash media.
- Image upload widgets for inventory and handover photos.
- Safe delete or soft-delete asset UI.

