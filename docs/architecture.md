# UMED Architecture Specification
## 1. System Overview

UMED is designed as a modular, lightweight, mobile-first medical education platform tailored for medical students and faculties in Yemen. The system adheres to strict separation of concerns, zero-trust security boundaries, low-bandwidth resilience, and configuration-driven academic structures.

```
+-----------------------------------------------------------------------------------+
|                            UMED Client (React 19 + Vite)                          |
|  - Mobile-First RTL (Arabic) with English Medical Terminology Embedding           |
|  - Progressive Web App Shell & Low-Bandwidth Resource Viewer                      |
|  - Progressive Exam Attempt Runner with Cloud Sync State Indicators               |
+-----------------------------------------------------------------------------------+
                                  |                 |
          Authenticated Reads     |                 | Privileged Actions
          (Published content,     |                 | (Scoring, Attempt Bootstrap,
          own profile, results)   |                 | Role Promotion, Audits)
                                  v                 v
+-------------------------------------+   +-----------------------------------------+
|      Cloud Firestore & Rules        |   |       Node.js Trusted Backend           |
|  - Role-based Access Control (RBAC) |   |  - Server-side Answer Scoring           |
|  - Answer keys strictly restricted  |   |  - Idempotent Attempt Validation        |
|  - Immutable Audit Logs             |   |  - Owner Bootstrap via Verified Secret  |
+-------------------------------------+   +-----------------------------------------+
                                  ^                 ^
                                  |                 |
+-----------------------------------------------------------------------------------+
|               Google AI Studio & Cloud Run Hosting Infrastructure                 |
|  - Secrets Management (INITIAL_OWNER_EMAIL, GEMINI_API_KEY)                       |
|  - Native Firebase Authentication & Firestore Provisioning                        |
+-----------------------------------------------------------------------------------+
```

---

## 2. Technology Stack

- **Client Runtime**: React 19, TypeScript, Tailwind CSS v4, Motion for smooth low-overhead animations, Lucide React icons.
- **Server Runtime**: Node.js with Express in containerized environment (`server.ts` / API proxy).
- **Database & Persistence**: Google Cloud Firestore (NoSQL document store).
- **Authentication**: Firebase Authentication supporting Google Sign-In and Email/Password with verified email checks.
- **Hosting & Infrastructure**: Google Cloud Run (`*.ai.studio`) with two-way GitHub Sync capability.

---

## 3. Trusted Security & Role Boundaries

### 3.1 Roles (RBAC)
1. **Platform Owner (`platform_owner`)**:
   - Manages top-level entities (`countries`, `universities`).
   - Assigns and revokes `university_admin` roles.
   - Inspects global immutable `auditLogs` and runs system-wide backups.
   - Bootstrapped securely via server-side verification against `INITIAL_OWNER_EMAIL`.
2. **University Administrator (`university_admin`)**:
   - Scoped strictly to assigned `universityId`.
   - Manages `colleges`, `programs`, `curriculumVersions`, `studyLevels`, `studyPeriods`, `courseOfferings`.
   - Uploads/publishes educational resources and creates exams and question banks.
   - Reviews and approves/rejects student enrollments and academic change requests.
3. **Student (`student`)**:
   - Authenticated user associated with an enrollment document (`studentEnrollments`).
   - Accesses only approved level-specific educational resources.
   - Takes exams and competitions with zero exposure to correct answer keys.
   - Views finalized results only after release policy criteria are satisfied.

### 3.2 Answer Key Protection Strategy
- Correct answers and question explanations are separated from the public question stems into `questionAnswerKeys/{questionId}`.
- Public assessment documents contain only question stems and selectable options.
- The scoring engine operates exclusively on the server side: student answers are transmitted upon attempt completion, matched against protected keys in memory, and the calculated score is saved to `assessmentResults`.

---

## 4. Mobile & Low-Bandwidth Optimizations

1. **Lazy Loading and Badging**: Educational resources display format badges (`PDF`, `Slide/Image`, `External Doc`) and file sizes before opening.
2. **Offline-Safe Shell**: Lightweight Progressive Web App caching allows access to the dashboard shell and cached outlines during network intermittency.
3. **Progressive Assessment Sync**: Examination attempts persist answers per question; network drops do not erase student progress.
