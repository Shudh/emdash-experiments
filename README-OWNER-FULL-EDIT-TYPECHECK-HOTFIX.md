# Owner full edit typecheck hotfix

This hotfix is intended to run after `apply-owner-full-edit-clean-dropin.py`.

It fixes the typecheck failure caused by the generated owner full-edit browser script being treated as processed TypeScript by Astro. The browser script is pure client-side DOM JavaScript, so the correct low-blast-radius fix is to mark it `is:inline`.

It also fixes the nullable `location_label` AssetPatch type and removes unused variables left behind in owner dashboard after the inline partial edit panel was removed.

Apply from `demos/handovernow-cloudflare`:

```bash
python3 scripts/wf1/apply-owner-full-edit-typecheck-hotfix.py
```
