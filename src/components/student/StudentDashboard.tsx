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
  FileText, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Stethoscope,
  Trophy,
  Bell,
  ExternalLink,
  Download,
  X,
  Layers,
  FlaskConical,
  Eye,
  GraduationCap
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
import { useAuth } from '../../context/AuthContext.tsx';
import { YEMEN_UNIVERSITIES_OPTIONS } from '../../lib/firebase.ts';
import ResourcePreviewModal from '../library/ResourcePreviewModal.tsx';

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

type CourseSubTab = 'lectures' | 'clinical_refs' | 'assessments';

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

  // Collapsible Batch Posts & Expanded Course Sub-Tabs States
  const [isBatchPostsCollapsed, setIsBatchPostsCollapsed] = useState<boolean>(false);
  const [showAllBatchPosts, setShowAllBatchPosts] = useState<boolean>(false);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [activeCourseSubTab, setActiveCourseSubTab] = useState<Record<string, CourseSubTab>>({});
  const [previewResourceModal, setPreviewResourceModal] = useState<EducationalResource | null>(null);
  const [localAssessmentJump, setLocalAssessmentJump] = useState<{
    assessmentType?: 'exam' | 'competition';
    assessmentId?: string;
    timestamp?: number;
  } | null>(null);

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

  // Auto-expand first course if none is expanded when courses load
  useEffect(() => {
    if (courses.length > 0 && (!expandedCourseId || !courses.some(c => c.id === expandedCourseId))) {
      setExpandedCourseId(courses[0].id);
    }
  }, [courses]);

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
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-12 text-center text-xs text-[var(--text-muted)]">
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
  const currentLevelLabel = isInternship
    ? 'سنة الامتياز السريرية'
    : `المستوى ${activeEnrollment.currentStudyLevelId.replace('lvl-', '')}`;

  const effectiveAssessmentTarget = localAssessmentJump || assessmentNavTarget;

  return (
    <div className="space-y-4">
      
      {/* 1A. Compact 1-Line Contextual Strip for 'library' or 'assessments' so content starts immediately at the top */}
      {(internalTab === 'library' || internalTab === 'assessments') && (
        <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs shadow-sm">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <GraduationCap className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="font-bold text-[var(--text-primary)] truncate">{currentUniversityName}</span>
            <span className="text-[var(--text-muted)] shrink-0">·</span>
            <span className="px-2 py-0.5 rounded-md bg-teal-500/15 text-teal-400 border border-teal-500/30 font-bold text-[11px] shrink-0 tabular-nums">
              {currentLevelLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={activeEnrollment.universityId}
              onChange={(e) => handleQuickUniversityChange(e.target.value)}
              className="hidden sm:block px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-[11px] font-bold focus:outline-none focus:border-teal-500 max-w-[155px] truncate"
              title="تغيير الجامعة"
            >
              {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                <option key={u.id} value={u.id}>{u.nameArabic}</option>
              ))}
            </select>

            <select
              value={activeEnrollment.currentStudyLevelId}
              onChange={(e) => handleQuickLevelChange(e.target.value)}
              className="px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-teal-400 text-[11px] font-bold focus:outline-none focus:border-teal-500 tabular-nums"
              title="تغيير المستوى الدراسي"
            >
              <option value="lvl-1">المستوى 1</option>
              <option value="lvl-2">المستوى 2</option>
              <option value="lvl-3">المستوى 3</option>
              <option value="lvl-4">المستوى 4</option>
              <option value="lvl-5">المستوى 5</option>
              <option value="lvl-6">المستوى 6</option>
              <option value="lvl-internship">الامتياز</option>
            </select>
          </div>
        </div>
      )}

      {/* 1B. Full Welcome Banner with Merged 4-Metric Indicator Strip — Shown ONLY on the main 'study' tab */}
      {internalTab === 'study' && (
        <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-3.5 sm:p-4 shadow-sm overflow-hidden space-y-3">
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
                <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mt-0.5 truncate">
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

          {/* Merged 4-Metric Indicator Strip inside the Welcome Banner */}
          <div className="pt-2.5 border-t border-[var(--border-color)] grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
            <button
              type="button"
              onClick={() => studyPeriods.length > 0 && setShowBlockPopup(true)}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] transition-colors text-right"
            >
              <span className="text-[11px] text-[var(--text-muted)] font-semibold">البلوكات الدراسية</span>
              <span className="font-mono font-extrabold text-teal-400 text-sm">{studyPeriods.length}</span>
            </button>

            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
              <span className="text-[11px] text-[var(--text-muted)] font-semibold">مقررات البلوك</span>
              <span className="font-mono font-extrabold text-emerald-400 text-sm">{courses.length}</span>
            </div>

            <button
              type="button"
              onClick={() => switchSection('library')}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] transition-colors text-right"
            >
              <span className="text-[11px] text-[var(--text-muted)] font-semibold">المحاضرات والمراجع</span>
              <span className="font-mono font-extrabold text-sky-400 text-sm">{levelResources.length}</span>
            </button>

            <button
              type="button"
              onClick={() => switchSection('assessments')}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] transition-colors text-right"
            >
              <span className="text-[11px] text-[var(--text-muted)] font-semibold">الاختبارات والمسابقات</span>
              <span className="font-mono font-extrabold text-amber-400 text-sm">{levelAssessments.length}</span>
            </button>
          </div>
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
            initialAssessmentType={effectiveAssessmentTarget?.assessmentType}
            highlightedAssessmentId={effectiveAssessmentTarget?.assessmentId}
            navigationTimestamp={effectiveAssessmentTarget?.timestamp}
          />
        </React.Suspense>
      )}

      {/* SECTION: STUDY DASHBOARD (Batch Notifications, Blocks, Courses & 3 Sub-Tabs per Course) */}
      {internalTab === 'study' && (
        <div className="space-y-4">

          {/* COLLAPSIBLE BATCH NOTIFICATIONS (Shows latest 2 posts by default + "عرض كل المنشورات") */}
          {batchNotifications.length > 0 && (
            <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsBatchPostsCollapsed(prev => !prev)}
                  className="flex items-center gap-2 text-right group"
                >
                  <Bell className="w-4 h-4 text-amber-400 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] group-hover:text-teal-400 transition-colors tabular-nums">
                    منشورات وإشعارات الدفعة ({batchNotifications.length})
                  </h3>
                  {isBatchPostsCollapsed ? (
                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                </button>

                <div className="flex items-center gap-2">
                  {!isBatchPostsCollapsed && batchNotifications.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setShowAllBatchPosts(prev => !prev)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 border border-teal-500/30 font-bold transition-colors tabular-nums"
                    >
                      {showAllBatchPosts ? 'عرض آخر منشورين فقط' : `عرض كل المنشورات (${batchNotifications.length})`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsBatchPostsCollapsed(prev => !prev)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-color)] font-semibold transition-colors"
                  >
                    {isBatchPostsCollapsed ? 'فتح المنشورات' : 'طي القسم'}
                  </button>
                </div>
              </div>

              {!isBatchPostsCollapsed && (
                <div className="space-y-2.5 pt-2 border-t border-[var(--border-color)] max-h-80 overflow-y-auto pr-1">
                  {(showAllBatchPosts ? batchNotifications : batchNotifications.slice(0, 2)).map((notif) => (
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
                              : 'منشور الدفعة'}
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
                            <span>عرض التفاصيل</span>
                            <ChevronRight className="w-3 h-3 rotate-180" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

          {/* Courses Grid with Expandable 3 Compact Sub-Tabs: [المحاضرات | الداتا السريرية والمراجع | الاختبارات والمسابقات] */}
          <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-color)]">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>المقررات الدراسية ومحتوياتها المقسمة</span>
                  {selectedPeriod && <span className="text-xs text-teal-400 font-mono">({selectedPeriod.titleArabic})</span>}
                </h3>
                <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mt-0.5">
                  اضغط على أي مقرر لتصفح تبويباته الثلاثة: المحاضرات، الداتا السريرية والمراجع، والاختبارات والمسابقات
                </p>
              </div>
              <button
                onClick={() => switchSection('library')}
                className="px-3 py-1.5 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 text-teal-400 border border-teal-500/30 text-xs font-bold transition-colors shrink-0"
              >
                فتح المكتبة الرقمية الشاملة
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
              <div className="space-y-3">
                {courses.map((course) => {
                  const isExpanded = expandedCourseId === course.id;
                  const currentSubTab: CourseSubTab = activeCourseSubTab[course.id] || 'lectures';

                  const courseDoctors = instructors.filter(i => i.courseOfferingId === course.id);
                  const courseAllResources = levelResources.filter(r => r.courseOfferingId === course.id);

                  // 1) Lectures (theoretical & general PDF/audio/video lectures)
                  const courseLectures = courseAllResources.filter(
                    r => !r.sectionType || r.sectionType === 'theoretical' || r.sectionType === 'general'
                  );
                  // 2) Clinical Data & References (practical/lab slides, links, references)
                  const courseClinicalRefs = courseAllResources.filter(
                    r => r.sectionType === 'practical' || r.resourceType === 'image' || r.resourceType === 'link'
                  );
                  // 3) Assessments & Competitions for this course (or level-wide if courseOfferingId matches or not set)
                  const courseAssessments = levelAssessments.filter(
                    a => a.courseOfferingId === course.id || !a.courseOfferingId
                  );

                  return (
                    <div
                      key={course.id}
                      className={`p-4 bg-[var(--bg-input)] text-[var(--text-primary)] rounded-2xl border text-xs transition-all overflow-hidden ${
                        isExpanded
                          ? 'border-teal-500/60 shadow-md'
                          : 'border-[var(--border-color)] hover:border-teal-500/40'
                      }`}
                    >
                      {/* Course Card Header (Click to toggle open/close) */}
                      <div
                        onClick={() => setExpandedCourseId(isExpanded ? null : course.id)}
                        className="cursor-pointer flex flex-wrap items-start justify-between gap-3"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-teal-400 font-bold px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] tabular-nums">
                              {course.code}
                            </span>
                            <span className="text-[var(--text-muted)] text-[11px] font-mono tabular-nums">
                              {course.creditHours ?? 3} ساعات معتمدة
                            </span>
                            {courseDoctors.length > 0 || course.instructorNameArabic ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-teal-400 font-bold">
                                <Stethoscope className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  {course.instructorNameArabic ||
                                    courseDoctors.map(d => `${d.academicTitle || 'د.'} ${d.instructorNameArabic}`).join(' ، ')}
                                </span>
                              </span>
                            ) : null}
                          </div>

                          <div>
                            <h4 className="font-extrabold text-[var(--text-primary)] text-sm sm:text-base">{course.titleArabic}</h4>
                            {course.titleEnglish && (
                              <div className="text-[11px] text-[var(--text-muted)]" dir="ltr">{course.titleEnglish}</div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 text-[11px] font-bold tabular-nums">
                            {courseAllResources.length} ملفات
                          </span>
                          <button
                            type="button"
                            className="p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)]"
                            aria-label="توسيع أو طي المقرر"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Inside Opened Course Card: 3 Compact Sub-Tabs */}
                      {isExpanded && (
                        <div className="mt-4 pt-3.5 border-t border-[var(--border-color)] space-y-3">
                          {/* 3 Compact Sub-Tabs Switcher */}
                          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                            <button
                              type="button"
                              onClick={() => setActiveCourseSubTab(prev => ({ ...prev, [course.id]: 'lectures' }))}
                              className={`py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 tabular-nums ${
                                currentSubTab === 'lectures'
                                  ? 'bg-teal-600 text-white shadow-sm'
                                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">المحاضرات ({courseLectures.length})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setActiveCourseSubTab(prev => ({ ...prev, [course.id]: 'clinical_refs' }))}
                              className={`py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 tabular-nums ${
                                currentSubTab === 'clinical_refs'
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <FlaskConical className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">الداتا السريرية والمراجع ({courseClinicalRefs.length})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setActiveCourseSubTab(prev => ({ ...prev, [course.id]: 'assessments' }))}
                              className={`py-2 px-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 tabular-nums ${
                                currentSubTab === 'assessments'
                                  ? 'bg-amber-600 text-white shadow-sm'
                                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <Trophy className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">الاختبارات والمسابقات ({courseAssessments.length})</span>
                            </button>
                          </div>

                          {/* Sub-Tab 1: Lectures */}
                          {currentSubTab === 'lectures' && (
                            <div className="space-y-2">
                              {courseLectures.length === 0 ? (
                                <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-center text-[var(--text-muted)] text-xs">
                                  لا توجد محاضرات نظرية مرفوعة لهذا المقرر حالياً.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {courseLectures.slice(0, 6).map((res) => (
                                    <div
                                      key={res.id}
                                      onClick={() => setPreviewResourceModal(res)}
                                      className="p-3 rounded-xl bg-[var(--bg-card)] hover:border-teal-500/50 border border-[var(--border-color)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="w-4 h-4 text-teal-400 shrink-0" />
                                        <div className="min-w-0">
                                          <div className="font-bold text-[var(--text-primary)] truncate">{res.title}</div>
                                          <div className="text-[10px] text-[var(--text-muted)] font-mono">
                                            {res.fileSizeLabel || 'PDF'} · محاضرة
                                          </div>
                                        </div>
                                      </div>
                                      <span className="px-2.5 py-1 rounded-lg bg-teal-600/15 text-teal-400 text-[11px] font-bold shrink-0 flex items-center gap-1">
                                        <Eye className="w-3 h-3" />
                                        <span>معاينة</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCourseFilter({ id: course.id, title: course.titleArabic });
                                    switchSection('library');
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                                >
                                  <span>عرض كافة محاضرات {course.titleArabic} في المكتبة</span>
                                  <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Sub-Tab 2: Clinical Data & References */}
                          {currentSubTab === 'clinical_refs' && (
                            <div className="space-y-2">
                              {courseClinicalRefs.length === 0 ? (
                                <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-center text-[var(--text-muted)] text-xs">
                                  لا توجد داتا سريرية أو شرائح معملية مضافة لهذا المقرر بعد.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {courseClinicalRefs.slice(0, 6).map((res) => (
                                    <div
                                      key={res.id}
                                      onClick={() => setPreviewResourceModal(res)}
                                      className="p-3 rounded-xl bg-[var(--bg-card)] hover:border-indigo-500/50 border border-[var(--border-color)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                                        <div className="min-w-0">
                                          <div className="font-bold text-[var(--text-primary)] truncate">{res.title}</div>
                                          <div className="text-[10px] text-[var(--text-muted)]">
                                            {res.sectionType === 'practical' ? 'عملي / سريري' : 'مرجع طبي'} · {res.fileSizeLabel || 'ملف'}
                                          </div>
                                        </div>
                                      </div>
                                      <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 text-[11px] font-bold shrink-0 flex items-center gap-1">
                                        <Eye className="w-3 h-3" />
                                        <span>فتح</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCourseFilter({ id: course.id, title: course.titleArabic });
                                    switchSection('library');
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                                >
                                  <span>فتح المراجع والشرائح العملية في المكتبة</span>
                                  <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Sub-Tab 3: Assessments & Competitions */}
                          {currentSubTab === 'assessments' && (
                            <div className="space-y-2">
                              {courseAssessments.length === 0 ? (
                                <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-center text-[var(--text-muted)] text-xs">
                                  لا توجد اختبارات أو مسابقات منشورة لهذا المقرر حالياً.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {courseAssessments.slice(0, 4).map((asmnt) => (
                                    <div
                                      key={asmnt.id}
                                      onClick={() => {
                                        setLocalAssessmentJump({
                                          assessmentType: asmnt.assessmentType,
                                          assessmentId: asmnt.id,
                                          timestamp: Date.now()
                                        });
                                        switchSection('assessments');
                                      }}
                                      className="p-3 rounded-xl bg-[var(--bg-card)] hover:border-amber-500/50 border border-[var(--border-color)] flex items-center justify-between gap-2 cursor-pointer transition-colors"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                                        <div className="min-w-0">
                                          <div className="font-bold text-[var(--text-primary)] truncate">{asmnt.titleArabic}</div>
                                          <div className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums">
                                            {asmnt.assessmentType === 'competition' ? 'مسابقة تنافسية' : 'اختبار مقرر'} · {asmnt.totalPoints} نقطة
                                          </div>
                                        </div>
                                      </div>
                                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 text-[11px] font-bold shrink-0">
                                        بدء الحل
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => switchSection('assessments')}
                                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                                >
                                  <span>الانتقال لمركز الاختبارات والمسابقات</span>
                                  <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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

      {/* Direct Resource Preview Modal when opened from inside a Course Sub-Tab */}
      {previewResourceModal && (
        <ResourcePreviewModal
          resource={previewResourceModal}
          onClose={() => setPreviewResourceModal(null)}
        />
      )}

    </div>
  );
}
