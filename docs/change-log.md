# UMED Change Log

All notable changes to the UMED platform are recorded in this file.

---

## [Phase 1.0.0] - 2026-10-21 (Phase 1 Baseline Complete)
### Added
- **Repository Documentation Suite**:
  - `README.md`: Project purpose, Yemen-first scope, and developer instructions.
  - `docs/architecture.md`: System topology, container backend, and low-bandwidth resilience.
  - `docs/data-model.md`: Detailed Firestore collection specs, fields, and relationships.
  - `docs/security.md`: Zero-trust RBAC model, answer key secrecy, and audit trail rules.
  - `docs/implementation-plan.md`: 7-phase execution roadmap and gates.
  - `docs/feature-inventory.md`: Complete list of planned features and deferred items.
  - `docs/decisions.md`: ADRs for answer keys, internship stage, and secrets management.
  - `docs/testing.md`: Quality assurance, unit testing, and security rule tests.
  - `docs/deployment.md`: Cloud Run deployment and environment variables.
  - `docs/known-issues.md`: Tracked constraints and planned mitigations.
  - `docs/execution-log.md`: Detailed audit of AI agent actions.
- **Type Definitions & Data Contracts**:
  - `src/types/umed.ts`: Complete TypeScript interfaces for RBAC, academic hierarchy, student enrollment, low-bandwidth library, examinations, and the **Dar Al Salam University** demonstration seed.
- **Security Rules**:
  - `firestore.rules`: Complete role-based access rules denying client reads to `questionAnswerKeys` and enforcing immutable `auditLogs`.
- **Live Preview Application**:
  - `src/App.tsx`: High-contrast Arabic RTL **Phase 1 Architecture & Specification Review Console** providing interactive inspection of architecture, schemas, Dar Al Salam University academic tree, and Phase 1 completion checklist.

## [Phase 7.0.0] - 2026-10-21 (Phase 7 Release Readiness Complete)
### Added
- **Backup & Restore Console (`src/components/admin/BackupRestoreConsole.tsx`)**:
  - Full JSON Snapshot Database Export for all academic structures, question banks, assessments, resources, and enrollments.
  - JSON Snapshot upload, schema integrity validation, and one-click database restore.
- **PWA & Offline Capability**:
  - `public/manifest.json`: Web App Manifest with Arabic RTL descriptors, theme colors, and mobile icons.
  - `public/sw.js`: Service worker caching core app shell assets for offline availability in Yemen.
  - PWA registration script in `index.html`.
- **Mandatory 20 QA Test Verification Matrix**:
  - Updated `docs/testing.md` with 20/20 verified test cases covering static typing, security rules, server endpoints, low-bandwidth protection, exam idempotency, and disaster recovery.
- **Updated Production Documentation**:
  - Synchronized `docs/feature-inventory.md`, `docs/execution-log.md`, `docs/known-issues.md`, and `docs/deployment.md`.
