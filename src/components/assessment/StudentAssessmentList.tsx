/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Student Assessment & Academic Competition List
 * Organized into 3 Clean Top Tabs:
 * 1) الاختبارات والمسابقات المتاحة
 * 2) لوحة الشرف والترتيب (Leaderboard)
 * 3) سجل محاولاتي ونتائجي السابقة مع الشهادات
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
  ExternalLink,
  Download,
  History,
  Sparkles
} from 'lucide-react';
import { 
  Assessment, 
  AssessmentAttempt, 
  AssessmentQuestionPublic, 
  AssessmentResult, 
  AssessmentType
} from '../../types/umed.ts';
import { 
  getPublishedAssessmentsForStudent, 
  getCachedPublishedAssessments,
  prepareAttemptInstant,
  startAttemptServer, 
  getStudentAttempts, 
  getStudentResults,
  subscribeToAssessments,
  subscribeToExamOfflineSync,
  prefetchAssessmentsForOffline,
  getStudentLeaderboardIdentity,
  formatStudentLeaderboardName,
  resolveResultPublicDisplayName,
  getAssessmentLeaderboard,
  subscribeToAssessmentLeaderboard,
  buildShareableAssessmentUrl,
  downloadExamBookletFile,
  getQuestionsForAssessmentPreview
} from '../../services/assessmentService.ts';
import { syncNotificationsForAssessments } from '../../services/notificationService.ts';
import { useAuth } from '../../context/AuthContext.tsx';
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

type MainSectionTab = 'available' | 'leaderboard' | 'history_certificates';

export default function StudentAssessmentList({
  universityId,
  studyLevelId,
  uid,
  studentNameArabic,
  initialAssessmentType,
  highlightedAssessmentId,
  navigationTimestamp
}: StudentAssessmentListProps) {
  const [mainTab, setMainTab] = useState<MainSectionTab>('available');
  const [typeFilter, setTypeFilter] = useState<'all' | AssessmentType>(initialAssessmentType || 'all');

  const [assessments, setAssessments] = useState<Assessment[]>(() =>
    getCachedPublishedAssessments(universityId, studyLevelId)
  );
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const { userProfile } = useAuth();
  const initialIdentity = getStudentLeaderboardIdentity(uid);
  const effectiveUsername = userProfile?.username || initialIdentity.username || '';
  const effectiveFullName = userProfile?.displayNameArabic || studentNameArabic || 'طالب طب بشري';

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

  // Share Trial Exam Modal State
  const [sharingAssessment, setSharingAssessment] = useState<Assessment | null>(null);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);

  // Leaderboard Tab & Modal State
  const [selectedLeaderboardAssessmentId, setSelectedLeaderboardAssessmentId] = useState<string>('');
  const [leaderboardItems, setLeaderboardItems] = useState<AssessmentResult[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);

  // Certificate Preview Modal State
  const [certificatePreview, setCertificatePreview] = useState<{
    assessment: Assessment;
    result: AssessmentResult;
  } | null>(null);

  // Synchronize filter when navigated from a notification (Exam vs Competition)
  useEffect(() => {
    if (initialAssessmentType === 'competition' || initialAssessmentType === 'exam') {
      setMainTab('available');
      setTypeFilter(initialAssessmentType);
    }
  }, [initialAssessmentType, navigationTimestamp]);

  // Auto-detect tab if highlightedAssessmentId matches a known assessment
  useEffect(() => {
    if (!highlightedAssessmentId || assessments.length === 0) return;
    const target = assessments.find((a) => a.id === highlightedAssessmentId);
    if (target) {
      setMainTab('available');
      setTypeFilter('all');
    }
  }, [highlightedAssessmentId, assessments]);

  // Ensure default selected assessment for Leaderboard tab
  useEffect(() => {
    if (assessments.length > 0 && (!selectedLeaderboardAssessmentId || !assessments.some(a => a.id === selectedLeaderboardAssessmentId))) {
      setSelectedLeaderboardAssessmentId(assessments[0].id);
    }
  }, [assessments, selectedLeaderboardAssessmentId]);

  // Subscribe to Leaderboard for the selected assessment
  useEffect(() => {
    if (!selectedLeaderboardAssessmentId) {
      setLeaderboardItems([]);
      return;
    }
    setLoadingLeaderboard(true);
    getAssessmentLeaderboard(selectedLeaderboardAssessmentId)
      .then((ranked) => setLeaderboardItems(ranked))
      .catch(() => {})
      .finally(() => setLoadingLeaderboard(false));

    const unsub = subscribeToAssessmentLeaderboard(selectedLeaderboardAssessmentId, (liveRanked) => {
      setLeaderboardItems(liveRanked);
    });
    return () => unsub();
  }, [selectedLeaderboardAssessmentId]);

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
        setTimeout(() => {
          prefetchAssessmentsForOffline(published).catch(() => {});
        }, 1500);
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
      const instant = prepareAttemptInstant(assessment, uid);
      setActiveInitialResult(null);
      setActiveAssessment(assessment);
      setActiveAttempt(instant.attempt);
      setActiveQuestions(instant.cachedQuestions);
      setStartingAttempt(null);

      const expectedCount = assessment.questionIds?.length || 1;
      if (instant.cachedQuestions.length < expectedCount) {
        const res = await startAttemptServer(assessment.id, assessment);
        if (res.questions.length > 0) {
          setActiveQuestions(res.questions);
        }
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'تعذر بدء الاختبار، يرجى المحاولة مرة أخرى' });
      setStartingAttempt(null);
    }
  };

  const handleOpenCompletedExamReview = async (assessment: Assessment, userResult: AssessmentResult) => {
    setStartingAttempt(assessment.id);
    setStatusMsg(null);
    try {
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
      setStartingAttempt(null);

      const qs = await getQuestionsForAssessmentPreview(assessment);
      if (qs.length > 0) {
        setActiveQuestions(qs);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'تعذر فتح تفاصيل النتيجة والمراجعة' });
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
    fullNameArabic: effectiveFullName,
    username: effectiveUsername,
    mode: 'full_name'
  });

  const filteredAssessments = assessments
    .filter(a => typeFilter === 'all' || a.assessmentType === typeFilter)
    .sort((a, b) => {
      if (highlightedAssessmentId) {
        if (a.id === highlightedAssessmentId) return -1;
        if (b.id === highlightedAssessmentId) return 1;
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  const formatDateLatin = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ar-EG-u-nu-latn', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const passedCertificatesCount = results.filter((r) => r.isReleased && r.percentage >= 50).length;
  const selectedLeaderboardAssessment = assessments.find((a) => a.id === selectedLeaderboardAssessmentId) || null;

  const cleanAssessmentTitle = (rawTitle?: string): string => {
    if (!rawTitle) return '';
    return rawTitle
      .replace(/^Exam:\s*/i, 'اختبار: ')
      .replace(/^Competition:\s*/i, 'مسابقة: ')
      .trim();
  };

  const cleanAssessmentDescription = (rawDesc?: string): string => {
    if (!rawDesc) return '';
    return rawDesc
      .replace(/ببنك\s+بنك(\s+)/g, 'ببنك$1')
      .trim();
  };

  return (
    <div className="space-y-4" dir="rtl">
      
      {/* 1. Top Header & 3 Primary Tabs: [المتاحة | لوحة الشرف | نتائجي] */}
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] truncate">
              مركز الاختبارات والمسابقات والنتائج
            </h2>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <UserCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>هويتك التنافسية:</span>
              <strong className="text-teal-400">{previewPublicName}</strong>
            </div>
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={loading}
              className="p-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)]"
              title="تحديث القائمة"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* 3 Main Tabs Bar */}
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 p-1 bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]">
          <button
            type="button"
            onClick={() => setMainTab('available')}
            className={`py-2 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 tabular-nums ${
              mainTab === 'available'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span className="truncate">المتاحة ({assessments.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('leaderboard')}
            className={`py-2 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 tabular-nums ${
              mainTab === 'leaderboard'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span className="truncate">لوحة الشرف</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('history_certificates')}
            className={`py-2 px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 tabular-nums ${
              mainTab === 'history_certificates'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <History className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span className="truncate">نتائجي ({results.length})</span>
          </button>
        </div>
      </div>

      {pendingOfflineCount > 0 && (
        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/60 text-amber-200 text-xs flex items-center justify-between gap-2 tabular-nums">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            <span>
              لديك ({pendingOfflineCount}) محاولة اختبار محفوظة محلياً (أوفلاين) — ستتم مزامنتها فور توفر الإنترنت.
            </span>
          </div>
        </div>
      )}

      {statusMsg && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
          statusMsg.type === 'error' ? 'bg-rose-950/60 border-rose-800 text-rose-300' : 'bg-teal-950/60 border-teal-800 text-teal-300'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* =====================================================================
          TAB 1: الاختبارات والمسابقات المتاحة (Available Exams & Competitions)
         ===================================================================== */}
      {mainTab === 'available' && (
        <div className="space-y-3.5">
          {/* Quick Sub-Filter Pills: الكل | امتحانات المواد | المسابقات الطبية */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 tabular-nums ${
                typeFilter === 'all'
                  ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
              }`}
            >
              الكل ({assessments.length})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('exam')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 tabular-nums flex items-center gap-1.5 ${
                typeFilter === 'exam'
                  ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>امتحانات المواد ({assessments.filter(a => a.assessmentType === 'exam').length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('competition')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0 tabular-nums flex items-center gap-1.5 ${
                typeFilter === 'competition'
                  ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>المسابقات الطبية ({assessments.filter(a => a.assessmentType === 'competition').length})</span>
            </button>
          </div>

          {loading ? (
            <div className="p-10 text-center text-[var(--text-muted)] space-y-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl">
              <RefreshCw className="w-7 h-7 animate-spin mx-auto text-teal-400" />
              <p className="text-xs">جاري تحميل الاختبارات والمسابقات المتاحة...</p>
            </div>
          ) : filteredAssessments.length === 0 ? (
            <div className="p-10 text-center text-[var(--text-muted)] space-y-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl">
              <FileText className="w-10 h-10 mx-auto text-[var(--text-muted)] opacity-60" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">لا توجد تقييمات منشورة حالياً لهذا المستوى</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                لم يقم مسؤولو الكلية بنشر اختبارات أو مسابقات جديدة لمستواك الأكاديمي الحالي بعد.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
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
                const isCompetition = assessment.assessmentType === 'competition';

                return (
                  <div 
                    key={assessment.id}
                    className={`umed-card bg-[var(--bg-card)] text-[var(--text-primary)] rounded-2xl p-4 sm:p-5 shadow-sm transition-all space-y-3.5 flex flex-col justify-between border overflow-hidden ${
                      isHighlighted
                        ? isCompetition
                          ? 'border-amber-500 ring-2 ring-amber-500/30'
                          : 'border-teal-500 ring-2 ring-teal-500/30'
                        : 'border-[var(--border-color)] hover:border-teal-500/40'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${
                            isOpen 
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                              : isUpcoming 
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              : 'bg-slate-800/80 text-slate-400 border-slate-700'
                          }`}>
                            {isOpen ? 'متاح الآن' : isUpcoming ? 'قادم قريباً' : 'مغلق / منتهي'}
                          </span>

                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isCompetition
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              : 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                          }`}>
                            {isCompetition ? 'مسابقة تنافسية' : 'امتحان مادة'}
                          </span>

                          {hasPerQuestionTimer && (
                            <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                              <Timer className="w-3.5 h-3.5 shrink-0" />
                              <span>{assessment.questionDurationSeconds}ث / سؤال</span>
                            </span>
                          )}
                        </div>

                        <span className="text-[var(--text-muted)] font-mono tabular-nums shrink-0">
                          المحاولات: <strong className="text-[var(--text-primary)]" dir="ltr">{attemptCount}/{assessment.maxAttempts}</strong>
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-extrabold text-[var(--text-primary)] leading-snug">
                          {cleanAssessmentTitle(assessment.titleArabic)}
                        </h3>
                        {assessment.descriptionArabic && (
                          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1 leading-relaxed">
                            {cleanAssessmentDescription(assessment.descriptionArabic)}
                          </p>
                        )}
                      </div>

                      <div className="py-2.5 border-y border-[var(--border-color)]/80 space-y-2 text-xs tabular-nums">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-semibold">
                            <Clock className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            <span>
                              {hasFullTimer ? `الوقت: ${assessment.durationMinutes} دقيقة` : 'الوقت: مفتوح'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-semibold">
                            <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            <span>الدرجة: <strong className="font-mono">{assessment.totalPoints}</strong> نقطة</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)] flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span>متاح حتى: <span className="font-mono">{formatDateLatin(assessment.closesAt)}</span></span>
                          </div>
                          {isOpen && (
                            <span className="text-amber-400 font-bold">
                              {formatRemainingAvailability(assessment.closesAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {userResult && (
                      userResult.isReleased ? (
                        <div className="px-3 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-between text-xs text-teal-400 tabular-nums">
                          <div className="flex items-center gap-1.5">
                            <Award className="w-4 h-4 text-teal-400 shrink-0" />
                            <span>درجتك المعتمدة: <strong className="font-mono text-sm">{userResult.score}/{userResult.totalPoints}</strong></span>
                          </div>
                          <span className="font-mono font-extrabold">
                            {userResult.percentage}%
                          </span>
                        </div>
                      ) : (
                        <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-400">
                          <Lock className="w-4 h-4 shrink-0" />
                          <span>تم تسليم المحاولة — ستظهر الدرجة فور إعلان النتائج رسمياً.</span>
                        </div>
                      )
                    )}

                    <div className="space-y-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          hasMaxAttempts && userResult
                            ? handleOpenCompletedExamReview(assessment, userResult)
                            : handleStartAttempt(assessment)
                        }
                        disabled={(!isOpen && !userResult) || (hasMaxAttempts && !userResult) || startingAttempt === assessment.id}
                        className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
                          isOpen && !hasMaxAttempts
                            ? isCompetition
                              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-950/20'
                              : 'bg-teal-600 hover:bg-teal-500 text-white shadow-md shadow-teal-950/20'
                            : hasMaxAttempts && userResult
                            ? 'bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/50 text-teal-400'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed'
                        }`}
                      >
                        {startingAttempt === assessment.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                            <span>جارٍ فتح الاختبار...</span>
                          </>
                        ) : hasMaxAttempts && userResult ? (
                          <>
                            <Award className="w-4 h-4 text-teal-400 shrink-0" />
                            <span>مراجعة النتيجة والتعليلات</span>
                          </>
                        ) : hasMaxAttempts ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>تم استيفاء المحاولات المسموحة</span>
                          </>
                        ) : activeInProgressAttempt ? (
                          <>
                            <Play className="w-4 h-4 fill-current shrink-0" />
                            <span>متابعة المحاولة الجارية (#{activeInProgressAttempt.attemptNumber || attemptCount + 1})</span>
                          </>
                        ) : isOpen ? (
                          <>
                            <Play className="w-4 h-4 fill-current shrink-0" />
                            <span>{isCompetition ? 'بدء المسابقة الآن' : 'بدء الاختبار الآن'}</span>
                          </>
                        ) : (
                          <span>الاختبار غير متاح حالياً</span>
                        )}
                      </button>

                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLeaderboardAssessmentId(assessment.id);
                            setMainTab('leaderboard');
                          }}
                          className="py-2 px-2 min-h-[40px] rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-amber-400 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap active:scale-[0.98]"
                        >
                          <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>لوحة الشرف</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDownloadModalAssessment({ assessment, result: userResult })}
                          className="py-2 px-2 min-h-[40px] rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-teal-500/30 text-teal-400 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap active:scale-[0.98]"
                        >
                          <Download className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                          <span>الملزمة</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSharingAssessment(assessment)}
                          className="py-2 px-2 min-h-[40px] rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-indigo-500/30 text-indigo-400 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap active:scale-[0.98]"
                        >
                          <Share2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>مشاركة</span>
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: لوحة الشرف والترتيب (Leaderboard)
         ===================================================================== */}
      {mainTab === 'leaderboard' && (
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
                <span>لوحة الشرف وترتيب المتصدرين (Leaderboard)</span>
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                اختر الاختبار أو المسابقة لعرض قائمة الأوائل والترتيب التنافسي حسب الدرجة والسرعة
              </p>
            </div>

            {assessments.length > 0 && (
              <select
                value={selectedLeaderboardAssessmentId}
                onChange={(e) => setSelectedLeaderboardAssessmentId(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold focus:outline-none focus:border-amber-500 sm:min-w-[260px]"
              >
                {assessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assessmentType === 'competition' ? '🏆 ' : '📝 '}
                    {cleanAssessmentTitle(a.titleArabic)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {assessments.length === 0 ? (
            <div className="p-10 text-center text-[var(--text-muted)] text-xs space-y-2">
              <Trophy className="w-10 h-10 mx-auto opacity-50" />
              <div>لا توجد اختبارات أو مسابقات منشورة لعرض لوحة الشرف الخاصة بها حالياً.</div>
            </div>
          ) : loadingLeaderboard && leaderboardItems.length === 0 ? (
            <div className="p-10 text-center text-xs text-[var(--text-muted)] space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400" />
              <div>جاري تحميل ترتيب الطلاب...</div>
            </div>
          ) : leaderboardItems.length === 0 ? (
            <div className="p-10 text-center text-[var(--text-muted)] space-y-3 bg-[var(--bg-input)] rounded-2xl border border-[var(--border-color)]">
              <Trophy className="w-10 h-10 mx-auto text-amber-400/60" />
              <div className="text-sm font-bold text-[var(--text-primary)]">
                لا توجد نتائج معلنة في لوحة الشرف لـ «{cleanAssessmentTitle(selectedLeaderboardAssessment?.titleArabic)}» بعد
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                كن أول من يخوض هذا التقييم ليظهر اسمك في الصدارة (#1)!
              </p>
              {selectedLeaderboardAssessment && (
                <button
                  type="button"
                  onClick={() => handleStartAttempt(selectedLeaderboardAssessment)}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold inline-flex items-center gap-2 shadow-md"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>ابدأ الحل الآن وتصدر القائمة</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Top 3 Podium Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {leaderboardItems.slice(0, 3).map((topItem, i) => {
                  const rnk = i + 1;
                  const name = resolveResultPublicDisplayName(topItem);
                  return (
                    <div
                      key={topItem.id || i}
                      className={`p-4 rounded-2xl border text-center space-y-1.5 tabular-nums ${
                        rnk === 1
                          ? 'bg-amber-500/15 border-amber-500/50 shadow-sm'
                          : rnk === 2
                          ? 'bg-[var(--bg-elevated)] border-[var(--border-color)]'
                          : 'bg-amber-700/15 border-amber-700/40'
                      }`}
                    >
                      <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] text-xs font-extrabold font-mono text-amber-400">
                        #{rnk}
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] truncate">{name}</div>
                      <div className="text-xl font-black text-teal-400 font-mono">
                        {topItem.percentage}%
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] font-mono">
                        {topItem.score}/{topItem.totalPoints} نقطة · {formatDurationShort(topItem.durationSeconds)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Full Ordered List */}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {leaderboardItems.map((item, idx) => {
                  const rank = idx + 1;
                  const isMe = item.uid === uid;
                  const displayName = resolveResultPublicDisplayName(item);

                  return (
                    <div
                      key={item.id || `${item.uid}-${idx}`}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs tabular-nums ${
                        isMe
                          ? 'bg-teal-500/15 border-teal-500/50 text-[var(--text-primary)] ring-1 ring-teal-500/30'
                          : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-primary)]'
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
                            : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                        }`}>
                          {rank <= 3 ? <Medal className="w-4 h-4" /> : `#${rank}`}
                        </span>
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            <span>{displayName}</span>
                            {isMe && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-500/20 text-teal-400 border border-teal-500/30">
                                أنت
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            زمن الحل: {formatDurationShort(item.durationSeconds)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-[var(--text-secondary)] font-semibold">{item.score}/{item.totalPoints}</span>
                        <span className="px-2.5 py-1 rounded-lg bg-teal-500/15 text-teal-400 font-bold">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: سجل محاولاتي ونتائجي السابقة مع الشهادات (My Attempts, Results & Certificates)
         ===================================================================== */}
      {mainTab === 'history_certificates' && (
        <div className="space-y-4">
          {/* Summary Stats Strip for Student Results & Certificates */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs tabular-nums">
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-3.5 flex items-center justify-between">
              <span className="text-[var(--text-muted)] font-semibold">إجمالي الاختبارات المنجزة</span>
              <span className="font-mono font-black text-base text-teal-400">{results.length}</span>
            </div>
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-3.5 flex items-center justify-between">
              <span className="text-[var(--text-muted)] font-semibold">شهادات الاجتياز والتفوق</span>
              <span className="font-mono font-black text-base text-amber-400">{passedCertificatesCount}</span>
            </div>
            <div className="col-span-2 sm:col-span-1 umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-3.5 flex items-center justify-between">
              <span className="text-[var(--text-muted)] font-semibold">متوسط الأداء الأكاديمي</span>
              <span className="font-mono font-black text-base text-emerald-400">
                {results.length > 0
                  ? `${Math.round(results.reduce((acc, r) => acc + (r.percentage || 0), 0) / results.length)}%`
                  : '—'}
              </span>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-10 text-center space-y-3 text-xs">
              <Award className="w-10 h-10 mx-auto text-[var(--text-muted)] opacity-60" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">لم تقم بتسليم أي محاولة اختبار بعد</h3>
              <p className="text-[var(--text-muted)] max-w-md mx-auto">
                بمجرد إتمامك لأي اختبار أو مسابقة طبية، ستظهر درجاتك التفصيلية، مراجعة الإجابات والتعليلات، وشهادات الاجتياز الرقمية هنا.
              </p>
              <button
                type="button"
                onClick={() => setMainTab('available')}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs inline-flex items-center gap-2"
              >
                <span>استعراض الاختبارات المتاحة الآن</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {results.map((resItem) => {
                const linkedAssessment: Assessment = assessments.find((a) => a.id === resItem.assessmentId) || {
                  id: resItem.assessmentId,
                  titleArabic: `تقييم أكاديمي (${resItem.assessmentId})`,
                  assessmentType: 'exam',
                  universityId,
                  programId: 'prog-mbbs',
                  studyLevelId,
                  durationMinutes: 30,
                  totalPoints: resItem.totalPoints || 100,
                  maxAttempts: 3,
                  opensAt: resItem.submittedAt,
                  closesAt: resItem.submittedAt,
                  questionIds: [],
                  resultReleasePolicy: 'immediate',
                  status: 'published',
                  createdBy: 'system',
                  createdAt: resItem.submittedAt
                };
                const isPassed = resItem.isReleased && resItem.percentage >= 50;

                return (
                  <div
                    key={resItem.id}
                    className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-3.5 flex flex-col justify-between text-xs shadow-sm"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          isPassed
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : !resItem.isReleased
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                        }`}>
                          {!resItem.isReleased
                            ? 'قيد المراجعة'
                            : resItem.percentage >= 85
                            ? 'امتياز وتفوق 🌟'
                            : isPassed
                            ? 'مجتاز بنجاح ✓'
                            : 'بحاجة لمراجعة'}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                          {formatDateLatin(resItem.submittedAt)}
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                        {cleanAssessmentTitle(linkedAssessment.titleArabic)}
                      </h4>

                      {resItem.isReleased ? (
                        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex items-center justify-between tabular-nums">
                          <div>
                            <div className="text-[11px] text-[var(--text-muted)]">الدرجة المحققة</div>
                            <div className="text-sm font-extrabold font-mono text-[var(--text-primary)] mt-0.5">
                              {resItem.score} / {resItem.totalPoints} نقطة
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="text-[11px] text-[var(--text-muted)]">النسبة المئوية</div>
                            <div className="text-lg font-black font-mono text-teal-400">
                              {resItem.percentage}%
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-2">
                          <Lock className="w-4 h-4 shrink-0" />
                          <span>تم رصد المحاولة وبانتظار إعلان النتائج الرسمي.</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenCompletedExamReview(linkedAssessment, resItem)}
                        className="py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span>مراجعة الإجابات</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDownloadModalAssessment({ assessment: linkedAssessment, result: resItem })}
                        className="py-2 px-3 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-teal-400 font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>تحميل الملزمة</span>
                      </button>

                      {isPassed && (
                        <button
                          type="button"
                          onClick={() => setCertificatePreview({ assessment: linkedAssessment, result: resItem })}
                          className="py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-400 font-bold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span>عرض الشهادة</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Digital Certificate Preview Modal */}
      {certificatePreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="umed-card bg-[var(--bg-card)] border-2 border-amber-500/50 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-center space-y-4 shadow-2xl relative overflow-hidden">
            <button
              type="button"
              onClick={() => setCertificatePreview(null)}
              className="absolute top-4 left-4 p-1.5 rounded-xl bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400 mx-auto flex items-center justify-center">
              <Award className="w-9 h-9" />
            </div>

            <div className="space-y-1">
              <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[11px] font-extrabold">
                شهادة اجتياز وتفوق أكاديمي • U_MED
              </span>
              <h3 className="text-lg sm:text-xl font-black text-[var(--text-primary)] pt-2">
                تشهد منصة U_MED الطبية الأكاديمية بأن
              </h3>
              <div className="text-xl font-black text-teal-400 py-1">
                د. {effectiveFullName}
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                قد اجتاز بنجاح تقييم <strong className="text-[var(--text-primary)]">«{certificatePreview.assessment.titleArabic}»</strong> بنسبة مئوية قدرها{' '}
                <strong className="text-amber-400 font-mono">{certificatePreview.result.percentage}%</strong> ({certificatePreview.result.score}/{certificatePreview.result.totalPoints} نقطة).
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono">
              <span>التاريخ: {formatDateLatin(certificatePreview.result.submittedAt)}</span>
              <span>CERT-{certificatePreview.result.id.slice(-6).toUpperCase()}</span>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  handleQuickDownloadExamFile(
                    certificatePreview.assessment,
                    certificatePreview.result,
                    'solved'
                  );
                }}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>تحميل سجل النتيجة الكامل</span>
              </button>
              <button
                type="button"
                onClick={() => setCertificatePreview(null)}
                className="px-5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Trial Exam Modal */}
      {sharingAssessment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm sm:text-base">
                <Share2 className="w-5 h-5" />
                <span>مشاركة الاختبار التجريبي مع الطلاب</span>
              </div>
              <button
                onClick={() => setSharingAssessment(null)}
                className="p-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-1.5">
                <div className="font-bold text-[var(--text-primary)] text-sm">{sharingAssessment.titleArabic}</div>
                <p className="text-[var(--text-secondary)]">
                  عند مشاركة هذا الرابط مع أي طالب أو زميل، سيتمكن من فتح الاختبار وحل جميع الأسئلة فوراً ومعرفة نتيجته النهائية وتحميل ملف الاختبار للمذاكرة، مع إمكانية إنشاء حساب في المنصة لإدراج درجته في لوحة الشرف والمنافسة مع باقي الطلاب!
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-[var(--text-muted)] font-semibold">رابط الاختبار التجريبي المباشر:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={buildShareableAssessmentUrl(sharingAssessment)}
                    dir="ltr"
                    className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px] text-teal-400 font-mono select-all"
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
                  className="py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 font-bold text-center flex items-center justify-center gap-2"
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
                  className="py-2.5 px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-400 font-bold text-center flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>مشاركة عبر تيليجرام</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Exam Booklet Download Modal Sheet */}
      {downloadModalAssessment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 max-w-lg w-full my-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-teal-400" />
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--text-primary)]">تحميل ملف الاختبار الكامل</h3>
                  <p className="text-[11px] text-teal-400 truncate max-w-xs">{downloadModalAssessment.assessment.titleArabic}</p>
                </div>
              </div>
              <button
                onClick={() => setDownloadModalAssessment(null)}
                className="p-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              اختر صيغة الملف التي ترغب بتحميلها. يتم حفظ الملف بصيغة مستقلة وتنسيق طبي أنيق يعمل على هاتفك بدون إنترنت وقابل للحفظ كـ PDF أو الطباعة المباشرة:
            </p>

            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-xs sm:text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                      <span>نسخة المذاكرة المحلولة (مع التعليلات)</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
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

              <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-xs sm:text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>نسخة التدريب الذاتي (غير محلولة)</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
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
                  className="w-full mt-1 py-2 px-3 rounded-lg bg-[var(--bg-elevated)] hover:opacity-90 text-[var(--text-primary)] text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-[var(--border-color)]"
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
                className="px-4 py-2 rounded-xl bg-[var(--bg-elevated)] hover:opacity-90 border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-semibold"
              >
                إغلاق
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
          studentNameArabic={effectiveFullName}
          studentUsername={effectiveUsername}
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
