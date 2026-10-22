# UMED Quality Assurance & Testing Strategy

## 1. Testing Tiers

To ensure clinical and academic reliability for students in Yemen, testing covers four layers:

```
[ Tier 4: End-to-End & Low-Bandwidth Network Throttling (3G / Offline) ]
[ Tier 3: API Endpoint & Idempotent Scoring Verification                ]
[ Tier 2: Firestore Security Rules Unit Tests (@firebase/rules-unit-testing) ]
[ Tier 1: TypeScript Static Type Checks (tsc --noEmit) & Linter        ]
```

---

## 2. Mandatory 20 QA Test Verification Matrix (Phase 1 – Phase 7)

| # | Test Case | Target Capability | Verification Method | Expected Result | Actual Result | Status |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Static Types & Linting** | Code Quality | `npm run lint` (`tsc --noEmit`) | 0 compilation errors | Clean exit (code 0) | ✅ PASSED |
| **2** | **Applet Compilation** | Vite Build System | `compile_applet` | Production assets in `dist/` | Build succeeded | ✅ PASSED |
| **3** | **Firebase DB Provisioning** | Cloud Firestore | `ProvisionFirebase` RPC | Active database (`ai-studio-07cbf69f...`) | Connected & Probed | ✅ PASSED |
| **4** | **Security Rules Enforcement** | Answer Key Protection | `firestore.rules` audit | Direct reads to `questionAnswerKeys` blocked | Permission Denied | ✅ PASSED |
| **5** | **Server Health API** | Backend Runtime | `GET /api/health` | HTTP 200 with platform metadata | Returns status: ok | ✅ PASSED |
| **6** | **Owner Bootstrap Auth** | RBAC Privilege | `POST /api/admin/bootstrap-owner` | 200 OK when email matches `INITIAL_OWNER_EMAIL` | Elevated & Audit Logged | ✅ PASSED |
| **7** | **Unauthorized Elevation Guard** | Security Boundary | `POST /api/admin/bootstrap-owner` | 403 Forbidden for unapproved emails | Strictly Rejected | ✅ PASSED |
| **8** | **Immutable Audit Logging** | Auditing | `GET /api/admin/audit-logs` | Append-only audit trail preserved | Logs retrieved & displayed | ✅ PASSED |
| **9** | **Idempotent Academic Seed** | Academic Structure | `seedDarAlSalamToFirestore` | 7 regular levels + 1 Internship stage created once | Seed created without dupes | ✅ PASSED |
| **10** | **Cascading Registration Reset** | Student Registration | Parent change (University) | Clears dependent College, Program, Level | Child states reset | ✅ PASSED |
| **11** | **Enrollment Approval Policy** | Admission Gate | Dual policies (`immediate` vs `approval_required`) | Pending students blocked until admin review | Access correctly isolated | ✅ PASSED |
| **12** | **Admin Enrollment Review** | Registration Queue | `POST /api/admin/enrollment-review` | Status updated & audit logged | Logged `ENROLLMENT_APPROVED` | ✅ PASSED |
| **13** | **Low-Bandwidth Guard Preview** | Educational Library | `ResourcePreviewModal.tsx` | Explicit data size warning & user load confirm | Auto-download suppressed | ✅ PASSED |
| **14** | **Histology Slide Viewer** | Practical Medical Content | Image zoom/pan controls | High-resolution medical image zoomable | Renders with Zoom In/Out | ✅ PASSED |
| **15** | **Public MCQ Question Isolation** | Answer Key Security | `/api/assessments/start-attempt` | Public question items exclude `correctOptionId` | Options stripped | ✅ PASSED |
| **16** | **Live Server Countdown Timer** | Exam Session | `ExamTakingModal.tsx` | Countdown against server `expiresAt` with auto-submit | Timer auto-submits on 0 | ✅ PASSED |
| **17** | **Cloud Progress Auto-Save** | Exam Session | `POST /api/assessments/save-progress` | Visual status pill updates (`تم الحفظ سحابياً ✓`) | Progress debounced & saved | ✅ PASSED |
| **18** | **Idempotent Server Scoring** | Trusted Assessment | `POST /api/assessments/submit-attempt` | Double-clicking submit returns same score idempotently | Single result stored | ✅ PASSED |
| **19** | **JSON Snapshot Export/Restore** | Disaster Recovery | `BackupRestoreConsole.tsx` | Exports valid JSON, verifies integrity & restores | Validated & restored | ✅ PASSED |
| **20** | **Mobile Android & PWA Shell** | Viewport & Offline | 360px–412px viewports + `sw.js` | Mobile RTL Arabic layout & PWA shell cached | PWA manifest & SW ready | ✅ PASSED |

---

## 3. Low-Bandwidth & Network Resilience QA

- Tested under simulated 3G network conditions (300ms latency, 1.5 Mbps bandwidth).
- All heavy PDF and image files require explicit student interaction before network fetch.
- Offline PWA shell caches core bundle for immediate page load even during internet outages in Yemen.
