/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Main Application Shell
 * Connects Unified Student & Admin Workspaces, Theme Engine, Notifications, and Onboarding Gate.
 */

import React, { useState, useEffect, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import StudentOnboardingGate from './components/auth/StudentOnboardingGate.tsx';
import StudentDashboard from './components/student/StudentDashboard.tsx';
import StudentProfile from './components/student/StudentProfile.tsx';
import AccountAndAppearanceView from './components/settings/AccountAndAppearanceView.tsx';
import {
  PlatformLegalAndContactModal
} from './components/settings/PlatformOwnerSettingsModalAndCard.tsx';
import {
  DEFAULT_PLATFORM_SETTINGS,
  PlatformBrandingAndPolicies,
  subscribeToPlatformSettings
} from './services/platformSettingsService.ts';
import {
  WorkspaceSidebar,
  WorkspaceTopHeader,
  MobileBottomTabBar,
  ActiveTabType,
  UmedTheme
} from './components/navigation/WorkspaceShellNav.tsx';
import NotificationCenterModal from './components/notifications/NotificationCenterModal.tsx';
import GlobalNotificationWatcher from './components/notifications/GlobalNotificationWatcher.tsx';
import { subscribeToAppNotifications } from './services/notificationService.ts';
import { PWAFloatingInstallBanner } from './components/pwa/PWAInstallModalAndBanner.tsx';
import { StudentEnrollment, UserRole } from './types/umed.ts';
import { isInitialOwnerEmail } from './lib/firebase.ts';

// Lazy-loaded Admin Consoles for fast initial load
const EducationalContentManager = React.lazy(
  () => import('./components/admin/EducationalContentManager.tsx')
);
const AssessmentManager = React.lazy(
  () => import('./components/admin/AssessmentManager.tsx')
);
const HierarchyGovernanceConsole = React.lazy(
  () => import('./components/admin/HierarchyGovernanceConsole.tsx')
);
const AcademicStructureManager = React.lazy(
  () => import('./components/admin/AcademicStructureManager.tsx')
);
const PlatformUsersManager = React.lazy(
  () => import('./components/admin/PlatformUsersManager.tsx')
);
const BackupRestoreConsole = React.lazy(
  () => import('./components/admin/BackupRestoreConsole.tsx')
);

const SECTION_TITLES: Record<ActiveTabType, string> = {
  student_dashboard: 'بوابة الدراسة والمقررات الطبية',
  student_portal: 'بوابة الدراسة والمقررات الطبية',
  student_library: 'المكتبة الطبية الرقمية',
  student_exams: 'الاختبارات السريرية والمسابقات',
  student_profile: 'ملفي الأكاديمي والبطاقة الجامعية',
  content_manager: 'إدارة المحتوى التعليمي والمكتبة',
  library: 'إدارة المحتوى التعليمي والمكتبة',
  exams_manager: 'إدارة بنوك الأسئلة والاختبارات',
  assessments: 'إدارة بنوك الأسئلة والاختبارات',
  hierarchy_governance: 'حوكمة الدفعات والإعلانات والترقيات',
  roles: 'حوكمة الدفعات والإعلانات والترقيات',
  academic: 'إدارة الهيكل الأكاديمي والجامعات',
  users_manager: 'إدارة المستخدمين واعتماد القيد الأكاديمي',
  enrollment_queue: 'طلبات ومراجعات القيد الأكاديمي',
  backup_restore: 'النسخ الاحتياطي وسجل التدقيق السحابي',
  audit: 'سجل التدقيق الأمني السحابي',
  settings: 'الإعدادات والمظهر والحساب'
};

function UmedWorkspaceApp() {
  const { user, userProfile, roleDoc, loading, logout } = useAuth();

  const [theme, setTheme] = useState<UmedTheme>(() => {
    try {
      const saved = localStorage.getItem('umed-theme') as UmedTheme | null;
      return saved || 'medical';
    } catch {
      return 'medical';
    }
  });

  const [activeTab, setActiveTab] = useState<ActiveTabType>('student_portal');
  const [isAdminWorkspaceMode, setIsAdminWorkspaceMode] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  const [platformSettings, setPlatformSettings] = useState<PlatformBrandingAndPolicies>(
    DEFAULT_PLATFORM_SETTINGS
  );
  const [legalModalState, setLegalModalState] = useState<{
    isOpen: boolean;
    tab: 'terms' | 'privacy' | 'contact';
  }>({ isOpen: false, tab: 'terms' });

  const [isNotifModalOpen, setIsNotifModalOpen] = useState<boolean>(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [currentEnrollment, setCurrentEnrollment] = useState<StudentEnrollment | null>(null);
  const [assessmentNavTarget, setAssessmentNavTarget] = useState<{
    assessmentType?: 'exam' | 'competition';
    assessmentId?: string;
    timestamp?: number;
  } | null>(null);

  // Sync theme to document root & localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark' || theme === 'gold') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('umed-theme', theme);
    } catch {}
  }, [theme]);

  // Subscribe to Platform Settings
  useEffect(() => {
    const unsub = subscribeToPlatformSettings((settings) => {
      setPlatformSettings(settings);
    });
    return () => unsub();
  }, []);

  // Subscribe to Unread Notifications Count
  useEffect(() => {
    const unsub = subscribeToAppNotifications((list) => {
      setUnreadNotifCount(list.filter((n) => !n.read).length);
    });
    return () => unsub();
  }, []);

  const effectiveRole: UserRole = roleDoc?.role || 'student';
  const isStrictOwner =
    effectiveRole === 'platform_owner' ||
    Boolean(userProfile?.isPrimaryOwner) ||
    isInitialOwnerEmail(user?.email);

  const canAccessAdminWorkspace =
    effectiveRole === 'platform_owner' ||
    effectiveRole === 'university_admin' ||
    effectiveRole === 'department_head' ||
    effectiveRole === 'batch_rep';

  const handleToggleWorkspaceMode = () => {
    if (!canAccessAdminWorkspace) return;
    const nextMode = !isAdminWorkspaceMode;
    setIsAdminWorkspaceMode(nextMode);
    setActiveTab(nextMode ? 'content_manager' : 'student_portal');
  };

  const handleNotificationNavigation = (
    targetTab: string,
    payload?: Record<string, unknown>
  ) => {
    if (
      targetTab === 'student_assessments' ||
      targetTab === 'student_exams' ||
      targetTab === 'assessments'
    ) {
      setIsAdminWorkspaceMode(false);
      setActiveTab('student_exams');
      if (payload?.assessmentId) {
        setAssessmentNavTarget({
          assessmentId: String(payload.assessmentId),
          assessmentType:
            payload.assessmentType === 'competition' ? 'competition' : 'exam',
          timestamp: Date.now()
        });
      }
      return;
    }
    if (targetTab === 'student_library' || targetTab === 'library') {
      setIsAdminWorkspaceMode(false);
      setActiveTab('student_library');
      return;
    }
    if (targetTab === 'student_profile') {
      setIsAdminWorkspaceMode(false);
      setActiveTab('student_profile');
      return;
    }
    setIsAdminWorkspaceMode(false);
    setActiveTab('student_portal');
  };

  if (loading) {
    return (
      <div
        className="min-h-dvh bg-[var(--bg-app)] text-[var(--text-primary)] flex items-center justify-center p-6"
        dir="rtl"
      >
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-2xl border-3 border-teal-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-xs font-bold text-[var(--text-secondary)]">
            جارٍ تحميل بيئة UMED الأكاديمية...
          </p>
        </div>
      </div>
    );
  }

  // Require login / onboarding if user is not authenticated
  if (!user || !userProfile) {
    return (
      <>
        <StudentOnboardingGate
          platformSettings={platformSettings}
          onOpenLegalContact={() =>
            setLegalModalState({ isOpen: true, tab: 'contact' })
          }
          onAuthenticated={(targetTab) => setActiveTab(targetTab)}
        />
        <PlatformLegalAndContactModal
          isOpen={legalModalState.isOpen}
          initialTab={legalModalState.tab}
          settings={platformSettings}
          onClose={() => setLegalModalState((prev) => ({ ...prev, isOpen: false }))}
        />
      </>
    );
  }

  const assignedUnivId =
    roleDoc?.assignedUniversityId || userProfile.universityId || 'univ-dar-al-salam';
  const assignedLevelId =
    roleDoc?.assignedStudyLevelId || userProfile.studyLevelId || 'lvl-1';

  return (
    <div
      className="min-h-dvh bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col lg:flex-row"
      dir="rtl"
    >
      {/* Global Real-Time Notification Watcher */}
      <GlobalNotificationWatcher
        onNavigateTab={handleNotificationNavigation}
        studentUniversityId={assignedUnivId}
        studentStudyLevelId={assignedLevelId}
      />

      {/* Unified Sidebar */}
      <WorkspaceSidebar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        userRole={effectiveRole}
        isAdminWorkspaceMode={isAdminWorkspaceMode}
        onToggleWorkspaceMode={handleToggleWorkspaceMode}
        canAccessAdminWorkspace={canAccessAdminWorkspace}
        displayNameArabic={userProfile.displayNameArabic}
        username={userProfile.username}
        userEmail={user.email || ''}
        avatarDataUrl={userProfile.avatarUrl}
        theme={theme}
        onChangeTheme={setTheme}
        platformSettings={platformSettings}
        onOpenLegalModal={(tab) => setLegalModalState({ isOpen: true, tab })}
        onSignOut={logout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        <WorkspaceTopHeader
          sectionTitle={SECTION_TITLES[activeTab] || 'بوابة UMED الأكاديمية'}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          unreadNotificationsCount={unreadNotifCount}
          onOpenNotifications={() => setIsNotifModalOpen(true)}
          username={userProfile.username}
          userRole={effectiveRole}
          canAccessAdminWorkspace={canAccessAdminWorkspace}
          isAdminWorkspaceMode={isAdminWorkspaceMode}
          onToggleWorkspaceMode={handleToggleWorkspaceMode}
          theme={theme}
          onChangeTheme={setTheme}
        />

        <main className="flex-1 p-3.5 sm:p-6 max-w-7xl w-full mx-auto">
          <Suspense
            fallback={
              <div className="p-10 text-center text-xs font-bold text-[var(--text-muted)]">
                جارٍ فتح الوحدة الأكاديمية...
              </div>
            }
          >
            {/* SETTINGS VIEW */}
            {activeTab === 'settings' ? (
              <AccountAndAppearanceView
                theme={theme}
                setTheme={setTheme}
                setActiveTab={setActiveTab}
                platformSettings={platformSettings}
                isStrictPlatformOwner={isStrictOwner}
                onOpenLegalModal={(tab) => setLegalModalState({ isOpen: true, tab })}
              />
            ) : isAdminWorkspaceMode && canAccessAdminWorkspace ? (
              /* ADMIN WORKSPACE VIEWS */
              <>
                {(activeTab === 'content_manager' || activeTab === 'library') && (
                  <EducationalContentManager
                    adminUid={user.uid}
                    userRole={effectiveRole}
                    assignedUniversityId={
                      effectiveRole === 'platform_owner' ? undefined : assignedUnivId
                    }
                    assignedStudyLevelId={
                      effectiveRole === 'batch_rep' || effectiveRole === 'department_head'
                        ? assignedLevelId
                        : undefined
                    }
                  />
                )}

                {(activeTab === 'exams_manager' || activeTab === 'assessments') && (
                  <AssessmentManager
                    universityId={assignedUnivId}
                    userRole={effectiveRole}
                    assignedStudyLevelId={
                      effectiveRole === 'batch_rep' || effectiveRole === 'department_head'
                        ? assignedLevelId
                        : undefined
                    }
                  />
                )}

                {(activeTab === 'hierarchy_governance' || activeTab === 'roles') && (
                  <HierarchyGovernanceConsole
                    callerUid={user.uid}
                    callerEmail={user.email || ''}
                    callerNameArabic={userProfile.displayNameArabic}
                    callerRole={effectiveRole}
                    assignedUniversityId={
                      effectiveRole === 'platform_owner' ? undefined : assignedUnivId
                    }
                    assignedStudyLevelId={
                      effectiveRole === 'batch_rep' || effectiveRole === 'department_head'
                        ? assignedLevelId
                        : undefined
                    }
                    onNavigateToAcademicStructure={() => setActiveTab('academic')}
                  />
                )}

                {activeTab === 'academic' && (
                  <AcademicStructureManager
                    userRole={effectiveRole}
                    assignedUniversityId={
                      effectiveRole === 'platform_owner' ? undefined : assignedUnivId
                    }
                  />
                )}

                {(activeTab === 'users_manager' || activeTab === 'enrollment_queue') && (
                  <PlatformUsersManager
                    callerUid={user.uid}
                    callerEmail={user.email || ''}
                    callerRole={effectiveRole}
                    assignedUniversityId={
                      effectiveRole === 'platform_owner' ? undefined : assignedUnivId
                    }
                    initialSubTab={
                      activeTab === 'enrollment_queue'
                        ? 'enrollment_approvals'
                        : 'users_directory'
                    }
                  />
                )}

                {(activeTab === 'backup_restore' || activeTab === 'audit') && (
                  <BackupRestoreConsole
                    adminEmail={user.email || 'owner@umed.edu'}
                    initialSubTab={
                      activeTab === 'audit' ? 'audit_logs' : 'backup_restore'
                    }
                  />
                )}
              </>
            ) : (
              /* STUDENT WORKSPACE VIEWS */
              <>
                {activeTab === 'student_profile' ? (
                  <StudentProfile
                    uid={user.uid}
                    userEmail={user.email || ''}
                    displayNameArabic={userProfile.displayNameArabic}
                    initialEnrollment={currentEnrollment}
                    onNavigateTab={(sec) => {
                      if (sec === 'library') setActiveTab('student_library');
                      else if (sec === 'assessments') setActiveTab('student_exams');
                      else setActiveTab('student_portal');
                    }}
                  />
                ) : (
                  <StudentDashboard
                    uid={user.uid}
                    userEmail={user.email || ''}
                    displayNameArabic={userProfile.displayNameArabic}
                    activeSection={
                      activeTab === 'student_library'
                        ? 'library'
                        : activeTab === 'student_exams'
                        ? 'assessments'
                        : 'study'
                    }
                    onSelectSection={(sec) => {
                      if (sec === 'library') setActiveTab('student_library');
                      else if (sec === 'assessments') setActiveTab('student_exams');
                      else if (sec === 'profile') setActiveTab('student_profile');
                      else setActiveTab('student_portal');
                    }}
                    onEnrollmentStatusChange={setCurrentEnrollment}
                    assessmentNavTarget={assessmentNavTarget}
                  />
                )}
              </>
            )}
          </Suspense>
        </main>

        <MobileBottomTabBar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          isAdminWorkspaceMode={isAdminWorkspaceMode}
        />
      </div>

      {/* Floating Mobile PWA Install Banner */}
      <PWAFloatingInstallBanner />

      {/* Notification Center Modal */}
      <NotificationCenterModal
        isOpen={isNotifModalOpen}
        onClose={() => setIsNotifModalOpen(false)}
        onNavigateTab={handleNotificationNavigation}
        isDarkMode={theme === 'dark' || theme === 'gold'}
      />

      {/* Platform Terms, Privacy & Contact Modal */}
      <PlatformLegalAndContactModal
        isOpen={legalModalState.isOpen}
        initialTab={legalModalState.tab}
        settings={platformSettings}
        onClose={() => setLegalModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <UmedWorkspaceApp />
    </AuthProvider>
  );
}
