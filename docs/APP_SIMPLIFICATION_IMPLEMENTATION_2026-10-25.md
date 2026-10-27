# App simplification implementation — 25 October 2026

This is the implementation record for the approved [usability review](APP_SIMPLIFICATION_REVIEW_2026-10-25.md). It distinguishes the completed simplification pass from larger follow-on capabilities.

## The workflow users now follow

| Role | Work and handoff |
| --- | --- |
| Client | Send an enquiry → discuss one proposal → accept scope, price and terms → prepare the site brief in three steps → complete the deposit and requested NDA in parallel → follow the visit → read reviewed findings and reports → ask questions or request follow-up work. |
| Analyst | Open My work, or switch to Team → qualify and own an enquiry → prepare the proposal → confirm preparation requirements → assign an agent and schedule the visit → review work independently, or request a specific correction → write a report → send it to an independent reviewer. |
| Field agent | Open My visits → read directions, access restrictions and the brief → start the visit → save photos → record every required check and findings → explain anything unverified → save notes and respond to corrections → send the visit for review. |
| Admin | Open Business overview → resolve unassigned work, overdue visits, payment notifications and service requests → manage team and service health → independently approve work where eligible. An admin who contributed fieldwork or report content cannot approve that contribution. |

Clients see one conversation spanning the original enquiry, accepted project and follow-up requests. Internal notes stay private. The contract, request, invoice, inspection and report remain separate records so acceptance, payment and review controls continue to work.

## Completed changes

- Client navigation is Home, My projects, Reports and Messages. Account and Updates remain available separately.
- A project has four main sections: Summary, Findings & reports, Files and Payments. Preparation, confidentiality, monitoring and privacy have specific destinations rather than sharing a long billing page. Old evidence, document and inspection links still resolve.
- Preparation is a three-step brief: Find the site, What to check, Review & send. Optional contacts are collapsed and documents have a clear Files destination. Existing details remain prefilled.
- A readiness list shows site details/consent, deposit, requested NDA and team assignment, identifying who must act. Report viewing is recorded separately from optional ratings.
- Analyst home defaults to personal work and eligible independent reviews; Team shows shared work. Tasks identify the project, required action, owner, date where available and who is being waited on. Admin home adds operational interventions. Field home focuses on visits and help rather than delivered projects and old notifications.
- Field-agent visit lists use cards on small screens. Visit links jump to the brief, photos, checks and submission. All four client project tabs stay visible on mobile.
- Visit plans create persisted required checks. Every check needs an outcome; completed checks require supporting evidence, and limitations require an explanation. Submission is blocked while required checks or corrections remain unanswered.
- A reviewer can request changes for a particular check or the whole visit, recording the reason, assigned agent and optional deadline. Reopening reviewed work still hides unpublished evidence. Completed checks survive plan revisions as historical, no-longer-required items.
- Risk fields appear when a concern or serious problem is chosen, with explicit required likelihood, severity and next action. New findings no longer silently assume high confidence or first-hand observation.
- Uploads show byte progress and save confirmation, retain failed files for retry, reuse the registered upload on retry, and warn before closing or reloading the browser with unsaved files. The visit submit control prevents submission while its on-page uploads remain unsaved. Files are retained only while this upload component stays mounted; navigating elsewhere can discard an unsaved retry.
- The reviewed banner reports released and held evidence counts accurately. Historical held evidence no longer overrides a delivered project's primary next step. Follow-up preparation and paused visits receive preparation guidance.
- Clients can send an “I have paid” reference. It remains a pending notification, without changing the ledger or opening fieldwork. Staff confirm funds against bank/M-Pesa records before recording payment, or explain what needs correction.
- Requested NDAs are enforced by scheduling, collection, upload and database boundaries. They are not required for projects where no NDA was requested.
- Monitoring fee/frequency/end-date changes require explicit client acceptance before another cycle can be generated or dispatched. Existing plans also require confirmation; past invoices and cycles are preserved.
- The message composer explicitly separates Client conversation from Internal note, and safely returns to the client option after sending. Staff inbox links open the actual Messages section.
- Accepted proposal details, original enquiry and request history are collapsed, keeping the project handoff and conversation easier to reach.

## Data and rollout

Applied additive local migrations:

- `0010_simpler_handoffs.sql`: report view receipts, NDA boundary, structured checks and corrections.
- `0011_payment_and_monitoring_consent.sql`: payment notifications and versioned monitoring consent.
- `0012_check_plan_and_receipt_guards.sql`: separate planning from authorised collection, populate checks for existing open visits, and enforce notification scope and cycle consent.

Existing submitted/reviewed visit records are preserved without inventing historic checklist outcomes. Existing open visits gain checks from their current plan. Existing published report snapshots and the independent-review safeguards are preserved. The local app database was migrated; no hosted production deployment was performed.

## Validation

- Production build and TypeScript validation passed.
- 59 unit tests passed.
- 34 PostgreSQL regression tests passed in isolated schemas. Coverage includes NDA collection boundaries, required checks, evidence ownership, frozen submissions, independent check reviewers, correction responses, conversation continuity/privacy, invoice isolation, pending payment notifications and monitoring consent changes.
- 25 production-browser workflow checks passed using the authorised client, field-agent, analyst and admin demo credentials. These include a deliberately failed upload and retry, NDA preparation/signing, payment-notification reconciliation, the guided preparation form, required visit checks, explicit risk fields, independent inspection/report review, private internal notes, report reading without a required rating, follow-up invoicing, consent withdrawal and report correction lineage.
- Desktop and 390px mobile screenshots were inspected for all four roles. Screenshots and runtime test evidence are under `test-results/simplification-2026-10-25/` and the latest `test-results/av_e2e_*/` directory.

These are technical and visual checks, not a first-time-user usability study.

## Follow-on work

The following review recommendations remain larger product improvements, rather than capabilities provided by this pass:

1. Time-window scheduling, agent availability, travel-aware workload planning and conflict resolution. Current scheduling still uses a visit date.
2. Full offline photo/video storage and upload recovery after closing the browser. Current retries retain files while the page stays open; existing field notes retain their device draft behavior.
3. A richer report-template library by service and designed PDF generation. Existing proposal defaults and report controls remain.
4. Dedicated in-app agent-to-coordinator conversations. The agent currently has visit contacts and a coordinator help/contact route.
5. First-time-user observation sessions for each role, using the tasks in the original review. Measure completion, errors and requests for help before deciding the next design changes.
6. A fuller administrative money overview and SLA/escalation reporting. This pass surfaces concrete payment/service tasks and existing service-health views.

The public calculator's service-specific intake can be refined after those sessions; it already transfers the client's brief into proposal defaults and project preparation.

## Design-tool limitation

The existing charcoal, white and gold design system was retained. The Superdesign CLI was available, but automatic approval review rejected exporting the broad private source context for an external draft. That export was not retried or bypassed. UI implementation and screenshot review were completed locally; no external design baseline or completed canvas redesign is claimed.
