/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED StudentProfile Component
 * Displays Academic Information, Current Block Progress, Recent Activity, and Academic Change Requests
 */

import React, { useState, useEffect } from 'react';
import {
  User,
  GraduationCap,
  BookOpen,
  Trophy,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  Award,
  FileText,
  Send,
  RefreshCw,
  Calendar,
  Building2,
  ChevronLeft,
  Layers
} from 'lucide-react';
import {
  StudentEnrollment,
  StudyLevel,
  StudyPeriod,
  CourseOffering,
  Assessment,
  AssessmentAttempt,
  AssessmentResult,
  EducationalResource,
  AcademicChangeRequest
} from '../../types/umed.ts';
import {
  fetchStudentEnrollment,
  submitAcademicChangeRequest,
  fetchAcademicChangeRequestsForAdmin
} from '../../services/enrollmentService.ts';
import {
  fetchUniversities,
  fetchStudyLevels,
  fetchStudyPeriods,
  fetchCourseOfferings
} from '../../services/academicService.ts';
import {
  getPublishedAssessmentsForStudent,
  getStudentAttempts,
  getStudentResults
} from '../../services/assessmentService.ts';
import { fetchEducationalResources } from '../../services/resourceService.ts';

interface StudentProfileProps {
  uid: string;
  userEmail: string;
  displayNameArabic: string;
  initialEnrollment?: StudentEnrollment | null;
  onNavigateTab?: (tab: 'study' | 'library' | 'assessments') => void;
}

interface ActivityItem {
  id: string;
  type: 'exam_scored' | 'exam_started' | 'change_request' | 'enrollment';
  title: string;
  subtitle: string;
  timestamp: string;
  badgeText: string;
  badgeColor: 'teal' | 'amber' | 'emerald' | 'indigo';
}

export default function StudentProfile({
  uid,
  userEmail,
  displayNameArabic,
  initialEnrollment,
  onNavigateTab
}: StudentProfileProps) {
  const [enrollment, setEnrollment] = useState<StudentEnrollment | null>(initialEnrollment || null);
  const [universityName, setUniversityName] = useState<string>('جامعة دار السلام الدولية للعلوم والتكنولوجيا');
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>([]);
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>([]);
  const [periodCoursesMap, setPeriodCoursesMap] = useState<Record<string, CourseOffering[]>>({});
  const [resources, setResources] = useState<EducationalResource[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [myChangeRequests, setMyChangeRequests] = useState<AcademicChangeRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Academic Change Request Modal/Form State
  const [showChangeForm, setShowChangeForm] = useState<boolean>(false);
  const [requestedLevelId, setRequestedLevelId] = useState<string>('');
  const [requestedNumber, setRequestedNumber] = useState<string>('');
  const [changeReason, setChangeReason] = useState<string>('');
  const [changeLoading, setChangeLoading] = useState<boolean>(false);
  const [changeMessage, setChangeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadProfileData = async () => {
    setLoading(true);
    try {
      const freshEnr = await fetchStudentEnrollment(uid);
      const enr = freshEnr || initialEnrollment || null;
      setEnrollment(enr);

      // Do not load academic resources, blocks, or assessments if student enrollment is not yet approved
      if (!enr || enr.status !== 'approved') {
        setStudyPeriods([]);
        setResources([]);
        setAssessments([]);
        return;
      }

      const univId = enr.universityId || 'univ-dar-al-salam';
      const progId = enr.programId || 'prog-mbbs';
      const levelId = enr.currentStudyLevelId || 'lvl-4';

      const [
        univList,
        lvls,
        periods,
        resList,
        asmntList,
        attList,
        resScores,
        allReqs
      ] = await Promise.all([
        fetchUniversities(),
        fetchStudyLevels(progId),
        fetchStudyPeriods(levelId),
        fetchEducationalResources({ universityId: univId, studyLevelId: levelId, status: 'published' }),
        getPublishedAssessmentsForStudent(univId, levelId),
        getStudentAttempts(uid),
        getStudentResults(uid),
        fetchAcademicChangeRequestsForAdmin(univId)
      ]);

      const matchedUniv = univList.find(u => u.id === univId);
      if (matchedUniv) setUniversityName(matchedUniv.nameArabic);

      setStudyLevels(lvls);
      setStudyPeriods(periods);
      setResources(resList);
      setAssessments(asmntList);
      setAttempts(attList);
      setResults(resScores);
      setMyChangeRequests(allReqs.filter(r => r.uid === uid || (enr && r.enrollmentId === enr.id)));

      // Fetch courses for each study period (block)
      const coursesMap: Record<string, CourseOffering[]> = {};
      await Promise.all(
        periods.map(async (p) => {
          try {
            const crs = await fetchCourseOfferings(p.id);
            coursesMap[p.id] = crs;
          } catch {
            coursesMap[p.id] = [];
          }
        })
      );
      setPeriodCoursesMap(coursesMap);
    } catch (err) {
      console.warn('Error loading student profile data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, [uid, initialEnrollment?.currentStudyLevelId, initialEnrollment?.academicStudentNumber, initialEnrollment?.status]);

  const handleAcademicChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment || !changeReason.trim()) return;
    setChangeLoading(true);
    setChangeMessage(null);

    try {
      const createdReq = await submitAcademicChangeRequest({
        uid,
        enrollmentId: enrollment.id,
        universityId: enrollment.universityId,
        requestedLevelId: requestedLevelId || undefined,
        requestedAcademicNumber: requestedNumber.trim() || undefined,
        reason: changeReason.trim()
      });
      setMyChangeRequests(prev => [createdReq, ...prev]);
      setChangeMessage({
        type: 'success',
        text: 'تم إرسال طلب التعديل الأكاديمي بنجاح إلى إدارة القبول والتسجيل في الكلية.'
      });
      setShowChangeForm(false);
      setChangeReason('');
      setRequestedLevelId('');
      setRequestedNumber('');
    } catch (err: any) {
      setChangeMessage({
        type: 'error',
        text: err.message || 'تعذر إرسال طلب التعديل حالياً'
      });
    } finally {
      setChangeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-400 mb-2" />
        <span>جارٍ تحميل الملف الأكاديمي وتقدم البلوكات والنشاط الأخير...</span>
      </div>
    );
  }

  // Strict Enrollment Approval Gate: Students cannot access profile blocks/resources before enrollment is approved
  if (!enrollment || enrollment.status !== 'approved') {
    return (
      <div className="max-w-xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-2xl" dir="rtl">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center">
          <Clock className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-white">
          {!enrollment
            ? 'يرجى إتمام تسجيل القيد الأكاديمي أولاً'
            : enrollment.status === 'pending'
            ? 'ملفك الأكاديمي وتقدم البلوكات بانتظار اعتماد القيد'
            : 'طلب القيد الأكاديمي غير معتمد حالياً'}
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          {!enrollment
            ? 'لا يمكن استعراض تقدم البلوكات والمقررات والموارد الطبية قبل تقديم طلب القيد الأكاديمي واعتماده من إدارة الكلية.'
            : 'تم استلام طلب قيدك الأكاديمي، ولن يتم فتح البلوكات الدراسية أو المحاضرات أو الاختبارات إلا بعد مراجعة واعتماد القيد رسمياً من قبل مشرف الجامعة.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={loadProfileData}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث حالة الاعتماد</span>
          </button>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('study')}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors"
            >
              العودة لبوابة القيد الأكاديمي
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentLevelObj = studyLevels.find(l => l.id === enrollment?.currentStudyLevelId);
  const currentLevelTitle = currentLevelObj
    ? currentLevelObj.titleArabic
    : enrollment?.currentStudyLevelId === 'lvl-internship'
    ? 'سنة الامتياز السريرية'
    : `المستوى ${(enrollment?.currentStudyLevelId || 'lvl-4').replace('lvl-', '')}`;

  // Calculate academic & assessment progress metrics
  const completedAssessmentIds = new Set(
    attempts.filter(a => a.status === 'scored').map(a => a.assessmentId)
  );
  const totalAssessmentsCount = assessments.length;
  const completedAssessmentsCount = assessments.filter(a => completedAssessmentIds.has(a.id)).length;
  const assessmentCompletionPct =
    totalAssessmentsCount > 0
      ? Math.round((completedAssessmentsCount / totalAssessmentsCount) * 100)
      : attempts.length > 0
      ? 100
      : 35;

  const releasedResults = results.filter(r => r.isReleased);
  const averageScorePct =
    releasedResults.length > 0
      ? Math.round(
          releasedResults.reduce((acc, r) => acc + (Number(r.percentage) || 0), 0) /
            releasedResults.length
        )
      : null;

  // Build Recent Activity Feed
  const activities: ActivityItem[] = [];

  attempts.forEach((att) => {
    const matchedAsmnt = assessments.find(a => a.id === att.assessmentId);
    const matchedRes = results.find(r => r.attemptId === att.id || r.assessmentId === att.assessmentId);
    const asmntTitle = matchedAsmnt?.titleArabic || 'اختبار تقييمي في البلوك الطبي';

    if (att.status === 'scored') {
      activities.push({
        id: `act-att-${att.id}`,
        type: 'exam_scored',
        title: `إتمام وتسليم: ${asmntTitle}`,
        subtitle: matchedRes
          ? matchedRes.isReleased
            ? `النتيجة المعتمدة: ${matchedRes.score} من ${matchedRes.totalPoints} (${matchedRes.percentage}%)`
            : 'تم التسليم بنجاح — النتيجة بانتظار الإفراج الرسمي من الكلية'
          : 'تم تسليم المحاولة وحفظها سحابياً',
        timestamp: att.submittedAt || att.lastSavedAt || att.startedAt,
        badgeText: matchedRes?.isReleased ? `${matchedRes.percentage}%` : 'مكتمل ✓',
        badgeColor: 'emerald'
      });
    } else {
      activities.push({
        id: `act-att-${att.id}`,
        type: 'exam_started',
        title: `بدء محاولة اختبار: ${asmntTitle}`,
        subtitle: `تم حفظ ${Object.keys(att.answers || {}).length} إجابات سحابياً`,
        timestamp: att.lastSavedAt || att.startedAt,
        badgeText: 'قيد الحل',
        badgeColor: 'amber'
      });
    }
  });

  myChangeRequests.forEach((req) => {
    const reqLvl = studyLevels.find(l => l.id === req.requestedLevelId);
    activities.push({
      id: `act-req-${req.id}`,
      type: 'change_request',
      title: `طلب تعديل أكاديمي ${reqLvl ? `إلى ${reqLvl.titleArabic}` : ''}`,
      subtitle: req.reason,
      timestamp: req.reviewedAt || req.createdAt || req.requestedAt || new Date().toISOString(),
      badgeText:
        req.status === 'approved'
          ? 'تم القبول ✓'
          : req.status === 'rejected'
          ? 'مرفوض'
          : 'قيد المراجعة',
      badgeColor:
        req.status === 'approved'
          ? 'emerald'
          : req.status === 'rejected'
          ? 'amber'
          : 'indigo'
    });
  });

  if (enrollment) {
    activities.push({
      id: `act-enr-${enrollment.id}`,
      type: 'enrollment',
      title: `تسجيل القيد الأكاديمي (${currentLevelTitle})`,
      subtitle: `الرقم الجامعي: ${enrollment.academicStudentNumber} • العام الجامعي ${enrollment.academicYear}`,
      timestamp: enrollment.reviewedAt || enrollment.enrolledAt || new Date().toISOString(),
      badgeText: enrollment.status === 'approved' ? 'قيد معتمد ✓' : 'قيد المراجعة',
      badgeColor: 'teal'
    });
  }

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-6" dir="rtl">
      {/* 1. Profile Hero Banner & Quick Academic Stats */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950/50 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-teal-500/20 shrink-0">
              {displayNameArabic.trim().charAt(0) || 'ط'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold text-white">
                  د. {displayNameArabic}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                  {enrollment?.status === 'approved' ? 'طالب مقيد ومعتمد ✓' : 'قيد غير مكتمل'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-teal-400" />
                <span>{universityName} • كلية الطب البشري (MBBS)</span>
              </p>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5" dir="ltr">
                {userEmail}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadProfileData}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث البيانات</span>
            </button>
            {enrollment && (
              <button
                onClick={() => setShowChangeForm(!showChangeForm)}
                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-colors"
              >
                {showChangeForm ? 'إغلاق نموذج التعديل' : 'طلب تعديل أكاديمي'}
              </button>
            )}
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1">
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-teal-400" />
              <span>المستوى الدراسي</span>
            </span>
            <div className="font-bold text-white text-sm">{currentLevelTitle}</div>
            <div className="text-[10px] text-teal-400 font-mono" dir="ltr">
              {enrollment?.academicStudentNumber || 'غير مسجل'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1">
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>البلوكات والمقررات</span>
            </span>
            <div className="font-bold text-white text-sm">
              {studyPeriods.length} بلوكات دراسية
            </div>
            <div className="text-[10px] text-slate-400">
              {resources.length} مادة ومحاضرة منشورة
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1">
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>الاختبارات المنجزة</span>
            </span>
            <div className="font-bold text-white text-sm font-mono">
              {completedAssessmentsCount} / {totalAssessmentsCount}
            </div>
            <div className="text-[10px] text-amber-300">
              إجمالي المحاولات: {attempts.length}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1">
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              <span>المعدل التقييمي العام</span>
            </span>
            <div className="font-bold text-emerald-400 text-sm font-mono">
              {averageScorePct !== null ? `${averageScorePct}%` : 'قيد التقييم'}
            </div>
            <div className="text-[10px] text-slate-400">
              {releasedResults.length} نتيجة معتمدة
            </div>
          </div>
        </div>
      </div>

      {changeMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2 ${
            changeMessage.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/50 border-rose-800 text-rose-300'
          }`}
        >
          {changeMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{changeMessage.text}</span>
        </div>
      )}

      {/* Academic Change Request Collapsible Form */}
      {showChangeForm && enrollment && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 shadow-xl space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-amber-300">نموذج طلب تعديل البيانات الأكاديمية</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                يرجى تحديد المستوى الدراسي الجديد أو الرقم الجامعي المصحح مع ذكر سبب الطلب ليتم اعتماده من الكلية.
              </p>
            </div>
          </div>

          <form onSubmit={handleAcademicChangeSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">
                  المستوى الدراسي المطلوب الانتقال إليه:
                </label>
                <select
                  value={requestedLevelId}
                  onChange={(e) => setRequestedLevelId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="">-- الإبقاء على المستوى الحالي ({currentLevelTitle}) --</option>
                  {studyLevels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.titleArabic}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">
                  الرقم الجامعي المصحح (اختياري):
                </label>
                <input
                  type="text"
                  value={requestedNumber}
                  onChange={(e) => setRequestedNumber(e.target.value)}
                  placeholder={enrollment.academicStudentNumber}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-semibold">سبب ومبررات طلب التعديل:</label>
              <textarea
                required
                rows={2}
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="مثال: اجتياز اختبارات المستوى الحالي بنجاح والانتقال للمستوى الأعلى..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowChangeForm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={changeLoading}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{changeLoading ? 'جارٍ الإرسال...' : 'إرسال الطلب للإدارة'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Main Two-Column Layout: Block Progress + Academic Info & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Main 2 Columns: Current Block Progress */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-400" />
                  <span>تقدم البلوكات الدراسية الحالية ({currentLevelTitle})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  متابعة إنجاز المقررات والمحاضرات والاختبارات لكل بلوك سريري أو أساسي
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">نسبة الإنجاز الكلية:</span>
                <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-mono font-bold">
                  {assessmentCompletionPct}%
                </span>
              </div>
            </div>

            {/* Overall Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(8, assessmentCompletionPct))}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>الاختبارات المكتملة: {completedAssessmentsCount} من {totalAssessmentsCount}</span>
                <span>المواد التعليمية المتاحة: {resources.length} ملف</span>
              </div>
            </div>

            {/* Individual Block Progress Cards */}
            {studyPeriods.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-950/60 rounded-xl border border-slate-800">
                لا توجد بلوكات دراسية مضافة لهذا المستوى حالياً.
              </div>
            ) : (
              <div className="space-y-3">
                {studyPeriods.map((period, idx) => {
                  const blockCourses = periodCoursesMap[period.id] || [];
                  const blockResources = resources.filter(
                    r => r.studyPeriodId === period.id || !r.studyPeriodId
                  );
                  const blockPct =
                    idx === 0
                      ? Math.max(40, assessmentCompletionPct)
                      : Math.max(15, Math.round(assessmentCompletionPct * 0.6));

                  return (
                    <div
                      key={period.id}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 hover:border-teal-500/40 transition-all space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2.5 py-1 rounded-lg bg-teal-950 border border-teal-800 text-teal-300 font-mono text-xs font-bold">
                            {period.code}
                          </span>
                          <div>
                            <h4 className="text-sm font-bold text-white">{period.titleArabic}</h4>
                            <p className="text-[11px] text-slate-400" dir="ltr">
                              {period.titleEnglish || period.code} • {period.periodType.toUpperCase()} #{period.order}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-teal-300">
                            {blockPct}%
                          </span>
                          {onNavigateTab && (
                            <button
                              onClick={() => onNavigateTab('library')}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-teal-400 border border-slate-800 text-[11px] font-semibold flex items-center gap-1"
                            >
                              <span>المكتبة</span>
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full"
                          style={{ width: `${blockPct}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                            {blockCourses.length} مقررات مرتبطة
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                            {blockResources.length} ملفات دراسية
                          </span>
                        </div>

                        {blockCourses.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {blockCourses.slice(0, 3).map(c => (
                              <span
                                key={c.id}
                                className="px-2 py-0.5 rounded bg-teal-950/50 border border-teal-900/60 text-teal-300 text-[10px]"
                              >
                                {c.titleArabic}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Academic Details Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <User className="w-4 h-4 text-teal-400" />
              <span>تفاصيل القيد والملف الأكاديمي الرسمي</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">الاسم الرباعي:</span>
                <strong className="text-white">{displayNameArabic}</strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">الرقم الأكاديمي:</span>
                <span className="font-mono text-teal-300 font-bold" dir="ltr">
                  {enrollment?.academicStudentNumber || 'غير مسجل'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">الجامعة:</span>
                <span className="text-slate-200 font-semibold">{universityName}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">البرنامج الأكاديمي:</span>
                <span className="text-slate-200 font-semibold">بكالوريوس الطب والجراحة (MBBS)</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">المستوى الحالي:</span>
                <span className="text-amber-300 font-bold">{currentLevelTitle}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">العام الجامعي:</span>
                <span className="font-mono text-slate-200" dir="ltr">
                  {enrollment?.academicYear || '2025/2026'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Activity Feed */}
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>النشاط الأكاديمي الأخير</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                {activities.length} سجلات
              </span>
            </div>

            {activities.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                لا يوجد نشاط مسجل حتى الآن.
              </div>
            ) : (
              <div className="space-y-3">
                {activities.slice(0, 8).map((act) => (
                  <div
                    key={act.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-1.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-white leading-snug">{act.title}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 border ${
                          act.badgeColor === 'emerald'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : act.badgeColor === 'amber'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : act.badgeColor === 'indigo'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                        }`}
                      >
                        {act.badgeText}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{act.subtitle}</p>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 font-mono pt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(act.timestamp).toLocaleString('ar-YE')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
