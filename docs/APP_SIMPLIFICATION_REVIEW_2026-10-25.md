# AngaVeritas: simplify the work, the screens and the handoffs

Reviewed 25 October 2026 against the current application.

## Assessment

The app covers much of the service, but requires users to understand too much of its internal organisation. It exposes requests, proposals, projects, visits, evidence, reviews, reports, notifications and billing as things users must navigate between. A first-time user thinks about one job and the next thing they need to do.

The product needs a coherent task model and role-specific workspaces. Another round of smaller labels and collapsed forms will help, but will not resolve disconnected conversations, unclear completion requirements, missing handoff ownership or contradictory instructions.

Keep the access controls, independent review, published snapshots, payment ledger and audit trail. Simplify how people use them.

## What was reviewed

Authenticated with the four existing local demo accounts in a fresh preview on port 3102. Inspected desktop and 390px mobile dashboards for all four roles, client setup and billing, staff project and billing pages, a request, the review queue, a reviewed field visit and integration status. Examined the source for editable field forms, validation, next-step logic, messaging and report authoring.

The existing preview on port 3000 returned Internal Server Error. The separate preview rendered the current source successfully; this does not establish a production outage or its cause.

Screenshots and screen inventories: `test-results/usability-review-2026-10-25/`. The available field visit was already reviewed, so findings about the editable field form combine source inspection with the observed read-only visit layout. This is an expert walkthrough, not measured research with first-time users. No client projects, proposals, findings, payments or reports were changed during the review. Login/session and message-read metadata can change during normal navigation.

## Improvements already present

- The client Projects list combines work waiting to start and accepted projects.
- Client next-step guidance covers setup, payment, visits and report delivery.
- Client language is plainer, and the project navigation has been reduced to six visible tabs.
- Payment instructions and the required amount are visible in Billing.
- Staff counters link to filtered queues.
- The field page puts the visit brief first on mobile, uses plain finding labels and combines note editing into one place.
- Some advanced and irrelevant client controls are hidden until needed.

These are worth retaining. The recommendations below address what remains.

## Concrete problems in the current app

| Observation | Why it confuses a beginner | Proposed correction |
| --- | --- | --- |
| Analyst/admin home has seven Needs action counters and six Pipeline counters before its work lists. | Thirteen numbers still require the person to work out their priority and responsibility. | Default to a personal work queue ordered by due date and blockers. Put aggregate statistics on a secondary overview. |
| Analyst and admin receive substantially the same home screen. | Doing a job and overseeing the business require different decisions. | Provide analyst My work and admin Business overview, with a clear route into operational work for admins. |
| The client home promotes Get an estimate even when setup and payment are outstanding. | The strongest general action competes with completing existing work. | Make the current required action primary; keep Start another project available as a secondary action. |
| The client home includes five summary cards, a large map, empty waiting content and a long activity feed. | A small portfolio receives the same dashboard weight as a large one. Mobile users scroll through low-value content. | Adapt to account size and stage. Keep tasks and project summaries; make map/history optional and omit irrelevant empty panels. |
| Client setup shows a long form alongside contacts and uploads; the mobile sample spans several screens. | People cannot readily distinguish the minimum needed now from optional information. | Guide setup through Site and access, What to check, then optional People and files. Reuse the brief already supplied. |
| One job changes from request to project, with separate references and separate message threads. | Clients and staff can lose earlier context and believe the conversation has disappeared. | Use one visible project file and continuous client conversation from initial enquiry onward. Retain contract/request records internally. |
| Field risk details are labelled optional or something the analyst can complete, while saveFindingAction requires category, likelihood, impact and mitigation for concern/high-risk findings. | The UI promises a simple action that fails unless hidden fields are completed. | Either reveal and require the fields when a risk is selected, or separate raw field observations from later analyst risk assessment. Do not tell users required information is optional. |
| A new finding defaults to No problem, Very sure and direct observation, with some values in collapsed detail. | A novice can accidentally submit strong conclusions without deliberately making those judgments. | Require a result choice; make uncertainty easy to record. Explicitly collect how the agent knows, with evidence-derived suggestions the agent confirms. |
| The inspection checklist is text and suggestions; the finish panel counts findings/files. | One finding does not tell the agent whether all agreed questions were answered. | Turn the agreed checks into individual tasks: Checked, Could not check, or Needs another visit, each with observations/evidence or a reason. |
| The review action Reopen is not a structured correction assignment. | Agents may not know what to fix, when it is due or how the correction will be reassessed. | Add Request changes with item-specific comments, an assignee and visible correction checklist. |
| A reviewed inspection banner says findings/photos are with the client even though individual photos can remain held. | Reviewed, released and delivered become interchangeable in the user's mind. | Describe those states accurately: findings reviewed, photos released/held, report pending/published. |
| Report reminders use missing client_rating as the signal that a report needs reading. | Reading and providing optional feedback are different actions; a reader may keep receiving the task. | Track first viewing or explicit acknowledgement separately from an optional rating. |
| The client can request an NDA before work starts, but fieldwork prerequisites do not include NDA state. | The promised sequence and enforced sequence can differ. | Define when the NDA is required. If agreed as a prerequisite, show and enforce it in the readiness checklist. |
| Staff next-step logic prioritises any held evidence before later project stages. The sample delivered project still prompts Check flagged evidence. | An optional/archive issue can dominate after the main work is delivered. | Prioritise unresolved requirements for the current stage. Show non-blocking archive issues separately. |
| Some staff inbox destinations still use a #messages anchor while messages live in a query-selected tab. | Clicking a message can open a project without its conversation. | Correct and verify task links so every shortcut lands on the exact actionable section. |
| Billing also contains NDAs, recurring plans, risk alerts and privacy/service requests. | A page named Billing becomes a collection of unrelated operational tasks. | Keep invoices/receipts in Payments. Put agreement preparation in setup, monitoring in its own plan view and changes/privacy under contextual project settings. |
| Uploads show waiting/uploading/done/error but have no per-file retry or percentage progress. | A field agent cannot tell how much remains or recover a single failure easily. | Show per-file progress, saved/pending/failed counts and a visible retry action. Build resumable/offline media support as a later operational capability. |

Source anchors: `src/app/staff/page.tsx`, `src/app/portal/page.tsx`, `src/app/portal/projects/[code]/page.tsx`, `src/app/staff/inspections/[id]/page.tsx`, `src/app/staff/actions.ts`, `src/lib/workflow.ts`, `src/lib/data/messages.ts`, `src/lib/data/dashboard.ts`, `src/components/app/OperationsPanel.tsx`, `src/components/app/Uploader.tsx`.

## A simpler shared model

One visible project file should follow the work through:

**Request received → Scope and price agreed → Ready for a visit → Visit completed → Findings checked → Report delivered.**

This is a presentation model. Contract acceptance, project creation, evidence release and billing keep their separate integrity rules underneath it. A draft enquiry must never appear to authorise paid work.

Every project should consistently show:

1. The current stage in the reader's language.
2. The next required action, or an explicit No action needed from you.
3. Who is responsible for that action.
4. The agreed date or the next promised update.
5. What is blocking progress, if anything.

Do not reduce all readiness to one sequential status. Site details, payment and an agreed NDA may be concurrent requirements. Display each as Complete, Your action, Staff action or Not required.

## Client experience

The client should feel: **I can request a check, understand the price, supply what is needed, and see the outcome.**

Suggested main navigation: Home, My projects, Reports, Messages. Account belongs in the profile menu and informational updates in a notification bell.

Home should show the next action for each active project, upcoming visits and newly delivered reports. With one active project, the home can largely be that project's summary. A portfolio map is an optional view for people who benefit from it.

Suggested project sections: Summary, Findings and reports, Files, Payments. Messaging opens the same continuous conversation with that project selected. Site preparation is a guided task, rather than a permanent long form users repeatedly rediscover.

A preparation task should start with known information and ask for confirmation or what is missing. Show three short sections: Where and access; What we should verify; People/documents, clearly marked optional where appropriate. Save and resume should be clear.

Payment needs an actionable account-specific destination and reference. While reconciliation is manual, add I have paid with a transaction reference/receipt and a Pending confirmation state. It must never mark an invoice paid without staff reconciliation. Display the actual expected confirmation time.

Lead the report with the decision summary, main risks, what was confirmed and what the client should do next. Let them open the evidence behind each finding. Keep the evidence archive and full methodology available without making them the starting point.

## Analyst experience

The analyst should feel: **Here is my work, what is due, and the next step for each job.**

Suggested main navigation: My work, Projects, Schedule, Reviews, Messages. Incoming requests and unassigned work are views of My work. Client lookup can live in project search/filtering and a supporting directory.

Use a queue with Project, Task, Due, Waiting on, and Action. Default to Mine; allow Team. Examples: prepare proposal, confirm payment, schedule visit, review submitted work, finish report, reply to client.

Within a job, guide the operational stages: Brief; Proposal; Prepare visit; Fieldwork; Review; Report; Delivery. Open the relevant step by default and keep the previous record one click away.

Provide service templates for proposals, required checks and report structure. Prefill agreed scope and confirmed findings; require the analyst to verify them. Avoid repeatedly typing the client's brief into several records.

Review should place the finding, evidence, metadata warnings and reviewer notes together. It needs Approve, Hold and Request changes, with clear client visibility. If an analyst adds substantive field/report content, the independent approval rule still applies; simplicity must not permit self-approval.

## Field agent experience

The agent should feel: **I know where to go, what to check and whether my work is safely saved.**

Suggested mobile navigation: Today, My visits, Help. Put profile and less common options in a menu. Projects are supporting context inside a visit.

The visit should be a guided sequence: Directions and access; Start visit; Required checks; Review completeness; Send for review. Keep the visit brief accessible throughout.

For each check, ask only what is needed to record the observation: result, what was observed, supporting photos/video and an explanation if it could not be checked. Show thumbnails instead of making people identify files by evidence codes. Detailed classification can be progressively disclosed or performed in a separate analyst assessment.

Show concrete completion: 4 of 6 checks answered, 3 files saved, 1 upload pending, notes saved. Prevent accidental loss of unsaved work. Provide Contact coordinator without exposing client finances or private client conversations.

When work is returned, show exactly which items need correction. After submission, show who is reviewing it and that the agent has no action unless changes are requested.

## Admin experience

The admin should feel: **I can see where the business needs intervention and who is responsible.**

Provide a Business overview with overdue/unassigned work, reviews awaiting an eligible reviewer, payment reconciliation, client requests needing response and delivery/integration failures. Each item must lead directly to the work.

Separate Operations from Management. Admins can still perform analyst tasks. Management contains Money, Team and Settings; audit records and integration configuration are supporting tools rather than the main daily destination.

Add workload and visit scheduling with date/time-window clarity, availability and ownership. Add an exception queue for unassigned work, overdue commitments and changes requiring attention. Avoid adding revenue charts before the underlying finance records and definitions are consistent.

Recurring monitoring should show the agreed fee, frequency, next visit and client approval/change history. Establish acceptance of the plan before activation. Show this experience only for engagements using monitoring.

## Visual and layout direction

Retain the charcoal, white and muted gold identity. The visual problem is the weight and repetition of information, rather than the palette.

- Give each screen one dominant task and a restrained set of secondary actions.
- Prefer concise work rows and project summaries to walls of equally weighted cards.
- Use a compact project header: name, stage, responsibility and next update. Keep identifiers secondary.
- Differentiate work progress from investment risk. A green Report ready badge does not mean the underlying investment is safe.
- Put buttons near the information they affect. Use a consistent save location and explicit save states for long edits.
- Use a guided mobile layout for fieldwork; do not simply stack a desktop form.
- Treat screenshots of empty/demo data carefully: omit irrelevant empty panels and explain legacy/manual records rather than presenting apparently contradictory states.
- Distinguish Client message and Staff note visibly, rather than relying mainly on a small checkbox.
- Keep technical metadata, evidence hashes and audit details available under details or specialist views.

## Delivery order

### First: fix contradictions and completion gaps

Correct optional/required risk fields, false report-read reminders, readiness/next-step inconsistencies, held-evidence wording and exact task destinations. Define NDA prerequisites. Give returned work explicit correction instructions and ownership.

### Second: establish the coherent client and staff journey

Create a stable project view from the initial request, unify the client conversation, simplify client preparation, add manual-payment acknowledgement, and prioritise personal staff tasks. Preserve existing records and contracts; avoid a wholesale backend rewrite.

### Third: build the field workflow

Implement required checklist items, evidence attached to each check, completion indicators, reliable save/retry states and clear return-for-correction handling.

### Fourth: strengthen management

Add scheduling/workload, overdue escalation, finance exceptions and monitoring-plan approval. Defer broad analytics and advanced map features until these everyday tasks work well.

## How to judge the redesign

Use first-time participants for each role and observe without coaching. Do not treat the earlier successful technical workflow tests as proof of ease of use.

| Role | Tasks to observe |
| --- | --- |
| Client | Start the right kind of request, explain the agreed price, identify the next action, supply site details, report a payment, find the result and message the analyst. |
| Analyst | Find their highest-priority work, send a proposal without retyping the brief, schedule a ready visit, request a specific correction and prepare a report. |
| Agent | Find directions, identify all required checks, attach evidence, recover a failed upload, confirm notes are saved and correct returned work. |
| Admin | Identify overdue/unassigned work, find an eligible reviewer, reconcile a payment and resolve a delivery failure. |

Record completion, wrong turns, requests for help, misunderstood wording and lost/unsaved input. Agree numerical targets after observing a baseline. A successful first version should let each person complete the normal journey without understanding the internal database records.
