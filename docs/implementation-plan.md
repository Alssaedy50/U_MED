# UMED Phased Implementation Plan & Verification Gates

The engineering lifecycle of UMED follows 7 strictly ordered phases. Advancement to the next phase requires explicit approval by the Product Owner.

---

## Phase 1 — Specification, Architecture & Interactive Review Baseline (CURRENT)
- [x] Create project repository structure and update `metadata.json` & `index.html`.
- [x] Author comprehensive documentation suite in `/docs/*.md` and root `README.md`.
- [x] Author TypeScript domain model `src/types/umed.ts` with Dar Al Salam University seed structure.
- [x] Author strict `firestore.rules` enforcing RBAC and answer key secrecy.
- [x] Render interactive Arabic RTL **Phase 1 Architecture & Specification Review Console** in Live Preview.
- [ ] **Approval Gate**: User reviews baseline console and approves progression to Phase 2.

---

## Phase 2 — Project Foundation, Firebase Auth & Role Bootstrap
- Provision Firebase Firestore & Auth via Google AI Studio tooling.
- Establish Firebase Client SDK initialization & session state provider.
- Implement Node.js server entry point (`server.ts`) with `/api/admin/bootstrap-owner` endpoint.
- Verify platform owner promotion via `INITIAL_OWNER_EMAIL`.
- **Approval Gate**: Owner role bootstrapped, auth flow verified.

---

## Phase 3 — Academic Structure & Dar Al Salam University Seed Persistence
- Implement Academic Management CRUD for Universities, Colleges, Programs, Curricula, Study Levels, and Blocks.
- Deploy idempotent one-click seed loader for **Dar Al Salam University** (7 levels + Internship stage).
- Ensure deletion safeguards (soft deactivation `isActive: false` when dependent records exist).
- **Approval Gate**: University hierarchy viewable and seeded in Firestore.

---

## Phase 4 — Student Registration, Enrollment Approval & Mobile RTL Dashboard
- Cascading student registration workflow (Country -> University -> College -> Program -> Level).
- University admin approval queue for `approval_required` enrollment policy.
- Student mobile dashboard displaying active blocks, courses, and level-specific notices.
- **Approval Gate**: Student registration to approval lifecycle verified.



## Phase 6 — Unified Examination & Competition Engine with Trusted Server Scoring
- Question bank builder with separated public stems and protected answer keys.
- Assessment builder (exams and timed academic competitions).
- Student attempt runner with progressive cloud autosave.
- Server-side scoring endpoint (`/api/assessments/submit`) and result release policy enforcement.
- **Approval Gate**: Secure test taking and server-side grading verified without answer leaks.

---

## Phase 7 — End-to-End QA Verification, Backup/Restore Tools & Cloud Run Release
- Administrative audit log viewer and JSON snapshot backup/export tool.
- End-to-end integration testing and mobile responsiveness validation (360px–412px).
- Production build compilation and Cloud Run deployment readiness checklist.
- **Approval Gate**: Final sign-off and production handoff.
