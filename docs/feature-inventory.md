# UMED Feature Inventory

This document tracks every user-facing capability, backend endpoint, and architectural asset in UMED to prevent functional duplication.

---

## 1. Feature Map (Release 1)

| Area | Feature / Capability | Implementation Target | Phase |
| :--- | :--- | :--- | :--- |
| **Foundation** | Architecture & Specification Review Console | `src/App.tsx` | Phase 1 (Completed) |
| **Foundation** | Domain Models & Dar Al Salam Seed Types | `src/types/umed.ts` | Phase 1 (Completed) |
| **Foundation** | Firestore Security Rules | `firestore.rules` | Phase 1 (Deployed) |
| **Auth & RBAC** | Firebase Client SDK & Data Access Layer | `src/lib/firebase.ts` | Phase 2 (Completed) |
| **Auth & RBAC** | Auth & Role Context Provider | `src/context/AuthContext.tsx` | Phase 2 (Completed) |
| **Auth & RBAC** | Node.js Express Server & Bootstrap Endpoint | `server.ts` (`/api/admin/bootstrap-owner`) | Phase 2 (Completed) |
| **Auth & RBAC** | Role Management & Immutable Audit API | `server.ts` (`/api/admin/roles`, `/audit-logs`) | Phase 2 (Completed) |
| **Auth & RBAC** | Arabic RTL Connectivity & Theme Bar | `src/App.tsx` (Top Status Bar) | Phase 2 (Completed) |
| **Academic** | Academic Hierarchy Management Console | `src/components/admin/AcademicStructureManager.tsx` | Phase 3 (Completed) |
| **Academic** | Academic Entity Service & Relational Safeguards | `src/services/academicService.ts` | Phase 3 (Completed) |
| **Academic** | Idempotent Dar Al Salam 7-Level + Internship Seed | `src/services/academicService.ts` (`seedDarAlSalamToFirestore`) | Phase 3 (Completed) |
| **Academic** | Seed Audit Log API Endpoint | `server.ts` (`/api/admin/seed-dar-al-salam`) | Phase 3 (Completed) |
| **Students** | Cascading Mobile Enrollment Registration | `src/components/student/RegisterEnrollment.tsx` | Phase 4 (Completed) |
| **Students** | Admin Enrollment Approval Queue | `src/components/admin/EnrollmentApprovalManager.tsx` | Phase 4 (Completed) |
| **Students** | Mobile Arabic RTL Student Dashboard & Change Requests | `src/components/student/StudentDashboard.tsx` | Phase 4 (Completed) |
| **Students** | Student Enrollment & Review Service | `src/services/enrollmentService.ts` | Phase 4 (Completed) |
| **Students** | Enrollment Review Audit API Endpoint | `server.ts` (`/api/admin/enrollment-review`) | Phase 4 (Completed) |
| **Library** | Educational Content CRUD Service | `src/services/resourceService.ts` | Phase 5 (Completed) |
| **Library** | Low-Bandwidth Medical Resource Guard Preview | `src/components/library/ResourcePreviewModal.tsx` | Phase 5 (Completed) |
| **Library** | Student Medical Library | `src/components/library/StudentMedicalLibrary.tsx` | Phase 5 (Completed) |
| **Library** | Admin Educational Content Manager | `src/components/admin/EducationalContentManager.tsx` | Phase 5 (Completed) |
| **Assessment** | MCQ Question Bank & Answer Key Console | `src/components/admin/AssessmentManager.tsx` | Phase 6 (Completed) |
| **Assessment** | Unified Exam & Competition Launcher | `src/components/assessment/StudentAssessmentList.tsx` | Phase 6 (Completed) |
| **Assessment** | Server Countdown & Cloud-Sync Exam Session | `src/components/assessment/ExamTakingModal.tsx` | Phase 6 (Completed) |
| **Assessment** | Client Assessment & API Service | `src/services/assessmentService.ts` | Phase 6 (Completed) |
| **Assessment** | Server Attempt & Idempotent Scoring API | `server.ts` (`/api/assessments/*`) | Phase 6 (Completed) |
| **Assessment** | Results Release Audit Endpoint | `server.ts` (`/api/admin/release-results`) | Phase 6 (Completed) |
| **Operations** | Immutable Audit Log Viewer | Admin Console (Tab 7) | Phase 7 |
| **Operations** | JSON Snapshot Database Export/Import | Admin Console (Tab 7) | Phase 7 |

---

## 2. Deferred Capabilities (Explicitly NOT in Release 1)
- AI Chatbots / AI Exam Generators
- Social discussions, student chat rooms, direct messaging
- Gamified XP badges, coins, or leaderboards (outside standard competition scores)
- Payment gateway integration or fee collection
- Video live streaming / webinar classrooms
