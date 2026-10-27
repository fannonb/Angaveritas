# Implementation status

Updated 12 October 2026 following approval to proceed with the gap-analysis recommendations. External integrations are framework-only, as requested; no production credentials or fabricated company content were added.

**25 October 2026:** request ownership now carries into the project, team assignment has its own hand-off panel, field-agent changes move open visits, and status/stage controls only offer valid moves. See [WORKFLOW_REVIEW_2026-10-25.md](WORKFLOW_REVIEW_2026-10-25.md).

## Completed

| Recommendation | Implementation |
| --- | --- |
| G01 Report confidentiality | Same-project and reviewed-inspection checks in application code and database triggers. Client delivered reports read snapshots, not arbitrary inspection findings. |
| G02 Delivered-report integrity | Publication snapshots report text, project context, findings and evidence metadata/hashes. Referenced evidence and PDFs cannot be deleted. Published/withdrawn report content cannot be edited; corrections have replacement lineage. |
| G03 Withdrawal | Future PDF access requires a currently published report. Withdrawal records a reason, notifies the client, revokes visibility where appropriate and reconciles project health/stage. Existing downloaded copies remain outside the app's control. |
| G04 Field access | Field agents are restricted to assigned inspection evidence and explicitly approved client documents, enforced at download endpoints. Internal/report/agreement files are restricted. |
| G05 Workflow | Onboarding/consent, payment and assignments gate fieldwork; empty inspections cannot be submitted/reviewed; arbitrary contract outcomes and delivery stages are rejected. Deposits are explicit proposal fields. |
| G06 Independent QA | No automatic admin self-approval. Reviewers must be active analysts/admins and independent of field contributors. Manual evidence release requires QA notes. Reviewed findings/notes are locked until reopening. |
| G07 Audit | Before/after trigger records across engagement, evidence and commercial tables; append-only events with a serialized SHA-256 hash chain. Critical report, field, project and payment changes have transaction-level actor context. |
| Report completeness | Scope/methodology fields, supporting evidence IDs, structured risk category/likelihood/impact/mitigation and publication checks. |
| Billing | Proposal acceptance creates an invoice; manual payment/refund reconciliation records unique references and receipts and derives deposit/balance status. |
| NDA and service requests | Approved NDA PDF upload and client acceptance, cancellation/monitoring pause/cancel and privacy requests with staff response tracking. |
| Recurring oversight | Plan frequency, fee and dates; idempotent due-cycle invoices; paid-cycle inspection dispatch; pause/cancellation handling. |
| Alerts | Risk alerts have acknowledgement and resolution; dashboard counts actual unresolved alerts. |
| CRM | Enquiry owner, follow-up date, consultation notes and conversion to a registered client's request. |
| Multi-site pricing | Additional locations, separate travel legs, approved extra-site rates and explicit TBC handling. Locations transfer into project sites and inspection scheduling. |
| Upload checks | Actual byte-size/signature validation; bounded reads; duplicate local writes refused; optional scanner contract; video/manual-media verification flags. |
| Delivery | Durable outbox, bounded retries, stable delivery idempotency keys, admin visibility/retry action and configurable worker endpoint. |
| Notification preferences | Clients can opt out of project-update emails while retaining account emails and in-app notifications. |
| Device draft recovery | Opt-in field-note drafts and authenticated revision-checked sync; conflicts never silently overwrite newer notes. |
| Date handling | Database DATE remains a calendar string; proposal expiry, cycle identity and date controls avoid implicit timezone conversion. |

The original analysis remains a historical baseline; it should not be read as the current implementation status.

## Validation

- 50 unit tests passed across pricing, multi-site estimates, upload checks, workflow prerequisites and file permissions.
- 12 real PostgreSQL regressions passed in an isolated temporary schema, including publication/withdrawal, independent review, proposal invoices, partial payments/refunds, recurring cycles, consent withdrawal and mocked-provider delivery retries.
- TypeScript checking and the final optimized Next.js production build passed.
- Migrations 0002–0007 were applied to the local project database. The integration test schema was removed after testing.

## External service framework

- M-Pesa/card: gateway interfaces and authenticated client checkout route exist. Checkout and callbacks return unavailable until provider-specific initiation, callback verification and transactional reconciliation are wired and tested. Merchant credentials, sandbox/UAT and provider adapters remain required.
- Email: Resend delivery and retry worker exist. Actual delivery requires a sender/API key and a scheduled worker.
- Consultation booking and WhatsApp contact: configure the public environment settings. Automated WhatsApp/SMS messaging is not implemented.
- Malware scanning: optionally configure a compatible scanner. Signature checks alone do not provide antivirus assurance.
- Hosting, database/storage least-privilege grants, encrypted deployment, backups and external audit checkpoints still require deployment configuration and verification.

## Remaining product roadmap

These are not represented as completed features:

1. Full offline PWA, offline finding/photo/video queues, resumable media upload and conflict-aware synchronization. The current device draft feature covers field notes only.
2. Automated designed PDF production, including embedded evidence, media processing and report/PDF equivalence verification. Browser printing and uploaded PDFs remain the delivery paths.
3. Rich geospatial map pan/zoom/clustering/satellite layers, route optimization, comparative inspection analytics and project milestones. Existing portfolio map pins remain available.
4. Market-intelligence provider feeds, editorial publishing/blog/CMS, real leadership profiles, approved case studies/testimonials and broader institutional reporting. Real business content and provider choices were not supplied.
5. Checklist template administration, staff workload/calendar conflicts, structured pre-field research/expenses and automatic reminders/escalation SLAs.
6. Automated retention/deletion/data-export processing. Privacy requests now have a queue and response record, but fulfilment is manual; this implementation does not certify legal compliance.

## Migration and operating notes

- New migrations are additive and were applied to the project's local database. Apply them separately in each deployment with `npm run db:migrate` before running the updated app.
- Valid existing published reports are snapshotted from their available reviewed data at the migration baseline. Invalid legacy inspection links are not exposed through the new client report path and need staff review/reissue.
- Withdrawal blocks new app-authorized downloads. Already downloaded/cached copies cannot be recalled; a previously issued Supabase signed URL can remain valid until its short expiry (60 seconds for newly issued URLs).
- Use the billing ledger for new payments. The project management form retains a documented payment/waiver adjustment for legacy/manual operating cases; it requires a reason/reference.
- Set a per-additional-site fee only after commercial approval. The existing technical blueprint is retained as the working pricing baseline; shared-route optimization and multi-day work remain scope-review decisions.
- Authenticated browser UI and real external services still need UAT. Local browser access was unavailable during the review; source checks, real database regressions and production compilation cover the implementation, not visual verification.
