# UMED Architectural Decision Records (ADR)

## ADR 001: Separation of Answer Keys from Public Question Documents
- **Context**: Medical examinations and competitions must prevent cheating. In single-page web applications, if correct answers are sent with the question payload, students can inspect network packets or browser DevTools.
- **Decision**: Questions and answer keys are split into two distinct collections: `assessmentQuestions` (accessible by students during exam) and `questionAnswerKeys` (denied to client reads by `firestore.rules`). Scoring is computed server-side via Node.js endpoint `/api/assessments/submit`.
- **Consequences**: Zero risk of client-side answer key scraping. Requires Node.js container backend to perform scoring.

---

## ADR 002: Modeling Internship Stage Distinct from Regular Study Levels
- **Context**: In medical education in Yemen (e.g. Dar Al Salam University), the academic program consists of 7 regular study levels followed by a mandatory 1-year clinical rotation (Internship / سنة الامتياز). Hardcoding it as a regular semester level causes grading and progression calculation bugs.
- **Decision**: In `StudyLevel`, introduce `stageType: 'regular' | 'internship'`, with `durationMonths: 12` and order `8`. This preserves uniform querying while maintaining explicit semantic distinction in UI and enrollment workflows.
- **Consequences**: Accurate modeling of medical curriculum without breaking universal academic hierarchy.

---

## ADR 003: Educational Library Resource Storage & Bandwidth Guard
- **Context**: Students in Yemen frequently experience unstable, metered, or slow 3G/4G connections. Auto-loading large PDFs or slides exhausts data quotas.
- **Decision**: Educational resources store validated external links (Google Drive viewer URLs, verified CDN/educational links) with mandatory file type and size labels. Client viewers require explicit user click ("عرض الملف") before opening files.
- **Consequences**: Fast page loads, zero unintentional data consumption, reliable hosting via Google Cloud / Drive ecosystem.

---

## ADR 004: Server-Side Platform Owner Bootstrapping via AI Studio Secrets
- **Context**: Creating the initial administrative user without hardcoding admin emails or exposing elevated permissions in client code.
- **Decision**: Use `INITIAL_OWNER_EMAIL` in Google AI Studio `Settings > Secrets`. An authenticated user calls `/api/admin/bootstrap-owner`. The server validates the Firebase ID token and provisions `platform_owner` if the email matches.
- **Consequences**: Completely secure bootstrapping without client leaks.
