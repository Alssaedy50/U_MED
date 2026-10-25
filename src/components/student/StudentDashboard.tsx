/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Mobile-First Student Dashboard
 * Optimized for common Android phone viewports (360px–412px) with Arabic RTL
 * Strictly isolated by student's University & Study Level (Batch)
 */

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Clock, 
  AlertCircle, 
  FileText, 
  ChevronRight, 
  Sparkles,
  RefreshCw,
  Stethoscope,
  Trophy,
  Bell,
  UserCheck,
  ExternalLink,
  Download,
  X
} from 'lucide-react';
import { 
  StudentEnrollment, 
  StudyPeriod, 
  CourseOffering,
  CourseInstructor,
  BatchNotification,
  University
} from '../../types/umed.ts';
import { 
  fetchStudentEnrollment,
  subscribeToStudentEnrollment
} from '../../services/enrollmentService.ts';
import { 
  fetchStudyPeriods, 
  fetchCourseOfferings,
  fetchUniversities,
  getCachedCollection,
  subscribeToAcademicHierarchy,
  getUserAcademicContext,
  saveUserAcademicContext
} from '../../services/academicService.ts';
import AcademicContextBar from '../common/AcademicContextModal.tsx';
import {
  fetchCourseInstructors,
  fetchBatchNotifications,
  getCachedCourseInstructors,
  getCachedBatchNotifications,
  subscribeToBatchNotifications,
  subscribeToCourseInstructors
} from '../../services/batchGovernanceService.ts';
import { resolveResourceFileUrl } from '../../services/resourceService.ts';
import {
  syncNotificationsForBatchPosts,
  syncNotificationForEnrollment
} from '../../services/notificationService.ts';
import RegisterEnrollment from './RegisterEnrollment.tsx';
import StudentMedicalLibrary from '../library/StudentMedicalLibrary.tsx';
import StudentAssessmentList from '../assessment/StudentAssessmentList.tsx';

interface StudentDashboardProps {
  uid: string;
  userEmail: string;
  displayNameArabic: string;
  activeSection?: 'study' | 'library' | 'assessments';
  onSelectSection?: (section: 'study' | 'library' | 'assessments' | 'profile') => void;
  onEnrollmentStatusChange?: (enr: StudentEnrollment | null) => void;
  isAdminPreview?: boolean;
  previewUniversityId?: string;
  previewStudyLevelId?: string;
  assessmentNavTarget?: {
    assessmentType?: 'exam' | 'competition';
    assessmentId?: string;
    timestamp?: number;
  } | null;
}

export default function StudentDashboard({
  uid,
  displayNameArabic,
  activeSection = 'study',
  onSelectSection,
  onEnrollmentStatusChange,
  isAdminPreview = false,
  previewUniversityId = 'univ-dar-al-salam',
  previewStudyLevelId,
  assessmentNavTarget
}: StudentDashboardProps) {
  const buildAdminPreviewEnrollment = (): StudentEnrollment => {
    const savedCtx = getUserAcademicContext();
    return {
      id: `enr-preview-${uid}`,
      uid,
      studentNameArabic: displayNameArabic || 'معاينة المسؤول',
      academicStudentNumber: 'ADMIN-PREVIEW',
      universityId: savedCtx.universityId || previewUniversityId || 'univ-dar-al-salam',
      collegeId: savedCtx.collegeId || 'col-med-dar',
      programId: savedCtx.programId || 'prog-mbbs',
      curriculumVersionId: 'cur-dar-2024',
      currentStudyLevelId: previewStudyLevelId || savedCtx.studyLevelId || 'lvl-2',
      academicYear: '2025-2026',
      status: 'approved',
      enrolledAt: new Date().toISOString()
    };
  };

  const [enrollment, setEnrollment] = useState<StudentEnrollment | null>(() => {
    try {
      const cached = localStorage.getItem(`umed_enrollment_${uid}`);
      if (cached) {
        const parsed = JSON.parse(cached) as StudentEnrollment;
        if (parsed && (parsed.status === 'approved' || !isAdminPreview)) {
          return parsed;
        }
      }
    } catch (e) {}
    if (isAdminPreview) {
      return buildAdminPreviewEnrollment();
    }
    return null;
  });
  const [universities, setUniversities] = useState<University[]>(() =>
    getCachedCollection<University>('universities')
  );
  // Instant 0ms render if enrollment is already cached
  const [loading, setLoading] = useState<boolean>(() => !enrollment);
  const [internalTab, setInternalTab] = useState<'study' | 'library' | 'assessments'>(activeSection);

  // Academic Content & Batch Governance State (Strictly scoped to Student's University & Batch)
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>(() => {
    if (!enrollment) return [];
    return getCachedCollection<StudyPeriod>('studyPeriods')
      .filter(p => p.studyLevelId === enrollment.currentStudyLevelId && (!p.universityId || p.universityId === enrollment.universityId))
      .sort((a, b) => a.order - b.order);
  });
  const [selectedPeriod, setSelectedPeriod] = useState<StudyPeriod | null>(() => {
    if (!enrollment) return null;
    const cachedPeriods = getCachedCollection<StudyPeriod>('studyPeriods')
      .filter(p => p.studyLevelId === enrollment.currentStudyLevelId && (!p.universityId || p.universityId === enrollment.universityId))
      .sort((a, b) => a.order - b.order);
    return cachedPeriods[0] || null;
  });
  const [courses, setCourses] = useState<CourseOffering[]>(() => {
    if (!enrollment) return [];
    const cachedPeriods = getCachedCollection<StudyPeriod>('studyPeriods')
      .filter(p => p.studyLevelId === enrollment.currentStudyLevelId && (!p.universityId || p.universityId === enrollment.universityId))
      .sort((a, b) => a.order - b.order);
    const firstPeriod = cachedPeriods[0];
    if (!firstPeriod) return [];
    return getCachedCollection<CourseOffering>('courseOfferings').filter(
      c => c.studyPeriodId === firstPeriod.id && (!c.universityId || c.universityId === enrollment.universityId)
    );
  });
  const [instructors, setInstructors] = useState<CourseInstructor[]>(() => {
    if (!enrollment) return [];
    return getCachedCourseInstructors({
      universityId: enrollment.universityId,
      studyLevelId: enrollment.currentStudyLevelId
    });
  });
  const [batchNotifications, setBatchNotifications] = useState<BatchNotification[]>(() => {
    if (!enrollment) return [];
    return getCachedBatchNotifications({
      universityId: enrollment.universityId,
      studyLevelId: enrollment.currentStudyLevelId
    });
  });
  const [downloadingNotifId, setDownloadingNotifId] = useState<string | null>(null);
  const [showBlockPopup, setShowBlockPopup] = useState<boolean>(false);
  const [activeBatchNotifModal, setActiveBatchNotifModal] = useState<BatchNotification | null>(null);

  useEffect(() => {
    setInternalTab(activeSection);
  }, [activeSection]);

  const switchSection = (sec: 'study' | 'library' | 'assessments' | 'profile') => {
    if (onSelectSection) {
      onSelectSection(sec);
    } else if (sec !== 'profile') {
      setInternalTab(sec);
    }
  };

  const loadStudentData = async (showSpinner = false) => {
    if (showSpinner || !enrollment) {
      setLoading(true);
    }
    try {
      const [enr, univList] = await Promise.all([
        fetchStudentEnrollment(uid),
        fetchUniversities('YE')
      ]);
      setUniversities(univList);
      const effectiveEnrollment =
        enr && enr.status === 'approved'
          ? enr
          : isAdminPreview
          ? buildAdminPreviewEnrollment()
          : enr;
      setEnrollment(effectiveEnrollment);
      if (onEnrollmentStatusChange) {
        onEnrollmentStatusChange(effectiveEnrollment);
      }

      if (effectiveEnrollment && effectiveEnrollment.status === 'approved') {
        const [periods, instList, notifList] = await Promise.all([
          fetchStudyPeriods(effectiveEnrollment.currentStudyLevelId, effectiveEnrollment.universityId),
          fetchCourseInstructors({ universityId: effectiveEnrollment.universityId, studyLevelId: effectiveEnrollment.currentStudyLevelId }),
          fetchBatchNotifications({ universityId: effectiveEnrollment.universityId, studyLevelId: effectiveEnrollment.currentStudyLevelId })
        ]);
        setStudyPeriods(periods);
        setInstructors(instList);
        setBatchNotifications(notifList);
        syncNotificationsForBatchPosts(
          uid,
          notifList,
          effectiveEnrollment.universityId,
          effectiveEnrollment.currentStudyLevelId
        );
        setSelectedPeriod(prev => {
          if (prev && periods.some(p => p.id === prev.id)) {
            return periods.find(p => p.id === prev.id) || periods[0] || null;
          }
          return periods[0] || null;
        });
      }
    } catch (err) {
      console.warn('Failed to load student dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData(false);
    if (!uid) return;
    const unsubEnrollment = subscribeToStudentEnrollment(uid, (liveEnr) => {
      if (liveEnr) {
        syncNotificationForEnrollment(uid, liveEnr);
        setEnrollment(liveEnr);
        if (onEnrollmentStatusChange) {
          onEnrollmentStatusChange(liveEnr);
        }
      }
    });
    return () => unsubEnrollment();
  }, [uid]);

  // Subscribe in real-time to Batch Notifications, Course Instructors, and Academic Structure
  useEffect(() => {
    if (!enrollment || enrollment.status !== 'approved') return;

    const unsubNotifs = subscribeToBatchNotifications(
      enrollment.universityId,
      enrollment.currentStudyLevelId,
      (notifs) => {
        setBatchNotifications(notifs);
        syncNotificationsForBatchPosts(
          uid,
          notifs,
          enrollment.universityId,
          enrollment.currentStudyLevelId
        );
      }
    );

    const unsubInstructors = subscribeToCourseInstructors(
      enrollment.universityId,
      enrollment.currentStudyLevelId,
      (instList: CourseInstructor[]) => setInstructors(instList)
    );

    const unsubAcademic = subscribeToAcademicHierarchy(() => {
      const liveUnivs = getCachedCollection<University>('universities').filter(u => u.countryId === 'YE');
      if (liveUnivs.length > 0) setUniversities(liveUnivs);

      const livePeriods = getCachedCollection<StudyPeriod>('studyPeriods')
        .filter(p => p.studyLevelId === enrollment.currentStudyLevelId && (!p.universityId || p.universityId === enrollment.universityId))
        .sort((a, b) => a.order - b.order);
      setStudyPeriods(livePeriods);
      setSelectedPeriod(prev => {
        if (prev && livePeriods.some(p => p.id === prev.id)) {
          return livePeriods.find(p => p.id === prev.id) || livePeriods[0] || null;
        }
        return livePeriods[0] || null;
      });
    });

    return () => {
      unsubNotifs();
      unsubInstructors();
      unsubAcademic();
    };
  }, [enrollment?.universityId, enrollment?.currentStudyLevelId, enrollment?.status]);

  useEffect(() => {
    if (selectedPeriod && enrollment) {
      // Hydrate synchronously first from cache for 0ms block switching
      const cachedCourses = getCachedCollection<CourseOffering>('courseOfferings').filter(
        c => c.studyPeriodId === selectedPeriod.id && (!c.universityId || c.universityId === enrollment.universityId)
      );
      if (cachedCourses.length > 0) {
        setCourses(cachedCourses);
      }
      fetchCourseOfferings(selectedPeriod.id, enrollment.universityId).then((crs) => {
        setCourses(crs);
      });
    } else {
      setCourses([]);
    }
  }, [selectedPeriod, enrollment?.universityId, studyPeriods]);

  const getUniversityName = (univId: string): string => {
    const found = universities.find(u => u.id === univId);
    if (found) return found.nameArabic;
    return univId === 'univ-dar-al-salam' ? 'جامعة دار السلام الدولية للعلوم والتكنولوجيا' : univId;
  };

  const handleOpenNotificationAttachment = async (notif: BatchNotification) => {
    if (!notif.attachmentUrl) return;
    setDownloadingNotifId(notif.id);
    try {
      const resolved = await resolveResourceFileUrl({
        id: notif.id,
        title: notif.title,
        resourceType: notif.attachmentType || 'link',
        url: notif.attachmentUrl,
        universityId: notif.universityId,
        programId: 'prog-mbbs',
        curriculumVersionId: 'cur-dar-2024',
        studyLevelId: notif.studyLevelId,
        sectionType: 'general',
        status: 'published',
        createdBy: notif.authorUid,
        createdAt: notif.createdAt,
        updatedAt: notif.createdAt
      });
      if (resolved.isCloudFile) {
        const a = document.createElement('a');
        a.href = resolved.downloadUrl;
        a.download = notif.attachmentLabel || `${notif.title}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const a = document.createElement('a');
        a.href = resolved.viewUrl || notif.attachmentUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) {
      console.warn('Failed to open notification attachment:', e);
    } finally {
      setDownloadingNotifId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-400 mb-2" />
        <span>جارٍ تحميل بيانات الطالب ولوحة الدراسة...</span>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-teal-950/30 border border-teal-800/50 rounded-2xl text-xs text-teal-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <span>مرحباً بك د. {displayNameArabic}! يرجى إتمام تسجيل بيانات القيد الأكاديمي لمرة واحدة لتخصيص مقرراتك الدراسية حسب جامعتك ودفعتك.</span>
          </div>
        </div>
        <RegisterEnrollment
          uid={uid}
          studentNameArabic={displayNameArabic}
          onEnrollmentComplete={(newEnr) => {
            setEnrollment(newEnr);
            loadStudentData();
          }}
        />
      </div>
    );
  }

  if (enrollment.status === 'pending') {
    return (
      <div className="max-w-xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center">
          <Clock className="w-8 h-8" />
        </div>
        <div>
          <span className="text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold inline-block mb-2">
            طلب القيد قيد المراجعة والاعتماد
          </span>
          <h2 className="text-lg font-bold text-white">
            مرحباً د. {displayNameArabic}
          </h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            تم استلام طلب قيدك الأكاديمي برقم <code className="text-teal-300 font-mono" dir="ltr">{enrollment.academicStudentNumber}</code> في {getUniversityName(enrollment.universityId)}، وسيتم تفعيل وصولك للمقررات والاختبارات الخاصة بدفعتك فور مراجعة واعتماد الطلب من قبل إدارة الجامعة.
          </p>
        </div>

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-right space-y-2">
          <div className="flex justify-between border-b border-slate-800 pb-1.5">
            <span className="text-slate-400">الجامعة المستقلة:</span>
            <span className="text-slate-200 font-semibold">{getUniversityName(enrollment.universityId)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-800 pb-1.5">
            <span className="text-slate-400">الدفعة / المستوى المطلوب:</span>
            <span className="text-teal-300 font-semibold">
              {enrollment.currentStudyLevelId === 'lvl-internship' ? 'سنة الامتياز (سريري)' : `المستوى ${enrollment.currentStudyLevelId.replace('lvl-', '')}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">تاريخ الإرسال:</span>
            <span className="text-slate-400 font-mono">{new Date(enrollment.enrolledAt || enrollment.requestedAt || Date.now()).toLocaleDateString('ar-YE')}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={() => loadStudentData(true)}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث حالة القيد الآن</span>
          </button>
          <button
            onClick={() => setEnrollment(null)}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-700"
          >
            <span>تعديل بيانات طلب القيد</span>
          </button>
        </div>
      </div>
    );
  }

  if (enrollment.status === 'rejected') {
    return (
      <div className="max-w-xl mx-auto bg-slate-900/90 border border-rose-800/50 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-white">لم يتم قبول طلب القيد الأكاديمي</h2>
        {enrollment.rejectionReason && (
          <div className="p-3 bg-rose-950/40 rounded-xl border border-rose-800/60 text-xs text-rose-300">
            <strong>سبب عدم القبول:</strong> {enrollment.rejectionReason}
          </div>
        )}
        <p className="text-xs text-slate-400">
          يمكنك إعادة إدخال بيانات القيد الصحيحة وإرسالها مجدداً.
        </p>
        <button
          onClick={() => setEnrollment(null)}
          className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors"
        >
          إعادة تسجيل القيد ببيانات مصححة
        </button>
      </div>
    );
  }

  const isInternship = enrollment.currentStudyLevelId === 'lvl-internship';
  const currentUniversityName = getUniversityName(enrollment.universityId);

  return (
    <div className="space-y-5">
      
      {/* 1. Academic Summary Banner (Strictly scoped to Student's University & Batch) */}
      <div className="bg-gradient-to-r from-teal-950/80 via-slate-900 to-indigo-950/80 border border-teal-500/30 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20 font-black text-xl flex-shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-sm sm:text-base text-white">
                  د. {displayNameArabic}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                  قيد معتمد ✓
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isInternship 
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                    : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                }`}>
                  {isInternship ? 'سنة الامتياز السريرية' : `دفعة المستوى ${enrollment.currentStudyLevelId.replace('lvl-', '')}`}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {currentUniversityName} • كلية الطب البشري • نظام البلوكات (MBBS)
              </p>
            </div>
          </div>

          <div className="text-right sm:text-left flex items-center gap-2">
            <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-500 block text-[10px]">الرقم الأكاديمي:</span>
              <span className="font-mono text-teal-300 font-bold" dir="ltr">{enrollment.academicStudentNumber}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Academic Context Header & Popup Switcher */}
      <AcademicContextBar
        userRole={isAdminPreview ? 'platform_owner' : 'student'}
        onContextChange={(ctx) => {
          setEnrollment(prev => {
            if (!prev) return prev;
            const updated: StudentEnrollment = {
              ...prev,
              universityId: ctx.universityId || prev.universityId,
              collegeId: ctx.collegeId || prev.collegeId,
              programId: ctx.programId || prev.programId,
              currentStudyLevelId: ctx.studyLevelId || prev.currentStudyLevelId
            };
            try {
              localStorage.setItem(`umed_enrollment_${uid}`, JSON.stringify(updated));
            } catch {}
            return updated;
          });
        }}
      />

      {/* SECTION: MEDICAL LIBRARY */}
      {internalTab === 'library' && (
        <StudentMedicalLibrary
          universityId={enrollment.universityId}
          programId={enrollment.programId}
          studyLevelId={enrollment.currentStudyLevelId}
          studentNameArabic={displayNameArabic}
        />
      )}

      {/* SECTION: ASSESSMENTS & COMPETITIONS */}
      {internalTab === 'assessments' && (
        <StudentAssessmentList
          universityId={enrollment.universityId}
          studyLevelId={enrollment.currentStudyLevelId}
          uid={uid}
          studentNameArabic={displayNameArabic}
          initialAssessmentType={assessmentNavTarget?.assessmentType}
          highlightedAssessmentId={assessmentNavTarget?.assessmentId}
          navigationTimestamp={assessmentNavTarget?.timestamp}
        />
      )}

      {/* SECTION: STUDY DASHBOARD (Batch Notifications, Blocks, Courses & Doctors) */}
      {internalTab === 'study' && (
        <div className="space-y-5">

          {/* BATCH NOTIFICATIONS & SHARED DATA FROM BATCH REP / ADMIN */}
          {batchNotifications.length > 0 && (
            <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs sm:text-sm font-bold text-white">
                    إشعارات الدفعة والبيانات المشتركة ({batchNotifications.length})
                  </h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                  مخصص لدفعتك فقط
                </span>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {batchNotifications.slice(0, 6).map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all hover:border-slate-700 cursor-pointer ${
                      notif.category === 'urgent'
                        ? 'bg-rose-950/25 border-rose-800/60'
                        : notif.category === 'exam'
                        ? 'bg-amber-950/20 border-amber-800/50'
                        : 'bg-slate-950 border-slate-800/80'
                    }`}
                    onClick={() => setActiveBatchNotifModal(notif)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            notif.category === 'urgent'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : notif.category === 'exam'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                          }`}
                        >
                          {notif.category === 'urgent'
                            ? 'عاجل'
                            : notif.category === 'exam'
                            ? 'اختبار / مسابقة'
                            : notif.category === 'data_shared'
                            ? 'داتا مشتركة'
                            : 'إشعار الدفعة'}
                        </span>
                        <h4 className="font-bold text-white text-xs sm:text-sm">{notif.title}</h4>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(notif.createdAt).toLocaleString('ar-YE')}
                      </span>
                    </div>

                    <p className="text-slate-300 leading-relaxed line-clamp-2">{notif.message}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80 text-[11px]">
                      <span className="text-slate-400">
                        المرسل: <strong className="text-teal-300">{notif.authorNameArabic}</strong>
                      </span>

                      <div className="flex items-center gap-2">
                        {notif.attachmentUrl && (
                          <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800 text-[10px] font-bold">
                            يحتوي مرفقاً 📎
                          </span>
                        )}
                        <span className="text-teal-400 hover:text-teal-300 font-bold text-[11px] flex items-center gap-1">
                          <span>عرض كامل الإشعار</span>
                          <ChevronRight className="w-3 h-3 rotate-180" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {studyPeriods.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">
                  البلوك الدراسي النشط حالياً في دفعتك ({studyPeriods.length} بلوكات متاحة):
                </span>
                <button
                  type="button"
                  onClick={() => setShowBlockPopup(true)}
                  className="mt-1 text-sm sm:text-base font-black text-white hover:text-teal-300 flex items-center gap-2 transition-colors text-right"
                >
                  <span>{selectedPeriod ? `${selectedPeriod.titleArabic} (${selectedPeriod.code})` : 'اختر البلوك الدراسي'}</span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-teal-600 text-teal-300 hover:text-white text-xs font-bold transition-colors">
                    تبديل البلوك ▾
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowBlockPopup(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-300 text-xs font-bold transition-colors"
              >
                عرض جميع بلوكات الدفعة ({studyPeriods.length})
              </button>
            </div>
          )}

          {/* Standalone Popup Modal for Selecting Study Block */}
          {showBlockPopup && (
            <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
              <div className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-lg w-full max-h-[85dvh] flex flex-col shadow-2xl my-auto overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
                  <div>
                    <h3 className="text-sm font-black text-white">اختيار البلوك الدراسي ({studyPeriods.length})</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">اختر البلوك لعرض مقرراته ومحاضراته الخاصة بدفعتك</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBlockPopup(false)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs"
                  >
                    إغلاق
                  </button>
                </div>
                <div className="p-4 overflow-y-auto space-y-2">
                  {studyPeriods.map((period) => {
                    const isSelected = selectedPeriod?.id === period.id;
                    return (
                      <button
                        key={period.id}
                        type="button"
                        onClick={() => {
                          setSelectedPeriod(period);
                          saveUserAcademicContext({
                            studyPeriodId: period.id,
                            studyPeriodName: period.titleArabic
                          });
                          setShowBlockPopup(false);
                        }}
                        className={`w-full text-right p-3.5 rounded-xl border text-xs transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-teal-500/20 border-teal-500 text-white font-bold shadow-md'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{period.titleArabic}</div>
                          <div className="text-[11px] text-slate-400" dir="ltr">{period.titleEnglish}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-teal-300 font-mono text-[11px]">
                          {period.code}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Courses & Assigned Theoretical / Practical Doctors Grid */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-400" />
                  <span>المقررات ودكاترة المواد (النظري والعملي)</span>
                  {selectedPeriod && <span className="text-xs text-teal-300 font-mono">({selectedPeriod.titleArabic})</span>}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  استعراض المحاضرات النظرية والتدريب العملي ودكاترة كل مادة في دفعتك
                </p>
              </div>
              <button
                onClick={() => switchSection('library')}
                className="px-3 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 text-xs font-bold transition-colors"
              >
                فتح المكتبة الرقمية
              </button>
            </div>

            {courses.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                <p>لم تتم إضافة مقررات مخصصة لهذا البلوك بعد. يمكنك الوصول إلى محاضرات وشرائح وفيديوهات البلوك عبر زر «فتح المكتبة الرقمية» أعلاه.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {courses.map((course) => {
                  const courseDoctors = instructors.filter(i => i.courseOfferingId === course.id);
                  return (
                    <div
                      key={course.id}
                      onClick={() => switchSection('library')}
                      className="cursor-pointer p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2.5 hover:border-teal-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-teal-300 font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                          {course.code}
                        </span>
                        <span className="text-slate-500 text-[11px] font-mono">{course.creditHours ?? 3} ساعات</span>
                      </div>

                      <div>
                        <div className="font-bold text-white text-sm">{course.titleArabic}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5" dir="ltr">{course.titleEnglish}</div>
                      </div>

                      {/* Assigned Theoretical & Practical Doctors for this Course */}
                      {courseDoctors.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1.5">
                          <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-teal-400" />
                            <span>دكاترة المادة المعتمدون:</span>
                          </div>
                          {courseDoctors.map(docItem => (
                            <div key={docItem.id} className="flex items-center justify-between text-[11px]">
                              <span className="text-white font-semibold">
                                {docItem.academicTitle || 'د.'} {docItem.instructorNameArabic}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                docItem.teachingType === 'theoretical'
                                  ? 'bg-teal-950 text-teal-300 border border-teal-800'
                                  : docItem.teachingType === 'practical'
                                  ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}>
                                {docItem.teachingType === 'theoretical'
                                  ? 'مادة نظرية'
                                  : docItem.teachingType === 'practical'
                                  ? 'مادة عملية / سريرية'
                                  : 'نظري + عملي'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-teal-950 border border-teal-800 text-teal-300 text-[10px]">
                            نظري
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 text-[10px]">
                            عملي / مختبر
                          </span>
                        </div>

                        <span className="text-teal-400 font-semibold flex items-center gap-1 text-[10px]">
                          <span>فتح المحاضرات والداتا</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Access to Exams & Competitions */}
          <div className="p-5 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-teal-950/40 border border-indigo-500/30 rounded-2xl text-xs flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="font-bold text-white text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>الاختبارات الدورية والمسابقات الطبية التفاعلية</span>
              </span>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                ابدأ اختبارات البلوكات والمسابقات السريرية المخصصة لدفعتك في {currentUniversityName} مع التصحيح الفوري وتحميل ملف الاختبار بعد الانتهاء.
              </p>
            </div>
            <button
              onClick={() => switchSection('assessments')}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors shadow-lg flex items-center gap-2"
            >
              <span>عرض وبدء الاختبارات الآن</span>
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
          </div>

        </div>
      )}

      {/* Detailed Batch Notification Sheet Modal */}
      {activeBatchNotifModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <div className="bg-slate-900 border border-indigo-500/40 sm:rounded-2xl rounded-t-2xl max-w-lg w-full max-h-[88dvh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:fade-in duration-200">
            {/* Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    activeBatchNotifModal.category === 'urgent'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : activeBatchNotifModal.category === 'exam'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                  }`}
                >
                  {activeBatchNotifModal.category === 'urgent'
                    ? 'عاجل'
                    : activeBatchNotifModal.category === 'exam'
                    ? 'اختبار / مسابقة'
                    : activeBatchNotifModal.category === 'data_shared'
                    ? 'داتا مشتركة'
                    : 'إشعار الدفعة'}
                </span>
                <h3 className="text-sm font-bold text-white truncate">{activeBatchNotifModal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveBatchNotifModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 border-b border-slate-800/80">
                <span>
                  المرسل: <strong className="text-teal-300 font-semibold">{activeBatchNotifModal.authorNameArabic}</strong>
                </span>
                <span className="font-mono text-slate-400">
                  {new Date(activeBatchNotifModal.createdAt).toLocaleString('ar-YE')}
                </span>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                {activeBatchNotifModal.message}
              </div>

              {activeBatchNotifModal.attachmentUrl && (
                <div className="p-3.5 rounded-xl bg-teal-950/30 border border-teal-800/50 space-y-2">
                  <div className="text-[11px] font-bold text-teal-300 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-teal-400" />
                    <span>الملف أو الرابط المرفق مع هذا الإشعار:</span>
                  </div>
                  <button
                    type="button"
                    disabled={downloadingNotifId === activeBatchNotifModal.id}
                    onClick={() => handleOpenNotificationAttachment(activeBatchNotifModal)}
                    className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-teal-900/30 transition-all"
                  >
                    {activeBatchNotifModal.attachmentType === 'link' ? (
                      <ExternalLink className="w-4 h-4" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>
                      {downloadingNotifId === activeBatchNotifModal.id
                        ? 'جارٍ فتح المرفق...'
                        : activeBatchNotifModal.attachmentLabel
                        ? `فتح وتحميل: ${activeBatchNotifModal.attachmentLabel}`
                        : 'فتح / تحميل المرفق الآن'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveBatchNotifModal(null)}
                className="py-2 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
