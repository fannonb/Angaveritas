# User and admin workflow audit

Reviewed 11 November 2026 against the current local working tree, including uncommitted changes.

## Scope and conclusion

This is a source-based product and workflow review of the client portal, staff workspace, actions, database rules and background jobs. It is not an authenticated browser walkthrough or a production audit. Existing historical reviews were used as background and checked against current implementation. No application behavior was changed.

The app has a substantial first-engagement workflow. Its largest remaining weaknesses are continuity between engagements, alignment between permissions and task queues, approval of commercial changes, and handling exceptions through to completion. Improving these will have more operational value than adding more dashboard screens.

Validation during this review: `npm test` passed 142 tests across 14 files; 82 tests in six files were skipped. The skipped integration tests, live payments/email, production configuration, responsive usability and accessibility were not verified in this review. Passing unit tests does not establish that the scenarios below work end to end.

## What already works in the product model

- Estimate/request intake, request ownership, versioned proposals and online client acceptance.
- Service-specific briefs, drafts, consent and conditional NDA preparation/signing.
- Deposit and balance accounting, hosted checkout implementation, payment reconciliation, invoice revisions and refund records.
- Team assignment, visit dates and arrival windows, field checks, findings and evidence capture.
- Evidence review, inspection correction requests, report review/publication and immutable published snapshots.
- Client next actions, project progress, messages, notifications, report viewing/ratings and project completion.
- Monitoring-plan acceptance, cycle invoices and paid-cycle dispatch.
- Staff queues, activity history, pricing administration and account disabling.

These should be retained. Several issues in the October baseline audit have already been addressed.

## Highest-priority findings

### W01 — New invoices can remove access to previously paid reports

**Confirmed behavior; high priority.** Report access depends on every issued invoice on the project being settled, rather than on the invoice for that report or engagement. Findings and evidence use the same project-level lock.

Example: a client pays for and reads the first report. They accept a follow-up proposal, or the next monitoring invoice is generated. The new unpaid invoice locks the earlier report and evidence again. This undermines the expectation of a permanent paid evidence archive.

**Improve:** associate each report/evidence release with its engagement or monitoring cycle and applicable invoice. Preserve access to earlier paid deliverables when new work is commissioned. Treat formal report withdrawal separately from payment gating.

Evidence: `supabase/migrations/0017_report_release_on_payment.sql:3`; `src/lib/data/operations.ts:122`; `src/app/portal/projects/[code]/page.tsx:44`; `src/lib/data/files.ts:114`; `src/lib/data/proposals.ts:137`.

### W02 — Extra charges do not require a recorded client acceptance

**Confirmed control gap; high priority.** Admins can issue supplementary invoices beyond the accepted contract using an additional-work checkbox, which is preselected in the form. The invoice action does not require a signed amendment or accepted proposal reference. The UI asks staff to agree the work, but the system does not enforce or capture that agreement.

**Improve:** add a change request containing the scope difference, added fee, deposit and delivery-date impact. Obtain client acceptance of that version before issuing the invoice or dispatching the work. Allow approved offline agreements only with an attached record and reason.

Evidence: `src/lib/data/operations.ts:213`; `src/components/app/OperationsPanel.tsx:172`; `src/app/staff/operations-actions.ts:50`.

### W03 — Follow-up work does not have a complete independent lifecycle

**Confirmed structural gap; high priority.** Accepting a follow-up moves the existing project to planning, increases contract value and creates an invoice. It retains the original project proposal, brief and claims. The follow-up proposal exists, but subsequent planning and report defaults are not consistently tied to it.

The staff preparation queue requires no previous non-cancelled inspections, and the report-writing queue requires no published report anywhere on the project. Consequently, a project with an earlier visit/report can lose these next-action tasks for its new engagement. The upcoming-report list also excludes projects with any published report. Progress uses any submitted/reviewed visit and any published report, so old work can mark new work complete; multi-site progress has the same ambiguity.

**Improve:** introduce an engagement/work-order or cycle record within each project. Link its accepted scope, brief version, sites, inspections, report, dates, invoice and completion state. Calculate next actions and progress for that active work, with earlier work presented as history. This also provides the boundary needed for W01.

Evidence: `src/lib/data/proposals.ts:137`; `src/lib/data/reports.ts:71`; `src/lib/data/workqueue.ts:8`; `src/lib/data/overview.ts:44`; `src/lib/workflow.ts:81`.

### W04 — Consent withdrawal waits for staff, and later renewal has no clear path

**Confirmed exception-flow gap; high priority.** Submitting a withdrawal creates a service request. Consent remains in force in application state until staff mark that request completed, so existing fieldwork gates still pass while the request waits. After completion, the consent gate blocks further fieldwork, but consent renewal goes through onboarding, which is locked after the planning stage. The client guidance suggests reviewing the brief to consent again despite this restriction.

**Improve:** immediately record the withdrawal and put affected work on hold; give staff a separate task to determine the operational consequences. Add a versioned, explicit re-consent flow that works during an active engagement, and require a deliberate resumption decision. Do not make consent restoration depend on editing the locked brief. This is a workflow observation, not a legal compliance determination.

Evidence: `src/lib/data/operations.ts:321`; `src/app/portal/actions.ts:148`; `src/lib/data/projects.ts:183`; `src/lib/workflow.ts:118`.

### W05 — Work queues and actual permissions disagree

**Confirmed workflow defect; high priority.** The work queue still excludes report authors/contributors from report review, even though current policy permits admin self-approval. It can offer report-review tasks to analysts, although only admins can publish. Payment reconciliation tasks are assigned to the lead analyst, although recording/confirming payments is admin-only. Similar eligibility drift exists for inspection reviews.

Consequences: an admin can miss their own submitted work in the home queue, and an analyst can receive a task they cannot finish. The separate Reviews page partly mitigates missing review items, but users must know to check it.

**Improve:** derive task eligibility, owner and actions from the same current permission rules. Distinguish the relationship owner from the person authorized to execute the task. Every task should identify the responsible person/team, deadline, blocker and direct action.

Evidence: `src/lib/data/workqueue.ts:8`; `src/lib/data/overview.ts:18`; `src/lib/data/reports.ts:105`; `src/app/staff/operations-actions.ts:13`.

### W06 — Cancellation does not complete the financial settlement

**Confirmed incomplete handoff; high priority.** Completing cancellation closes the project, cancels scheduled/in-progress visits and stops monitoring. It does not require a settlement calculation or resolve invoices/refunds. Analysts can complete this request even though financial actions require an admin. A refund record reduces payments but does not itself reduce what was charged, so cancellation requires coordinated invoice adjustment as well. The cancellation action also leaves submitted work untouched.

**Improve:** use cancellation requested → work held → settlement proposed → approved → refund/credit reconciled → closed. Record work delivered, retained charges, cancelled charges, refund due, owner and deadline. Explicitly decide what happens to submitted visits and draft/review reports. Keep closure and financial settlement separately visible until both are finished.

Evidence: `src/lib/data/operations.ts:269`; `src/lib/data/operations.ts:330`; `src/app/staff/operations-actions.ts:13` and `:121`.

## Approval policy and user-facing promises

### W07 — Independent review is promised more broadly than it is enforced

**Confirmed policy/copy mismatch.** Current migrations intentionally permit admins to approve their own reports and fieldwork. Non-admin inspection reviewers must remain independent; final report publication is admin-only. Yet client progress says a second person checks the work, staff guidance sometimes says another analyst can approve a report, and the Reviews page says everything needs admin approval even though independent analysts can review inspections.

This is not an accidental absence of all approvals. The product needs one explicit policy, applied consistently.

**Improve:** make independent technical review the normal route, with a clearly recorded admin exception if the business needs one. Show who prepared, reviewed and released the deliverable. Keep client copy accurate. For a small team, requiring additional approval on every low-risk operation would create unnecessary delays; reserve it for material commercial changes, release decisions and exceptions.

Evidence: `supabase/migrations/0015_admin_report_approval.sql:1`; `supabase/migrations/0016_admin_inspection_review.sql:1`; `src/lib/workflow.ts:53`, `:131`, `:138`; `src/app/staff/reviews/page.tsx:30`.

### W08 — Brief submission is treated as readiness without an explicit scope-acceptance handoff

**Product gap.** Submission confirms the client has completed the form, but there is no distinct analyst acceptance of that brief against the agreed proposal. Clients can change submitted briefs during planning. Staff are told to check suggested field tasks against scope, but the decision is not a versioned sign-off.

**Improve:** add a lightweight “Brief checked against scope” decision. If material details change, request clarification or use W02. Record which brief version the field checklist implements. Do not force clients to repeat facts already supplied in the request.

Evidence: `src/lib/data/projects.ts:180`; `src/app/portal/actions.ts:148`; planning form in `src/app/staff/projects/[code]/page.tsx`.

### W09 — Report changes and complaints lack a full resolution loop

**Product gap.** Inspection corrections already have reasons, assignees and due dates. Report return-to-draft has an optional note and an event/notification, but no comparable structured correction list or deadline. Low client ratings notify staff, but do not create a tracked complaint or correction case.

**Improve:** require a useful return reason, assign each report correction, set a due date and verify closure on resubmission. Give clients “Ask for clarification” and “Report an issue” with a response status. Preserve the existing immutable report/replacement mechanism.

Evidence: `src/app/staff/actions.ts:579`, `:815`; `src/app/portal/actions.ts` (`rateReportAction`); `src/app/staff/projects/[code]/reports/[id]/page.tsx:72`.

## Other improvements with clear operational value

| Area | Current gap and consequence | Recommended improvement |
| --- | --- | --- |
| Enquiry conversion | A contact-form enquiry cannot become a request until that email has a registered client. Staff must coordinate registration separately. | Send a secure invitation that resumes the enquiry and links the verified account to the existing record. Retain owner, notes and follow-up date. |
| Scheduling | Dates and arrival windows exist, but the inspected scheduling action has no agent conflict/capacity check or client confirmation state. Rescheduling is handled through messages. | Add availability, travel allowance, access confirmation and a reschedule request with proposed/confirmed dates. |
| Deadlines and escalation | Due dates, upcoming work and balance reminders exist. General proposal, brief, QA, service-request and correction escalation is not implemented in the jobs route. | Give stages target response times, an accountable owner, reminders and escalation to a backup. Show the client when to expect the next update. |
| Payment due dates | Proposal acceptance gives invoices a date 14 days later; reminder logic uses that date independently of report readiness. Long work can produce balance-overdue messages before the report is ready. | Separate the deposit due date from the final balance milestone, or explicitly agree a different balance date in the proposal. Derive reminders from that agreement. |
| Monitoring dispatch | Cycle generation and dispatch exist, but paid undispatched cycles are not first-class items in the central work queue. | Add “Paid cycle ready to schedule,” cycle scope/date/report tracking and deliberate overdue-cycle decisions. |
| Staff departure | Disabling a staff member revokes access but does not transfer their open assignments. Non-null disabled owners can still look assigned. | Show affected work before disabling and require reassignment or a visible unassigned queue. |
| Team collaboration | Projects have one client owner; reporting-recipient information is brief text. There is no client organization membership/approver model in the reviewed access path. | When needed, support invited collaborators with viewer, payer and authorized approver permissions. |
| Field connectivity | Note recovery and same-page upload retries exist. Media remains in browser memory; a closed tab loses the pending upload session. | Persist local finding/media queues, provide resumable uploads and clearly distinguish captured, queued, uploaded and reviewed evidence. |
| Report artifacts | Web snapshots are protected, but a separately uploaded PDF is not checked for content equivalence to the web report. | Generate the PDF from the approved snapshot, or require an explicit matching-version check before release. |

Evidence: `src/app/staff/enquiries/actions.ts`; `src/app/staff/actions.ts:391` and `:438`; `src/app/api/jobs/route.ts`; `src/lib/data/proposals.ts:161`; `src/lib/data/operations.ts:177` and `:376`; `src/lib/data/users.ts:96`; `src/lib/data/projects.ts:93`; `src/components/app/Uploader.tsx`; `src/lib/data/reports.ts:101`.

## Recommended approval and handoff model

The following is a proposed policy, not a description of all current behavior.

| Step | Responsible person | Decision or gate | Result |
| --- | --- | --- | --- |
| Qualify enquiry | Assigned analyst | Service fit, missing information, urgency | Qualified request or explained decline |
| Prepare proposal | Analyst | Admin review for exceptional pricing, discounts or terms | Approved offer |
| Accept proposal | Authorized client | Exact scope, fee, dates, payment milestones | Accepted engagement and invoice |
| Validate brief | Analyst | Brief matches agreed scope; material changes accepted | Versioned work instructions |
| Confirm readiness | Coordinator/analyst | Consent, required NDA, deposit, access and staffing | Work ready to schedule |
| Schedule | Coordinator and field agent | Availability/access confirmed; client notified | Confirmed visit |
| Perform work | Field agent/researcher | All required checks addressed and uploads saved | Submitted work |
| Review evidence | Eligible independent reviewer | Approve or return specific corrections | Reviewed findings/evidence |
| Review report | Technical reviewer; admin release authority | Content, limitations and evidence consistency | Approved report |
| Release | System | Relevant engagement balance settled or authorized waiver | Accessible report and matching PDF |
| Close | Client/engagement owner | Deliverables resolved, no open work, settlement reconciled | Completed engagement |
| Extend or change | Analyst, admin where needed, client | Explicit new scope/fee acceptance | Separate linked engagement/cycle |

## Suggested implementation sequence

1. **Restore workflow consistency:** fix permission-aware queues and misleading approval copy; establish immediate holds and a resumption route; prevent cancellation from being mistaken for completed settlement.
2. **Define work within a project:** implement engagement/cycle boundaries, tie billing and access to them, and scope progress/tasks/report dates correctly. Add client-approved changes and brief acceptance.
3. **Reduce manual coordination:** add scheduling checks, response deadlines, escalations, correction/complaint cases, paid-cycle dispatch tasks and staff handover.
4. **Improve scale and field reliability:** persistent offline capture, generated report PDFs and client organization access as demand warrants.

## Acceptance scenarios for the next implementation

- A paid report remains accessible after a new monitoring or follow-up invoice is issued.
- A follow-up with an old published report creates the correct preparation, scheduling, writing and review tasks.
- Every task shown to an analyst/admin can be executed by that role or clearly identifies the required handoff.
- Supplementary charges cannot become payable without acceptance of their scope and amount.
- Withdrawal stops affected new work immediately; renewed consent can resume an engagement already in fieldwork.
- Cancellation produces a settlement record and tracks refunds to completion without inadvertently demanding repayment of refunded charges.
- A three-site engagement reports partial completion after only one reviewed site.
- A delayed report does not trigger an unintended final-balance overdue reminder.
- A disabled employee's tasks are transferred or visibly unassigned.
- Closing and reopening a mobile browser preserves queued evidence and its save state.

