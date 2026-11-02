# Required account location — 27 October 2026

Registration, calculator signup and Account settings now require a Country
selection followed by a valid subdivision. The second label adapts, for
example: Kenya → County, United States → State/Territory, Canada →
Province/Territory, United Kingdom → County/Council area, UAE → Emirate.

Country changes clear the prior subdivision. A country/territory with only one
listed area selects that area automatically. The catalog includes 249 countries
and territories and 4,387 listed subdivisions. Kenya has all 47 counties.

The selections are stored as `users.country_code` and `users.region_code`.
`location_countries` and `location_regions` hold the matching reference data.
A composite foreign key and a trigger reject mismatched selections and require
location for newly created clients. The readable `based_in` value is derived
from the selected catalog names for existing staff screens and invoices.

Migration `0019_account_location.sql` preserves existing free-text values and
leaves their structured fields unset until an owner supplies their location.
It does not guess a country or county from an old city name. Legacy clients can
still sign in; updating their account requires the new selections. Staff
invitations remain usable without a client residence requirement.

Catalog source: [country-region-data](https://github.com/country-regions/country-region-data),
with its license in `docs/licenses/country-region-data.txt`. The Kenyan
Elgeyo/Marakwet spelling follows the [Constitution's First Schedule](https://klrc.go.ke/index.php/constitution-of-kenya/163-schedules-schedules/165-first-schedule-counties/434-1-counties).
Catalog generation is in `scripts/build-location-catalog.mjs`. The seed and
browser/server data are generated together; applied migrations must not be
rewritten during later data updates.

Coverage includes required/mismatched selection validation, region reset on
country changes, country-specific labels, mobile layout, registration and
profile persistence, and database rejection of missing or cross-country data.

Completed verification: 97 unit tests, 55 database tests, 15 local browser-flow
groups in development and optimized production mode, and six non-destructive
live checks. The post-release Vercel runtime-error check returned no records.
Production retained its one original account and zero test/client accounts.

Production deployment: `dpl_iT7aJUnULAto87rzJanbDcrj4RFD`, serving
[the registration page](https://angaveritas.com/register). Local evidence is in
`test-results/av_accounts_1793097885662/`; live evidence is in
`test-results/account-smoke-1793098051890/`.
