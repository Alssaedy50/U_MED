/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED — Yemen-First Medical Education Platform
 * Production Application Entry & Role-Isolated Console with RTL Sidebar Navigation
 */

import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  Wifi, 
  WifiOff, 
  UserCheck, 
  LogOut, 
  LogIn, 
  Crown, 
  RefreshCw, 
  FileText, 
  Sun,
  Moon,
  Building2, 
  Stethoscope, 
  Users, 
  BookOpen,
  Trophy,
  HardDrive,
  Plus,
  ExternalLink,
  Settings,
  Menu,
  X,
  Phone,
  Mail,
  Hash,
  KeyRound,
  Send,
  Trash2,
  Archive,
  ShieldAlert,
  GraduationCap,
  Bell,
  Share2,
  Check,
  Download,
  Sparkles,
  AtSign,
  Edit3,
  Camera,
  Smartphone,
  Upload
} from 'lucide-react';
import { useAuth } from './context/AuthContext.tsx';
import { UserRole, AuditLog, StudentEnrollment } from './types/umed.ts';
import {
  fetchMergedAuditLogs,
  formatUserIdentifier,
  checkIdentifierUniqueness,
  isPrimaryOwnerEmail,
  normalizeUsername,
  validateUsernameFormat,
  checkDeviceSingleAccountPolicy,
  getDeviceFingerprint,
  YEMEN_UNIVERSITIES_OPTIONS,
  MEDICAL_SPECIALTIES_OPTIONS,
  STUDY_LEVELS_OPTIONS,
  MEDICAL_PRESET_AVATARS,
  compressAndReadProfileImage
} from './lib/firebase.ts';
import { fetchStudentEnrollment, subscribeToStudentEnrollment } from './services/enrollmentService.ts';
import { startAcademicRealtimeSync, saveUserAcademicContext } from './services/academicService.ts';
import { getRoleLabelArabic } from './services/batchGovernanceService.ts';
import { subscribeToAppNotifications } from './services/notificationService.ts';
import {
  getAssessments,
  buildShareableAssessmentUrl,
  getSharedAssessmentIdFromUrl,
  clearSharedAssessmentIdFromUrl,
  fetchSharedAssessmentForGuest,
  getCachedSharedAssessmentSync,
  parseSharedAssessmentInput,
  getPendingGuestExamSubmission,
  claimAndGradePendingGuestSubmission,
  getAssessmentLeaderboard,
  resolveResultPublicDisplayName,
  PendingGuestExamSubmission,
  downloadExamBookletFile
} from './services/assessmentService.ts';
import { Assessment, AssessmentQuestionPublic, AssessmentResult } from './types/umed.ts';
import StudentDashboard from './components/student/StudentDashboard.tsx';
import GlobalNotificationWatcher from './components/notifications/GlobalNotificationWatcher.tsx';
import NotificationCenterModal from './components/notifications/NotificationCenterModal.tsx';
import {
  PWAHeaderControls,
  PWASidebarInstallCard,
  PWASettingsCard
} from './components/pwa/PWAInstallModalAndBanner.tsx';
import {
  PlatformBrandingAndPolicies,
  getCachedPlatformSettings,
  subscribeToPlatformSettings
} from './services/platformSettingsService.ts';
import {
  PlatformLogoBadge,
  PlatformOwnerSettingsCard,
  PlatformLegalAndContactModal
} from './components/settings/PlatformOwnerSettingsModalAndCard.tsx';

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

type ActiveTabType =
  | 'student_dashboard'
  | 'student_library'
  | 'student_assessments'
  | 'student_profile'
  | 'academic'
  | 'content_manager'
  | 'assessments_manager'
  | 'enrollment_queue'
  | 'users_manager'
  | 'backup_restore'
  | 'roles'
  | 'audit'
  | 'auth';

export default function App() {
  const { 
    user, 
    roleDoc, 
    userProfile, 
    loading, 
    isOnline, 
    firestoreConnected, 
    firestoreLatency, 
    firestoreError,
    loginGoogle, 
    loginEmail, 
    registerEmail, 
    loginPhone,
    registerPhone,
    loginWithIdentifier,
    registerWithUsername,
    updateUniqueUsername,
    updateFullProfile,
    logout, 
    deleteOwnAccount,
    bootstrapInitialOwner, 
    checkConnectivity,
    activeRole,
    realRole,
    setActiveRole,
    isAuthorizedAdmin,
    isAccountArchived,
    pendingVerification,
    verifyCurrentAccount,
    resendVerification,
    startAccountVerification
  } = useAuth();

  type UmedTheme = 'medical' | 'gold' | 'light' | 'dark';

  const [theme, setThemeState] = useState<UmedTheme>(() => {
    try {
      const saved = localStorage.getItem('umed-theme') as UmedTheme | null;
      if (saved === 'medical' || saved === 'gold' || saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch (e) {}
    return 'medical';
  });

  const [themeMenuOpen, setThemeMenuOpen] = useState<boolean>(false);

  const isDarkMode = theme === 'dark' || theme === 'gold';

  const setTheme = (nextTheme: UmedTheme) => {
    setThemeState(nextTheme);
    setThemeMenuOpen(false);
    try {
      localStorage.setItem('umed-theme', nextTheme);
    } catch (e) {}
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
    } catch (e) {}
  }, [theme]);

  const THEME_OPTIONS: {
    id: UmedTheme;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'medical', label: 'طبي', subtitle: 'سماوي سريري مريح', icon: Stethoscope },
    { id: 'gold', label: 'ذهبي', subtitle: 'فخامة ملكية داكنة', icon: Crown },
    { id: 'light', label: 'نهاري', subtitle: 'تباين نهاري ساطع', icon: Sun },
    { id: 'dark', label: 'غامق', subtitle: 'ليلي عميق للتركيز', icon: Moon }
  ];

  const activeThemeOption = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];

  const renderBiDiRoleLabel = (role?: UserRole) => {
    switch (role) {
      case 'platform_owner':
        return (
          <>
            مالك المنصة العام <span dir="ltr" className="inline-block">(Platform Owner)</span>
          </>
        );
      case 'university_admin':
        return (
          <>
            مالك / مشرف الجامعة <span dir="ltr" className="inline-block">(University Owner)</span>
          </>
        );
      case 'batch_rep':
        return (
          <>
            مندوب الدفعة / المستوى <span dir="ltr" className="inline-block">(Batch Representative)</span>
          </>
        );
      case 'department_head':
        return (
          <>
            رئيس قسم أو مادة <span dir="ltr" className="inline-block">(Department / Subject Head)</span>
          </>
        );
      default:
        return (
          <>
            طالب طب بشري <span dir="ltr" className="inline-block">(Student)</span>
          </>
        );
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('register');
  const [authMethod, setAuthMethod] = useState<'username' | 'phone' | 'email'>('username');
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [loginIdentifierInput, setLoginIdentifierInput] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [academicIdInput, setAcademicIdInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [displayNameInput, setDisplayNameInput] = useState<string>('');

  // First-time Registration Profile Picture & Academic Fields
  const [regAvatarUrl, setRegAvatarUrl] = useState<string>('');
  const [regUniversityId, setRegUniversityId] = useState<string>('univ-dar-al-salam');
  const [regCollegeArabic, setRegCollegeArabic] = useState<string>('كلية الطب البشري والعلوم الصحية');
  const [regSpecialtyArabic, setRegSpecialtyArabic] = useState<string>('الطب البشري والجراحة العامة (MBBS)');
  const [regStudyLevelId, setRegStudyLevelId] = useState<string>('lvl-4');
  const [regSubmitting, setRegSubmitting] = useState<boolean>(false);

  // Device Single-Account Verification State (Deferred strictly to registration attempt)
  const [devicePolicy, setDevicePolicy] = useState<{
    checking: boolean;
    allowed: boolean;
    existingUid?: string;
    existingUsername?: string;
    existingDisplayName?: string;
    message?: string;
    deviceId: string;
  }>(() => ({
    checking: false,
    allowed: true,
    deviceId: getDeviceFingerprint().deviceId
  }));

  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [uniquenessStatus, setUniquenessStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    reason?: string;
  }>({ checking: false, available: null });

  // Cloud Unique Username & Full Profile Editor states for logged-in users in Settings/Account tab
  const [profileUsernameEdit, setProfileUsernameEdit] = useState<string>('');
  const [profileDisplayNameEdit, setProfileDisplayNameEdit] = useState<string>('');
  const [profileAvatarEdit, setProfileAvatarEdit] = useState<string>('');
  const [profileUniversityEdit, setProfileUniversityEdit] = useState<string>('univ-dar-al-salam');
  const [profileSpecialtyEdit, setProfileSpecialtyEdit] = useState<string>('الطب البشري والجراحة العامة (MBBS)');
  const [profileStudyLevelEdit, setProfileStudyLevelEdit] = useState<string>('lvl-4');
  const [profileUpdateLoading, setProfileUpdateLoading] = useState<boolean>(false);
  const [profileUpdateMessage, setProfileUpdateMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (userProfile?.username) {
      setProfileUsernameEdit(userProfile.username);
    }
    if (userProfile?.displayNameArabic) {
      setProfileDisplayNameEdit(userProfile.displayNameArabic);
    }
    if (userProfile?.avatarUrl !== undefined) {
      setProfileAvatarEdit(userProfile.avatarUrl || '');
    }
    if (userProfile?.universityId) {
      setProfileUniversityEdit(userProfile.universityId);
    }
    if (userProfile?.specialtyArabic) {
      setProfileSpecialtyEdit(userProfile.specialtyArabic);
    }
    if (userProfile?.studyLevelId) {
      setProfileStudyLevelEdit(userProfile.studyLevelId);
    }
  }, [
    userProfile?.username,
    userProfile?.displayNameArabic,
    userProfile?.avatarUrl,
    userProfile?.universityId,
    userProfile?.specialtyArabic,
    userProfile?.studyLevelId
  ]);

  // Device single-account policy is deferred until actual registration submission (no boot network call)

  const handleRegPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAuthError(null);
    try {
      const dataUrl = await compressAndReadProfileImage(file);
      setRegAvatarUrl(dataUrl);
    } catch (err: any) {
      setAuthError(err?.message || 'تعذر قراءة الصورة الشخصية');
    }
  };

  const handleSettingsPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileUpdateMessage(null);
    try {
      const dataUrl = await compressAndReadProfileImage(file);
      setProfileAvatarEdit(dataUrl);
    } catch (err: any) {
      setProfileUpdateMessage({
        type: 'error',
        text: err?.message || 'تعذر قراءة الصورة الشخصية'
      });
    }
  };

  // Phone & Email Verification OTP states
  const [phoneOtpInput, setPhoneOtpInput] = useState<string>('');
  const [emailOtpInput, setEmailOtpInput] = useState<string>('');
  const [verifyLoading, setVerifyLoading] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);

  // Self Account Deletion Confirmation Modal states
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [deleteAccountLoading, setDeleteAccountLoading] = useState<boolean>(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const [bootstrapLoading, setBootstrapLoading] = useState<boolean>(false);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
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
    // If guest already submitted this assessment and is waiting to register, show registration form
    if (existingSub && existingSub.assessmentId === urlId) return false;
    return true;
  });
  const [isSharedExamFetching, setIsSharedExamFetching] = useState<boolean>(false);
  const [sharedLinkPasteInput, setSharedLinkPasteInput] = useState<string>('');
  const [showSharedLinkPasteBox, setShowSharedLinkPasteBox] = useState<boolean>(false);
  const [showPublicModelsBrowser, setShowPublicModelsBrowser] = useState<boolean>(false);
  const [publicModelsList, setPublicModelsList] = useState<Assessment[]>([]);
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);
  const [claimedGuestOutcome, setClaimedGuestOutcome] = useState<{
    result: AssessmentResult;
    assessment: Assessment;
  } | null>(null);
  const [claimedLeaderboard, setClaimedLeaderboard] = useState<AssessmentResult[]>([]);

  useEffect(() => {
    if (!showPublicModelsBrowser) return;
    getAssessments('univ-dar-al-salam')
      .then((list) => {
        const published = list.filter((a) => a.status === 'published');
        setPublicModelsList(published.length > 0 ? published : list);
      })
      .catch(() => {});
  }, [showPublicModelsBrowser]);

  // Global Platform Branding, Terms/Privacy & Contact Settings (Managed strictly by Platform Owner)
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

  // Load and open shared assessment link (?sharedAssessmentId=... or #sharedAssessmentId=...) for both guests & logged-in users
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
          setAuthTab('register');
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

  // Also listen for URL hashchange / popstate so clicking a shared link while app is open triggers immediately
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
      displayNameInput.trim() ||
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
    } catch (e) {}
    return 'student_dashboard';
  });

  const setActiveTab = (tab: ActiveTabType) => {
    setActiveTabState(tab);
    setSidebarOpen(false);
    try {
      localStorage.setItem('umed_active_tab', tab);
      sessionStorage.setItem('umed_active_tab', tab);
    } catch (e) {}
  };

  // True when an authorized leader (Platform Owner, University Owner, Batch Rep, or Dept Head) is in Leadership mode
  const isAdminMode = Boolean(
    isAuthorizedAdmin && activeRole !== 'student'
  );
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
      // Background preload admin chunks so switching tabs is instantaneous (0ms)
      import('./components/admin/AcademicStructureManager.tsx').catch(() => {});
      import('./components/admin/EnrollmentApprovalManager.tsx').catch(() => {});
      import('./components/admin/EducationalContentManager.tsx').catch(() => {});
      import('./components/admin/AssessmentManager.tsx').catch(() => {});
      import('./components/admin/HierarchyGovernanceConsole.tsx').catch(() => {});
      import('./components/admin/PlatformUsersManager.tsx').catch(() => {});
      import('./components/admin/BackupRestoreConsole.tsx').catch(() => {});
    }
  }, [isAuthorizedAdmin, activeTab]);

  // Start real-time academic sync for all users (students & admins) and subscribe to enrollment when logged in
  useEffect(() => {
    startAcademicRealtimeSync(true);
    if (!user) {
      setStudentEnrollment(null);
      return;
    }
    fetchStudentEnrollment(user.uid).then(enr => {
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

  // Live debounced uniqueness & anti-similarity check during registration
  useEffect(() => {
    if (authTab !== 'register') {
      setUniquenessStatus({ checking: false, available: null });
      return;
    }
    const usernameCandidate = authMethod === 'username' ? usernameInput.trim() : '';
    const emailCandidate = authMethod === 'email' ? emailInput.trim() : '';
    const phoneCandidate = authMethod === 'phone' ? phoneInput.trim() : '';

    if (!usernameCandidate && !emailCandidate && !phoneCandidate) {
      setUniquenessStatus({ checking: false, available: null });
      return;
    }

    if (authMethod === 'username' && usernameCandidate) {
      const fmt = validateUsernameFormat(usernameCandidate);
      if (!fmt.valid) {
        setUniquenessStatus({
          checking: false,
          available: false,
          reason: fmt.message
        });
        return;
      }
    }

    let cancelled = false;
    setUniquenessStatus(prev => ({ ...prev, checking: true }));
    const timer = setTimeout(async () => {
      const check = await checkIdentifierUniqueness({
        username: usernameCandidate || undefined,
        email: emailCandidate || undefined,
        phone: phoneCandidate || undefined
      });
      if (!cancelled) {
        setUniquenessStatus({
          checking: false,
          available: check.isUnique,
          reason: check.message
        });
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authTab, authMethod, usernameInput, emailInput, phoneInput]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setRegSubmitting(true);
    try {
      if (authTab === 'login') {
        if (authMethod === 'username') {
          const targetId = (loginIdentifierInput || usernameInput).trim();
          if (!targetId) {
            setAuthError('يرجى إدخال اسم المستخدم (@username) أو البريد الإلكتروني أو رقم الهاتف');
            setRegSubmitting(false);
            return;
          }
          await loginWithIdentifier(targetId, passwordInput || undefined);
        } else if (authMethod === 'phone') {
          if (!phoneInput.trim()) {
            setAuthError('يرجى إدخال رقم الهاتف اليمني (مثال: 771234567)');
            setRegSubmitting(false);
            return;
          }
          await loginPhone(phoneInput, passwordInput);
        } else {
          if (!emailInput.trim()) {
            setAuthError('يرجى إدخال البريد الإلكتروني');
            setRegSubmitting(false);
            return;
          }
          await loginEmail(emailInput, passwordInput);
        }
        setAuthSuccess('تم تسجيل الدخول ومزامنة حسابك السحابي بنجاح ✓');
        setActiveTab('student_dashboard');
      } else {
        // Check device single-account policy ONLY when attempting registration
        const fp = getDeviceFingerprint();
        setDevicePolicy((prev) => ({ ...prev, checking: true, deviceId: fp.deviceId }));
        const policyCheck = await checkDeviceSingleAccountPolicy();
        setDevicePolicy({
          checking: false,
          allowed: policyCheck.allowed,
          existingUid: policyCheck.existingUid,
          existingUsername: policyCheck.existingUsername,
          existingDisplayName: policyCheck.existingDisplayName,
          message: policyCheck.message,
          deviceId: fp.deviceId
        });
        if (!policyCheck.allowed) {
          if (policyCheck.existingUsername) {
            setLoginIdentifierInput(policyCheck.existingUsername);
          }
          setAuthError(policyCheck.message || 'هذا الجهاز مرتبط بحساب مسجل مسبقاً.');
          setRegSubmitting(false);
          return;
        }

        // Mandatory First-Time Student Registration with Device Verification & Anti-Similarity
        if (authMethod === 'username') {
          const fmt = validateUsernameFormat(usernameInput);
          if (!fmt.valid) {
            setAuthError(fmt.message || 'يجب أن يتكون اسم المستخدم من 4 أحرف إنجليزية على الأقل');
            setRegSubmitting(false);
            return;
          }
          const univObj = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === regUniversityId);
          const univNameArabic = univObj?.nameArabic || 'جامعة دار السلام الدولية للعلوم والتكنولوجيا';
          const combinedSpecialty = regCollegeArabic
            ? `${regCollegeArabic} — ${regSpecialtyArabic}`
            : regSpecialtyArabic;

          await registerWithUsername(
            usernameInput.trim(),
            passwordInput || undefined,
            displayNameInput.trim() || undefined,
            {
              avatarUrl: regAvatarUrl || undefined,
              universityId: regUniversityId,
              universityNameArabic: univNameArabic,
              specialtyArabic: combinedSpecialty,
              studyLevelId: regStudyLevelId
            }
          );

          saveUserAcademicContext({
            universityId: regUniversityId,
            universityNameArabic: univNameArabic,
            studyLevelId: regStudyLevelId
          });

          setAuthSuccess('تم تسجيل اسم المستخدم وتوثيق جهازك ومزامنة ملفك الأكاديمي في السحابة بنجاح ✓');
        } else if (authMethod === 'phone') {
          if (!phoneInput.trim()) {
            setAuthError('يرجى إدخال رقم الهاتف اليمني (مثال: 771234567)');
            setRegSubmitting(false);
            return;
          }
          await registerPhone(
            phoneInput,
            passwordInput,
            displayNameInput.trim() || `مستخدم ${phoneInput.trim()}`,
            academicIdInput.trim() || undefined
          );
          setAuthSuccess('تم إنشاء حسابك السحابي بنجاح ✓');
        } else {
          if (!emailInput.trim()) {
            setAuthError('يرجى إدخال البريد الإلكتروني');
            setRegSubmitting(false);
            return;
          }
          await registerEmail(
            emailInput,
            passwordInput,
            displayNameInput.trim() || emailInput.split('@')[0],
            academicIdInput.trim() || undefined
          );
          setAuthSuccess('تم إنشاء حسابك السحابي بنجاح ✓');
        }
        setActiveTab('student_dashboard');
      }
      setPasswordInput('');
    } catch (err: any) {
      let msg = err.message || 'حدث خطأ أثناء المصادقة';
      if (msg.includes('ACCOUNT_DELETED_FROM_CLOUD')) {
        msg = 'هذا الحساب تم حذفه نهائياً من السحابة. يمكنك تسجيل حساب جديد الآن.';
      } else if (msg.includes('ACCOUNT_ARCHIVED')) {
        msg = 'هذا الحساب مؤرشف وموقوف مؤقتاً من قِبل إدارة المنصة.';
      } else if (msg.includes('INVALID_PHONE_NUMBER')) {
        msg = 'يرجى إدخال رقم هاتف يمني صحيح مكوّن من 9 أرقام يبدأ بـ 70 أو 71 أو 73 أو 77 أو 78 (مثال: 771234567)';
      } else if (msg.includes('INVALID_EMAIL_FORMAT')) {
        msg = 'يرجى إدخال بريد إلكتروني صحيح';
      } else if (msg.includes('user-not-found') || msg.includes('invalid-credential')) {
        msg = 'اسم المستخدم أو كلمة المرور غير صحيحة';
      } else if (msg.includes('wrong-password')) {
        msg = 'كلمة المرور غير صحيحة';
      } else if (msg.includes('email-already-in-use')) {
        msg = 'اسم المستخدم هذا مستخدم مسبقاً في حساب آخر، يرجى اختيار اسم مستخدم فريد مختلف';
      } else if (msg.includes('weak-password')) {
        msg = 'كلمة المرور قصيرة جداً (يجب أن تكون 6 أحرف أو أرقام على الأقل)';
      }
      setAuthError(msg);
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleQuickLoginExistingDeviceAccount = async () => {
    if (!devicePolicy.existingUsername) return;
    setAuthError(null);
    setAuthSuccess(null);
    setRegSubmitting(true);
    try {
      await loginWithIdentifier(devicePolicy.existingUsername, passwordInput || undefined);
      setActiveTab('student_dashboard');
    } catch (err: any) {
      setAuthTab('login');
      setAuthMethod('username');
      setLoginIdentifierInput(devicePolicy.existingUsername);
      setAuthError('يرجى إدخال كلمة المرور الخاصة بحسابك للدخول');
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleUpdateCloudUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileUpdateLoading(true);
    setProfileUpdateMessage(null);
    try {
      const univObj = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === profileUniversityEdit);
      const univNameArabic = univObj?.nameArabic || 'جامعة دار السلام الدولية للعلوم والتكنولوجيا';

      const res = await updateFullProfile({
        newUsername: profileUsernameEdit.trim(),
        displayNameArabic: profileDisplayNameEdit.trim() || undefined,
        avatarUrl: profileAvatarEdit,
        universityId: profileUniversityEdit,
        universityNameArabic: univNameArabic,
        specialtyArabic: profileSpecialtyEdit,
        studyLevelId: profileStudyLevelEdit
      });

      saveUserAcademicContext({
        universityId: profileUniversityEdit,
        universityNameArabic: univNameArabic,
        studyLevelId: profileStudyLevelEdit
      });

      setProfileUpdateMessage({
        type: 'success',
        text: res.message
      });
    } catch (err: any) {
      setProfileUpdateMessage({
        type: 'error',
        text: err.message || 'تعذر تحديث بياناتك في السحابة'
      });
    } finally {
      setProfileUpdateLoading(false);
    }
  };

  const handleVerifyAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError(null);
    setVerifySuccess(null);
    setVerifyLoading(true);
    try {
      const res = await verifyCurrentAccount({
        phoneCodeInput: phoneOtpInput.trim() || undefined,
        emailCodeInput: emailOtpInput.trim() || undefined,
        checkFirebaseEmailLink: true
      });
      setVerifySuccess(res.message);
      if (res.verified) {
        setPhoneOtpInput('');
        setEmailOtpInput('');
      }
    } catch (err: any) {
      setVerifyError(err.message || 'تعذر التحقق من الرمز المدخل');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResendVerificationCodes = async () => {
    setVerifyError(null);
    setVerifySuccess(null);
    setVerifyLoading(true);
    try {
      const ch = await resendVerification();
      if (ch) {
        setVerifySuccess(
          ch.verificationMethod === 'phone'
            ? 'تم إصدار وإرسال رمز توثيق جديد لرقم الهاتف بنجاح'
            : 'تم إصدار وإرسال رمز ورابط توثيق جديد للبريد الإلكتروني بنجاح'
        );
      }
    } catch (err: any) {
      setVerifyError(err.message || 'تعذر إعادة إرسال رمز التحقق');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleConfirmDeleteOwnAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmText.trim() !== 'حذف حسابي') {
      setDeleteAccountError('يرجى كتابة عبارة "حذف حسابي" للتأكيد النهائي.');
      return;
    }
    setDeleteAccountLoading(true);
    setDeleteAccountError(null);
    try {
      await deleteOwnAccount();
      setShowDeleteAccountModal(false);
      setDeleteConfirmText('');
      setAuthSuccess('تم حذف حسابك وجميع بياناته من المنصة والسحابة نهائياً.');
    } catch (err: any) {
      setDeleteAccountError(err.message || 'تعذر حذف الحساب من السحابة');
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError(null);
    setAuthSuccess(null);
    try {
      await loginGoogle();
      setAuthSuccess('تم تسجيل الدخول بواسطة Google بنجاح');
      setActiveTab('student_dashboard');
    } catch (err: any) {
      let msg = err.message || 'تعذر تسجيل الدخول بواسطة Google';
      if (msg.includes('ACCOUNT_DELETED_FROM_CLOUD')) {
        msg = 'هذا الحساب تم حذفه نهائياً من السحابة.';
      } else if (msg.includes('ACCOUNT_ARCHIVED')) {
        msg = 'هذا الحساب مؤرشف وموقوف مؤقتاً من قِبل إدارة المنصة.';
      } else if (msg.includes('unauthorized-domain')) {
        msg = 'نطاق الموقع الحالي غير مضاف بعد في قائمة Authorized domains داخل إعدادات Firebase Authentication.';
      }
      setAuthError(msg);
    }
  };

  const handleBootstrapOwner = async () => {
    setBootstrapLoading(true);
    setBootstrapMessage(null);
    try {
      const result = await bootstrapInitialOwner();
      setBootstrapMessage(result.message);
      await refreshAdminData();
    } catch (err: any) {
      setBootstrapMessage(err.message || 'فشلت عملية الترقية');
    } finally {
      setBootstrapLoading(false);
    }
  };

  // Active Page Title Lookup for Contextual Top Header
  const getPageTitleInfo = (): { title: string; subtitle: string } => {
    switch (activeTab) {
      case 'student_dashboard':
        return { title: 'المقررات والبلوكات الدراسية', subtitle: 'استعراض البلوكات والمقررات والإشعارات المخصصة لجامعتك ودفعتك' };
      case 'student_library':
        return { title: 'المكتبة الطبية والشرائح والفيديو', subtitle: 'المحاضرات، الفيديوهات، الشرائح، والمراجع الطبية لدفعتك' };
      case 'student_assessments':
        return { title: 'الاختبارات والمسابقات السريرية', subtitle: 'الاختبارات الدورية والمسابقات التفاعلية مع التصحيح الفوري' };
      case 'student_profile':
        return { title: 'الملف الأكاديمي والتقدم', subtitle: 'البيانات الأكاديمية، نسبة إنجاز البلوكات، والنشاط الأخير' };
      case 'users_manager':
        return {
          title: 'إدارة المستخدمين وبيانات المالك الأساسي (حصري لمالك المنصة)',
          subtitle: 'عرض وتعديل وتوثيق وأرشفة وحذف وتصدير بيانات الحسابات مع المزامنة الفورية في السحابة'
        };
      case 'enrollment_queue':
        return { title: 'توثيق انضمام طلاب الدفعة', subtitle: 'التحقق من انتماء الطلاب المنضمين للدفعة وتوثيق عضويتهم الأكاديمية' };
      case 'academic':
        return { title: 'الهيكل الأكاديمي، البلوكات، والمواد', subtitle: 'إدارة الكليات، المستويات، البلوكات، والمقررات الدراسية' };
      case 'content_manager':
        return { title: 'إدارة الداتا والمكتبة الرقمية', subtitle: 'رفع ومشاركة ملفات PDF، الفيديوهات، الصور، التسجيلات، والروابط للدفعة' };
      case 'assessments_manager':
        return { title: 'إدارة الاختبارات والمسابقات', subtitle: 'إنشاء وتعديل وحذف بنوك الأسئلة، الامتحانات، والمسابقات' };
      case 'backup_restore':
        return { title: 'النسخ الاحتياطي والاستعادة', subtitle: 'تصدير واستيراد قواعد البيانات الأكاديمية المعتمدة' };
      case 'roles':
        return {
          title: 'الترقيات، دكاترة المواد، وإشعارات الدفعة',
          subtitle: 'ترقية مالكي الجامعات ومناديب الدفعات ورؤساء الأقسام، إضافة الدكاترة، وبث الإشعارات والداتا'
        };
      case 'audit':
        return { title: 'سجل التدقيق السحابي', subtitle: 'توثيق العمليات الإدارية والأكاديمية غير القابل للتعديل' };
      case 'auth':
        return { title: 'الإعدادات والحساب', subtitle: 'إعدادات المظهر (الوضع الليلي/النهاري)، توثيق الحساب، تبديل البوابة، أو حذف الحساب' };
      default:
        return { title: 'منصة UMED الطبية', subtitle: 'التعليم الطبي الموحد لكليات الطب البشري' };
    }
  };

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

  const pageInfo = getPageTitleInfo();

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
      {/* TOP-LEVEL SHARED EXAM LOADING OVERLAY (Opens immediately before Auth or Registration screen) */}
      {isGuestExamOpen && !sharedGuestData && !pendingGuestSubmission && isSharedExamFetching && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
          <div className="max-w-md w-full bg-slate-900 border border-indigo-500/40 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
            <RefreshCw className="w-10 h-10 animate-spin text-indigo-400 mx-auto" />
            <h2 className="text-base font-bold text-white">جارٍ فتح الاختبار الطبي المشترك...</h2>
            <p className="text-xs text-slate-300">
              يتم الآن تجهيز الأسئلة والمؤقت لبدء الحل المباشر
            </p>
          </div>
        </div>
      )}

      {/* TOP-LEVEL SHARED / GUEST EXAM TAKING MODAL (Works for both Guests & Authenticated Users regardless of Enrollment) */}
      {isGuestExamOpen && (sharedGuestData || pendingGuestSubmission) && (
        <React.Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
              <div className="max-w-md w-full bg-slate-900 border border-teal-500/40 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
                <RefreshCw className="w-9 h-9 animate-spin text-teal-400 mx-auto" />
                <h2 className="text-sm font-bold text-white">جارٍ فتح واجهة الاختبار التفاعلي...</h2>
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
              setAuthTab('register');
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
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-teal-500/50 rounded-2xl p-5 sm:p-6 max-w-xl w-full my-auto space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white">
                    نتيجتك المعتمدة وترتيبك في الاختبار المشترك
                  </h3>
                  <p className="text-[11px] text-teal-300 font-semibold">
                    {claimedGuestOutcome.assessment.titleArabic}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setClaimedGuestOutcome(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-gradient-to-b from-teal-950/70 to-slate-950 border border-teal-500/40 text-center space-y-2">
              <span className="px-3 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                تم تصحيح إجاباتك بنجاح ✓
              </span>
              <div className="text-3xl font-black text-teal-400 font-mono pt-1">
                {claimedGuestOutcome.result.percentage}%
              </div>
              <div className="text-xs text-slate-200 font-semibold">
                الدرجة المكتسبة: <span className="font-mono text-white">{claimedGuestOutcome.result.score}</span> من{' '}
                <span className="font-mono text-white">{claimedGuestOutcome.result.totalPoints}</span> نقطة
              </div>
              <div className="text-[11px] text-slate-400">
                اسمك المعروض للطلاب في لوحة الترتيب:{' '}
                <strong className="text-amber-300">
                  {resolveResultPublicDisplayName(claimedGuestOutcome.result)}
                </strong>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                <span>🏆 ترتيب الطلاب في هذا الاختبار (الأعلى درجة والأسرع حلاً):</span>
                <span className="text-[11px] text-slate-400 font-mono">{claimedLeaderboard.length} مشارك</span>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {claimedLeaderboard.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-teal-300 text-center font-bold">
                    أنت في المركز الأول (#1) حالياً في هذا الاختبار! 🎉
                  </div>
                ) : (
                  claimedLeaderboard.slice(0, 15).map((item, idx) => {
                    const isMe = item.uid === user?.uid || item.id === claimedGuestOutcome.result.id;
                    return (
                      <div
                        key={item.id || idx}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                          isMe
                            ? 'bg-teal-950/70 border-teal-500/60 text-white font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-lg font-mono text-[11px] font-extrabold flex items-center justify-center ${
                            idx === 0
                              ? 'bg-amber-400 text-slate-950'
                              : idx === 1
                              ? 'bg-slate-300 text-slate-950'
                              : idx === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            #{idx + 1}
                          </span>
                          <span>{resolveResultPublicDisplayName(item)}</span>
                          {isMe && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-500/20 text-teal-300">
                              أنت
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-400 text-[11px]">{item.score}/{item.totalPoints}</span>
                          <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 font-bold">
                            {item.percentage}%
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadExamBookletFile({
                    assessment: claimedGuestOutcome.assessment,
                    result: claimedGuestOutcome.result,
                    studentNameArabic: userProfile?.displayNameArabic || user?.displayName || undefined,
                    mode: 'solved'
                  })
                }
                className="py-2.5 px-3 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download className="w-4 h-4 text-teal-400 shrink-0" />
                <span>تحميل الاختبار محلولاً (مع التعليل)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadExamBookletFile({
                    assessment: claimedGuestOutcome.assessment,
                    result: claimedGuestOutcome.result,
                    studentNameArabic: userProfile?.displayNameArabic || user?.displayName || undefined,
                    mode: 'blank'
                  })
                }
                className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                <span>تحميل نسخة غير محلولة للتدريب</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setClaimedGuestOutcome(null)}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg transition-colors"
            >
              متابعة إلى المنصة الأكاديمية
            </button>
          </div>
        </div>
      )}

      {/* IF INITIALIZING AUTH SESSION ON RELOAD */}
      {loading ? (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-md w-full my-auto bg-slate-900/80 border border-slate-800 rounded-2xl p-8 sm:p-10 text-center space-y-3 shadow-2xl">
            <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
            <h2 className="text-sm font-bold text-white">جارٍ تحضير منصة {platformSettings.platformNameArabic}</h2>
            <p className="text-xs text-slate-400">يرجى الانتظار لحظة ريثما يتم مزامنة البيانات السحابية</p>
          </div>
        </div>
      ) : isAccountArchived ? (
        /* ARCHIVED ACCOUNT GATE */
        <div className="min-h-[100dvh] flex flex-col justify-center py-8 px-4 overflow-y-auto">
          <div className="max-w-md w-full mx-auto bg-slate-900/95 border border-amber-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400">
              <Archive className="w-7 h-7" />
            </div>
            <h1 className="text-base font-bold text-white">هذا الحساب مؤرشف وموقوف حالياً</h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              تم أرشفة حسابك في قاعدة البيانات السحابية من قِبل مالك المنصة. لا يمكنك الوصول إلى المحتوى الدراسي بهذا الحساب حتى يتم إلغاء الأرشفة.
            </p>
            {userProfile?.archiveReason && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-amber-300">
                سبب الأرشفة: {userProfile.archiveReason}
              </div>
            )}
            <button
              onClick={logout}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      ) : !user ? (
        /* MANDATORY FIRST-TIME STUDENT REGISTRATION & DEVICE VERIFICATION GATE */
        <div className="min-h-[100dvh] flex flex-col justify-center py-6 px-3.5 sm:px-6 overflow-y-auto">
          <div className="max-w-xl w-full mx-auto bg-slate-900/95 border border-teal-500/40 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-5">
            
            {/* Brand Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <PlatformLogoBadge settings={platformSettings} size="md" />
                <div className="min-w-0">
                  <h1 className="text-base sm:text-lg font-extrabold text-white truncate">
                    {platformSettings.platformNameArabic}
                  </h1>
                  <p className="text-xs text-teal-400 font-semibold">
                    تسجيل اسم المستخدم الإجباري للطالب وتوثيق الجهاز (لمرة واحدة عند فتح المنصة)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLegalContactModalState({ isOpen: true, initialTab: 'contact' })}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold shrink-0"
              >
                المساعدة والشروط
              </button>
            </div>

            {/* Device Single-Account Verification Banner */}
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                devicePolicy.checking
                  ? 'bg-slate-950 border-slate-800 text-slate-300'
                  : devicePolicy.allowed
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold">
                  <Smartphone className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>نظام التحقق من الهاتف لمنع تعدد الحسابات:</span>
                </div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400" dir="ltr">
                  ID: {devicePolicy.deviceId.slice(-10)}
                </span>
              </div>

              {devicePolicy.checking ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" />
                  <span>جارٍ فحص بصمة الجهاز والتحقق من عدم وجود حساب مسبق على هذا الهاتف...</span>
                </div>
              ) : devicePolicy.allowed ? (
                <p className="text-[11px] text-emerald-300 leading-relaxed">
                  ✓ هذا الهاتف موثّق ومتاح لتسجيل حساب طالب واحد فريد. يُربط الحساب تلقائياً ببصمة هاتفك لمنع فتح أكثر من حساب من نفس الهاتف.
                </p>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-amber-200 leading-relaxed font-semibold">
                    {devicePolicy.message}
                  </p>
                  {devicePolicy.existingUsername && (
                    <button
                      type="button"
                      onClick={handleQuickLoginExistingDeviceAccount}
                      disabled={regSubmitting}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-colors"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>
                        الدخول الفوري بحسابك المرتبط بهذا الهاتف (@{devicePolicy.existingUsername})
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tab Switcher: First-Time Student Registration vs Returning User / Owner Login */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('register');
                  setAuthMethod('username');
                  setAuthError(null);
                }}
                className={`flex-1 py-2.5 rounded-lg font-bold transition-colors ${
                  authTab === 'register'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                تسجيل طالب جديد (@username)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('login');
                  setAuthError(null);
                }}
                className={`flex-1 py-2.5 rounded-lg font-bold transition-colors ${
                  authTab === 'login'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                تسجيل الدخول لحساب مسجل / المالك
              </button>
            </div>

            {authTab === 'login' && (
              <div className="grid grid-cols-3 gap-2 bg-slate-950/70 p-1 rounded-xl border border-slate-800/80 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('username');
                    setAuthError(null);
                  }}
                  className={`py-2 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    authMethod === 'username'
                      ? 'bg-slate-800 text-teal-300 border border-teal-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <AtSign className="w-3.5 h-3.5" />
                  <span>باسم المستخدم</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('phone');
                    setAuthError(null);
                  }}
                  className={`py-2 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    authMethod === 'phone'
                      ? 'bg-slate-800 text-teal-300 border border-teal-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>برقم الهاتف</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('email');
                    setAuthError(null);
                  }}
                  className={`py-2 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    authMethod === 'email'
                      ? 'bg-slate-800 text-teal-300 border border-teal-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>بالبريد الإلكتروني</span>
                </button>
              </div>
            )}

            {authError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccess && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                <span>{authSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4 text-xs">
              {authTab === 'register' ? (
                <>
                  {/* 1. Mandatory Username Input (Minimum 4 English Letters, Capital === Small, Anti-Similarity) */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <label className="block text-slate-200 font-bold flex items-center justify-between flex-wrap gap-1">
                      <span>1. اسم المستخدم الإجباري للطالب (@username) *</span>
                      <span className="text-[10px] text-teal-400 font-semibold">
                        أقل اسم 4 أحرف إنجليزية • الحرف الكبير والصغير بنفس القيمة (A = a)
                      </span>
                    </label>
                    <div className="relative" dir="ltr">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400 font-mono font-bold text-sm">
                        @
                      </span>
                      <input
                        type="text"
                        required
                        value={usernameInput}
                        onChange={(e) =>
                          setUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ''))
                        }
                        placeholder="AhmedMed"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    {usernameInput.trim() && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                        <span>الاسم الموحد في السحابة (Capital = Small):</span>
                        <code className="text-teal-300 font-mono font-bold" dir="ltr">
                          @{normalizeUsername(usernameInput)}
                        </code>
                      </div>
                    )}

                    {/* Live Uniqueness & Anti-Similarity Indicator */}
                    {(uniquenessStatus.checking || uniquenessStatus.available !== null) && (
                      <div
                        className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                          uniquenessStatus.checking
                            ? 'bg-slate-900 border-slate-800 text-slate-400'
                            : uniquenessStatus.available
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                            : 'bg-rose-950/50 border-rose-500/50 text-rose-300'
                        }`}
                      >
                        {uniquenessStatus.checking ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400 shrink-0" />
                            <span>جارٍ فحص تفرد الاسم وعدم تشابهه مع أي حساب آخر في السحابة...</span>
                          </>
                        ) : uniquenessStatus.available ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>اسم المستخدم فريد ومطابق للشروط (4+ أحرف إنجليزية وبدون تشابه) ✓</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span>{uniquenessStatus.reason}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 2. Profile Picture Upload / Preset Avatars */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-slate-200 flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-teal-400" />
                        <span>2. صورة الملف الشخصي (رفع من الهاتف أو اختيار رمز طبي):</span>
                      </span>
                      {regAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => setRegAvatarUrl('')}
                          className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                        >
                          إزالة الصورة
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 border-2 border-teal-500/40 flex items-center justify-center overflow-hidden shrink-0">
                        {regAvatarUrl ? (
                          <img
                            src={regAvatarUrl}
                            alt="صورة الطالب"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Stethoscope className="w-6 h-6 text-teal-400" />
                        )}
                      </div>

                      <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 font-bold text-xs flex items-center gap-1.5 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>رفع صورة من الهاتف</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleRegPhotoUpload}
                          className="hidden"
                        />
                      </label>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {MEDICAL_PRESET_AVATARS.map((presetUrl, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setRegAvatarUrl(presetUrl)}
                            title={`رمزية طبية ${idx + 1}`}
                            className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-all ${
                              regAvatarUrl === presetUrl
                                ? 'border-teal-400 scale-105 shadow-md'
                                : 'border-slate-800 opacity-75 hover:opacity-100'
                            }`}
                          >
                            <img src={presetUrl} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 3. University, College, Specialty & Study Level Selection */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="font-bold text-slate-200 flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-teal-400" />
                      <span>3. البيانات الأكاديمية للطالب (الاسم الثلاثي، الجامعة، الكلية، التخصص، والمستوى):</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-400 mb-1 text-[11px]">الجامعة:</label>
                        <select
                          value={regUniversityId}
                          onChange={(e) => setRegUniversityId(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-teal-500"
                        >
                          {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.nameArabic}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1 text-[11px]">الكلية:</label>
                        <select
                          value={regCollegeArabic}
                          onChange={(e) => setRegCollegeArabic(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-teal-500"
                        >
                          <option value="كلية الطب البشري والعلوم الصحية">كلية الطب البشري والعلوم الصحية</option>
                          <option value="كلية الطب والعلوم الصحية">كلية الطب والعلوم الصحية</option>
                          <option value="كلية طب الأسنان">كلية طب الأسنان</option>
                          <option value="كلية الصيدلة السريرية">كلية الصيدلة السريرية</option>
                          <option value="كلية المختبرات والعلوم الطبية">كلية المختبرات والعلوم الطبية</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1 text-[11px]">التخصص:</label>
                        <select
                          value={regSpecialtyArabic}
                          onChange={(e) => setRegSpecialtyArabic(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-teal-500"
                        >
                          {MEDICAL_SPECIALTIES_OPTIONS.map((sp) => (
                            <option key={sp.id} value={sp.nameArabic}>
                              {sp.nameArabic}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1 text-[11px]">المستوى الدراسي:</label>
                        <select
                          value={regStudyLevelId}
                          onChange={(e) => setRegStudyLevelId(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-teal-300 font-bold text-xs focus:outline-none focus:border-teal-500"
                        >
                          {STUDY_LEVELS_OPTIONS.map((lvl) => (
                            <option key={lvl.id} value={lvl.id}>
                              {lvl.nameArabic}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="block text-slate-400 mb-1 text-[11px]">
                          الاسم الثلاثي بالعربية *:
                        </label>
                        <input
                          type="text"
                          required
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          placeholder="مثال: أحمد محمد علي"
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1 text-[11px]">
                          كلمة مرور لحسابك (اختياري — للتأمين الإضافي):
                        </label>
                        <input
                          type="password"
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder="اختياري (أو اتركه فارغاً للدخول الفوري)"
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-teal-500"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* LOGIN FORM FOR RETURNING STUDENTS OR PLATFORM OWNER */
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  {authMethod === 'username' ? (
                    <div>
                      <label className="block text-slate-300 mb-1 font-semibold">
                        اسم المستخدم (@username) أو البريد الإلكتروني أو رقم الهاتف:
                      </label>
                      <input
                        type="text"
                        required
                        value={loginIdentifierInput}
                        onChange={(e) => setLoginIdentifierInput(e.target.value)}
                        placeholder="@ahmedmed أو email@example.com"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-teal-500"
                        dir="ltr"
                      />
                    </div>
                  ) : authMethod === 'phone' ? (
                    <div>
                      <label className="block text-slate-300 mb-1 font-semibold">رقم الهاتف المحمول:</label>
                      <div className="flex items-center gap-2" dir="ltr">
                        <span className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-teal-400 font-mono font-bold select-none shrink-0">
                          +967
                        </span>
                        <input
                          type="tel"
                          required
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          placeholder="771234567"
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-teal-500"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-slate-300 mb-1 font-semibold">البريد الإلكتروني:</label>
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-teal-500"
                        dir="ltr"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">
                      كلمة المرور {authMethod === 'username' ? '(اتركها فارغة إذا سجلت بدون كلمة مرور)' : ''}:
                    </label>
                    <input
                      type="password"
                      required={authMethod !== 'username'}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-teal-500"
                      dir="ltr"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  regSubmitting ||
                  (authTab === 'register' &&
                    (!devicePolicy.allowed || uniquenessStatus.available === false))
                }
                className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/25"
              >
                {regSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                <span>
                  {authTab === 'login'
                    ? 'تسجيل الدخول إلى المنصة'
                    : !devicePolicy.allowed
                    ? 'هذا الهاتف مرتبط بحساب مسجل مسبقاً (استخدم زر الدخول أعلاه)'
                    : 'اعتماد تسجيل اسم المستخدم والدخول للمنصة'}
                </span>
              </button>
            </form>

            {authTab === 'login' && (
              <>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-800"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px]">
                    <span className="bg-slate-900 px-3 text-slate-500">أو الدخول عبر Google</span>
                  </div>
                </div>

                <button
                  onClick={handleGoogleAuth}
                  disabled={regSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow border border-slate-300"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.87c2.26-2.09 3.67-5.17 3.67-9.15z"/>
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.05c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.15C3.29 21.36 7.35 24 12 24z"/>
                    <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.26C.46 8.2.01 9.99.01 12c0 2.01.45 3.8 1.25 5.39l4.01-3.15z"/>
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.29 2.64 1.26 6.61l4.01 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
                  </svg>
                  <span>الدخول بحساب Google</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        /* AUTHENTICATED WORKSPACE WITH RTL SIDEBAR NAVIGATION */
        <div className="min-h-[100dvh] flex overflow-x-hidden w-full max-w-full">
          
          {/* Mobile Sidebar Backdrop */}
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 lg:hidden"
            />
          )}

          {/* RTL SIDEBAR MENU (قائمة جانبية) */}
          <aside
            className={`fixed lg:sticky top-0 right-0 z-50 h-[100dvh] w-64 max-w-[82vw] bg-slate-900 border-l border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 ${
              sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
            }`}
          >
            {/* Top Brand Header inside Sidebar */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <PlatformLogoBadge settings={platformSettings} size="md" />
                <div className="min-w-0">
                  <div className="font-bold text-sm text-white leading-tight truncate">
                    {platformSettings.platformNameArabic}
                  </div>
                  <div className="text-[11px] text-teal-400 font-semibold mt-0.5 truncate">
                    {activeRole === 'platform_owner'
                      ? 'بوابة مالك المنصة'
                      : activeRole === 'university_admin'
                      ? 'بوابة مالك الجامعة'
                      : activeRole === 'batch_rep'
                      ? 'بوابة مندوب الدفعة / المستوى'
                      : activeRole === 'department_head'
                      ? 'بوابة رئيس القسم / المادة'
                      : 'بوابة طالب الطب البشري'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
                title="إغلاق القائمة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Page Links inside Sidebar */}
            <div className="flex-1 overflow-y-auto p-3 space-y-5">
              
              {/* STUDENT NAVIGATION ITEMS */}
              {!isAdminMode && (
                <div className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    الأقسام الأكاديمية للطالب
                  </div>

                  <button
                    onClick={() => setActiveTab('student_dashboard')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'student_dashboard'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Stethoscope className="w-4 h-4 shrink-0" />
                    <span>المقررات والبلوكات الدراسية</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('student_library')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'student_library'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 shrink-0" />
                    <span>المكتبة الطبية والشرائح</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('student_assessments')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'student_assessments'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Trophy className="w-4 h-4 shrink-0" />
                    <span>الاختبارات والمسابقات</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('student_profile')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'student_profile'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span>الملف الأكاديمي والتقدم</span>
                  </button>
                </div>
              )}

              {/* LEADERSHIP NAVIGATION ITEMS (Platform Owner, University Owner, Batch Rep, Dept Head) */}
              {isAdminMode && (
                <div className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-relaxed">
                    إدارة الجامعة والدفعة — {renderBiDiRoleLabel(activeRole)}
                  </div>

                  {isOwnerMode && (
                    <button
                      onClick={() => setActiveTab('users_manager')}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        activeTab === 'users_manager'
                          ? 'bg-amber-600 text-slate-950 font-bold shadow-md shadow-amber-600/20'
                          : 'text-amber-300 hover:text-white hover:bg-slate-800/70 border border-amber-500/20'
                      }`}
                    >
                      <Crown className="w-4 h-4 shrink-0" />
                      <span>إدارة المستخدمين وبيانات المالك</span>
                    </button>
                  )}

                  <button
                    onClick={() => setActiveTab('roles')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'roles'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>الترقيات، الدكاترة، والإشعارات</span>
                  </button>

                  {isUniversityAdminOrOwner && (
                    <button
                      onClick={() => setActiveTab('enrollment_queue')}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        activeTab === 'enrollment_queue'
                          ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                      }`}
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <span>توثيق طلاب الدفعة</span>
                    </button>
                  )}

                  <button
                    onClick={() => setActiveTab('academic')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'academic'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Building2 className="w-4 h-4 shrink-0" />
                    <span>البلوكات، المواد، والهيكل</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('content_manager')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'content_manager'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 shrink-0" />
                    <span>إدارة الداتا والمكتبة</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('assessments_manager')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'assessments_manager'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Trophy className="w-4 h-4 shrink-0" />
                    <span>إدارة الاختبارات والمسابقات</span>
                  </button>

                  {isOwnerMode && (
                    <button
                      onClick={() => setActiveTab('backup_restore')}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        activeTab === 'backup_restore'
                          ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                      }`}
                    >
                      <HardDrive className="w-4 h-4 shrink-0" />
                      <span>النسخ الاحتياطي والاستعادة</span>
                    </button>
                  )}

                  <button
                    onClick={() => setActiveTab('audit')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'audit'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span>سجل التدقيق السحابي</span>
                  </button>
                </div>
              )}

              {/* SETTINGS & ACCOUNT SECTION */}
              <div className="space-y-1 pt-2 border-t border-slate-800">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  النظام والحساب
                </div>
                <button
                  onClick={() => {
                    setIsNotificationModalOpen(true);
                    setSidebarOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/70 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>مركز التنبيهات والإشعارات</span>
                  </div>
                  {unreadNotificationCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow">
                      {unreadNotificationCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('auth')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === 'auth'
                      ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`}
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>الإعدادات والحساب (@username)</span>
                </button>
                <button
                  onClick={() => {
                    setLegalContactModalState({ isOpen: true, initialTab: 'contact' });
                    setSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-teal-300 hover:bg-slate-800/60 transition-all"
                >
                  <Phone className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>التواصل والشروط والخصوصية</span>
                </button>
              </div>

              {/* Quick 4-Theme Selector inside Sidebar Drawer */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  مظهر المنصة (4 ثيمات)
                </div>
                <div className="grid grid-cols-4 gap-1 px-1">
                  {THEME_OPTIONS.map((opt) => {
                    const IconComp = opt.icon;
                    const isActive = theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTheme(opt.id)}
                        className={`py-1.5 px-1 rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                          isActive
                            ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                            : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        <IconComp className="w-3.5 h-3.5 shrink-0" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <PWASidebarInstallCard />
            </div>

            {/* Sidebar User Card Footer */}
            <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-600/20 border border-teal-500/40 flex items-center justify-center overflow-hidden shrink-0">
                  {userProfile?.avatarUrl ? (
                    <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Stethoscope className="w-5 h-5 text-teal-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white leading-snug truncate">
                    {userProfile?.displayNameArabic || user.displayName || 'مستخدم UMED'}
                  </div>
                  <div className="text-[11px] text-teal-300 font-mono truncate" dir="ltr">
                    {formatUserIdentifier(user.email, userProfile?.phone, userProfile?.username)}
                  </div>
                </div>
              </div>
              <span
                className={`block text-center px-2.5 py-1 rounded-lg text-[10px] font-bold leading-snug ${
                  isOwnerMode
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : isAdminMode
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                }`}
              >
                {renderBiDiRoleLabel(activeRole)}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setActiveTab('auth')}
                  className="py-2 px-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تعديل الحساب</span>
                </button>
                <button
                  onClick={logout}
                  className="py-2 px-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/50 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              </div>
            </div>
          </aside>

          {/* MAIN WORKSPACE CONTENT AREA */}
          <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden">
            
            {/* Clean Contextual Top Bar */}
            <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-3.5 py-2.5 sm:px-6 sm:py-3">
              <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 lg:hidden transition-colors shrink-0"
                    title="فتح القائمة الجانبية"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <h1 className="text-sm sm:text-base font-bold text-white truncate">{pageInfo.title}</h1>
                    <p className="text-[11px] text-slate-400 hidden sm:block truncate">{pageInfo.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    onClick={() => setActiveTab('auth')}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-mono font-bold transition-colors"
                    dir="ltr"
                    title="تعديل الصورة والبيانات واسم المستخدم الفريد"
                  >
                    {userProfile?.avatarUrl && (
                      <img
                        src={userProfile.avatarUrl}
                        alt="Avatar"
                        className="w-5 h-5 rounded-md object-cover"
                      />
                    )}
                    <span>@{userProfile?.username || 'student'}</span>
                  </button>

                  {isAuthorizedAdmin && (
                    <button
                      onClick={() => {
                        if (activeRole === 'student') {
                          const targetRole = realRole !== 'student' ? realRole : (roleDoc?.role || 'university_admin');
                          setActiveRole(targetRole);
                          setActiveTab(targetRole === 'platform_owner' ? 'users_manager' : 'roles');
                        } else {
                          setActiveRole('student');
                          setActiveTab('student_dashboard');
                        }
                      }}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        activeRole === 'student'
                          ? 'bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border-teal-500/40'
                          : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                      }`}
                      title="التبديل السريع بين بوابة الإدارة ومعاينة واجهة الطالب"
                    >
                      {activeRole === 'student' ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                          <span className="hidden xs:inline sm:inline">العودة للإدارة</span>
                        </>
                      ) : (
                        <>
                          <GraduationCap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="hidden sm:inline">معاينة كطالب</span>
                        </>
                      )}
                    </button>
                  )}

                  <div className="hidden sm:block">
                    <PWAHeaderControls />
                  </div>

                  <button
                    onClick={() => setIsNotificationModalOpen(true)}
                    className="relative p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    title="مركز التنبيهات والإشعارات الفورية"
                  >
                    <Bell className="w-4 h-4 text-sky-400" />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-slate-900 animate-pulse">
                        {unreadNotificationCount > 9 ? '+9' : unreadNotificationCount}
                      </span>
                    )}
                  </button>

                  {/* Single Active Theme Button with Popover Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setThemeMenuOpen((prev) => !prev)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                      title="تغيير مظهر وثيم المنصة"
                    >
                      {(() => {
                        const ActiveIcon = activeThemeOption.icon;
                        return <ActiveIcon className="w-4 h-4 text-teal-400 shrink-0" />;
                      })()}
                      <span>{activeThemeOption.label}</span>
                      <span className="text-[10px] opacity-70">▾</span>
                    </button>

                    {themeMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setThemeMenuOpen(false)}
                        />
                        <div
                          className="absolute left-0 top-full mt-2 w-48 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-50 space-y-1"
                          dir="rtl"
                        >
                          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 border-b border-slate-800">
                            اختر مظهر المنصة
                          </div>
                          {THEME_OPTIONS.map((opt) => {
                            const IconComp = opt.icon;
                            const isSelected = theme === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setTheme(opt.id)}
                                className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all ${
                                  isSelected
                                    ? 'bg-teal-600 text-white shadow-sm'
                                    : 'text-slate-200 hover:bg-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <IconComp className="w-4 h-4 shrink-0" />
                                  <div className="text-right">
                                    <div>{opt.label}</div>
                                    <div className={`text-[10px] font-normal ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                                      {opt.subtitle}
                                    </div>
                                  </div>
                                </div>
                                {isSelected && <Check className="w-4 h-4 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </header>

            {/* Page Content Viewport */}
            <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 py-4 pb-28 sm:px-6 sm:py-6 sm:pb-8 space-y-4">
              
              {/* Claimed Guest Trial Exam Result Celebration Banner */}
              {claimedGuestOutcome && (
                <div className="bg-gradient-to-l from-teal-950/90 via-slate-900 to-indigo-950/90 border border-teal-500/50 rounded-2xl p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                        تم تصحيح اختبارك ورصد نتيجتك ✓
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-white">
                      نتيجتك في "{claimedGuestOutcome.assessment.titleArabic}":{' '}
                      <span className="text-teal-400 font-mono">
                        {claimedGuestOutcome.result.score} / {claimedGuestOutcome.result.totalPoints} ({claimedGuestOutcome.result.percentage}%)
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300">
                      اسمك المعروض في لوحة الترتيب أمام الطلاب:{' '}
                      <strong className="text-amber-300">
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
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg"
                    >
                      عرض لوحة الترتيب والنتائج
                    </button>
                    <button
                      onClick={() => setClaimedGuestOutcome(null)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                      title="إغلاق"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STUDENT WORKSPACE VIEWS (Works seamlessly with or without login) */}
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
                    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4 animate-pulse" dir="rtl">
                      <div className="h-6 w-48 bg-slate-800 rounded-lg" />
                      <div className="h-32 bg-slate-800/70 rounded-xl" />
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
                    <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
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
                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-teal-400" />
                        <span>سجل التدقيق السحابي غير القابل للتعديل (auditLogs)</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        يوثق عمليات ترقية المالك، تعيين المشرفين، تهيئة الجامعات، واعتماد القيد وتصحيح الاختبارات
                      </p>
                    </div>
                    <button
                      onClick={refreshAdminData}
                      className="py-1.5 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>تحديث السجل</span>
                    </button>
                  </div>

                  {auditLogs.length === 0 ? (
                    <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs">
                      لا توجد سجلات تدقيق حالياً.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                              log.action === 'OWNER_PROVISIONED' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              log.action === 'ASSESSMENT_SCORED' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' :
                              'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            }`}>
                              {log.action}
                            </span>
                            <span className="text-slate-200 font-semibold">
                              بواسطة: <code className="text-teal-300 font-mono">{log.performedBy}</code>
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                            <span>{new Date(log.timestamp).toLocaleString('ar-YE')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: SETTINGS, APPEARANCE & CLOUD ACCOUNT (الإعدادات والحساب) */}
              {activeTab === 'auth' && (
                <div className="max-w-3xl mx-auto space-y-6">

                  {/* IF NOT LOGGED IN: FRICTIONLESS ACCOUNT CREATION & LOGIN CARD */}
                  {!user && (
                    <div className="bg-slate-900/90 border border-teal-500/40 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0">
                            <AtSign className="w-6 h-6" />
                          </div>
                          <div>
                            <h2 className="text-base sm:text-lg font-extrabold text-white">
                              إنشاء حساب سحابي فوري أو تسجيل الدخول
                            </h2>
                            <p className="text-xs text-slate-400">
                              أنشئ حسابك فوراً باسم مستخدم فريد (@username) وكلمة مرور فقط بدون توثيق إيميل أو رقم أكاديمي أو أي تعقيدات
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                        <button
                          type="button"
                          onClick={() => { setAuthTab('register'); setAuthError(null); }}
                          className={`flex-1 py-2.5 rounded-lg font-bold transition-colors ${authTab === 'register' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                          إنشاء حساب فوري (بدون تعقيدات)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAuthTab('login'); setAuthError(null); }}
                          className={`flex-1 py-2.5 rounded-lg font-bold transition-colors ${authTab === 'login' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                          تسجيل الدخول لحسابك
                        </button>
                      </div>

                      {/* Method Toggle */}
                      <div className="grid grid-cols-3 gap-2 bg-slate-950/70 p-1 rounded-xl border border-slate-800/80 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMethod('username');
                            setAuthError(null);
                            setUniquenessStatus({ checking: false, available: null });
                          }}
                          className={`py-2 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                            authMethod === 'username'
                              ? 'bg-slate-800 text-teal-300 border border-teal-500/40 shadow-xs'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <AtSign className="w-3.5 h-3.5" />
                          <span>باسم المستخدم الفريد</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMethod('phone');
                            setAuthError(null);
                            setUniquenessStatus({ checking: false, available: null });
                          }}
                          className={`py-2 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                            authMethod === 'phone'
                              ? 'bg-slate-800 text-teal-300 border border-teal-500/40 shadow-xs'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>برقم الهاتف</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMethod('email');
                            setAuthError(null);
                            setUniquenessStatus({ checking: false, available: null });
                          }}
                          className={`py-2 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                            authMethod === 'email'
                              ? 'bg-slate-800 text-teal-300 border border-teal-500/40 shadow-xs'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>بالبريد الإلكتروني</span>
                        </button>
                      </div>

                      {authError && (
                        <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{authError}</span>
                        </div>
                      )}

                      {authSuccess && (
                        <div className="p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                          <span>{authSuccess}</span>
                        </div>
                      )}

                      <form onSubmit={handleAuthSubmit} className="space-y-3.5 text-xs">
                        {authMethod === 'username' ? (
                          authTab === 'register' ? (
                            <div>
                              <label className="block text-slate-300 mb-1 font-semibold flex items-center justify-between">
                                <span>اسم المستخدم الفريد الخاص بك (@username):</span>
                                <span className="text-[10px] text-teal-400 font-normal">يُحفظ سحابياً باسمك ويمكنك تعديله لاحقاً</span>
                              </label>
                              <div className="relative" dir="ltr">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400 font-mono font-bold text-sm">@</span>
                                <input
                                  type="text"
                                  required
                                  value={usernameInput}
                                  onChange={(e) => setUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '').toLowerCase())}
                                  placeholder="dr_ahmed"
                                  className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-teal-500"
                                />
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1">
                                حروف إنجليزية أو أرقام أو شرطة سفلية (_) من 3 إلى 30 حرفاً — بدون إيميل أو رقم أكاديمي.
                              </p>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-slate-300 mb-1 font-semibold">
                                اسم المستخدم (@username) أو البريد الإلكتروني أو رقم الهاتف:
                              </label>
                              <input
                                type="text"
                                required
                                value={loginIdentifierInput}
                                onChange={(e) => setLoginIdentifierInput(e.target.value)}
                                placeholder="@dr_ahmed أو email@example.com أو 771234567"
                                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-teal-500"
                                dir="ltr"
                              />
                            </div>
                          )
                        ) : authMethod === 'phone' ? (
                          <div>
                            <label className="block text-slate-300 mb-1 font-semibold">رقم الهاتف المحمول:</label>
                            <div className="flex items-center gap-2" dir="ltr">
                              <span className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-teal-400 font-mono font-bold select-none shrink-0">
                                +967
                              </span>
                              <input
                                type="tel"
                                required
                                value={phoneInput}
                                onChange={(e) => setPhoneInput(e.target.value)}
                                placeholder="771234567"
                                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-teal-500"
                                dir="ltr"
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-slate-300 mb-1 font-semibold">البريد الإلكتروني:</label>
                            <input
                              type="email"
                              required
                              value={emailInput}
                              onChange={(e) => setEmailInput(e.target.value)}
                              placeholder="name@example.com"
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-teal-500"
                              dir="ltr"
                            />
                          </div>
                        )}

                        {authTab === 'register' && (
                          <div>
                            <label className="block text-slate-300 mb-1 font-semibold">
                              الاسم المعروض في المنصة (اختياري):
                            </label>
                            <input
                              type="text"
                              value={displayNameInput}
                              onChange={(e) => setDisplayNameInput(e.target.value)}
                              placeholder="مثال: د. أحمد محمد (اختياري)"
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                            />
                          </div>
                        )}

                        {/* Live Uniqueness Check Indicator during Registration */}
                        {authTab === 'register' && (uniquenessStatus.checking || uniquenessStatus.available !== null) && (
                          <div
                            className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                              uniquenessStatus.checking
                                ? 'bg-slate-950 border-slate-800 text-slate-400'
                                : uniquenessStatus.available
                                ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                                : 'bg-rose-950/50 border-rose-800/80 text-rose-300'
                            }`}
                          >
                            {uniquenessStatus.checking ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400 shrink-0" />
                                <span>جارٍ التحقق من تفرد المعرّف في السحابة...</span>
                              </>
                            ) : uniquenessStatus.available ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>اسم المستخدم متاح وفريد في السحابة ✓</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                <span>{uniquenessStatus.reason}</span>
                              </>
                            )}
                          </div>
                        )}

                        <div>
                          <label className="block text-slate-300 mb-1 font-semibold">كلمة المرور (6 أحرف أو أرقام على الأقل):</label>
                          <input
                            type="password"
                            required
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-teal-500"
                            dir="ltr"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={loading || (authTab === 'register' && uniquenessStatus.available === false)}
                          className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>
                            {authTab === 'login'
                              ? 'تسجيل الدخول ومزامنة الحساب السحابي'
                              : 'إنشاء الحساب السحابي فوراً (بدون تعقيدات)'}
                          </span>
                        </button>
                      </form>

                      <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
                        <div className="relative flex justify-center text-[10px]"><span className="bg-slate-900 px-3 text-slate-500">أو المتابعة السريعة عبر</span></div>
                      </div>

                      <button
                        onClick={handleGoogleAuth}
                        disabled={loading}
                        className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow border border-slate-300"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.87c2.26-2.09 3.67-5.17 3.67-9.15z"/>
                          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.05c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.15C3.29 21.36 7.35 24 12 24z"/>
                          <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.26C.46 8.2.01 9.99.01 12c0 2.01.45 3.8 1.25 5.39l4.01-3.15z"/>
                          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.29 2.64 1.26 6.61l4.01 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
                        </svg>
                        <span>الدخول بحساب Google</span>
                      </button>
                    </div>
                  )}

                  {/* EXCLUSIVE PLATFORM OWNER BRANDING, TERMS/PRIVACY & CONTACT CHANNELS CONSOLE */}
                  {user && isStrictPlatformOwner && (
                    <PlatformOwnerSettingsCard
                      ownerEmail={user.email || user.uid}
                      settings={platformSettings}
                      onOpenPreviewModal={(tab) =>
                        setLegalContactModalState({ isOpen: true, initialTab: tab })
                      }
                    />
                  )}

                  {/* Quick Legal & Contact Channels Access Card for All Users */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PlatformLogoBadge settings={platformSettings} size="md" />
                      <div>
                        <h3 className="text-sm font-bold text-white">{platformSettings.platformNameArabic}</h3>
                        <p className="text-[11px] text-slate-400">
                          {platformSettings.platformTaglineArabic}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setLegalContactModalState({ isOpen: true, initialTab: 'terms' })}
                        className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold transition-colors"
                      >
                        شروط الاستخدام
                      </button>
                      <button
                        type="button"
                        onClick={() => setLegalContactModalState({ isOpen: true, initialTab: 'privacy' })}
                        className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold transition-colors"
                      >
                        سياسة الخصوصية
                      </button>
                      <button
                        type="button"
                        onClick={() => setLegalContactModalState({ isOpen: true, initialTab: 'contact' })}
                        className="px-3 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 font-bold transition-colors"
                      >
                        تواصل مع المنصة
                      </button>
                    </div>
                  </div>

                  {/* 0. Installable App (PWA) & Offline Auto-Sync Panel */}
                  <PWASettingsCard />
                  
                  {/* 1. Theme & Appearance Settings (4 ثيمات احترافية) */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="pb-3 border-b border-slate-800">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-teal-400" />
                        <span>إعدادات المظهر والثيمات (طبي / ذهبي / نهاري / غامق)</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        اختر المظهر اللوني المفضل لديك مع تباين كامل للنصوص والبطاقات وحفظ تلقائي لاختيارك
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {THEME_OPTIONS.map((opt) => {
                        const IconComp = opt.icon;
                        const isSelected = theme === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setTheme(opt.id)}
                            className={`p-4 rounded-xl border text-right transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-teal-600/20 border-teal-500 text-white font-bold shadow-md'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-teal-400 shrink-0">
                                <IconComp className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-white">ثيم {opt.label}</div>
                                <div className="text-[11px] text-slate-400">{opt.subtitle}</div>
                              </div>
                            </div>
                            {isSelected && <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Workspace Mode Switcher (Strictly for Authorized Leaders Only) */}
                  {user && isAuthorizedAdmin && (
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                      <div className="pb-3 border-b border-slate-800">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <Crown className="w-5 h-5 text-amber-400" />
                          <span>تبديل بوابة العمل (خاص بالمالك، مالك الجامعة، ومناديب الدفعات)</span>
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          يمكنك التبديل بين بوابة القيادة الأكاديمية الخاصة برتبتك أو معاينة المنصة كما تظهر للطالب
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        {roleDoc?.role === 'platform_owner' && (
                          <button
                            onClick={() => {
                              setActiveRole('platform_owner');
                              setActiveTab('users_manager');
                            }}
                            className={`p-3.5 rounded-xl border font-bold text-right transition-all flex items-center justify-between ${
                              activeRole === 'platform_owner'
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span>👑 مالك المنصة</span>
                            {activeRole === 'platform_owner' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                          </button>
                        )}

                        {(roleDoc?.role === 'platform_owner' || roleDoc?.role === 'university_admin') && (
                          <button
                            onClick={() => {
                              setActiveRole('university_admin');
                              setActiveTab('roles');
                            }}
                            className={`p-3.5 rounded-xl border font-bold text-right transition-all flex items-center justify-between ${
                              activeRole === 'university_admin'
                                ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span>🏛️ مالك الجامعة</span>
                            {activeRole === 'university_admin' && <CheckCircle2 className="w-4 h-4 text-teal-400" />}
                          </button>
                        )}

                        {(roleDoc?.role === 'platform_owner' || roleDoc?.role === 'university_admin' || roleDoc?.role === 'batch_rep') && (
                          <button
                            onClick={() => {
                              setActiveRole('batch_rep');
                              setActiveTab('roles');
                            }}
                            className={`p-3.5 rounded-xl border font-bold text-right transition-all flex items-center justify-between ${
                              activeRole === 'batch_rep'
                                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span>📋 مندوب الدفعة</span>
                            {activeRole === 'batch_rep' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                          </button>
                        )}

                        {roleDoc?.role === 'department_head' && (
                          <button
                            onClick={() => {
                              setActiveRole('department_head');
                              setActiveTab('content_manager');
                            }}
                            className={`p-3.5 rounded-xl border font-bold text-right transition-all flex items-center justify-between ${
                              activeRole === 'department_head'
                                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span>🩺 رئيس قسم / مادة</span>
                            {activeRole === 'department_head' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setActiveRole('student');
                            setActiveTab('student_dashboard');
                          }}
                          className={`p-3.5 rounded-xl border font-bold text-right transition-all flex items-center justify-between ${
                            activeRole === 'student'
                              ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>🎓 معاينة كطالب</span>
                          {activeRole === 'student' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. Cloud Unique Username (@username), Profile Picture & Academic Details (When Logged In) */}
                  {user && (
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <AtSign className="w-5 h-5 text-teal-400" />
                          <span>اسم المستخدم الفريد (@username)، الصورة الشخصية، والبيانات الأكاديمية</span>
                        </h2>
                        <span className="text-xs px-2.5 py-1 rounded border font-semibold bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                          مُزامن سحابياً ✓
                        </span>
                      </div>

                      {/* Editable Cloud Unique Username, Photo & Academic Form */}
                      <form onSubmit={handleUpdateCloudUsername} className="p-4 rounded-xl bg-slate-950 border border-teal-500/30 space-y-4 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-teal-300 flex items-center gap-1.5">
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل صورتك الشخصية، اسم المستخدم (@username)، الجامعة، التخصص، والمستوى:</span>
                          </span>
                          {userProfile?.username && (
                            <span className="font-mono text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded border border-teal-500/20" dir="ltr">
                              @{userProfile.username}
                            </span>
                          )}
                        </div>

                        {profileUpdateMessage && (
                          <div className={`p-2.5 rounded-xl font-bold border ${
                            profileUpdateMessage.type === 'success'
                              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                              : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                          }`}>
                            {profileUpdateMessage.text}
                          </div>
                        )}

                        {/* Avatar Upload & Presets */}
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-bold text-slate-200 flex items-center gap-1.5">
                              <Camera className="w-4 h-4 text-teal-400" />
                              <span>صورة الملف الشخصي:</span>
                            </span>
                            {profileAvatarEdit && (
                              <button
                                type="button"
                                onClick={() => setProfileAvatarEdit('')}
                                className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                              >
                                حذف الصورة الحالية
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-slate-950 border-2 border-teal-500/40 flex items-center justify-center overflow-hidden shrink-0">
                              {profileAvatarEdit ? (
                                <img
                                  src={profileAvatarEdit}
                                  alt="الصورة الشخصية"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Stethoscope className="w-6 h-6 text-teal-400" />
                              )}
                            </div>

                            <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 font-bold text-xs flex items-center gap-1.5 transition-colors">
                              <Upload className="w-3.5 h-3.5" />
                              <span>رفع صورة من الهاتف</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleSettingsPhotoUpload}
                                className="hidden"
                              />
                            </label>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              {MEDICAL_PRESET_AVATARS.map((presetUrl, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setProfileAvatarEdit(presetUrl)}
                                  title={`رمزية طبية ${idx + 1}`}
                                  className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-all ${
                                    profileAvatarEdit === presetUrl
                                      ? 'border-teal-400 scale-105 shadow-md'
                                      : 'border-slate-800 opacity-75 hover:opacity-100'
                                  }`}
                                >
                                  <img src={presetUrl} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-400 mb-1">
                              اسم المستخدم الفريد (@username — 4 أحرف إنجليزية على الأقل، الكبير = الصغير):
                            </label>
                            <div className="relative" dir="ltr">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400 font-mono font-bold">@</span>
                              <input
                                type="text"
                                required
                                value={profileUsernameEdit}
                                onChange={(e) => setProfileUsernameEdit(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ''))}
                                placeholder="ahmedmed"
                                className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-teal-500"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-slate-400 mb-1">الاسم المعروض في المنصة:</label>
                            <input
                              type="text"
                              value={profileDisplayNameEdit}
                              onChange={(e) => setProfileDisplayNameEdit(e.target.value)}
                              placeholder="د. أحمد محمد"
                              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-teal-500"
                            />
                          </div>
                        </div>

                        {/* University, Specialty & Study Level */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-slate-400 mb-1">الجامعة:</label>
                            <select
                              value={profileUniversityEdit}
                              onChange={(e) => setProfileUniversityEdit(e.target.value)}
                              className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-teal-500"
                            >
                              {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                                <option key={u.id} value={u.id}>{u.nameArabic}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-slate-400 mb-1">التخصص:</label>
                            <select
                              value={profileSpecialtyEdit}
                              onChange={(e) => setProfileSpecialtyEdit(e.target.value)}
                              className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-teal-500"
                            >
                              {MEDICAL_SPECIALTIES_OPTIONS.map((sp) => (
                                <option key={sp.id} value={sp.nameArabic}>{sp.nameArabic}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-slate-400 mb-1">المستوى الدراسي:</label>
                            <select
                              value={profileStudyLevelEdit}
                              onChange={(e) => setProfileStudyLevelEdit(e.target.value)}
                              className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-teal-300 font-bold focus:outline-none focus:border-teal-500"
                            >
                              {STUDY_LEVELS_OPTIONS.map((lvl) => (
                                <option key={lvl.id} value={lvl.id}>{lvl.nameArabic}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-slate-400">
                            عند تغيير اسم المستخدم يتم حذف الاسم القديم من السحابة فوراً وحجز الاسم الجديد بدون تكرار أو تشابه.
                          </span>
                          <button
                            type="submit"
                            disabled={profileUpdateLoading}
                            className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition-colors"
                          >
                            {profileUpdateLoading ? 'جارٍ الحفظ في السحابة...' : 'حفظ وتحديث جميع البيانات في السحابة'}
                          </button>
                        </div>
                      </form>

                      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5 text-xs">
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                          <span className="text-slate-400">الاسم المعروض:</span>
                          <strong className="text-white">{userProfile?.displayNameArabic || user.displayName || 'مستخدم مسجل'}</strong>
                        </div>
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                          <span className="text-slate-400">اسم المستخدم الفريد (@username):</span>
                          <span className="font-mono text-teal-300 font-bold" dir="ltr">
                            {userProfile?.username ? `@${userProfile.username}` : 'غير محدد بعد'}
                          </span>
                        </div>
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                          <span className="text-slate-400">الجامعة والتخصص:</span>
                          <span className="text-slate-200 font-semibold">
                            {userProfile?.universityNameArabic || 'جامعة دار السلام الدولية للعلوم والتكنولوجيا'} • {userProfile?.specialtyArabic || 'الطب البشري والجراحة العامة (MBBS)'}
                          </span>
                        </div>
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                          <span className="text-slate-400">بصمة الجهاز الموثقة (حساب واحد لكل هاتف):</span>
                          <span className="font-mono text-emerald-300 text-[11px]" dir="ltr">
                            {userProfile?.deviceId || getDeviceFingerprint().deviceId} ✓
                          </span>
                        </div>
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                          <span className="text-slate-400">معرف المستخدم السحابي (UID):</span>
                          <span className="font-mono text-slate-400 text-[11px] break-all" dir="ltr">{user.uid}</span>
                        </div>
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <span className="text-slate-400">الوضع والصلاحية النشطة:</span>
                          <span className="font-bold text-amber-400">
                            {renderBiDiRoleLabel(activeRole)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={logout}
                          className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>تسجيل الخروج من الحساب</span>
                        </button>

                        {!isPrimaryOwnerEmail(user.email) && !userProfile?.isPrimaryOwner && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteConfirmText('');
                              setDeleteAccountError(null);
                              setShowDeleteAccountModal(true);
                            }}
                            className="py-2.5 px-4 rounded-xl bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-800/60 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>حذف الحساب نهائياً من السحابة</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Self-Account Cloud Deletion Confirmation Modal */}
                  {user && showDeleteAccountModal && (
                    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto overscroll-contain">
                      <div className="max-w-md w-full my-auto bg-slate-900 border border-rose-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                          <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-rose-400" />
                            <span>تأكيد حذف الحساب نهائياً من السحابة</span>
                          </h3>
                          <button
                            onClick={() => setShowDeleteAccountModal(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-800/60 text-xs text-rose-200 space-y-1.5 leading-relaxed">
                          <div className="font-bold">تحذير هام — هذا الإجراء يحذف بياناتك فوراً من السحابة:</div>
                          <p className="text-[11px] text-rose-300">
                            سيتم حذف حسابك بالكامل من السحابة مباشرةً (ملف المستخدم، اسم المستخدم الفريد @username، صلاحيات الدور، سجل القيد، ونتائج الاختبارات) بحيث لا تبقى أي نسخة منه في السحابة.
                          </p>
                        </div>

                        {deleteAccountError && (
                          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{deleteAccountError}</span>
                          </div>
                        )}

                        <form onSubmit={handleConfirmDeleteOwnAccount} className="space-y-3 text-xs">
                          <div>
                            <label className="block text-slate-300 mb-1.5 font-semibold">
                              لتأكيد الحذف النهائي من السحابة، اكتب العبارة التالية: <code className="text-rose-400 font-bold">حذف حسابي</code>
                            </label>
                            <input
                              type="text"
                              required
                              value={deleteConfirmText}
                              onChange={(e) => setDeleteConfirmText(e.target.value)}
                              placeholder="حذف حسابي"
                              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-rose-500/40 text-white text-center font-bold focus:outline-none focus:border-rose-500"
                            />
                          </div>

                          <div className="flex items-center gap-2 pt-2">
                            <button
                              type="submit"
                              disabled={deleteAccountLoading || deleteConfirmText.trim() !== 'حذف حسابي'}
                              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-1.5"
                            >
                              {deleteAccountLoading ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                              <span>تأكيد الحذف الفوري من السحابة</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowDeleteAccountModal(false)}
                              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                            >
                              إلغاء
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                </div>
              )}

            </main>

            {/* Sleek Mobile Bottom Navigation Bar (< lg viewports) */}
            <nav 
              className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 shadow-2xl px-1 sm:px-3 pt-1.5"
              style={{ paddingBottom: 'max(0.45rem, env(safe-area-inset-bottom))' }}
              aria-label="التنقل السريع للهواتف"
            >
              <div className="flex items-center justify-around gap-1 max-w-lg mx-auto">
                {!isAdminMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('student_dashboard')}
                      className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
                        activeTab === 'student_dashboard'
                          ? 'text-teal-400 font-bold bg-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <BookOpen className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">الرئيسية</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('student_library')}
                      className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
                        activeTab === 'student_library'
                          ? 'text-teal-400 font-bold bg-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <FileText className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">المكتبة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('student_assessments')}
                      className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
                        activeTab === 'student_assessments'
                          ? 'text-teal-400 font-bold bg-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Trophy className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">الاختبارات</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('student_profile')}
                      className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
                        activeTab === 'student_profile'
                          ? 'text-teal-400 font-bold bg-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <UserCheck className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">حسابي</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSidebarOpen(true)}
                      className="flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-slate-400 hover:text-slate-200 transition-all"
                    >
                      <Menu className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">المزيد</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('academic')}
                      className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
                        activeTab === 'academic'
                          ? 'text-teal-400 font-bold bg-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Building2 className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">الهيكل</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('content_manager')}
                      className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
                        activeTab === 'content_manager'
                          ? 'text-teal-400 font-bold bg-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <BookOpen className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">المحتوى</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('assessments_manager')}
                      className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
                        activeTab === 'assessments_manager'
                          ? 'text-teal-400 font-bold bg-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Trophy className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">الاختبارات</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('enrollment_queue')}
                      className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
                        activeTab === 'enrollment_queue'
                          ? 'text-teal-400 font-bold bg-teal-500/10'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Users className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">توثيق الدفعة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSidebarOpen(true)}
                      className="flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-slate-400 hover:text-slate-200 transition-all"
                    >
                      <Menu className="w-4 h-4 mb-0.5" />
                      <span className="text-[10px] leading-tight">القائمة</span>
                    </button>
                  </>
                )}
              </div>
            </nav>
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
