/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Student Assessment & Academic Competition List
 * Features:
 * - Student Display Name / Username Visibility Preference Bar
 * - Share Trial Exam Modal (Copy Link, WhatsApp, Telegram)
 * - Live Ordered Leaderboard Modal (Top Podium + Ranked Results)
 * - Optional Per-Question Timer, Optional Full Exam Timer, and Availability Countdown
 */

import React, { useState, useEffect } from 'react';
import { 
  Award, 
  FileText, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  RefreshCw, 
  Trophy,
  ShieldCheck,
  Lock,
  Share2,
  Copy,
  Check,
  UserCheck,
  Timer,
  Medal,
  X,
  Sparkles,
  ExternalLink,
  Download
} from 'lucide-react';
import { 
  Assessment, 
  AssessmentAttempt, 
  AssessmentQuestionPublic, 
  AssessmentResult, 
  AssessmentType,
  LeaderboardNameMode
} from '../../types/umed.ts';
import { 
  getPublishedAssessmentsForStudent, 
  getCachedPublishedAssessments,
  startAttemptServer, 
  getStudentAttempts, 
  getStudentResults,
  subscribeToAssessments,
  subscribeToExamOfflineSync,
  prefetchAssessmentsForOffline,
  getStudentLeaderboardIdentity,
  saveStudentLeaderboardIdentity,
  formatStudentLeaderboardName,
  resolveResultPublicDisplayName,
  getAssessmentLeaderboard,
  subscribeToAssessmentLeaderboard,
  buildShareableAssessmentUrl,
  downloadExamBookletFile,
  getQuestionsForAssessmentPreview
} from '../../services/assessmentService.ts';
import { syncNotificationsForAssessments } from '../../services/notificationService.ts';
import ExamTakingModal from './ExamTakingModal.tsx';

interface StudentAssessmentListProps {
  universityId: string;
  studyLevelId: string;
  uid: string;
  studentNameArabic?: string;
  initialAssessmentType?: AssessmentType;
  highlightedAssessmentId?: string;
  navigationTimestamp?: number;
}

export default function StudentAssessmentList({
  universityId,
  studyLevelId,
  uid,
  studentNameArabic,
  initialAssessmentType,
  highlightedAssessmentId,
  navigationTimestamp
}: StudentAssessmentListProps) {
  const [activeTab, setActiveTab] = useState<AssessmentType>(initialAssessmentType || 'exam');
  const [assessments, setAssessments] = useState<Assessment[]>(() =>
    getCachedPublishedAssessments(universityId, studyLevelId)
  );
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Student Leaderboard Identity Preferences
  const initialIdentity = getStudentLeaderboardIdentity(uid);
  const [nameMode, setNameMode] = useState<LeaderboardNameMode>(initialIdentity.leaderboardNameMode);
  const [customUsername, setCustomUsername] = useState<string>(initialIdentity.username);
  const [savingIdentity, setSavingIdentity] = useState<boolean>(false);
  const [identitySavedBanner, setIdentitySavedBanner] = useState<boolean>(false);
  const [showIdentityEditor, setShowIdentityEditor] = useState<boolean>(false);

  // Active Exam Session Modal States
  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<AssessmentAttempt | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<AssessmentQuestionPublic[]>([]);
  const [activeInitialResult, setActiveInitialResult] = useState<AssessmentResult | null>(null);
  const [startingAttempt, setStartingAttempt] = useState<string | null>(null);
  const [downloadingExamId, setDownloadingExamId] = useState<string | null>(null);

  // Dedicated Exam Booklet Download Modal State
  const [downloadModalAssessment, setDownloadModalAssessment] = useState<{
    assessment: Assessment;
    result?: AssessmentResult;
  } | null>(null);

  // Dedicated Identity Preference Modal State
  const [showIdentityModal, setShowIdentityModal] = useState<boolean>(false);

  // Share Trial Exam Modal State
  const [sharingAssessment, setSharingAssessment] = useState<Assessment | null>(null);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);

  // Ranked Leaderboard Modal State
  const [leaderboardAssessment, setLeaderboardAssessment] = useState<Assessment | null>(null);
  const [leaderboardItems, setLeaderboardItems] = useState<AssessmentResult[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);

  // Synchronize activeTab when navigated from a notification (Exam vs Competition)
  useEffect(() => {
    if (initialAssessmentType === 'competition' || initialAssessmentType === 'exam') {
      setActiveTab(initialAssessmentType);
    }
  }, [initialAssessmentType, navigationTimestamp]);

  // Also auto-detect tab if highlightedAssessmentId matches a known assessment
  useEffect(() => {
    if (!highlightedAssessmentId || assessments.length === 0) return;
    const target = assessments.find((a) => a.id === highlightedAssessmentId);
    if (target && (target.assessmentType === 'competition' || target.assessmentType === 'exam')) {
      setActiveTab(target.assessmentType);
    }
  }, [highlightedAssessmentId, assessments]);

  // Load Leaderboard when modal opens
  useEffect(() => {
    if (!leaderboardAssessment) return;
    setLoadingLeaderboard(true);
    getAssessmentLeaderboard(leaderboardAssessment.id)
      .then((ranked) => setLeaderboardItems(ranked))
      .catch(() => {})
      .finally(() => setLoadingLeaderboard(false));

    const unsub = subscribeToAssessmentLeaderboard(leaderboardAssessment.id, (liveRanked) => {
      setLeaderboardItems(liveRanked);
    });
    return () => unsub();
  }, [leaderboardAssessment]);

  const loadData = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setStatusMsg(null);
    try {
      const [list, userAttempts, userResults] = await Promise.all([
        getPublishedAssessmentsForStudent(universityId, studyLevelId),
        getStudentAttempts(uid),
        getStudentResults(uid)
      ]);
      setAssessments(list);
      setAttempts(userAttempts);
      setResults(userResults);
      syncNotificationsForAssessments(uid, list, universityId, studyLevelId);
    } catch (err: any) {
      console.error('Failed to load assessments:', err);
      setStatusMsg({ type: 'error', text: 'حدث خطأ أثناء تحميل التقييمات' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = getCachedPublishedAssessments(universityId, studyLevelId);
    if (cached.length > 0) {
      setAssessments(cached);
      syncNotificationsForAssessments(uid, cached, universityId, studyLevelId);
      prefetchAssessmentsForOffline(cached).catch(() => {});
    }
    loadData(cached.length === 0);
    const unsub = subscribeToAssessments(
      universityId,
      (liveList) => {
        const published = liveList.filter(
          a => a.status === 'published' && (!a.studyLevelId || a.studyLevelId === studyLevelId || a.studyLevelId === 'ALL')
        );
        setAssessments(published);
        syncNotificationsForAssessments(uid, published, universityId, studyLevelId);
        prefetchAssessmentsForOffline(published).catch(() => {});
      },
      undefined,
      'published'
    );
    const unsubOfflineSync = subscribeToExamOfflineSync((count, syncing) => {
      setPendingOfflineCount(count);
      if (count === 0 && !syncing) {
        getStudentResults(uid).then((r) => setResults(r)).catch(() => {});
      }
    });
    return () => {
      unsub();
      unsubOfflineSync();
    };
  }, [universityId, studyLevelId, uid]);

  const handleStartAttempt = async (assessment: Assessment) => {
    setStartingAttempt(assessment.id);
    setStatusMsg(null);

    try {
      const res = await startAttemptServer(assessment.id, assessment);
      setActiveInitialResult(null);
      setActiveAssessment(assessment);
      setActiveAttempt(res.attempt);
      setActiveQuestions(res.questions);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'تعذر بدء الاختبار، يرجى المحاولة مرة أخرى' });
    } finally {
      setStartingAttempt(null);
    }
  };

  const handleOpenCompletedExamReview = async (assessment: Assessment, userResult: AssessmentResult) => {
    setStartingAttempt(assessment.id);
    setStatusMsg(null);
    try {
      const qs = await getQuestionsForAssessmentPreview(assessment);
      const matchingAttempt = attempts.find((a) => a.id === userResult.attemptId) || {
        id: userResult.attemptId || `att-rev-${assessment.id}`,
        assessmentId: assessment.id,
        uid,
        startedAt: userResult.submittedAt,
        expiresAt: userResult.submittedAt,
        status: 'scored' as const,
        answers: {},
        lastSavedAt: userResult.submittedAt,
        attemptNumber: 1
      };
      setActiveInitialResult(userResult);
      setActiveAssessment(assessment);
      setActiveAttempt(matchingAttempt);
      setActiveQuestions(qs);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'تعذر فتح تفاصيل النتيجة والمراجعة' });
    } finally {
      setStartingAttempt(null);
    }
  };

  const handleQuickDownloadExamFile = async (
    assessment: Assessment,
    userResult: AssessmentResult | undefined,
    mode: 'solved' | 'blank'
  ) => {
    const key = `${assessment.id}-${mode}`;
    if (downloadingExamId) return;
    setDownloadingExamId(key);
    try {
      const matchingAttempt = userResult
        ? attempts.find((a) => a.id === userResult.attemptId)
        : undefined;
      await downloadExamBookletFile({
        assessment,
        result: userResult || null,
        answers: matchingAttempt?.answers || {},
        studentNameArabic,
        mode
      });
      setStatusMsg({
        type: 'success',
        text:
          mode === 'solved'
            ? `تم تحميل ملف "${assessment.titleArabic}" محلولاً مع التعليلات الطبية بنجاح ✓`
            : `تم تحميل نسخة التدريب لـ "${assessment.titleArabic}" بنجاح ✓`
      });
    } catch {
      setStatusMsg({ type: 'error', text: 'تعذر تجهيز ملف الاختبار للتحميل' });
    } finally {
      setDownloadingExamId(null);
    }
  };

  const handleSaveIdentityPreference = async (newMode: LeaderboardNameMode, newUsername: string) => {
    setNameMode(newMode);
    setCustomUsername(newUsername);
    setSavingIdentity(true);
    try {
      await saveStudentLeaderboardIdentity(
        uid,
        { username: newUsername, leaderboardNameMode: newMode },
        studentNameArabic
      );
      setIdentitySavedBanner(true);
      setTimeout(() => setIdentitySavedBanner(false), 3000);
      if (leaderboardAssessment) {
        const refreshed = await getAssessmentLeaderboard(leaderboardAssessment.id);
        setLeaderboardItems(refreshed);
      }
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleCopyShareLink = async (assessment: Assessment) => {
    const url = buildShareableAssessmentUrl(assessment);
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
    setCopiedShareId(assessment.id);
    setTimeout(() => setCopiedShareId(null), 2500);
  };

  const formatRemainingAvailability = (closesAtStr: string) => {
    const diffMs = new Date(closesAtStr).getTime() - Date.now();
    if (diffMs <= 0) return 'انتهت فترة التوفر';
    const totalHours = Math.floor(diffMs / 3600000);
    const days = Math.floor(totalHours / 24);
    const remHours = totalHours % 24;
    if (days > 0) {
      return `متبقي للإغلاق: ${days} يوم و ${remHours} ساعة`;
    }
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `متبقي للإغلاق: ${remHours} ساعة و ${mins} دقيقة`;
  };

  const formatDurationShort = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} ث`;
    return `${m} د ${s} ث`;
  };

  const previewPublicName = formatStudentLeaderboardName({
    uid,
    fullNameArabic: studentNameArabic || 'طالب طب بشري',
    username: customUsername,
    mode: nameMode
  });

  const filteredAssessments = assessments
    .filter(a => a.assessmentType === activeTab)
    .sort((a, b) => {
      if (highlightedAssessmentId) {
        if (a.id === highlightedAssessmentId) return -1;
        if (b.id === highlightedAssessmentId) return 1;
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Top Banner & Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span>مركز الاختبارات والمسابقات الأكاديمية التنافسية</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              اختبارات المواد والمسابقات الطبية مع الترتيب التنافسي، المؤقتات الذكية، ومشاركة الاختبارات التجريبية
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('exam')}
              className={`flex-1 sm:flex-initial justify-center px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'exam'
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>امتحانات المواد ({assessments.filter(a => a.assessmentType === 'exam').length})</span>
            </button>
            <button
              onClick={() => setActiveTab('competition')}
              className={`flex-1 sm:flex-initial justify-center px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'competition'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Award className="w-4 h-4 shrink-0" />
              <span>المسابقات الطبية ({assessments.filter(a => a.assessmentType === 'competition').length})</span>
            </button>
          </div>
        </div>

        {/* Compact Student Display Name / Leaderboard Identity Strip */}
        <div className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <UserCheck className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="text-slate-400">اسمك في لوحة الشرف:</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 font-bold">
              {previewPublicName}
            </span>
            {identitySavedBanner && (
              <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                تم التحديث ✓
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowIdentityModal(true)}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-xl transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>تخصيص اللقب أو اسم العرض</span>
          </button>
        </div>
      </div>

      {pendingOfflineCount > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/60 text-amber-200 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            <span>
              لديك ({pendingOfflineCount}) محاولة اختبار محفوظة محلياً (أوفلاين) — ستتم مزامنتها ورصد الدرجة سحابياً فور توفر الإنترنت.
            </span>
          </div>
        </div>
      )}

      {statusMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
          statusMsg.type === 'error' ? 'bg-rose-950/60 border-rose-800 text-rose-300' : 'bg-teal-950/60 border-teal-800 text-teal-300'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400 space-y-3 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-teal-400" />
          <p className="text-xs">جاري تحميل الاختبارات والمسابقات المتاحة...</p>
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div className="p-12 text-center text-slate-400 space-y-3 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <FileText className="w-12 h-12 mx-auto text-slate-600" />
          <h3 className="text-sm font-bold text-slate-300">لا توجد تقييمات منشورة حالياً لهذا المستوى</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            لم يقم مسؤولو الكلية بنشر {activeTab === 'exam' ? 'امتحانات' : 'مسابقات'} جديدة لمستواك الأكاديمي الحالي بعد.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAssessments.map((assessment) => {
            const now = new Date();
            const opensAt = new Date(assessment.opensAt);
            const closesAt = new Date(assessment.closesAt);

            const isOpen = now >= opensAt && now <= closesAt;
            const isUpcoming = now < opensAt;

            const userAttemptList = attempts.filter(
              a => a.assessmentId === assessment.id && (a.status === 'scored' || a.status === 'submitted')
            );
            const activeInProgressAttempt = attempts.find(
              a => a.assessmentId === assessment.id && a.status === 'in_progress' && new Date(a.expiresAt).getTime() > now.getTime()
            );
            const userResult = results.find(r => r.assessmentId === assessment.id);
            const attemptCount = userAttemptList.length;
            const hasMaxAttempts = attemptCount >= assessment.maxAttempts && !activeInProgressAttempt;

            const isHighlighted = Boolean(highlightedAssessmentId && highlightedAssessmentId === assessment.id);
            const hasFullTimer = assessment.enableExamTimer !== false && Number(assessment.durationMinutes) > 0;
            const hasPerQuestionTimer = Number(assessment.questionDurationSeconds || 0) > 0;

            return (
              <div 
                key={assessment.id}
                className={`bg-slate-900 rounded-2xl p-5 shadow-xl transition-all space-y-4 flex flex-col justify-between border ${
                  isHighlighted
                    ? activeTab === 'competition'
                      ? 'border-amber-500 ring-2 ring-amber-500/30 bg-amber-950/15'
                      : 'border-teal-500 ring-2 ring-teal-500/30 bg-teal-950/15'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isOpen 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                          : isUpcoming 
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {isOpen ? 'متاح الآن' : isUpcoming ? 'قادم قريباً' : 'مغلق / منتهي'}
                      </span>
                      {isHighlighted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                          مفتوح من الإشعار ✓
                        </span>
                      )}
                      {hasPerQuestionTimer && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Timer className="w-3 h-3" />
                          <span>{assessment.questionDurationSeconds}ث / سؤال</span>
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono">
                      المحاولات المكتملة: {attemptCount}/{assessment.maxAttempts}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white leading-snug">
                    {assessment.titleArabic}
                  </h3>

                  {assessment.descriptionArabic && (
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {assessment.descriptionArabic}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span>
                        {hasFullTimer ? `مؤقت الاختبار: ${assessment.durationMinutes} دقيقة` : 'المؤقت الكلي: وقت مفتوح'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span>الدرجة الكلية: {assessment.totalPoints} نقطة</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-2 text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/60 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>متاح حتى: {closesAt.toLocaleDateString('ar-YE')}</span>
                      </div>
                      {isOpen && (
                        <span className="text-amber-300 font-semibold">
                          {formatRemainingAvailability(assessment.closesAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Score Banner if completed */}
                {userResult && (
                  userResult.isReleased ? (
                    <div className="p-3 rounded-xl bg-teal-950/60 border border-teal-800/60 flex items-center justify-between text-xs text-teal-200">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-teal-400 shrink-0" />
                        <span>درجتك المعتمدة: <strong className="font-mono text-sm">{userResult.score}/{userResult.totalPoints}</strong></span>
                      </div>
                      <span className="font-mono font-bold bg-teal-500/20 px-2.5 py-0.5 rounded-lg text-teal-300">
                        {userResult.percentage}%
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 flex items-center gap-2 text-xs text-amber-300">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>تم تسليم المحاولة بنجاح — ستظهر الدرجة وملف المراجعة فور إعلان النتائج رسمياً.</span>
                    </div>
                  )
                )}

                {/* Primary Action Button (Start Exam or Review Result) */}
                <div className="space-y-2">
                  <button
                    onClick={() =>
                      hasMaxAttempts && userResult
                        ? handleOpenCompletedExamReview(assessment, userResult)
                        : handleStartAttempt(assessment)
                    }
                    disabled={(!isOpen && !userResult) || (hasMaxAttempts && !userResult) || startingAttempt === assessment.id}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                      isOpen && !hasMaxAttempts
                        ? activeTab === 'competition'
                          ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30'
                          : 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/30'
                        : hasMaxAttempts && userResult
                        ? 'bg-teal-950/90 hover:bg-teal-900 border border-teal-500/50 text-teal-200 shadow-md'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {startingAttempt === assessment.id ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جارٍ فتح الاختبار...</span>
                      </>
                    ) : hasMaxAttempts && userResult ? (
                      <>
                        <Award className="w-4 h-4 text-teal-400" />
                        <span>مراجعة النتيجة والتعليلات وتحميل ملف الاختبار</span>
                      </>
                    ) : hasMaxAttempts ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تم استيفاء المحاولات المسموحة</span>
                      </>
                    ) : activeInProgressAttempt ? (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>متابعة الاختبار الجاري (المحاولة #{activeInProgressAttempt.attemptNumber || attemptCount + 1})</span>
                      </>
                    ) : isOpen ? (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>{activeTab === 'competition' ? 'بدء الاختبار التنافسي الآن' : 'بدء الاختبار الآن'}</span>
                      </>
                    ) : (
                      <span>الاختبار غير متاح حالياً</span>
                    )}
                  </button>

                  {/* Secondary Action Toolbar: 3 Clean Equal Buttons */}
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setLeaderboardAssessment(assessment)}
                      className="py-2 px-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                      title="عرض لوحة الترتيب وقائمة المتصدرين"
                    >
                      <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">الترتيب</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDownloadModalAssessment({ assessment, result: userResult })}
                      className="py-2 px-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-teal-500/30 text-teal-300 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                      title="تحميل ملف الاختبار للمذاكرة والمراجعة الذاتية"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span className="truncate">تحميل الملف</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSharingAssessment(assessment)}
                      className="py-2 px-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-indigo-500/30 text-indigo-200 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                      title="مشاركة رابط الاختبار مع الزملاء"
                    >
                      <Share2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="truncate">مشاركة</span>
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Share Trial Exam Modal */}
      {sharingAssessment && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-300 font-bold text-base">
                <Share2 className="w-5 h-5" />
                <span>مشاركة الاختبار التجريبي مع الطلاب</span>
              </div>
              <button
                onClick={() => setSharingAssessment(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-1.5">
                <div className="font-bold text-indigo-200 text-sm">{sharingAssessment.titleArabic}</div>
                <p className="text-slate-300">
                  عند مشاركة هذا الرابط مع أي طالب أو زميل، سيتمكن من فتح الاختبار وحل جميع الأسئلة فوراً ومعرفة نتيجته النهائية وتحميل ملف الاختبار للمذاكرة، مع إمكانية إنشاء حساب في المنصة لإدراج درجته في لوحة الشرف والمنافسة مع باقي الطلاب!
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-slate-400 font-semibold">رابط الاختبار التجريبي المباشر:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={buildShareableAssessmentUrl(sharingAssessment)}
                    dir="ltr"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-teal-300 font-mono select-all"
                  />
                  <button
                    onClick={() => handleCopyShareLink(sharingAssessment)}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                  >
                    {copiedShareId === sharingAssessment.id ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>تم النسخ ✓</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>نسخ الرابط</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `🩺 اختبر مستواك الطبي الآن في "${sharingAssessment.titleArabic}" على منصة UMED وتعرف على ترتيبك بين زملائك:\n${buildShareableAssessmentUrl(sharingAssessment)}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-center flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>مشاركة عبر واتساب</span>
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(
                    buildShareableAssessmentUrl(sharingAssessment)
                  )}&text=${encodeURIComponent(
                    `🩺 اختبر مستواك الطبي الآن في "${sharingAssessment.titleArabic}" على منصة UMED وتعرف على ترتيبك بين زملائك!`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 font-bold text-center flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>مشاركة عبر تيليجرام</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ranked Leaderboard Modal */}
      {leaderboardAssessment && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 max-w-2xl w-full max-h-[88dvh] flex flex-col justify-between space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
                  <Trophy className="w-5 h-5" />
                  <span>لوحة الشرف وترتيب نتائج الطلاب</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{leaderboardAssessment.titleArabic}</p>
              </div>
              <button
                onClick={() => setLeaderboardAssessment(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingLeaderboard && leaderboardItems.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400" />
                  <div>جاري تحميل ترتيب الطلاب...</div>
                </div>
              ) : leaderboardItems.length === 0 ? (
                <div className="p-10 text-center text-slate-400 space-y-2 bg-slate-950 rounded-xl border border-slate-800">
                  <Trophy className="w-10 h-10 mx-auto text-slate-600" />
                  <div className="text-sm font-bold text-slate-300">لا توجد نتائج معلنة في لوحة الترتيب بعد</div>
                  <p className="text-xs text-slate-500">
                    كن أول من يخوض هذا التقييم ليظهر اسمك في الصدارة (#1)!
                  </p>
                </div>
              ) : (
                <>
                  {/* Top 3 Podium Cards */}
                  {leaderboardItems.length >= 1 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pb-2">
                      {leaderboardItems.slice(0, 3).map((topItem, i) => {
                        const rnk = i + 1;
                        const name = resolveResultPublicDisplayName(topItem);
                        return (
                          <div
                            key={topItem.id || i}
                            className={`p-3.5 rounded-xl border text-center space-y-1.5 ${
                              rnk === 1
                                ? 'bg-gradient-to-b from-amber-500/20 to-slate-950 border-amber-500/50'
                                : rnk === 2
                                ? 'bg-gradient-to-b from-slate-400/15 to-slate-950 border-slate-400/40'
                                : 'bg-gradient-to-b from-amber-700/20 to-slate-950 border-amber-700/40'
                            }`}
                          >
                            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 border border-slate-700 text-xs font-extrabold font-mono text-amber-300">
                              #{rnk}
                            </div>
                            <div className="text-xs font-bold text-white line-clamp-1">{name}</div>
                            <div className="text-lg font-extrabold text-teal-400 font-mono">
                              {topItem.percentage}%
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {topItem.score}/{topItem.totalPoints} نقطة • {formatDurationShort(topItem.durationSeconds)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Full Ordered List */}
                  <div className="space-y-2">
                    {leaderboardItems.map((item, idx) => {
                      const rank = idx + 1;
                      const isMe = item.uid === uid;
                      const displayName = resolveResultPublicDisplayName(item);

                      return (
                        <div
                          key={item.id || `${item.uid}-${idx}`}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs ${
                            isMe
                              ? 'bg-teal-950/60 border-teal-500/60 text-teal-100 ring-1 ring-teal-500/30'
                              : 'bg-slate-950/80 border-slate-800 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-lg font-mono font-extrabold flex items-center justify-center text-xs ${
                              rank === 1
                                ? 'bg-amber-400 text-slate-950'
                                : rank === 2
                                ? 'bg-slate-300 text-slate-950'
                                : rank === 3
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {rank <= 3 ? <Medal className="w-4 h-4" /> : `#${rank}`}
                            </span>
                            <div>
                              <div className="font-bold flex items-center gap-1.5">
                                <span>{displayName}</span>
                                {isMe && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30">
                                    أنت
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                زمن الحل: {formatDurationShort(item.durationSeconds)}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-slate-300 font-semibold">{item.score}/{item.totalPoints}</span>
                            <span className="px-2.5 py-1 rounded-lg bg-teal-500/15 text-teal-300 font-bold">
                              {item.percentage}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                اسمك المعروض حالياً: <strong className="text-teal-300">{previewPublicName}</strong>
              </span>
              <button
                onClick={() => setLeaderboardAssessment(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Exam Booklet Download Modal Sheet */}
      {downloadModalAssessment && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-teal-500/40 rounded-2xl p-5 sm:p-6 max-w-lg w-full my-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-teal-400" />
                <div>
                  <h3 className="text-sm font-extrabold text-white">تحميل ملف الاختبار الكامل</h3>
                  <p className="text-[11px] text-teal-300 truncate max-w-xs">{downloadModalAssessment.assessment.titleArabic}</p>
                </div>
              </div>
              <button
                onClick={() => setDownloadModalAssessment(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              اختر صيغة الملف التي ترغب بتحميلها. يتم حفظ الملف بصيغة مستقلة وتنسيق طبي أنيق يعمل على هاتفك بدون إنترنت وقابل للحفظ كـ PDF أو الطباعة المباشرة:
            </p>

            <div className="space-y-3">
              {/* Option 1: Solved copy */}
              <div className="p-4 rounded-xl bg-teal-950/40 border border-teal-500/40 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-xs sm:text-sm text-teal-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                      <span>نسخة المذاكرة المحلولة (مع التعليلات)</span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      تتضمن جميع الأسئلة، إجابتك، الإجابة الصحيحة المعتمدة مميزة باللون الأخضر، والتعليل الطبي والسريري المفصل لكل سؤال.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={downloadingExamId !== null}
                  onClick={async () => {
                    await handleQuickDownloadExamFile(
                      downloadModalAssessment.assessment,
                      downloadModalAssessment.result,
                      'solved'
                    );
                    setDownloadModalAssessment(null);
                  }}
                  className="w-full mt-1 py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {downloadingExamId === `${downloadModalAssessment.assessment.id}-solved`
                      ? 'جارٍ تجهيز وتحميل الملف...'
                      : 'تحميل نسخة المذاكرة المحلولة الآن'}
                  </span>
                </button>
              </div>

              {/* Option 2: Blank practice copy */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-xs sm:text-sm text-white flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>نسخة التدريب الذاتي (غير محلولة)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      تتضمن جميع الأسئلة والخيارات فارغة للتدريب وإعادة الاختبار بنفسك، مع جدول مفتاح الإجابات (Answer Key) في نهاية الملف للمراجعة.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={downloadingExamId !== null}
                  onClick={async () => {
                    await handleQuickDownloadExamFile(
                      downloadModalAssessment.assessment,
                      downloadModalAssessment.result,
                      'blank'
                    );
                    setDownloadModalAssessment(null);
                  }}
                  className="w-full mt-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-slate-700"
                >
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>
                    {downloadingExamId === `${downloadModalAssessment.assessment.id}-blank`
                      ? 'جارٍ تجهيز وتحميل الملف...'
                      : 'تحميل نسخة التدريب غير المحلولة'}
                  </span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setDownloadModalAssessment(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Identity Preference Modal Sheet */}
      {showIdentityModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-teal-500/40 rounded-2xl p-5 sm:p-6 max-w-lg w-full my-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-extrabold text-white">تخصيص اسم العرض في لوحة الترتيب والمنافسة</h3>
              </div>
              <button
                onClick={() => setShowIdentityModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-teal-950/40 border border-teal-500/30 text-xs text-center space-y-1">
              <span className="text-[11px] text-slate-400 block">معاينة ظهور اسمك أمام زملائك في قائمة المتصدرين:</span>
              <div className="text-base font-black text-teal-300 font-mono pt-0.5">{previewPublicName}</div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 block">اختر نمط الاسم المفضل:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'full_name', label: 'الاسم الكامل الرسمي', hint: 'يظهر اسمك الحقيقي المسجل في الكلية كاملاً' },
                  { id: 'custom_username', label: 'اسم مستخدم مخصص (@)', hint: 'اختر لقباً طبياً تنافسياً مميزاً' },
                  { id: 'abbreviated', label: 'الاسم المختصر', hint: 'الاسم الأول مع الحرف الأول من اللقب' },
                  { id: 'anonymous_code', label: 'لقب طبي مشفر', hint: 'مشاركة ومنافسة بخصوصية وسرية تامة' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={savingIdentity}
                    onClick={() => handleSaveIdentityPreference(opt.id as LeaderboardNameMode, customUsername)}
                    className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between ${
                      nameMode === opt.id
                        ? 'bg-teal-950/80 border-teal-500 text-teal-200 ring-1 ring-teal-500/40 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className="text-[10px] text-slate-400 mt-1 leading-normal">{opt.hint}</div>
                  </button>
                ))}
              </div>

              {nameMode === 'custom_username' && (
                <div className="pt-2 space-y-2">
                  <label className="block text-xs font-bold text-slate-300">اكتب اسم المستخدم أو اللقب التنافسي:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customUsername}
                      onChange={(e) => setCustomUsername(e.target.value)}
                      placeholder="مثال: Dr_Cardio_Yemen"
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:border-teal-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={savingIdentity}
                      onClick={() => handleSaveIdentityPreference('custom_username', customUsername)}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors shrink-0"
                    >
                      {savingIdentity ? 'جاري الحفظ...' : 'اعتماد'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowIdentityModal(false)}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
              >
                تم واعتماد
              </button>
            </div>
          </div>
        </div>
      )}

      {activeAssessment && activeAttempt && (
        <ExamTakingModal
          assessment={activeAssessment}
          attempt={activeAttempt}
          questions={activeQuestions}
          studentNameArabic={studentNameArabic}
          uid={uid}
          initialResult={activeInitialResult}
          onClose={() => {
            setActiveAssessment(null);
            setActiveAttempt(null);
            setActiveInitialResult(null);
            loadData();
          }}
          onSubmitted={(res) => {
            setResults(prev => [...prev.filter(r => r.id !== res.id), res]);
            loadData();
          }}
        />
      )}

    </div>
  );
}
