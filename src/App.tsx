/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED — Yemen-First Medical Education Platform
 * Production Application Entry & Role-Isolated Console with RTL Sidebar Navigation
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, FileText, X } from 'lucide-react';
import { useAuth } from './context/AuthContext.tsx';
import { AuditLog, StudentEnrollment, Assessment, AssessmentQuestionPublic, AssessmentResult } from './types/umed.ts';
import { fetchMergedAuditLogs, isPrimaryOwnerEmail } from './lib/firebase.ts';
import { fetchStudentEnrollment, subscribeToStudentEnrollment } from './services/enrollmentService.ts';
import { startAcademicRealtimeSync } from './services/academicService.ts';
import { subscribeToAppNotifications } from './services/notificationService.ts';
import {
  getSharedAssessmentIdFromUrl,
  clearSharedAssessmentIdFromUrl,
  fetchSharedAssessmentForGuest,
  getCachedSharedAssessmentSync,
  getPendingGuestExamSubmission,
  claimAndGradePendingGuestSubmission,
  getAssessmentLeaderboard,
  PendingGuestExamSubmission
} from './services/assessmentService.ts';
import StudentDashboard from './components/student/StudentDashboard.tsx';
import GlobalNotificationWatcher from './components/notifications/GlobalNotificationWatcher.tsx';
import NotificationCenterModal from './components/notifications/NotificationCenterModal.tsx';
import {
  PlatformBrandingAndPolicies,
  getCachedPlatformSettings,
  subscribeToPlatformSettings
} from './services/platformSettingsService.ts';
import { PlatformLegalAndContactModal } from './components/settings/PlatformOwnerSettingsModalAndCard.tsx';
import {
  ActiveTabType,
  UmedTheme,
  WorkspaceSidebar,
  WorkspaceTopHeader,
  MobileBottomTabBar
} from './components/navigation/WorkspaceShellNav.tsx';
import { ClaimedGuestResultModal } from './components/assessment/ClaimedGuestResultModal.tsx';
import StudentOnboardingGate, { ArchivedAccountGate } from './components/auth/StudentOnboardingGate.tsx';
import AccountAndAppearanceView from './components/settings/AccountAndAppearanceView.tsx';

// Lazy-load secondary student views & heavy modals
const ExamTakingModal = React.lazy(() => import('./components/assessment/ExamTakingModal.tsx'));
const StudentProfile = React.lazy(() => import('./components/student/StudentProfile.tsx'));

// Code-splitting admin heavy modules to minimize student initial bundle size
const AcademicStructureManager = React.lazy(() => import('./components/admin/AcademicStructureManager.tsx'));
const EnrollmentApprovalManager = React.lazy(() => import('./components/admin/EnrollmentApprovalManager.tsx'));
const EducationalContentManager = React.lazy(() => import('./components/admin/EducationalContentManager.tsx'));
const AssessmentManager = React.lazy(() => import('./components/admin/AssessmentManager.tsx'));
const BackupRestoreConsole = React.lazy(() => import('./components/admin/BackupRestoreConsole.tsx'));
const HierarchyGovernanceConsole = React.lazy(() => import('./components/admin/HierarchyGovernanceConsole.tsx'));
const PlatformUsersManager = React.lazy(() => import('./components/admin/PlatformUsersManager.tsx'));

export default function App() {
  const {
    user,
    roleDoc,
    userProfile,
    loading,
    logout,
    activeRole,
    realRole,
    setActiveRole,
    isAuthorizedAdmin,
    isAccountArchived
  } = useAuth();

  const [theme, setThemeState] = useState<UmedTheme>(() => {
    try {
      const saved = localStorage.getItem('umed-theme') as UmedTheme | null;
      if (saved === 'medical' || saved === 'gold' || saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {}
    return 'medical';
  });

  const isDarkMode = theme === 'dark' || theme === 'gold';

  const setTheme = (nextTheme: UmedTheme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem('umed-theme', nextTheme);
    } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove('dark', 'theme-light', 'theme-vibrant', 'theme-midnight');
    document.body.classList.remove('theme-light');
    if (theme === 'dark' || theme === 'gold') {
      document.documentElement.classList.add('dark');
    }
    try {
      localStorage.setItem('umed-theme', theme);
    } catch {}
  }, [theme]);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [studentEnrollment, setStudentEnrollment] = useState<StudentEnrollment | null>(null);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);
  const [targetAssessmentNav, setTargetAssessmentNav] = useState<{
    assessmentType?: 'exam' | 'competition';
    assessmentId?: string;
    timestamp?: number;
  } | null>(null);

  // Shared Trial Exam & Guest Mandatory Account Gate States (Hydrated synchronously in 0ms on mount)
  const [pendingGuestSubmission, setPendingGuestSubmission] = useState<PendingGuestExamSubmission | null>(() =>
    getPendingGuestExamSubmission()
  );
  const [sharedGuestData, setSharedGuestData] = useState<{
    assessment: Assessment;
    questions: AssessmentQuestionPublic[];
  } | null>(() => {
    const initialSharedId = getSharedAssessmentIdFromUrl() || getPendingGuestExamSubmission()?.assessmentId;
    return initialSharedId ? getCachedSharedAssessmentSync(initialSharedId) : null;
  });
  const [isGuestExamOpen, setIsGuestExamOpen] = useState<boolean>(() => {
    const urlId = getSharedAssessmentIdFromUrl();
    if (!urlId) return false;
    const existingSub = getPendingGuestExamSubmission();
    if (existingSub && existingSub.assessmentId === urlId) return false;
    return true;
  });
  const [isSharedExamFetching, setIsSharedExamFetching] = useState<boolean>(false);
  const [claimedGuestOutcome, setClaimedGuestOutcome] = useState<{
    result: AssessmentResult;
    assessment: Assessment;
  } | null>(null);
  const [claimedLeaderboard, setClaimedLeaderboard] = useState<AssessmentResult[]>([]);

  // Global Platform Branding, Terms/Privacy & Contact Settings
  const [platformSettings, setPlatformSettings] = useState<PlatformBrandingAndPolicies>(() =>
    getCachedPlatformSettings()
  );
  const [legalContactModalState, setLegalContactModalState] = useState<{
    isOpen: boolean;
    initialTab: 'terms' | 'privacy' | 'contact';
  }>({ isOpen: false, initialTab: 'contact' });

  useEffect(() => {
    const unsub = subscribeToPlatformSettings((updated) => {
      setPlatformSettings(updated);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeToAppNotifications((list) => {
      const unread = list.filter((n) => !n.read).length;
      setUnreadNotificationCount(unread);
    });
    return () => unsub();
  }, []);

  // Load and open shared assessment link (?sharedAssessmentId=... or #sharedAssessmentId=...)
  const loadAndOpenSharedAssessment = async (targetId: string, forceOpenModal = true) => {
    if (!targetId) return;
    const syncCached = getCachedSharedAssessmentSync(targetId);
    if (syncCached) {
      setSharedGuestData(syncCached);
    } else {
      setIsSharedExamFetching(true);
    }
    if (forceOpenModal) {
      setIsGuestExamOpen(true);
    }

    try {
      const loaded = await fetchSharedAssessmentForGuest(targetId);
      if (loaded) {
        setSharedGuestData(loaded);
        const existingSub = getPendingGuestExamSubmission();
        if (!user && existingSub && existingSub.assessmentId === targetId && !forceOpenModal) {
          setPendingGuestSubmission(existingSub);
        } else if (forceOpenModal) {
          setIsGuestExamOpen(true);
        }
      }
    } catch {} finally {
      setIsSharedExamFetching(false);
    }
  };

  useEffect(() => {
    const urlId = getSharedAssessmentIdFromUrl();
    const fallbackId = pendingGuestSubmission?.assessmentId;
    const sharedId = urlId || fallbackId;
    if (!sharedId) return;

    const existingSub = getPendingGuestExamSubmission();
    const shouldAutoOpen = Boolean(urlId) && (!existingSub || existingSub.assessmentId !== urlId || Boolean(user));
    loadAndOpenSharedAssessment(sharedId, shouldAutoOpen);
  }, [user?.uid]);

  useEffect(() => {
    const handleUrlChange = () => {
      const urlId = getSharedAssessmentIdFromUrl();
      if (urlId) {
        loadAndOpenSharedAssessment(urlId, true);
      }
    };
    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  // Automatically grade pending guest trial submission as soon as the user creates an account or logs in
  useEffect(() => {
    if (!user?.uid) return;
    const pending = getPendingGuestExamSubmission();
    if (!pending) return;

    const studentName =
      userProfile?.displayNameArabic ||
      user.displayName ||
      'طالب طب بشري';

    claimAndGradePendingGuestSubmission(user.uid, studentName).then((claimed) => {
      if (claimed) {
        setPendingGuestSubmission(null);
        setClaimedGuestOutcome(claimed);
        getAssessmentLeaderboard(claimed.assessment.id)
          .then((lb) => setClaimedLeaderboard(lb))
          .catch(() => {});
        setTargetAssessmentNav({
          assessmentType: claimed.assessment.assessmentType === 'competition' ? 'competition' : 'exam',
          assessmentId: claimed.assessment.id,
          timestamp: Date.now()
        });
      }
    });
  }, [user?.uid, userProfile?.displayNameArabic]);

  const [activeTab, setActiveTabState] = useState<ActiveTabType>(() => {
    try {
      const savedLocal = localStorage.getItem('umed_active_tab') as ActiveTabType | null;
      if (savedLocal) return savedLocal;
      const savedSession = sessionStorage.getItem('umed_active_tab') as ActiveTabType | null;
      if (savedSession) return savedSession;
    } catch {}
    return 'student_dashboard';
  });

  const setActiveTab = (tab: ActiveTabType) => {
    setActiveTabState(tab);
    setSidebarOpen(false);
    try {
      localStorage.setItem('umed_active_tab', tab);
      sessionStorage.setItem('umed_active_tab', tab);
    } catch {}
  };

  const isAdminMode = Boolean(isAuthorizedAdmin && activeRole !== 'student');
  const isStrictPlatformOwner = Boolean(
    isAuthorizedAdmin &&
      (realRole === 'platform_owner' ||
        roleDoc?.role === 'platform_owner' ||
        isPrimaryOwnerEmail(user?.email) ||
        userProfile?.isPrimaryOwner)
  );
  const isOwnerMode = Boolean(isAuthorizedAdmin && activeRole === 'platform_owner' && realRole === 'platform_owner');
  const isUniversityAdminOrOwner = Boolean(
    isAuthorizedAdmin && (activeRole === 'platform_owner' || activeRole === 'university_admin' || activeRole === 'batch_rep')
  );

  const refreshAdminData = async () => {
    if (!isAuthorizedAdmin) return;
    try {
      const logs = await fetchMergedAuditLogs();
      setAuditLogs(logs);
    } catch (e) {
      console.warn('Failed to refresh admin data:', e);
    }
  };

  useEffect(() => {
    if (isAuthorizedAdmin) {
      refreshAdminData();
      import('./components/admin/AcademicStructureManager.tsx').catch(() => {});
      import('./components/admin/EnrollmentApprovalManager.tsx').catch(() => {});
      import('./components/admin/EducationalContentManager.tsx').catch(() => {});
      import('./components/admin/AssessmentManager.tsx').catch(() => {});
      import('./components/admin/HierarchyGovernanceConsole.tsx').catch(() => {});
      import('./components/admin/PlatformUsersManager.tsx').catch(() => {});
      import('./components/admin/BackupRestoreConsole.tsx').catch(() => {});
    }
  }, [isAuthorizedAdmin, activeTab]);

  // Start real-time academic sync for all users and subscribe to enrollment when logged in
  useEffect(() => {
    startAcademicRealtimeSync(true);
    if (!user) {
      setStudentEnrollment(null);
      return;
    }
    fetchStudentEnrollment(user.uid).then((enr) => {
      setStudentEnrollment(enr);
    });
    const unsub = subscribeToStudentEnrollment(user.uid, (enr) => {
      if (enr) setStudentEnrollment(enr);
    });
    return () => unsub();
  }, [user?.uid, isAuthorizedAdmin]);

  // Preload secondary student views 1.5s after mount for instant navigation
  useEffect(() => {
    const preloadTimer = setTimeout(() => {
      import('./components/student/StudentProfile.tsx').catch(() => {});
      import('./components/assessment/ExamTakingModal.tsx').catch(() => {});
    }, 1500);
    return () => clearTimeout(preloadTimer);
  }, []);

  useEffect(() => {
    if (loading) return;
    const studentTabs: ActiveTabType[] = [
      'student_dashboard',
      'student_library',
      'student_assessments',
      'student_profile'
    ];
    if (!isAdminMode) {
      if (!studentTabs.includes(activeTab) && activeTab !== 'auth') {
        setActiveTab('student_dashboard');
      }
    } else if (studentTabs.includes(activeTab)) {
      setActiveTab(isOwnerMode ? 'users_manager' : isUniversityAdminOrOwner ? 'enrollment_queue' : 'roles');
    } else if (!isOwnerMode && (activeTab === 'backup_restore' || activeTab === 'users_manager')) {
      setActiveTab(isUniversityAdminOrOwner ? 'enrollment_queue' : 'roles');
    } else if (!isUniversityAdminOrOwner && activeTab === 'enrollment_queue') {
      setActiveTab('roles');
    }
  }, [loading, isAdminMode, isOwnerMode, isUniversityAdminOrOwner, activeTab]);

  const handleNotificationNavigation = (tab: string, payload?: Record<string, unknown>) => {
    const studentTabsList: ActiveTabType[] = [
      'student_dashboard',
      'student_library',
      'student_assessments',
      'student_profile'
    ];
    const targetTab = (tab as ActiveTabType) || 'student_dashboard';

    if (studentTabsList.includes(targetTab) && activeRole !== 'student') {
      setActiveRole('student');
    }

    if (targetTab === 'student_assessments') {
      const requestedType =
        payload?.assessmentType === 'competition' || payload?.category === 'competition'
          ? 'competition'
          : 'exam';
      setTargetAssessmentNav({
        assessmentType: requestedType,
        assessmentId: typeof payload?.assessmentId === 'string' ? payload.assessmentId : undefined,
        timestamp: Date.now()
      });
    }

    setActiveTab(targetTab);
    setIsNotificationModalOpen(false);
  };

  return (
    <div
      className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors duration-200"
      dir="rtl"
    >
      <GlobalNotificationWatcher
        onNavigateTab={handleNotificationNavigation}
        studentUniversityId={
          !isAuthorizedAdmin && studentEnrollment?.status === 'approved'
            ? studentEnrollment.universityId
            : undefined
        }
        studentStudyLevelId={
          !isAuthorizedAdmin && studentEnrollment?.status === 'approved'
            ? studentEnrollment.currentStudyLevelId
            : undefined
        }
      />

      {/* TOP-LEVEL SHARED EXAM LOADING OVERLAY */}
      {isGuestExamOpen && !sharedGuestData && !pendingGuestSubmission && isSharedExamFetching && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
          <div className="umed-card max-w-md w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-8 text-center space-y-4 shadow-2xl">
            <RefreshCw className="w-10 h-10 animate-spin text-teal-400 mx-auto" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">جارٍ فتح الاختبار الطبي المشترك...</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              يتم الآن تجهيز الأسئلة والمؤقت لبدء الحل المباشر
            </p>
          </div>
        </div>
      )}

      {/* TOP-LEVEL SHARED / GUEST EXAM TAKING MODAL */}
      {isGuestExamOpen && (sharedGuestData || pendingGuestSubmission) && (
        <React.Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
              <div className="umed-card max-w-md w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-8 text-center space-y-4 shadow-2xl">
                <RefreshCw className="w-9 h-9 animate-spin text-teal-400 mx-auto" />
                <h2 className="text-sm font-bold text-[var(--text-primary)]">جارٍ فتح واجهة الاختبار التفاعلي...</h2>
              </div>
            </div>
          }
        >
          <ExamTakingModal
            assessment={(sharedGuestData?.assessment || pendingGuestSubmission?.assessment)!}
            attempt={{
              id: user
                ? `att-shared-${user.uid}-${Date.now()}`
                : `guest-attempt-${sharedGuestData?.assessment.id || pendingGuestSubmission?.assessmentId}`,
              assessmentId: (sharedGuestData?.assessment.id || pendingGuestSubmission?.assessmentId)!,
              uid: user?.uid || 'guest',
              attemptNumber: 1,
              startedAt: pendingGuestSubmission?.startedAt || new Date().toISOString(),
              expiresAt: new Date(
                Date.now() +
                  Number(
                    sharedGuestData?.assessment.durationMinutes ||
                      pendingGuestSubmission?.assessment.durationMinutes ||
                      30
                  ) *
                    60000
              ).toISOString(),
              answers: pendingGuestSubmission?.answers || {},
              lastSavedAt: new Date().toISOString(),
              status: 'in_progress'
            }}
            questions={sharedGuestData?.questions || []}
            studentNameArabic={userProfile?.displayNameArabic || user?.displayName || undefined}
            uid={user?.uid}
            isGuestMode={!user}
            onRequireGuestAccount={(sub) => {
              setPendingGuestSubmission(sub);
              setIsGuestExamOpen(false);
              clearSharedAssessmentIdFromUrl();
              setActiveTab('auth');
            }}
            onClose={() => {
              setIsGuestExamOpen(false);
              clearSharedAssessmentIdFromUrl();
            }}
            onSubmitted={(res) => {
              clearSharedAssessmentIdFromUrl();
              if (sharedGuestData?.assessment) {
                setClaimedGuestOutcome({
                  result: res,
                  assessment: sharedGuestData.assessment
                });
                getAssessmentLeaderboard(sharedGuestData.assessment.id)
                  .then((lb) => setClaimedLeaderboard(lb))
                  .catch(() => {});
              }
            }}
          />
        </React.Suspense>
      )}

      {/* TOP-LEVEL CLAIMED GUEST RESULT & LIVE RANKED LEADERBOARD MODAL */}
      {claimedGuestOutcome && (
        <ClaimedGuestResultModal
          claimedGuestOutcome={claimedGuestOutcome}
          claimedLeaderboard={claimedLeaderboard}
          currentUid={user?.uid}
          studentNameArabic={userProfile?.displayNameArabic || user?.displayName || undefined}
          onClose={() => setClaimedGuestOutcome(null)}
        />
      )}

      {/* IF INITIALIZING AUTH SESSION ON RELOAD */}
      {loading ? (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
          <div className="umed-card max-w-md w-full my-auto bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-8 sm:p-10 text-center space-y-3 shadow-2xl">
            <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">جارٍ تحضير منصة {platformSettings.platformNameArabic}</h2>
            <p className="text-xs text-[var(--text-muted)]">يرجى الانتظار لحظة ريثما يتم مزامنة البيانات السحابية</p>
          </div>
        </div>
      ) : isAccountArchived ? (
        <ArchivedAccountGate
          archiveReason={userProfile?.archiveReason}
          onLogout={logout}
        />
      ) : !user ? (
        <StudentOnboardingGate
          platformSettings={platformSettings}
          onOpenLegalContact={() => setLegalContactModalState({ isOpen: true, initialTab: 'contact' })}
          onAuthenticated={(targetTab) => setActiveTab(targetTab)}
        />
      ) : (
        /* AUTHENTICATED WORKSPACE WITH RTL SIDEBAR NAVIGATION */
        <div className="min-h-[100dvh] flex overflow-x-hidden w-full max-w-full">
          <WorkspaceSidebar
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            platformSettings={platformSettings}
            activeRole={activeRole}
            isAdminMode={isAdminMode}
            isOwnerMode={isOwnerMode}
            isUniversityAdminOrOwner={isUniversityAdminOrOwner}
            unreadNotificationCount={unreadNotificationCount}
            onOpenNotifications={() => setIsNotificationModalOpen(true)}
            onOpenLegalContact={() => setLegalContactModalState({ isOpen: true, initialTab: 'contact' })}
            theme={theme}
            setTheme={setTheme}
            userEmail={user.email}
            userDisplayName={user.displayName}
            userProfile={userProfile}
            onLogout={logout}
          />

          {/* MAIN WORKSPACE CONTENT AREA */}
          <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden">
            <WorkspaceTopHeader
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onOpenSidebar={() => setSidebarOpen(true)}
              userProfile={userProfile}
              isAuthorizedAdmin={isAuthorizedAdmin}
              activeRole={activeRole}
              realRole={realRole}
              roleDoc={roleDoc}
              setActiveRole={setActiveRole}
              unreadNotificationCount={unreadNotificationCount}
              onOpenNotifications={() => setIsNotificationModalOpen(true)}
              theme={theme}
              setTheme={setTheme}
            />

            {/* Page Content Viewport */}
            <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 py-4 pb-28 sm:px-6 sm:py-6 sm:pb-8 space-y-4">
              {/* Claimed Guest Trial Exam Result Celebration Banner */}
              {claimedGuestOutcome && (
                <div className="umed-card bg-[var(--bg-card)] border border-teal-500/50 rounded-2xl p-5 shadow-lg flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold">
                        تم تصحيح اختبارك ورصد نتيجتك ✓
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
                      نتيجتك في "{claimedGuestOutcome.assessment.titleArabic}":{' '}
                      <span className="text-teal-400 font-mono">
                        {claimedGuestOutcome.result.score} / {claimedGuestOutcome.result.totalPoints} ({claimedGuestOutcome.result.percentage}%)
                      </span>
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      اسمك المعروض في لوحة الترتيب أمام الطلاب:{' '}
                      <strong className="text-amber-400">
                        {claimedGuestOutcome.result.studentDisplayNamePublic || claimedGuestOutcome.result.studentNameArabic}
                      </strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setActiveRole('student');
                        setTargetAssessmentNav({
                          assessmentType: claimedGuestOutcome.assessment.assessmentType === 'competition' ? 'competition' : 'exam',
                          assessmentId: claimedGuestOutcome.assessment.id,
                          timestamp: Date.now()
                        });
                        setActiveTab('student_assessments');
                      }}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md"
                    >
                      عرض لوحة الترتيب والنتائج
                    </button>
                    <button
                      onClick={() => setClaimedGuestOutcome(null)}
                      className="p-2 rounded-xl bg-[var(--bg-elevated)] hover:opacity-90 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      title="إغلاق"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STUDENT WORKSPACE VIEWS */}
              {!isAdminMode && (activeTab === 'student_dashboard' || activeTab === 'student_library' || activeTab === 'student_assessments') && (
                <StudentDashboard
                  uid={user?.uid || 'visitor'}
                  userEmail={user?.email || ''}
                  displayNameArabic={userProfile?.displayNameArabic || user?.displayName || 'طالب كلية الطب البشري'}
                  activeSection={
                    activeTab === 'student_library'
                      ? 'library'
                      : activeTab === 'student_assessments'
                      ? 'assessments'
                      : 'study'
                  }
                  onSelectSection={(sec) => {
                    if (sec === 'library') setActiveTab('student_library');
                    else if (sec === 'assessments') setActiveTab('student_assessments');
                    else if (sec === 'profile') setActiveTab('student_profile');
                    else setActiveTab('student_dashboard');
                  }}
                  onEnrollmentStatusChange={(enr) => setStudentEnrollment(enr)}
                  isAdminPreview={isAuthorizedAdmin}
                  previewUniversityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                  previewStudyLevelId={roleDoc?.assignedStudyLevelId || 'lvl-4'}
                  assessmentNavTarget={targetAssessmentNav}
                />
              )}

              {!isAdminMode && activeTab === 'student_profile' && (
                <React.Suspense
                  fallback={
                    <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6 space-y-4 animate-pulse" dir="rtl">
                      <div className="h-6 w-48 bg-[var(--bg-elevated)] rounded-lg" />
                      <div className="h-32 bg-[var(--bg-input)] rounded-xl" />
                    </div>
                  }
                >
                  <StudentProfile
                    uid={user?.uid || 'visitor'}
                    userEmail={user?.email || ''}
                    displayNameArabic={userProfile?.displayNameArabic || user?.displayName || 'طالب كلية الطب البشري'}
                    initialEnrollment={studentEnrollment}
                    onNavigateTab={(tab) => {
                      if (tab === 'library') setActiveTab('student_library');
                      else if (tab === 'assessments') setActiveTab('student_assessments');
                      else setActiveTab('student_dashboard');
                    }}
                  />
                </React.Suspense>
              )}

              {/* ADMIN, UNIVERSITY OWNER, BATCH REP & DEPT HEAD WORKSPACE VIEWS */}
              {user && (
                <React.Suspense
                  fallback={
                    <div className="flex flex-col items-center justify-center p-12 text-[var(--text-muted)] space-y-3">
                      <RefreshCw className="w-8 h-8 animate-spin text-teal-400" />
                      <span className="text-xs font-semibold">جارٍ تحميل الوحدة الإدارية...</span>
                    </div>
                  }
                >
                  {isOwnerMode && activeTab === 'users_manager' && (
                    <PlatformUsersManager
                      callerUid={user.uid}
                      callerEmail={user.email || ''}
                      callerRole={activeRole}
                    />
                  )}

                  {isAdminMode && activeTab === 'roles' && (
                    <HierarchyGovernanceConsole
                      callerUid={user.uid}
                      callerEmail={user.email || ''}
                      callerNameArabic={userProfile?.displayNameArabic || user.displayName || 'مسؤول المنصة'}
                      callerRole={activeRole}
                      callerUniversityId={roleDoc?.assignedUniversityId}
                      callerStudyLevelId={roleDoc?.assignedStudyLevelId}
                      onRolesUpdated={refreshAdminData}
                    />
                  )}

                  {isAdminMode && activeTab === 'academic' && (
                    <AcademicStructureManager
                      userRole={activeRole}
                      assignedUniversityId={roleDoc?.assignedUniversityId}
                      assignedStudyLevelId={roleDoc?.assignedStudyLevelId}
                    />
                  )}

                  {isAdminMode && activeTab === 'content_manager' && (
                    <EducationalContentManager
                      adminUid={user.uid}
                      userRole={activeRole}
                      assignedUniversityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                      assignedStudyLevelId={roleDoc?.assignedStudyLevelId}
                      assignedCourseId={roleDoc?.assignedCourseId}
                    />
                  )}

                  {isAdminMode && activeTab === 'assessments_manager' && (
                    <AssessmentManager
                      universityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                      userRole={activeRole}
                      assignedStudyLevelId={roleDoc?.assignedStudyLevelId}
                      assignedCourseId={roleDoc?.assignedCourseId}
                    />
                  )}

                  {isUniversityAdminOrOwner && activeTab === 'enrollment_queue' && (
                    <EnrollmentApprovalManager
                      adminUid={user.uid}
                      assignedUniversityId={isOwnerMode ? undefined : roleDoc?.assignedUniversityId}
                    />
                  )}

                  {isOwnerMode && activeTab === 'backup_restore' && (
                    <BackupRestoreConsole
                      adminEmail={user.email || ''}
                      assignedUniversityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                    />
                  )}
                </React.Suspense>
              )}

              {/* ADMIN TAB: AUDIT LOGS */}
              {user && isAdminMode && activeTab === 'audit' && (
                <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
                    <div>
                      <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <FileText className="w-5 h-5 text-teal-400" />
                        <span>سجل التدقيق السحابي غير القابل للتعديل (auditLogs)</span>
                      </h2>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        يوثق عمليات ترقية المالك، تعيين المشرفين، تهيئة الجامعات، واعتماد القيد وتصحيح الاختبارات
                      </p>
                    </div>
                    <button
                      onClick={refreshAdminData}
                      className="py-1.5 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-semibold hover:opacity-90 transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>تحديث السجل</span>
                    </button>
                  </div>

                  {auditLogs.length === 0 ? (
                    <div className="p-8 text-center bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)] text-[var(--text-muted)] text-xs">
                      لا توجد سجلات تدقيق حالياً.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="p-3.5 bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)] text-xs flex flex-wrap items-center justify-between gap-2 tabular-nums">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                log.action === 'OWNER_PROVISIONED'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : log.action === 'ASSESSMENT_SCORED'
                                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                                  : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                              }`}
                            >
                              {log.action}
                            </span>
                            <span className="text-[var(--text-primary)] font-semibold">
                              بواسطة: <code className="text-teal-400 font-mono">{log.performedBy}</code>
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] font-mono">
                            <span>{new Date(log.timestamp).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: SETTINGS, APPEARANCE & CLOUD ACCOUNT */}
              {activeTab === 'auth' && (
                <AccountAndAppearanceView
                  theme={theme}
                  setTheme={setTheme}
                  setActiveTab={setActiveTab}
                  platformSettings={platformSettings}
                  isStrictPlatformOwner={isStrictPlatformOwner}
                  onOpenLegalModal={(tab) => setLegalContactModalState({ isOpen: true, initialTab: tab })}
                />
              )}
            </main>

            <MobileBottomTabBar
              isAdminMode={isAdminMode}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onOpenSidebar={() => setSidebarOpen(true)}
            />
          </div>
        </div>
      )}

      {/* Global Real-Time Notification Center Modal */}
      <NotificationCenterModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        onNavigateTab={handleNotificationNavigation}
        isDarkMode={isDarkMode}
      />

      {/* Platform Terms of Use, Privacy Policy & Contact Channels Modal */}
      <PlatformLegalAndContactModal
        isOpen={legalContactModalState.isOpen}
        initialTab={legalContactModalState.initialTab}
        settings={platformSettings}
        onClose={() => setLegalContactModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
