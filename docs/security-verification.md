# UMED Security Verification & Threat Defense Guide

**Document Version:** 1.0.0  
**Target Platform:** UMED Yemen Medical Education Platform  
**Classification:** Technical Security Reference  

---

## 1. Overview & Threat Defense Architecture

This document outlines the security architecture, threat model, and verification procedures implemented to defend the UMED platform against tampering, privilege escalation, and assessment fraud.

The UMED platform operates under a **zero-trust, fail-closed** paradigm where client inputs are never assumed authentic unless cryptographically validated by Google's public identity infrastructure or authorized server stores.

---

## 2. Threat Models & Attack Vectors Addressed

### Threat 1: Token Forgery / Alg=None / Signature Stripping
- **Attack Vector:** An attacker constructs a JWT containing claims such as `role: "platform_owner"` and signs it with a forged key or sends it unsigned (`alg: "none"`).
- **Defense Mechanism:**
  - `verifyFirebaseIdToken` in `api/index.ts` enforces `header.alg === 'RS256'` and `header.kid != null`.
  - The token's header `kid` is matched against public x509 certificates freshly retrieved from Google's canonical cert endpoint:
    `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`.
  - Signature is verified using Node's `crypto.createVerify('RSA-SHA256')`.
  - Tokens without valid signatures or using unsupported algorithms are rejected with HTTP 401.

### Threat 2: Caller Identity Spoofing in Request Body
- **Attack Vector:** An unauthenticated caller sends requests to `/api/admin/bootstrap-owner` or `/api/admin/assign-role` supplying `callerEmail: "alssaedy50@gmail.com"` in the JSON body without a Bearer token.
- **Defense Mechanism:**
  - Body-supplied caller attributes (`req.body.callerEmail`, `req.body.callerUid`, `req.body.performedBy`) have been completely eradicated from authorization decisions.
  - Caller identity is derived exclusively from `req.user`, which is set by the cryptographically verified token in `requireAuth` middleware.

### Threat 3: Direct Client Result Forgery in Firestore
- **Attack Vector:** A compromised student client calls `setDoc(doc(db, 'assessmentResults', id), { score: 100, percentage: 100 })` directly to Firestore.
- **Defense Mechanism:**
  - `firestore.rules` restricts write access on `/assessmentResults/{resultId}` exclusively to `isAnyAdmin()`.
  - Students cannot create or update result documents.
  - Scores are calculated server-authoritatively by `/api/assessments/submit-attempt` using server-authoritative answer keys.

### Threat 4: Post-Deadline Exam Submission & Attempt Inflation
- **Attack Vector:** A student attempts to submit exam answers after the timer expires, or submits multiple times beyond `maxAttempts`.
- **Defense Mechanism:**
  - In `/api/assessments/submit-attempt`, the server checks `attempt.expiresAt`. If `Date.now() > expiresAt + 120_000ms`, the submission is rejected with HTTP 403.
  - In `/api/assessments/start-attempt`, previous scored attempts for the student are counted. If `scoredCount >= maxAttempts`, starting a new attempt is blocked.
  - In addition, the submission endpoint is strictly idempotent: once an attempt is scored, subsequent submissions return the original scored result without re-grading.

### Threat 5: Answer Key Exposure (Cheating Prevention)
- **Attack Vector:** A student inspects network responses or client state during an active exam to extract correct options.
- **Defense Mechanism:**
  - Questions served to students via `/api/assessments/start-attempt` and Firestore `/assessmentQuestions` contain only `id`, `bankId`, `stemArabic`, `stemEnglish`, `imageUrl`, `options`, and `points`.
  - `correctOptionId` and `explanationArabic` are stripped and kept only in `/api/admin/questions` and protected Firestore collection `/questionAnswerKeys` (accessible only by `isAnyAdmin()`).

### Threat 6: Backup Snapshot Poisoning & Batch Overflow
- **Attack Vector:** An attacker alters academic records in an exported backup JSON before restoring it, or restores a large dataset that causes a 500-write Firestore crash.
- **Defense Mechanism:**
  - Every exported snapshot computes a SHA-256 digest of the entire data payload.
  - On import, the hash is recomputed and compared against `meta.checksum`. Tampered payloads are rejected.
  - Restorations split writes into chunks of 400 operations, well beneath Firestore's 500-operation limit.

---

## 3. Verification Commands & Recipes

### 3.1 Automated Verification Suite
Run the test suite at any time from the workspace root:
```bash
npm run test:security
```
This tests all 13 security gates and asserts expected HTTP status codes.

### 3.2 Manual HTTP Verification using cURL

#### Health Check:
```bash
curl -s http://localhost:3000/api/health | jq
```
Expected output includes:
```json
{
  "status": "ok",
  "security": {
    "authVerification": "RSA-SHA256 Google x509 Public Key Grounding",
    "rbacEnforcement": "Strict Server-Side Middleware",
    "assessmentAuthoritativeGrading": "Server Store Only",
    "answerKeysSanitized": true
  }
}
```

#### Verification of Unauthenticated Rejection:
```bash
curl -i -X GET http://localhost:3000/api/admin/roles
# Response: HTTP/1.1 401 Unauthorized
```

#### Verification of Body Spoof Rejection:
```bash
curl -i -X POST http://localhost:3000/api/admin/bootstrap-owner \
  -H "Content-Type: application/json" \
  -d '{"email":"alssaedy50@gmail.com","uid":"spoofed-uid"}'
# Response: HTTP/1.1 401 Unauthorized
```

#### Verification of Protected Questions Secrecy:
```bash
curl -i -X GET http://localhost:3000/api/admin/questions
# Response: HTTP/1.1 401 Unauthorized
```

---

## 4. Key Rotation & Caching Policy
- Google's x509 public certificates rotate periodically. The cache in `api/index.ts` honors the HTTP `Cache-Control: max-age` response header (typically 1 to 6 hours).
- If Google's cert endpoint is temporarily unreachable, the server continues using cached certs until connectivity is restored.
