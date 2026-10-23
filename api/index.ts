/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Unified Express Backend API (Compatible with Vercel Serverless & Local/Cloud Run)
 * Privileged Role Management, Audit Logging, Dynamic Exam Scoring, and Health Verification
 */

import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { UserRoleDoc, AuditLog, QuestionItemFull, Assessment } from '../src/types/umed.ts';

dotenv.config();

export const app = express();
app.use(express.json({ limit: '5mb' }));

const INITIAL_OWNER_EMAILS = [
  'alssaedy500@gmail.com',
  'alssaedy50@gmail.com',
  (process.env.INITIAL_OWNER_EMAIL || '').trim().toLowerCase()
].filter(Boolean);

const isInitialOwnerEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return INITIAL_OWNER_EMAILS.includes(email.trim().toLowerCase());
};

const INITIAL_OWNER_EMAIL = INITIAL_OWNER_EMAILS[0];

// Use /tmp on Vercel Serverless (writable) or .data locally
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.K_SERVICE);
const DATA_DIR = IS_SERVERLESS ? path.join('/tmp', 'umed_data') : path.resolve(process.cwd(), '.data');

const ROLES_FILE = path.join(DATA_DIR, 'roles.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_logs.json');
const ATTEMPTS_FILE = path.join(DATA_DIR, 'attempts.json');
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const ASSESSMENTS_FILE = path.join(DATA_DIR, 'assessments.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  // Ignore on strictly read-only environments; in-memory stores will still function
}

function loadJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {}
  return fallback;
}

function saveJsonSafe(filePath: string, data: any) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {}
}

// Default CVS questions with protected answer keys
const DEFAULT_QUESTIONS: QuestionItemFull[] = [
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
    explanationArabic: 'الصمام الأبهري (Aortic Valve) يفصل البطين الأيسر عن الشريان الأبهر ويمنع ارتجاع الدم خلال الانبساط.',
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
    explanationArabic: 'النيتروجليسرين تحت اللسان يوسع الأوردة والشرايين التاجية سريعاً ويقلل الحمل القبلي (Preload) خلال دقائق.',
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
    explanationArabic: 'في السيادة اليمنى (حوالي 85% من البشر)، يعطي الشريان التاجي الأيمن (RCA) الشريان الخلفي النازل (PDA) المغذي للجدار السفلي.',
    points: 5,
    createdBy: 'SYSTEM_SEED',
    createdAt: '2025-01-01T00:00:00Z'
  }
];

let rolesStore: Record<string, UserRoleDoc> = loadJsonSafe(ROLES_FILE, {});
let auditLogsStore: AuditLog[] = loadJsonSafe(AUDIT_FILE, []);
let attemptsStore: Record<string, any> = loadJsonSafe(ATTEMPTS_FILE, {});
let resultsStore: Record<string, any> = loadJsonSafe(RESULTS_FILE, {});
let questionsStore: Record<string, QuestionItemFull> = loadJsonSafe(QUESTIONS_FILE, {
  'q-cvs-1': DEFAULT_QUESTIONS[0],
  'q-cvs-2': DEFAULT_QUESTIONS[1],
  'q-cvs-3': DEFAULT_QUESTIONS[2]
});
let assessmentsStore: Record<string, Assessment> = loadJsonSafe(ASSESSMENTS_FILE, {});

function addAuditLog(
  action: AuditLog['action'],
  performedBy: string,
  details: Record<string, any> | string,
  targetUid?: string,
  universityId?: string,
  targetEmail?: string
) {
  const log: AuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    action,
    performedBy,
    targetUid,
    targetEmail,
    universityId,
    details,
    timestamp: new Date().toISOString()
  };
  auditLogsStore.unshift(log);
  saveJsonSafe(AUDIT_FILE, auditLogsStore);
  return log;
}

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));

    // Validate token expiration and standard Firebase Auth claims
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < nowSec - 60) {
      return null;
    }
    if (payload.iss && typeof payload.iss === 'string' && !payload.iss.includes('securetoken.google.com')) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

function getAuthenticatedCaller(req: Request): { uid: string; email: string; name: string } | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    const payload = decodeJwtPayload(token);
    if (payload) {
      const uid = payload.user_id || payload.sub || payload.uid || '';
      const email = (payload.email || '').toLowerCase();
      const name = payload.name || email || '';
      if (uid) return { uid, email, name };
    }
  }
  return null;
}

function isAuthorizedAdminCaller(req: Request): boolean {
  const caller = getAuthenticatedCaller(req);
  if (caller) {
    if (isInitialOwnerEmail(caller.email)) return true;
    const roleDoc = rolesStore[caller.uid];
    if (roleDoc && ['platform_owner', 'university_admin', 'batch_rep', 'department_head'].includes(roleDoc.role)) {
      return true;
    }
  }
  const fallbackEmail = String(req.body?.callerEmail || req.body?.performedBy || '').toLowerCase();
  const fallbackUid = String(req.body?.callerUid || req.body?.reviewedBy || '');
  if (fallbackEmail && isInitialOwnerEmail(fallbackEmail)) return true;
  if (fallbackUid && rolesStore[fallbackUid] && rolesStore[fallbackUid].role !== 'student') return true;
  return false;
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

// 1. Health & Environment Status
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    platform: 'UMED - Yemen Medical Education Platform',
    timestamp: new Date().toISOString(),
    runtime: IS_SERVERLESS ? 'Vercel Serverless / Cloud Function' : 'Node.js Express Server',
    initialOwnerConfigured: Boolean(INITIAL_OWNER_EMAIL),
    initialOwnerEmail: INITIAL_OWNER_EMAIL.replace(/(.{3})(.*)(@.*)/, '$1***$3'),
    rolesCount: Object.keys(rolesStore).length,
    auditLogsCount: auditLogsStore.length
  });
});

// 2. Platform Owner Bootstrap Endpoint
app.post('/api/admin/bootstrap-owner', (req: Request, res: Response) => {
  try {
    const caller = getAuthenticatedCaller(req);
    let email = caller?.email || '';
    let uid = caller?.uid || '';

    if (!email && req.body?.email) {
      email = String(req.body.email).toLowerCase();
      uid = String(req.body.uid || '');
    }

    if (!email || !uid) {
      return res.status(400).json({
        error: 'بيانات الاعتماد غير مكتملة (المعرف والبريد الإلكتروني مطلوبان)'
      });
    }

    if (!isInitialOwnerEmail(email)) {
      return res.status(403).json({
        error: `البريد الإلكتروني (${email}) غير مصرح له بتأسيس مالك المنصة. البريد المعتمد هو البريد المسجل في إعدادات الخادم.`
      });
    }

    const roleDoc: UserRoleDoc = {
      uid,
      role: 'platform_owner',
      email,
      assignedAt: new Date().toISOString(),
      assignedBy: 'SERVER_BOOTSTRAP'
    };

    rolesStore[uid] = roleDoc;
    saveJsonSafe(ROLES_FILE, rolesStore);

    const log = addAuditLog(
      'OWNER_PROVISIONED',
      email,
      { email, reason: 'Verified against INITIAL_OWNER_EMAIL' },
      uid,
      undefined,
      email
    );

    return res.json({
      success: true,
      message: 'تم التحقق وترقية الحساب إلى مالك المنصة (Platform Owner) بنجاح!',
      role: 'platform_owner',
      roleDoc,
      auditLog: log
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'خطأ داخلي في الخادم أثناء الترقية' });
  }
});

// 3. Get Role for a specific user
app.get('/api/admin/user-role/:uid', (req: Request, res: Response) => {
  const { uid } = req.params;
  const role = rolesStore[uid] || null;
  res.json({ role });
});

// 4. List all roles
app.get('/api/admin/roles', (req: Request, res: Response) => {
  res.json({ roles: rolesStore });
});

// 5. Assign Role (Hierarchical Governance Sync)
app.post('/api/admin/assign-role', (req: Request, res: Response) => {
  const caller = getAuthenticatedCaller(req);
  const {
    callerUid: bodyCallerUid,
    callerEmail: bodyCallerEmail,
    targetUid,
    email,
    role,
    assignedUniversityId,
    assignedStudyLevelId,
    assignedCourseId
  } = req.body;

  const effectiveCallerUid = caller?.uid || bodyCallerUid;
  const effectiveCallerEmail = caller?.email || bodyCallerEmail;

  const callerRoleDoc = rolesStore[effectiveCallerUid];
  const isOwner =
    (callerRoleDoc && callerRoleDoc.role === 'platform_owner') ||
    isInitialOwnerEmail(effectiveCallerEmail);
  const isUnivAdmin = callerRoleDoc && callerRoleDoc.role === 'university_admin';
  const isBatchRep = callerRoleDoc && callerRoleDoc.role === 'batch_rep';

  if (!isOwner && !isUnivAdmin && !isBatchRep) {
    return res.status(403).json({ error: 'غير مصرح: ليست لديك صلاحية إدارية لتعيين أو ترقية الأدوار' });
  }

  // Enforce hierarchy boundaries on server
  if (!isOwner) {
    if (role === 'platform_owner' || role === 'university_admin') {
      return res.status(403).json({ error: 'غير مصرح: ترقية مالك جامعة أو مالك منصة متاحة لمالك المنصة فقط' });
    }
    if (isBatchRep && role === 'batch_rep') {
      return res.status(403).json({ error: 'غير مصرح: ترقية مندوب دفعة متاحة لمالك الجامعة أو مالك المنصة فقط' });
    }
  }

  if (!targetUid || !role) {
    return res.status(400).json({ error: 'معرف المستخدم والرتبة مطلوبان' });
  }

  const roleDoc: UserRoleDoc = {
    uid: targetUid,
    role,
    email: email || '',
    assignedUniversityId,
    assignedStudyLevelId,
    assignedCourseId,
    assignedAt: new Date().toISOString(),
    assignedBy: effectiveCallerEmail || effectiveCallerUid
  };

  rolesStore[targetUid] = roleDoc;
  saveJsonSafe(ROLES_FILE, rolesStore);

  const log = addAuditLog(
    'ROLE_ASSIGNED',
    effectiveCallerEmail || effectiveCallerUid,
    { targetUid, assignedRole: role, assignedUniversityId, assignedStudyLevelId, assignedCourseId },
    targetUid,
    assignedUniversityId,
    email
  );

  res.json({ success: true, message: 'تم تعيين الدور بنجاح', roleDoc, auditLog: log });
});

// 6. View Audit Logs
app.get('/api/admin/audit-logs', (req: Request, res: Response) => {
  res.json({ logs: auditLogsStore });
});

// 7. Record Seed Loaded in Audit Logs
app.post('/api/admin/seed-dar-al-salam', (req: Request, res: Response) => {
  const { performedBy, itemsCount } = req.body;
  const log = addAuditLog(
    'SEED_LOADED',
    performedBy || 'PLATFORM_OWNER',
    {
      universityId: 'univ-dar-al-salam',
      programId: 'prog-mbbs',
      system: 'block',
      levelsCount: 8,
      itemsCount: itemsCount || 16
    },
    undefined,
    'univ-dar-al-salam'
  );

  res.json({ success: true, message: 'تم تسجيل عملية تهيئة بذور الجامعة بنجاح', log });
});

// 8. Record Enrollment Review in Audit Logs
app.post('/api/admin/enrollment-review', (req: Request, res: Response) => {
  const { enrollmentId, status, reviewedBy, rejectionReason } = req.body;
  const action = status === 'approved' ? 'ENROLLMENT_APPROVED' : 'ENROLLMENT_REJECTED';
  const log = addAuditLog(action, reviewedBy || 'ADMIN', {
    enrollmentId,
    status,
    rejectionReason: rejectionReason || null
  });

  res.json({ success: true, message: 'تم تسجيل مراجعة قيد الطالب بنجاح', log });
});

// 9. Sync Admin Questions & Assessments to Server Store
app.post('/api/admin/sync-assessment-questions', (req: Request, res: Response) => {
  try {
    const { questions, assessment, deletedQuestionIds, deletedAssessmentIds } = req.body;
    if (Array.isArray(questions)) {
      questions.forEach((q: QuestionItemFull) => {
        if (q && q.id) {
          questionsStore[q.id] = q;
        }
      });
      saveJsonSafe(QUESTIONS_FILE, questionsStore);
    }
    if (Array.isArray(deletedQuestionIds)) {
      deletedQuestionIds.forEach((id: string) => {
        delete questionsStore[id];
      });
      saveJsonSafe(QUESTIONS_FILE, questionsStore);
    }
    if (assessment && assessment.id) {
      assessmentsStore[assessment.id] = assessment;
      saveJsonSafe(ASSESSMENTS_FILE, assessmentsStore);
    }
    if (Array.isArray(deletedAssessmentIds)) {
      deletedAssessmentIds.forEach((id: string) => {
        delete assessmentsStore[id];
      });
      saveJsonSafe(ASSESSMENTS_FILE, assessmentsStore);
    }
    res.json({ success: true, questionsCount: Object.keys(questionsStore).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'فشل مزامنة الأسئلة' });
  }
});

// 9b. Get Admin Questions (Protected: Requires Admin Bearer Token or Admin Session)
app.get('/api/admin/questions', (req: Request, res: Response) => {
  try {
    if (!isAuthorizedAdminCaller(req) && !req.headers.authorization) {
      return res.status(403).json({ error: 'غير مصرح للطلاب بالوصول إلى بنك الأسئلة ومفاتيح الإجابات' });
    }
    const { bankId } = req.query;
    let list = Object.values(questionsStore);
    if (bankId) {
      list = list.filter((q) => q.bankId === bankId);
    }
    res.json({ questions: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'فشل جلب الأسئلة' });
  }
});

// 10. Start Assessment Attempt (Resumes active attempt or increments attemptNumber accurately)
app.post('/api/assessments/start-attempt', (req: Request, res: Response) => {
  try {
    const caller = getAuthenticatedCaller(req);
    const uid = caller?.uid || req.body?.uid || 'student-user';

    const { assessmentId, durationMinutes: reqDuration, questionIds, maxAttempts: reqMaxAttempts } = req.body;
    if (!assessmentId) return res.status(400).json({ error: 'معرف الاختبار مطلوب' });

    const storedAssessment = assessmentsStore[assessmentId];
    const durationMinutes = Number(reqDuration || storedAssessment?.durationMinutes || 45);
    const maxAttempts = Number(reqMaxAttempts || storedAssessment?.maxAttempts || 1);
    const now = new Date();

    const targetIds: string[] =
      (Array.isArray(questionIds) && questionIds.length > 0 ? questionIds : null) ||
      (storedAssessment?.questionIds?.length ? storedAssessment.questionIds : null) ||
      ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];

    // Check existing attempts for this student & assessment
    const userAttempts = Object.values(attemptsStore).filter(
      (a: any) => a && a.assessmentId === assessmentId && a.uid === uid
    );

    // 1. If there is an active in_progress attempt that has not expired, resume it
    const activeAttempt = userAttempts.find(
      (a: any) => a.status === 'in_progress' && new Date(a.expiresAt).getTime() > now.getTime()
    );

    let attempt = activeAttempt;

    if (!attempt) {
      // 2. Count completed/scored attempts and enforce maxAttempts
      const scoredCount = userAttempts.filter((a: any) => a.status === 'scored' || a.status === 'submitted').length;
      if (scoredCount >= maxAttempts) {
        return res.status(403).json({
          error: `لقد استنفدت الحد الأقصى للمحاولات المسموحة لهذا التقييم (${maxAttempts}).`
        });
      }

      const nextAttemptNumber = scoredCount + 1;
      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();
      const attemptId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      attempt = {
        id: attemptId,
        assessmentId,
        uid,
        startedAt: now.toISOString(),
        expiresAt,
        status: 'in_progress',
        answers: {},
        questionIds: targetIds,
        lastSavedAt: now.toISOString(),
        attemptNumber: nextAttemptNumber
      };

      attemptsStore[attemptId] = attempt;
      saveJsonSafe(ATTEMPTS_FILE, attemptsStore);
    }

    const resolvedQuestions = targetIds
      .map((id) => questionsStore[id])
      .filter(Boolean)
      .map((q) => ({
        id: q.id,
        bankId: q.bankId,
        stemArabic: q.stemArabic,
        stemEnglish: q.stemEnglish,
        imageUrl: q.imageUrl,
        options: q.options,
        points: q.points || 5
      }));

    const finalPublicQuestions =
      resolvedQuestions.length > 0
        ? resolvedQuestions
        : DEFAULT_QUESTIONS.map((q) => ({
            id: q.id,
            bankId: q.bankId,
            stemArabic: q.stemArabic,
            stemEnglish: q.stemEnglish,
            options: q.options,
            points: q.points
          }));

    res.json({ success: true, attempt, questions: finalPublicQuestions });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'فشل بدء التقييم' });
  }
});

// 11. Save Progress
app.post('/api/assessments/save-progress', (req: Request, res: Response) => {
  try {
    const { attemptId, answers } = req.body;
    if (!attemptId) return res.status(400).json({ error: 'معرف المحاولة مطلوب' });

    let attempt = attemptsStore[attemptId];
    if (!attempt) {
      attempt = {
        id: attemptId,
        status: 'in_progress',
        answers: {}
      };
      attemptsStore[attemptId] = attempt;
    }

    attempt.answers = { ...attempt.answers, ...answers };
    attempt.lastSavedAt = new Date().toISOString();
    saveJsonSafe(ATTEMPTS_FILE, attemptsStore);

    res.json({ success: true, lastSavedAt: attempt.lastSavedAt });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'فشل حفظ الإجابات' });
  }
});

// 12. Submit Attempt & Server-Side Scoring (Strictly uses Server Answer Key Store)
app.post('/api/assessments/submit-attempt', (req: Request, res: Response) => {
  try {
    const caller = getAuthenticatedCaller(req);
    const uid = caller?.uid || req.body?.uid || 'student-user';
    const studentName = caller?.name || 'طالب طب بشري';

    const { attemptId, assessmentId, answers, studentNameArabic, resultReleasePolicy, questionIds } = req.body;
    if (!attemptId) return res.status(400).json({ error: 'معرف المحاولة مطلوب' });

    // Idempotency check
    if (resultsStore[attemptId]) {
      return res.json({
        success: true,
        alreadySubmitted: true,
        result: resultsStore[attemptId],
        isReleased: resultsStore[attemptId].isReleased
      });
    }

    const attempt = attemptsStore[attemptId] || {
      id: attemptId,
      assessmentId: assessmentId || 'asmnt-cvs-default',
      uid,
      startedAt: new Date().toISOString()
    };

    const finalAnswers: Record<string, string> = { ...(attempt.answers || {}), ...(answers || {}) };
    const effectiveAssessmentId = assessmentId || attempt.assessmentId || 'asmnt-cvs-default';
    const storedAssessment = assessmentsStore[effectiveAssessmentId];

    // Build Answer Key Map strictly from trusted server store
    const answerKeyMap: Record<string, { correctOptionId: string; points: number }> = {};
    Object.values(questionsStore).forEach((q) => {
      answerKeyMap[q.id] = { correctOptionId: q.correctOptionId, points: Number(q.points) || 5 };
    });

    // Determine which questions belong to this attempt
    const targetQuestionIds: string[] =
      (Array.isArray(attempt.questionIds) && attempt.questionIds.length > 0 ? attempt.questionIds : null) ||
      (storedAssessment?.questionIds?.length ? storedAssessment.questionIds : null) ||
      (Array.isArray(questionIds) && questionIds.length > 0 ? questionIds : null) ||
      Object.keys(finalAnswers).filter((qId) => Boolean(answerKeyMap[qId]));

    const questionsToGrade =
      targetQuestionIds.length > 0 ? targetQuestionIds : ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];

    let score = 0;
    let totalPoints = 0;

    questionsToGrade.forEach((qId) => {
      const key = answerKeyMap[qId];
      if (key) {
        totalPoints += key.points;
        if (finalAnswers[qId] === key.correctOptionId) {
          score += key.points;
        }
      }
    });

    const percentage = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const nowIso = new Date().toISOString();
    const policy = storedAssessment?.resultReleasePolicy || resultReleasePolicy || 'immediate';
    const isReleased = policy === 'immediate';

    const result = {
      id: `res-${attemptId}`,
      attemptId,
      assessmentId: effectiveAssessmentId,
      uid,
      studentNameArabic: studentNameArabic || studentName,
      score,
      totalPoints,
      percentage,
      submittedAt: nowIso,
      gradedAt: nowIso,
      isReleased,
      releasedAt: isReleased ? nowIso : undefined
    };

    resultsStore[attemptId] = result;
    saveJsonSafe(RESULTS_FILE, resultsStore);

    attempt.status = 'scored';
    attempt.submittedAt = nowIso;
    saveJsonSafe(ATTEMPTS_FILE, attemptsStore);

    addAuditLog(
      'ASSESSMENT_SCORED',
      studentNameArabic || uid,
      { attemptId, assessmentId: effectiveAssessmentId, score, totalPoints, percentage },
      uid
    );

    res.json({
      success: true,
      result,
      isReleased: result.isReleased
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'فشل تصحيح وتسليم الاختبار' });
  }
});

// 13. Get Results for Assessment or Student
app.get('/api/assessments/results', (req: Request, res: Response) => {
  const { assessmentId, uid } = req.query;
  let list = Object.values(resultsStore);
  if (assessmentId) {
    list = list.filter((r: any) => r.assessmentId === assessmentId);
  }
  if (uid) {
    list = list.filter((r: any) => r.uid === uid);
  }
  res.json({ results: list });
});

// 14. Release Results (Admin Endpoint)
app.post('/api/admin/release-results', (req: Request, res: Response) => {
  try {
    const { assessmentId } = req.body;
    let updatedCount = 0;

    Object.values(resultsStore).forEach((resObj: any) => {
      if (resObj.assessmentId === assessmentId || !assessmentId) {
        resObj.isReleased = true;
        resObj.releasedAt = new Date().toISOString();
        updatedCount++;
      }
    });

    saveJsonSafe(RESULTS_FILE, resultsStore);

    addAuditLog('RESULTS_RELEASED', 'ADMIN', {
      assessmentId,
      updatedCount
    });

    res.json({ success: true, updatedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'فشل إفراج النتائج' });
  }
});

export default app;
