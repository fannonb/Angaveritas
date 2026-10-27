# Workflow test report — 25 October 2026

## Results

- **21 production browser scenarios passed** using real Chrome.
- **52 unit tests and 23 PostgreSQL regression tests passed.**
- TypeScript checking and the optimized production build passed.
- The final npm audit reported **zero vulnerabilities**, including development dependencies.
- Migration `0009_workflow_boundaries.sql` was applied to the existing local database after validation.
- The existing development server was restarted on Next.js 15.5.28. All four original local demo accounts passed login/dashboard/sign-out smoke checks without browser console errors.

## Environment

The browser runner copied the four documented local demo accounts, including their existing password hashes, into a disposable `av_e2e_*` database schema. It authenticated through the normal login forms using their existing local password. The test server used isolated cookies and storage. The field agent used a 390 × 844 mobile viewport; other roles used desktop viewports.

Real email delivery, scheduled jobs and external scanning were disabled. Invitations and messages stayed in the isolated local outbox. No real payments were processed. Temporary database schemas were removed afterward. Existing business projects were not used for destructive tests.

## Browser coverage

1. Client credential login and dashboard.
2. Analyst credential login and dashboard.
3. Field agent credential login and dashboard.
4. Admin credential login and dashboard.
5. Role restrictions and denial of unrelated projects/files.
6. Admin staff invitation, role change, disabling and re-enabling.
7. Read-only analyst pricing and admin public-price visibility control.
8. Client custom request through the calculator.
9. Analyst qualification and itemised proposal delivery.
10. Client proposal signature, project creation and agreed deposit invoice.
11. Client onboarding, consent and document upload.
12. Staff assignment and refusal of unpaid inspection scheduling.
13. Admin manual deposit reconciliation and subsequent inspection scheduling.
14. Mobile fieldwork: evidence upload, linked finding, notes and submission. Submitted notes and pending uploads are refused.
15. Independent inspection review and manual QA/release of metadata-free evidence.
16. Analyst report drafting/submission and prevention of author self-publication.
17. Client/analyst messaging; internal staff notes remain hidden from the client.
18. Independent admin report publication, client report reading/feedback and audit log access.
19. Client follow-up estimate and proposal acceptance add billing to the same project and require the next deposit.
20. Completed consent withdrawal blocks collection on an existing inspection while preserving access to published historical evidence.
21. Admin report withdrawal revokes client report/reopened-evidence access; a corrected draft retains replacement lineage.

## Reproduced issues and fixes

| Issue | Implemented correction |
| --- | --- |
| Submitted findings and notes remained editable. | Submitted inspections now freeze collection and editing until a manager explicitly reopens them. UI, actions, sync and database enforce the boundary. |
| Existing inspections could continue collecting after consent withdrawal. | Collection now checks consent, onboarding, payment, project closure and active assignments throughout the workflow. |
| Upload registration acted as a lasting permission grant. | Byte-upload and completion routes recheck access, role, assignment and collection state. Database guards also refuse late evidence completion after submission or reassignment. |
| Reopening left unreviewed evidence visible to clients. | Unpublished evidence is hidden on reopening. Lists and downloads require a reviewed inspection or a reference in a currently published report. |
| Evidence deletion could leave broken finding references. | Linked files cannot be deleted until explicitly unlinked. The action displays an explanatory error. |
| An editor could approve another person's report containing their own changes. | Independent review checks contribution history as well as the named author. Contributors do not receive the publish control. |
| Later field edits could mask an earlier contributor. | Inspection review checks permanent finding/note contribution history. |
| Declining an old proposal could change a closed request back to declined. | Responses lock and verify the parent request status. Declines also record actor attribution. |
| Concurrent account changes could remove the last active admin. | Access changes are serialized; the active-admin check occurs in the same transaction. Disabling an account and revoking its sessions are atomic. A concurrent regression verifies that an admin survives. |
| Staff previews could show changed live findings for a delivered report. | Published and withdrawn previews use the stored snapshot while preserving the report's current status. |
| Upload notifications used an inactive Documents anchor. | They now open the actual Documents tab. |

The first six database issues were reproduced with failing regressions before correction. Additional regressions cover stale proposals, closed/unpaid projects, contribution history, reassignment and simultaneous admin changes.

## Dependency security

The original audit reported 12 vulnerable packages, including critical advisories. Updated and verified Next.js 15.5.28, React/React DOM 19.3.1, Zod 4.6.7, Vitest 4.1.12 and PostCSS 8.5.31. Overrides patch transitive PostCSS and selector-parser copies while retaining the existing Tailwind 3 design. Playwright 1.64.1 is a development dependency for repeatable browser tests.

Next.js request parameters, cookies and headers were migrated in individually reviewed patches following the [official version 15 upgrade guidance](https://nextjs.org/docs/app/guides/upgrading/version-15). Forms now use React's supported `useActionState` hook.

## Repeat the checks

```powershell
npm test
npm run typecheck
npm run test:integration
npm run test:workflow
npm audit
```

Browser tests require the local database/demo accounts, Chrome and either local `ACCESS.md` or `WORKFLOW_TEST_PASSWORD`. The runner starts its own server on port 3100.

To repeat the production browser run:

```powershell
$env:NEXT_DIST_DIR = '.next-production'
npm run build
$env:WORKFLOW_TEST_PRODUCTION = '1'
npm run test:workflow
```

Remove these environment overrides before ordinary development in the same shell.

Final browser evidence: `test-results/av_e2e_1792926155259/`, including `checks.json`, role screenshots, the mobile inspection, delivered report and server log. This run also asserted that no browser runtime errors occurred.

## Remaining boundaries

- Live M-Pesa/card payments still require provider adapters and separate reconciliation testing. Manual billing and recurring-cycle database logic were tested.
- Actual email delivery, deployed jobs, Supabase signed uploads and external malware scanning require their configured services and separate environment validation.
- Sample evidence deliberately lacked GPS/time metadata to exercise the QA hold. Real camera/GPS behaviour, large video uploads and unreliable field connectivity were not tested on a physical device.
- Device drafts cover notes rather than a complete offline media workflow. Automated designed PDFs remain outside the implemented delivery path.

These results validate the tested local implementation; they do not certify the deployed environment or unconnected external services.
