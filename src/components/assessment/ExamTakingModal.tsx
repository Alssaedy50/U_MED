/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Exam & Competition Taking Modal (Mobile-First RTL Interface)
 * Features:
 * - Optional Full Exam Countdown Timer OR Open Untimed Mode
 * - Optional Per-Question Countdown Timer with Auto-Advance
 * - Availability Window Remaining Indicator
 * - Guest Trial Mode with Mandatory Account Creation Gate on Result Reveal
 * - Ranked Leaderboard & Student Display Name / Username Visibility Selector
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  CloudCheck, 
  CloudOff, 
  ChevronRight, 
  ChevronLeft, 
  Send, 
  Award, 
  X,
  RefreshCw,
  Lock,
  Trophy,
  UserPlus,
  Share2,
  Copy,
  Check,
  Timer,
  UserCheck,
  Sparkles,
  Medal,
  Download,
  FileText,
  Play,
  ShieldCheck
} from 'lucide-react';
import { 
  Assessment, 
  AssessmentAttempt, 
  AssessmentQuestionPublic, 
  AssessmentResult,
  LeaderboardNameMode
} from '../../types/umed.ts';
import { 
  saveProgressServer, 
  submitAttemptServer,
  getAssessmentLeaderboard,
  subscribeToAssessmentLeaderboard,
  getStudentLeaderboardIdentity,
  saveStudentLeaderboardIdentity,
  formatStudentLeaderboardName,
  resolveResultPublicDisplayName,
  buildShareableAssessmentUrl,
  savePendingGuestExamSubmission,
  claimAndGradePendingGuestSubmission,
  PendingGuestExamSubmission,
  downloadExamBookletFile
} from '../../services/assessmentService.ts';
import {
  extractOptionAndExplanation,
  sanitizeOptionTextForDisplay
} from '../../services/mcqBulkParser.ts';
import {
  YEMEN_UNIVERSITIES_OPTIONS,
  MEDICAL_SPECIALTIES_OPTIONS,
  STUDY_LEVELS_OPTIONS,
  validateUsernameFormat,
  normalizeUsername,
  checkIdentifierUniqueness
} from '../../lib/firebase.ts';
import { saveUserAcademicContext } from '../../services/academicService.ts';

import { useAuth } from '../../context/AuthContext.tsx';

const COLLEGES_OPTIONS = [
  'كلية الطب البشري والعلوم الصحية',
  'كلية الطب والعلوم الصحية',
  'كلية طب الأسنان',
  'كلية الصيدلة السريرية',
  'كلية المختبرات والعلوم الطبية'
];

interface ExamTakingModalProps {
  assessment: Assessment;
  attempt: AssessmentAttempt;
  questions: AssessmentQuestionPublic[];
  studentNameArabic?: string;
  studentUsername?: string;
  uid?: string;
  isGuestMode?: boolean;
  initialResult?: AssessmentResult | null;
  onRequireGuestAccount?: (submission: PendingGuestExamSubmission) => void;
  onClose: () => void;
  onSubmitted: (result: AssessmentResult) => void;
}

export default function ExamTakingModal({
  assessment,
  attempt,
  questions,
  studentNameArabic,
  studentUsername,
  uid,
  isGuestMode = false,
  initialResult = null,
  onRequireGuestAccount,
  onClose,
  onSubmitted
}: ExamTakingModalProps) {
  const { user, userProfile, registerWithUsername, loginWithIdentifier } = useAuth();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>(attempt.answers || {});
  const [hasStartedSolving, setHasStartedSolving] = useState<boolean>(() => {
    if (initialResult) return true;
    return Object.keys(attempt.answers || {}).length > 0;
  });
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const [showConfirmSubmit, setShowConfirmSubmit] = useState<boolean>(false);
  const [showMandatoryGuestGate, setShowMandatoryGuestGate] = useState<boolean>(false);
  const [pendingGuestScoredResult, setPendingGuestScoredResult] = useState<AssessmentResult | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);
  const [downloadingMode, setDownloadingMode] = useState<'solved' | 'blank' | null>(null);
  const [downloadedToast, setDownloadedToast] = useState<string | null>(null);

  // Mandatory Academic Gate State for Guests finishing a Shared Exam
  const [guestGateMode, setGuestGateMode] = useState<'register' | 'login'>('register');
  const [guestFullName, setGuestFullName] = useState<string>('');
  const [guestUsername, setGuestUsername] = useState<string>('');
  const [guestUniversityId, setGuestUniversityId] = useState<string>(assessment.universityId || 'univ-dar-al-salam');
  const [guestCollegeArabic, setGuestCollegeArabic] = useState<string>(COLLEGES_OPTIONS[0]);
  const [guestSpecialtyArabic, setGuestSpecialtyArabic] = useState<string>(MEDICAL_SPECIALTIES_OPTIONS[0].nameArabic);
  const [guestStudyLevelId, setGuestStudyLevelId] = useState<string>(assessment.studyLevelId || 'lvl-4');
  const [guestLoginId, setGuestLoginId] = useState<string>('');
  const [guestLoginPassword, setGuestLoginPassword] = useState<string>('');
  const [guestGateSubmitting, setGuestGateSubmitting] = useState<boolean>(false);
  const [guestGateError, setGuestGateError] = useState<string | null>(null);

  // Effective guest status (false once the visitor completes inline account creation)
  const effectiveIsGuest = isGuestMode && !user;

  // Automatic Student Leaderboard Identity from registered account
  const initialIdentity = getStudentLeaderboardIdentity(user?.uid || uid);
  const effectiveUsername = studentUsername || userProfile?.username || initialIdentity.username || guestUsername || '';
  const effectiveFullName = userProfile?.displayNameArabic || studentNameArabic || guestFullName || 'طالب طب بشري';
  const nameMode: LeaderboardNameMode = 'full_name';
  const customUsername = effectiveUsername;

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<AssessmentResult[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);

  // Elapsed time tracking for tie-breaking on leaderboard
  const startedAtTimestampRef = useRef<number>(
    attempt.startedAt ? new Date(attempt.startedAt).getTime() : Date.now()
  );

  // Per-Question Timer state (Optional)
  const perQuestionDuration = Math.max(
    0,
    Math.round(
      Number(
        assessment.questionDurationSeconds ||
          assessment.perQuestionSeconds ||
          assessment.questionTimerSeconds ||
          0
      )
    )
  );
  const isQuestionTimerEnabled = perQuestionDuration > 0;
  const [questionTimeLeft, setQuestionTimeLeft] = useState<number>(perQuestionDuration);

  const expectedQuestionsCount =
    questions.length > 0 ? questions.length : Math.max(1, assessment.questionIds?.length || 1);

  // Full Exam Timer state (Synchronized with per-question timer × expectedQuestionsCount)
  const effectiveExamDurationSeconds = useMemo(() => {
    const fromMinutes = Number(assessment.durationMinutes || 0) * 60;
    const fromPerQuestion = perQuestionDuration > 0 ? expectedQuestionsCount * perQuestionDuration : 0;
    return Math.max(fromMinutes, fromPerQuestion);
  }, [assessment.durationMinutes, perQuestionDuration, expectedQuestionsCount]);

  const isExamTimerEnabled =
    (assessment.enableExamTimer !== false && Number(assessment.durationMinutes) > 0) ||
    perQuestionDuration > 0;

  const examDeadlineRef = useRef<number>(
    Math.max(
      attempt.expiresAt ? new Date(attempt.expiresAt).getTime() : 0,
      Date.now() + (effectiveExamDurationSeconds || 1800) * 1000
    )
  );

  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(() => {
    if (!isExamTimerEnabled) return 0;
    const diff = Math.floor((examDeadlineRef.current - Date.now()) / 1000);
    return diff > 0 ? diff : effectiveExamDurationSeconds || 1800;
  });

  const [result, setResult] = useState<AssessmentResult | null>(initialResult);
  const [queuedOfflineSubmit, setQueuedOfflineSubmit] = useState<boolean>(false);
  const saveTimeoutRef = useRef<any>(null);

  const handleStartExamSessionNow = () => {
    const nowTs = Date.now();
    startedAtTimestampRef.current = nowTs;
    examDeadlineRef.current = nowTs + (effectiveExamDurationSeconds || 1800) * 1000;
    if (isExamTimerEnabled) {
      setTimeLeftSeconds(effectiveExamDurationSeconds || 1800);
    }
    if (isQuestionTimerEnabled) {
      setQuestionTimeLeft(perQuestionDuration);
    }
    setHasStartedSolving(true);
  };

  const handleDownloadExamFile = async (mode: 'solved' | 'blank') => {
    if (downloadingMode) return;
    setDownloadingMode(mode);
    try {
      await downloadExamBookletFile({
        assessment,
        questions,
        result,
        answers,
        studentNameArabic,
        mode
      });
      setDownloadedToast(
        mode === 'solved'
          ? 'تم تحميل ملف الاختبار محلولاً مع التعليلات الطبية بنجاح ✓'
          : 'تم تحميل نسخة الاختبار غير المحلولة للتدريب بنجاح ✓'
      );
      setTimeout(() => setDownloadedToast(null), 3500);
    } catch (e) {
      console.warn('Failed to download exam file:', e);
    } finally {
      setDownloadingMode(null);
    }
  };

  // Ensure deadline is refreshed when questions finish loading or when guest passes the identity gate
  useEffect(() => {
    if (!isExamTimerEnabled || result || !hasStartedSolving || questions.length === 0) return;
    const minDeadline = startedAtTimestampRef.current + effectiveExamDurationSeconds * 1000;
    if (examDeadlineRef.current < minDeadline) {
      examDeadlineRef.current = minDeadline;
      setTimeLeftSeconds(Math.max(1, Math.floor((examDeadlineRef.current - Date.now()) / 1000)));
    }
  }, [effectiveExamDurationSeconds, isExamTimerEnabled, result, hasStartedSolving, questions.length]);

  // Reset per-question timer whenever the question changes
  useEffect(() => {
    if (!isQuestionTimerEnabled || result || showMandatoryGuestGate || !hasStartedSolving || questions.length === 0) return;
    setQuestionTimeLeft(perQuestionDuration);
  }, [currentQuestionIndex, isQuestionTimerEnabled, perQuestionDuration, result, showMandatoryGuestGate, hasStartedSolving, questions.length]);

  // Per-question countdown interval (strictly clamped to perQuestionDuration so it never overshoots by +1/+2s)
  useEffect(() => {
    if (!isQuestionTimerEnabled || result || submitting || showMandatoryGuestGate || !hasStartedSolving || questions.length === 0) return;

    const deadline = Date.now() + perQuestionDuration * 1000;
    setQuestionTimeLeft(perQuestionDuration);

    const qTimer = setInterval(() => {
      const rem = Math.min(
        perQuestionDuration,
        Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      );
      if (rem <= 0) {
        clearInterval(qTimer);
        setQuestionTimeLeft(0);
        // Auto-advance to next question or trigger finish if on last question
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex((idx) => Math.min(questions.length - 1, idx + 1));
        } else {
          handleFinalSubmit();
        }
        return;
      }
      setQuestionTimeLeft((prev) => Math.min(perQuestionDuration, Math.min(prev, rem)));
    }, 1000);

    return () => clearInterval(qTimer);
  }, [
    isQuestionTimerEnabled,
    perQuestionDuration,
    currentQuestionIndex,
    questions.length,
    result,
    submitting,
    showMandatoryGuestGate,
    isGuestMode,
    hasStartedSolving
  ]);

  // Full Exam Timer interval
  useEffect(() => {
    if (!isExamTimerEnabled || result || showMandatoryGuestGate || !hasStartedSolving || questions.length === 0) return;

    const timer = setInterval(() => {
      const nowTime = Date.now();
      const remaining = Math.max(0, Math.floor((examDeadlineRef.current - nowTime) / 1000));
      setTimeLeftSeconds(remaining);

      if (remaining === 0 && !submitting && !result) {
        clearInterval(timer);
        handleFinalSubmit();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isExamTimerEnabled, result, submitting, showMandatoryGuestGate, isGuestMode, answers, hasStartedSolving, questions.length]);

  // Load Leaderboard when result is shown
  useEffect(() => {
    if (!result) return;
    setLoadingLeaderboard(true);
    getAssessmentLeaderboard(assessment.id)
      .then((list) => setLeaderboard(list))
      .catch(() => {})
      .finally(() => setLoadingLeaderboard(false));

    const unsub = subscribeToAssessmentLeaderboard(assessment.id, (liveRanked) => {
      setLeaderboard(liveRanked);
    });
    return () => unsub();
  }, [result, assessment.id]);

  const handleSelectOption = (questionId: string, optionId: string) => {
    if (result || submitting || showMandatoryGuestGate) return;

    const newAnswers = { ...answers, [questionId]: optionId };
    setAnswers(newAnswers);

    if (isGuestMode) {
      // Save guest progress locally
      setSyncStatus('saved');
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAtTimestampRef.current) / 1000));
      savePendingGuestExamSubmission({
        assessmentId: assessment.id,
        assessment,
        answers: newAnswers,
        startedAt: new Date(startedAtTimestampRef.current).toISOString(),
        submittedAt: new Date().toISOString(),
        durationSeconds: elapsedSeconds,
        preferredUsername: customUsername,
        preferredNameMode: nameMode
      });
      return;
    }

    setSyncStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveProgressServer(attempt.id, newAnswers);
        setSyncStatus('saved');
      } catch (err) {
        console.warn('Auto-save error:', err);
        setSyncStatus('error');
      }
    }, 450);
  };

  const handleProceedToGuestRegistration = () => {
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAtTimestampRef.current) / 1000));
    const pendingPayload: PendingGuestExamSubmission = {
      assessmentId: assessment.id,
      assessment,
      answers,
      startedAt: new Date(startedAtTimestampRef.current).toISOString(),
      submittedAt: new Date().toISOString(),
      durationSeconds: elapsedSeconds,
      preferredUsername: customUsername,
      preferredNameMode: nameMode,
      scoredResult: result || undefined
    };
    savePendingGuestExamSubmission(pendingPayload);
    if (onRequireGuestAccount) {
      onRequireGuestAccount(pendingPayload);
    }
  };

  const handleFinalSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAtTimestampRef.current) / 1000));

      if (effectiveIsGuest) {
        const guestDisplayName = formatStudentLeaderboardName({
          uid: 'guest',
          fullNameArabic: studentNameArabic || 'زائر',
          username: customUsername,
          mode: nameMode
        });

        const res = await submitAttemptServer(
          attempt.id,
          answers,
          assessment,
          studentNameArabic || 'زائر',
          {
            durationSeconds: elapsedSeconds,
            studentDisplayNamePublic: guestDisplayName,
            studentUsername: customUsername,
            leaderboardNameMode: nameMode,
            isGuestPreview: true
          }
        );

        const pendingPayload: PendingGuestExamSubmission = {
          assessmentId: assessment.id,
          assessment,
          answers,
          startedAt: new Date(startedAtTimestampRef.current).toISOString(),
          submittedAt: new Date().toISOString(),
          durationSeconds: elapsedSeconds,
          preferredUsername: customUsername,
          preferredNameMode: nameMode,
          scoredResult: res.result
        };
        savePendingGuestExamSubmission(pendingPayload);
        setPendingGuestScoredResult(res.result);
        setQueuedOfflineSubmit(false);
        // Gate result behind mandatory academic data & automatic account creation
        setShowMandatoryGuestGate(true);
        return;
      }

      const activeUid = user?.uid || uid;
      const publicDisplayName = await saveStudentLeaderboardIdentity(
        activeUid,
        { username: customUsername, leaderboardNameMode: 'full_name' },
        effectiveFullName
      );

      const res = await submitAttemptServer(
        attempt.id,
        answers,
        assessment,
        effectiveFullName,
        {
          durationSeconds: elapsedSeconds,
          studentDisplayNamePublic: publicDisplayName,
          studentUsername: customUsername,
          leaderboardNameMode: 'full_name'
        }
      );
      setQueuedOfflineSubmit(Boolean(res.queuedOffline));
      setResult(res.result);
      onSubmitted(res.result);
    } catch (err: any) {
      console.error('Submission failed:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء تسليم الاختبار. يرجى المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
      setShowConfirmSubmit(false);
    }
  };

  const handleCompleteGuestAcademicGate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guestGateSubmitting) return;
    setGuestGateError(null);
    setGuestGateSubmitting(true);

    try {
      let finalStudentName = guestFullName.trim();

      if (guestGateMode === 'register') {
        const nameParts = finalStudentName.split(/\s+/).filter(Boolean);
        if (nameParts.length < 3) {
          setGuestGateError('يرجى إدخال الاسم الثلاثي كاملاً باللغة العربية (مثال: أحمد محمد علي)');
          setGuestGateSubmitting(false);
          return;
        }
        const fmt = validateUsernameFormat(guestUsername);
        if (!fmt.valid) {
          setGuestGateError(fmt.message || 'يرجى إدخال اسم مستخدم صحيح لا يقل عن 4 أحرف إنجليزية');
          setGuestGateSubmitting(false);
          return;
        }
        const uniqueCheck = await checkIdentifierUniqueness({ username: guestUsername.trim() });
        if (!uniqueCheck.isUnique) {
          setGuestGateError(uniqueCheck.message || 'اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم مستخدم آخر');
          setGuestGateSubmitting(false);
          return;
        }

        const univObj = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === guestUniversityId);
        const univNameArabic = univObj?.nameArabic || 'جامعة دار السلام الدولية للعلوم والتكنولوجيا';
        const combinedSpecialty = `${guestCollegeArabic} — ${guestSpecialtyArabic}`;

        await registerWithUsername(
          guestUsername.trim(),
          undefined,
          finalStudentName,
          {
            universityId: guestUniversityId,
            universityNameArabic: univNameArabic,
            specialtyArabic: combinedSpecialty,
            studyLevelId: guestStudyLevelId
          }
        );

        saveUserAcademicContext({
          universityId: guestUniversityId,
          universityNameArabic: univNameArabic,
          studyLevelId: guestStudyLevelId
        });
      } else {
        if (!guestLoginId.trim()) {
          setGuestGateError('يرجى إدخال اسم المستخدم (@username) أو البريد الإلكتروني أو رقم الهاتف');
          setGuestGateSubmitting(false);
          return;
        }
        await loginWithIdentifier(guestLoginId.trim(), guestLoginPassword || undefined);
        finalStudentName = userProfile?.displayNameArabic || guestLoginId.trim();
      }

      // Claim and officially record the guest exam submission under the new authenticated account
      const claimed = await claimAndGradePendingGuestSubmission(
        user?.uid || uid || `usr_${normalizeUsername(guestUsername || guestLoginId)}`,
        finalStudentName || 'طالب طب بشري'
      );

      const finalResult = claimed?.result || pendingGuestScoredResult;
      if (finalResult) {
        const enrichedResult: AssessmentResult = {
          ...finalResult,
          studentNameArabic: finalStudentName || finalResult.studentNameArabic,
          studentDisplayNamePublic: finalStudentName || finalResult.studentDisplayNamePublic,
          studentUsername: normalizeUsername(guestUsername || guestLoginId) || finalResult.studentUsername
        };
        setShowMandatoryGuestGate(false);
        setResult(enrichedResult);
        onSubmitted(enrichedResult);
      }
    } catch (err: any) {
      let msg = err?.message || 'تعذر إنشاء الحساب وإظهار النتيجة. يرجى التحقق من البيانات والمحاولة مجدداً.';
      if (msg.includes('email-already-in-use')) {
        msg = 'اسم المستخدم هذا مسجل مسبقاً. اختر اسم مستخدم آخر أو اضغط على تبويب تسجيل الدخول لحسابك.';
      }
      setGuestGateError(msg);
    } finally {
      setGuestGateSubmitting(false);
    }
  };

  const handleCopyShareUrl = async () => {
    const shareUrl = buildShareableAssessmentUrl(assessment, questions);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
    } catch {
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDurationShort = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} ث`;
    return `${m} د ${s} ث`;
  };

  // Remaining time until assessment closes
  const getClosingCountdownText = () => {
    if (!assessment.closesAt) return null;
    const diffMs = new Date(assessment.closesAt).getTime() - Date.now();
    if (diffMs <= 0) return 'مغلق';
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `متاح لـ ${days} يوم و ${hours % 24} ساعة`;
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `يغلق خلال ${hours} س و ${mins} د`;
  };

  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const isTimerCritical = isExamTimerEnabled && timeLeftSeconds <= 300;
  const isCurrentlyOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const previewDisplayName = formatStudentLeaderboardName({
    uid,
    fullNameArabic: effectiveFullName,
    username: customUsername,
    mode: 'full_name'
  });

  const myRankIndex = result
    ? leaderboard.findIndex((r) => r.uid === result.uid || r.id === result.id)
    : -1;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col justify-between overflow-hidden text-slate-100 font-sans" dir="rtl">
      
      {/* 1. Header Bar */}
      <header className="bg-slate-900 border-b border-slate-800 p-3.5 md:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
            assessment.assessmentType === 'competition' 
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
              : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
          }`}>
            {assessment.assessmentType === 'competition' ? 'مسابقة أكاديمية' : 'اختبار مادة'}
          </span>
          {isGuestMode && (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
              متاح للحل المباشر (بدون حساب)
            </span>
          )}
          <h2 className="text-sm md:text-base font-bold text-white line-clamp-1">
            {assessment.titleArabic}
          </h2>
          {getClosingCountdownText() && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] border border-slate-700">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>{getClosingCountdownText()}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          {/* Cloud / Local Offline Sync Status */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
            {isGuestMode ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-indigo-300">حفظ إجاباتك تلقائياً ✓</span>
              </>
            ) : syncStatus === 'saving' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-amber-300">جاري الحفظ...</span>
              </>
            ) : syncStatus === 'saved' && isCurrentlyOnline ? (
              <>
                <CloudCheck className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-teal-300">تم الحفظ سحابياً ✓</span>
              </>
            ) : syncStatus === 'saved' && !isCurrentlyOnline ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-300">محفوظ محلياً (أوفلاين) ✓</span>
              </>
            ) : (
              <>
                <CloudOff className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-300">محفوظ محلياً — بانتظار الشبكة</span>
              </>
            )}
          </div>

          {/* Per-Question Timer Badge (if enabled) */}
          {!result && !showMandatoryGuestGate && isQuestionTimerEnabled && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-mono text-xs font-bold border transition-colors ${
              questionTimeLeft <= 10
                ? 'bg-rose-950/90 border-rose-500 text-rose-200 animate-pulse'
                : 'bg-amber-950/70 border-amber-600/60 text-amber-300'
            }`} title="مؤقت السؤال الحالي">
              <Timer className="w-3.5 h-3.5" />
              <span>سؤال: {questionTimeLeft}ث</span>
            </div>
          )}

          {/* Full Exam Timer Badge (or Open Untimed Badge) */}
          {!result && !showMandatoryGuestGate && (
            isExamTimerEnabled ? (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm font-bold border transition-colors ${
                isTimerCritical 
                  ? 'bg-rose-950/80 border-rose-600 text-rose-300 animate-pulse' 
                  : 'bg-slate-800 border-slate-700 text-teal-300'
              }`} title="الوقت الكلي المتبقي للاختبار">
                <Clock className="w-4 h-4" />
                <span>{formatTimer(timeLeftSeconds)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800 border border-slate-700 text-emerald-300">
                <Clock className="w-3.5 h-3.5" />
                <span>وقت مفتوح</span>
              </div>
            )
          )}

          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl w-full mx-auto space-y-6">
        
        {/* A) Official Result & Ranked Leaderboard Screen (Shown immediately for both Guests and Registered Users) */}
        {result ? (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-teal-500/20 text-teal-400 mx-auto flex items-center justify-center border border-teal-500/30">
                <Award className="w-9 h-9" />
              </div>

              <div>
                <h3 className="text-xl md:text-2xl font-bold text-white mb-1">
                  {assessment.assessmentType === 'competition' ? 'تمت المشاركة وإظهار نتيجتك بنجاح!' : 'تم تصحيح الاختبار وإظهار نتيجتك فوراً!'}
                </h3>
                <p className="text-slate-400 text-xs md:text-sm">
                  {isGuestMode
                    ? 'تم تصحيح إجاباتك وإظهار درجتك النهائية مباشرةً. أنشئ حسابك أدناه لحفظ نتيجتك ودخول المنافسة الرسمية مع باقي الطلاب!'
                    : queuedOfflineSubmit
                    ? 'تم حفظ إجاباتك النهائية بأمان على جهازك (وضع أوفلاين)، وسيتم رفعها وتصحيحها تلقائياً فور عودة الاتصال بالإنترنت.'
                    : 'تم حفظ وتصحيح محاولتك سحابياً وإدراج نتيجتك في لوحة الترتيب التنافسية.'}
                </p>
              </div>

              {queuedOfflineSubmit ? (
                <div className="p-5 rounded-xl bg-amber-950/40 border border-amber-700/60 max-w-md mx-auto space-y-2 text-amber-200 text-xs">
                  <CloudOff className="w-6 h-6 mx-auto text-amber-400" />
                  <div className="font-bold text-sm">محاولتك محفوظة بالكامل وبانتظار عودة الإنترنت</div>
                  <p className="text-slate-300 leading-relaxed">
                    بمجرد اتصال هاتفك بالإنترنت ستقوم المنصة بمزامنة إجاباتك ورصد درجتك المعتمدة تلقائياً.
                  </p>
                </div>
              ) : result.isReleased || isGuestMode ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-slate-400 text-[11px]">الدرجة النهائية</div>
                    <div className="text-2xl font-extrabold text-teal-400 font-mono">
                      {result.score} / {result.totalPoints}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-slate-400 text-[11px]">النسبة المئوية</div>
                    <div className="text-2xl font-extrabold text-emerald-400 font-mono">
                      {result.percentage}%
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="text-slate-400 text-[11px]">
                      {isGuestMode ? 'حالة الترتيب التنافسي' : 'ترتيبك بين الطلاب'}
                    </div>
                    <div className="text-base sm:text-xl font-extrabold text-amber-400 font-mono">
                      {isGuestMode
                        ? 'بانتظار الحساب'
                        : myRankIndex >= 0
                        ? `#${myRankIndex + 1}`
                        : '#1'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-amber-950/40 border border-amber-800/50 max-w-md mx-auto space-y-2 text-amber-300 text-xs">
                  <Lock className="w-6 h-6 mx-auto text-amber-400" />
                  <div className="font-bold text-sm">النتيجة محفوظة وبانتظار الإعلان الرسمي</div>
                  <p className="text-slate-300 leading-relaxed">
                    وفقاً لسياسة هذا التقييم، سيتم إظهار الدرجات التفصيلية فور اعتماد وإفراج النتائج من قبل إدارة الكلية.
                  </p>
                </div>
              )}

              {/* PROMINENT GUEST NOTIFICATION: Prompt unauthenticated users to create an account to join competition & unlock all services */}
              {isGuestMode && (
                <div className="bg-gradient-to-br from-amber-950/60 via-indigo-950/70 to-slate-950 border-2 border-amber-500/50 rounded-2xl p-5 text-right max-w-2xl mx-auto space-y-4 shadow-2xl">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-extrabold">
                        تنبيه هام للزوار غير المسجلين
                      </div>
                      <h4 className="text-sm sm:text-base font-extrabold text-white">
                        يرجى إنشاء حساب في المنصة للدخول في المنافسة مع باقي الطلاب والوصول لجميع الخدمات والمميزات!
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        لقد أتممت حل النموذج وحصلت على <strong className="text-teal-300 font-mono">{result.score}/{result.totalPoints} ({result.percentage}%)</strong>. لأنك لم تقم بإنشاء حساب بعد، فإن نتيجتك الحالية معروضة لك فقط ولم تُدرج بعد في لوحة الشرف والمنافسة الرسمية.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-start gap-2.5">
                      <Trophy className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-amber-200">الدخول في منافسة مع باقي الطلاب</div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          تثبيت درجتك المحفوظة فوراً في لوحة الترتيب التنافسية ومقارنة مركزك مع زملائك في الدفعة.
                        </p>
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-teal-200">الوصول لجميع الخدمات والمميزات</div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          فتح المكتبة الطبية الرقمية، محاضرات البلوكات، الملخصات، بنوك الأسئلة، وسجل نتائجك السحابي.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleProceedToGuestRegistration}
                    className="w-full py-3 px-5 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-xl shadow-teal-950/60 transition-all"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>إنشاء حساب الآن للدخول في المنافسة والوصول لجميع المميزات (نتيجتك محفوظة تلقائياً)</span>
                  </button>
                </div>
              )}

              {/* Student Registered Identity Badge for Logged-in Users */}
              {!isGuestMode && (
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 text-right max-w-xl mx-auto flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-teal-400" />
                    <span>هويتك المسجلة في لوحة الشرف: <strong className="text-white" dir="auto">{previewDisplayName}</strong></span>
                  </div>
                  {customUsername && (
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-lg" dir="ltr">
                      @{customUsername.replace(/^@+/, '')}
                    </span>
                  )}
                </div>
              )}

              {/* Download Exam File Section (Solved with Rationale OR Blank for Self-Practice) */}
              <div className="bg-slate-950/90 border border-teal-500/30 rounded-2xl p-4 sm:p-5 text-right max-w-2xl mx-auto space-y-3 shadow-lg">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-teal-300">
                    <Download className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>تحميل ملف الاختبار الكامل للمذاكرة والمراجعة (يعمل بدون إنترنت وقابل للطباعة PDF):</span>
                  </div>
                  {downloadedToast && (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      {downloadedToast}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={downloadingMode !== null}
                    onClick={() => handleDownloadExamFile('solved')}
                    className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-md transition-all"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span>
                      {downloadingMode === 'solved'
                        ? 'جارٍ تجهيز الملف...'
                        : 'تحميل الاختبار محلولاً (مع الإجابات والتعليل)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={downloadingMode !== null}
                    onClick={() => handleDownloadExamFile('blank')}
                    className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-all"
                  >
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      {downloadingMode === 'blank'
                        ? 'جارٍ تجهيز النسخة...'
                        : 'تحميل نسخة غير محلولة (للتدريب الذاتي)'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleCopyShareUrl}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 text-xs font-bold flex items-center gap-2 transition-colors"
                >
                  {copiedShareLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                  <span>{copiedShareLink ? 'تم نسخ رابط مشاركة النموذج ✓' : 'مشاركة رابط النموذج مع زملائك'}</span>
                </button>
                {isGuestMode && (
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-300 text-xs font-bold transition-colors"
                  >
                    مراجعة الأسئلة / تعديل الإجابات
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
                >
                  {isGuestMode ? 'إغلاق والعودة للصفحة الرئيسية' : 'العودة إلى قائمة الاختبارات'}
                </button>
              </div>
            </div>

            {/* Ordered Leaderboard Section */}
            {(result.isReleased || isGuestMode) && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <h4 className="text-sm md:text-base font-bold text-white">
                      ترتيب نتائج الطلاب ولوحة الشرف ({leaderboard.length} مشارك مسجل)
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    مرتبة حسب الأعلى درجة ثم الأسرع إنجازاً
                  </span>
                </div>

                {loadingLeaderboard && leaderboard.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    جاري تحديث قائمة الترتيب...
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    {isGuestMode
                      ? 'أنشئ حسابك الآن لتكون أول المتصدرين في لوحة الشرف لهذا النموذج!'
                      : 'أنت أول المتقدمين في لوحة الترتيب لهذا التقييم!'}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {leaderboard.map((item, idx) => {
                      const rank = idx + 1;
                      const isMe = !isGuestMode && ((uid && item.uid === uid) || item.id === result.id);
                      const displayName = resolveResultPublicDisplayName(item);

                      return (
                        <div
                          key={item.id || `${item.uid}-${idx}`}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-all ${
                            isMe
                              ? 'bg-teal-950/60 border-teal-500/60 text-teal-100 ring-1 ring-teal-500/30'
                              : rank <= 3
                              ? 'bg-amber-950/20 border-amber-500/30 text-slate-100'
                              : 'bg-slate-950/70 border-slate-800/80 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-lg font-mono font-extrabold flex items-center justify-center text-xs ${
                              rank === 1
                                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/30'
                                : rank === 2
                                ? 'bg-slate-300 text-slate-950'
                                : rank === 3
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {rank <= 3 ? <Medal className="w-4 h-4" /> : `#${rank}`}
                            </div>
                            <div>
                              <div className="font-bold flex items-center gap-1.5">
                                <span>{displayName}</span>
                                {isMe && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                    أنت
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>الزمن: {formatDurationShort(item.durationSeconds)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-slate-300 font-semibold">
                              {item.score}/{item.totalPoints}
                            </span>
                            <span className={`px-2.5 py-1 rounded-lg font-bold ${
                              rank === 1
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-teal-500/15 text-teal-300'
                            }`}>
                              {item.percentage}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Detailed Medical Question Reviews & Explanations (when released) */}
            {result.isReleased && Array.isArray(result.questionReviews) && result.questionReviews.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
                  <h4 className="text-sm md:text-base font-bold text-white">
                    المراجعة التفصيلية للأسئلة والتعليلات الطبية ({result.questionReviews.length} سؤال)
                  </h4>
                  <span className="text-[11px] text-teal-400 font-semibold">
                    تصحيح معتمد مع تفسير الخيارات
                  </span>
                </div>
                <div className="space-y-4">
                  {result.questionReviews.map((rev, qIdx) => (
                    <div
                      key={rev.questionId || qIdx}
                      className={`p-4 rounded-xl border space-y-3 ${
                        rev.isCorrect
                          ? 'bg-emerald-950/20 border-emerald-800/50'
                          : 'bg-rose-950/20 border-rose-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="text-xs sm:text-sm font-bold text-slate-100 leading-relaxed"
                          dir={!/[\u0600-\u06FF]/.test(rev.stemArabic || '') ? 'ltr' : 'rtl'}
                        >
                          <span className="text-teal-400 ml-1.5 mr-1.5">
                            {!/[\u0600-\u06FF]/.test(rev.stemArabic || '') ? `Q${qIdx + 1}:` : `س${qIdx + 1}:`}
                          </span>
                          {rev.stemArabic}
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold shrink-0 ${
                            rev.isCorrect
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {rev.isCorrect ? `صحيحة (+${rev.points})` : `خاطئة (0/${rev.points})`}
                        </span>
                      </div>

                      {(rev.questionType === 'essay' || rev.questionType === 'fill_blank') ? (
                        <div className="space-y-2 text-xs">
                          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
                            <span className="text-slate-400 font-semibold block mb-1">
                              {rev.questionType === 'fill_blank' ? 'إجابتك في الفراغ:' : 'إجابتك المقالية:'}
                            </span>
                            <p className="text-slate-200 font-semibold">{rev.studentAnswer || 'لم تتم الإجابة'}</p>
                          </div>
                          {rev.modelAnswerArabic && (
                            <div className="p-3 rounded-lg bg-teal-950/40 border border-teal-800/50">
                              <span className="text-teal-300 font-semibold block mb-1">
                                {rev.questionType === 'fill_blank' ? 'الكلمة / الإجابة الصحيحة المعتمدة للفراغ:' : 'الإجابة النموذجية المعتمدة:'}
                              </span>
                              <p
                                className="text-slate-200 font-semibold"
                                dir={!/[\u0600-\u06FF]/.test(rev.modelAnswerArabic || '') ? 'ltr' : 'rtl'}
                              >
                                {rev.modelAnswerArabic}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="space-y-1.5"
                          dir={!/[\u0600-\u06FF]/.test(rev.stemArabic || '') ? 'ltr' : 'rtl'}
                        >
                          {(rev.options || []).map((opt) => {
                            const isOptCorrect = opt.id === rev.correctOptionId || opt.isCorrect;
                            const isStudentPick = opt.id === rev.studentAnswer;
                            const cleanOptText = sanitizeOptionTextForDisplay(opt.textArabic);
                            const optExplanation =
                              opt.explanation ||
                              opt.explanationArabic ||
                              extractOptionAndExplanation(opt.textArabic).explanation;
                            return (
                              <div
                                key={opt.id}
                                className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1 ${
                                  isOptCorrect
                                    ? 'bg-emerald-950/50 border-emerald-600/60 text-emerald-100'
                                    : isStudentPick
                                    ? 'bg-rose-950/50 border-rose-600/60 text-rose-100'
                                    : 'bg-slate-950/50 border-slate-800/70 text-slate-400'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold">{cleanOptText}</span>
                                  <div className="flex items-center gap-1.5 shrink-0" dir="rtl">
                                    {isStudentPick && (
                                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                                        اختيارك
                                      </span>
                                    )}
                                    {isOptCorrect && (
                                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                        الإجابة الصحيحة ✓
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {optExplanation && (
                                  <p
                                    className="text-[11px] text-slate-300 pr-2 pl-2 border-r-2 border-teal-500/60 mt-1 leading-relaxed"
                                    dir={!/[\u0600-\u06FF]/.test(optExplanation) ? 'ltr' : 'rtl'}
                                  >
                                    <strong className="text-teal-300 mr-1 ml-1">
                                      {!/[\u0600-\u06FF]/.test(optExplanation) ? 'Rationale:' : 'التعليل:'}
                                    </strong>
                                    {optExplanation}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {rev.explanationArabic && (
                        <div
                          className="p-3 rounded-lg bg-slate-950/90 border border-teal-900/50 text-xs text-teal-200 leading-relaxed"
                          dir={!/[\u0600-\u06FF]/.test(rev.explanationArabic || '') ? 'ltr' : 'rtl'}
                        >
                          <strong className="text-teal-400 block mb-0.5">
                            {!/[\u0600-\u06FF]/.test(rev.explanationArabic || '')
                              ? 'Clinical & Medical Rationale:'
                              : 'التعليل الطبي والسريري:'}
                          </strong>
                          {rev.explanationArabic}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : showMandatoryGuestGate ? (
          /* A2) Mandatory Academic Data Gate for Guests to Reveal Shared Exam Result & Auto-Create Account */
          <div className="max-w-2xl mx-auto bg-slate-900 border-2 border-teal-500/50 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-5">
            <div className="text-center space-y-2.5">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-500/40 text-teal-400 mx-auto flex items-center justify-center">
                <Lock className="w-7 h-7" />
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>تم حفظ وتصحيح إجاباتك ({answeredCount}/{questions.length} سؤال) بنجاح</span>
              </span>
              <h3 className="text-lg sm:text-xl font-extrabold text-white">
                أكمل بياناتك الأكاديمية لإظهار نتيجتك وتفعيل حسابك تلقائياً
              </h3>
              <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
                لإظهار درجتك التفصيلية والتعليلات الطبية وترتيبك التنافسي بين زملائك في <strong className="text-teal-300">«{assessment.titleArabic}»</strong>، يرجى إدخال بياناتك الأكاديمية أدناه ليتم إنشاء حسابك الرسمي تلقائياً (ويمكنك تعيين كلمة مرور لاحقاً من الإعدادات).
              </p>
            </div>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setGuestGateMode('register');
                  setGuestGateError(null);
                }}
                className={`flex-1 py-2.5 rounded-lg font-bold transition-colors ${
                  guestGateMode === 'register'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                تسجيل بياناتي الأكاديمية (طالب جديد)
              </button>
              <button
                type="button"
                onClick={() => {
                  setGuestGateMode('login');
                  setGuestGateError(null);
                }}
                className={`flex-1 py-2.5 rounded-lg font-bold transition-colors ${
                  guestGateMode === 'login'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                لدي حساب مسجل مسبقاً
              </button>
            </div>

            {guestGateError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{guestGateError}</span>
              </div>
            )}

            <form onSubmit={handleCompleteGuestAcademicGate} className="space-y-4 text-xs">
              {guestGateMode === 'register' ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-200 font-bold mb-1">
                        1. الاسم الثلاثي بالعربية *
                      </label>
                      <input
                        type="text"
                        required
                        value={guestFullName}
                        onChange={(e) => setGuestFullName(e.target.value)}
                        placeholder="مثال: أحمد محمد علي"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-200 font-bold mb-1">
                        2. اسم المستخدم الفريد (@username) *
                      </label>
                      <div className="relative" dir="ltr">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400 font-mono font-bold">
                          @
                        </span>
                        <input
                          type="text"
                          required
                          value={guestUsername}
                          onChange={(e) =>
                            setGuestUsername(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ''))
                          }
                          placeholder="ahmed_med"
                          className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-200 font-bold mb-1">
                        3. الجامعة *
                      </label>
                      <select
                        value={guestUniversityId}
                        onChange={(e) => setGuestUniversityId(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-teal-500"
                      >
                        {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nameArabic}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-200 font-bold mb-1">
                        4. الكلية *
                      </label>
                      <select
                        value={guestCollegeArabic}
                        onChange={(e) => setGuestCollegeArabic(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-teal-500"
                      >
                        {COLLEGES_OPTIONS.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-200 font-bold mb-1">
                        5. التخصص الأكاديمي *
                      </label>
                      <select
                        value={guestSpecialtyArabic}
                        onChange={(e) => setGuestSpecialtyArabic(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-teal-500"
                      >
                        {MEDICAL_SPECIALTIES_OPTIONS.map((sp) => (
                          <option key={sp.id} value={sp.nameArabic}>
                            {sp.nameArabic}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-200 font-bold mb-1">
                        6. المستوى الدراسي *
                      </label>
                      <select
                        value={guestStudyLevelId}
                        onChange={(e) => setGuestStudyLevelId(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-teal-300 font-bold text-xs focus:outline-none focus:border-teal-500"
                      >
                        {STUDY_LEVELS_OPTIONS.map((lvl) => (
                          <option key={lvl.id} value={lvl.id}>
                            {lvl.nameArabic}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div>
                    <label className="block text-slate-200 font-bold mb-1">
                      اسم المستخدم (@username) أو البريد الإلكتروني أو رقم الهاتف:
                    </label>
                    <input
                      type="text"
                      required
                      value={guestLoginId}
                      onChange={(e) => setGuestLoginId(e.target.value)}
                      placeholder="@ahmed_med"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-teal-500"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-200 font-bold mb-1">
                      كلمة المرور (اتركها فارغة إذا سجلت بدون كلمة مرور):
                    </label>
                    <input
                      type="password"
                      value={guestLoginPassword}
                      onChange={(e) => setGuestLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-teal-500"
                      dir="ltr"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={guestGateSubmitting}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-teal-950/60 transition-all"
              >
                {guestGateSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جارٍ اعتماد بياناتك الأكاديمية وإظهار نتيجتك...</span>
                  </>
                ) : (
                  <>
                    <Award className="w-5 h-5" />
                    <span>
                      {guestGateMode === 'register'
                        ? 'اعتماد البيانات وإنشاء حسابي تلقائياً وإظهار النتيجة الآن'
                        : 'تسجيل الدخول وإظهار نتيجتي المعتمدة الآن'}
                    </span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : !hasStartedSolving ? (
          /* B) Pre-Exam Readiness & "Start Exam Now" Screen (Timer starts only when student clicks Start Exam) */
          <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-3">
              <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center border ${
                assessment.assessmentType === 'competition'
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                  : 'bg-teal-500/20 border-teal-500/40 text-teal-400'
              }`}>
                {assessment.assessmentType === 'competition' ? (
                  <Trophy className="w-8 h-8" />
                ) : (
                  <FileText className="w-8 h-8" />
                )}
              </div>
              <span className="inline-block px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-teal-300">
                {assessment.assessmentType === 'competition' ? 'مسابقة طبية أكاديمية' : 'اختبار مقرر طبي معتمد'}
              </span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
                {assessment.titleArabic}
              </h3>
              {assessment.descriptionArabic && (
                <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
                  {assessment.descriptionArabic}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">عدد الأسئلة</div>
                <div className="text-base sm:text-lg font-extrabold text-white font-mono">
                  {expectedQuestionsCount} سؤال
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">الدرجة الكلية</div>
                <div className="text-base sm:text-lg font-extrabold text-teal-400 font-mono">
                  {assessment.totalPoints} نقطة
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">نظام الوقت والمؤقت</div>
                <div className="text-sm sm:text-base font-extrabold text-amber-300">
                  {isQuestionTimerEnabled
                    ? `${perQuestionDuration} ثانية لكل سؤال`
                    : isExamTimerEnabled
                    ? `${Math.ceil(effectiveExamDurationSeconds / 60)} دقيقة`
                    : 'وقت مفتوح'}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2 text-xs text-slate-300 leading-relaxed">
              <div className="font-bold text-teal-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                <span>تعليمات هامة قبل الضغط على زر «بدء الاختبار الآن»:</span>
              </div>
              <ul className="space-y-1.5 pr-4 list-disc text-slate-300">
                <li>لن يبدأ احتساب مؤقت الاختبار إلا بعد الضغط على زر <strong>«بدء الاختبار الآن»</strong> أدناه.</li>
                <li>يتم حفظ إجاباتك تلقائياً أولاً بأول (سواء كنت متصلاً بالإنترنت أو في وضع عدم الاتصال).</li>
                <li>بعد إنهاء الاختبار وتسليمه، ستظهر نتيجتك فوراً مع إمكانية <strong>تحميل ملف الاختبار كاملاً</strong> للمذاكرة والمراجعة.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleStartExamSessionNow}
                className={`flex-1 py-3.5 px-6 rounded-xl text-sm font-extrabold text-white flex items-center justify-center gap-2.5 shadow-xl transition-all ${
                  assessment.assessmentType === 'competition'
                    ? 'bg-gradient-to-l from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-950/50'
                    : 'bg-gradient-to-l from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 shadow-teal-950/50'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                <span>بدء الاختبار الآن ({expectedQuestionsCount} سؤال)</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-3.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                رجوع
              </button>
            </div>
          </div>
        ) : (
          /* C) Active Question Solving Area */
          <div className="space-y-5">
            
            {/* Question Quick Navigation Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-md flex items-center gap-2 overflow-x-auto scrollbar-thin">
              <span className="text-xs text-slate-400 whitespace-nowrap pl-2 border-l border-slate-800">
                الأسئلة ({answeredCount}/{questions.length}):
              </span>
              <div className="flex items-center gap-1.5">
                {questions.map((q, idx) => {
                  const isAnswered = Boolean(answers[q.id]);
                  const isCurrent = idx === currentQuestionIndex;

                  let btnClass = 'bg-slate-800 text-slate-400 hover:bg-slate-700';
                  if (isCurrent) {
                    btnClass = 'bg-teal-500 text-slate-950 font-bold ring-2 ring-teal-400';
                  } else if (isAnswered) {
                    btnClass = 'bg-teal-950 border border-teal-800/60 text-teal-300';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`w-8 h-8 rounded-lg text-xs font-mono transition-all flex items-center justify-center shrink-0 ${btnClass}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Per-Question Timer Visual Progress Bar (if enabled) */}
            {isQuestionTimerEnabled && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 flex items-center gap-1.5 font-semibold">
                    <Timer className="w-3.5 h-3.5 text-amber-400" />
                    <span>مؤقت السؤال الحالي ({perQuestionDuration} ثانية لكل سؤال)</span>
                  </span>
                  <span className={`font-mono font-bold ${questionTimeLeft <= 10 ? 'text-rose-400' : 'text-amber-300'}`}>
                    متبقي {questionTimeLeft} ثانية
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-700 ${
                      questionTimeLeft <= 10 ? 'bg-rose-500' : 'bg-amber-400'
                    }`}
                    style={{
                      width: `${Math.max(0, Math.min(100, (questionTimeLeft / perQuestionDuration) * 100))}%`
                    }}
                  />
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-sm flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {!currentQuestion ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3 shadow-xl">
                <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
                <div className="text-sm font-bold text-white">جارٍ تحضير أسئلة الاختبار...</div>
                <p className="text-xs text-slate-400">
                  لن يتم احتساب أي ثانية من وقت الاختبار حتى تظهر الأسئلة أمامك الآن.
                </p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-6">
                
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-teal-400 bg-teal-950/80 px-2.5 py-1 rounded-lg border border-teal-800/50">
                      السؤال {currentQuestionIndex + 1} من {questions.length}
                    </span>
                    <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
                      {currentQuestion.questionType === 'essay'
                        ? 'سؤال مقالي'
                        : currentQuestion.questionType === 'fill_blank'
                        ? 'إكمال الفراغ'
                        : currentQuestion.questionType === 'true_false'
                        ? 'صح وخطأ'
                        : 'اختيار من متعدد'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    النقاط: {currentQuestion.points}
                  </span>
                </div>

                {(() => {
                  const isEnglishQuestion =
                    currentQuestion.language === 'en' ||
                    (!/[\u0600-\u06FF]/.test(currentQuestion.stemArabic || '') &&
                      /[A-Za-z]/.test(currentQuestion.stemArabic || ''));
                  return (
                    <>
                      <div className="space-y-2" dir={isEnglishQuestion ? 'ltr' : 'rtl'}>
                        <p className={`text-base md:text-lg font-bold text-slate-100 leading-relaxed ${isEnglishQuestion ? 'text-left' : 'text-right'}`}>
                          {currentQuestion.stemArabic}
                        </p>
                        {currentQuestion.stemEnglish && currentQuestion.stemEnglish !== currentQuestion.stemArabic && (
                          <p className="text-xs md:text-sm font-medium text-slate-400 font-mono text-left" dir="ltr">
                            {currentQuestion.stemEnglish}
                          </p>
                        )}
                        {currentQuestion.imageUrl && (
                          <div className="mt-3 rounded-xl overflow-hidden border border-slate-800 max-h-64">
                            <img src={currentQuestion.imageUrl} alt="Medical Slide" className="w-full object-contain bg-slate-950" />
                          </div>
                        )}
                      </div>

                      {/* Question Type: Fill in the Blank Answer Input */}
                      {currentQuestion.questionType === 'fill_blank' && (
                        <div className="space-y-2 pt-2">
                          <label className="block text-xs font-bold text-sky-300">
                            {isEnglishQuestion
                              ? 'Type the missing medical word / term in the blank:'
                              : 'اكتب الكلمة أو المصطلح الطبي المناسب لإكمال الفراغ:'}
                          </label>
                          <input
                            type="text"
                            value={answers[currentQuestion.id] || ''}
                            onChange={(e) => handleSelectOption(currentQuestion.id, e.target.value)}
                            dir={isEnglishQuestion ? 'ltr' : 'rtl'}
                            placeholder={
                              isEnglishQuestion
                                ? 'Type exact answer here (auto-saved)...'
                                : 'اكتب إجابة الفراغ هنا بدقة (يتم الحفظ التلقائي فور الكتابة)...'
                            }
                            className="w-full px-4 py-3.5 rounded-xl bg-slate-950/90 border border-sky-700/70 text-sm font-bold text-white focus:outline-none focus:border-sky-400"
                          />
                        </div>
                      )}

                      {/* Question Type: Essay Answer Area */}
                      {currentQuestion.questionType === 'essay' && (
                        <div className="space-y-2 pt-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{isEnglishQuestion ? 'Write your detailed medical essay answer:' : 'اكتب إجابتك المقالية الطبية بالتفصيل:'}</span>
                            <span className="font-mono">{(answers[currentQuestion.id] || '').length} {isEnglishQuestion ? 'chars' : 'حرف'}</span>
                          </div>
                          <textarea
                            value={answers[currentQuestion.id] || ''}
                            onChange={(e) => handleSelectOption(currentQuestion.id, e.target.value)}
                            rows={6}
                            dir={isEnglishQuestion ? 'ltr' : 'rtl'}
                            placeholder={isEnglishQuestion ? 'Type your detailed clinical answer here (auto-saved)...' : 'اكتب الإجابة المقالية هنا بالتفصيل (يتم الحفظ التلقائي فور الكتابة)...'}
                            className="w-full p-4 rounded-xl bg-slate-950/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-teal-500 leading-relaxed"
                          />
                        </div>
                      )}

                      {/* Question Type: True / False Choice Cards */}
                      {currentQuestion.questionType === 'true_false' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2" dir={isEnglishQuestion ? 'ltr' : 'rtl'}>
                          {currentQuestion.options.map((opt) => {
                            const isSelected = answers[currentQuestion.id] === opt.id;
                            const cleanOptLabel = sanitizeOptionTextForDisplay(opt.textArabic);
                            const isTrue = opt.id === 'opt-a' || cleanOptLabel.includes('صح') || /true/i.test(cleanOptLabel);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleSelectOption(currentQuestion.id, opt.id)}
                                className={`p-5 rounded-2xl border text-base font-bold transition-all flex items-center justify-center gap-3 ${
                                  isSelected
                                    ? isTrue
                                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-100 ring-2 ring-emerald-500/50 shadow-lg'
                                      : 'bg-rose-950/80 border-rose-500 text-rose-100 ring-2 ring-rose-500/50 shadow-lg'
                                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                                }`}
                              >
                                {isTrue ? (
                                  <CheckCircle2 className={`w-6 h-6 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
                                ) : (
                                  <X className={`w-6 h-6 ${isSelected ? 'text-rose-400' : 'text-slate-500'}`} />
                                )}
                                <span>{cleanOptLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Question Type: MCQ with Dynamic Options */}
                      {(!currentQuestion.questionType || currentQuestion.questionType === 'mcq') && (
                        <div className="space-y-3 pt-2" dir={isEnglishQuestion ? 'ltr' : 'rtl'}>
                          {currentQuestion.options.map((opt, oIdx) => {
                            const isSelected = answers[currentQuestion.id] === opt.id;
                            const letter = isEnglishQuestion
                              ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][oIdx] || opt.id
                              : ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'][oIdx] || opt.id;
                            const cleanOptArabic = sanitizeOptionTextForDisplay(opt.textArabic);
                            const cleanOptEnglish = opt.textEnglish
                              ? sanitizeOptionTextForDisplay(opt.textEnglish)
                              : '';

                            return (
                              <button
                                key={opt.id}
                                onClick={() => handleSelectOption(currentQuestion.id, opt.id)}
                                className={`w-full ${isEnglishQuestion ? 'text-left' : 'text-right'} p-4 rounded-xl border text-sm font-medium transition-all flex items-start gap-3 ${
                                  isSelected
                                    ? 'bg-teal-950/70 border-teal-500 text-teal-100 shadow-lg shadow-teal-950/50 ring-1 ring-teal-500/50'
                                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:border-slate-700'
                                }`}
                              >
                                <div className={`w-7 h-7 rounded-lg border text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                  isSelected ? 'bg-teal-500 border-teal-400 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-400'
                                }`}>
                                  {isSelected ? `✓ ${letter}` : letter}
                                </div>
                                <div className="flex-1 space-y-1">
                                  <div>{cleanOptArabic}</div>
                                  {cleanOptEnglish && cleanOptEnglish !== cleanOptArabic && (
                                    <div className="text-xs text-slate-500 font-mono" dir="ltr">{cleanOptEnglish}</div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}

              </div>
            )}

          </div>
        )}

      </main>

      {/* 3. Footer Bar Navigation */}
      {!result && !showMandatoryGuestGate && hasStartedSolving && (
        <footer 
          className="bg-slate-900 border-t border-slate-800 px-3 py-2.5 sm:px-4 sm:py-3.5 flex items-center justify-between gap-2 shadow-xl shrink-0"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
            disabled={currentQuestionIndex === 0}
            className="min-h-[42px] px-3 sm:px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors shrink-0 active:scale-95"
            title="السؤال السابق"
          >
            <ChevronRight className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">السؤال السابق</span>
            <span className="sm:hidden">السابق</span>
          </button>

          <button
            onClick={() => setShowConfirmSubmit(true)}
            className="min-h-[42px] flex-1 max-w-sm px-3 sm:px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 sm:gap-2 transition-colors shadow-lg shadow-teal-900/40 active:scale-95"
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="hidden sm:inline">إظهار النتيجة وتسليم الاختبار</span>
            <span className="sm:hidden">تسليم الاختبار</span>
          </button>

          <button
            onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
            disabled={currentQuestionIndex === questions.length - 1}
            className="min-h-[42px] px-3 sm:px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors shrink-0 active:scale-95"
            title="السؤال التالي"
          >
            <span className="hidden sm:inline">السؤال التالي</span>
            <span className="sm:hidden">التالي</span>
            <ChevronLeft className="w-4 h-4 shrink-0" />
          </button>
        </footer>
      )}

      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">تأكيد التسليم وإظهار النتيجة</h3>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
              <p>
                لقد أجبت على <strong className="text-teal-400 font-mono text-sm">{answeredCount}</strong> من أصل <strong className="text-slate-100 font-mono text-sm">{questions.length}</strong> أسئلة.
              </p>
              {answeredCount < questions.length && (
                <p className="text-amber-300 font-semibold">
                  تنبيه: هناك أسئلة لم تقم بالإجابة عليها بعد. هل أنت متأكد من الرغبة في التسليم الآن؟
                </p>
              )}
              <p className="text-slate-400 pt-1">
                {isGuestMode
                  ? 'بمجرد التأكيد، سيتم تصحيح إجاباتك وإظهار نتيجتك النهائية فوراً، مع إمكانية إنشاء حسابك للدخول في المنافسة مع الطلاب.'
                  : `بمجرد التسليم، سيتم تصحيح الإجابات سحابياً وإدراج نتيجتك في قائمة الترتيب بالاسم الذي اخترته (${previewDisplayName}).`}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                متابعة الحل
              </button>
              <button
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors shadow-lg flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري التسليم والتصحيح...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>تأكيد وتسليم الآن</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
