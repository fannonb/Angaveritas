# Project setup, dashboards and billing review

Reviewed 2 November 2026. Changes are implemented in the application source.

## What was making the journey difficult

The project summary combined client tasks, internal assignments, completed items and an optional NDA in one readiness count. Clients were offered “Ask analyst” for work the team already owned. The main next action disappeared when another tab was selected, while a second card repeated competing buttons. Optional details gave long forms the appearance of being mandatory. Saving a draft did not explain that submission was still required.

Billing had inconsistent deposit defaults, including full payment. Invoice amounts could not be edited after issue, even for a discount after a deposit. The client home omitted final balances, and payment prompts did not consistently account for checkouts already in progress. The staff work queue could send someone to a different task from the one named in the row; tasks beyond the first six were hidden on the admin overview.

## Implemented journey

| Stage | Client action | Team action |
| --- | --- | --- |
| Proposal | Review the scope, final fee and payment schedule; accept online | Prepare an itemised proposal and resolve questions |
| Service brief | Complete the questions for the selected service, review and give consent | Assign the team and prepare an NDA if requested |
| Deposit | Pay 60% of the approved fee | Confirm external payment references; online payments reconcile automatically |
| Preparation | Sign an NDA only when requested and prepared | Confirm the scope and schedule the work |
| Work and review | Follow progress; respond when asked | Collect evidence, independently review it and prepare the report |
| Delivery | Settle the remaining balance and read the report | Publish the reviewed report, follow up and arrange any refund |

The project next action stays visible on every tab and links directly to the relevant task. Preparation separates **Your tasks**, **With our team** and **Completed**. An unrequested NDA is excluded from the readiness total. A client who has finished their part sees an explicit message that no further preparation is needed.

Service-specific forms retain two answer steps plus review and consent. Existing answers remain prefilled; optional location notes and background information are collapsed. Later sections stay visibly locked. Save and continue validates the current and earlier sections on both the client and server, saves the answers, and only then opens the next section. Clients can go back to review their answers. Final submission checks the saved service brief again before changing the project phase; drafts and section saves leave it in onboarding. Missing answers receive a field-specific message and focus. **Save draft** explains that the brief still needs to be sent; submitted briefs use **Save changes**. Once work starts, the brief is displayed for reference.

Client home lists direct next actions, includes final balances, identifies the first task, and acknowledges when the client is up to date. Admin home links to a concrete next task and separates team actions from items waiting on clients. Additional actions can be expanded instead of disappearing after the first six. Payment confirmation filters include projects whose deposit is already settled, and discounts that create overpayments become refund tasks.

## Billing rules

- New proposals, manually issued invoices and new monitoring-cycle invoices calculate a 60% deposit automatically. Calculations use the final fee after discounts, rounded once to a whole shilling. The remaining amount is due before report access.
- Existing sent or accepted proposals retain their explicitly agreed deposit. The migration does not rewrite historical commercial agreements or payments.
- Staff can edit an issued invoice's description, items, discounts and due date after work begins. Each revision requires a client-visible reason and increases the revision number. The original approved ceiling and payment history remain intact.
- A revised total can be restored up to its original approved amount. Additional charges above that ceiling require separately agreed work and a supplementary invoice.
- Changes update the portal invoice, PDF, project payment status, client notification and audit history. The latest PDF can then be emailed through the existing invoice action. Saving a revision does not send an email or transfer money.
- If a discount reduces the total below payments received, the invoice shows the overpayment and the admin dashboard requests a refund. Staff arrange the actual refund and record it; a discount never silently removes a payment.
- Pending external payment references and open or unresolved online checkouts must be reconciled before invoice editing. Clients are directed to payment status instead of being asked to pay again. Stale concurrent edits are rejected, and validation failures preserve the editor's changes.
- Invoice edits after a report is published require an admin, consistent with the existing rule for cancelling invoices that could release a report.

## Verification and rollout

Automated coverage includes deposit calculations after discounts, acceptance, payment reconciliation, invoice revision history, stale edits, unauthorized edits, pending funds, overpayments and refunds. Browser checks exercise every service profile, draft/reload/review/consent, client-to-staff handoff, small and large screens, invoice validation recovery, discounts after payment and PDF access.

Verification completed: 128 unit checks, 78 database integration checks, nine browser scenarios covering all seven service profiles and invoice revisions, TypeScript validation, and the production build. Phone and desktop screenshots were inspected.

The database change is `supabase/migrations/0023_invoice_revisions.sql`; it has been applied to the local development database. Apply it before running the updated application against any deployment database. Production publishing is separate from these local implementation changes.
