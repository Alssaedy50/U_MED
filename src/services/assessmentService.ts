/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Assessment, Examination & Competition Engine Service
 * Yemen-First Medical Education Platform (UMED)
 * Full Firestore + Serverless API Hybrid Persistence with Protected Server-Side Answer Keys
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  onSnapshot
} from 'firebase/firestore';
import { db, auth, writeAuditLogToCloud, cleanFirestoreData } from '../lib/firebase.ts';
import { 
  QuestionBank, 
  QuestionItemFull, 
  AssessmentQuestionPublic, 
  QuestionAnswerKey,
  Assessment, 
  AssessmentAttempt, 
  AssessmentResult, 
  AssessmentType,
  AssessmentStatus,
  ParsedQuestionDraft
} from '../types/umed.ts';
import { computeQuestionFingerprint } from './mcqBulkParser.ts';
import {
  enqueueQuestionsUpsert,
  enqueueQuestionDelete,
  mergeCloudAndOfflineQuestions,
  readLocalBankQuestionsAsync,
  writeLocalBankQuestions,
  startQuestionOutboxAutoSync,
  flushQuestionOutbox,
  sanitizePublicQuestion,
  extractProtectedAnswerKey,
  subscribeToQuestionSyncState
} from './questionImportSyncService.ts';

export {
  flushQuestionOutbox,
  subscribeToQuestionSyncState
};

const LOCAL_STORAGE_PREFIX = 'umed_assessment_';

// Start automatic background outbox synchronization in browser runtime
if (typeof window !== 'undefined') {
  startQuestionOutboxAutoSync();
}

// Default Seed Question Bank for Dar Al Salam University
export const DEFAULT_QUESTION_BANK: QuestionBank = {
  id: 'qbank-cvs-default',
  titleArabic: 'بنك أسئلة بلوك القلب والأوعية الدموية (CVS-401)',
  titleEnglish: 'Cardiovascular System Question Bank',
  descriptionArabic: 'أسئلة اختيار من متعدد سريرية وأساسية في تشريح وفسيولوجيا وأدوية الجهاز القلبي الوعائي',
  universityId: 'univ-dar-al-salam',
  programId: 'prog-mbbs',
  studyLevelId: 'lvl-4',
  courseOfferingId: 'crs-anat-cvs',
  createdBy: 'SYSTEM_SEED',
  createdAt: '2025-01-01T00:00:00Z'
};

// Public-only question stems & options (Strictly NO correctOptionId or explanationArabic in browser code)
export const DEFAULT_PUBLIC_QUESTIONS: AssessmentQuestionPublic[] = [
  {
    id: 'q-cvs-1',
    bankId: 'qbank-cvs-default',
    stemArabic: 'ما هو الصمام القلبي الفاصل بين البطين الأيسر والشريان الأبهر (الأورطي)؟',
    stemEnglish: 'Which heart valve lies between the left ventricle and aorta?',
    options: [
      { id: 'opt-a', textArabic: 'الصمام التاجي (الميترالي - Mitral Valve)' },
      { id: 'opt-b', textArabic: 'الصمام الأبهري (Aortic Valve)' },
      { id: 'opt-c', textArabic: 'الصمام ثلاثي الشرف (Tricuspid Valve)' },
      { id: 'opt-d', textArabic: 'الصمام الرئوي (Pulmonary Valve)' }
    ],
    points: 5
  },
  {
    id: 'q-cvs-2',
    bankId: 'qbank-cvs-default',
    stemArabic: 'أي من الأدوية التالية يعتبر الخيار الأول السريع للسيطرة على نوبة الذبحة الصدرية الحادة؟',
    stemEnglish: 'Which drug is the immediate first-line treatment for an acute angina pectoris attack?',
    options: [
      { id: 'opt-a', textArabic: 'النيتروجليسرين تحت اللسان (Sublingual Nitroglycerin)' },
      { id: 'opt-b', textArabic: 'الأسبرين بجرعة عالية فقط' },
      { id: 'opt-c', textArabic: 'الأملوديبين فموياً (Oral Amlodipine)' },
      { id: 'opt-d', textArabic: 'الديجوكسين وريدياً (IV Digoxin)' }
    ],
    points: 5
  },
  {
    id: 'q-cvs-3',
    bankId: 'qbank-cvs-default',
    stemArabic: 'أي الشرايين التالية يغذّي الجدار الخلفي والسفلي للبطين الأيسر في معظم الحالات (Right Dominance)؟',
    stemEnglish: 'Which coronary artery supplies the inferior wall of the LV in a right-dominant heart?',
    options: [
      { id: 'opt-a', textArabic: 'الشريان التاجي الأيمن (Right Coronary Artery - RCA)' },
      { id: 'opt-b', textArabic: 'الشريان النازل الأمامي الأيسر (LAD)' },
      { id: 'opt-c', textArabic: 'الشريان المنعطف الأيسر (LCx)' },
      { id: 'opt-d', textArabic: 'الشريان القطري الأول (First Diagonal)' }
    ],
    points: 5
  }
];

export const DEFAULT_ASSESSMENTS: Assessment[] = [
  {
    id: 'asmnt-cvs-midterm',
    assessmentType: 'exam',
    titleArabic: 'اختبار منتصف بلوك الجهاز القلبي الوعائي (CVS Block Exam)',
    descriptionArabic: 'اختبار تقييمي شامل في تشريح وفسيولوجيا وأدوية القلب والأوعية الدموية لطلاب المستوى الرابع.',
    universityId: 'univ-dar-al-salam',
    programId: 'prog-mbbs',
    studyLevelId: 'lvl-4',
    courseOfferingId: 'crs-anat-cvs',
    durationMinutes: 30,
    maxAttempts: 2,
    opensAt: '2025-01-01T00:00:00Z',
    closesAt: '2027-12-31T23:59:59Z',
    resultReleasePolicy: 'immediate',
    status: 'published',
    questionIds: ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'],
    totalPoints: 15,
    createdBy: 'SYSTEM_SEED',
    createdAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'comp-clinical-cardio',
    assessmentType: 'competition',
    titleArabic: 'المسابقة السريرية الكبرى لطب القلب والطوارئ',
    descriptionArabic: 'مسابقة علمية تنافسية بين طلاب كلية الطب البشري في الحالات السريرية الحرجة وتخطيط القلب.',
    universityId: 'univ-dar-al-salam',
    programId: 'prog-mbbs',
    studyLevelId: 'lvl-4',
    durationMinutes: 20,
    maxAttempts: 1,
    opensAt: '2025-01-01T00:00:00Z',
    closesAt: '2027-12-31T23:59:59Z',
    resultReleasePolicy: 'immediate',
    status: 'published',
    questionIds: ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'],
    totalPoints: 15,
    createdBy: 'SYSTEM_SEED',
    createdAt: '2025-01-01T00:00:00Z'
  }
];

async function getIdTokenSafe(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) return '';
  try {
    return await currentUser.getIdToken();
  } catch (e) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 1. Admin Question Banks & MCQs (Full Dynamic CRUD + Offline Bulk Outbox)
// ---------------------------------------------------------------------------

export async function getQuestionBanks(universityId: string): Promise<QuestionBank[]> {
  const initKey = `${LOCAL_STORAGE_PREFIX}banks_init_${universityId}`;
  const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}banks_${universityId}`);
  const localBanks: QuestionBank[] = raw ? JSON.parse(raw) : [];

  try {
    const q = query(
      collection(db, 'questionBanks'),
      where('universityId', '==', universityId)
    );
    const snap = await getDocs(q);
    const list: QuestionBank[] = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() } as QuestionBank));
    if (list.length > 0) {
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_${universityId}`, JSON.stringify(list));
      localStorage.setItem(initKey, 'true');
      return list;
    }
  } catch (err) {
    console.warn('Firestore fallback: reading local question banks');
  }

  if (localStorage.getItem(initKey) === 'true') {
    return localBanks;
  }

  if (localBanks.length > 0) return localBanks;

  if (universityId === 'univ-dar-al-salam') {
    return [DEFAULT_QUESTION_BANK];
  }
  return [];
}

async function ensureBanksInitialized(universityId: string): Promise<QuestionBank[]> {
  const initKey = `${LOCAL_STORAGE_PREFIX}banks_init_${universityId}`;
  const current = await getQuestionBanks(universityId);
  if (localStorage.getItem(initKey) !== 'true') {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_${universityId}`, JSON.stringify(current));
    localStorage.setItem(initKey, 'true');
    for (const b of current) {
      try {
        await setDoc(doc(db, 'questionBanks', b.id), b, { merge: true });
      } catch (e) {}
    }
  }
  return current;
}

export async function createQuestionBank(bank: Omit<QuestionBank, 'id' | 'createdAt'>): Promise<QuestionBank> {
  const existing = await ensureBanksInitialized(bank.universityId);
  const id = `qbank-${Date.now()}`;
  const now = new Date().toISOString();
  const newBank: QuestionBank = {
    ...bank,
    id,
    createdAt: now,
    updatedAt: now
  };

  try {
    await setDoc(doc(db, 'questionBanks', id), cleanFirestoreData(newBank));
  } catch (err) {
    console.warn('Firestore failed, saving question bank to localStorage fallback');
  }

  try {
    const updated = [...existing.filter(b => b.id !== id), newBank];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_${bank.universityId}`, JSON.stringify(updated));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_init_${bank.universityId}`, 'true');
  } catch (e) {}

  return newBank;
}

export async function updateQuestionBank(
  bankId: string,
  updates: Partial<QuestionBank>,
  universityId: string = 'univ-dar-al-salam'
): Promise<QuestionBank> {
  const existing = await ensureBanksInitialized(universityId);
  const target = existing.find(b => b.id === bankId) || {
    ...DEFAULT_QUESTION_BANK,
    id: bankId,
    universityId
  };

  const updatedBank: QuestionBank = cleanFirestoreData({
    ...target,
    ...updates,
    id: bankId,
    updatedAt: new Date().toISOString()
  });

  try {
    await setDoc(doc(db, 'questionBanks', bankId), cleanFirestoreData(updatedBank), { merge: true });
  } catch (err) {
    console.warn('Firestore updateQuestionBank fallback:', err);
  }

  try {
    const updatedList = existing.some(b => b.id === bankId)
      ? existing.map(b => b.id === bankId ? updatedBank : b)
      : [...existing, updatedBank];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_${updatedBank.universityId}`, JSON.stringify(updatedList));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_init_${updatedBank.universityId}`, 'true');
  } catch (e) {}

  return updatedBank;
}

export async function deleteQuestionBank(
  bankId: string,
  universityId: string = 'univ-dar-al-salam'
): Promise<void> {
  const existing = await ensureBanksInitialized(universityId);
  const questions = await getBankQuestions(bankId);

  try {
    await deleteDoc(doc(db, 'questionBanks', bankId));
  } catch (err) {}

  for (const q of questions) {
    await enqueueQuestionDelete(bankId, q.id);
  }

  try {
    const filtered = existing.filter(b => b.id !== bankId);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_${universityId}`, JSON.stringify(filtered));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_init_${universityId}`, 'true');
    localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}q_${bankId}`);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_init_${bankId}`, 'true');
  } catch (e) {}
}

export async function getBankQuestions(bankId: string): Promise<QuestionItemFull[]> {
  const initKey = `${LOCAL_STORAGE_PREFIX}q_init_${bankId}`;
  const localQuestions = await readLocalBankQuestionsAsync(bankId);

  try {
    const q = query(
      collection(db, 'questions'),
      where('bankId', '==', bankId)
    );
    const snap = await getDocs(q);
    const cloudList: QuestionItemFull[] = [];
    snap.forEach(d => cloudList.push({ id: d.id, ...d.data(), syncStatus: 'synced' } as QuestionItemFull));
    if (cloudList.length > 0) {
      const merged = mergeCloudAndOfflineQuestions(bankId, cloudList, localQuestions);
      await writeLocalBankQuestions(bankId, merged);
      // Keep backend grading store synchronized in background
      getIdTokenSafe().then(token => {
        fetch('/api/admin/sync-assessment-questions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ questions: merged })
        }).catch(() => {});
      });
      return merged;
    }
  } catch (err) {}

  if (localStorage.getItem(initKey) === 'true' || localQuestions.length > 0) {
    return localQuestions;
  }

  // Fetch protected default questions from server endpoint for Admin Console
  try {
    const token = await getIdTokenSafe();
    const res = await fetch(`/api/admin/questions?bankId=${encodeURIComponent(bankId)}`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        const merged = mergeCloudAndOfflineQuestions(bankId, data.questions, localQuestions);
        await writeLocalBankQuestions(bankId, merged);
        return merged;
      }
    }
  } catch (e) {}

  return localQuestions;
}

export function subscribeToBankQuestions(
  bankId: string,
  onUpdate: (questions: QuestionItemFull[]) => void
): () => void {
  if (!bankId) return () => {};
  try {
    const q = query(
      collection(db, 'questions'),
      where('bankId', '==', bankId)
    );
    const unsubFirestore = onSnapshot(
      q,
      async (snap) => {
        const cloudList: QuestionItemFull[] = [];
        snap.forEach(d => {
          cloudList.push({
            id: d.id,
            ...d.data(),
            syncStatus: 'synced'
          } as QuestionItemFull);
        });
        const localQuestions = await readLocalBankQuestionsAsync(bankId);
        const merged = mergeCloudAndOfflineQuestions(bankId, cloudList, localQuestions);
        await writeLocalBankQuestions(bankId, merged);
        onUpdate(merged);
      },
      async () => {
        const localQuestions = await readLocalBankQuestionsAsync(bankId);
        onUpdate(localQuestions);
      }
    );

    const unsubSync = subscribeToQuestionSyncState(async () => {
      const localQuestions = await readLocalBankQuestionsAsync(bankId);
      if (localQuestions.length > 0) {
        onUpdate(localQuestions);
      }
    });

    return () => {
      unsubFirestore();
      unsubSync();
    };
  } catch {
    return () => {};
  }
}

async function ensureBankQuestionsInitialized(bankId: string): Promise<QuestionItemFull[]> {
  const initKey = `${LOCAL_STORAGE_PREFIX}q_init_${bankId}`;
  const current = await getBankQuestions(bankId);
  if (localStorage.getItem(initKey) !== 'true') {
    await writeLocalBankQuestions(bankId, current);
    for (const q of current) {
      try {
        await Promise.all([
          setDoc(doc(db, 'questions', q.id), cleanFirestoreData(q), { merge: true }),
          setDoc(doc(db, 'assessmentQuestions', q.id), cleanFirestoreData(sanitizePublicQuestion(q)), { merge: true }),
          setDoc(doc(db, 'questionAnswerKeys', q.id), cleanFirestoreData(extractProtectedAnswerKey(q)), { merge: true })
        ]);
      } catch (e) {}
    }
  }
  return current;
}

export async function createQuestion(question: Omit<QuestionItemFull, 'id' | 'createdAt'>): Promise<QuestionItemFull> {
  const existing = await ensureBankQuestionsInitialized(question.bankId);
  const contentHash = question.contentHash || computeQuestionFingerprint(question.stemArabic, question.options);

  // Check if an identical question already exists in this bank
  const duplicateExisting = existing.find(
    q => (q.contentHash || computeQuestionFingerprint(q.stemArabic, q.options)) === contentHash
  );
  const id = duplicateExisting?.id || `q-${question.bankId}-${contentHash}`;
  const now = new Date().toISOString();

  const newQ: QuestionItemFull = {
    ...question,
    id,
    contentHash,
    createdAt: duplicateExisting?.createdAt || now,
    updatedAt: now,
    syncStatus: 'pending_sync'
  };

  await enqueueQuestionsUpsert(question.bankId, [newQ]);
  const refreshed = await readLocalBankQuestionsAsync(question.bankId);
  return refreshed.find(q => q.id === id) || newQ;
}

export async function bulkSaveQuestions(
  bankId: string,
  items: Array<ParsedQuestionDraft | Omit<QuestionItemFull, 'id' | 'createdAt'>>,
  createdBy: string = 'ADMIN'
): Promise<{
  savedQuestions: QuestionItemFull[];
  createdCount: number;
  updatedCount: number;
  skippedDuplicatesCount: number;
  syncedImmediately: boolean;
}> {
  const existing = await ensureBankQuestionsInitialized(bankId);
  const existingByHash = new Map<string, QuestionItemFull>();
  for (const q of existing) {
    const hash = q.contentHash || computeQuestionFingerprint(q.stemArabic, q.options);
    existingByHash.set(hash, q);
  }

  const now = new Date().toISOString();
  const seenBatchHashes = new Set<string>();
  const toUpsert: QuestionItemFull[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedDuplicatesCount = 0;

  for (const raw of items) {
    const stemArabic = (raw.stemArabic || '').trim();
    const options = Array.isArray(raw.options) ? raw.options : [];
    if (!stemArabic || options.length < 2) continue;

    const contentHash = raw.contentHash || computeQuestionFingerprint(stemArabic, options);
    if (seenBatchHashes.has(contentHash)) {
      skippedDuplicatesCount++;
      continue;
    }
    seenBatchHashes.add(contentHash);

    const existingMatch = existingByHash.get(contentHash);
    const id = existingMatch?.id || `q-${bankId}-${contentHash}`;
    if (existingMatch) {
      updatedCount++;
    } else {
      createdCount++;
    }

    const fullQuestion: QuestionItemFull = cleanFirestoreData({
      id,
      bankId,
      stemArabic,
      stemEnglish: raw.stemEnglish?.trim() || '',
      options: options.map((o, idx) => ({
        id: o.id || `opt-${['a', 'b', 'c', 'd'][idx] || 'a'}`,
        textArabic: (o.textArabic || '').trim(),
        textEnglish: o.textEnglish?.trim() || undefined
      })),
      correctOptionId: raw.correctOptionId || 'opt-a',
      explanationArabic: raw.explanationArabic?.trim() || '',
      explanationEnglish: raw.explanationEnglish?.trim() || undefined,
      optionExplanations: raw.optionExplanations,
      points: Number(raw.points) || 5,
      createdBy: existingMatch?.createdBy || createdBy,
      createdAt: existingMatch?.createdAt || now,
      updatedAt: now,
      contentHash,
      syncStatus: 'pending_sync'
    });

    toUpsert.push(fullQuestion);
  }

  if (toUpsert.length > 0) {
    await enqueueQuestionsUpsert(bankId, toUpsert);
  }

  const syncRes = await flushQuestionOutbox();
  const allBankQuestions = await readLocalBankQuestionsAsync(bankId);

  try {
    await writeAuditLogToCloud({
      action: 'QUESTIONS_BULK_IMPORTED',
      performedBy: auth.currentUser?.email || createdBy,
      details: {
        bankId,
        createdCount,
        updatedCount,
        skippedDuplicatesCount,
        totalInBank: allBankQuestions.length
      }
    });
  } catch {}

  return {
    savedQuestions: allBankQuestions,
    createdCount,
    updatedCount,
    skippedDuplicatesCount,
    syncedImmediately: syncRes.remainingCount === 0
  };
}

export async function updateQuestion(
  questionId: string,
  updates: Partial<QuestionItemFull>
): Promise<QuestionItemFull> {
  const bankId = updates.bankId || 'qbank-cvs-default';
  const existing = await ensureBankQuestionsInitialized(bankId);
  const target = existing.find(q => q.id === questionId);
  const now = new Date().toISOString();

  const mergedBase: QuestionItemFull = {
    ...(target || {
      id: questionId,
      bankId,
      stemArabic: '',
      options: [],
      correctOptionId: 'opt-a',
      points: 5,
      createdBy: 'ADMIN',
      createdAt: now
    }),
    ...updates,
    id: questionId,
    updatedAt: now,
    syncStatus: 'pending_sync'
  };
  mergedBase.contentHash = computeQuestionFingerprint(mergedBase.stemArabic, mergedBase.options);

  const updatedQ: QuestionItemFull = cleanFirestoreData(mergedBase);
  await enqueueQuestionsUpsert(updatedQ.bankId, [updatedQ]);

  const refreshed = await readLocalBankQuestionsAsync(updatedQ.bankId);
  return refreshed.find(q => q.id === questionId) || updatedQ;
}

export async function deleteQuestion(questionId: string, bankId: string): Promise<void> {
  await ensureBankQuestionsInitialized(bankId);
  await enqueueQuestionDelete(bankId, questionId);
}

// ---------------------------------------------------------------------------
// 2. Admin Assessments (Exams & Competitions - Full Dynamic CRUD)
// ---------------------------------------------------------------------------

const DELETED_ASSESSMENTS_KEY = `${LOCAL_STORAGE_PREFIX}deleted_ids`;

function getDeletedAssessmentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_ASSESSMENTS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}

function markAssessmentDeleted(id: string): void {
  try {
    const set = getDeletedAssessmentIds();
    set.add(id);
    localStorage.setItem(DELETED_ASSESSMENTS_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function unmarkAssessmentDeleted(id: string): void {
  try {
    const set = getDeletedAssessmentIds();
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(DELETED_ASSESSMENTS_KEY, JSON.stringify(Array.from(set)));
    }
  } catch (e) {}
}

function mergeAssessmentsWithDefaults(universityId: string, items: Assessment[]): Assessment[] {
  const deleted = getDeletedAssessmentIds();
  const map = new Map<string, Assessment>();
  if (universityId === 'univ-dar-al-salam') {
    for (const def of DEFAULT_ASSESSMENTS) {
      if (!deleted.has(def.id)) {
        map.set(def.id, def);
      }
    }
  }
  for (const item of items) {
    if (item && item.id && !deleted.has(item.id) && (!universityId || item.universityId === universityId)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export function getCachedPublishedAssessments(universityId: string, studyLevelId: string): Assessment[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}assessments_${universityId}`);
    const localList: Assessment[] = raw ? JSON.parse(raw) : [];
    const merged = mergeAssessmentsWithDefaults(universityId, localList);
    return merged.filter(
      a => a.status === 'published' && (!a.studyLevelId || a.studyLevelId === studyLevelId || a.studyLevelId === 'ALL')
    );
  } catch {
    return mergeAssessmentsWithDefaults(universityId, []).filter(
      a => a.status === 'published' && (!a.studyLevelId || a.studyLevelId === studyLevelId || a.studyLevelId === 'ALL')
    );
  }
}

export async function getAssessments(universityId: string, type?: AssessmentType, status?: AssessmentStatus): Promise<Assessment[]> {
  const initKey = `${LOCAL_STORAGE_PREFIX}assessments_init_${universityId}`;
  const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}assessments_${universityId}`);
  const localList: Assessment[] = raw ? JSON.parse(raw) : [];

  let cloudList: Assessment[] = [];
  try {
    if (status === 'published') {
      // Student-safe query that 100% satisfies `resource.data.status == 'published'` in Firestore security rules
      const q = query(collection(db, 'assessments'), where('status', '==', 'published'));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = { id: d.id, ...d.data() } as Assessment;
        if (!universityId || data.universityId === universityId) {
          cloudList.push(data);
        }
      });
    } else {
      try {
        const q = query(collection(db, 'assessments'), where('universityId', '==', universityId));
        const snap = await getDocs(q);
        snap.forEach(d => cloudList.push({ id: d.id, ...d.data() } as Assessment));
      } catch {
        const q = query(collection(db, 'assessments'), where('status', '==', 'published'));
        const snap = await getDocs(q);
        snap.forEach(d => {
          const data = { id: d.id, ...d.data() } as Assessment;
          if (!universityId || data.universityId === universityId) {
            cloudList.push(data);
          }
        });
      }
    }
  } catch (err) {}

  const draftsFromLocal = status === 'published'
    ? localList.filter(a => a.status !== 'published')
    : [];
  const merged = mergeAssessmentsWithDefaults(
    universityId,
    cloudList.length > 0 ? [...draftsFromLocal, ...cloudList] : localList
  );

  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${universityId}`, JSON.stringify(merged));
    localStorage.setItem(initKey, 'true');
  } catch (e) {}

  let result = merged;
  if (status) {
    result = result.filter(a => a.status === status);
  }
  if (type) {
    result = result.filter(a => a.assessmentType === type);
  }
  return result;
}

export function subscribeToAssessments(
  universityId: string,
  onUpdate: (assessments: Assessment[]) => void,
  type?: AssessmentType,
  status?: AssessmentStatus
): () => void {
  try {
    // Use `where('status', '==', 'published')` when status is 'published' so student listeners
    // 100% comply with Firestore security rules on `umed-yemen`.
    const q = status === 'published'
      ? query(collection(db, 'assessments'), where('status', '==', 'published'))
      : query(collection(db, 'assessments'), where('universityId', '==', universityId));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const cloudItems: Assessment[] = [];
        snap.forEach(d => {
          const data = { id: d.id, ...d.data() } as Assessment;
          if (!universityId || data.universityId === universityId) {
            cloudItems.push(data);
          }
        });
        const merged = mergeAssessmentsWithDefaults(universityId, cloudItems);
        try {
          localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${universityId}`, JSON.stringify(merged));
          localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_init_${universityId}`, 'true');
        } catch (e) {}

        let list = merged;
        if (status) list = list.filter(a => a.status === status);
        if (type) list = list.filter(a => a.assessmentType === type);
        onUpdate(list);
      },
      (err) => {
        console.warn('subscribeToAssessments error:', err);
      }
    );
    return unsub;
  } catch (err) {
    return () => {};
  }
}

async function ensureAssessmentsInitialized(universityId: string): Promise<Assessment[]> {
  const initKey = `${LOCAL_STORAGE_PREFIX}assessments_init_${universityId}`;
  const current = await getAssessments(universityId);
  if (localStorage.getItem(initKey) !== 'true') {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${universityId}`, JSON.stringify(current));
    localStorage.setItem(initKey, 'true');
    for (const a of current) {
      try {
        await setDoc(doc(db, 'assessments', a.id), a, { merge: true });
      } catch (e) {}
    }
  }
  return current;
}

export async function createAssessment(
  assessment: Omit<Assessment, 'id' | 'createdAt'>,
  bankQuestions?: QuestionItemFull[]
): Promise<Assessment> {
  const existing = await ensureAssessmentsInitialized(assessment.universityId);
  const id = `asmnt-${Date.now()}`;
  unmarkAssessmentDeleted(id);
  const now = new Date().toISOString();
  const newAssessment: Assessment = {
    ...assessment,
    id,
    createdAt: now
  };

  try {
    await setDoc(doc(db, 'assessments', id), cleanFirestoreData(newAssessment));
    if (Array.isArray(bankQuestions) && bankQuestions.length > 0) {
      await Promise.all(
        bankQuestions.map(async (q) => {
          await setDoc(doc(db, 'assessmentQuestions', q.id), cleanFirestoreData({
            id: q.id,
            bankId: q.bankId,
            stemArabic: q.stemArabic,
            stemEnglish: q.stemEnglish || '',
            options: q.options,
            points: Number(q.points) || 5
          }), { merge: true });
          await setDoc(doc(db, 'questionAnswerKeys', q.id), cleanFirestoreData({
            questionId: q.id,
            assessmentId: id,
            correctOptionId: q.correctOptionId,
            explanationArabic: q.explanationArabic || '',
            points: Number(q.points) || 5
          }), { merge: true });
        })
      );
    }
  } catch (err) {}

  try {
    const updated = [newAssessment, ...existing.filter(a => a.id !== id)];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${assessment.universityId}`, JSON.stringify(updated));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_init_${assessment.universityId}`, 'true');
  } catch (e) {}

  try {
    const token = await getIdTokenSafe();
    await fetch('/api/admin/sync-assessment-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ assessment: newAssessment, questions: bankQuestions || [] })
    });
  } catch (e) {}

  return newAssessment;
}

export async function updateAssessment(
  assessmentId: string,
  updates: Partial<Assessment>,
  bankQuestions?: QuestionItemFull[]
): Promise<Assessment> {
  unmarkAssessmentDeleted(assessmentId);
  const universityId = updates.universityId || 'univ-dar-al-salam';
  const existing = await ensureAssessmentsInitialized(universityId);
  const target = existing.find(a => a.id === assessmentId) ||
    DEFAULT_ASSESSMENTS.find(a => a.id === assessmentId);

  const updatedAssessment: Assessment = cleanFirestoreData({
    ...(target || {
      id: assessmentId,
      assessmentType: 'exam',
      titleArabic: '',
      universityId,
      programId: 'prog-mbbs',
      studyLevelId: 'lvl-4',
      durationMinutes: 30,
      maxAttempts: 1,
      opensAt: new Date().toISOString(),
      closesAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      resultReleasePolicy: 'immediate',
      status: 'published',
      questionIds: [],
      totalPoints: 15,
      createdBy: 'ADMIN',
      createdAt: new Date().toISOString()
    }),
    ...updates,
    id: assessmentId
  });

  try {
    await setDoc(doc(db, 'assessments', assessmentId), cleanFirestoreData(updatedAssessment), { merge: true });
    if (Array.isArray(bankQuestions) && bankQuestions.length > 0) {
      await Promise.all(
        bankQuestions.map(async (q) => {
          await setDoc(doc(db, 'assessmentQuestions', q.id), cleanFirestoreData({
            id: q.id,
            bankId: q.bankId,
            stemArabic: q.stemArabic,
            stemEnglish: q.stemEnglish || '',
            options: q.options,
            points: Number(q.points) || 5
          }), { merge: true });
          await setDoc(doc(db, 'questionAnswerKeys', q.id), cleanFirestoreData({
            questionId: q.id,
            assessmentId,
            correctOptionId: q.correctOptionId,
            explanationArabic: q.explanationArabic || '',
            points: Number(q.points) || 5
          }), { merge: true });
        })
      );
    }
  } catch (err) {
    console.warn('Firestore updateAssessment fallback:', err);
  }

  try {
    const updatedList = existing.some(a => a.id === assessmentId)
      ? existing.map(a => a.id === assessmentId ? updatedAssessment : a)
      : [updatedAssessment, ...existing];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${updatedAssessment.universityId}`, JSON.stringify(updatedList));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_init_${updatedAssessment.universityId}`, 'true');
  } catch (e) {}

  try {
    const token = await getIdTokenSafe();
    await fetch('/api/admin/sync-assessment-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ assessment: updatedAssessment, questions: bankQuestions || [] })
    });
  } catch (e) {}

  return updatedAssessment;
}

export async function deleteAssessment(
  assessmentId: string,
  universityId: string = 'univ-dar-al-salam'
): Promise<void> {
  markAssessmentDeleted(assessmentId);
  const existing = await ensureAssessmentsInitialized(universityId);

  try {
    await deleteDoc(doc(db, 'assessments', assessmentId));
  } catch (err) {}

  try {
    const filtered = existing.filter(a => a.id !== assessmentId);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${universityId}`, JSON.stringify(filtered));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_init_${universityId}`, 'true');
  } catch (e) {}

  try {
    const token = await getIdTokenSafe();
    await fetch('/api/admin/sync-assessment-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ deletedAssessmentIds: [assessmentId] })
    });
  } catch (e) {}
}

export async function updateAssessmentStatus(
  assessmentId: string,
  status: 'draft' | 'published' | 'closed',
  universityId: string = 'univ-dar-al-salam'
): Promise<void> {
  await updateAssessment(assessmentId, { status, universityId });
}

// ---------------------------------------------------------------------------
// 3. Student Assessment Engine Functions (Firestore + Trusted API Hybrid)
// ---------------------------------------------------------------------------

export async function getPublishedAssessmentsForStudent(
  universityId: string, 
  studyLevelId: string
): Promise<Assessment[]> {
  const all = await getAssessments(universityId, undefined, 'published');
  const filtered = all.filter(
    a => a.status === 'published' && (a.studyLevelId === studyLevelId || !a.studyLevelId || a.studyLevelId === 'ALL')
  );
  return filtered;
}

export async function fetchPublicQuestionsForAssessment(questionIds: string[]): Promise<AssessmentQuestionPublic[]> {
  const defaultMap: Record<string, AssessmentQuestionPublic> = {};
  DEFAULT_PUBLIC_QUESTIONS.forEach(q => { defaultMap[q.id] = q; });

  // Fetch all questions in parallel for fast exam start!
  const fetched = await Promise.all(
    questionIds.map(async (qId) => {
      try {
        const snap = await getDoc(doc(db, 'assessmentQuestions', qId));
        if (snap.exists()) {
          const d = snap.data() as AssessmentQuestionPublic;
          return {
            id: d.id || qId,
            bankId: d.bankId,
            stemArabic: d.stemArabic,
            stemEnglish: d.stemEnglish,
            imageUrl: d.imageUrl,
            options: d.options,
            points: Number(d.points) || 5
          } as AssessmentQuestionPublic;
        }
      } catch (e) {}
      return defaultMap[qId] || null;
    })
  );

  const results = fetched.filter(Boolean) as AssessmentQuestionPublic[];
  if (results.length === 0) {
    return DEFAULT_PUBLIC_QUESTIONS;
  }

  return results;
}

export async function startAttemptServer(
  assessmentId: string,
  assessmentObj?: Assessment
): Promise<{
  attempt: AssessmentAttempt;
  questions: AssessmentQuestionPublic[];
}> {
  const token = await getIdTokenSafe();
  const uid = auth.currentUser?.uid || 'student-user';
  const durationMinutes = assessmentObj?.durationMinutes || 45;
  const maxAttempts = assessmentObj?.maxAttempts || 1;
  const questionIds = assessmentObj?.questionIds?.length
    ? assessmentObj.questionIds
    : ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];

  // Fetch public questions from Firestore first
  const firestoreQuestions = await fetchPublicQuestionsForAssessment(questionIds);

  // Check existing attempts for this student to resume active attempt or calculate cumulative attemptNumber
  const existingUserAttempts = (await getStudentAttempts(uid)).filter(
    (a) => a.assessmentId === assessmentId
  );
  const now = new Date();
  const activeLocalOrRemoteAttempt = existingUserAttempts.find(
    (a) => a.status === 'in_progress' && new Date(a.expiresAt).getTime() > now.getTime()
  );

  if (activeLocalOrRemoteAttempt) {
    return {
      attempt: activeLocalOrRemoteAttempt,
      questions: firestoreQuestions
    };
  }

  const completedAttemptsCount = existingUserAttempts.filter(
    (a) => a.status === 'scored' || a.status === 'submitted'
  ).length;

  if (completedAttemptsCount >= maxAttempts) {
    throw new Error(`لقد استنفدت الحد الأقصى للمحاولات المسموحة لهذا التقييم (${maxAttempts}).`);
  }

  const nextAttemptNumber = completedAttemptsCount + 1;
  let attempt: AssessmentAttempt | null = null;
  let serverQuestions: AssessmentQuestionPublic[] = [];

  try {
    const res = await fetch('/api/assessments/start-attempt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        assessmentId,
        durationMinutes,
        maxAttempts,
        questionIds,
        uid
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.attempt) {
        attempt = {
          ...data.attempt,
          attemptNumber: Math.max(Number(data.attempt.attemptNumber) || 1, nextAttemptNumber)
        };
        serverQuestions = data.questions || [];
      }
    }
  } catch (e) {}

  if (!attempt) {
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();
    attempt = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      assessmentId,
      uid,
      startedAt: now.toISOString(),
      expiresAt,
      status: 'in_progress',
      answers: {},
      lastSavedAt: now.toISOString(),
      attemptNumber: nextAttemptNumber
    };
  }

  // Persist attempt to Firestore
  try {
    await setDoc(doc(db, 'assessmentAttempts', attempt.id), attempt);
  } catch (e) {}

  const questionsToUse = serverQuestions.length > 0 ? serverQuestions : firestoreQuestions;

  return {
    attempt,
    questions: questionsToUse
  };
}

export async function saveProgressServer(attemptId: string, answers: Record<string, string>): Promise<string> {
  const nowIso = new Date().toISOString();

  // Save to Firestore
  try {
    await updateDoc(doc(db, 'assessmentAttempts', attemptId), {
      answers,
      lastSavedAt: nowIso
    });
  } catch (e) {}

  // Also sync with backend API
  try {
    const token = await getIdTokenSafe();
    const res = await fetch('/api/assessments/save-progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ attemptId, answers })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.lastSavedAt) return data.lastSavedAt;
    }
  } catch (e) {}

  return nowIso;
}

export async function submitAttemptServer(
  attemptId: string,
  answers: Record<string, string>,
  assessmentObj?: Assessment,
  studentNameArabic?: string
): Promise<{
  result: AssessmentResult;
  isReleased: boolean;
}> {
  const token = await getIdTokenSafe();
  const uid = auth.currentUser?.uid || 'student-user';
  const studentName = studentNameArabic || auth.currentUser?.displayName || auth.currentUser?.email || 'طالب طب بشري';
  const assessmentId = assessmentObj?.id || 'asmnt-cvs-midterm';
  const releasePolicy = assessmentObj?.resultReleasePolicy || 'immediate';
  const questionIds = assessmentObj?.questionIds?.length
    ? assessmentObj.questionIds
    : ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];

  let finalResult: AssessmentResult | null = null;

  // 1. Score via Trusted Backend API (where answer keys reside securely)
  try {
    const res = await fetch('/api/assessments/submit-attempt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        attemptId,
        assessmentId,
        answers,
        studentNameArabic: studentName,
        resultReleasePolicy: releasePolicy,
        questionIds
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.result) {
        finalResult = data.result;
      }
    }
  } catch (e) {}

  // 2. Fallback if serverless API is unreachable
  if (!finalResult) {
    const nowIso = new Date().toISOString();
    const isReleased = releasePolicy === 'immediate';
    const totalPoints = Number(assessmentObj?.totalPoints) || questionIds.length * 5;
    finalResult = {
      id: `res-${attemptId}`,
      attemptId,
      assessmentId,
      uid,
      studentNameArabic: studentName,
      score: 0,
      totalPoints,
      percentage: 0,
      submittedAt: nowIso,
      gradedAt: nowIso,
      isReleased,
      releasedAt: isReleased ? nowIso : undefined
    };
  }

  // 3. Persist finalized attempt (including scoredResult for cross-device persistence) to Cloud Firestore
  try {
    await setDoc(doc(db, 'assessmentAttempts', attemptId), cleanFirestoreData({
      id: attemptId,
      assessmentId,
      uid,
      answers,
      status: 'scored',
      submittedAt: finalResult.submittedAt,
      scoredResult: finalResult
    }), { merge: true });
  } catch (e) {}

  try {
    const localKey = `${LOCAL_STORAGE_PREFIX}results_${uid}`;
    const raw = localStorage.getItem(localKey);
    const prev: AssessmentResult[] = raw ? JSON.parse(raw) : [];
    const updated = [finalResult, ...prev.filter(r => r.id !== finalResult!.id)];
    localStorage.setItem(localKey, JSON.stringify(updated));
  } catch (e) {}

  try {
    await setDoc(doc(db, 'assessmentResults', finalResult.id), cleanFirestoreData(finalResult), { merge: true });
  } catch (e) {}

  try {
    await writeAuditLogToCloud({
      action: 'ASSESSMENT_SCORED',
      performedBy: studentName,
      targetUid: uid,
      details: {
        attemptId,
        assessmentId,
        score: finalResult.score,
        totalPoints: finalResult.totalPoints,
        percentage: finalResult.percentage
      }
    });
  } catch (e) {}

  return {
    result: finalResult,
    isReleased: finalResult.isReleased
  };
}

export async function getStudentAttempts(uid: string): Promise<AssessmentAttempt[]> {
  try {
    const q = query(
      collection(db, 'assessmentAttempts'),
      where('uid', '==', uid)
    );
    const snap = await getDocs(q);
    const list: AssessmentAttempt[] = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() } as AssessmentAttempt));
    return list;
  } catch (err) {
    return [];
  }
}

export async function getStudentResults(uid: string): Promise<AssessmentResult[]> {
  const resultsMap: Record<string, AssessmentResult> = {};

  // 0. Load local cached results first
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}results_${uid}`);
    if (raw) {
      const localList = JSON.parse(raw) as AssessmentResult[];
      localList.forEach(r => {
        if (r && r.id) resultsMap[r.id] = r;
      });
    }
  } catch (e) {}

  // 1. Read scored results stored inside student's own assessmentAttempts in Firestore
  try {
    const attemptsQ = query(collection(db, 'assessmentAttempts'), where('uid', '==', uid));
    const attemptsSnap = await getDocs(attemptsQ);
    attemptsSnap.forEach(d => {
      const data = d.data();
      if (data?.scoredResult && data.scoredResult.id) {
        const r = data.scoredResult as AssessmentResult;
        resultsMap[r.id] = r.isReleased ? r : { ...r, score: 0, percentage: 0 };
      }
    });
  } catch (e) {}

  try {
    // Query released results from Firestore assessmentResults
    const q = query(
      collection(db, 'assessmentResults'),
      where('uid', '==', uid),
      where('isReleased', '==', true)
    );
    const snap = await getDocs(q);
    snap.forEach(d => {
      const data = { id: d.id, ...d.data() } as AssessmentResult;
      resultsMap[data.id] = data;
    });
  } catch (err) {}

  try {
    const res = await fetch(`/api/assessments/results?uid=${encodeURIComponent(uid)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results)) {
        data.results.forEach((r: AssessmentResult) => {
          if (r && r.id) {
            resultsMap[r.id] = r.isReleased
              ? r
              : { ...r, score: 0, percentage: 0 };
          }
        });
      }
    }
  } catch (e) {}

  const finalResults = Object.values(resultsMap);
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}results_${uid}`, JSON.stringify(finalResults));
  } catch (e) {}

  return finalResults;
}

export async function releaseAssessmentResults(assessmentId: string): Promise<number> {
  let updatedCount = 0;
  const nowIso = new Date().toISOString();

  // 1. Update in backend server store first and retrieve updated results
  try {
    const token = await getIdTokenSafe();
    const res = await fetch('/api/admin/release-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ assessmentId })
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data.updatedCount === 'number') {
        updatedCount = data.updatedCount;
      }
    }
  } catch (e) {}

  // 2. Sync and release in Cloud Firestore (both assessmentResults and assessmentAttempts)
  try {
    const serverRes = await fetch(`/api/assessments/results?assessmentId=${encodeURIComponent(assessmentId)}`);
    if (serverRes.ok) {
      const data = await serverRes.json();
      if (Array.isArray(data.results)) {
        for (const r of data.results) {
          await setDoc(doc(db, 'assessmentResults', r.id), {
            ...r,
            isReleased: true,
            releasedAt: nowIso
          }, { merge: true });
        }
      }
    }

    const attemptsQ = query(collection(db, 'assessmentAttempts'), where('assessmentId', '==', assessmentId));
    const attemptsSnap = await getDocs(attemptsQ);
    for (const d of attemptsSnap.docs) {
      const attData = d.data();
      if (attData?.scoredResult) {
        const releasedRes = {
          ...attData.scoredResult,
          isReleased: true,
          releasedAt: nowIso
        };
        await Promise.all([
          updateDoc(doc(db, 'assessmentAttempts', d.id), { scoredResult: releasedRes }),
          setDoc(doc(db, 'assessmentResults', releasedRes.id), cleanFirestoreData(releasedRes), { merge: true })
        ]);
      }
    }

    const q = query(
      collection(db, 'assessmentResults'),
      where('assessmentId', '==', assessmentId)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await updateDoc(doc(db, 'assessmentResults', d.id), {
        isReleased: true,
        releasedAt: nowIso
      });
    }
    if (snap.size > updatedCount) {
      updatedCount = snap.size;
    }
  } catch (e) {}

  await writeAuditLogToCloud({
    action: 'RESULTS_RELEASED',
    performedBy: auth.currentUser?.email || 'ADMIN',
    details: { assessmentId, updatedCount }
  });

  return updatedCount;
}

export async function getAssessmentResultsForAdmin(assessmentId: string): Promise<AssessmentResult[]> {
  const resultsMap: Record<string, AssessmentResult> = {};

  try {
    const q = query(
      collection(db, 'assessmentResults'),
      where('assessmentId', '==', assessmentId)
    );
    const snap = await getDocs(q);
    snap.forEach(d => {
      const data = { id: d.id, ...d.data() } as AssessmentResult;
      resultsMap[data.id] = data;
    });
  } catch (err) {}

  try {
    const attemptsQ = query(
      collection(db, 'assessmentAttempts'),
      where('assessmentId', '==', assessmentId)
    );
    const attemptsSnap = await getDocs(attemptsQ);
    attemptsSnap.forEach(d => {
      const data = d.data();
      if (data?.scoredResult && data.scoredResult.id && !resultsMap[data.scoredResult.id]) {
        resultsMap[data.scoredResult.id] = data.scoredResult as AssessmentResult;
      }
    });
  } catch (err) {}

  try {
    const res = await fetch(`/api/assessments/results?assessmentId=${encodeURIComponent(assessmentId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results)) {
        for (const r of data.results as AssessmentResult[]) {
          if (r && r.id) {
            resultsMap[r.id] = r;
            try {
              await setDoc(doc(db, 'assessmentResults', r.id), r, { merge: true });
            } catch (e) {}
          }
        }
      }
    }
  } catch (e) {}

  return Object.values(resultsMap).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}
