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
  where
} from 'firebase/firestore';
import { db, auth, writeAuditLogToCloud } from '../lib/firebase.ts';
import { 
  QuestionBank, 
  QuestionItemFull, 
  AssessmentQuestionPublic, 
  QuestionAnswerKey,
  Assessment, 
  AssessmentAttempt, 
  AssessmentResult, 
  AssessmentType,
  AssessmentStatus
} from '../types/umed.ts';

const LOCAL_STORAGE_PREFIX = 'umed_assessment_';

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
// 1. Admin Question Banks & MCQs (Full Dynamic CRUD)
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
      // Merge with localBanks
      const mergedMap: Record<string, QuestionBank> = {};
      localBanks.forEach(b => { mergedMap[b.id] = b; });
      list.forEach(b => { mergedMap[b.id] = b; });
      const merged = Object.values(mergedMap);
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_${universityId}`, JSON.stringify(merged));
      localStorage.setItem(initKey, 'true');
      return merged;
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
    await setDoc(doc(db, 'questionBanks', id), newBank);
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

  const updatedBank: QuestionBank = {
    ...target,
    ...updates,
    id: bankId,
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'questionBanks', bankId), updatedBank, { merge: true });
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

  // Also delete associated questions from Firestore & server
  const deletedQuestionIds: string[] = [];
  for (const q of questions) {
    deletedQuestionIds.push(q.id);
    try {
      await Promise.all([
        deleteDoc(doc(db, 'questions', q.id)),
        deleteDoc(doc(db, 'assessmentQuestions', q.id)),
        deleteDoc(doc(db, 'questionAnswerKeys', q.id))
      ]);
    } catch (e) {}
  }

  try {
    const filtered = existing.filter(b => b.id !== bankId);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_${universityId}`, JSON.stringify(filtered));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_init_${universityId}`, 'true');
    localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}q_${bankId}`);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_init_${bankId}`, 'true');
  } catch (e) {}

  if (deletedQuestionIds.length > 0) {
    try {
      await fetch('/api/admin/sync-assessment-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletedQuestionIds })
      });
    } catch (e) {}
  }
}

export async function getBankQuestions(bankId: string): Promise<QuestionItemFull[]> {
  const initKey = `${LOCAL_STORAGE_PREFIX}q_init_${bankId}`;
  const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}q_${bankId}`);
  const localQuestions: QuestionItemFull[] = raw ? JSON.parse(raw) : [];

  try {
    const q = query(
      collection(db, 'questions'),
      where('bankId', '==', bankId)
    );
    const snap = await getDocs(q);
    const list: QuestionItemFull[] = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() } as QuestionItemFull));
    if (list.length > 0) {
      const mergedMap: Record<string, QuestionItemFull> = {};
      localQuestions.forEach(item => { mergedMap[item.id] = item; });
      list.forEach(item => { mergedMap[item.id] = item; });
      const merged = Object.values(mergedMap);
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_${bankId}`, JSON.stringify(merged));
      localStorage.setItem(initKey, 'true');
      return merged;
    }
  } catch (err) {}

  if (localStorage.getItem(initKey) === 'true') {
    return localQuestions;
  }

  if (localQuestions.length > 0) return localQuestions;

  // Fetch protected default questions from server endpoint for Admin Console
  try {
    const res = await fetch(`/api/admin/questions?bankId=${encodeURIComponent(bankId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        return data.questions;
      }
    }
  } catch (e) {}

  return [];
}

async function ensureBankQuestionsInitialized(bankId: string): Promise<QuestionItemFull[]> {
  const initKey = `${LOCAL_STORAGE_PREFIX}q_init_${bankId}`;
  const current = await getBankQuestions(bankId);
  if (localStorage.getItem(initKey) !== 'true') {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_${bankId}`, JSON.stringify(current));
    localStorage.setItem(initKey, 'true');
    for (const q of current) {
      try {
        await Promise.all([
          setDoc(doc(db, 'questions', q.id), q, { merge: true }),
          setDoc(doc(db, 'assessmentQuestions', q.id), {
            id: q.id,
            bankId: q.bankId,
            stemArabic: q.stemArabic,
            stemEnglish: q.stemEnglish || '',
            options: q.options,
            points: Number(q.points) || 5
          }, { merge: true }),
          setDoc(doc(db, 'questionAnswerKeys', q.id), {
            questionId: q.id,
            assessmentId: q.bankId,
            correctOptionId: q.correctOptionId,
            explanationArabic: q.explanationArabic || '',
            points: Number(q.points) || 5
          }, { merge: true })
        ]);
      } catch (e) {}
    }
  }
  return current;
}

export async function createQuestion(question: Omit<QuestionItemFull, 'id' | 'createdAt'>): Promise<QuestionItemFull> {
  const existing = await ensureBankQuestionsInitialized(question.bankId);
  const id = `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const newQ: QuestionItemFull = {
    ...question,
    id,
    createdAt: now
  };

  // Public Question (NO correctOptionId)
  const publicQ: AssessmentQuestionPublic = {
    id,
    bankId: question.bankId,
    stemArabic: question.stemArabic,
    stemEnglish: question.stemEnglish,
    imageUrl: question.imageUrl,
    options: question.options,
    points: Number(question.points) || 5
  };

  // Protected Answer Key
  const answerKey: QuestionAnswerKey = {
    questionId: id,
    assessmentId: question.bankId,
    correctOptionId: question.correctOptionId,
    explanationArabic: question.explanationArabic,
    explanationEnglish: question.explanationEnglish,
    points: Number(question.points) || 5
  };

  try {
    await Promise.all([
      setDoc(doc(db, 'questions', id), newQ),
      setDoc(doc(db, 'assessmentQuestions', id), publicQ),
      setDoc(doc(db, 'questionAnswerKeys', id), answerKey)
    ]);
  } catch (err) {
    console.warn('Saving question to localStorage fallback:', err);
  }

  try {
    const updated = [...existing.filter(item => item.id !== id), newQ];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_${question.bankId}`, JSON.stringify(updated));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_init_${question.bankId}`, 'true');
  } catch (e) {}

  // Sync to backend server
  try {
    await fetch('/api/admin/sync-assessment-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [newQ] })
    });
  } catch (e) {}

  return newQ;
}

export async function updateQuestion(
  questionId: string,
  updates: Partial<QuestionItemFull>
): Promise<QuestionItemFull> {
  const bankId = updates.bankId || 'qbank-cvs-default';
  const existing = await ensureBankQuestionsInitialized(bankId);
  const target = existing.find(q => q.id === questionId);

  const updatedQ: QuestionItemFull = {
    ...(target || {
      id: questionId,
      bankId,
      stemArabic: '',
      options: [],
      correctOptionId: 'opt-a',
      points: 5,
      createdBy: 'ADMIN',
      createdAt: new Date().toISOString()
    }),
    ...updates,
    id: questionId
  };

  const publicQ: AssessmentQuestionPublic = {
    id: questionId,
    bankId: updatedQ.bankId,
    stemArabic: updatedQ.stemArabic,
    stemEnglish: updatedQ.stemEnglish,
    imageUrl: updatedQ.imageUrl,
    options: updatedQ.options,
    points: Number(updatedQ.points) || 5
  };

  const answerKey: QuestionAnswerKey = {
    questionId,
    assessmentId: updatedQ.bankId,
    correctOptionId: updatedQ.correctOptionId,
    explanationArabic: updatedQ.explanationArabic,
    explanationEnglish: updatedQ.explanationEnglish,
    points: Number(updatedQ.points) || 5
  };

  try {
    await Promise.all([
      setDoc(doc(db, 'questions', questionId), updatedQ, { merge: true }),
      setDoc(doc(db, 'assessmentQuestions', questionId), publicQ, { merge: true }),
      setDoc(doc(db, 'questionAnswerKeys', questionId), answerKey, { merge: true })
    ]);
  } catch (err) {
    console.warn('Firestore updateQuestion fallback:', err);
  }

  try {
    const updatedList = existing.some(q => q.id === questionId)
      ? existing.map(q => q.id === questionId ? updatedQ : q)
      : [...existing, updatedQ];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_${updatedQ.bankId}`, JSON.stringify(updatedList));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_init_${updatedQ.bankId}`, 'true');
  } catch (e) {}

  try {
    await fetch('/api/admin/sync-assessment-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [updatedQ] })
    });
  } catch (e) {}

  return updatedQ;
}

export async function deleteQuestion(questionId: string, bankId: string): Promise<void> {
  const existing = await ensureBankQuestionsInitialized(bankId);

  try {
    await Promise.all([
      deleteDoc(doc(db, 'questions', questionId)),
      deleteDoc(doc(db, 'assessmentQuestions', questionId)),
      deleteDoc(doc(db, 'questionAnswerKeys', questionId))
    ]);
  } catch (err) {}

  try {
    const filtered = existing.filter(q => q.id !== questionId);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_${bankId}`, JSON.stringify(filtered));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_init_${bankId}`, 'true');
  } catch (e) {}

  try {
    await fetch('/api/admin/sync-assessment-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deletedQuestionIds: [questionId] })
    });
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// 2. Admin Assessments (Exams & Competitions - Full Dynamic CRUD)
// ---------------------------------------------------------------------------

export async function getAssessments(universityId: string, type?: AssessmentType, status?: AssessmentStatus): Promise<Assessment[]> {
  const initKey = `${LOCAL_STORAGE_PREFIX}assessments_init_${universityId}`;
  const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}assessments_${universityId}`);
  const localList: Assessment[] = raw ? JSON.parse(raw) : [];

  let list: Assessment[] = [];
  try {
    const q = query(
      collection(db, 'assessments'),
      where('universityId', '==', universityId)
    );
    const snap = await getDocs(q);
    snap.forEach(d => list.push({ id: d.id, ...d.data() } as Assessment));
    if (list.length > 0) {
      const mergedMap: Record<string, Assessment> = {};
      localList.forEach(a => { mergedMap[a.id] = a; });
      list.forEach(a => { mergedMap[a.id] = a; });
      list = Object.values(mergedMap);
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${universityId}`, JSON.stringify(list));
      localStorage.setItem(initKey, 'true');
    }
  } catch (err) {}

  if (list.length === 0) {
    if (localStorage.getItem(initKey) === 'true' || localList.length > 0) {
      list = localList;
    } else if (universityId === 'univ-dar-al-salam') {
      list = DEFAULT_ASSESSMENTS;
    }
  }

  let result = list;
  if (status) {
    result = result.filter(a => a.status === status);
  }
  if (type) {
    result = result.filter(a => a.assessmentType === type);
  }
  return result;
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
  const now = new Date().toISOString();
  const newAssessment: Assessment = {
    ...assessment,
    id,
    createdAt: now
  };

  try {
    await setDoc(doc(db, 'assessments', id), newAssessment);
    if (Array.isArray(bankQuestions) && bankQuestions.length > 0) {
      for (const q of bankQuestions) {
        await setDoc(doc(db, 'assessmentQuestions', q.id), {
          id: q.id,
          bankId: q.bankId,
          stemArabic: q.stemArabic,
          stemEnglish: q.stemEnglish || '',
          options: q.options,
          points: Number(q.points) || 5
        }, { merge: true });
        await setDoc(doc(db, 'questionAnswerKeys', q.id), {
          questionId: q.id,
          assessmentId: id,
          correctOptionId: q.correctOptionId,
          explanationArabic: q.explanationArabic || '',
          points: Number(q.points) || 5
        }, { merge: true });
      }
    }
  } catch (err) {}

  try {
    const updated = [newAssessment, ...existing.filter(a => a.id !== id)];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${assessment.universityId}`, JSON.stringify(updated));
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_init_${assessment.universityId}`, 'true');
  } catch (e) {}

  try {
    await fetch('/api/admin/sync-assessment-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  const universityId = updates.universityId || 'univ-dar-al-salam';
  const existing = await ensureAssessmentsInitialized(universityId);
  const target = existing.find(a => a.id === assessmentId) ||
    DEFAULT_ASSESSMENTS.find(a => a.id === assessmentId);

  const updatedAssessment: Assessment = {
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
  };

  try {
    await setDoc(doc(db, 'assessments', assessmentId), updatedAssessment, { merge: true });
    if (Array.isArray(bankQuestions) && bankQuestions.length > 0) {
      for (const q of bankQuestions) {
        await setDoc(doc(db, 'assessmentQuestions', q.id), {
          id: q.id,
          bankId: q.bankId,
          stemArabic: q.stemArabic,
          stemEnglish: q.stemEnglish || '',
          options: q.options,
          points: Number(q.points) || 5
        }, { merge: true });
        await setDoc(doc(db, 'questionAnswerKeys', q.id), {
          questionId: q.id,
          assessmentId,
          correctOptionId: q.correctOptionId,
          explanationArabic: q.explanationArabic || '',
          points: Number(q.points) || 5
        }, { merge: true });
      }
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
    await fetch('/api/admin/sync-assessment-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessment: updatedAssessment, questions: bankQuestions || [] })
    });
  } catch (e) {}

  return updatedAssessment;
}

export async function deleteAssessment(
  assessmentId: string,
  universityId: string = 'univ-dar-al-salam'
): Promise<void> {
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
    await fetch('/api/admin/sync-assessment-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    a => a.status === 'published' && (a.studyLevelId === studyLevelId || !a.studyLevelId)
  );
  return filtered;
}

export async function fetchPublicQuestionsForAssessment(questionIds: string[]): Promise<AssessmentQuestionPublic[]> {
  const results: AssessmentQuestionPublic[] = [];
  const defaultMap: Record<string, AssessmentQuestionPublic> = {};
  DEFAULT_PUBLIC_QUESTIONS.forEach(q => { defaultMap[q.id] = q; });

  for (const qId of questionIds) {
    try {
      const snap = await getDoc(doc(db, 'assessmentQuestions', qId));
      if (snap.exists()) {
        const d = snap.data() as AssessmentQuestionPublic;
        results.push({
          id: d.id || qId,
          bankId: d.bankId,
          stemArabic: d.stemArabic,
          stemEnglish: d.stemEnglish,
          imageUrl: d.imageUrl,
          options: d.options,
          points: Number(d.points) || 5
        });
        continue;
      }
    } catch (e) {}

    if (defaultMap[qId]) {
      results.push(defaultMap[qId]);
    }
  }

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
  const questionIds = assessmentObj?.questionIds?.length
    ? assessmentObj.questionIds
    : ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];

  // Fetch public questions from Firestore first
  const firestoreQuestions = await fetchPublicQuestionsForAssessment(questionIds);

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
        questionIds
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.attempt) {
        attempt = data.attempt;
        serverQuestions = data.questions || [];
      }
    }
  } catch (e) {}

  if (!attempt) {
    const now = new Date();
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
      attemptNumber: 1
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

  // 3. Persist finalized attempt and audit log to Cloud Firestore
  try {
    await updateDoc(doc(db, 'assessmentAttempts', attemptId), {
      answers,
      status: 'scored',
      submittedAt: finalResult.submittedAt
    });
  } catch (e) {}

  // Note: firestore.rules restricts assessmentResults creation to admins;
  // server API stores the result authoritatively, and admin syncs it to Firestore when viewing/releasing.
  try {
    await setDoc(doc(db, 'assessmentResults', finalResult.id), finalResult, { merge: true });
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

  try {
    // Query only released results from Firestore to satisfy security rule:
    // allow read: if (resource.data.uid == request.auth.uid && resource.data.isReleased == true) || isAnyAdmin()
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
            // Mask score if not released yet
            resultsMap[r.id] = r.isReleased
              ? r
              : { ...r, score: 0, percentage: 0 };
          }
        });
      }
    }
  } catch (e) {}

  return Object.values(resultsMap);
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

  // 2. Sync and release in Cloud Firestore (admin has write access to assessmentResults)
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
    const res = await fetch(`/api/assessments/results?assessmentId=${encodeURIComponent(assessmentId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results)) {
        for (const r of data.results as AssessmentResult[]) {
          if (r && r.id) {
            resultsMap[r.id] = r;
            // Admin syncs server-scored results to Firestore assessmentResults
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
