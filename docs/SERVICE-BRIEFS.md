# Service-specific client briefs

The previous project preparation form collected only site logistics, claims and concerns for every service. That prevented an analyst from receiving the business identity, proposed supply, milestones or research questions needed for other engagements.

## What clients are asked

| Service | Required service questions | Useful optional context | Location requirement |
| --- | --- | --- | --- |
| Ground verification | Asset type, identifying description, decision the check supports | Plot/LR/serial references, deadline, claims, access | Location or directions |
| Supplier & contractor verification | Supplier/trading name, proposed goods/work, relationship stage, permission/approach for contacting the organisation | Registration/licence reference, website, delivery expectations, deadline, quotations and specifications | Premises address if known; unknown address does not prevent submission |
| Project monitoring | Project/work type, current baseline, milestones, reporting preference | Baseline date, urgent issues to flag, deadline, programme, plans and prior updates | Project location or directions |
| Business due diligence | Business name/activity, transaction type, decision questions, contact approach | Registration/ownership, financial context, deadline, transaction records | Known premises/operating area if available |
| Feasibility & market study | Venture, target customers, research questions | Go/no-go criteria, competitors, budget assumptions, launch date, existing research | Study area/target markets; an exact property address is unnecessary |
| Investment oversight retainer | Portfolio, oversight objectives, reporting preference, escalation triggers | Existing baseline, reporting recipients, management records | Coverage/asset locations if available |
| Custom or unrecognised service | Engagement subject and required outcomes | Background, constraints and deadline | Only if relevant to the agreed work |

Each service has matching contacts, document examples, fieldwork labels and an editable starting checklist. Documents and formal registration identifiers are guidance rather than compulsory uploads. Reporting cadence and dates remain client preferences until confirmed against the accepted scope; form answers do not amend pricing, contract terms or monitoring automation.

## Persistence and access

Migration `0020_service_briefs.sql` adds `projects.service_brief`, a size-limited JSON object. Version 1 stores a server-selected profile code and a whitelist of string answers. Existing shared logistics, claims, concerns, consent and submitted dates remain intact. The form resolves from the project's saved service code, with exact service-name fallback for legacy projects and an oversight profile for unclassified retainers. Existing projects acquire the correct form immediately, with their shared information retained. Previously submitted projects are not silently reset or re-consented.

New submissions require the selected service's questions and consent. Drafts allow incomplete answers but still reject invalid URLs, dates, choice values and oversized text. Clients can move back, save and reload without losing entered values. Optional questions are grouped under Additional context. Server validation remains authoritative when browser checks are bypassed. Answers from another profile are not reused if a project's service changes.

Clients can update only their own project. Managers receive the full brief. Assigned field agents receive operational details, including contact restrictions; marked financial/budget assumptions are removed in `projectFor` before generating page or component data. Existing file permissions continue to govern attachments independently.

The staff planning form suggests service-relevant checks and includes the client's claims. Analysts review and edit these before scheduling. Existing inspections, completed checklist entries, payment/consent/NDA gates and independent review requirements are preserved.

## Verification

- `npm test`: catalogue coverage, profile fallback, required/draft rules, whitelisting, malformed answers and journey labels alongside existing unit tests.
- `npm run test:integration`: database integrity, account lifecycle and workflow security regressions.
- `node scripts/test-service-briefs-browser.mjs`: isolated local schema; all six services plus custom, partial drafts, save/reload, final review/consent, server rejection with bypassed browser validation, injected unrelated answer rejection, staff handoff and private-field filtering in complete HTML.
- `BRIEF_TEST_PRODUCTION=1 node scripts/test-service-briefs-browser.mjs`: same checks against the built Next server (`NEXT_DIST_DIR=.next-accounts`).
- `npm run test:workflow`: complete request, proposal, custom brief, payment, fieldwork and report regression.

Browser tests use synthetic accounts in disposable local schemas. They do not change real client projects or send external email. Screenshots and logs are written under ignored `test-results/` folders.

## Release verification — 27 October 2026

- TypeScript and the optimized Next.js build passed.
- 103 unit tests and 55 database integration tests passed.
- Eight service-brief browser scenarios passed in development and production mode, including complete HTML checks for field-agent financial-data redaction.
- All 25 request-to-report workflow checks passed in production mode, using `.next-accounts` with a disposable local schema.
- Five live service-intake checks and five live account smoke checks passed on the custom domain. Live checks did not submit requests or create accounts.
- Migration `0020_service_briefs.sql` was applied through Supabase MCP and recorded in `schema_migrations`.
- Vercel deployment `dpl_CZofuL5cLdhnBHy8EF1gYJqa6R5q` was promoted to `https://angaveritas.com` and verified by domain inspection. Existing authenticated projects were tested with synthetic local fixtures; real client project data was not edited for testing.

The full workflow harness was updated to complete the custom brief questions, scope additional-finding selectors alongside generated checklist findings, supply an explicitly flagged evidence fixture, settle the synthetic follow-up invoice before the consent-only regression, and reset saved estimator state between independent requests. These changes preserve the payment and confidentiality checks rather than bypassing them in application code.
