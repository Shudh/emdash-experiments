# HandoverNow Superadmin UX Hotfix

This hotfix is applied after `hn-superadmin-publish-queue-ux-dropin.zip`.

It fixes two problems:

1. The earlier script searched for `[assetId].astro`, but the real marketplace asset route is `[id].astro`.
2. The manual pasted block corrupted JavaScript in `[id].astro`.
3. The admin approve/reject scripts need an `HTMLFormElement` narrowing for `astro check`.

Run from repo root:

```bash
unzip -o ~/Downloads/hn-superadmin-ux-hotfix.zip -d .
cd demos/handovernow-cloudflare
python3 scripts/wf1/apply-superadmin-ux-hotfix.py
pnpm run typecheck:d1-cloud
```
