# AngaVeritas app gap analysis

Reviewed 12 October 2026.

Implementation follow-up: see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for changes made after approval. This analysis records the original findings.

AngaVeritas has a substantial implementation of its customer journey, but it is not yet the complete production platform described in the technical blueprint. The marketing website and manually operated engagement workflow are well developed. The most important remaining work is to protect report integrity and client confidentiality, enforce workflow prerequisites, and complete commercial and recurring monitoring operations.

## Scope and evidence

Reviewed all six Word files in `docs`, the website, calculator, authentication, client portal, staff workspace, API routes, data access helpers, schema, storage and notification implementation, and existing tests. The two Business Plan files have identical SHA-256 hashes and are the same document.

This is a source and requirements review. The local browser attempt timed out. Authenticated client/admin journeys, responsive layout, real email delivery, production configuration, backups, storage permissions, and deployed encryption were not independently verified. Findings described as defects follow directly from code paths; they are not live exploit demonstrations. No application behavior or source code was changed.

Validation: `npm test` passed all 40 pricing tests; `npm run typecheck` passed. The existing automated suite covers pricing only, so these results do not establish end-to-end readiness.

## Intended product

The app should help local and diaspora investors reduce uncertainty before and after committing capital in Kenya. Its central promise is independent, traceable intelligence: a client explains what needs verification, receives a transparent proposal, commissions work, tracks the field visit, and gets reviewed findings backed by evidence and a clear risk assessment.

The intended lifecycle is awareness → enquiry → consultation and proposal → onboarding → planning → fieldwork → analysis and QA → report delivery → follow-up → recurring oversight. The admin/staff side should coordinate and control this process; the client side should make the status, evidence, cost, and next action understandable.

## What is already implemented

| Area | Implemented foundation |
| --- | --- |
| Public website | Home, services, about, process, pricing, contact, sample report, privacy and terms; downloadable sample PDF exists. |
| Estimate and intake | Six-step calculator, Kenya place search, road distance with disclosed estimation fallback, complexity scoring, add-ons, urgency, custom briefs, account creation/sign-in and follow-up requests. Submitted prices are recalculated on the server. |
| Proposals | Versioned drafts, estimate-based prefill, scope, deliverables, exclusions, timeline, payment terms, expiry, send/accept/decline, verified-email requirement for acceptance and typed-name signature. Acceptance creates a project transactionally. |
| Client portal | Portfolio metrics and map pins, requests, onboarding, site contacts, document upload, inspection visibility, reviewed project findings, evidence, reports, messaging, notifications, history, profile and password change. |
| Staff workspace | Request qualification and ownership, proposal builder, project assignments, inspection scheduling and field findings, evidence flags, report draft/review/publish, enquiries, clients, messages, pricing versions, team invitations and audit viewer. |
| Access and evidence | Database-backed sessions, client ownership checks, staff roles, private file delivery, SHA-256 file hashes, photo GPS/time extraction, integrity flags and controlled release. |

The report rating form, risk-based follow-up suggestion, sample PDF, client contacts, proposal signing and project map are present. They should not be classified as wholly missing.

## Confirmed defects and weak controls

Priority definitions: P1 should be resolved before handling real confidential client engagements; P2 should be resolved for a dependable operational MVP. There is no P0 finding in this review.

| ID | Priority | Finding and consequence | Evidence | Required completion |
| --- | --- | --- | --- | --- |
| G01 | P1 | Report create/save accepts any syntactically valid inspection UUID without checking its project or reviewed status. The client report page then reads findings directly by that ID. A mistaken or crafted staff submission can expose another project's findings or unreviewed findings in a published report. | `src/app/staff/actions.ts:441` and `:450`; `src/app/portal/projects/[code]/reports/[id]/page.tsx:22`; schema has separate project and inspection FKs, without enforcing their relationship. | Validate inspection ownership and review status on create, save and publish; scope client reads by project and reviewed status; enforce the relationship in the database. |
| G02 | P1 | Published HTML reports are not frozen. They fetch live findings and evidence, while managers can edit/delete reviewed findings and delete evidence. Reports covering all reviewed inspections also absorb later visits. A previously delivered report can silently change without a corrected report version. | Client report page `:22`; `src/app/staff/actions.ts:387`, `:399`, `:423`; `src/lib/data/inspections.ts`. | Snapshot findings, evidence references/hashes and report context at publication; preserve referenced evidence; issue explicit corrected versions. |
| G03 | P1 | Withdrawing a published report changes its report status but leaves its attached PDF visible to the client. The file endpoint checks file visibility, not report publication status, so an existing file URL remains usable. Withdrawal also leaves project health/stage unchanged and does not send a dedicated withdrawal notification. | `src/app/staff/actions.ts:517`; `src/app/api/files/[id]/route.ts:17`. | Revoke future PDF access unless another published report legitimately uses it; notify the client; reconcile project status and record the replacement reason. Already downloaded copies cannot be recalled. |
| G04 | P1 | Field agents can view all client documents on an accessible project. The Site & brief tab renders them, and the file endpoint only excludes report-category files for field agents. Client documents can include contracts or financial records, despite the stated restriction on field-agent financial access. Internal-category files are also not explicitly blocked at the endpoint. | `src/app/staff/projects/[code]/page.tsx:37` and `:155`; `src/app/api/files/[id]/route.ts:18`; `src/lib/data/projects.ts` grants project access from any assigned inspection. | Introduce explicit field-safe document classification and inspection-level file permissions; enforce them in file reads and listings, not just tabs. |
| G05 | P1 | Operational prerequisites are advisory. Inspections can be scheduled and started before onboarding consent or required payment. Staff can freely set project stages, and request status can be set to accepted/proposal_sent without the corresponding accepted/sent proposal. Empty inspections can be submitted/reviewed. | `src/app/staff/actions.ts:69`, `:190`, `:284`, `:324`; `src/app/staff/projects/[code]/page.tsx:79`. | Define allowed transitions and enforce onboarding, payment, assignment, evidence and deliverable prerequisites server-side. If overrides are needed, require a reason and record them. |
| G06 | P1 | Evidence approval is weaker than the promised independent review. Admins may self-approve inspections and reports. Inspection reviewer checks compare the assigned agent, not all actual contributors. Managers can manually release flagged or unreviewed evidence through a visibility checkbox without a mandatory QA rationale. | `src/app/staff/actions.ts:339`, `:409`, `:498`. | Track contributors; require an independent reviewer or an explicit audited exception; store reviewer, justification and release decision for flagged items. |
| G07 | P1 | The audit trail is useful but is not the blueprint's immutable, cryptographically tamper-evident history. Events have no hash chain or update/delete guard in the migration. Finding edits/deletes, field-note saves, report content saves and several contact/enquiry changes do not write detailed audit events. Many actions omit IP context. | `src/lib/activity.ts`; `supabase/migrations/0001_platform.sql:397`; finding, note and report save actions. | Add before/after records for meaningful changes, transactional event recording, consistent actor/context data, append-only controls and a defined tamper-evidence mechanism. |

G04 is a document-permission problem, not a claim that the field-agent UI displays the project's commercial panel: that panel is correctly restricted to managers.

## Client-side incomplete sections

| Section | Current limitation | Priority |
| --- | --- | --- |
| Payment and billing | Portal shows payment status and says payment details will be emailed. No M-Pesa/card checkout, invoice/receipt records, payment ledger, deposit/balance breakdown, refunds or reconciliation workflow exists. | P1 commercial completion; a clearly documented manual payment process can serve an initial MVP. |
| Delivered report | Report has executive summary, findings, confidence, recommendations and limitations, but lacks dedicated scope/methodology sections. Its “risk matrix” is a status table rather than structured risk categories, likelihood, impact and mitigation. Automatic PDF generation is absent; browser printing or uploaded PDFs are the workaround. | P1 report completeness and integrity; PDF automation P2. |
| Monitoring and retainers | A retainer flag and monitoring stage exist. Clients cannot manage a plan, billing period, included visits, renewal/pause/cancellation or recurring subscription. No scheduled cycle generation or longitudinal inspection comparison is implemented. | P2; essential before selling automated recurring oversight. |
| Portfolio and map | Linked, health-colored SVG pins and summary metrics exist. No pan/zoom, clustering, satellite layer, multi-site project model, inspection trend comparison or value-weighted portfolio health. “Open risk alerts” counts risky projects rather than separately managed alerts. | P2 for alert handling and multi-site work; richer map can follow. |
| Notifications and escalation | In-app updates and email hooks exist. No client notification preferences, actionable alert acknowledgement/resolution, escalation ownership or scheduled reminders. WhatsApp/SMS are absent. | P2. |
| Consultation and walkthrough | Booking and WhatsApp integration hooks exist but `bookingUrl` and `whatsapp` are empty in `src/lib/site.ts`, so these paths are hidden. | P2 conversion improvement. |
| Cancellation and documents | A client can withdraw an open request; an accepted engagement has no dedicated cancellation/refund workflow. NDA request is recorded, but no NDA preparation/signing/status workflow exists. | P2. |
| Market intelligence | No county feed, market digest, subscription intelligence or economic-indicator section. | Later expansion unless offered in the launch package. |
| Trust content | Leadership list is empty; sample case study is explicitly fictional. No real case studies, testimonials or blog/content engine found. | P2 credibility/content work; obtain authentic material rather than fabricate it. |

## Admin and field-side incomplete sections

| Section | Current limitation | Priority |
| --- | --- | --- |
| CRM and conversion | Contact enquiries can be marked replied/converted/closed, but there is no conversion action linking them to a client/request, ownership/tasks, consultation record, follow-up reminder or qualification score. Replies happen outside the app. | P2. |
| Planning and resources | Free-text planning notes, agent assignment and inspection dates exist; there is no structured research checklist, travel budget/expenses, route optimization, staffing calendar, workload conflict check or separate reporting lead. | P2. |
| Field checklist | Client claims become an objectives text brief. Findings are entered manually; no standardized checklist template library, completion validation, mandatory evidence per check or finding-to-evidence relationship exists. | P1 for required evidence and traceability; template administration P2. |
| Offline fieldwork | No service worker, offline storage, queue, sync/conflict handling or dedicated capture pipeline. Text forms and uploads depend on connectivity; losing a connection or navigating away can interrupt field work. | P2, or P1 if remote field coverage is part of launch. |
| Evidence verification | GPS/time extraction and anomaly checks apply to photos/drone images. Videos do not undergo equivalent location/time verification and can be released as unflagged evidence on review. No verification against a visit-specific capture window; distance tolerance is fixed at 3 km. | P1 evidence policy and explicit media QA. |
| Upload security and resilience | MIME allowlist trusts submitted MIME; no content-signature validation or malware scan. Completion hashes stored bytes but does not revalidate declared size/type. Cloud upload enforcement needs separate configuration verification. No resumable upload/video transcoding. | P1 upload validation; advanced media processing P2. |
| Report QA | No mandatory deliverable checklist, finding/evidence minimum, structured approval rubric, version lineage or automated PDF process. In-review reports remain editable. | P1. |
| Notifications | Email is synchronous and failures are logged/swallowed; no durable outbox, retry worker or delivery/failure dashboard. Important invitations or report notices can fail without operational follow-up. | P2. |
| Administration | Team invitations, role changes, disabling and pricing versions exist. Business details and public content require code changes; no operational settings/content console, billing console or retention/privacy-request queue. | P2 based on operator needs. |
| Quality assurance | Only pricing unit tests are present. No automated tenant-isolation, role-permission, proposal-to-project, upload visibility, approval, withdrawal, retainer or end-to-end tests. | P1 regression coverage for sensitive workflows. |

## Pricing and requirements gaps

1. **Multi-site fees are specified but missing.** Both the costing document's final sequence and technical formula include multi-site charges. The calculator asks how many locations are involved, but this only affects complexity. The engine has one distance, no separate multi-site line and no itinerary model. A job across several counties can therefore omit real travel/site costs. See `src/lib/pricing/engine.ts:136` and the request/project location fields.
2. **Duration is inferred from distance.** Nights are `ceil(roundTripKm / kmPerNight)` beyond the accommodation threshold; driver days are nights plus one. Site work duration, multiple visits and actual accommodation requirements are not inputs. This needs an approved estimating rule or staff-confirmed logistics adjustment.
3. **Travel thresholds conflict within the Word requirements.** The costing narrative says contingency beyond 75 km one way and driver allowance beyond 150 km, while its table/formula uses 100 km and 250 km round trip. The technical blueprint and default config follow the latter. Accommodation wording also needs an explicit one-way/round-trip definition. These are requirements ambiguities, not proof of incorrect arithmetic.
4. **Urgency wording conflicts.** The costing text refers to an adjustment to base fee, while the technical formula applies urgency to the entire subtotal. The code follows the technical formula. Approve and publish one rule.
5. **Older business-plan fuel logic differs.** It uses distance/fuel-efficiency/fuel-price assumptions, while the later calculator uses fixed KES-per-km fuel and wear. Treat the newer rule as a deliberate baseline only after confirming its authority.
6. **Recurring setup is not a recurring product.** The KES 25,000 per-cycle add-on is added once to a quote. Automatic retainer creation requires project monitoring plus that add-on; it does not define frequency, future invoices, visit entitlement or renewal.

Core service fees, complexity tiers, default urgency rates and add-on amounts match the technical blueprint. Passing pricing tests validates the implemented rules, not the unresolved commercial assumptions above.

## Blueprint and launch scope decisions

The minimal website document is largely satisfied. The customer journey has a credible manually managed implementation through delivery and follow-up. The technical blueprint is substantially broader and labels its architecture binding across all four engineering phases; the README describes several of those same items as unbuilt later work.

This distinction should be resolved explicitly: call the current product a manual-service MVP, with known limitations, or complete the specified production release criteria. The absence of a particular framework/vendor is not itself a functional gap. For example, server-side SQL with application access checks can support an MVP even though the blueprint names PostGIS, Mapbox, queues and database-level tenant policies. However, the promised offline behavior, immutable evidence/report history, automated delivery, subscriptions and payment integration are real capability gaps.

RLS is enabled with no policies, intentionally blocking public Supabase REST access. Tenant permissions for the server's database connection are enforced in app code rather than tenant-aware RLS policies. Review the production database role and grants before claiming the blueprint's database-level tenant isolation.

Consent capture and a privacy page exist. No implemented retention/deletion scheduler, personal-data export/request tracker or encryption verification was found. This review does not certify legal compliance, deployed encryption, company registration, insurance or production infrastructure.

## Recommended completion order

1. **Protect client information and delivered intelligence:** fix G01–G04; freeze published reports and referenced evidence; add tests proving clients/field agents cannot read unauthorized or withdrawn content.
2. **Make the engagement workflow enforceable:** resolve G05–G07; require consent/payment prerequisites, complete evidence and independent QA; audit changes and controlled overrides.
3. **Finish the operational MVP:** documented payment/invoice process, NDA and cancellation handling, structured checklist/evidence mapping, complete report template, delivery retries, multi-site pricing and clear logistics rules.
4. **Deliver recurring oversight:** schedule and bill monitoring cycles; define milestones, comparative reports and actionable alerts; add offline field capture where required by coverage.
5. **Expand acquisition and intelligence:** configure booking/WhatsApp, add real leadership and approved client proof, content publishing, richer maps and market feeds.

## Acceptance checks for the next release

- A client completes estimate → verified account → proposal acceptance → onboarding → required payment → assigned visit → reviewed evidence → independently approved report → download and follow-up.
- Unpaid/unconsented projects cannot start fieldwork without an explicit audited override.
- Reports cannot attach another project's inspection or expose unreviewed findings.
- A delivered report remains identical after later visits or edits; corrections create a new linked version.
- Withdrawal blocks future access to the associated PDF when it has no other valid published use.
- Field agents only see assigned work and explicitly approved field documents, never unrestricted client financial/internal files.
- QA records evidence identifiers, confidence, risk rationale and reviewer decisions; missing/flagged/video evidence receives explicit treatment.
- A failed email is retried and visible to staff rather than only written to logs.
- A multi-site estimate accounts for all relevant locations and approved mobilization/duration rules.
- A retainer cycle creates the expected visit/report and commercial records, or the UI clearly documents the manual operating process.

## Word sources reviewed

- `docs/AngaVeritas Business Plan.docx` and its identical `(1)` copy: purpose, business model, platform and roadmap.
- `docs/Angaveritas Customer Journey.docx`: stages 1–10 and internal operational journey.
- `docs/AngaVeritas Minimally Viable Website.docx`: required public website sections.
- `docs/AngaVeritas_Pricing Calculator Costing Logic (2).docx`: pricing, deliverables and risk matrix requirements.
- `docs/AngaVeritas_Technical_Implementation_Document_GoogleSans.docx`: architecture, workflow, dashboard, evidence controls and release acceptance criteria.
