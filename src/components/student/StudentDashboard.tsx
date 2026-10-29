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
  University,
  EducationalResource,
  Assessment
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
import {
  fetchCourseInstructors,
  fetchBatchNotifications,
  getCachedCourseInstructors,
  getCachedBatchNotifications,
  subscribeToBatchNotifications,
  subscribeToCourseInstructors
} from '../../services/batchGovernanceService.ts';
import {
  resolveResourceFileUrl,
  fetchEducationalResources,
  getCachedEducationalResources,
  subscribeToEducationalResources
} from '../../services/resourceService.ts';
import {
  getPublishedAssessmentsForStudent,
  getCachedPublishedAssessments,
  subscribeToAssessments
} from '../../services/assessmentService.ts';
import {
  syncNotificationsForBatchPosts,
  syncNotificationForEnrollment
} from '../../services/notificationService.ts';
import RegisterEnrollment from './RegisterEnrollment.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { YEMEN_UNIVERSITIES_OPTIONS } from '../../lib/firebase.ts';

// Lazy-load secondary student views for faster initial dashboard TTI
const StudentMedicalLibrary = React.lazy(() => import('../library/StudentMedicalLibrary.tsx'));
const StudentAssessmentList = React.lazy(() => import('../assessment/StudentAssessmentList.tsx'));

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
  const { userProfile, updateFullProfile } = useAuth();

  const buildDefaultEnrollment = (overrideLevelId?: string, overrideUnivId?: string): StudentEnrollment => {
    const savedCtx = getUserAcademicContext();
    return {
      id: uid ? `enr-${uid}` : 'enr-visitor-default',
      uid: uid || 'visitor',
      studentNameArabic: userProfile?.displayNameArabic || displayNameArabic || 'طالب الطب البشري',
      academicStudentNumber: '',
      universityId: overrideUnivId || userProfile?.universityId || savedCtx.universityId || previewUniversityId || 'univ-dar-al-salam',
      collegeId: savedCtx.collegeId || 'col-med-dar',
      programId: savedCtx.programId || 'prog-mbbs',
      curriculumVersionId: 'cur-dar-2024',
      currentStudyLevelId: overrideLevelId || userProfile?.studyLevelId || previewStudyLevelId || savedCtx.studyLevelId || 'lvl-4',
      academicYear: '2025-2026',
      status: 'approved',
      enrolledAt: new Date().toISOString()
    };
  };

  const [enrollment, setEnrollment] = useState<StudentEnrollment | null>(() => {
    try {
      const cached = localStorage.getItem(`umed_enrollment_${uid || 'visitor'}`);
      if (cached) {
        const parsed = JSON.parse(cached) as StudentEnrollment;
        if (parsed && parsed.status !== 'rejected') {
          return parsed;
        }
      }
    } catch (e) {}
    return buildDefaultEnrollment();
  });
  const [showOptionalEnrollmentModal, setShowOptionalEnrollmentModal] = useState<boolean>(false);
  const [universities, setUniversities] = useState<University[]>(() =>
    getCachedCollection<University>('universities')
  );
  // Instant 0ms render
  const [loading, setLoading] = useState<boolean>(false);
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
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<{ id: string; title: string } | null>(null);
  const [levelResources, setLevelResources] = useState<EducationalResource[]>(() => {
    if (!enrollment) return [];
    return getCachedEducationalResources({
      universityId: enrollment.universityId,
      studyLevelId: enrollment.currentStudyLevelId,
      status: 'published'
    });
  });
  const [levelAssessments, setLevelAssessments] = useState<Assessment[]>(() => {
    if (!enrollment) return [];
    return getCachedPublishedAssessments(enrollment.universityId, enrollment.currentStudyLevelId);
  });

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

  const loadStudentData = async (showSpinner = false, overrideEnr?: StudentEnrollment) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const [enr, univList] = await Promise.all([
        uid && uid !== 'visitor' ? fetchStudentEnrollment(uid) : Promise.resolve(null),
        fetchUniversities('YE')
      ]);
      setUniversities(univList);
      const effectiveEnrollment =
        overrideEnr ||
        (enr && (enr.status === 'approved' || enr.status === 'pending')
          ? enr
          : enrollment || buildDefaultEnrollment());
      setEnrollment(effectiveEnrollment);
      if (onEnrollmentStatusChange) {
        onEnrollmentStatusChange(effectiveEnrollment);
      }

      if (effectiveEnrollment) {
        const [periods, instList, notifList, resList, asmntList] = await Promise.all([
          fetchStudyPeriods(effectiveEnrollment.currentStudyLevelId, effectiveEnrollment.universityId),
          fetchCourseInstructors({ universityId: effectiveEnrollment.universityId, studyLevelId: effectiveEnrollment.currentStudyLevelId }),
          fetchBatchNotifications({ universityId: effectiveEnrollment.universityId, studyLevelId: effectiveEnrollment.currentStudyLevelId }),
          fetchEducationalResources({
            universityId: effectiveEnrollment.universityId,
            studyLevelId: effectiveEnrollment.currentStudyLevelId,
            status: 'published'
          }),
          internalTab === 'assessments'
            ? getPublishedAssessmentsForStudent(effectiveEnrollment.universityId, effectiveEnrollment.currentStudyLevelId)
            : Promise.resolve(getCachedPublishedAssessments(effectiveEnrollment.universityId, effectiveEnrollment.currentStudyLevelId))
        ]);
        setStudyPeriods(periods);
        setInstructors(instList);
        setBatchNotifications(notifList);
        setLevelResources(resList);
        setLevelAssessments(asmntList);
        syncNotificationsForBatchPosts(
          uid || 'visitor',
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

  // Background preload secondary student tabs 1.5s after initial dashboard render
  useEffect(() => {
    const preloadTimer = setTimeout(() => {
      import('../library/StudentMedicalLibrary.tsx').catch(() => {});
      import('../assessment/StudentAssessmentList.tsx').catch(() => {});
    }, 1500);
    return () => clearTimeout(preloadTimer);
  }, []);

  // Subscribe in real-time to Batch Notifications, Course Instructors, and Academic Structure
  useEffect(() => {
    if (!enrollment || (enrollment.status !== 'approved' && enrollment.status !== 'pending')) return;

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
        .filter(
          p =>
            !p.isArchived &&
            p.isActive !== false &&
            p.studyLevelId === enrollment.currentStudyLevelId &&
            (!p.universityId || p.universityId === enrollment.universityId)
        )
        .sort((a, b) => a.order - b.order);
      setStudyPeriods(livePeriods);
      setSelectedPeriod(prev => {
        const nextPeriod =
          prev && livePeriods.some(p => p.id === prev.id)
            ? livePeriods.find(p => p.id === prev.id) || livePeriods[0] || null
            : livePeriods[0] || null;

        if (nextPeriod) {
          const liveCourses = getCachedCollection<CourseOffering>('courseOfferings').filter(
            c =>
              c.isActive !== false &&
              c.studyPeriodId === nextPeriod.id &&
              (!c.universityId || c.universityId === enrollment.universityId)
          );
          setCourses(liveCourses);
        } else {
          setCourses([]);
        }
        return nextPeriod;
      });
    });

    const unsubResources = subscribeToEducationalResources(
      {
        universityId: enrollment.universityId,
        studyLevelId: enrollment.currentStudyLevelId,
        status: 'published'
      },
      (liveResources) => {
        setLevelResources(liveResources);
      }
    );

    const unsubAssessments = subscribeToAssessments(
      enrollment.universityId,
      (liveAssessments) => {
        const filtered = liveAssessments.filter(
          a =>
            a.status === 'published' &&
            (!a.studyLevelId || a.studyLevelId === enrollment.currentStudyLevelId || a.studyLevelId === 'ALL')
        );
        setLevelAssessments(filtered);
      },
      undefined,
      'published'
    );

    return () => {
      unsubNotifs();
      unsubInstructors();
      unsubAcademic();
      unsubResources();
      unsubAssessments();
    };
  }, [enrollment?.universityId, enrollment?.currentStudyLevelId, enrollment?.status]);

  useEffect(() => {
    if (selectedPeriod && enrollment) {
      // Hydrate synchronously first from cache for 0ms block switching
      const cachedCourses = getCachedCollection<CourseOffering>('courseOfferings').filter(
        c =>
          c.isActive !== false &&
          c.studyPeriodId === selectedPeriod.id &&
          (!c.universityId || c.universityId === enrollment.universityId)
      );
      setCourses(cachedCourses);
      fetchCourseOfferings(selectedPeriod.id, enrollment.universityId).then((crs) => {
        setCourses(crs.filter(c => c.isActive !== false));
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

  const activeEnrollment = enrollment || buildDefaultEnrollment();

  const handleQuickLevelChange = (newLevelId: string) => {
    saveUserAcademicContext({ studyLevelId: newLevelId });
    const updatedEnr: StudentEnrollment = {
      ...activeEnrollment,
      currentStudyLevelId: newLevelId,
      status: activeEnrollment.status === 'rejected' ? 'approved' : activeEnrollment.status
    };
    setEnrollment(updatedEnr);
    try {
      localStorage.setItem(`umed_enrollment_${uid || 'visitor'}`, JSON.stringify(updatedEnr));
    } catch (e) {}
    if (uid && uid !== 'visitor') {
      updateFullProfile({ studyLevelId: newLevelId }).catch(() => {});
    }
    loadStudentData(false, updatedEnr);
  };

  const handleQuickUniversityChange = (newUniversityId: string) => {
    const univObj = YEMEN_UNIVERSITIES_OPTIONS.find(u => u.id === newUniversityId);
    const univNameArabic = univObj?.nameArabic || getUniversityName(newUniversityId);
    saveUserAcademicContext({ universityId: newUniversityId, universityNameArabic: univNameArabic });
    const updatedEnr: StudentEnrollment = {
      ...activeEnrollment,
      universityId: newUniversityId,
      status: activeEnrollment.status === 'rejected' ? 'approved' : activeEnrollment.status
    };
    setEnrollment(updatedEnr);
    try {
      localStorage.setItem(`umed_enrollment_${uid || 'visitor'}`, JSON.stringify(updatedEnr));
    } catch (e) {}
    if (uid && uid !== 'visitor') {
      updateFullProfile({
        universityId: newUniversityId,
        universityNameArabic: univNameArabic
      }).catch(() => {});
    }
    loadStudentData(false, updatedEnr);
  };

  const isInternship = activeEnrollment.currentStudyLevelId === 'lvl-internship';
  const currentUniversityName = userProfile?.universityNameArabic || getUniversityName(activeEnrollment.universityId);
  const currentSpecialtyArabic = userProfile?.specialtyArabic || 'الطب البشري والجراحة العامة (MBBS)';

  return (
    <div className="space-y-5">
      
      {/* 1. Academic Summary Banner — Shown ONLY on the main 'study' tab so it never crowds Library or Assessments */}
      {internalTab === 'study' && (
        <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-3.5 sm:p-4 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => switchSection('profile')}
                className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-teal-500/20 font-black text-lg flex-shrink-0 overflow-hidden border border-teal-400/40 hover:scale-105 transition-transform"
                title="تعديل الصورة والملف الأكاديمي"
              >
                {userProfile?.avatarUrl ? (
                  <img
                    src={userProfile.avatarUrl}
                    alt={displayNameArabic}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Stethoscope className="w-5 h-5" />
                )}
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="font-extrabold text-sm sm:text-base text-[var(--text-primary)]">
                    د. {userProfile?.displayNameArabic || displayNameArabic}
                  </h2>
                  {userProfile?.username && (
                    <span
                      className="px-2 py-0.5 rounded-md bg-teal-500/15 text-teal-400 border border-teal-500/30 text-[11px] font-mono font-bold tabular-nums"
                      dir="ltr"
                    >
                      @{userProfile.username}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border tabular-nums ${
                    isInternship 
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' 
                      : 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                  }`}>
                    {isInternship ? 'سنة الامتياز السريرية' : `دفعة المستوى ${activeEnrollment.currentStudyLevelId.replace('lvl-', '')}`}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mt-0.5">
                  {currentUniversityName} · {currentSpecialtyArabic}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activeEnrollment.universityId}
                onChange={(e) => handleQuickUniversityChange(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold focus:outline-none focus:border-teal-500 max-w-[180px] truncate"
                title="تغيير الجامعة"
              >
                {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                  <option key={u.id} value={u.id}>{u.nameArabic}</option>
                ))}
              </select>

              <select
                value={activeEnrollment.currentStudyLevelId}
                onChange={(e) => handleQuickLevelChange(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-teal-400 text-xs font-bold focus:outline-none focus:border-teal-500 tabular-nums"
                title="تغيير المستوى الدراسي / الدفعة"
              >
                <option value="lvl-1">المستوى الأول (Year 1)</option>
                <option value="lvl-2">المستوى الثاني (Year 2)</option>
                <option value="lvl-3">المستوى الثالث (Year 3)</option>
                <option value="lvl-4">المستوى الرابع (Year 4)</option>
                <option value="lvl-5">المستوى الخامس (Year 5)</option>
                <option value="lvl-6">المستوى السادس (Year 6)</option>
                <option value="lvl-internship">سنة الامتياز السريرية</option>
              </select>

              <button
                type="button"
                onClick={() => switchSection('profile')}
                className="px-3 py-1.5 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/40 text-teal-400 text-xs font-bold transition-colors"
              >
                تعديل بياناتي
              </button>
            </div>
          </div>

          {showOptionalEnrollmentModal && uid && uid !== 'visitor' && (
            <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
              <RegisterEnrollment
                uid={uid}
                studentNameArabic={displayNameArabic}
                onEnrollmentComplete={(newEnr) => {
                  setEnrollment(newEnr);
                  setShowOptionalEnrollmentModal(false);
                  loadStudentData(false, newEnr);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* SECTION: MEDICAL LIBRARY (Lazy Loaded with RTL Skeleton) */}
      {internalTab === 'library' && (
        <React.Suspense
          fallback={
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6 space-y-4 animate-pulse" dir="rtl">
              <div className="h-5 w-48 bg-[var(--bg-elevated)] rounded-lg" />
              <div className="flex gap-2 overflow-hidden">
                <div className="h-9 w-28 bg-[var(--bg-elevated)] rounded-xl shrink-0" />
                <div className="h-9 w-28 bg-[var(--bg-elevated)] rounded-xl shrink-0" />
                <div className="h-9 w-28 bg-[var(--bg-elevated)] rounded-xl shrink-0" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="h-28 bg-[var(--bg-input)] rounded-xl" />
                <div className="h-28 bg-[var(--bg-input)] rounded-xl" />
              </div>
            </div>
          }
        >
          <StudentMedicalLibrary
            universityId={activeEnrollment.universityId}
            programId={activeEnrollment.programId}
            studyLevelId={activeEnrollment.currentStudyLevelId}
            studentNameArabic={displayNameArabic}
            initialCourseId={selectedCourseFilter?.id}
            initialCourseTitle={selectedCourseFilter?.title}
            onClearCourseFilter={() => setSelectedCourseFilter(null)}
          />
        </React.Suspense>
      )}

      {/* SECTION: ASSESSMENTS & COMPETITIONS (Lazy Loaded with RTL Skeleton) */}
      {internalTab === 'assessments' && (
        <React.Suspense
          fallback={
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6 space-y-4 animate-pulse" dir="rtl">
              <div className="h-5 w-52 bg-[var(--bg-elevated)] rounded-lg" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="h-32 bg-[var(--bg-input)] rounded-xl" />
                <div className="h-32 bg-[var(--bg-input)] rounded-xl" />
              </div>
            </div>
          }
        >
          <StudentAssessmentList
            universityId={activeEnrollment.universityId}
            studyLevelId={activeEnrollment.currentStudyLevelId}
            uid={uid || 'visitor'}
            studentNameArabic={displayNameArabic}
            initialAssessmentType={assessmentNavTarget?.assessmentType}
            highlightedAssessmentId={assessmentNavTarget?.assessmentId}
            navigationTimestamp={assessmentNavTarget?.timestamp}
          />
        </React.Suspense>
      )}

      {/* SECTION: STUDY DASHBOARD (Batch Notifications, Blocks, Courses & Doctors) */}
      {internalTab === 'study' && (
        <div className="space-y-4">

          {/* BATCH NOTIFICATIONS & SHARED DATA FROM BATCH REP / ADMIN */}
          {batchNotifications.length > 0 && (
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] tabular-nums">
                    إشعارات الدفعة والبيانات المشتركة ({batchNotifications.length})
                  </h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-semibold">
                  مخصص لدفعتك فقط
                </span>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {batchNotifications.slice(0, 6).map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all hover:border-teal-500/40 cursor-pointer ${
                      notif.category === 'urgent'
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : notif.category === 'exam'
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-[var(--bg-input)] border-[var(--border-color)]'
                    }`}
                    onClick={() => setActiveBatchNotifModal(notif)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            notif.category === 'urgent'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              : notif.category === 'exam'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
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
                        <h4 className="font-bold text-[var(--text-primary)] text-xs sm:text-sm">{notif.title}</h4>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums">
                        {new Date(notif.createdAt).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <p className="text-[var(--text-secondary)] leading-relaxed line-clamp-2">{notif.message}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[var(--border-color)] text-[11px]">
                      <span className="text-[var(--text-muted)]">
                        المرسل: <strong className="text-teal-400">{notif.authorNameArabic}</strong>
                      </span>

                      <div className="flex items-center gap-2">
                        {notif.attachmentUrl && (
                          <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-400 border border-teal-500/30 text-[10px] font-bold">
                            يحتوي مرفقاً 📎
                          </span>
                        )}
                        <span className="text-teal-400 font-bold text-[11px] flex items-center gap-1">
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
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-[var(--text-muted)] block tabular-nums">
                  البلوك الدراسي النشط حالياً في دفعتك ({studyPeriods.length} بلوكات متاحة):
                </span>
                <button
                  type="button"
                  onClick={() => setShowBlockPopup(true)}
                  className="mt-1 text-sm sm:text-base font-black text-[var(--text-primary)] hover:text-teal-400 flex items-center gap-2 transition-colors text-right"
                >
                  <span>{selectedPeriod ? `${selectedPeriod.titleArabic} (${selectedPeriod.code})` : 'اختر البلوك الدراسي'}</span>
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-teal-600 border border-[var(--border-color)] text-teal-400 hover:text-white text-xs font-bold transition-colors">
                    تبديل البلوك ▾
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowBlockPopup(true)}
                className="px-3.5 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-teal-400 text-xs font-bold transition-colors tabular-nums"
              >
                عرض جميع البلوكات ({studyPeriods.length})
              </button>
            </div>
          )}

          {/* Standalone Popup Modal for Selecting Study Block */}
          {showBlockPopup && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
              <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full max-h-[85dvh] flex flex-col shadow-2xl my-auto overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-input)]">
                  <div>
                    <h3 className="text-sm font-black text-[var(--text-primary)] tabular-nums">اختيار البلوك الدراسي ({studyPeriods.length})</h3>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">اختر البلوك لعرض مقرراته ومحاضراته الخاصة بدفعتك</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBlockPopup(false)}
                    className="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold"
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
                            ? 'bg-teal-500/15 border-teal-500 text-[var(--text-primary)] font-bold shadow-sm'
                            : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-teal-500/40'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-bold text-[var(--text-primary)]">{period.titleArabic}</div>
                          <div className="text-[11px] text-[var(--text-muted)]" dir="ltr">{period.titleEnglish}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] text-teal-400 font-mono text-[11px] tabular-nums">
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
          <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-color)]">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>المقررات ودكاترة المواد (النظري والعملي)</span>
                  {selectedPeriod && <span className="text-xs text-teal-400 font-mono">({selectedPeriod.titleArabic})</span>}
                </h3>
                <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mt-0.5">
                  استعراض المحاضرات النظرية والتدريب العملي ودكاترة كل مادة في دفعتك
                </p>
              </div>
              <button
                onClick={() => switchSection('library')}
                className="px-3 py-1.5 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 text-teal-400 border border-teal-500/30 text-xs font-bold transition-colors shrink-0"
              >
                فتح المكتبة الرقمية
              </button>
            </div>

            {courses.length === 0 ? (
              <div className="text-center py-6 text-[var(--text-muted)] text-xs">
                <p>
                  {studyPeriods.length === 0
                    ? 'لم تقم الإدارة أو مندوب الدفعة بإنشاء بلوكات أو مقررات دراسية لهذا المستوى بعد. ستظهر هنا تلقائياً فور إضافتها.'
                    : 'لم تتم إضافة مقررات مخصصة لهذا البلوك بعد. يمكنك الوصول إلى محاضرات وشرائح وفيديوهات البلوك عبر زر «فتح المكتبة الرقمية» أعلاه.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {courses.map((course) => {
                  const courseDoctors = instructors.filter(i => i.courseOfferingId === course.id);
                  const courseLecturesCount = levelResources.filter(r => r.courseOfferingId === course.id).length;
                  const courseExamsCount = levelAssessments.filter(a => a.courseOfferingId === course.id).length;
                  return (
                    <div
                      key={course.id}
                      onClick={() => {
                        setSelectedCourseFilter({ id: course.id, title: course.titleArabic });
                        switchSection('library');
                      }}
                      className="cursor-pointer p-4 bg-[var(--bg-input)] text-[var(--text-primary)] rounded-xl border border-[var(--border-color)] text-xs space-y-2.5 hover:border-teal-500/50 transition-colors overflow-hidden flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-mono text-teal-400 font-bold px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] tabular-nums">
                            {course.code}
                          </span>
                          <span className="text-[var(--text-muted)] text-[11px] font-mono tabular-nums">{course.creditHours ?? 3} ساعات</span>
                        </div>

                        <div>
                          <div className="font-bold text-[var(--text-primary)] text-sm">{course.titleArabic}</div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5" dir="ltr">{course.titleEnglish}</div>
                        </div>

                        {/* Clean Hairline-Separated Instructors Strip (No Nested Card Box) */}
                        {(courseDoctors.length > 0 || course.instructorNameArabic) ? (
                          <div className="py-2 border-y border-[var(--border-color)] space-y-1.5">
                            {course.instructorNameArabic && !courseDoctors.some(d => `${d.academicTitle || 'د.'} ${d.instructorNameArabic}`.trim() === course.instructorNameArabic?.trim() || d.instructorNameArabic.trim() === course.instructorNameArabic?.trim()) && (
                              <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                                <span className="text-[var(--text-primary)] font-bold inline-flex items-center gap-1.5">
                                  <Stethoscope className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                  <span>{course.instructorNameArabic}</span>
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30">
                                  مدرس المقرر
                                </span>
                              </div>
                            )}
                            {courseDoctors.map(docItem => (
                              <div key={docItem.id} className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                                <span className="text-[var(--text-primary)] font-bold inline-flex items-center gap-1.5">
                                  <Stethoscope className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                  <span>{docItem.academicTitle || 'د.'} {docItem.instructorNameArabic}</span>
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                  docItem.teachingType === 'theoretical'
                                    ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                                    : docItem.teachingType === 'practical'
                                    ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
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
                        ) : (
                          <div className="py-2 border-y border-[var(--border-color)] text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                            <Stethoscope className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            <span>هيئة التدريس بالكلية</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-teal-500/15 border border-teal-500/30 text-teal-400 text-[10px] font-bold">
                            {courseLecturesCount > 0 ? `${courseLecturesCount} محاضرات / ملفات` : 'محاضرات المادة'}
                          </span>
                          {courseExamsCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                              {courseExamsCount} اختبارات
                            </span>
                          )}
                        </div>

                        <span className="text-teal-400 font-bold flex items-center gap-1 text-[10px]">
                          <span>فتح محاضرات المادة</span>
                          <ChevronRight className="w-3 h-3 rotate-180" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Access to Exams & Competitions */}
          <div className="umed-card p-4 sm:p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl text-xs flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                <span>الاختبارات الدورية والمسابقات الطبية التفاعلية</span>
              </span>
              <p className="text-[var(--text-secondary)] leading-relaxed text-[11px]">
                ابدأ اختبارات البلوكات والمسابقات السريرية المخصصة لدفعتك في {currentUniversityName} مع التصحيح الفوري وتحميل ملف الاختبار بعد الانتهاء.
              </p>
            </div>
            <button
              onClick={() => switchSection('assessments')}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors shadow-md flex items-center gap-2 shrink-0"
            >
              <span>عرض وبدء الاختبارات الآن</span>
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
          </div>

        </div>
      )}

      {/* Detailed Batch Notification Sheet Modal */}
      {activeBatchNotifModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] sm:rounded-2xl rounded-t-2xl max-w-lg w-full max-h-[88dvh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:fade-in duration-200">
            {/* Header */}
            <div className="p-4 bg-[var(--bg-input)] border-b border-[var(--border-color)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    activeBatchNotifModal.category === 'urgent'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      : activeBatchNotifModal.category === 'exam'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
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
                <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{activeBatchNotifModal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveBatchNotifModal(null)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pb-2 border-b border-[var(--border-color)]">
                <span>
                  المرسل: <strong className="text-teal-400 font-semibold">{activeBatchNotifModal.authorNameArabic}</strong>
                </span>
                <span className="font-mono text-[var(--text-muted)] tabular-nums">
                  {new Date(activeBatchNotifModal.createdAt).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              </div>

              <div className="bg-[var(--bg-input)] p-4 rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                {activeBatchNotifModal.message}
              </div>

              {activeBatchNotifModal.attachmentUrl && (
                <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/30 space-y-2">
                  <div className="text-[11px] font-bold text-teal-400 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-teal-400" />
                    <span>الملف أو الرابط المرفق مع هذا الإشعار:</span>
                  </div>
                  <button
                    type="button"
                    disabled={downloadingNotifId === activeBatchNotifModal.id}
                    onClick={() => handleOpenNotificationAttachment(activeBatchNotifModal)}
                    className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all"
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
            <div className="p-3.5 bg-[var(--bg-input)] border-t border-[var(--border-color)] flex justify-end">
              <button
                type="button"
                onClick={() => setActiveBatchNotifModal(null)}
                className="py-2 px-5 rounded-xl bg-[var(--bg-elevated)] hover:opacity-90 border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-semibold"
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
