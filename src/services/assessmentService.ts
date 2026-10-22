/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Assessment, Examination & Competition Engine Service
 * Yemen-First Medical Education Platform (UMED)
 * Full Firestore + Serverless API Hybrid Persistence
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

// Default Seed Question Bank & Questions for Dar Al Salam University
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

export const DEFAULT_BANK_QUESTIONS: QuestionItemFull[] = [
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
    correctOptionId: 'opt-b',
    explanationArabic: 'الصمام الأبهري يفصل البطين الأيسر عن الأبهر ويمنع ارتجاع الدم للبطين خلال طور الانبساط.',
    points: 5,
    createdBy: 'SYSTEM_SEED',
    createdAt: '2025-01-01T00:00:00Z'
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
    correctOptionId: 'opt-a',
    explanationArabic: 'النيتروجليسرين تحت اللسان يعمل خلال 1-3 دقائق على توسيع الأوردة وتقليل الحمل القبلي وتوسيع الشرايين التاجية.',
    points: 5,
    createdBy: 'SYSTEM_SEED',
    createdAt: '2025-01-01T00:00:00Z'
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
    correctOptionId: 'opt-a',
    explanationArabic: 'في السيادة اليمنى (85% من الحالات)، يعطي الشريان التاجي الأيمن فرع الشريان الخلفي النازل (PDA).',
    points: 5,
    createdBy: 'SYSTEM_SEED',
    createdAt: '2025-01-01T00:00:00Z'
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
// 1. Admin Question Banks & MCQs
// ---------------------------------------------------------------------------

export async function getQuestionBanks(universityId: string): Promise<QuestionBank[]> {
  try {
    const q = query(
      collection(db, 'questionBanks'),
      where('universityId', '==', universityId)
    );
    const snap = await getDocs(q);
    const list: QuestionBank[] = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() } as QuestionBank));
    if (list.length > 0) return list;
  } catch (err) {
    console.warn('Firestore fallback: reading local question banks');
  }
  const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}banks_${universityId}`);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.length > 0) return parsed;
  }
  return [DEFAULT_QUESTION_BANK];
}

export async function createQuestionBank(bank: Omit<QuestionBank, 'id' | 'createdAt'>): Promise<QuestionBank> {
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
    const existing = await getQuestionBanks(bank.universityId);
    const updated = [...existing.filter(b => b.id !== id), newBank];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}banks_${bank.universityId}`, JSON.stringify(updated));
  } catch (e) {}

  return newBank;
}

export async function getBankQuestions(bankId: string): Promise<QuestionItemFull[]> {
  try {
    const q = query(
      collection(db, 'questions'),
      where('bankId', '==', bankId)
    );
    const snap = await getDocs(q);
    const list: QuestionItemFull[] = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() } as QuestionItemFull));
    if (list.length > 0) return list;
  } catch (err) {}

  const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}q_${bankId}`);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.length > 0) return parsed;
  }

  if (bankId === 'qbank-cvs-default') {
    return DEFAULT_BANK_QUESTIONS;
  }
  return [];
}

export async function createQuestion(question: Omit<QuestionItemFull, 'id' | 'createdAt'>): Promise<QuestionItemFull> {
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
    const existing = await getBankQuestions(question.bankId);
    const updated = [...existing.filter(item => item.id !== id), newQ];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_${question.bankId}`, JSON.stringify(updated));
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

export async function deleteQuestion(questionId: string, bankId: string): Promise<void> {
  try {
    await Promise.all([
      deleteDoc(doc(db, 'questions', questionId)),
      deleteDoc(doc(db, 'assessmentQuestions', questionId)),
      deleteDoc(doc(db, 'questionAnswerKeys', questionId))
    ]);
  } catch (err) {}

  try {
    const existing = await getBankQuestions(bankId);
    const filtered = existing.filter(q => q.id !== questionId);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}q_${bankId}`, JSON.stringify(filtered));
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// 2. Admin Assessments (Exams & Competitions)
// ---------------------------------------------------------------------------

export async function getAssessments(universityId: string, type?: AssessmentType, status?: AssessmentStatus): Promise<Assessment[]> {
  let list: Assessment[] = [];
  try {
    let q = query(
      collection(db, 'assessments'),
      where('universityId', '==', universityId)
    );
    if (status) {
      q = query(q, where('status', '==', status));
    }
    if (type) {
      q = query(q, where('assessmentType', '==', type));
    }
    const snap = await getDocs(q);
    snap.forEach(d => list.push({ id: d.id, ...d.data() } as Assessment));
  } catch (err) {}

  if (list.length === 0) {
    try {
      const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}assessments_${universityId}`);
      if (raw) {
        list = JSON.parse(raw);
      }
    } catch (e) {}
  }

  if (list.length === 0 && universityId === 'univ-dar-al-salam') {
    list = DEFAULT_ASSESSMENTS;
  }

  return type ? list.filter(a => a.assessmentType === type) : list;
}

export async function createAssessment(
  assessment: Omit<Assessment, 'id' | 'createdAt'>,
  bankQuestions?: QuestionItemFull[]
): Promise<Assessment> {
  const id = `asmnt-${Date.now()}`;
  const now = new Date().toISOString();
  const newAssessment: Assessment = {
    ...assessment,
    id,
    createdAt: now
  };

  try {
    await setDoc(doc(db, 'assessments', id), newAssessment);
    // Also ensure all bankQuestions have public stems & protected answer keys in Firestore
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
    const existing = await getAssessments(assessment.universityId);
    const updated = [newAssessment, ...existing.filter(a => a.id !== id)];
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}assessments_${assessment.universityId}`, JSON.stringify(updated));
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

export async function updateAssessmentStatus(assessmentId: string, status: 'draft' | 'published' | 'closed'): Promise<void> {
  try {
    await updateDoc(doc(db, 'assessments', assessmentId), { status });
  } catch (err) {
    console.error('Failed to update assessment status:', err);
  }
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
  // If student is on another level and no custom assessment exists yet for that level, include defaults if lvl-4 or return filtered
  return filtered;
}

export async function fetchPublicQuestionsForAssessment(questionIds: string[]): Promise<AssessmentQuestionPublic[]> {
  const results: AssessmentQuestionPublic[] = [];
  const defaultMap: Record<string, QuestionItemFull> = {};
  DEFAULT_BANK_QUESTIONS.forEach(q => { defaultMap[q.id] = q; });

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
      const def = defaultMap[qId];
      results.push({
        id: def.id,
        bankId: def.bankId,
        stemArabic: def.stemArabic,
        stemEnglish: def.stemEnglish,
        options: def.options,
        points: def.points
      });
    }
  }

  if (results.length === 0) {
    return DEFAULT_BANK_QUESTIONS.map(def => ({
      id: def.id,
      bankId: def.bankId,
      stemArabic: def.stemArabic,
      stemEnglish: def.stemEnglish,
      options: def.options,
      points: def.points
    }));
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

  const questionsToUse = firestoreQuestions.length > 0 ? firestoreQuestions : serverQuestions;

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

  // Gather Answer Keys from Firestore (or default seed keys) for serverless verification
  const questionKeysOverride: QuestionAnswerKey[] = [];
  const defaultKeyMap: Record<string, QuestionItemFull> = {};
  DEFAULT_BANK_QUESTIONS.forEach(q => { defaultKeyMap[q.id] = q; });

  for (const qId of questionIds) {
    try {
      const keySnap = await getDoc(doc(db, 'questionAnswerKeys', qId));
      if (keySnap.exists()) {
        questionKeysOverride.push(keySnap.data() as QuestionAnswerKey);
        continue;
      }
    } catch (e) {}

    if (defaultKeyMap[qId]) {
      const def = defaultKeyMap[qId];
      questionKeysOverride.push({
        questionId: def.id,
        assessmentId,
        correctOptionId: def.correctOptionId,
        points: def.points
      });
    }
  }

  let finalResult: AssessmentResult | null = null;

  // 1. Score via Trusted Backend API
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
        questionKeysOverride
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.result) {
        finalResult = data.result;
      }
    }
  } catch (e) {}

  // 2. Fallback deterministic scoring if serverless API is unreachable
  if (!finalResult) {
    let score = 0;
    let totalPoints = 0;
    questionKeysOverride.forEach(k => {
      const pts = Number(k.points) || 5;
      totalPoints += pts;
      if (answers[k.questionId] === k.correctOptionId) {
        score += pts;
      }
    });
    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const nowIso = new Date().toISOString();
    const isReleased = releasePolicy === 'immediate';

    finalResult = {
      id: `res-${attemptId}`,
      attemptId,
      assessmentId,
      uid,
      studentNameArabic: studentName,
      score,
      totalPoints,
      percentage,
      submittedAt: nowIso,
      gradedAt: nowIso,
      isReleased,
      releasedAt: isReleased ? nowIso : undefined
    };
  }

  // 3. Persist finalized attempt and result to Cloud Firestore
  try {
    await Promise.all([
      updateDoc(doc(db, 'assessmentAttempts', attemptId), {
        answers,
        status: 'scored',
        submittedAt: finalResult.submittedAt
      }),
      setDoc(doc(db, 'assessmentResults', finalResult.id), finalResult, { merge: true }),
      writeAuditLogToCloud({
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
      })
    ]);
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
    const q = query(
      collection(db, 'assessmentResults'),
      where('uid', '==', uid)
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
          if (r && r.id) resultsMap[r.id] = r;
        });
      }
    }
  } catch (e) {}

  return Object.values(resultsMap);
}

export async function releaseAssessmentResults(assessmentId: string): Promise<number> {
  let updatedCount = 0;
  const nowIso = new Date().toISOString();

  // 1. Update in Cloud Firestore
  try {
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
      updatedCount++;
    }
  } catch (e) {}

  // 2. Also update in backend server store
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
      if (typeof data.updatedCount === 'number' && data.updatedCount > updatedCount) {
        updatedCount = data.updatedCount;
      }
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
        data.results.forEach((r: AssessmentResult) => {
          if (r && r.id) resultsMap[r.id] = r;
        });
      }
    }
  } catch (e) {}

  return Object.values(resultsMap).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}
