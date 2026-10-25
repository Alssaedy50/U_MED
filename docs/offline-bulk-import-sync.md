# UMED — Offline Bulk Question Import & Automatic Synchronization

## Overview
UMED provides an offline-first bulk MCQ import, review, validation, optional AI medical explanation, and automatic cloud synchronization system integrated directly into the Question Bank & Assessment console (`AssessmentManager.tsx`).

## Architecture & Data Flow

1. **Deterministic Bulk Parser (`src/services/mcqBulkParser.ts`)**:
   - **Zero-AI Dependency**: Parses bulk MCQs locally in the browser with 0ms network latency.
   - **Supported Formats**:
     - Structured/free-form Arabic & English text (`1.`, `س1:`, `Q1:`, Aiken format).
     - Answer detection via explicit lines (`الإجابة: ب`, `ANSWER: B`), inline markers (`*`, `✓`, `(صحيح)`), or trailing answer-key tables at the end of a document.
     - Spreadsheets (`CSV` / `TSV`) and structured `JSON` arrays/objects.
   - **Validation & Deduplication**:
     - Computes a deterministic 64-bit FNV-1a content fingerprint (`contentHash`) from normalized question stem and options.
     - Flags missing stems, insufficient options (< 2), duplicate options, missing correct answers, intra-batch duplicates, and duplicates against existing questions in the target bank.

2. **Complete Offline Persistence & Outbox Engine (`src/services/questionImportSyncService.ts`)**:
   - **IndexedDB (`umed_offline_questions_db`) + `localStorage` Mirror**:
     - `import_drafts`: Automatically saves active bulk-import review sessions on every keystroke so work survives refreshes, tab closures, and browser restarts while offline.
     - `bank_questions`: Stores full bank questions locally for instant offline access.
     - `question_outbox`: Durable FIFO queue of pending `upsert` and `delete` operations.
   - **Automatic Cloud Synchronization**:
     - Listens to `window.addEventListener('online')`, `visibilitychange`, and periodic background heartbeats to flush pending outbox entries to Cloud Firestore (`questions`, `assessmentQuestions`, `questionAnswerKeys`) and `/api/admin/sync-assessment-questions`.
     - Uses deterministic IDs (`q-${bankId}-${contentHash}`) and `updatedAt` timestamp comparison so repeated imports or interrupted requests never create duplicate records or overwrite newer edits.
     - Authorized users receive live updates via Firestore `onSnapshot` (`subscribeToBankQuestions`).

3. **Security & Answer-Key Isolation**:
   - `sanitizePublicQuestion()` strips `correctOptionId`, `explanationArabic`, `explanationEnglish`, and `optionExplanations` before writing to `assessmentQuestions/{id}`.
   - Confidential answer keys and explanations are stored exclusively in `questions/{id}`, `questionAnswerKeys/{id}`, and the server grading store.

4. **Optional AI Medical Explanations (`POST /api/admin/generate-mcq-explanations`)**:
   - Completely optional server-side tool powered by `@google/genai` (`gemini-3.8-flash`) and protected by `requireAdmin`.
   - Generates concise Arabic medical explanations for why the user-supplied answer is correct and why distractors are wrong.
   - **Strict Invariant**: Never modifies `correctOptionId` supplied by the user, and retains `originalExplanationArabic` for one-click revert in the review UI.
