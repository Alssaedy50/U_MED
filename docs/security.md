# UMED Security Architecture & Authorization Specification

## 1. Zero-Trust Access Control (RBAC)

The security model of UMED enforces zero-trust boundaries across the client, Firestore, and the Node.js server environment:

```
Role                  Scope             Privileges
--------------------+-----------------+-----------------------------------------------------
platform_owner      Global            Full platform control, university & country creation,
                                      admin role assignment, global audit inspection.
university_admin    Single University Academic structure within assigned university, course
                                      content, student enrollments, exam creation/release.
student             Enrolled Student  Profile editing, taking authorized exams, viewing
                                      released scores, reading approved course materials.
```

---

## 2. Secrets Management & Server-Side Privilege Separation

1. **Secrets Location**:
   - Privileged values such as `INITIAL_OWNER_EMAIL` and `GEMINI_API_KEY` are stored in Google AI Studio's **Settings > Secrets** panel.
   - NEVER exposed to Vite client code (`import.meta.env`) or public Git commits.
2. **Initial Owner Bootstrapping Flow (Implemented & Verified in Phase 2)**:
   - The user authenticates using Firebase Auth (Google Sign-In or Email/Password).
   - User triggers `POST /api/admin/bootstrap-owner` with their Firebase ID token.
   - Node.js backend (`server.ts`) decodes the token payload, verifies the user's email against `process.env.INITIAL_OWNER_EMAIL` (defaulting to `alssaedy500@gmail.com`).
   - If matched, the server assigns `role: 'platform_owner'` in `userRoles/{uid}` (and persistent `.data/roles.json`), and writes an immutable entry to `auditLogs` with `action: 'OWNER_PROVISIONED'`.
   - If the email does not match, the server strictly returns `403 Forbidden` with an explanatory Arabic error message, blocking unauthorized role elevation.


---

## 3. Assessment & Exam Integrity Safeguards

1. **Answer Key Secrecy**:
   - Examination questions sent to the client contain only `id`, `stemArabic`, `stemEnglish`, and `options: [{ id, text }]`.
   - Correct answer options (`correctOptionId`) and question rationales are written exclusively to `questionAnswerKeys/{questionId}`.
   - Firestore security rules deny all client read access to `questionAnswerKeys`.
2. **Authoritative Expiration & Scoring**:
   - Attempt creation records server-verified `startedAt` and authoritative `expiresAt`.
   - Answers submitted past `expiresAt + graceBuffer` (30 seconds) are rejected.
   - Scoring occurs in memory within the trusted server environment, preventing client-side score falsification.
3. **Result Release Policies**:
   - `immediate`: Results released right after server scoring.
   - `after_close`: Results locked until `closesAt` passes.
   - `manual`: Results locked until released by University Admin.

---

## 4. Audit Trail Immobility
- `auditLogs` collection records all administrative mutations (role assignments, status changes, score publishing).
- Security rules enforce `allow update, delete: if false;` to guarantee immutability.
