/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED StudentProfile Component
 * Organized into 3 clear tabs:
 * 1. بطاقتي الأكاديمية والجامعية
 * 2. الشهادات والأوسمة
 * 3. سجل الاختبارات والنتائج
 * Uses the shared <StudentProfileEditorForm /> component for profile & academic editing.
 */

import React, { useState, useEffect, useRef } from 'react';
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
  RefreshCw,
  Calendar,
  Building2,
  ChevronLeft,
  Layers,
  Camera,
  Stethoscope,
  Edit3,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import {
  StudentEnrollment,
  StudyLevel,
  StudyPeriod,
  CourseOffering,
  Assessment,
  AssessmentAttempt,
  AssessmentResult,
  EducationalResource
} from '../../types/umed.ts';
import { fetchStudentEnrollment } from '../../services/enrollmentService.ts';
import {
  fetchUniversities,
  fetchStudyLevels,
  fetchStudyPeriods,
  fetchCourseOfferings,
  getUserAcademicContext
} from '../../services/academicService.ts';
import {
  getPublishedAssessmentsForStudent,
  getStudentAttempts,
  getStudentResults
} from '../../services/assessmentService.ts';
import { fetchEducationalResources } from '../../services/resourceService.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  compressAndReadProfileImage,
  YEMEN_UNIVERSITIES_OPTIONS
} from '../../lib/firebase.ts';
import StudentProfileEditorForm from './StudentProfileEditorForm.tsx';

interface StudentProfileProps {
  uid: string;
  userEmail: string;
  displayNameArabic: string;
  initialEnrollment?: StudentEnrollment | null;
  onNavigateTab?: (tab: 'study' | 'library' | 'assessments' | 'auth') => void;
}

interface ActivityItem {
  id: string;
  type: 'exam_scored' | 'exam_started' | 'enrollment';
  title: string;
  subtitle: string;
  timestamp: string;
  badgeText: string;
  badgeColor: 'teal' | 'amber' | 'emerald' | 'indigo';
}

type ProfileSectionTab = 'academic_card' | 'certificates_badges' | 'exams_history';

export default function StudentProfile({
  uid,
  displayNameArabic,
  initialEnrollment,
  onNavigateTab
}: StudentProfileProps) {
  const { user, userProfile, updateFullProfile } = useAuth();
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  const buildFallbackEnrollment = (): StudentEnrollment => {
    const savedCtx = getUserAcademicContext();
    return {
      id: uid ? `enr-${uid}` : 'enr-visitor-default',
      uid: uid || 'visitor',
      studentNameArabic: displayNameArabic || userProfile?.displayNameArabic || 'طالب الطب البشري',
      academicStudentNumber: userProfile?.academicStudentNumber || userProfile?.username?.toUpperCase() || '',
      universityId: userProfile?.universityId || savedCtx.universityId || 'univ-dar-al-salam',
      collegeId: savedCtx.collegeId || 'col-med-dar',
      programId: savedCtx.programId || 'prog-mbbs',
      curriculumVersionId: 'cur-dar-2024',
      currentStudyLevelId: userProfile?.studyLevelId || savedCtx.studyLevelId || 'lvl-4',
      academicYear: '2025-2026',
      status: 'approved',
      enrolledAt: new Date().toISOString()
    };
  };

  const [enrollment, setEnrollment] = useState<StudentEnrollment | null>(() =>
    initialEnrollment || buildFallbackEnrollment()
  );
  const [universityName, setUniversityName] = useState<string>(
    userProfile?.universityNameArabic || 'جامعة دار السلام الدولية للعلوم والتكنولوجيا'
  );
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>([]);
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>([]);
  const [periodCoursesMap, setPeriodCoursesMap] = useState<Record<string, CourseOffering[]>>({});
  const [resources, setResources] = useState<EducationalResource[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [activeProfileTab, setActiveProfileTab] = useState<ProfileSectionTab>('academic_card');
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleQuickAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileFeedback(null);
    try {
      const compressedDataUrl = await compressAndReadProfileImage(file);
      if (user) {
        await updateFullProfile({ avatarUrl: compressedDataUrl });
        setProfileFeedback({
          type: 'success',
          message: 'تم رفع وحفظ صورة ملفك الشخصي في السحابة بنجاح ✓'
        });
      }
    } catch (err: any) {
      setProfileFeedback({
        type: 'error',
        message: err.message || 'تعذر رفع صورة الملف الشخصي'
      });
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const loadProfileData = async () => {
    setLoading(true);
    try {
      const freshEnr = uid && uid !== 'visitor' ? await fetchStudentEnrollment(uid) : null;
      const enr = freshEnr || initialEnrollment || buildFallbackEnrollment();
      setEnrollment(enr);

      const univId = userProfile?.universityId || enr.universityId || 'univ-dar-al-salam';
      const progId = enr.programId || 'prog-mbbs';
      const levelId = userProfile?.studyLevelId || enr.currentStudyLevelId || 'lvl-4';

      const [
        univList,
        lvls,
        periods,
        resList,
        asmntList,
        attList,
        resScores
      ] = await Promise.all([
        fetchUniversities(),
        fetchStudyLevels(progId),
        fetchStudyPeriods(levelId),
        fetchEducationalResources({ universityId: univId, studyLevelId: levelId, status: 'published' }),
        getPublishedAssessmentsForStudent(univId, levelId),
        uid && uid !== 'visitor' ? getStudentAttempts(uid) : Promise.resolve([]),
        uid && uid !== 'visitor' ? getStudentResults(uid) : Promise.resolve([])
      ]);

      if (userProfile?.universityNameArabic) {
        setUniversityName(userProfile.universityNameArabic);
      } else {
        const matchedUniv =
          univList.find((u) => u.id === univId) ||
          YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === univId);
        if (matchedUniv) setUniversityName(matchedUniv.nameArabic);
      }

      setStudyLevels(lvls);
      setStudyPeriods(periods);
      setResources(resList);
      setAssessments(asmntList);
      setAttempts(attList);
      setResults(resScores);

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
  }, [uid, userProfile?.studyLevelId, userProfile?.universityId, initialEnrollment?.currentStudyLevelId]);

  if (loading) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-12 text-center text-xs text-[var(--text-muted)]">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-400 mb-2" />
        <span>جارٍ تحميل الملف الأكاديمي وتقدم البلوكات والنتائج...</span>
      </div>
    );
  }

  const effectiveLevelId = userProfile?.studyLevelId || enrollment?.currentStudyLevelId || 'lvl-4';
  const currentLevelObj = studyLevels.find((l) => l.id === effectiveLevelId);
  const currentLevelTitle = currentLevelObj
    ? currentLevelObj.titleArabic
    : effectiveLevelId === 'lvl-internship'
    ? 'سنة الامتياز السريرية'
    : `المستوى ${effectiveLevelId.replace('lvl-', '')}`;
  const currentSpecialtyTitle = userProfile?.specialtyArabic || 'الطب العام والجراحة (MBBS)';
  const currentAvatarUrl = userProfile?.avatarUrl || '';

  // Calculate academic & assessment progress metrics
  const completedAssessmentIds = new Set(
    attempts.filter((a) => a.status === 'scored').map((a) => a.assessmentId)
  );
  const totalAssessmentsCount = assessments.length;
  const completedAssessmentsCount = assessments.filter((a) => completedAssessmentIds.has(a.id)).length;
  const assessmentCompletionPct =
    totalAssessmentsCount > 0
      ? Math.round((completedAssessmentsCount / totalAssessmentsCount) * 100)
      : attempts.length > 0
      ? 100
      : 35;

  const releasedResults = results.filter((r) => r.isReleased);
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
    const matchedAsmnt = assessments.find((a) => a.id === att.assessmentId);
    const matchedRes = results.find((r) => r.attemptId === att.id || r.assessmentId === att.assessmentId);
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

  if (enrollment) {
    activities.push({
      id: `act-enr-${enrollment.id}`,
      type: 'enrollment',
      title: `تسجيل الملف الأكاديمي (${currentLevelTitle})`,
      subtitle: `${universityName} • ${currentSpecialtyTitle} • العام الجامعي ${enrollment.academicYear}`,
      timestamp: enrollment.reviewedAt || enrollment.enrolledAt || new Date().toISOString(),
      badgeText: 'مفعل سحابياً ✓',
      badgeColor: 'teal'
    });
  }

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Compute Academic Badges & Certificates
  const studentBadges = [
    {
      id: 'badge-cloud-identity',
      title: 'الهوية الطبية الموثقة',
      description: 'توثيق الحساب السحابي والبطاقة الأكاديمية في منصة UMED',
      earned: Boolean(user && userProfile?.username),
      color: 'teal',
      icon: ShieldCheck
    },
    {
      id: 'badge-first-exam',
      title: 'المبادرة التقييمية',
      description: 'إتمام وتسليم أول اختبار أكاديمي أو سريري بنجاح',
      earned: completedAssessmentsCount >= 1 || attempts.some((a) => a.status === 'scored'),
      color: 'indigo',
      icon: BookOpen
    },
    {
      id: 'badge-block-scholar',
      title: 'مثابر البلوكات الطبية',
      description: 'إنجاز 3 اختبارات تقييمية أو أكثر ضمن المستوى الدراسي',
      earned: completedAssessmentsCount >= 3 || attempts.filter((a) => a.status === 'scored').length >= 3,
      color: 'amber',
      icon: Trophy
    },
    {
      id: 'badge-clinical-excellence',
      title: 'وسام التفوق السريري',
      description: 'تحقيق معدل تقييمي عام 85% فأعلى في النتائج المعتمدة',
      earned: averageScorePct !== null && averageScorePct >= 85,
      color: 'emerald',
      icon: Award
    }
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleQuickAvatarFileSelected}
        className="hidden"
      />

      {/* 1. Profile Hero Banner & Quick Academic Stats */}
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative group shrink-0">
              {currentAvatarUrl ? (
                <img
                  src={currentAvatarUrl}
                  alt={userProfile?.displayNameArabic || displayNameArabic}
                  className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-teal-500/50 shadow-lg shadow-teal-500/20"
                />
              ) : (
                <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-teal-500/20">
                  {(userProfile?.displayNameArabic || displayNameArabic || 'ط').trim().charAt(0)}
                </div>
              )}
              <button
                type="button"
                onClick={() => avatarFileInputRef.current?.click()}
                className="absolute -bottom-1.5 -left-1.5 p-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white border-2 border-slate-900 shadow-lg transition-transform hover:scale-105"
                title="رفع أو تغيير صورة الملف الشخصي"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)]">
                  د. {userProfile?.displayNameArabic || displayNameArabic}
                </h2>
                {userProfile?.username && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-500/20 text-teal-400 border border-teal-500/40"
                    dir="ltr"
                  >
                    @{userProfile.username}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  حساب سحابي موثق ✓
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-teal-400" />
                  <span>{userProfile?.universityNameArabic || universityName}</span>
                </span>
                <span className="text-[var(--text-muted)]">•</span>
                <span className="flex items-center gap-1 text-teal-400 font-semibold">
                  <Stethoscope className="w-3.5 h-3.5 text-teal-400" />
                  <span>{currentSpecialtyTitle}</span>
                </span>
                <span className="text-[var(--text-muted)]">•</span>
                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                  <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                  <span>{currentLevelTitle}</span>
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => avatarFileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-teal-400 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>تغيير الصورة</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditingProfile(!isEditingProfile)}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingProfile ? 'إغلاق نموذج التعديل' : 'تعديل الملف والبيانات الأكاديمية'}</span>
            </button>
          </div>
        </div>

        {profileFeedback && !isEditingProfile && (
          <div
            className={`p-3 rounded-xl text-xs font-bold border flex items-center gap-2 ${
              profileFeedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
            }`}
          >
            {profileFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{profileFeedback.message}</span>
          </div>
        )}

        {/* Shared Profile & Academic Editor Form */}
        {isEditingProfile && (
          <StudentProfileEditorForm
            initialDisplayNameArabic={displayNameArabic}
            initialUniversityId={enrollment?.universityId || 'univ-dar-al-salam'}
            initialUniversityNameArabic={universityName}
            initialStudyLevelId={enrollment?.currentStudyLevelId || 'lvl-4'}
            onCancel={() => setIsEditingProfile(false)}
            onSaved={async (res) => {
              if (res.enrollment) setEnrollment(res.enrollment);
              setUniversityName(res.universityNameArabic);
              setIsEditingProfile(false);
              setProfileFeedback({
                type: 'success',
                message: res.message
              });
              await loadProfileData();
            }}
          />
        )}

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-1">
            <span className="text-[var(--text-muted)] text-[11px] flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-teal-400" />
              <span>المستوى والتخصص</span>
            </span>
            <div className="font-bold text-[var(--text-primary)] text-sm">{currentLevelTitle}</div>
            <div className="text-[10px] text-teal-400 truncate">{currentSpecialtyTitle}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-1">
            <span className="text-[var(--text-muted)] text-[11px] flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>البلوكات والمقررات</span>
            </span>
            <div className="font-bold text-[var(--text-primary)] text-sm">
              {studyPeriods.length} بلوكات دراسية
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {resources.length} مادة ومحاضرة منشورة
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-1">
            <span className="text-[var(--text-muted)] text-[11px] flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>الاختبارات المنجزة</span>
            </span>
            <div className="font-bold text-[var(--text-primary)] text-sm font-mono">
              {completedAssessmentsCount} / {totalAssessmentsCount}
            </div>
            <div className="text-[10px] text-amber-400">إجمالي المحاولات: {attempts.length}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-1">
            <span className="text-[var(--text-muted)] text-[11px] flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              <span>المعدل التقييمي العام</span>
            </span>
            <div className="font-bold text-emerald-400 text-sm font-mono">
              {averageScorePct !== null ? `${averageScorePct}%` : 'قيد التقييم'}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {releasedResults.length} نتيجة معتمدة
            </div>
          </div>
        </div>
      </div>

      {/* 2. Three Clear Navigation Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] shadow-xs text-xs">
        <button
          type="button"
          onClick={() => setActiveProfileTab('academic_card')}
          className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
            activeProfileTab === 'academic_card'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
          }`}
        >
          <User className="w-4 h-4 shrink-0" />
          <span>بطاقتي الأكاديمية والجامعية</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveProfileTab('certificates_badges')}
          className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
            activeProfileTab === 'certificates_badges'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
          }`}
        >
          <Award className="w-4 h-4 shrink-0" />
          <span>الشهادات والأوسمة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveProfileTab('exams_history')}
          className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
            activeProfileTab === 'exams_history'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>سجل الاختبارات والنتائج</span>
        </button>
      </div>

      {/* TAB 1: بطاقتي الأكاديمية والجامعية */}
      {activeProfileTab === 'academic_card' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Academic Details Card */}
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 shadow-sm space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <User className="w-4 h-4 text-teal-400" />
                  <span>بطاقة القيد والملف الأكاديمي الرسمي</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="text-[11px] text-teal-400 hover:underline font-bold flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>تحديث البيانات</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">الاسم الكامل:</span>
                  <strong className="text-[var(--text-primary)]">
                    {userProfile?.displayNameArabic || displayNameArabic}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex justify-between items-center gap-2 flex-wrap">
                  <span className="text-[var(--text-muted)]">اسم المستخدم الفريد:</span>
                  <span className="font-mono text-teal-400 font-bold" dir="ltr">
                    @{userProfile?.username || enrollment?.academicStudentNumber || 'student'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">الجامعة:</span>
                  <span className="text-[var(--text-primary)] font-semibold">
                    {userProfile?.universityNameArabic || universityName}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">التخصص الأكاديمي:</span>
                  <span className="text-[var(--text-primary)] font-semibold">{currentSpecialtyTitle}</span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">المستوى الحالي:</span>
                  <span className="text-amber-400 font-bold">{currentLevelTitle}</span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">العام الجامعي:</span>
                  <span className="font-mono text-[var(--text-primary)]" dir="ltr">
                    {enrollment?.academicYear || '2025/2026'}
                  </span>
                </div>
              </div>
            </div>

            {/* Current Block Progress */}
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-teal-400" />
                    <span>تقدم البلوكات الدراسية الحالية ({currentLevelTitle})</span>
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    متابعة إنجاز المقررات والمحاضرات والاختبارات لكل بلوك سريري أو أساسي
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--text-muted)]">نسبة الإنجاز الكلية:</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30 font-mono font-bold">
                    {assessmentCompletionPct}%
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="w-full h-2.5 bg-[var(--bg-input)] rounded-full overflow-hidden border border-[var(--border-color)]">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(8, assessmentCompletionPct))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
                  <span>
                    الاختبارات المكتملة: {completedAssessmentsCount} من {totalAssessmentsCount}
                  </span>
                  <span>المواد التعليمية المتاحة: {resources.length} ملف</span>
                </div>
              </div>

              {studyPeriods.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]">
                  لا توجد بلوكات دراسية مضافة لهذا المستوى حالياً.
                </div>
              ) : (
                <div className="space-y-3">
                  {studyPeriods.map((period, idx) => {
                    const blockCourses = periodCoursesMap[period.id] || [];
                    const blockResources = resources.filter(
                      (r) => r.studyPeriodId === period.id || !r.studyPeriodId
                    );
                    const blockPct =
                      idx === 0
                        ? Math.max(40, assessmentCompletionPct)
                        : Math.max(15, Math.round(assessmentCompletionPct * 0.6));

                    return (
                      <div
                        key={period.id}
                        className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-teal-500/40 transition-all space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 font-mono text-xs font-bold">
                              {period.code}
                            </span>
                            <div>
                              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                                {period.titleArabic}
                              </h4>
                              <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                                {period.titleEnglish || period.code} • {period.periodType.toUpperCase()} #{period.order}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-teal-400">
                              {blockPct}%
                            </span>
                            {onNavigateTab && (
                              <button
                                onClick={() => onNavigateTab('library')}
                                className="px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-teal-400 border border-[var(--border-color)] text-[11px] font-semibold flex items-center gap-1"
                              >
                                <span>المكتبة</span>
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="w-full h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full"
                            style={{ width: `${blockPct}%` }}
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[var(--text-muted)]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)]">
                              {blockCourses.length} مقررات مرتبطة
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)]">
                              {blockResources.length} ملفات دراسية
                            </span>
                          </div>

                          {blockCourses.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {blockCourses.slice(0, 3).map((c) => (
                                <span
                                  key={c.id}
                                  className="px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[10px]"
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
          </div>

          {/* Right Column: Recent Activity Feed */}
          <div className="space-y-6">
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span>النشاط الأكاديمي الأخير</span>
                </h3>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  {activities.length} سجلات
                </span>
              </div>

              {activities.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  لا يوجد نشاط مسجل حتى الآن.
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.slice(0, 8).map((act) => (
                    <div
                      key={act.id}
                      className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-1.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-[var(--text-primary)] leading-snug">
                          {act.title}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 border ${
                            act.badgeColor === 'emerald'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : act.badgeColor === 'amber'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : act.badgeColor === 'indigo'
                              ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                              : 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                          }`}
                        >
                          {act.badgeText}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                        {act.subtitle}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-mono pt-1">
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
      )}

      {/* TAB 2: الشهادات والأوسمة */}
      {activeProfileTab === 'certificates_badges' && (
        <div className="space-y-6">
          <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>الأوسمة الأكاديمية والمهنية المكتسبة</span>
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  تُمنح الأوسمة تلقائياً بناءً على نشاطك العلمي وإتمامك للاختبارات والتقييمات الطبية
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold">
                {studentBadges.filter((b) => b.earned).length} / {studentBadges.length} أوسمة مفعلة
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {studentBadges.map((badge) => {
                const IconComp = badge.icon;
                return (
                  <div
                    key={badge.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                      badge.earned
                        ? 'bg-[var(--bg-input)] border-teal-500/40 shadow-sm'
                        : 'bg-[var(--bg-input)]/50 border-[var(--border-color)] opacity-60'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            badge.earned
                              ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                              : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)]'
                          }`}
                        >
                          <IconComp className="w-5 h-5" />
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            badge.earned
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-color)]'
                          }`}
                        >
                          {badge.earned ? 'مُحرز ✓' : 'قيد الإنجاز'}
                        </span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                        {badge.title}
                      </h4>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                        {badge.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Award className="w-4 h-4 text-teal-400" />
                <span>شهادات الاجتياز والتفوق الرقمية</span>
              </h3>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                {releasedResults.filter((r) => r.percentage >= 60).length} شهادة
              </span>
            </div>

            {releasedResults.filter((r) => r.percentage >= 60).length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2">
                <Award className="w-8 h-8 text-teal-400 mx-auto opacity-80" />
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  لا توجد شهادات اجتياز مصدرة حتى الآن
                </div>
                <p className="text-[11px] text-[var(--text-muted)] max-w-md mx-auto">
                  تظهر هنا شهادات الاجتياز الرقمية فور إتمام الاختبارات المعتمدة وتحقيق نسبة نجاح 60% فأعلى.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {releasedResults
                  .filter((r) => r.percentage >= 60)
                  .map((res) => {
                    const matchedAsmnt = assessments.find((a) => a.id === res.assessmentId);
                    return (
                      <div
                        key={res.id}
                        className="p-4 rounded-2xl bg-[var(--bg-input)] border border-teal-500/30 flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-teal-400 uppercase">
                              شهادة اجتياز تقييم أكاديمي • UMED
                            </span>
                            <h4 className="text-sm font-extrabold text-[var(--text-primary)]">
                              {matchedAsmnt?.titleArabic || 'اختبار تقييمي معتمد'}
                            </h4>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              مُنحت لـ د. {userProfile?.displayNameArabic || displayNameArabic} ({currentLevelTitle})
                            </p>
                          </div>
                          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-black text-sm shrink-0">
                            {res.percentage}%
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)] text-[11px] text-[var(--text-muted)]">
                          <span>
                            الدرجة: {res.score} / {res.totalPoints}
                          </span>
                          <span className="font-mono">
                            {new Date(res.gradedAt).toLocaleDateString('ar-YE')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: سجل الاختبارات والنتائج */}
      {activeProfileTab === 'exams_history' && (
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-400" />
                <span>سجل الاختبارات والمحاولات والنتائج المعتمدة</span>
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                جميع محاولاتك المسجلة سحابياً مع حالة التصحيح والدرجة النهائية
              </p>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('assessments')}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <span>الانتقال لبوابة الاختبارات</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {attempts.length === 0 ? (
            <div className="p-10 text-center rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2">
              <Clock className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
              <div className="text-xs font-bold text-[var(--text-primary)]">
                لم تقم بإجراء أي اختبار حتى الآن
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                عند بدء أو تسليم أي اختبار أو مسابقة ستظهر تفاصيل محاولتك ونتيجتك هنا.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {attempts.map((att) => {
                const matchedAsmnt = assessments.find((a) => a.id === att.assessmentId);
                const matchedRes = results.find(
                  (r) => r.attemptId === att.id || r.assessmentId === att.assessmentId
                );
                const isScored = att.status === 'scored';

                return (
                  <div
                    key={att.id}
                    className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)] text-sm">
                          {matchedAsmnt?.titleArabic || 'اختبار تقييمي في البلوك الطبي'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isScored
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {isScored ? 'تم التسليم والتصحيح ✓' : 'محاولة قيد الحل'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-2">
                        <span>
                          تاريخ البدء: {new Date(att.startedAt).toLocaleString('ar-YE')}
                        </span>
                        {att.submittedAt && (
                          <>
                            <span>•</span>
                            <span>
                              تاريخ التسليم: {new Date(att.submittedAt).toLocaleString('ar-YE')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {matchedRes ? (
                        matchedRes.isReleased ? (
                          <div className="text-left">
                            <div className="font-mono font-extrabold text-sm text-emerald-400">
                              {matchedRes.score} / {matchedRes.totalPoints} ({matchedRes.percentage}%)
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)]">نتيجة معتمدة</div>
                          </div>
                        ) : (
                          <span className="px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] text-[11px] font-semibold">
                            بانتظار الإفراج عن الدرجة
                          </span>
                        )
                      ) : (
                        <span className="px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] text-[11px]">
                          {Object.keys(att.answers || {}).length} إجابة محفوظة
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
