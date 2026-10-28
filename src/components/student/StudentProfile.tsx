/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED StudentProfile Component
 * Displays Academic Information, Current Block Progress, Recent Activity, and Academic Change Requests
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
  Send,
  RefreshCw,
  Calendar,
  Building2,
  ChevronLeft,
  Layers,
  AtSign,
  Camera,
  Stethoscope,
  Trash2,
  Edit3
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
  fetchCourseOfferings,
  getUserAcademicContext,
  saveUserAcademicContext
} from '../../services/academicService.ts';
import {
  getPublishedAssessmentsForStudent,
  getStudentAttempts,
  getStudentResults
} from '../../services/assessmentService.ts';
import { fetchEducationalResources } from '../../services/resourceService.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  checkIdentifierUniqueness,
  normalizeUsername,
  validateUsernameFormat,
  compressAndReadProfileImage,
  YEMEN_UNIVERSITIES_OPTIONS,
  MEDICAL_SPECIALTIES_OPTIONS,
  STUDY_LEVELS_OPTIONS,
  MEDICAL_PRESET_AVATARS
} from '../../lib/firebase.ts';

interface StudentProfileProps {
  uid: string;
  userEmail: string;
  displayNameArabic: string;
  initialEnrollment?: StudentEnrollment | null;
  onNavigateTab?: (tab: 'study' | 'library' | 'assessments' | 'auth') => void;
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
  const { user, userProfile, updateFullProfile, registerWithUsername } = useAuth();
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
  const [myChangeRequests, setMyChangeRequests] = useState<AcademicChangeRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Full Profile & Academic Context Editor State
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [usernameDraft, setUsernameDraft] = useState<string>(userProfile?.username || '');
  const [displayNameDraft, setDisplayNameDraft] = useState<string>(
    userProfile?.displayNameArabic || displayNameArabic || ''
  );
  const [avatarDraft, setAvatarDraft] = useState<string>(userProfile?.avatarUrl || '');
  const [universityIdDraft, setUniversityIdDraft] = useState<string>(
    userProfile?.universityId || enrollment?.universityId || 'univ-dar-al-salam'
  );
  const [customUniversityDraft, setCustomUniversityDraft] = useState<string>(
    userProfile?.universityNameArabic || ''
  );
  const [specialtyDraft, setSpecialtyDraft] = useState<string>(
    userProfile?.specialtyArabic || 'الطب العام والجراحة (MBBS)'
  );
  const [studyLevelDraft, setStudyLevelDraft] = useState<string>(
    userProfile?.studyLevelId || enrollment?.currentStudyLevelId || 'lvl-4'
  );
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [usernameAvailability, setUsernameAvailability] = useState<{
    checking: boolean;
    available: boolean | null;
    reason?: string;
  }>({ checking: false, available: null });

  useEffect(() => {
    if (!isEditingProfile) {
      if (userProfile?.username) setUsernameDraft(userProfile.username);
      if (userProfile?.displayNameArabic) setDisplayNameDraft(userProfile.displayNameArabic);
      setAvatarDraft(userProfile?.avatarUrl || '');
      if (userProfile?.universityId) setUniversityIdDraft(userProfile.universityId);
      if (userProfile?.universityNameArabic) setCustomUniversityDraft(userProfile.universityNameArabic);
      if (userProfile?.specialtyArabic) setSpecialtyDraft(userProfile.specialtyArabic);
      if (userProfile?.studyLevelId) setStudyLevelDraft(userProfile.studyLevelId);
    }
  }, [
    userProfile?.username,
    userProfile?.displayNameArabic,
    userProfile?.avatarUrl,
    userProfile?.universityId,
    userProfile?.universityNameArabic,
    userProfile?.specialtyArabic,
    userProfile?.studyLevelId,
    isEditingProfile
  ]);

  useEffect(() => {
    const candidate = normalizeUsername(usernameDraft);
    if (!candidate || candidate === userProfile?.username) {
      setUsernameAvailability({ checking: false, available: null });
      return;
    }
    const formatCheck = validateUsernameFormat(usernameDraft);
    if (!formatCheck.valid) {
      setUsernameAvailability({
        checking: false,
        available: false,
        reason: formatCheck.message
      });
      return;
    }

    let cancelled = false;
    setUsernameAvailability({ checking: true, available: null });
    const timer = setTimeout(async () => {
      const check = await checkIdentifierUniqueness({
        username: candidate,
        excludeUid: user?.uid
      });
      if (!cancelled) {
        setUsernameAvailability({
          checking: false,
          available: check.isUnique,
          reason: check.message
        });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [usernameDraft, user?.uid, userProfile?.username]);

  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileFeedback(null);
    try {
      const compressedDataUrl = await compressAndReadProfileImage(file);
      setAvatarDraft(compressedDataUrl);
      if (user) {
        setSavingProfile(true);
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
      setSavingProfile(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSaveFullProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);
    const fmt = validateUsernameFormat(usernameDraft);
    if (!fmt.valid) {
      setProfileFeedback({ type: 'error', message: fmt.message || 'اسم المستخدم غير صالح' });
      return;
    }

    const matchedUniv = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === universityIdDraft);
    const resolvedUnivName =
      universityIdDraft === 'univ-custom'
        ? customUniversityDraft.trim() || 'جامعة طبية يمنية'
        : matchedUniv?.nameArabic || universityName;

    setSavingProfile(true);
    try {
      if (user) {
        const res = await updateFullProfile({
          newUsername: fmt.normalized,
          displayNameArabic: displayNameDraft.trim() || fmt.normalized,
          avatarUrl: avatarDraft ? avatarDraft : null,
          universityId: universityIdDraft === 'univ-custom' ? 'univ-dar-al-salam' : universityIdDraft,
          universityNameArabic: resolvedUnivName,
          specialtyArabic: specialtyDraft,
          studyLevelId: studyLevelDraft
        });
        setEnrollment(res.enrollment);
        setUniversityName(resolvedUnivName);
        saveUserAcademicContext({
          universityId: res.enrollment.universityId,
          studyLevelId: studyLevelDraft
        });
        setIsEditingProfile(false);
        setProfileFeedback({
          type: 'success',
          message: res.message
        });
        await loadProfileData();
      } else {
        await registerWithUsername(
          fmt.normalized,
          undefined,
          displayNameDraft.trim() || fmt.normalized,
          {
            avatarUrl: avatarDraft || undefined,
            universityId: universityIdDraft === 'univ-custom' ? 'univ-dar-al-salam' : universityIdDraft,
            universityNameArabic: resolvedUnivName,
            specialtyArabic: specialtyDraft,
            studyLevelId: studyLevelDraft
          }
        );
        setIsEditingProfile(false);
        setProfileFeedback({
          type: 'success',
          message: `تم إنشاء حسابك السحابي باسم المستخدم الفريد (@${fmt.normalized}) بنجاح ✓`
        });
      }
    } catch (err: any) {
      setProfileFeedback({
        type: 'error',
        message: err.message || 'تعذر حفظ التعديلات في السحابة'
      });
    } finally {
      setSavingProfile(false);
    }
  };

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
        resScores,
        allReqs
      ] = await Promise.all([
        fetchUniversities(),
        fetchStudyLevels(progId),
        fetchStudyPeriods(levelId),
        fetchEducationalResources({ universityId: univId, studyLevelId: levelId, status: 'published' }),
        getPublishedAssessmentsForStudent(univId, levelId),
        uid && uid !== 'visitor' ? getStudentAttempts(uid) : Promise.resolve([]),
        uid && uid !== 'visitor' ? getStudentResults(uid) : Promise.resolve([]),
        uid && uid !== 'visitor' ? fetchAcademicChangeRequestsForAdmin(univId) : Promise.resolve([])
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
      setMyChangeRequests(allReqs.filter(r => r.uid === uid || (enr && r.enrollmentId === enr.id)));

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

  const effectiveLevelId = userProfile?.studyLevelId || enrollment?.currentStudyLevelId || 'lvl-4';
  const currentLevelObj = studyLevels.find(l => l.id === effectiveLevelId);
  const currentLevelTitle = currentLevelObj
    ? currentLevelObj.titleArabic
    : effectiveLevelId === 'lvl-internship'
    ? 'سنة الامتياز السريرية'
    : `المستوى ${effectiveLevelId.replace('lvl-', '')}`;
  const currentSpecialtyTitle = userProfile?.specialtyArabic || 'الطب العام والجراحة (MBBS)';
  const currentAvatarUrl = avatarDraft || userProfile?.avatarUrl || '';

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
      title: `تسجيل الملف الأكاديمي (${currentLevelTitle})`,
      subtitle: `${universityName} • ${currentSpecialtyTitle} • العام الجامعي ${enrollment.academicYear}`,
      timestamp: enrollment.reviewedAt || enrollment.enrolledAt || new Date().toISOString(),
      badgeText: 'مفعل سحابياً ✓',
      badgeColor: 'teal'
    });
  }

  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-6" dir="rtl">
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileSelected}
        className="hidden"
      />

      {/* 1. Profile Hero Banner & Quick Academic Stats */}
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {/* Interactive Profile Picture Avatar with Camera Upload Trigger */}
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
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40" dir="ltr">
                    @{userProfile.username}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  حساب سحابي موثق ✓
                </span>
              </div>
              <p className="text-xs text-slate-300 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-teal-400" />
                  <span>{userProfile?.universityNameArabic || universityName}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1 text-teal-300 font-semibold">
                  <Stethoscope className="w-3.5 h-3.5 text-teal-400" />
                  <span>{currentSpecialtyTitle}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1 text-amber-300 font-semibold">
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
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>تغيير الصورة</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditingProfile(!isEditingProfile)}
              className="px-3.5 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingProfile ? 'إغلاق التعديل' : 'تعديل اسم المستخدم والجامعة والتخصص والمستوى'}</span>
            </button>
            <button
              type="button"
              onClick={loadProfileData}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {profileFeedback && !isEditingProfile && (
          <div className={`p-3 rounded-xl text-xs font-bold border flex items-center gap-2 ${
            profileFeedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}>
            {profileFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{profileFeedback.message}</span>
          </div>
        )}

        {/* Full Profile, Avatar, Unique Username, University, Specialty & Study Level Editor Panel */}
        {isEditingProfile && (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-teal-500/40 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-teal-400" />
                <h3 className="text-xs sm:text-sm font-bold text-white">
                  تعديل الملف الشخصي والبيانات الأكاديمية (المزامنة الفورية في السحابة)
                </h3>
              </div>
              {userProfile?.username && (
                <span className="text-[11px] font-mono text-teal-300 bg-teal-500/10 px-2.5 py-0.5 rounded-lg border border-teal-500/20" dir="ltr">
                  @{userProfile.username}
                </span>
              )}
            </div>

            {profileFeedback && (
              <div className={`p-2.5 rounded-xl text-xs font-bold border ${
                profileFeedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}>
                {profileFeedback.message}
              </div>
            )}

            <form onSubmit={handleSaveFullProfile} className="space-y-4 text-xs">
              {/* Avatar Upload & Preset Selector */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {avatarDraft ? (
                    <img
                      src={avatarDraft}
                      alt="معاينة الصورة"
                      className="w-14 h-14 rounded-2xl object-cover border border-teal-500/50"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-teal-400 font-bold text-lg">
                      {(displayNameDraft || usernameDraft || 'ط').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-white">صورة الملف الشخصي</div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ارفع صورة من جهازك أو اختر رمزاً طبياً جاهزاً
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>رفع صورة من الهاتف</span>
                  </button>
                  {avatarDraft && (
                    <button
                      type="button"
                      onClick={() => setAvatarDraft('')}
                      className="px-2.5 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-semibold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>إزالة</span>
                    </button>
                  )}
                  <div className="flex items-center gap-1.5">
                    {MEDICAL_PRESET_AVATARS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAvatarDraft(preset)}
                        className={`w-8 h-8 rounded-full overflow-hidden border-2 transition-transform ${
                          avatarDraft === preset ? 'border-teal-400 scale-110' : 'border-slate-700 opacity-80 hover:opacity-100'
                        }`}
                        title={`رمز طبي ${idx + 1}`}
                      >
                        <img src={preset} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                    اسم المستخدم الفريد (@username) — 4 أحرف إنجليزية على الأقل:
                  </label>
                  <div className="relative" dir="ltr">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400 font-mono font-bold text-xs">@</span>
                    <input
                      type="text"
                      required
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      placeholder="Ahmed_Med"
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    الحروف الكبيرة (Capital) والصغيرة (Small) لها نفس القيمة ({normalizeUsername(usernameDraft) || 'ahmed'}) مع منع تشابه الأسماء.
                  </p>
                  {(usernameAvailability.checking || usernameAvailability.available !== null) && (
                    <div className={`mt-1 text-[11px] font-bold flex items-center gap-1 ${
                      usernameAvailability.checking
                        ? 'text-slate-400'
                        : usernameAvailability.available
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}>
                      {usernameAvailability.checking
                        ? 'جارٍ فحص التفرد وعدم التشابه...'
                        : usernameAvailability.available
                        ? 'اسم المستخدم متاح وغير مشابه لأي حساب آخر ✓'
                        : usernameAvailability.reason}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                    الاسم الكامل / المعروض في المنصة:
                  </label>
                  <input
                    type="text"
                    value={displayNameDraft}
                    onChange={(e) => setDisplayNameDraft(e.target.value)}
                    placeholder="مثال: د. أحمد محمد"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* University, Specialty & Study Level Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                    الجامعة:
                  </label>
                  <select
                    value={universityIdDraft}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUniversityIdDraft(val);
                      const found = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === val);
                      if (found) setCustomUniversityDraft(found.nameArabic);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-teal-500"
                  >
                    {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nameArabic} ({u.cityArabic})
                      </option>
                    ))}
                    <option value="univ-custom">جامعة أخرى (كتابة اسم الجامعة)</option>
                  </select>
                  {universityIdDraft === 'univ-custom' && (
                    <input
                      type="text"
                      required
                      value={customUniversityDraft}
                      onChange={(e) => setCustomUniversityDraft(e.target.value)}
                      placeholder="اكتب اسم جامعتك هنا..."
                      className="mt-2 w-full px-3 py-2 rounded-xl bg-slate-900 border border-teal-500/50 text-white focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                    التخصص الأكاديمي:
                  </label>
                  <select
                    value={specialtyDraft}
                    onChange={(e) => setSpecialtyDraft(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-teal-500"
                  >
                    {MEDICAL_SPECIALTIES_OPTIONS.map((s) => (
                      <option key={s.id} value={s.nameArabic}>
                        {s.nameArabic}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                    المستوى الدراسي:
                  </label>
                  <select
                    value={studyLevelDraft}
                    onChange={(e) => setStudyLevelDraft(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-teal-500"
                  >
                    {STUDY_LEVELS_OPTIONS.map((lvl) => (
                      <option key={lvl.id} value={lvl.id}>
                        {lvl.nameArabic}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <span className="text-[11px] text-slate-400">
                  عند الحفظ يتم تحديث بياناتك في السحابة فوراً وحذف أي معرف قديم لمنع التكرار.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile || usernameAvailability.available === false}
                    className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-bold transition-colors"
                  >
                    {savingProfile ? 'جارٍ الحفظ والمزامنة...' : 'حفظ التعديلات في السحابة ✓'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1">
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5 text-teal-400" />
              <span>المستوى والتخصص</span>
            </span>
            <div className="font-bold text-white text-sm">{currentLevelTitle}</div>
            <div className="text-[10px] text-teal-400 truncate">
              {currentSpecialtyTitle}
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
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center gap-2 flex-wrap">
                <span className="text-slate-400">رقم الكشف / المعرف بالدفعة:</span>
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
