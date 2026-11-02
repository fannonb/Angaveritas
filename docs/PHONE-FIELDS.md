# Separate phone and WhatsApp fields — 27 October 2026

Registration, calculator signup and account settings now have distinct Phone
and optional WhatsApp inputs. Both use a native country selector with a local
SVG flag and calling prefix; 245 countries/territories are available. Each
field has its own selection and updates its example and local-prefix guidance.

For Kenya, select +254 and enter a national number such as `712345678`.
The hint explains that the leading local `0` should be omitted. Pasted full
international numbers select the appropriate prefix. Local trunk prefixes are
normalized using phone-number metadata; significant leading zeros, such as
those in Italian landline numbers, are retained.

Numbers are validated and stored in international form separately in `users.phone`
and the nullable `users.whatsapp` column. Existing numbers remain in Phone and
are not copied into WhatsApp. The optional field can be cleared in account
settings. Staff client lists/details display the separate values.

Migration: `supabase/migrations/0018_account_whatsapp.sql`. It adds a nullable
column and does not rewrite existing contact data. Local and production
migration tracking both record the file.

Local verification completed before publishing:

- 90 unit tests passed, including 17 international-number checks.
- 54 database integration tests passed, including independent saving/updating
  and clearing of phone/WhatsApp values.
- 14 browser lifecycle groups passed in development and optimized production
  mode. They include country switching, pasted numbers, persistence and account
  lifecycle regressions.
- Desktop and 320px/390px mobile layouts were inspected; flags loaded and no
  horizontal overflow was detected.
- The optimized build and TypeScript checks passed.

Refresh local country labels and flag assets after dependency updates with
`node scripts/sync-phone-assets.mjs`. Labels are generated once so server and
browser locale differences cannot cause hydration errors. Flags are hosted
locally and retain their upstream license in `public/images/flags/LICENSE`.

Local evidence: `test-results/av_accounts_1793096316726/`.

Production deployment: `dpl_BS75tycWg7y1sRgJ78dbLq1dzBfZ`, serving
[angaveritas.com](https://angaveritas.com/register). All five non-destructive
live smoke checks passed, including flag loading, independent country selection,
normalization, responsive layout and registration validation. The post-release
Vercel log check returned no runtime errors. Live evidence is in
`test-results/account-smoke-1793096758600/`.
