# UMED Production Deployment & Operational Readiness Checklist

**Document Version:** 1.0.0  
**Target Platform:** UMED Yemen Medical Education Platform  
**Target Environments:** Vercel Serverless / Google Cloud Run / Node.js Express  

---

## 1. Pre-Deployment Verification Checklist

Before deploying changes to production, complete each item below:

| Status | Verification Item | Command / Reference | Expected Output |
|:---:|---|---|---|
| [x] | **TypeScript Validation** | `npm run lint` | `tsc --noEmit` exits with 0 errors. |
| [x] | **Production Bundle Build** | `npm run build` | `vite build` produces optimized `dist/` directory. |
| [x] | **Automated Security Tests** | `npm run test:security` | All 13 security and integrity test gates pass. |
| [x] | **Serverless Routing Configuration** | `vercel.json` | Valid JSON routing `/api/*` to `api/index.ts` and `/*` to `index.html`. |
| [x] | **Firestore Rules Audit** | `firestore.rules` | Default-deny, PII protection, admin-only results creation verified. |
| [x] | **Environment Variables Sync** | `.env.example` | All required `VITE_FIREBASE_*` and `INITIAL_OWNER_EMAIL` keys defined. |

---

## 2. Environment Variables Configuration

Ensure the following environment variables are set in the production deployment dashboard (e.g., Vercel Project Settings or Cloud Run Environment):

| Variable Name | Required | Description | Production Example |
|---|:---:|---|---|
| `INITIAL_OWNER_EMAIL` | **Yes** | Authorized Platform Owner email(s) | `alssaedy500@gmail.com, alssaedy50@gmail.com` |
| `VITE_FIREBASE_PROJECT_ID` | **Yes** | Firebase Project ID | `umed-yemen` |
| `VITE_FIREBASE_API_KEY` | **Yes** | Firebase Web API Key | `AIzaSyAAjo3PyRS5SzNL-PCE78T_wJkVaAANcSE` |
| `VITE_FIREBASE_AUTH_DOMAIN` | **Yes** | Firebase Auth Domain | `umed-yemen.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_ID` | **Yes** | Firestore Database ID | `(default)` |
| `VITE_FIREBASE_STORAGE_BUCKET` | **Yes** | Firebase Storage Bucket | `umed-yemen.firebasestorage.app` |
| `VITE_FIREBASE_APP_ID` | **Yes** | Firebase App ID | `1:471786641119:web:07dd516810d7d147ad7b6a` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | **Yes** | Messaging Sender ID | `471786641119` |
| `NODE_ENV` | Optional | Runtime Mode | `production` |
| `PORT` | Optional | Port for local/Cloud Run | `3000` |

---

## 3. Deployment Instructions

### Option A: Vercel Serverless Deployment
1. Connect repository `https://github.com/Alssaedy50/U_MED` to Vercel.
2. In Vercel Project Settings:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Configure all Environment Variables as listed in Section 2.
4. Deploy. Vercel automatically deploys `/api/index.ts` as a serverless function and maps all SPA routes to `index.html` via `vercel.json`.

### Option B: Google Cloud Run / Docker Container Deployment
1. Build the production bundle:
   ```bash
   npm run build
   ```
2. Start the production entry server:
   ```bash
   NODE_ENV=production node server.ts
   ```
   Or containerize using a standard Node.js 20+ image.

---

## 4. Post-Deployment Verification (Smoke Tests)

Immediately following a production deployment, perform these smoke tests:

1. **Health Verification:**
   ```bash
   curl -s https://<your-domain>/api/health | jq
   ```
   Assert: `status === "ok"`, `security.authVerification` is configured.

2. **Unauthenticated Access Rejection:**
   ```bash
   curl -i https://<your-domain>/api/admin/roles
   ```
   Assert: Returns `HTTP/1.1 401 Unauthorized`.

3. **Frontend Application Load:**
   - Open `https://<your-domain>/` in browser.
   - Confirm dark slate UI loads without white flash or missing icons.
   - Confirm Arabic RTL layout displays properly on mobile viewports (360px–412px).

4. **Platform Owner Sign-In & Verification:**
   - Sign in using `alssaedy50@gmail.com` or `alssaedy500@gmail.com`.
   - Confirm owner privileges are recognized and owner badge displays in the header.

5. **Backup & Snapshot Sanity Check:**
   - In Admin Console -> Backup & Restore, click "تصدير اللقطة السحابية الموثقة".
   - Confirm the downloaded JSON file contains `meta.checksum` with a valid 64-character SHA-256 string.

---

## 5. Rollback & Disaster Recovery Procedures

1. **Instant Cloud Rollback:**
   - In Vercel: navigate to Deployments -> select the last known healthy deployment -> click **Promote to Production**.
2. **Database State Recovery:**
   - Open Admin Console -> Backup & Restore Console.
   - Select the last verified `.json` backup file.
   - Verify SHA-256 integrity report.
   - Click "تأكيد وتنفيذ استعادة البيانات السحابية" to restore collections in 400-doc safe batches.
