# Workflow review — 25 October 2026

## Why this review

The request-to-delivery workflow was walked as each role, then the hand-offs were
stress-tested: who owns a request, what happens when a proposal is sent, how the
field agent is chosen, what happens when that choice changes, and whether the
screens tell staff the truth about what they can do.

The app was already passing its 21-scenario browser suite. The problems below are
workflow gaps that the suite did not assert, not crashes. They were reproduced in
the running app and its database.

## The workflow as it actually runs

| Step | Who acts | What the app does |
| --- | --- | --- |
| 1. New request | Client | `submitted`; every active analyst and admin is notified; the request appears in Requests and on the overview |
| 2. Triage | Analyst/admin | Sets priority and **owner**, or claims it; saving a submitted request moves it to `in_review` and tells the client |
| 3. Proposal | Owner or any analyst/admin | Prefilled from the estimate; sending moves the request to `proposal_sent` and notifies the client. If the request had no owner, the sender becomes the owner |
| 4. Acceptance | Client | Signs online; the request becomes `accepted`; a project opens at **Onboarding**; the deposit invoice is created; the **lead analyst is the request owner, or the proposal author if no owner was set**; the team and the lead are notified |
| 5. Team hand-off | Analyst/admin | The **Team** panel assigns the **lead analyst** and **field agent**. Changing the field agent moves open visits from the previous agent (or unassigned visits) to the new one |
| 6. Onboarding | Client | Site details, claims, contacts, consent. Submitting moves the project to **Planning** and tells the team |
| 7. Scheduling | Analyst/admin | Blocked until onboarding, consent, payment/waiver and both assignments exist. The client's claims seed the field checklist |
| 8. Fieldwork | Field agent | Opens the visit on a phone, records findings and evidence, submits for independent review |
| 9. Review and report | Analyst/admin | A different person reviews the inspection; an analyst drafts the report; another person publishes it. Publication moves the project to **Report delivered** (or **Monitoring** for a retainer) |

The analyst is assigned at the **request** stage and the field agent at the
**project** stage. That split is deliberate: field agents have no access until
onboarding, consent and payment make fieldwork possible.

## What the grill exposed

| # | Finding | Evidence | Change |
| --- | --- | --- | --- |
| 1 | A proposal could be sent without an owner. The accepted project then had no lead analyst, and the person doing the work was not in the queue. | `AVR-1002` was `proposal_sent` with owner `Unassigned` after an admin had already sent v1. The project insert copied `requests.owner_id`, which was null. | Sending a proposal claims an unowned request for the sender. Project creation falls back to `proposal.created_by`. The lead is notified when the team notification goes elsewhere. |
| 2 | Team assignment was buried in the long project-details form. Saving the details could also overwrite an assignment made by someone else (the form submitted stale assignment fields). | The form combined title, stage, health, dates, payment, site, notes and both assignments behind one **Save changes** button. | A dedicated **Team** panel and `assignProjectTeamAction`. Project details now read the current assignments at action time and cannot change them. |
| 3 | Reassigning the field agent left open visits with the old agent or with nobody. The new agent had project access but could not open the scheduled work. | Assignments updated only `projects.field_agent_id`; `inspections.agent_id` was untouched. | Open (`scheduled`/`in_progress`) visits assigned to the previous agent or unassigned move to the new agent. Submitted/reviewed/cancelled visits keep their original agent. Both agents are notified. |
| 4 | Requests had no owner column and no owner filter, so unassigned work was invisible. The nav badge counted only brand-new requests and disappeared as soon as they were opened. | Requests list showed the owner as a small line under **Received**. Sidebar badge used `new_requests` only. | Owner column, **Any owner / Unassigned / Mine** filters, and the Requests badge now counts all open requests (`submitted`, `in_review`, `proposal_sent`). |
| 5 | Status and stage dropdowns offered transitions the server silently rejected. Choosing **Accepted** on a request or **Delivered** on a project did nothing. | The request status select listed all seven statuses; the project stage select listed all seven stages, while `requestTransitionAllowed` and `projectTransitionProblem` allowed far fewer. | Request status is now read-only with only valid actions (**Start review**, **Close request**). The project stage offers the current stage and **Closed**, with a note that stages advance automatically. |
| 6 | History was mixed with raw database trigger rows such as `requests update`, `proposals insert`, `proposals update`. | `AVR-1002` history showed four technical rows between real events. | Technical audit rows are filtered from the human request/project timelines. The complete before/after trail remains in **Audit log**. |
| 7 | A field agent landing on the overview saw **Nothing scheduled** and no path to the project they were already assigned to. | The field-agent home had only the upcoming-visit panel. `AVP-101` was delivered and assigned, but absent from the page. | **My projects** panel with stage, location and next visit, and a clearer empty state for visits. |
| 8 | A newly accepted project with no field agent did not count as **Need a team** until onboarding finished. | The "unassigned" query covered only `planning` and `fieldwork`. | The query now covers `onboarding`, `planning` and `fieldwork`, so the hand-off is visible immediately. |
| 9 | The revision form dominated a request that already had a sent proposal. | The full builder sat above the current proposal on every open request. | The current proposal is shown first; **Revise the proposal** is a collapsed section. |
| 10 | Client dashboard cards stretched to the height of the tall map tile, leaving large empty panels. | `Open requests` and `Your projects` grew to match the map column. | Grids use `items-start`; cards size to their content. |
| 11 | A proposal sent by someone other than the owner did not tell the owner. | Only the client was notified. | The owner is notified in-app when another staff member sends a proposal on their request. |

## What was tested

- Role walk-throughs as admin, analyst, field agent (390 × 844 mobile) and client.
- Existing production-style browser suite: **22 checks passed**, now including
  "an unowned request is claimed by the analyst who sends the proposal".
- Unit tests: **54 passed**, including request status targets and technical-event
  filtering.
- PostgreSQL regressions: **25 passed**, including open-visit reassignment and
  the proposal-author fallback for the lead analyst.
- TypeScript checking passed.

Commands used:

```powershell
npx tsc --noEmit --incremental false
npm test
$env:RUN_DATABASE_TESTS='1'; $env:DATABASE_URL='postgres://postgres@127.0.0.1:5499/angaveritas_platform'; npm test
npm run test:workflow
```

## Files touched

- `src/lib/workflow.ts` — valid request moves and the technical-event filter.
- `src/lib/data/projects.ts` — team assignment/reassignment, timeline filtering.
- `src/lib/data/proposals.ts` — lead-analyst fallback on acceptance.
- `src/lib/data/requests.ts`, `src/lib/data/dashboard.ts` — owner filters and open-request counts.
- `src/app/staff/actions.ts` — claim, team assignment, proposal ownership and safe status handling.
- `src/app/staff/requests/page.tsx`, `requests/[reference]/page.tsx` — owner column/filters, claim, valid status actions, collapsed revision.
- `src/app/staff/projects/[code]/page.tsx`, `ManageForm.tsx`, `TeamForm.tsx` — dedicated team hand-off and restricted stages.
- `src/app/staff/page.tsx`, `src/app/staff/layout.tsx` — field-agent projects and open-request badge.
- `src/app/portal/actions.ts`, `src/app/portal/page.tsx` — lead notification and dashboard layout.
- `tests/workflow.test.ts`, `tests/workflow-security.integration.test.ts`, `scripts/test-workflow-browser.mjs` — regression coverage.

## Still open (deliberate scope)

- Invoice and payment rows are visible in **Billing** and the full **Audit log**, but the human project timeline does not yet carry explicit "invoice issued" / "payment recorded" entries. Adding those explicit events is a useful follow-up.
- Declined proposals drop out of the **Open** request filter. A "needs follow-up" queue or a follow-up date on declined requests would make re-engagement easier.
- New requests have no SLA/age indicator. The priority field and high-first ordering exist, but nothing escalates a request that has sat unclaimed.
- The request owner is a single person; there is no team queue or workload balancing. The **Mine** filter and owner column make the current model usable first.
- Live payment providers, automated PDFs, full offline fieldwork and external services remain outside this change.
