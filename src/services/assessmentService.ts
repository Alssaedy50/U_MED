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
  ResultReleasePolicy,
  ParsedQuestionDraft,
  LeaderboardNameMode
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
    const qType = raw.questionType || 'mcq';
    const options = Array.isArray(raw.options) ? raw.options : [];
    if (!stemArabic || (qType !== 'essay' && qType !== 'fill_blank' && options.length < 2)) continue;

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
      questionType: qType,
      language: raw.language,
      stemArabic,
      stemEnglish: raw.stemEnglish?.trim() || '',
      imageUrl: raw.imageUrl,
      options: options.map((o, idx) => ({
        id: o.id || `opt-${['a', 'b', 'c', 'd', 'e', 'f'][idx] || 'a'}`,
        textArabic: (o.textArabic || '').trim(),
        textEnglish: o.textEnglish?.trim() || undefined,
        explanationArabic: o.explanationArabic?.trim() || undefined
      })),
      correctOptionId: raw.correctOptionId || (qType === 'essay' ? 'essay-answer' : qType === 'fill_blank' ? 'fill-blank-answer' : 'opt-a'),
      modelAnswerArabic: raw.modelAnswerArabic?.trim() || undefined,
      modelAnswerEnglish: raw.modelAnswerEnglish?.trim() || undefined,
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
  }
  return current;
}

interface PendingOfflineAssessmentSyncItem {
  assessment: Assessment;
  bankQuestions?: QuestionItemFull[];
  queuedAt: string;
}

const OFFLINE_ASSESSMENTS_OUTBOX_KEY = 'umed_offline_assessments_outbox_v1';

function enqueueOfflineAssessmentSync(assessment: Assessment, bankQuestions?: QuestionItemFull[]): void {
  try {
    const raw = localStorage.getItem(OFFLINE_ASSESSMENTS_OUTBOX_KEY);
    const list: PendingOfflineAssessmentSyncItem[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(list) ? list.filter((i) => i.assessment?.id !== assessment.id) : [];
    filtered.push({
      assessment,
      bankQuestions,
      queuedAt: new Date().toISOString()
    });
    localStorage.setItem(OFFLINE_ASSESSMENTS_OUTBOX_KEY, JSON.stringify(filtered));
  } catch {}
}

export async function flushOfflineAssessmentOutbox(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  try {
    const raw = localStorage.getItem(OFFLINE_ASSESSMENTS_OUTBOX_KEY);
    if (!raw) return 0;
    const list: PendingOfflineAssessmentSyncItem[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return 0;

    let syncedCount = 0;
    const remaining: PendingOfflineAssessmentSyncItem[] = [];

    for (const item of list) {
      if (!item?.assessment?.id) continue;
      try {
        await setDoc(doc(db, 'assessments', item.assessment.id), cleanFirestoreData(item.assessment), { merge: true });
        if (Array.isArray(item.bankQuestions) && item.bankQuestions.length > 0) {
          await Promise.all(
            item.bankQuestions.map(async (q) => {
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
                assessmentId: item.assessment.id,
                correctOptionId: q.correctOptionId,
                explanationArabic: q.explanationArabic || '',
                points: Number(q.points) || 5
              }), { merge: true });
            })
          );
        }
        const token = await getIdTokenSafe();
        await fetch('/api/admin/sync-assessment-questions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ assessment: item.assessment, questions: item.bankQuestions || [] })
        }).catch(() => {});
        await publishSharedAssessmentSnapshot(item.assessment, item.bankQuestions);
        syncedCount++;
      } catch {
        remaining.push(item);
      }
    }

    if (remaining.length === 0) {
      localStorage.removeItem(OFFLINE_ASSESSMENTS_OUTBOX_KEY);
    } else {
      localStorage.setItem(OFFLINE_ASSESSMENTS_OUTBOX_KEY, JSON.stringify(remaining));
    }
    return syncedCount;
  } catch {
    return 0;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineAssessmentOutbox().catch(() => {});
  });
}

export async function getQuestionsForAssessmentPreview(
  assessment: Assessment
): Promise<AssessmentQuestionPublic[]> {
  const localResolved = findLocalQuestionsForAssessmentSync(assessment);
  if (localResolved.publicQuestions.length > 0 && (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return localResolved.publicQuestions;
  }
  const qIds = assessment.questionIds?.length ? assessment.questionIds : ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];
  try {
    const fetched = await fetchPublicQuestionsForAssessment(qIds);
    if (fetched.length > 0) return fetched;
  } catch {}
  return localResolved.publicQuestions.length > 0 ? localResolved.publicQuestions : DEFAULT_PUBLIC_QUESTIONS;
}

export async function createAssessment(
  assessment: Omit<Assessment, 'id' | 'createdAt'>,
  bankQuestions?: QuestionItemFull[]
): Promise<Assessment> {
  const existing = await ensureAssessmentsInitialized(assessment.universityId);
  const strictType: AssessmentType = assessment.assessmentType === 'competition' ? 'competition' : 'exam';
  const prefix = strictType === 'competition' ? 'comp' : 'exam';
  const id = `${prefix}-${Date.now()}`;
  unmarkAssessmentDeleted(id);
  const now = new Date().toISOString();
  const newAssessment: Assessment = {
    ...assessment,
    assessmentType: strictType,
    id,
    createdAt: now
  };

  // Always persist locally and prepare self-contained bundle first (works 100% offline in 0ms)
  try {
    const updated = [newAssessment, ...existing.filter(a => a.id !== id)];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${assessment.universityId}`, JSON.stringify(updated));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_init_${assessment.universityId}`, 'true');
  } catch (e) {}

  publishSharedAssessmentSnapshot(newAssessment, bankQuestions).catch(() => {});

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineAssessmentSync(newAssessment, bankQuestions);
    return newAssessment;
  }

  let cloudSynced = false;
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
    cloudSynced = true;
  } catch (err) {
    enqueueOfflineAssessmentSync(newAssessment, bankQuestions);
  }

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
  } catch (e) {
    if (!cloudSynced) enqueueOfflineAssessmentSync(newAssessment, bankQuestions);
  }

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
    const updatedList = existing.some(a => a.id === assessmentId)
      ? existing.map(a => a.id === assessmentId ? updatedAssessment : a)
      : [updatedAssessment, ...existing];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${updatedAssessment.universityId}`, JSON.stringify(updatedList));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_init_${updatedAssessment.universityId}`, 'true');
  } catch (e) {}

  publishSharedAssessmentSnapshot(updatedAssessment, bankQuestions).catch(() => {});

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineAssessmentSync(updatedAssessment, bankQuestions);
    return updatedAssessment;
  }

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
    enqueueOfflineAssessmentSync(updatedAssessment, bankQuestions);
  }

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
// 3. Student Assessment Engine Functions (Firestore + Trusted API + Offline Outbox)
// ---------------------------------------------------------------------------

export interface OfflineExamSubmissionRecord {
  attemptId: string;
  assessmentId: string;
  uid: string;
  studentNameArabic: string;
  answers: Record<string, string>;
  resultReleasePolicy: ResultReleasePolicy;
  questionIds: string[];
  totalPoints: number;
  queuedAt: string;
  type: 'progress' | 'final_submit';
}

const OFFLINE_EXAM_OUTBOX_KEY = 'umed_offline_exam_submissions_v1';
const examSyncListeners = new Set<(pendingCount: number, isSyncing: boolean) => void>();
let isFlushingExamOutbox = false;
let examAutoSyncStarted = false;

function readOfflineExamOutbox(): OfflineExamSubmissionRecord[] {
  try {
    const raw = localStorage.getItem(OFFLINE_EXAM_OUTBOX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function writeOfflineExamOutbox(records: OfflineExamSubmissionRecord[]): void {
  try {
    localStorage.setItem(OFFLINE_EXAM_OUTBOX_KEY, JSON.stringify(records));
  } catch (e) {}
  notifyExamSyncListeners();
}

function notifyExamSyncListeners(): void {
  const count = readOfflineExamOutbox().length;
  examSyncListeners.forEach((cb) => {
    try {
      cb(count, isFlushingExamOutbox);
    } catch (e) {}
  });
}

export function getPendingOfflineExamSyncCount(): number {
  return readOfflineExamOutbox().length;
}

export function subscribeToExamOfflineSync(
  callback: (pendingCount: number, isSyncing: boolean) => void
): () => void {
  examSyncListeners.add(callback);
  callback(readOfflineExamOutbox().length, isFlushingExamOutbox);
  return () => {
    examSyncListeners.delete(callback);
  };
}

function saveLocalStudentAttempt(uid: string, attempt: AssessmentAttempt): void {
  try {
    const key = `${LOCAL_STORAGE_PREFIX}attempts_${uid}`;
    const raw = localStorage.getItem(key);
    const existing: AssessmentAttempt[] = raw ? JSON.parse(raw) : [];
    const updated = [attempt, ...existing.filter((a) => a.id !== attempt.id)];
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {}
}

function readLocalStudentAttempts(uid: string): AssessmentAttempt[] {
  try {
    const key = `${LOCAL_STORAGE_PREFIX}attempts_${uid}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

/**
 * Silently prefetches and caches public questions for published assessments
 * so students can start and complete exams even if internet disconnects.
 */
export async function prefetchAssessmentsForOffline(assessments: Assessment[]): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  for (const assessment of assessments) {
    if (!assessment?.questionIds?.length) continue;
    try {
      const qs = await fetchPublicQuestionsForAssessment(assessment.questionIds);
      if (qs.length > 0) {
        localStorage.setItem(
          `${LOCAL_STORAGE_PREFIX}cached_questions_${assessment.id}`,
          JSON.stringify(qs)
        );
        publishSharedAssessmentSnapshot(assessment, qs).catch(() => {});
      }
    } catch (e) {}
  }
}

export async function getPublishedAssessmentsForStudent(
  universityId: string, 
  studyLevelId: string
): Promise<Assessment[]> {
  const all = await getAssessments(universityId, undefined, 'published');
  const filtered = all.filter(
    a => a.status === 'published' && (a.studyLevelId === studyLevelId || !a.studyLevelId || a.studyLevelId === 'ALL')
  );
  // Trigger background offline caching for these published assessments
  prefetchAssessmentsForOffline(filtered).catch(() => {});
  return filtered;
}

export async function fetchPublicQuestionsForAssessment(questionIds: string[]): Promise<AssessmentQuestionPublic[]> {
  const defaultMap: Record<string, AssessmentQuestionPublic> = {};
  DEFAULT_PUBLIC_QUESTIONS.forEach(q => { defaultMap[q.id] = q; });

  // Fetch all questions in parallel with local offline cache fallback
  const fetched = await Promise.all(
    questionIds.map(async (qId) => {
      const cacheKey = `${LOCAL_STORAGE_PREFIX}public_q_${qId}`;
      try {
        if (typeof navigator === 'undefined' || navigator.onLine) {
          const snap = await getDoc(doc(db, 'assessmentQuestions', qId));
          if (snap.exists()) {
            const d = snap.data() as AssessmentQuestionPublic;
            const item: AssessmentQuestionPublic = {
              id: d.id || qId,
              bankId: d.bankId,
              stemArabic: d.stemArabic,
              stemEnglish: d.stemEnglish,
              imageUrl: d.imageUrl,
              options: d.options,
              points: Number(d.points) || 5
            };
            try {
              localStorage.setItem(cacheKey, JSON.stringify(item));
            } catch (e) {}
            return item;
          }
        }
      } catch (e) {}

      // Fallback to cached public question in localStorage when offline
      try {
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) {
          return JSON.parse(cachedRaw) as AssessmentQuestionPublic;
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

  // Fetch public questions from Firestore or offline local cache
  let firestoreQuestions = await fetchPublicQuestionsForAssessment(questionIds);
  if (firestoreQuestions.length === 0) {
    try {
      const cachedSet = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}cached_questions_${assessmentId}`);
      if (cachedSet) {
        firestoreQuestions = JSON.parse(cachedSet) as AssessmentQuestionPublic[];
      }
    } catch (e) {}
  }

  // Check existing attempts for this student (merged remote + local offline attempts)
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

  if (typeof navigator === 'undefined' || navigator.onLine) {
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
  }

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

  // Always persist attempt locally first so offline progress survives refreshes
  saveLocalStudentAttempt(uid, attempt);

  // Persist attempt to Firestore when online
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      await setDoc(doc(db, 'assessmentAttempts', attempt.id), attempt);
    } catch (e) {}
  }

  const questionsToUse = serverQuestions.length > 0 ? serverQuestions : firestoreQuestions;
  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_PREFIX}cached_questions_${assessmentId}`,
      JSON.stringify(questionsToUse)
    );
  } catch (e) {}

  return {
    attempt,
    questions: questionsToUse
  };
}

export async function saveProgressServer(attemptId: string, answers: Record<string, string>): Promise<string> {
  const nowIso = new Date().toISOString();
  const uid = auth.currentUser?.uid || 'student-user';

  // 1. Always save progress immediately to local storage so zero answers are lost offline
  try {
    const localAttempts = readLocalStudentAttempts(uid);
    const target = localAttempts.find((a) => a.id === attemptId);
    if (target) {
      saveLocalStudentAttempt(uid, {
        ...target,
        answers,
        lastSavedAt: nowIso
      });
    }
    localStorage.setItem(
      `${LOCAL_STORAGE_PREFIX}progress_${attemptId}`,
      JSON.stringify({ attemptId, uid, answers, lastSavedAt: nowIso })
    );
  } catch (e) {}

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return nowIso;
  }

  // 2. Save to Firestore when online
  try {
    await updateDoc(doc(db, 'assessmentAttempts', attemptId), {
      answers,
      lastSavedAt: nowIso
    });
  } catch (e) {}

  // 3. Sync with backend API
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

export interface SubmitAttemptExtraOptions {
  durationSeconds?: number;
  studentDisplayNamePublic?: string;
  studentUsername?: string;
  leaderboardNameMode?: LeaderboardNameMode;
  isGuestPreview?: boolean;
}

export async function submitAttemptServer(
  attemptId: string,
  answers: Record<string, string>,
  assessmentObj?: Assessment,
  studentNameArabic?: string,
  extraOptions?: SubmitAttemptExtraOptions
): Promise<{
  result: AssessmentResult;
  isReleased: boolean;
  queuedOffline?: boolean;
}> {
  const token = await getIdTokenSafe();
  const isGuestPreview = Boolean(extraOptions?.isGuestPreview || !auth.currentUser);
  const uid = isGuestPreview ? 'guest' : (auth.currentUser?.uid || 'student-user');
  const studentName = studentNameArabic || auth.currentUser?.displayName || auth.currentUser?.email || 'زائر تجريبي';
  const assessmentId = assessmentObj?.id || 'asmnt-cvs-midterm';
  const releasePolicy = isGuestPreview ? 'immediate' : (assessmentObj?.resultReleasePolicy || 'immediate');
  const questionIds = assessmentObj?.questionIds?.length
    ? assessmentObj.questionIds
    : ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];
  const totalPoints = Number(assessmentObj?.totalPoints) || questionIds.length * 5;

  // Resolve student's chosen leaderboard display identity
  const savedIdentity = getStudentLeaderboardIdentity(uid);
  const effectiveNameMode: LeaderboardNameMode =
    extraOptions?.leaderboardNameMode || savedIdentity.leaderboardNameMode || 'full_name';
  const effectiveUsername =
    extraOptions?.studentUsername !== undefined ? extraOptions.studentUsername : savedIdentity.username;
  const effectiveDisplayNamePublic =
    extraOptions?.studentDisplayNamePublic ||
    formatStudentLeaderboardName({
      uid,
      fullNameArabic: studentName,
      username: effectiveUsername,
      mode: effectiveNameMode
    });
  const effectiveDurationSeconds =
    typeof extraOptions?.durationSeconds === 'number' && extraOptions.durationSeconds >= 0
      ? Math.round(extraOptions.durationSeconds)
      : undefined;

  let finalResult: AssessmentResult | null = null;
  let scoredOnServer = false;

  const fallbackAnswerKeys = await resolveFallbackAnswerKeys(assessmentId, questionIds);

  // 1. Score via Trusted Backend API (where answer keys reside securely) when online
  if (typeof navigator === 'undefined' || navigator.onLine) {
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
          studentDisplayNamePublic: effectiveDisplayNamePublic,
          studentUsername: effectiveUsername,
          leaderboardNameMode: effectiveNameMode,
          durationSeconds: effectiveDurationSeconds,
          resultReleasePolicy: releasePolicy,
          questionIds,
          fallbackAnswerKeys,
          isGuestPreview
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.result) {
          finalResult = {
            ...data.result,
            isReleased: isGuestPreview ? true : data.result.isReleased,
            studentDisplayNamePublic: data.result.studentDisplayNamePublic || effectiveDisplayNamePublic,
            studentUsername: data.result.studentUsername || effectiveUsername,
            leaderboardNameMode: data.result.leaderboardNameMode || effectiveNameMode,
            durationSeconds: data.result.durationSeconds ?? effectiveDurationSeconds
          };
          scoredOnServer = true;
        }
      }
    } catch (e) {}
  }

  // 2. If offline or API unreachable, try client-side Firestore answer key grading or local bundle fallback keys
  if (!finalResult) {
    try {
      const resolvedKeyMap: Record<string, { correctOptionId: string; points: number }> = {
        ...fallbackAnswerKeys
      };

      if (typeof navigator === 'undefined' || navigator.onLine) {
        const keyDocs = await Promise.all(
          questionIds.map((qId) => getDoc(doc(db, 'questionAnswerKeys', qId)).catch(() => null))
        );
        const validKeys = keyDocs.filter((d) => d && d.exists());
        validKeys.forEach((snap) => {
          if (!snap) return;
          const k = snap.data() as QuestionAnswerKey;
          if (k && k.questionId && k.correctOptionId) {
            resolvedKeyMap[k.questionId] = {
              correctOptionId: k.correctOptionId,
              points: Number(k.points) || 5
            };
          }
        });
      }

      if (Object.keys(resolvedKeyMap).length > 0) {
        let earned = 0;
        let maxPts = 0;
        questionIds.forEach((qId) => {
          const k = resolvedKeyMap[qId];
          const pts = Number(k?.points) || 5;
          maxPts += pts;
          if (k && answers[qId] && answers[qId] === k.correctOptionId) {
            earned += pts;
          }
        });
        const nowIso = new Date().toISOString();
        const isReleased = releasePolicy === 'immediate';
        const finalTotal = maxPts || totalPoints;
        finalResult = {
          id: `res-${attemptId}`,
          attemptId,
          assessmentId,
          uid,
          studentNameArabic: studentName,
          studentDisplayNamePublic: effectiveDisplayNamePublic,
          studentUsername: effectiveUsername,
          leaderboardNameMode: effectiveNameMode,
          durationSeconds: effectiveDurationSeconds,
          score: earned,
          totalPoints: finalTotal,
          percentage: finalTotal > 0 ? Math.round((earned / finalTotal) * 100) : 0,
          submittedAt: nowIso,
          gradedAt: nowIso,
          isReleased,
          releasedAt: isReleased ? nowIso : undefined
        };
        if (typeof navigator === 'undefined' || navigator.onLine) {
          scoredOnServer = true;
        }
      }
    } catch (e) {}
  }

  const queuedOffline = !scoredOnServer;

  // 3. Fallback offline provisional result + enqueue for automatic cloud grading/sync when internet returns
  if (!finalResult) {
    const nowIso = new Date().toISOString();
    const isReleased = releasePolicy === 'immediate';
    finalResult = {
      id: `res-${attemptId}`,
      attemptId,
      assessmentId,
      uid,
      studentNameArabic: studentName,
      studentDisplayNamePublic: effectiveDisplayNamePublic,
      studentUsername: effectiveUsername,
      leaderboardNameMode: effectiveNameMode,
      durationSeconds: effectiveDurationSeconds,
      score: 0,
      totalPoints,
      percentage: 0,
      submittedAt: nowIso,
      gradedAt: nowIso,
      isReleased,
      releasedAt: isReleased ? nowIso : undefined
    };
  }

  // If this is an unauthenticated guest solving the exam, return their graded score immediately
  // without adding a fake guest entry to the official student leaderboard until they create an account.
  if (isGuestPreview) {
    return {
      result: {
        ...finalResult,
        isReleased: true
      },
      isReleased: true,
      queuedOffline: false
    };
  }

  if (queuedOffline) {
    const nowIso = new Date().toISOString();
    const existingOutbox = readOfflineExamOutbox().filter((item) => item.attemptId !== attemptId);
    existingOutbox.push({
      attemptId,
      assessmentId,
      uid,
      studentNameArabic: studentName,
      answers,
      resultReleasePolicy: releasePolicy,
      questionIds,
      totalPoints,
      queuedAt: nowIso,
      type: 'final_submit'
    });
    writeOfflineExamOutbox(existingOutbox);
  }

  // Save finalized attempt locally
  const localAttempts = readLocalStudentAttempts(uid);
  const existingAttempt = localAttempts.find((a) => a.id === attemptId);
  saveLocalStudentAttempt(uid, {
    ...(existingAttempt || {
      id: attemptId,
      assessmentId,
      uid,
      startedAt: finalResult.submittedAt,
      expiresAt: finalResult.submittedAt,
      lastSavedAt: finalResult.submittedAt,
      attemptNumber: 1
    }),
    answers,
    status: 'scored',
    submittedAt: finalResult.submittedAt,
    durationSeconds: effectiveDurationSeconds
  });

  try {
    const localKey = `${LOCAL_STORAGE_PREFIX}results_${uid}`;
    const raw = localStorage.getItem(localKey);
    const prev: AssessmentResult[] = raw ? JSON.parse(raw) : [];
    const updated = [finalResult, ...prev.filter(r => r.id !== finalResult!.id)];
    localStorage.setItem(localKey, JSON.stringify(updated));
  } catch (e) {}

  try {
    const lbKey = `${LOCAL_STORAGE_PREFIX}leaderboard_${assessmentId}`;
    const rawLb = localStorage.getItem(lbKey);
    const prevLb: AssessmentResult[] = rawLb ? JSON.parse(rawLb) : [];
    const updatedLb = [finalResult, ...prevLb.filter(r => r.id !== finalResult!.id)];
    localStorage.setItem(lbKey, JSON.stringify(updatedLb));
  } catch (e) {}

  if (!queuedOffline) {
    // Persist finalized attempt (including scoredResult for cross-device persistence) to Cloud Firestore
    try {
      await setDoc(doc(db, 'assessmentAttempts', attemptId), cleanFirestoreData({
        id: attemptId,
        assessmentId,
        uid,
        answers,
        status: 'scored',
        submittedAt: finalResult.submittedAt,
        durationSeconds: effectiveDurationSeconds,
        scoredResult: finalResult
      }), { merge: true });
    } catch (e) {}

    try {
      await setDoc(doc(db, 'assessmentResults', finalResult.id), cleanFirestoreData(finalResult), { merge: true });
    } catch (e) {}

    // Mirror released result to public leaderboard document in uniqueIdentifiers (readable across all devices)
    if (finalResult.isReleased) {
      mirrorResultToPublicLeaderboard(assessmentId, finalResult).catch(() => {});
    }

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
  }

  return {
    result: finalResult,
    isReleased: finalResult.isReleased,
    queuedOffline
  };
}

/**
 * Automatically flushes queued offline exam submissions to the server & Firestore
 * as soon as internet connectivity is restored.
 */
export async function flushOfflineExamSubmissions(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  if (isFlushingExamOutbox) return 0;

  const queue = readOfflineExamOutbox();
  if (queue.length === 0) return 0;

  isFlushingExamOutbox = true;
  notifyExamSyncListeners();

  let syncedCount = 0;
  const remaining: OfflineExamSubmissionRecord[] = [];

  for (const item of queue) {
    try {
      const token = await getIdTokenSafe();
      let syncedResult: AssessmentResult | null = null;

      const res = await fetch('/api/assessments/submit-attempt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          attemptId: item.attemptId,
          assessmentId: item.assessmentId,
          answers: item.answers,
          studentNameArabic: item.studentNameArabic,
          resultReleasePolicy: item.resultReleasePolicy,
          questionIds: item.questionIds
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.result) {
          syncedResult = data.result;
        }
      }

      if (!syncedResult) {
        // Fallback to Firestore answer keys if API endpoint didn't score
        const keyDocs = await Promise.all(
          item.questionIds.map((qId) => getDoc(doc(db, 'questionAnswerKeys', qId)).catch(() => null))
        );
        const validKeys = keyDocs.filter((d) => d && d.exists());
        if (validKeys.length > 0) {
          let earned = 0;
          let maxPts = 0;
          validKeys.forEach((snap) => {
            if (!snap) return;
            const k = snap.data() as QuestionAnswerKey;
            const pts = Number(k.points) || 5;
            maxPts += pts;
            if (item.answers[k.questionId] && item.answers[k.questionId] === k.correctOptionId) {
              earned += pts;
            }
          });
          const nowIso = new Date().toISOString();
          const isReleased = item.resultReleasePolicy === 'immediate';
          const finalTotal = maxPts || item.totalPoints;
          syncedResult = {
            id: `res-${item.attemptId}`,
            attemptId: item.attemptId,
            assessmentId: item.assessmentId,
            uid: item.uid,
            studentNameArabic: item.studentNameArabic,
            score: earned,
            totalPoints: finalTotal,
            percentage: finalTotal > 0 ? Math.round((earned / finalTotal) * 100) : 0,
            submittedAt: item.queuedAt,
            gradedAt: nowIso,
            isReleased,
            releasedAt: isReleased ? nowIso : undefined
          };
        }
      }

      if (syncedResult) {
        await setDoc(doc(db, 'assessmentAttempts', item.attemptId), cleanFirestoreData({
          id: item.attemptId,
          assessmentId: item.assessmentId,
          uid: item.uid,
          answers: item.answers,
          status: 'scored',
          submittedAt: syncedResult.submittedAt,
          scoredResult: syncedResult
        }), { merge: true });

        await setDoc(doc(db, 'assessmentResults', syncedResult.id), cleanFirestoreData(syncedResult), { merge: true });

        // Update local cached results for this student
        try {
          const localKey = `${LOCAL_STORAGE_PREFIX}results_${item.uid}`;
          const raw = localStorage.getItem(localKey);
          const prev: AssessmentResult[] = raw ? JSON.parse(raw) : [];
          const updated = [syncedResult, ...prev.filter((r) => r.id !== syncedResult!.id)];
          localStorage.setItem(localKey, JSON.stringify(updated));
        } catch (e) {}

        syncedCount++;
      } else {
        remaining.push(item);
      }
    } catch (e) {
      remaining.push(item);
    }
  }

  isFlushingExamOutbox = false;
  writeOfflineExamOutbox(remaining);
  return syncedCount;
}

export function startExamOfflineAutoSync(): void {
  if (typeof window === 'undefined' || examAutoSyncStarted) return;
  examAutoSyncStarted = true;

  window.addEventListener('online', () => {
    flushOfflineExamSubmissions().catch(() => {});
  });

  setInterval(() => {
    if (navigator.onLine && readOfflineExamOutbox().length > 0) {
      flushOfflineExamSubmissions().catch(() => {});
    }
  }, 15000);
}

if (typeof window !== 'undefined') {
  startExamOfflineAutoSync();
}

export async function getStudentAttempts(uid: string): Promise<AssessmentAttempt[]> {
  const localList = readLocalStudentAttempts(uid);
  const attemptsMap: Record<string, AssessmentAttempt> = {};
  localList.forEach((a) => {
    if (a && a.id) attemptsMap[a.id] = a;
  });

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const q = query(
        collection(db, 'assessmentAttempts'),
        where('uid', '==', uid)
      );
      const snap = await getDocs(q);
      snap.forEach(d => {
        const remote = { id: d.id, ...d.data() } as AssessmentAttempt;
        const existingLocal = attemptsMap[remote.id];
        if (existingLocal && existingLocal.status === 'scored' && remote.status !== 'scored') {
          return;
        }
        attemptsMap[remote.id] = remote;
      });
    } catch (err) {}
  }

  const merged = Object.values(attemptsMap);
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}attempts_${uid}`, JSON.stringify(merged));
  } catch (e) {}
  return merged;
}

export async function getStudentResults(uid: string): Promise<AssessmentResult[]> {
  // Flush any pending offline submissions first if we are online
  if (typeof navigator === 'undefined' || navigator.onLine) {
    if (readOfflineExamOutbox().length > 0) {
      await flushOfflineExamSubmissions().catch(() => {});
    }
  }

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

// ---------------------------------------------------------------------------
// 4. Student Display Name / Username Visibility & Ranked Leaderboard Engine
// ---------------------------------------------------------------------------

export interface StudentLeaderboardIdentity {
  username: string;
  leaderboardNameMode: LeaderboardNameMode;
}

const LEADERBOARD_IDENTITY_PREFIX = 'umed_leaderboard_identity_';
const GUEST_LEADERBOARD_IDENTITY_KEY = 'umed_guest_leaderboard_identity_v1';

export function getStudentLeaderboardIdentity(uid?: string): StudentLeaderboardIdentity {
  try {
    if (uid) {
      const raw = localStorage.getItem(`${LEADERBOARD_IDENTITY_PREFIX}${uid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          username: String(parsed.username || '').trim(),
          leaderboardNameMode: (parsed.leaderboardNameMode as LeaderboardNameMode) || 'full_name'
        };
      }
    }
    const guestRaw = localStorage.getItem(GUEST_LEADERBOARD_IDENTITY_KEY);
    if (guestRaw) {
      const parsed = JSON.parse(guestRaw);
      return {
        username: String(parsed.username || '').trim(),
        leaderboardNameMode: (parsed.leaderboardNameMode as LeaderboardNameMode) || 'full_name'
      };
    }
  } catch (e) {}
  return {
    username: '',
    leaderboardNameMode: 'full_name'
  };
}

export function formatStudentLeaderboardName(params: {
  uid?: string;
  fullNameArabic?: string;
  username?: string;
  mode?: LeaderboardNameMode;
}): string {
  const rawFull = (params.fullNameArabic || 'طالب طب بشري').replace(/^د\.\s*/, '').trim() || 'طالب طب بشري';
  const rawUser = (params.username || '').trim();
  const mode: LeaderboardNameMode = params.mode || 'full_name';

  if (mode === 'custom_username') {
    if (rawUser) {
      return rawUser.startsWith('@') ? rawUser : `@${rawUser}`;
    }
    return `د. ${rawFull}`;
  }

  if (mode === 'abbreviated') {
    const parts = rawFull.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      return `د. ${first} ${last.charAt(0)}.`;
    }
    return `د. ${rawFull}`;
  }

  if (mode === 'anonymous_code') {
    const seed = params.uid || rawFull || 'UMED';
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) & 0xffff;
    }
    const code = hash.toString(16).toUpperCase().padStart(4, '0').slice(-4);
    return `طبيب متميز #${code}`;
  }

  // Default: 'full_name'
  return `د. ${rawFull}`;
}

export function resolveResultPublicDisplayName(result: AssessmentResult): string {
  if (result.studentDisplayNamePublic && result.studentDisplayNamePublic.trim()) {
    return result.studentDisplayNamePublic.trim();
  }
  return formatStudentLeaderboardName({
    uid: result.uid,
    fullNameArabic: result.studentNameArabic,
    username: result.studentUsername,
    mode: result.leaderboardNameMode || 'full_name'
  });
}

export async function saveStudentLeaderboardIdentity(
  uid: string | undefined,
  identity: StudentLeaderboardIdentity,
  fullNameArabic?: string
): Promise<string> {
  const cleaned: StudentLeaderboardIdentity = {
    username: (identity.username || '').trim(),
    leaderboardNameMode: identity.leaderboardNameMode || 'full_name'
  };

  try {
    localStorage.setItem(GUEST_LEADERBOARD_IDENTITY_KEY, JSON.stringify(cleaned));
    if (uid) {
      localStorage.setItem(`${LEADERBOARD_IDENTITY_PREFIX}${uid}`, JSON.stringify(cleaned));
    }
  } catch (e) {}

  const resolvedPublicName = formatStudentLeaderboardName({
    uid,
    fullNameArabic,
    username: cleaned.username,
    mode: cleaned.leaderboardNameMode
  });

  if (!uid) return resolvedPublicName;

  // Update local cached results for this student
  try {
    const localKey = `${LOCAL_STORAGE_PREFIX}results_${uid}`;
    const raw = localStorage.getItem(localKey);
    if (raw) {
      const prev: AssessmentResult[] = JSON.parse(raw);
      const updated = prev.map((r) => ({
        ...r,
        studentDisplayNamePublic: resolvedPublicName,
        studentUsername: cleaned.username,
        leaderboardNameMode: cleaned.leaderboardNameMode
      }));
      localStorage.setItem(localKey, JSON.stringify(updated));
    }
  } catch (e) {}

  if (typeof navigator === 'undefined' || navigator.onLine) {
    // 1. Update UserProfile in Firestore
    try {
      await setDoc(
        doc(db, 'users', uid),
        cleanFirestoreData({
          username: cleaned.username,
          leaderboardNameMode: cleaned.leaderboardNameMode,
          updatedAt: new Date().toISOString()
        }),
        { merge: true }
      );
    } catch (e) {}

    // 2. Update existing assessmentResults in Firestore for this student
    try {
      const q = query(collection(db, 'assessmentResults'), where('uid', '==', uid));
      const snap = await getDocs(q);
      await Promise.all(
        snap.docs.map((d) =>
          updateDoc(doc(db, 'assessmentResults', d.id), {
            studentDisplayNamePublic: resolvedPublicName,
            studentUsername: cleaned.username,
            leaderboardNameMode: cleaned.leaderboardNameMode
          }).catch(() => {})
        )
      );
    } catch (e) {}

    // 3. Sync with backend results store
    try {
      const token = await getIdTokenSafe();
      await fetch('/api/assessments/update-leaderboard-name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          uid,
          studentDisplayNamePublic: resolvedPublicName,
          studentUsername: cleaned.username,
          leaderboardNameMode: cleaned.leaderboardNameMode
        })
      });
    } catch (e) {}
  }

  return resolvedPublicName;
}

/**
 * Sorts and deduplicates results for the competitive student leaderboard:
 * 1) Highest percentage DESC
 * 2) Highest score DESC
 * 3) Fastest completion durationSeconds ASC
 * 4) Earliest submittedAt ASC
 */
export function sortResultsForLeaderboard(results: AssessmentResult[]): AssessmentResult[] {
  const bestByStudent = new Map<string, AssessmentResult>();

  for (const r of results) {
    if (!r || !r.isReleased) continue;
    const key = r.uid || r.id;
    const existing = bestByStudent.get(key);
    if (!existing) {
      bestByStudent.set(key, r);
      continue;
    }

    const rPct = Number(r.percentage) || 0;
    const exPct = Number(existing.percentage) || 0;
    if (rPct > exPct) {
      bestByStudent.set(key, r);
    } else if (rPct === exPct) {
      const rScore = Number(r.score) || 0;
      const exScore = Number(existing.score) || 0;
      if (rScore > exScore) {
        bestByStudent.set(key, r);
      } else if (rScore === exScore) {
        const rDur = typeof r.durationSeconds === 'number' ? r.durationSeconds : 999999;
        const exDur = typeof existing.durationSeconds === 'number' ? existing.durationSeconds : 999999;
        if (rDur < exDur) {
          bestByStudent.set(key, r);
        }
      }
    }
  }

  return Array.from(bestByStudent.values()).sort((a, b) => {
    const pctDiff = (Number(b.percentage) || 0) - (Number(a.percentage) || 0);
    if (pctDiff !== 0) return pctDiff;
    const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const durA = typeof a.durationSeconds === 'number' ? a.durationSeconds : 999999;
    const durB = typeof b.durationSeconds === 'number' ? b.durationSeconds : 999999;
    if (durA !== durB) return durA - durB;
    return new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime();
  });
}

export async function getAssessmentLeaderboard(assessmentId: string): Promise<AssessmentResult[]> {
  const resultsMap: Record<string, AssessmentResult> = {};
  const lbCacheKey = `${LOCAL_STORAGE_PREFIX}leaderboard_${assessmentId}`;

  // 1. Load local cached leaderboard first
  try {
    const raw = localStorage.getItem(lbCacheKey);
    if (raw) {
      const cached: AssessmentResult[] = JSON.parse(raw);
      cached.forEach((r) => {
        if (r && r.id && r.isReleased) resultsMap[r.id] = r;
      });
    }
  } catch (e) {}

  // 2. Also include current user's local results for this assessment
  try {
    const currentUid = auth.currentUser?.uid;
    if (currentUid) {
      const ownRaw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}results_${currentUid}`);
      if (ownRaw) {
        const ownList: AssessmentResult[] = JSON.parse(ownRaw);
        ownList.forEach((r) => {
          if (r && r.id && r.assessmentId === assessmentId && r.isReleased) {
            resultsMap[r.id] = r;
          }
        });
      }
    }
  } catch (e) {}

  if (typeof navigator === 'undefined' || navigator.onLine) {
    // 3. Query Firestore assessmentResults
    try {
      const q = query(
        collection(db, 'assessmentResults'),
        where('assessmentId', '==', assessmentId)
      );
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const data = { id: d.id, ...d.data() } as AssessmentResult;
        if (data.isReleased) {
          resultsMap[data.id] = data;
        }
      });
    } catch (e) {}

    // 3b. Query Public Leaderboard Mirror in uniqueIdentifiers (100% readable on live umed-yemen)
    try {
      const pubLbSnap = await getDoc(doc(db, 'uniqueIdentifiers', `shared_lb_${assessmentId}`));
      if (pubLbSnap.exists()) {
        const lbData = pubLbSnap.data();
        if (Array.isArray(lbData?.results)) {
          lbData.results.forEach((r: AssessmentResult) => {
            if (r && r.id && r.isReleased) {
              resultsMap[r.id] = r;
            }
          });
        }
      }
    } catch (e) {}

    // 4. Query Backend API results
    try {
      const res = await fetch(`/api/assessments/results?assessmentId=${encodeURIComponent(assessmentId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results)) {
          data.results.forEach((r: AssessmentResult) => {
            if (r && r.id && r.isReleased && !(r as any).isPendingRelease) {
              resultsMap[r.id] = r;
            }
          });
        }
      }
    } catch (e) {}
  }

  const sorted = sortResultsForLeaderboard(Object.values(resultsMap));
  try {
    localStorage.setItem(lbCacheKey, JSON.stringify(sorted));
  } catch (e) {}

  return sorted;
}

async function mirrorResultToPublicLeaderboard(assessmentId: string, newResult: AssessmentResult): Promise<void> {
  if (!assessmentId || !newResult?.isReleased) return;
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) return;

  try {
    const docRef = doc(db, 'uniqueIdentifiers', `shared_lb_${assessmentId}`);
    const existingSnap = await getDoc(docRef).catch(() => null);
    const prevResults: AssessmentResult[] =
      existingSnap && existingSnap.exists() && Array.isArray(existingSnap.data()?.results)
        ? existingSnap.data()!.results
        : [];
    const merged = sortResultsForLeaderboard([...prevResults, newResult]).slice(0, 50);
    await setDoc(
      docRef,
      cleanFirestoreData({
        uid: currentUid,
        type: 'shared_leaderboard',
        assessmentId,
        results: merged,
        updatedAt: new Date().toISOString()
      }),
      { merge: true }
    );
  } catch (e) {}
}

export function subscribeToAssessmentLeaderboard(
  assessmentId: string,
  onUpdate: (ranked: AssessmentResult[]) => void
): () => void {
  if (!assessmentId) return () => {};
  let unsubResults = () => {};
  let unsubMirror = () => {};

  try {
    const q = query(
      collection(db, 'assessmentResults'),
      where('assessmentId', '==', assessmentId)
    );
    unsubResults = onSnapshot(
      q,
      (snap) => {
        const items: AssessmentResult[] = [];
        snap.forEach((d) => {
          const data = { id: d.id, ...d.data() } as AssessmentResult;
          if (data.isReleased) items.push(data);
        });
        const ranked = sortResultsForLeaderboard(items);
        if (ranked.length > 0) {
          try {
            localStorage.setItem(`${LOCAL_STORAGE_PREFIX}leaderboard_${assessmentId}`, JSON.stringify(ranked));
          } catch (e) {}
          onUpdate(ranked);
        }
      },
      () => {}
    );
  } catch {}

  try {
    unsubMirror = onSnapshot(
      doc(db, 'uniqueIdentifiers', `shared_lb_${assessmentId}`),
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.results)) {
          const ranked = sortResultsForLeaderboard(snap.data()!.results);
          if (ranked.length > 0) {
            try {
              localStorage.setItem(`${LOCAL_STORAGE_PREFIX}leaderboard_${assessmentId}`, JSON.stringify(ranked));
            } catch (e) {}
            onUpdate(ranked);
          }
        }
      },
      () => {}
    );
  } catch {}

  return () => {
    unsubResults();
    unsubMirror();
  };
}

// ---------------------------------------------------------------------------
// 5. Shareable Trial Exam Link & Guest Solving with Mandatory Account Gate
// ---------------------------------------------------------------------------

export interface PendingGuestExamSubmission {
  assessmentId: string;
  assessment: Assessment;
  answers: Record<string, string>;
  startedAt: string;
  submittedAt: string;
  durationSeconds: number;
  preferredUsername?: string;
  preferredNameMode?: LeaderboardNameMode;
  scoredResult?: AssessmentResult;
}

interface SharedAssessmentBundle {
  assessment: Assessment;
  questions: AssessmentQuestionPublic[];
  answerKeyMap?: Record<string, { correctOptionId: string; points: number }>;
  updatedAt: string;
}

const PENDING_GUEST_SUBMISSION_KEY = 'umed_pending_guest_exam_submission_v1';
const PENDING_SHARED_ASSESSMENT_ID_KEY = 'umed_pending_shared_assessment_id_v1';
const SHARED_BUNDLE_CACHE_PREFIX = 'umed_shared_bundle_';

const DEFAULT_ANSWER_KEYS_MAP: Record<string, { correctOptionId: string; points: number }> = {
  'q-cvs-1': { correctOptionId: 'opt-b', points: 5 },
  'q-cvs-2': { correctOptionId: 'opt-a', points: 5 },
  'q-cvs-3': { correctOptionId: 'opt-a', points: 5 }
};

function encodeBase64Utf8(jsonStr: string): string {
  try {
    const bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

function decodeBase64Utf8(encoded: string): string {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    const binary = atob(base64 + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function findLocalAssessmentById(assessmentId: string): Assessment | null {
  const normalizedId = assessmentId === 'exam-cvs-midterm' ? 'asmnt-cvs-midterm' : assessmentId;
  const fromDefault = DEFAULT_ASSESSMENTS.find((a) => a.id === normalizedId || a.id === assessmentId);
  if (fromDefault) return fromDefault;

  try {
    const rawBundle = localStorage.getItem(`${SHARED_BUNDLE_CACHE_PREFIX}${assessmentId}`);
    if (rawBundle) {
      const parsed = JSON.parse(rawBundle) as SharedAssessmentBundle;
      if (parsed?.assessment?.id) return parsed.assessment;
    }
  } catch {}

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${LOCAL_STORAGE_PREFIX}assessments_`)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw) as Assessment[];
          const match = Array.isArray(list) ? list.find((a) => a && a.id === assessmentId) : null;
          if (match) return match;
        }
      }
    }
  } catch {}

  return null;
}

function findLocalQuestionsForAssessmentSync(
  assessment: Assessment
): {
  publicQuestions: AssessmentQuestionPublic[];
  answerKeyMap: Record<string, { correctOptionId: string; points: number }>;
} {
  const qIds = assessment.questionIds?.length ? assessment.questionIds : ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];
  const pubMap = new Map<string, AssessmentQuestionPublic>();
  const keyMap: Record<string, { correctOptionId: string; points: number }> = {
    ...DEFAULT_ANSWER_KEYS_MAP
  };

  DEFAULT_PUBLIC_QUESTIONS.forEach((q) => pubMap.set(q.id, q));

  try {
    const rawBundle = localStorage.getItem(`${SHARED_BUNDLE_CACHE_PREFIX}${assessment.id}`);
    if (rawBundle) {
      const parsed = JSON.parse(rawBundle) as SharedAssessmentBundle;
      parsed.questions?.forEach((q) => {
        if (q && q.id) pubMap.set(q.id, q);
      });
      if (parsed.answerKeyMap) {
        Object.assign(keyMap, parsed.answerKeyMap);
      }
    }
  } catch {}

  try {
    const cachedSet = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}cached_questions_${assessment.id}`);
    if (cachedSet) {
      const list = JSON.parse(cachedSet) as AssessmentQuestionPublic[];
      if (Array.isArray(list)) {
        list.forEach((q) => {
          if (q && q.id) pubMap.set(q.id, q);
        });
      }
    }
  } catch {}

  for (const qId of qIds) {
    try {
      const rawPub = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}public_q_${qId}`);
      if (rawPub) {
        const parsed = JSON.parse(rawPub) as AssessmentQuestionPublic;
        if (parsed && parsed.id) pubMap.set(parsed.id, parsed);
      }
    } catch {}
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('umed_assessment_q_') && !key.startsWith('umed_assessment_q_init_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw) as QuestionItemFull[];
          if (Array.isArray(list)) {
            list.forEach((fullQ) => {
              if (fullQ && fullQ.id) {
                pubMap.set(fullQ.id, sanitizePublicQuestion(fullQ));
                if (fullQ.correctOptionId) {
                  keyMap[fullQ.id] = {
                    correctOptionId: fullQ.correctOptionId,
                    points: Number(fullQ.points) || 5
                  };
                }
              }
            });
          }
        }
      }
    }
  } catch {}

  const resolved: AssessmentQuestionPublic[] = [];
  for (const qId of qIds) {
    const found = pubMap.get(qId);
    if (found) resolved.push(found);
  }

  return {
    publicQuestions: resolved.length > 0 ? resolved : DEFAULT_PUBLIC_QUESTIONS,
    answerKeyMap: keyMap
  };
}

async function resolveFallbackAnswerKeys(
  assessmentId: string,
  questionIds: string[]
): Promise<Record<string, { correctOptionId: string; points: number }>> {
  const keyMap: Record<string, { correctOptionId: string; points: number }> = {
    ...DEFAULT_ANSWER_KEYS_MAP
  };

  try {
    const rawBundle = localStorage.getItem(`${SHARED_BUNDLE_CACHE_PREFIX}${assessmentId}`);
    if (rawBundle) {
      const parsed = JSON.parse(rawBundle) as SharedAssessmentBundle;
      if (parsed?.answerKeyMap) {
        Object.assign(keyMap, parsed.answerKeyMap);
      }
    }
  } catch {}

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('umed_assessment_q_') && !key.startsWith('umed_assessment_q_init_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw) as QuestionItemFull[];
          if (Array.isArray(list)) {
            list.forEach((q) => {
              if (q && q.id && q.correctOptionId) {
                keyMap[q.id] = {
                  correctOptionId: q.correctOptionId,
                  points: Number(q.points) || 5
                };
              }
            });
          }
        }
      }
    }
  } catch {}

  const missingIds = questionIds.filter((id) => !keyMap[id]);
  if (missingIds.length > 0 && (typeof navigator === 'undefined' || navigator.onLine)) {
    try {
      const pubSnap = await getDoc(doc(db, 'uniqueIdentifiers', `shared_exam_${assessmentId}`));
      if (pubSnap.exists() && pubSnap.data()?.answerKeyMap) {
        Object.assign(keyMap, pubSnap.data()!.answerKeyMap);
      }
    } catch {}
  }

  return keyMap;
}

/**
 * Publishes a shared assessment snapshot to:
 * 1) Local bundle cache (`umed_shared_bundle_${id}`)
 * 2) Publicly readable Firestore collection (`uniqueIdentifiers/shared_exam_${id}`) which has `allow read: if true`
 * 3) Express Server public store (`/api/assessments/register-shared`)
 */
export async function publishSharedAssessmentSnapshot(
  assessment: Assessment,
  questionsInput?: (AssessmentQuestionPublic | QuestionItemFull)[]
): Promise<void> {
  if (!assessment || !assessment.id) return;

  const syncResolved = findLocalQuestionsForAssessmentSync(assessment);
  let publicQuestions = syncResolved.publicQuestions;
  const answerKeyMap: Record<string, { correctOptionId: string; points: number }> = {
    ...syncResolved.answerKeyMap
  };

  if (Array.isArray(questionsInput) && questionsInput.length > 0) {
    publicQuestions = questionsInput.map((q) => {
      if ('correctOptionId' in q && q.correctOptionId) {
        answerKeyMap[q.id] = {
          correctOptionId: q.correctOptionId,
          points: Number(q.points) || 5
        };
      }
      return {
        id: q.id,
        bankId: q.bankId,
        stemArabic: q.stemArabic,
        stemEnglish: q.stemEnglish,
        imageUrl: q.imageUrl,
        options: q.options,
        points: Number(q.points) || 5
      };
    });
  } else if (assessment.questionIds?.length) {
    const fetched = await fetchPublicQuestionsForAssessment(assessment.questionIds).catch(() => []);
    if (fetched.length > 0) {
      publicQuestions = fetched;
    }
  }

  const bundle: SharedAssessmentBundle = {
    assessment,
    questions: publicQuestions,
    answerKeyMap,
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(`${SHARED_BUNDLE_CACHE_PREFIX}${assessment.id}`, JSON.stringify(bundle));
  } catch {}

  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const currentUid = auth.currentUser?.uid;
  if (currentUid) {
    try {
      await setDoc(
        doc(db, 'uniqueIdentifiers', `shared_exam_${assessment.id}`),
        cleanFirestoreData({
          uid: currentUid,
          type: 'shared_assessment',
          assessmentId: assessment.id,
          assessment,
          questions: publicQuestions,
          answerKeyMap,
          updatedAt: bundle.updatedAt
        }),
        { merge: true }
      );
    } catch {}

    try {
      await setDoc(
        doc(db, 'system', `shared_exam_${assessment.id}`),
        cleanFirestoreData({
          assessmentId: assessment.id,
          assessment,
          questions: publicQuestions,
          answerKeyMap,
          updatedAt: bundle.updatedAt
        }),
        { merge: true }
      );
    } catch {}
  }

  try {
    const fullQuestionsPayload = publicQuestions.map((q) => ({
      ...q,
      correctOptionId: answerKeyMap[q.id]?.correctOptionId || 'opt-a'
    }));
    await fetch('/api/assessments/register-shared', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessment,
        questions: fullQuestionsPayload
      })
    });
  } catch {}
}

export function buildShareableAssessmentUrl(
  assessmentOrId: string | Assessment,
  questionsInput?: AssessmentQuestionPublic[]
): string {
  const rawId = typeof assessmentOrId === 'string' ? assessmentOrId : assessmentOrId.id;
  const assessmentId = rawId === 'exam-cvs-midterm' ? 'asmnt-cvs-midterm' : rawId;
  const assessmentObj =
    typeof assessmentOrId === 'object' && assessmentOrId !== null
      ? assessmentOrId
      : findLocalAssessmentById(assessmentId);

  let encodedBundle = '';
  if (assessmentObj) {
    const syncData = findLocalQuestionsForAssessmentSync(assessmentObj);
    const qs = (questionsInput && questionsInput.length > 0 ? questionsInput : syncData.publicQuestions).slice(0, 25);
    publishSharedAssessmentSnapshot(assessmentObj, qs).catch(() => {});

    // Embed compact self-contained snapshot so the link opens in 0ms on any browser/device even before Firestore connects
    const compactPayload = {
      a: {
        id: assessmentObj.id,
        t: assessmentObj.titleArabic,
        d: assessmentObj.descriptionArabic || '',
        ty: assessmentObj.assessmentType,
        u: assessmentObj.universityId,
        l: assessmentObj.studyLevelId,
        dm: assessmentObj.durationMinutes,
        et: assessmentObj.enableExamTimer,
        qd: assessmentObj.questionDurationSeconds,
        ca: assessmentObj.closesAt,
        oa: assessmentObj.opensAt,
        rp: assessmentObj.resultReleasePolicy,
        tp: assessmentObj.totalPoints,
        qIds: assessmentObj.questionIds
      },
      q: qs.map((item) => ({
        i: item.id,
        s: item.stemArabic,
        e: item.stemEnglish || '',
        p: item.points || 5,
        o: (item.options || []).map((opt) => ({ i: opt.id, t: opt.textArabic }))
      })),
      k: syncData.answerKeyMap
    };
    const candidate = encodeBase64Utf8(JSON.stringify(compactPayload));
    if (candidate && candidate.length <= 6000) {
      encodedBundle = candidate;
    }
  }

  if (typeof window === 'undefined') {
    return `?sharedAssessmentId=${encodeURIComponent(assessmentId)}${
      encodedBundle ? `&sharedExam=${encodeURIComponent(encodedBundle)}` : ''
    }`;
  }

  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('sharedAssessmentId', assessmentId);
  if (encodedBundle) {
    url.searchParams.set('sharedExam', encodedBundle);
  }
  url.hash = `sharedAssessmentId=${encodeURIComponent(assessmentId)}${
    encodedBundle ? `&sharedExam=${encodeURIComponent(encodedBundle)}` : ''
  }`;
  return url.toString();
}

function hydrateBundleFromCompactPayload(encoded: string, fallbackId?: string): string | null {
  if (!encoded) return null;
  try {
    const jsonStr = decodeBase64Utf8(encoded);
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !parsed.a) return null;

    const a = parsed.a;
    const assessmentId = String(a.id || fallbackId || 'asmnt-cvs-midterm');
    const reconstructedAssessment: Assessment = {
      id: assessmentId,
      titleArabic: a.t || 'اختبار طبي مشترك',
      descriptionArabic: a.d || '',
      assessmentType: a.ty === 'competition' ? 'competition' : 'exam',
      universityId: a.u || 'univ-dar-al-salam',
      programId: 'prog-mbbs',
      studyLevelId: a.l || 'lvl-4',
      durationMinutes: Number(a.dm) || 30,
      enableExamTimer: a.et !== false,
      questionDurationSeconds: a.qd ? Number(a.qd) : undefined,
      maxAttempts: 3,
      opensAt: a.oa || new Date(Date.now() - 3600000).toISOString(),
      closesAt: a.ca || new Date(Date.now() + 7 * 86400000).toISOString(),
      resultReleasePolicy: a.rp || 'immediate',
      status: 'published',
      questionIds: Array.isArray(a.qIds) ? a.qIds : [],
      totalPoints: Number(a.tp) || 15,
      createdBy: 'SHARED_LINK',
      createdAt: new Date().toISOString()
    };

    const reconstructedQuestions: AssessmentQuestionPublic[] = Array.isArray(parsed.q)
      ? parsed.q.map((item: any) => ({
          id: String(item.i),
          bankId: 'shared-bank',
          stemArabic: String(item.s || ''),
          stemEnglish: item.e ? String(item.e) : undefined,
          points: Number(item.p) || 5,
          options: Array.isArray(item.o)
            ? item.o.map((opt: any) => ({
                id: String(opt.i),
                textArabic: String(opt.t || '')
              }))
            : []
        }))
      : DEFAULT_PUBLIC_QUESTIONS;

    const bundle: SharedAssessmentBundle = {
      assessment: reconstructedAssessment,
      questions: reconstructedQuestions.length > 0 ? reconstructedQuestions : DEFAULT_PUBLIC_QUESTIONS,
      answerKeyMap: parsed.k || DEFAULT_ANSWER_KEYS_MAP,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(`${SHARED_BUNDLE_CACHE_PREFIX}${assessmentId}`, JSON.stringify(bundle));
    return assessmentId;
  } catch {
    return null;
  }
}

export function parseSharedAssessmentInput(rawInput: string): string | null {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  try {
    if (trimmed.includes('sharedAssessmentId=') || trimmed.startsWith('http')) {
      const urlObj = trimmed.startsWith('http')
        ? new URL(trimmed)
        : new URL(trimmed.startsWith('?') ? `https://umed.local/${trimmed}` : `https://umed.local/?${trimmed}`);
      const qId = urlObj.searchParams.get('sharedAssessmentId');
      const qExam = urlObj.searchParams.get('sharedExam');
      const hashStr = urlObj.hash ? urlObj.hash.replace(/^#/, '') : '';
      const hashParams = new URLSearchParams(hashStr);
      const hId = hashParams.get('sharedAssessmentId');
      const hExam = hashParams.get('sharedExam');

      const finalId = (qId || hId || '').trim();
      const finalExam = (qExam || hExam || '').trim();
      if (finalExam) {
        const hydratedId = hydrateBundleFromCompactPayload(finalExam, finalId);
        if (hydratedId) {
          sessionStorage.setItem(PENDING_SHARED_ASSESSMENT_ID_KEY, hydratedId);
          return hydratedId;
        }
      }
      if (finalId) {
        const normalized = finalId === 'exam-cvs-midterm' ? 'asmnt-cvs-midterm' : finalId;
        sessionStorage.setItem(PENDING_SHARED_ASSESSMENT_ID_KEY, normalized);
        return normalized;
      }
    }
  } catch {}

  const normalized = trimmed === 'exam-cvs-midterm' ? 'asmnt-cvs-midterm' : trimmed;
  sessionStorage.setItem(PENDING_SHARED_ASSESSMENT_ID_KEY, normalized);
  return normalized;
}

export function getSharedAssessmentIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const hashRaw = window.location.hash ? window.location.hash.replace(/^#/, '') : '';
    const hashParams = new URLSearchParams(hashRaw);

    const fromQuery = params.get('sharedAssessmentId') || hashParams.get('sharedAssessmentId');
    const sharedExamEncoded = params.get('sharedExam') || hashParams.get('sharedExam');

    if (sharedExamEncoded) {
      const hydratedId = hydrateBundleFromCompactPayload(sharedExamEncoded, fromQuery || undefined);
      if (hydratedId) {
        sessionStorage.setItem(PENDING_SHARED_ASSESSMENT_ID_KEY, hydratedId);
        return hydratedId;
      }
    }

    if (fromQuery && fromQuery.trim()) {
      const normalized =
        fromQuery.trim() === 'exam-cvs-midterm' ? 'asmnt-cvs-midterm' : fromQuery.trim();
      sessionStorage.setItem(PENDING_SHARED_ASSESSMENT_ID_KEY, normalized);
      return normalized;
    }

    const saved = sessionStorage.getItem(PENDING_SHARED_ASSESSMENT_ID_KEY);
    if (saved && saved.trim()) {
      return saved.trim() === 'exam-cvs-midterm' ? 'asmnt-cvs-midterm' : saved.trim();
    }
  } catch (e) {}
  return null;
}

export function clearSharedAssessmentIdFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_SHARED_ASSESSMENT_ID_KEY);
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('sharedAssessmentId')) {
      url.searchParams.delete('sharedAssessmentId');
      changed = true;
    }
    if (url.searchParams.has('sharedExam')) {
      url.searchParams.delete('sharedExam');
      changed = true;
    }
    if (url.hash && url.hash.includes('sharedAssessmentId')) {
      url.hash = '';
      changed = true;
    }
    if (changed) {
      window.history.replaceState({}, '', url.toString());
    }
  } catch (e) {}
}

export function getCachedSharedAssessmentSync(
  assessmentId: string
): { assessment: Assessment; questions: AssessmentQuestionPublic[] } | null {
  if (!assessmentId) return null;
  const normalizedId = assessmentId === 'exam-cvs-midterm' ? 'asmnt-cvs-midterm' : assessmentId;

  try {
    const rawBundle = localStorage.getItem(`${SHARED_BUNDLE_CACHE_PREFIX}${normalizedId}`);
    if (rawBundle) {
      const parsed = JSON.parse(rawBundle) as SharedAssessmentBundle;
      if (parsed?.assessment && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return {
          assessment: parsed.assessment,
          questions: parsed.questions
        };
      }
    }
  } catch {}

  const localAssessment = findLocalAssessmentById(normalizedId);
  if (localAssessment) {
    const { publicQuestions } = findLocalQuestionsForAssessmentSync(localAssessment);
    return {
      assessment: localAssessment,
      questions: publicQuestions
    };
  }

  return null;
}

export async function fetchSharedAssessmentForGuest(
  rawAssessmentId: string
): Promise<{ assessment: Assessment; questions: AssessmentQuestionPublic[] } | null> {
  if (!rawAssessmentId) return null;
  const assessmentId =
    rawAssessmentId.trim() === 'exam-cvs-midterm' ? 'asmnt-cvs-midterm' : rawAssessmentId.trim();

  // 0. Check decoded URL / localStorage shared bundle first (instant 0ms)
  try {
    const rawBundle = localStorage.getItem(`${SHARED_BUNDLE_CACHE_PREFIX}${assessmentId}`);
    if (rawBundle) {
      const parsed = JSON.parse(rawBundle) as SharedAssessmentBundle;
      if (parsed?.assessment && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return {
          assessment: parsed.assessment,
          questions: parsed.questions
        };
      }
    }
  } catch {}

  let foundAssessment: Assessment | null = findLocalAssessmentById(assessmentId);
  let bundleQuestions: AssessmentQuestionPublic[] = [];

  if (typeof navigator === 'undefined' || navigator.onLine) {
    // 1. Check Publicly Readable `uniqueIdentifiers/shared_exam_${assessmentId}` on Firestore
    // (100% readable by unauthenticated guests on live `umed-yemen`)
    try {
      const pubSnap = await getDoc(doc(db, 'uniqueIdentifiers', `shared_exam_${assessmentId}`));
      if (pubSnap.exists()) {
        const d = pubSnap.data();
        if (d?.assessment) {
          foundAssessment = d.assessment as Assessment;
        }
        if (Array.isArray(d?.questions) && d.questions.length > 0) {
          bundleQuestions = d.questions as AssessmentQuestionPublic[];
        }
        if (foundAssessment && bundleQuestions.length > 0) {
          try {
            localStorage.setItem(
              `${SHARED_BUNDLE_CACHE_PREFIX}${assessmentId}`,
              JSON.stringify({
                assessment: foundAssessment,
                questions: bundleQuestions,
                answerKeyMap: d?.answerKeyMap || DEFAULT_ANSWER_KEYS_MAP,
                updatedAt: new Date().toISOString()
              })
            );
          } catch {}
          return {
            assessment: foundAssessment,
            questions: bundleQuestions
          };
        }
      }
    } catch (e) {}

    // 2. Check Publicly Readable `system/shared_exam_${assessmentId}` on Firestore
    try {
      const sysSnap = await getDoc(doc(db, 'system', `shared_exam_${assessmentId}`));
      if (sysSnap.exists()) {
        const d = sysSnap.data();
        if (d?.assessment && !foundAssessment) {
          foundAssessment = d.assessment as Assessment;
        }
        if (Array.isArray(d?.questions) && d.questions.length > 0 && bundleQuestions.length === 0) {
          bundleQuestions = d.questions as AssessmentQuestionPublic[];
        }
      }
    } catch (e) {}

    // 3. Check Public API Endpoint (`/api/assessments/public/:id`)
    try {
      const res = await fetch(`/api/assessments/public/${encodeURIComponent(assessmentId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.assessment && !foundAssessment) {
          foundAssessment = data.assessment as Assessment;
        }
        if (Array.isArray(data.questions) && data.questions.length > 0 && bundleQuestions.length === 0) {
          bundleQuestions = data.questions;
        }
      }
    } catch (e) {}

    // 4. Check Firestore `assessments` directly (works when authenticated or if rules allow)
    if (!foundAssessment) {
      try {
        const snap = await getDoc(doc(db, 'assessments', assessmentId));
        if (snap.exists()) {
          foundAssessment = { id: snap.id, ...snap.data() } as Assessment;
        }
      } catch (e) {}
    }
  }

  // 5. Guaranteed Fallback: Never return null on a shared link so the exam ALWAYS opens
  if (!foundAssessment) {
    foundAssessment = {
      ...DEFAULT_ASSESSMENTS[0],
      id: assessmentId,
      titleArabic:
        assessmentId.startsWith('comp-')
          ? 'المسابقة السريرية المشتركة — منصة UMED الطبية'
          : DEFAULT_ASSESSMENTS[0].titleArabic,
      assessmentType: assessmentId.startsWith('comp-') ? 'competition' : 'exam'
    };
  }

  const questionIds = foundAssessment.questionIds?.length
    ? foundAssessment.questionIds
    : ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];

  let questions = bundleQuestions.length > 0
    ? bundleQuestions
    : await fetchPublicQuestionsForAssessment(questionIds);

  if (questions.length === 0) {
    questions = DEFAULT_PUBLIC_QUESTIONS;
  }

  return {
    assessment: foundAssessment,
    questions
  };
}

export function savePendingGuestExamSubmission(submission: PendingGuestExamSubmission): void {
  try {
    localStorage.setItem(PENDING_GUEST_SUBMISSION_KEY, JSON.stringify(submission));
    if (submission.preferredUsername !== undefined || submission.preferredNameMode !== undefined) {
      localStorage.setItem(
        GUEST_LEADERBOARD_IDENTITY_KEY,
        JSON.stringify({
          username: submission.preferredUsername || '',
          leaderboardNameMode: submission.preferredNameMode || 'full_name'
        })
      );
    }
  } catch (e) {}
}

export function getPendingGuestExamSubmission(): PendingGuestExamSubmission | null {
  try {
    const raw = localStorage.getItem(PENDING_GUEST_SUBMISSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PendingGuestExamSubmission;
      if (parsed && parsed.assessmentId && parsed.assessment) {
        return parsed;
      }
    }
  } catch (e) {}
  return null;
}

export function clearPendingGuestExamSubmission(): void {
  try {
    localStorage.removeItem(PENDING_GUEST_SUBMISSION_KEY);
  } catch (e) {}
}

/**
 * Automatically grades and records a pending guest trial exam submission
 * as soon as the guest creates a mandatory account or logs in.
 */
export async function claimAndGradePendingGuestSubmission(
  uid: string,
  studentNameArabic: string
): Promise<{ result: AssessmentResult; assessment: Assessment } | null> {
  const pending = getPendingGuestExamSubmission();
  if (!pending) return null;

  try {
    // Save student's preferred leaderboard identity if they picked one during guest mode
    const mode: LeaderboardNameMode = pending.preferredNameMode || 'full_name';
    const username = (pending.preferredUsername || '').trim();
    const publicName = await saveStudentLeaderboardIdentity(
      uid,
      { username, leaderboardNameMode: mode },
      studentNameArabic
    );

    const attemptId = `att-guest-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const graded = await submitAttemptServer(
      attemptId,
      pending.answers || {},
      pending.assessment,
      studentNameArabic,
      {
        durationSeconds: pending.durationSeconds,
        studentDisplayNamePublic: publicName,
        studentUsername: username,
        leaderboardNameMode: mode
      }
    );

    clearPendingGuestExamSubmission();
    clearSharedAssessmentIdFromUrl();

    return {
      result: graded.result,
      assessment: pending.assessment
    };
  } catch (err) {
    console.warn('Failed to claim and grade guest submission:', err);
    return null;
  }
}

