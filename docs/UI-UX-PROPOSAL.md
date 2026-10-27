# AngaVeritas UI/UX review and proposal

Reviewed 23 October 2026.

## Scope and confidence

Reviewed the local Next.js website. Visually inspected the homepage at desktop and 390px mobile width, the mobile contact page, and desktop pricing and sample-report pages. Examined source for services, About, the calculator, navigation, shared styles, and the client dashboard. The estimate page returned a local database connection error at port 5499, so calculator and authenticated dashboard observations are source-based rather than end-to-end visual verification. This does not establish a production outage. No visitor analytics, usability interviews, or production performance measurements were available. Impact assessments below are hypotheses to validate.

## Assessment

The visual identity is coherent: charcoal, white, muted gold, restrained borders, readable typography, and report-style evidence details suit a verification business. The opportunity is to make the service easier to understand and start, while strengthening the evidence behind the company's credibility. Preserve the identity and improve hierarchy, content, and interactions.

Existing strengths to retain:

- Clear geographic focus on Kenya and support for clients abroad.
- A downloadable sample report, including a clear fictional-case disclosure.
- Services grouped by investment stage.
- Visible starting fees and itemised pricing logic.
- Plain explanations of confidentiality, turnaround, and limitations.
- Mobile call/estimate actions, visible focus styles, native FAQ disclosures, and reduced-motion handling.

## Priority 1: clarify the first screen

The headline, “Independent Intelligence. Verified on the Ground.” is distinctive but broad. On desktop it dominates the hero; the concrete explanation appears below it. At mobile width the photograph, three tabs, and caption appear before the headline. The consultation and report buttons sit below the initial mobile viewport, while the fixed bar promotes the calculator.

Propose a more concrete headline such as “Know what is on the ground before you invest in Kenya.” Support it with a short explanation of site visits, evidence, and independent reporting. Test this against the existing headline rather than assuming a conversion gain.

On mobile order the content: headline, short explanation, primary action, secondary report link, compact image. Retain a compact statement of turnaround and coverage. Use a static initial image or manually selected examples to avoid distracting rotation. Prefer authentic, approved field imagery when available; visibly identify illustrative material.

## Priority 2: make actions predictable

The header says “Get a quote”, the hero says “Request a consultation”, pricing says “Get your estimate”, and the calculator explains that its result is an estimate followed by a formal proposal. “Create your account” introduces a separate route from the homepage.

Use “Get an estimate” consistently for the calculator. Keep “Talk to an analyst” as a clearly described alternative for visitors who do not know their scope. Match destination headings to those actions. Describe the formal proposal as the point where scope and price are agreed. Place account creation in the context of saving or submitting a request, with a brief explanation of its benefit.

## Priority 3: help people choose a service

The homepage presents six detailed cards and the services page contains six long sections. The existing stage grouping helps, but visitors must still distinguish broad services such as ground verification, due diligence, and feasibility.

Keep the stage grouping and add concrete situation labels: “Check land or property”, “Verify a supplier”, “Monitor a build”, and “Assess a business opportunity”. Show the likely service, a short outcome, starting fee, and a link to details. Offer an explicit “Help me choose” route. A lightweight selector should recommend a service and carry the choice into the estimator while allowing it to be changed.

## Priority 4: show who stands behind the work

The sample demonstrates the deliverable, but explicitly represents a fictional case. The configured team list is empty, so the About page currently omits the people section. Independence and confidentiality are explained primarily through company statements.

Add real team profiles, relevant qualifications and experience, and verifiable business details. Explain the separation between field collection and report review in plain language. Add permissioned client feedback or anonymised real cases when available, with scope, evidence, limitations, and outcome. Do not invent testimonials, activity counts, partner logos, or credentials.

Move a readable report finding or risk excerpt closer to the homepage hero. Label it as a sample and show what decision it helps a client make. A screenshot of the client dashboard using clearly labelled demonstration data would also explain the service better than the current feature list alone.

## Priority 5: reduce enquiry and calculator friction

The contact form asks for service, message, location, name, email, phone, preferred contact, location of residence, company, and consent. Phone is required even when email is selected as the preferred channel.

Start with name, email, a short project description, and consent. Ask for phone when the visitor chooses a call or WhatsApp. Move optional company, residence, and detailed scope questions to follow-up. Preserve inputs on errors; connect field-specific errors to their controls and move focus to an error summary or the first invalid field.

The calculator source contains six steps, a live breakdown, a project brief, and registration or sign-in at submission. It already saves progress within the browser session and shows the estimate before account submission; retain those benefits. Make the eventual account requirement clear near the beginning. Consider allowing a simple enquiry from the completed estimate without choosing a password, with a secure account invitation afterward.

Replace “Complexity” with “Project scope” and foreground plain questions rather than the internal score and multiplier. Test grouping the six screens into service, scope/location, and review; retain more steps if short screens perform better on phones. Put a compact running total and expandable breakdown near mobile navigation. Clearly label partial estimates and all unconfirmed travel/site costs. Add a location-search retry and fallback path. Verify native input constraints or equivalent accessible validation: the calculator currently submits through a button handler rather than a native form submission.

## Priority 6: improve scanning and proof presentation

The site repeatedly alternates spacious white and grey sections. This is calm, but supporting proof and decision information can be far apart. Pricing uses a large introductory area before the starting fees; the report page initially offers thumbnails whose text is too small to read at that scale.

Tighten introductory spacing on utility pages and bring relevant prices closer to the introduction. On the homepage use fewer details per service card and let the services page carry full checklists. Mix short summaries with readable evidence excerpts and a genuine dashboard preview. Keep typography, borders, spacing, and gold accents consistent.

For the sample report, keep the download and file size, add a readable HTML summary or expandable page preview, and explain a finding-to-evidence-to-recommendation sequence. Preserve the fictional-case disclosure wherever sample material is reused.

## Accessibility and responsive follow-up

Complete keyboard support for the hero's tab pattern, including associated panels and arrow navigation, or use ordinary buttons with appropriate selected-state semantics. Pause rotation on keyboard focus or provide a visible pause control if rotation stays. Move keyboard focus appropriately after calculator step changes and announce the new step. Test zoom, long service names, mobile totals, focus visibility, and fixed-bar overlap. These are focused verification tasks, not a claim that a complete accessibility audit has been performed.

The dashboard source already prioritises “Needs your attention”. Preserve that structure. Its unread-message action currently links to the general projects list; make it open the relevant conversation or a filtered unread inbox. Validate the authenticated workflow separately with authorised test accounts.

## Proposed homepage sequence

1. Concrete headline, short value statement, estimate action, and analyst alternative.
2. Compact coverage/turnaround/review reassurance with verifiable facts.
3. Readable sample finding and the decision it supports.
4. Situation-based service choices with indicative starting fees.
5. Four-step process from enquiry to report.
6. People and permissioned real-work proof.
7. Client dashboard preview using labelled demonstration data.
8. Short FAQ and a final contact action.

## Delivery sequence and evaluation

First release: mobile hero order, consistent action wording, shorter contact form, clearer partial-price labels, and reduced introductory spacing. Second release: service selection, readable report preview, team content, and dashboard demonstration. Third release: calculator changes and authenticated journey refinements after usability testing.

Before changing the flow, establish baseline rates for homepage-to-estimate starts, completion by calculator step, contact-form completion, validation errors, and qualified enquiries. Capture funnel events without collecting form contents or personal project details. Test with prospective local and diaspora clients: ask them to identify the service, explain what they will receive, find the likely cost and limitations, and start an enquiry. Compare task success, misunderstanding, completion time, and enquiry quality. Set numerical targets after a baseline exists.

The first design deliverable should be a revised desktop and mobile homepage plus the contact/estimate entry states, so the proposed journey can be assessed before broad implementation.
