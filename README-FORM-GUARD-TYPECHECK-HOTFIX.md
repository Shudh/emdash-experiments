# WF1 form guard typecheck hotfix

Run after `hn-form-guard-combined-dropin-v2.zip` if `astro check` reports:

- `asset-draft-token.ts` BufferSource / Uint8Array<ArrayBufferLike>
- `rate-limit.ts` Kysely<Database> to Kysely<AnyDb> cast
- unused `configFor` in marketplace index

This patch is idempotent and only changes those three places.
