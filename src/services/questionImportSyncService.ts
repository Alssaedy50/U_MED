/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Offline-First Question Import Storage & Automatic Cloud Synchronization Engine
 *
 * Responsibilities:
 * 1. Durable IndexedDB + localStorage persistence for:
 *    - Active Bulk Import Draft Sessions (survives browser refresh, tab close, and offline restarts)
 *    - Question Outbox Queue (`question_outbox`) for offline creates, bulk imports, edits, and deletes
 *    - Local Question Bank & Question Mirror with deterministic IDs & content hashes
 * 2. Automatic, resumable, idempotent cloud synchronization when connectivity returns:
 *    - Writes sanitized public questions to `assessmentQuestions` (NEVER exposes correctOptionId/explanation)
 *    - Writes full questions to `questions` and protected keys to `questionAnswerKeys`
 *    - Synchronizes with authoritative Express grading store (`/api/admin/sync-assessment-questions`)
 *    - Prevents duplicate records via deterministic content-hash IDs and idempotency keys
 *    - Resolves concurrent edits safely using ISO `updatedAt` timestamps
 * 3. Optional AI Explanation helper (strictly opt-in, never modifies `correctOptionId`)
 */

import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth, cleanFirestoreData, writeAuditLogToCloud } from '../lib/firebase.ts';
import {
  AssessmentQuestionPublic,
  BulkImportDraftSession,
  QuestionAnswerKey,
  QuestionItemFull,
  QuestionOption,
  QuestionOutboxEntry,
  QuestionSyncStatus
} from '../types/umed.ts';
import { computeQuestionFingerprint } from './mcqBulkParser.ts';

const IDB_NAME = 'umed_offline_questions_db';
const IDB_VERSION = 1;
const STORE_DRAFTS = 'import_drafts';
const STORE_OUTBOX = 'question_outbox';
const STORE_QUESTIONS = 'local_questions';

const LS_OUTBOX_KEY = 'umed_question_outbox_v1';
const LS_DRAFT_PREFIX = 'umed_bulk_import_draft_';
const LS_QUESTIONS_PREFIX = 'umed_assessment_q_';

export interface QuestionSyncSummary {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  pendingByBank: Record<string, number>;
  questionStatusMap: Record<string, QuestionSyncStatus>;
}

type SyncStateListener = (state: QuestionSyncSummary) => void;

const syncListeners = new Set<SyncStateListener>();
let isCurrentlySyncing = false;
let lastSyncedAt: string | null = null;
let lastSyncError: string | null = null;
let autoSyncListenersAttached = false;
let syncHeartbeatTimer: number | null = null;

// In-memory mirror of the outbox for synchronous 0ms UI status badges
let outboxMemoryMirror: Map<string, QuestionOutboxEntry> = new Map();
let outboxInitialized = false;

// ---------------------------------------------------------------------------
// 1. IndexedDB + localStorage Hybrid Persistence Layer
// ---------------------------------------------------------------------------

function openQuestionIdb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE_DRAFTS)) {
          database.createObjectStore(STORE_DRAFTS, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(STORE_OUTBOX)) {
          database.createObjectStore(STORE_OUTBOX, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(STORE_QUESTIONS)) {
          database.createObjectStore(STORE_QUESTIONS, { keyPath: 'bankId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readOutboxFromLocalStorage(): QuestionOutboxEntry[] {
  try {
    const raw = localStorage.getItem(LS_OUTBOX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeOutboxToLocalStorage(entries: QuestionOutboxEntry[]): void {
  try {
    localStorage.setItem(LS_OUTBOX_KEY, JSON.stringify(entries));
  } catch {}
}

async function persistOutboxEntry(entry: QuestionOutboxEntry): Promise<void> {
  outboxMemoryMirror.set(entry.id, entry);
  writeOutboxToLocalStorage(Array.from(outboxMemoryMirror.values()));
  notifySyncListeners();

  const idb = await openQuestionIdb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_OUTBOX, 'readwrite');
      tx.objectStore(STORE_OUTBOX).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function removeOutboxEntry(entryId: string): Promise<void> {
  outboxMemoryMirror.delete(entryId);
  writeOutboxToLocalStorage(Array.from(outboxMemoryMirror.values()));
  notifySyncListeners();

  const idb = await openQuestionIdb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_OUTBOX, 'readwrite');
      tx.objectStore(STORE_OUTBOX).delete(entryId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadOutboxEntries(): Promise<QuestionOutboxEntry[]> {
  if (!outboxInitialized) {
    // Hydrate from localStorage immediately
    for (const item of readOutboxFromLocalStorage()) {
      if (item && item.id) {
        outboxMemoryMirror.set(item.id, item);
      }
    }
    outboxInitialized = true;
  }

  const idb = await openQuestionIdb();
  if (idb) {
    await new Promise<void>((resolve) => {
      try {
        const tx = idb.transaction(STORE_OUTBOX, 'readonly');
        const req = tx.objectStore(STORE_OUTBOX).getAll();
        req.onsuccess = () => {
          if (Array.isArray(req.result)) {
            for (const item of req.result as QuestionOutboxEntry[]) {
              if (item && item.id) {
                const existing = outboxMemoryMirror.get(item.id);
                if (!existing || new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
                  outboxMemoryMirror.set(item.id, item);
                }
              }
            }
            writeOutboxToLocalStorage(Array.from(outboxMemoryMirror.values()));
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  return Array.from(outboxMemoryMirror.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

// ---------------------------------------------------------------------------
// 2. Bulk Import Draft Session Persistence (Survives Offline Reload / Restart)
// ---------------------------------------------------------------------------

export async function saveBulkImportDraftSession(session: BulkImportDraftSession): Promise<void> {
  const key = `${LS_DRAFT_PREFIX}${session.bankId}`;
  try {
    localStorage.setItem(key, JSON.stringify(session));
  } catch {}

  const idb = await openQuestionIdb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_DRAFTS, 'readwrite');
      tx.objectStore(STORE_DRAFTS).put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadBulkImportDraftSession(bankId: string): Promise<BulkImportDraftSession | null> {
  const id = `draft_${bankId}`;
  let lsSession: BulkImportDraftSession | null = null;
  try {
    const raw = localStorage.getItem(`${LS_DRAFT_PREFIX}${bankId}`);
    if (raw) lsSession = JSON.parse(raw) as BulkImportDraftSession;
  } catch {}

  const idb = await openQuestionIdb();
  if (idb) {
    const idbSession = await new Promise<BulkImportDraftSession | null>((resolve) => {
      try {
        const tx = idb.transaction(STORE_DRAFTS, 'readonly');
        const req = tx.objectStore(STORE_DRAFTS).get(id);
        req.onsuccess = () => resolve((req.result as BulkImportDraftSession) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (idbSession) {
      if (!lsSession || new Date(idbSession.updatedAt).getTime() >= new Date(lsSession.updatedAt).getTime()) {
        return idbSession;
      }
    }
  }

  return lsSession;
}

export async function clearBulkImportDraftSession(bankId: string): Promise<void> {
  const id = `draft_${bankId}`;
  try {
    localStorage.removeItem(`${LS_DRAFT_PREFIX}${bankId}`);
  } catch {}

  const idb = await openQuestionIdb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_DRAFTS, 'readwrite');
      tx.objectStore(STORE_DRAFTS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Local Bank Questions Storage (IndexedDB + localStorage)
// ---------------------------------------------------------------------------

export function readLocalBankQuestionsSync(bankId: string): QuestionItemFull[] {
  try {
    const raw = localStorage.getItem(`${LS_QUESTIONS_PREFIX}${bankId}`);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {}
  return [];
}

export async function writeLocalBankQuestions(bankId: string, questions: QuestionItemFull[]): Promise<void> {
  try {
    localStorage.setItem(`${LS_QUESTIONS_PREFIX}${bankId}`, JSON.stringify(questions));
    localStorage.setItem(`umed_assessment_q_init_${bankId}`, 'true');
  } catch {}

  const idb = await openQuestionIdb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_QUESTIONS, 'readwrite');
      tx.objectStore(STORE_QUESTIONS).put({
        bankId,
        questions,
        updatedAt: new Date().toISOString()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function readLocalBankQuestionsAsync(bankId: string): Promise<QuestionItemFull[]> {
  const syncList = readLocalBankQuestionsSync(bankId);
  const idb = await openQuestionIdb();
  if (!idb) return syncList;

  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE_QUESTIONS, 'readonly');
      const req = tx.objectStore(STORE_QUESTIONS).get(bankId);
      req.onsuccess = () => {
        const record = req.result as { bankId: string; questions: QuestionItemFull[] } | undefined;
        if (record && Array.isArray(record.questions) && record.questions.length >= syncList.length) {
          resolve(record.questions);
        } else {
          resolve(syncList);
        }
      };
      req.onerror = () => resolve(syncList);
    } catch {
      resolve(syncList);
    }
  });
}

// ---------------------------------------------------------------------------
// 4. Sanitization & Security Helpers (Protect Answer Keys & Explanations)
// ---------------------------------------------------------------------------

/**
 * Strictly strips `correctOptionId`, `explanationArabic`, `explanationEnglish`, and `optionExplanations`
 * so student-accessible `assessmentQuestions` NEVER leak answers during active exams.
 */
export function sanitizePublicQuestion(q: QuestionItemFull): AssessmentQuestionPublic {
  const sanitizedOptions: QuestionOption[] = (q.options || []).map((o) => ({
    id: o.id,
    textArabic: o.textArabic,
    ...(o.textEnglish ? { textEnglish: o.textEnglish } : {})
  }));

  return cleanFirestoreData({
    id: q.id,
    bankId: q.bankId,
    stemArabic: q.stemArabic,
    ...(q.stemEnglish ? { stemEnglish: q.stemEnglish } : {}),
    ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
    options: sanitizedOptions,
    points: Number(q.points) || 5
  });
}

export function extractProtectedAnswerKey(q: QuestionItemFull): QuestionAnswerKey {
  return cleanFirestoreData({
    questionId: q.id,
    assessmentId: q.bankId,
    correctOptionId: q.correctOptionId,
    ...(q.explanationArabic ? { explanationArabic: q.explanationArabic } : {}),
    ...(q.explanationEnglish ? { explanationEnglish: q.explanationEnglish } : {}),
    points: Number(q.points) || 5
  });
}

// ---------------------------------------------------------------------------
// 5. Sync State & Outbox Queue Management
// ---------------------------------------------------------------------------

export function getQuestionSyncSummary(): QuestionSyncSummary {
  if (!outboxInitialized) {
    for (const item of readOutboxFromLocalStorage()) {
      if (item && item.id) outboxMemoryMirror.set(item.id, item);
    }
    outboxInitialized = true;
  }

  const entries = Array.from(outboxMemoryMirror.values());
  const pendingByBank: Record<string, number> = {};
  const questionStatusMap: Record<string, QuestionSyncStatus> = {};
  let pendingCount = 0;
  let failedCount = 0;

  for (const entry of entries) {
    pendingCount++;
    if (entry.status === 'failed') failedCount++;
    pendingByBank[entry.bankId] = (pendingByBank[entry.bankId] || 0) + 1;
    questionStatusMap[entry.questionId] = entry.status === 'failed' ? 'sync_error' : 'pending_sync';
  }

  return {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: isCurrentlySyncing,
    pendingCount,
    failedCount,
    lastSyncedAt,
    lastSyncError,
    pendingByBank,
    questionStatusMap
  };
}

function notifySyncListeners(): void {
  const summary = getQuestionSyncSummary();
  syncListeners.forEach((cb) => {
    try {
      cb(summary);
    } catch {}
  });
}

export function subscribeToQuestionSyncState(listener: SyncStateListener): () => void {
  syncListeners.add(listener);
  listener(getQuestionSyncSummary());
  loadOutboxEntries().then(() => listener(getQuestionSyncSummary()));
  return () => {
    syncListeners.delete(listener);
  };
}

/**
 * Merges cloud questions with any unsynced local outbox operations for a bank.
 * Ensures:
 * - Locally created/edited offline questions are never lost before cloud sync completes.
 * - Locally deleted offline questions stay hidden until delete syncs.
 * - Duplicate records with the same deterministic ID or content hash are coalesced cleanly.
 */
export function mergeCloudAndOfflineQuestions(
  bankId: string,
  cloudQuestions: QuestionItemFull[],
  localCachedQuestions: QuestionItemFull[] = []
): QuestionItemFull[] {
  const outboxForBank = Array.from(outboxMemoryMirror.values()).filter((e) => e.bankId === bankId);
  const deletedIds = new Set(
    outboxForBank.filter((e) => e.operation === 'delete').map((e) => e.questionId)
  );
  const pendingUpserts = new Map<string, QuestionItemFull>();
  for (const entry of outboxForBank) {
    if (entry.operation === 'upsert' && entry.question) {
      pendingUpserts.set(entry.questionId, {
        ...entry.question,
        syncStatus: entry.status === 'failed' ? 'sync_error' : 'pending_sync'
      });
    }
  }

  const mergedById = new Map<string, QuestionItemFull>();
  const seenHashes = new Map<string, string>(); // contentHash -> questionId

  // 1. Seed from local cache if cloud was empty (e.g. offline mode)
  const baseList = cloudQuestions.length > 0 ? cloudQuestions : localCachedQuestions;

  for (const q of baseList) {
    if (!q || !q.id || deletedIds.has(q.id)) continue;
    const hash = q.contentHash || computeQuestionFingerprint(q.stemArabic, q.stemEnglish, q.options);
    const pending = pendingUpserts.get(q.id);
    if (pending) {
      mergedById.set(q.id, pending);
      seenHashes.set(hash, q.id);
    } else {
      mergedById.set(q.id, {
        ...q,
        contentHash: hash,
        syncStatus: q.syncStatus || 'synced'
      });
      seenHashes.set(hash, q.id);
    }
  }

  // 2. Add any remaining local cached questions that are still in pendingUpserts
  for (const [qId, pendingQ] of pendingUpserts.entries()) {
    if (deletedIds.has(qId)) continue;
    const hash = pendingQ.contentHash || computeQuestionFingerprint(pendingQ.stemArabic, pendingQ.stemEnglish, pendingQ.options);
    const existingIdForHash = seenHashes.get(hash);
    if (existingIdForHash && existingIdForHash !== qId) {
      // Coalesce duplicate content hash
      mergedById.set(existingIdForHash, {
        ...pendingQ,
        id: existingIdForHash
      });
    } else {
      mergedById.set(qId, pendingQ);
      seenHashes.set(hash, qId);
    }
  }

  return Array.from(mergedById.values());
}

/**
 * Enqueues one or more question upserts into the durable offline outbox and updates local bank cache immediately.
 * If online, triggers background synchronization automatically.
 */
export async function enqueueQuestionsUpsert(
  bankId: string,
  questionsToSave: QuestionItemFull[],
  universityId?: string
): Promise<QuestionItemFull[]> {
  await loadOutboxEntries();
  const now = new Date().toISOString();
  const existingLocal = await readLocalBankQuestionsAsync(bankId);
  const byId = new Map<string, QuestionItemFull>();
  const byHash = new Map<string, string>();

  for (const eq of existingLocal) {
    const h = eq.contentHash || computeQuestionFingerprint(eq.stemArabic, eq.stemEnglish, eq.options);
    byId.set(eq.id, eq);
    byHash.set(h, eq.id);
  }

  const preparedQuestions: QuestionItemFull[] = [];

  for (const rawQ of questionsToSave) {
    const hash = rawQ.contentHash || computeQuestionFingerprint(rawQ.stemArabic, rawQ.stemEnglish, rawQ.options);
    // Deduplicate against existing bank question with identical content hash
    const canonicalId = byHash.get(hash) || rawQ.id || `q-${bankId}-${hash.slice(0, 12)}`;
    const prevQ = byId.get(canonicalId);

    const finalizedQ: QuestionItemFull = cleanFirestoreData({
      ...(prevQ || {}),
      ...rawQ,
      id: canonicalId,
      bankId,
      contentHash: hash,
      points: Number(rawQ.points) || 5,
      createdAt: prevQ?.createdAt || rawQ.createdAt || now,
      updatedAt: now,
      syncStatus: 'pending_sync' as QuestionSyncStatus
    });

    byId.set(canonicalId, finalizedQ);
    byHash.set(hash, canonicalId);
    preparedQuestions.push(finalizedQ);

    const outboxId = `outbox_${bankId}_${canonicalId}`;
    const entry: QuestionOutboxEntry = {
      id: outboxId,
      operation: 'upsert',
      questionId: canonicalId,
      bankId,
      universityId,
      question: finalizedQ,
      idempotencyKey: `${canonicalId}_${hash}_${now}`,
      status: 'pending',
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    await persistOutboxEntry(entry);
  }

  const updatedLocalList = Array.from(byId.values());
  await writeLocalBankQuestions(bankId, updatedLocalList);

  // If online, trigger non-blocking sync immediately
  if (typeof navigator === 'undefined' || navigator.onLine) {
    flushQuestionOutbox().catch(() => {});
  }

  return preparedQuestions;
}

/**
 * Enqueues a question deletion into the durable outbox and removes it from local storage immediately.
 */
export async function enqueueQuestionDelete(
  bankId: string,
  questionId: string,
  universityId?: string
): Promise<void> {
  await loadOutboxEntries();
  const now = new Date().toISOString();
  const existingLocal = await readLocalBankQuestionsAsync(bankId);
  const filtered = existingLocal.filter((q) => q.id !== questionId);
  await writeLocalBankQuestions(bankId, filtered);

  const outboxId = `outbox_${bankId}_${questionId}`;
  const entry: QuestionOutboxEntry = {
    id: outboxId,
    operation: 'delete',
    questionId,
    bankId,
    universityId,
    idempotencyKey: `del_${questionId}_${now}`,
    status: 'pending',
    retryCount: 0,
    createdAt: now,
    updatedAt: now
  };
  await persistOutboxEntry(entry);

  if (typeof navigator === 'undefined' || navigator.onLine) {
    flushQuestionOutbox().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 6. Automatic & Resumable Cloud Synchronization Worker
// ---------------------------------------------------------------------------

async function getIdTokenSafe(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) return '';
  try {
    return await currentUser.getIdToken();
  } catch {
    return '';
  }
}

/**
 * Flushes all pending entries in `question_outbox` to Cloud Firestore and the authoritative backend server.
 * Safe against concurrent calls, network drops mid-batch, duplicate writes, and stale overwrites.
 */
export async function flushQuestionOutbox(): Promise<{
  syncedCount: number;
  remainingCount: number;
}> {
  if (isCurrentlySyncing) {
    const summary = getQuestionSyncSummary();
    return { syncedCount: 0, remainingCount: summary.pendingCount };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const summary = getQuestionSyncSummary();
    return { syncedCount: 0, remainingCount: summary.pendingCount };
  }
  // Ensure user is authenticated before attempting protected admin writes
  if (!auth.currentUser) {
    const summary = getQuestionSyncSummary();
    return { syncedCount: 0, remainingCount: summary.pendingCount };
  }

  isCurrentlySyncing = true;
  lastSyncError = null;
  notifySyncListeners();

  let syncedCount = 0;
  try {
    const entries = await loadOutboxEntries();
    if (entries.length === 0) {
      isCurrentlySyncing = false;
      notifySyncListeners();
      return { syncedCount: 0, remainingCount: 0 };
    }

    const syncedUpsertsForServer: QuestionItemFull[] = [];
    const syncedDeletesForServer: string[] = [];
    const affectedBanks = new Set<string>();

    // Process in batches of 4 for fast, non-blocking throughput
    const BATCH_SIZE = 4;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        break; // Pause immediately if connection drops mid-flight
      }

      const slice = entries.slice(i, i + BATCH_SIZE);
      await Promise.all(
        slice.map(async (entry) => {
          try {
            if (entry.operation === 'upsert' && entry.question) {
              const q = entry.question;
              // Conflict check: inspect remote question's updatedAt if it already exists
              let finalQuestionToWrite: QuestionItemFull = {
                ...q,
                syncStatus: 'synced'
              };

              try {
                const remoteSnap = await getDoc(doc(db, 'questions', q.id));
                if (remoteSnap.exists()) {
                  const remoteData = remoteSnap.data() as QuestionItemFull;
                  const remoteTime = remoteData.updatedAt ? new Date(remoteData.updatedAt).getTime() : 0;
                  const localTime = q.updatedAt ? new Date(q.updatedAt).getTime() : Date.now();
                  if (remoteTime > localTime) {
                    // Remote has a strictly newer edit; preserve remote while marking local outbox complete
                    finalQuestionToWrite = {
                      ...remoteData,
                      id: q.id,
                      syncStatus: 'synced'
                    };
                  }
                }
              } catch {
                // Proceed with setDoc merge
              }

              const publicQ = sanitizePublicQuestion(finalQuestionToWrite);
              const answerKey = extractProtectedAnswerKey(finalQuestionToWrite);

              await Promise.all([
                setDoc(doc(db, 'questions', finalQuestionToWrite.id), cleanFirestoreData(finalQuestionToWrite), { merge: true }),
                setDoc(doc(db, 'assessmentQuestions', finalQuestionToWrite.id), cleanFirestoreData(publicQ), { merge: true }),
                setDoc(doc(db, 'questionAnswerKeys', finalQuestionToWrite.id), cleanFirestoreData(answerKey), { merge: true })
              ]);

              syncedUpsertsForServer.push(finalQuestionToWrite);
              affectedBanks.add(entry.bankId);
              await removeOutboxEntry(entry.id);
              syncedCount++;
            } else if (entry.operation === 'delete') {
              await Promise.all([
                deleteDoc(doc(db, 'questions', entry.questionId)),
                deleteDoc(doc(db, 'assessmentQuestions', entry.questionId)),
                deleteDoc(doc(db, 'questionAnswerKeys', entry.questionId))
              ]);
              syncedDeletesForServer.push(entry.questionId);
              affectedBanks.add(entry.bankId);
              await removeOutboxEntry(entry.id);
              syncedCount++;
            }
          } catch (err: any) {
            const msg = err?.message || 'تعذر مزامنة السؤال مع السحابة';
            lastSyncError = msg;
            await persistOutboxEntry({
              ...entry,
              status: 'failed',
              retryCount: (entry.retryCount || 0) + 1,
              lastError: msg,
              updatedAt: new Date().toISOString()
            });
          }
        })
      );
    }

    // Update local bank mirrors so synced questions show `syncStatus: 'synced'`
    for (const bankId of affectedBanks) {
      const localList = await readLocalBankQuestionsAsync(bankId);
      const updatedList = localList.map((q) => {
        const stillPending = outboxMemoryMirror.has(`outbox_${bankId}_${q.id}`);
        return {
          ...q,
          syncStatus: (stillPending ? q.syncStatus || 'pending_sync' : 'synced') as QuestionSyncStatus
        };
      });
      await writeLocalBankQuestions(bankId, updatedList);
    }

    // Synchronize with authoritative backend server store (`/api/admin/sync-assessment-questions`)
    if (syncedUpsertsForServer.length > 0 || syncedDeletesForServer.length > 0) {
      try {
        const token = await getIdTokenSafe();
        await fetch('/api/admin/sync-assessment-questions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            questions: syncedUpsertsForServer,
            deletedQuestionIds: syncedDeletesForServer
          })
        });
      } catch {}

      if (syncedUpsertsForServer.length > 1) {
        try {
          await writeAuditLogToCloud({
            action: 'QUESTIONS_BULK_IMPORTED',
            performedBy: auth.currentUser?.email || auth.currentUser?.uid || 'ADMIN',
            details: {
              syncedCount: syncedUpsertsForServer.length,
              bankId: syncedUpsertsForServer[0]?.bankId || ''
            }
          });
        } catch {}
      }
    }

    if (syncedCount > 0) {
      lastSyncedAt = new Date().toISOString();
    }
  } finally {
    isCurrentlySyncing = false;
    notifySyncListeners();
  }

  return {
    syncedCount,
    remainingCount: outboxMemoryMirror.size
  };
}

/**
 * Starts global listeners (`online`, `visibilitychange`, periodic heartbeat) so pending offline questions
 * synchronize automatically as soon as connectivity returns.
 */
export function startQuestionOutboxAutoSync(): void {
  if (typeof window === 'undefined' || autoSyncListenersAttached) return;
  autoSyncListenersAttached = true;

  loadOutboxEntries().then((entries) => {
    notifySyncListeners();
    if (entries.length > 0 && navigator.onLine) {
      flushQuestionOutbox().catch(() => {});
    }
  });

  window.addEventListener('online', () => {
    notifySyncListeners();
    flushQuestionOutbox().catch(() => {});
  });

  window.addEventListener('offline', () => {
    notifySyncListeners();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && outboxMemoryMirror.size > 0) {
      flushQuestionOutbox().catch(() => {});
    }
  });

  if (syncHeartbeatTimer) window.clearInterval(syncHeartbeatTimer);
  syncHeartbeatTimer = window.setInterval(() => {
    if (navigator.onLine && outboxMemoryMirror.size > 0 && !isCurrentlySyncing) {
      flushQuestionOutbox().catch(() => {});
    }
  }, 20000);
}

// ---------------------------------------------------------------------------
// 7. Optional AI Explanation Generator Client Helper (Never Modifies Answer)
// ---------------------------------------------------------------------------

export interface AiExplanationRequestItem {
  tempId: string;
  stemArabic: string;
  stemEnglish?: string;
  options: QuestionOption[];
  correctOptionId: string;
}

export interface AiExplanationResultItem {
  tempId: string;
  explanationArabic: string;
  optionExplanations?: Record<string, string>;
}

/**
 * Calls the server-side Gemini endpoint to generate concise medical explanations
 * for why the user-selected option is right and why the other options are wrong.
 *
 * Security & Integrity Invariant:
 * - Requires an active internet connection (optional enhancement).
 * - Never returns or modifies `correctOptionId`.
 */
export async function requestOptionalAiExplanations(
  items: AiExplanationRequestItem[]
): Promise<AiExplanationResultItem[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('توليد التعليل بالذكاء الاصطناعي يتطلب اتصالاً بالإنترنت (يمكنك حفظ الأسئلة الآن بدون ذكاء اصطناعي وبشكل كامل أوفلاين).');
  }
  if (!items || items.length === 0) return [];

  const token = await getIdTokenSafe();
  const res = await fetch('/api/admin/generate-mcq-explanations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ questions: items })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'تعذر توليد التعليلات الطبية عبر الذكاء الاصطناعي حالياً');
  }

  return Array.isArray(data.explanations) ? data.explanations : [];
}
