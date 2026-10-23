# UMED Critical Remediation Plan: Security, Assessment Integrity & Reliability

**Document Version:** 1.0.0  
**Target System:** UMED Yemen Medical Education Platform  
**Repository:** https://github.com/Alssaedy50/U_MED  
**Classification:** Critical Security & Architectural Remediation  
**Scope:** Authentication, Authorization, Assessment Engine, Persistence, Backup/Restore, Deployment Configuration

---

## 1. Executive Summary & Assessment Overview

A comprehensive audit of the UMED medical education codebase identified critical security vulnerabilities and architectural gaps that could allow unauthorized administrative access, exam score tampering, credential spoofing, and data loss in serverless deployments.

This document details the remediation plan, categorizing defects by severity, specifying minimal surgical code changes, and outlining automated verification gates.

---

## 2. Inventory of Confirmed Defects & Vulnerabilities

| ID | Category | Severity | Location | Confirmed Defect | Remediation Strategy |
|---|---|---|---|---|---|
| **VULN-01** | Authentication | **CRITICAL** | `api/index.ts` (lines 156–175) | `decodeJwtPayload` decodes base64 payload without verifying cryptographic RSA signature or audience against Google's public certs. Any actor can forge a token with arbitrary claims. | Implement genuine RSA-SHA256 signature verification using Google's public x509 certificates endpoint, caching keys with TTL. Fail closed on invalid/unsigned tokens. |
| **VULN-02** | Authorization | **CRITICAL** | `api/index.ts` (lines 201–206, 233–236, 298–310) | Insecure caller fallback identity: Endpoints check `req.body.callerEmail`, `req.body.performedBy`, or `req.body.callerUid` when header is absent, allowing trivial privilege escalation without tokens. | Completely remove body-supplied caller identity fallbacks. Enforce centralized `requireAuth` and `requireRole` middleware. Strictly derive caller UID and email from verified token. |
| **VULN-03** | Authorization | **HIGH** | `firestore.rules` (lines 306–312) | Rule `allow create: if isAnyAdmin() || (isAuthenticated() && request.resource.data.uid == request.auth.uid)` in `assessmentResults` allows students to write arbitrary scores directly to Firestore. | Restrict `assessmentResults` write access strictly to `isAnyAdmin()`. Students cannot forge results; scoring must be server-authoritative. |
| **VULN-04** | Assessment Integrity | **HIGH** | `api/index.ts` (lines 570–671), `src/services/assessmentService.ts` | Server scoring does not enforce attempt deadline (`expiresAt`), allows arbitrary `questionIds` from request body, and lacks strict attempt capping against maxAttempts. | Enforce attempt deadline (`now <= expiresAt + gracePeriod`), grade strictly the `questionIds` stored on the attempt, and enforce `scoredAttemptsCount < maxAttempts`. |
| **VULN-05** | Assessment Confidentiality | **HIGH** | `api/index.ts` (lines 434–449) | Admin questions endpoint could be requested without strict admin token validation due to loose auth check. | Require verified admin bearer token for `/api/admin/questions` and ensure answer keys (`correctOptionId`, explanations) are never returned to student clients. |
| **VULN-06** | Data Persistence | **HIGH** | `api/index.ts` (lines 33–65) | Server routes store state in local JSON files (`.data` or `/tmp/umed_data`). In serverless environments (Vercel, Cloud Run), `/tmp` is wiped on cold restarts, losing roles and assessment submissions. | Align backend data models with Cloud Firestore as the persistent authority, keeping local in-memory caches synchronized and persisting critical records. |
| **VULN-07** | Backup / Restore Reliability | **MEDIUM** | `src/components/admin/BackupRestoreConsole.tsx` (lines 96, 219–228) | Checksum algorithm in export is placeholder text rather than a cryptographic hash. Single Firestore `writeBatch` without chunking crashes if total documents exceed 500 limit. | Implement Web Crypto SHA-256 digest on export/import, chunk batch writes into slices of 400 items, and enforce schema validation before restore. |
| **VULN-08** | Deployment Configuration | **MEDIUM** | Root directory | Missing `vercel.json` serverless routing configuration, which causes 404 on direct navigation to `/api/*` in Vercel deployments. | Create production-ready `vercel.json` with proper routing to `api/index.ts` and SPA fallback to `index.html`. |

---

## 3. Remediation Phasing & Implementation Steps

### Phase 1: Authentication & Authorization Hardening
1. Author `verifyFirebaseIdToken` function in `api/index.ts`:
   - Fetch public keys from `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`.
   - Cache keys honoring `Cache-Control: max-age`.
   - Verify RSA-SHA256 signature using Node `crypto`.
   - Verify claims: `aud === projectId`, `iss === 'https://securetoken.google.com/' + projectId`, `exp > now`, non-empty `sub`.
   - Support test signing token in test/dev environment while enforcing cryptographic verification.
2. Remove all `req.body.callerEmail` / `req.body.callerUid` / `req.body.performedBy` backdoors.
3. Apply `requireAuth` and `requireAdmin` middleware to all `/api/admin/*` routes.
4. Update `firestore.rules` to prevent students from writing directly to `assessmentResults`.

### Phase 2: Assessment Engine Integrity
1. In `api/index.ts` (`/api/assessments/submit-attempt`):
   - Retrieve stored attempt by `attemptId`.
   - Verify student ownership (`attempt.uid === caller.uid`).
   - Verify attempt is not expired (`now <= new Date(attempt.expiresAt).getTime() + 120_000`).
   - Grade strictly against questions stored in `attempt.questionIds`.
   - Verify student has not exceeded `maxAttempts`.
   - Return clean result, keeping answer keys secret.
2. In `src/services/assessmentService.ts`:
   - Ensure student submissions pass verified ID token in `Authorization: Bearer <token>`.
   - Keep student public question stems sanitized.

### Phase 3: Backup & Restore Reliability
1. In `src/components/admin/BackupRestoreConsole.tsx`:
   - Compute real SHA-256 digest of data payload using `crypto.subtle.digest('SHA-256', ...)`.
   - Store hash in `snapshot.meta.checksum`.
   - Validate checksum and schema before executing restore.
   - Chunk `writeBatch` operations into blocks of max 400 writes to prevent 500-operation Firestore batch overflow.

### Phase 4: Serverless Deployment & Configuration
1. Create `vercel.json` with builds and rewrites for both API functions and frontend SPA.
2. Verify `.env.example` documents all required parameters.

### Phase 5: Automated Security Verification & Testing
1. Create an automated test suite (`scripts/test-remediation.ts` or `scripts/verify-security.ts`) that runs via `npx tsx` and validates:
   - Token validation rejection of forged/expired tokens.
   - Privilege escalation rejection of body spoofing.
   - Assessment deadline and attempt capping enforcement.
   - SHA-256 checksum generation and verification.
   - Batch chunking calculation.
2. Execute TypeScript check (`npm run lint`) and Vite build (`npm run build`).

---

## 4. Verification Gates & Pass Criteria
- **Gate 1:** No unverified token or spoofed body parameter can access any `/api/admin/*` endpoint.
- **Gate 2:** Attempt submissions after deadline are rejected.
- **Gate 3:** Students cannot read answer keys or forge results in Firestore.
- **Gate 4:** Backups compute valid SHA-256 hashes and restore safely without 500-batch exceptions.
- **Gate 5:** Zero compilation errors (`npm run build` and `npm run lint` succeed).
