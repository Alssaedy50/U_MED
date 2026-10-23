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
  Bell
} from 'lucide-react';
import { useAuth } from './context/AuthContext.tsx';
import { UserRole, AuditLog, StudentEnrollment } from './types/umed.ts';
import {
  fetchMergedAuditLogs,
  formatUserIdentifier,
  checkIdentifierUniqueness,
  isPrimaryOwnerEmail
} from './lib/firebase.ts';
import { fetchStudentEnrollment, subscribeToStudentEnrollment } from './services/enrollmentService.ts';
import { startAcademicRealtimeSync } from './services/academicService.ts';
import { getRoleLabelArabic } from './services/batchGovernanceService.ts';
import { subscribeToAppNotifications } from './services/notificationService.ts';
import StudentDashboard from './components/student/StudentDashboard.tsx';
import StudentProfile from './components/student/StudentProfile.tsx';
import GlobalNotificationWatcher from './components/notifications/GlobalNotificationWatcher.tsx';
import NotificationCenterModal from './components/notifications/NotificationCenterModal.tsx';

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

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const savedTheme = localStorage.getItem('umed_theme_mode');
      if (savedTheme === 'light') return false;
      if (savedTheme === 'dark') return true;
    } catch (e) {}
    return true;
  });

  const toggleThemeMode = (dark: boolean) => {
    setIsDarkMode(dark);
    try {
      localStorage.setItem('umed_theme_mode', dark ? 'dark' : 'light');
    } catch (e) {}
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('theme-light');
      document.body.classList.remove('theme-light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('theme-light');
      document.body.classList.add('theme-light');
    }
  }, [isDarkMode]);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');
  const [emailInput, setEmailInput] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [academicIdInput, setAcademicIdInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [displayNameInput, setDisplayNameInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [uniquenessStatus, setUniquenessStatus] = useState<{
    checking: boolean;
    available: boolean | null;
    reason?: string;
  }>({ checking: false, available: null });

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

  useEffect(() => {
    const unsub = subscribeToAppNotifications((list) => {
      const unread = list.filter((n) => !n.read).length;
      setUnreadNotificationCount(unread);
    });
    return () => unsub();
  }, []);

  const [activeTab, setActiveTabState] = useState<ActiveTabType>(() => {
    try {
      const saved = sessionStorage.getItem('umed_active_tab') as ActiveTabType | null;
      if (saved) return saved;
    } catch (e) {}
    return 'student_dashboard';
  });

  const setActiveTab = (tab: ActiveTabType) => {
    setActiveTabState(tab);
    setSidebarOpen(false);
    try {
      sessionStorage.setItem('umed_active_tab', tab);
    } catch (e) {}
  };

  // True when an authorized leader (Platform Owner, University Owner, Batch Rep, or Dept Head) is in Leadership mode
  const isAdminMode = Boolean(
    isAuthorizedAdmin && activeRole !== 'student'
  );
  const isOwnerMode = Boolean(isAuthorizedAdmin && activeRole === 'platform_owner' && realRole === 'platform_owner');
  const isUniversityAdminOrOwner = Boolean(
    isAuthorizedAdmin && (activeRole === 'platform_owner' || activeRole === 'university_admin')
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

  // Load and subscribe in real-time to current user's student enrollment status & academic structure
  useEffect(() => {
    if (!user) {
      setStudentEnrollment(null);
      return;
    }
    startAcademicRealtimeSync();
    fetchStudentEnrollment(user.uid).then(enr => {
      setStudentEnrollment(enr);
    });
    const unsub = subscribeToStudentEnrollment(user.uid, (enr) => {
      if (enr) setStudentEnrollment(enr);
    });
    return () => unsub();
  }, [user?.uid]);

  const isStudentApproved = studentEnrollment?.status === 'approved' || isAuthorizedAdmin;

  // Strict Workspace Isolation:
  // 1) When in Student Mode (!isAdminMode), block access to all admin tabs
  // 2) Gate approved-only student tabs until enrollment is approved
  // 3) When in Leadership Mode (isAdminMode), default to 'roles' or 'enrollment_queue' if currently on a student tab
  // 4) Block 'users_manager' and 'backup_restore' for anyone except Platform Owner
  useEffect(() => {
    const studentTabs: ActiveTabType[] = [
      'student_dashboard',
      'student_library',
      'student_assessments',
      'student_profile'
    ];
    if (!isAdminMode) {
      if (!studentTabs.includes(activeTab) && activeTab !== 'auth') {
        setActiveTab('student_dashboard');
      } else if (
        (activeTab === 'student_profile' || activeTab === 'student_library' || activeTab === 'student_assessments') &&
        !isAuthorizedAdmin &&
        studentEnrollment &&
        studentEnrollment.status !== 'approved'
      ) {
        setActiveTab('student_dashboard');
      }
    } else if (studentTabs.includes(activeTab)) {
      setActiveTab(isOwnerMode ? 'users_manager' : isUniversityAdminOrOwner ? 'enrollment_queue' : 'roles');
    } else if (!isOwnerMode && (activeTab === 'backup_restore' || activeTab === 'users_manager')) {
      setActiveTab(isUniversityAdminOrOwner ? 'enrollment_queue' : 'roles');
    } else if (!isUniversityAdminOrOwner && activeTab === 'enrollment_queue') {
      setActiveTab('roles');
    }
  }, [isAdminMode, isOwnerMode, isUniversityAdminOrOwner, activeTab, studentEnrollment?.status]);

  // Live debounced uniqueness check during registration strictly separated by authMethod (phone vs email)
  useEffect(() => {
    if (authTab !== 'register') {
      setUniquenessStatus({ checking: false, available: null });
      return;
    }
    const emailCandidate = authMethod === 'email' ? emailInput.trim() : '';
    const phoneCandidate = authMethod === 'phone' ? phoneInput.trim() : '';
    const acadCandidate = academicIdInput.trim();

    if (!emailCandidate && !phoneCandidate && !acadCandidate) {
      setUniquenessStatus({ checking: false, available: null });
      return;
    }

    let cancelled = false;
    setUniquenessStatus(prev => ({ ...prev, checking: true }));
    const timer = setTimeout(async () => {
      const check = await checkIdentifierUniqueness({
        email: emailCandidate || undefined,
        phone: phoneCandidate || undefined,
        academicStudentNumber: acadCandidate || undefined
      });
      if (!cancelled) {
        setUniquenessStatus({
          checking: false,
          available: check.isUnique,
          reason: check.message
        });
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authTab, authMethod, emailInput, phoneInput, academicIdInput]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      if (authTab === 'login') {
        if (authMethod === 'phone') {
          if (!phoneInput.trim()) {
            setAuthError('يرجى إدخال رقم الهاتف اليمني (مثال: 771234567)');
            return;
          }
          await loginPhone(phoneInput, passwordInput);
        } else {
          if (!emailInput.trim()) {
            setAuthError('يرجى إدخال البريد الإلكتروني');
            return;
          }
          await loginEmail(emailInput, passwordInput);
        }
        setAuthSuccess('تم تسجيل الدخول بنجاح');
        setActiveTab('student_dashboard');
      } else {
        if (!displayNameInput.trim()) {
          setAuthError('يرجى إدخال الاسم الرباعي بالعربية');
          return;
        }
        if (!academicIdInput.trim() || academicIdInput.trim().length < 3) {
          setAuthError('يرجى إدخال رقم القيد الجامعي / الأكاديمي الخاص بك لمنع تكرار الحسابات');
          return;
        }
        if (authMethod === 'phone') {
          if (!phoneInput.trim()) {
            setAuthError('يرجى إدخال رقم الهاتف اليمني (مثال: 771234567)');
            return;
          }
          await registerPhone(
            phoneInput,
            passwordInput,
            displayNameInput,
            academicIdInput.trim()
          );
          setAuthSuccess('تم إنشاء الحساب برقم الهاتف بنجاح — يرجى تأكيد رمز توثيق رقم الهاتف');
        } else {
          if (!emailInput.trim()) {
            setAuthError('يرجى إدخال البريد الإلكتروني');
            return;
          }
          await registerEmail(
            emailInput,
            passwordInput,
            displayNameInput,
            academicIdInput.trim()
          );
          setAuthSuccess('تم إنشاء الحساب بالبريد الإلكتروني بنجاح — يرجى تأكيد توثيق البريد الإلكتروني');
        }
        setActiveTab('student_dashboard');
      }
      setPasswordInput('');
    } catch (err: any) {
      let msg = err.message || 'حدث خطأ أثناء المصادقة';
      if (msg.includes('ACCOUNT_DELETED_FROM_CLOUD')) {
        msg = 'هذا الحساب تم حذفه نهائياً من السحابة بناءً على طلب صاحبه أو إدارة المنصة. يمكنك إنشاء حساب جديد.';
      } else if (msg.includes('ACCOUNT_ARCHIVED')) {
        msg = 'هذا الحساب مؤرشف وموقوف مؤقتاً من قِبل إدارة المنصة.';
      } else if (msg.includes('INVALID_PHONE_NUMBER')) {
        msg = 'يرجى إدخال رقم هاتف يمني صحيح مكوّن من 9 أرقام يبدأ بـ 70 أو 71 أو 73 أو 77 أو 78 (مثال: 771234567)';
      } else if (msg.includes('INVALID_EMAIL_FORMAT')) {
        msg = 'يرجى إدخال بريد إلكتروني صحيح (مثال: student@umed.edu.ye)';
      } else if (msg.includes('user-not-found') || msg.includes('invalid-credential')) {
        msg = authMethod === 'phone'
          ? 'رقم الهاتف أو كلمة المرور غير صحيحة (إذا كنت طالباً جديداً اضغط على "إنشاء حساب طالب جديد" أولاً)'
          : 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      } else if (msg.includes('wrong-password')) {
        msg = 'كلمة المرور غير صحيحة';
      } else if (msg.includes('email-already-in-use')) {
        msg = authMethod === 'phone'
          ? 'رقم الهاتف مسجل مسبقاً في حساب آخر، لا يُسمح بتكرار الحسابات بنفس الرقم'
          : 'البريد الإلكتروني مسجل مسبقاً في حساب آخر، لا يُسمح بتكرار الحسابات بنفس البريد';
      } else if (msg.includes('weak-password')) {
        msg = 'كلمة المرور ضعيفة (يجب أن تكون 6 أحرف أو أرقام على الأقل)';
      }
      setAuthError(msg);
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
        return { title: 'اعتماد طلبات القيد الأكاديمي', subtitle: 'مراجعة واعتماد قيد الطلاب الجدد وطلبات تعديل البيانات' };
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
      className={`min-h-screen ${
        isDarkMode
          ? 'theme-dark bg-slate-950 text-slate-100'
          : 'theme-light bg-slate-50 text-slate-900'
      } transition-colors duration-200`}
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
      {/* IF INITIALIZING AUTH SESSION ON RELOAD: DO NOT FLASH LOGIN FORM */}
      {loading ? (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-md w-full my-auto bg-slate-900/80 border border-slate-800 rounded-2xl p-8 sm:p-10 text-center space-y-3 shadow-2xl">
            <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
            <h2 className="text-sm font-bold text-white">جارٍ استعادة جلستك النشطة في منصة UMED</h2>
            <p className="text-xs text-slate-400">يرجى الانتظار لحظة ريثما يتم التحقق من بيانات الحساب والقيد الأكاديمي</p>
          </div>
        </div>
      ) : !user ? (
        /* UNAUTHENTICATED LOGIN / REGISTER VIEW */
        <div className="min-h-[100dvh] flex flex-col justify-start sm:justify-center py-6 sm:py-10 px-3.5 sm:px-6 overflow-y-auto">
          <div className="max-w-md w-full mx-auto my-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-8 shadow-2xl space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center mx-auto text-white font-black text-2xl shadow-lg shadow-teal-500/20">
                U
              </div>
              <h1 className="text-lg font-bold text-white">UMED — منصة التعليم الطبي اليمنية</h1>
              <p className="text-xs text-slate-400">
                سجّل دخولك أو أنشئ حسابك الأكاديمي للوصول إلى محاضرات البلوكات والاختبارات والمسابقات الطبية
              </p>
            </div>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => { setAuthTab('login'); setAuthError(null); }}
                className={`flex-1 py-2 rounded-lg font-bold transition-colors ${authTab === 'login' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                تسجيل الدخول
              </button>
              <button
                onClick={() => { setAuthTab('register'); setAuthError(null); }}
                className={`flex-1 py-2 rounded-lg font-bold transition-colors ${authTab === 'register' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                إنشاء حساب طالب جديد
              </button>
            </div>

            {/* Method Toggle: Phone (+967) Independent from Email */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-1 rounded-xl border border-slate-800/80 text-xs">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('phone');
                  setAuthError(null);
                  setUniquenessStatus({ checking: false, available: null });
                }}
                className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                  authMethod === 'phone'
                    ? 'bg-slate-800 text-teal-300 border border-teal-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>برقم الهاتف (+967)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('email');
                  setAuthError(null);
                  setUniquenessStatus({ checking: false, available: null });
                }}
                className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
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
              {authTab === 'register' && (
                <>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">الاسم الرباعي بالعربية:</label>
                    <input
                      type="text"
                      required
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      placeholder="أدخل اسمك الرباعي كما في البطاقة الجامعية"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-teal-400" />
                        <span>رقم القيد الجامعي / الأكاديمي (فريد لكل طالب):</span>
                      </span>
                      <span className="text-[10px] text-teal-400 font-normal">يمنع تكرار القيد</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={academicIdInput}
                      onChange={(e) => setAcademicIdInput(e.target.value)}
                      placeholder="مثال: 20241055 أو MED-2025-104"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-teal-500"
                      dir="ltr"
                    />
                  </div>
                </>
              )}

              {authMethod === 'phone' ? (
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold flex items-center justify-between">
                    <span>رقم الهاتف اليمني (تسجيل مستقل برقم الهاتف فقط):</span>
                    <span className="text-[10px] text-teal-400 font-normal">فريد ولا يتكرر</span>
                  </label>
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
                  <p className="text-[10px] text-slate-500 mt-1">
                    يدعم جميع شبكات الاتصالات اليمنية (يمن موبايل 77/78، سبأفون 71، YOU 73، واي 70)
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold flex items-center justify-between">
                    <span>البريد الإلكتروني (تسجيل مستقل بالبريد فقط):</span>
                    <span className="text-[10px] text-teal-400 font-normal">فريد ولا يتكرر</span>
                  </label>
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
                      <span>
                        جارٍ فحص عدم تكرار {authMethod === 'phone' ? 'رقم الهاتف' : 'البريد الإلكتروني'} ورقم القيد في السحابة...
                      </span>
                    </>
                  ) : uniquenessStatus.available ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>بيانات الحساب فريدة ومتاحة للتسجيل (لا يوجد أي حساب مكرر) ✓</span>
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
                    ? authMethod === 'phone'
                      ? 'تسجيل الدخول برقم الهاتف'
                      : 'تسجيل الدخول بالبريد الإلكتروني'
                    : authMethod === 'phone'
                    ? 'إنشاء الحساب برقم الهاتف وإرسال رمز التوثيق'
                    : 'إنشاء الحساب بالبريد وإرسال رمز التوثيق'}
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
              تم أرشفة حسابك في قاعدة البيانات السحابية من قِبل مالك المنصة. لا يمكنك الوصول إلى المحتوى الدراسي حتى يتم إلغاء الأرشفة.
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
      ) : pendingVerification ? (
        /* ACCOUNT VERIFICATION GATE (تأكيد توثيق الحساب المستقل حسب طريقة التسجيل: هاتف أو بريد) */
        <div className="min-h-[100dvh] flex flex-col justify-start sm:justify-center py-6 sm:py-10 px-3.5 sm:px-6 overflow-y-auto">
          <div className="max-w-lg w-full mx-auto my-auto bg-slate-900/95 border border-teal-500/40 rounded-2xl p-5 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-white">تأكيد توثيق الحساب الأكاديمي</h1>
                  <p className="text-xs text-slate-400">
                    {pendingVerification.verificationMethod === 'phone'
                      ? 'التحقق من رقم الهاتف اليمني المسجل لتوثيق الحساب وتفعيله في السحابة'
                      : 'التحقق من البريد الإلكتروني المسجل لتوثيق الحساب وتفعيله في السحابة'}
                  </p>
                </div>
              </div>
              <button
                onClick={logout}
                className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج</span>
              </button>
            </div>

            {/* Summary of Reserved Unique Identifiers */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="text-[11px] font-bold text-teal-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>بيانات الحساب المحجوزة حصرياً في السحابة (لا يمكن تكرارها):</span>
              </div>
              {pendingVerification.verificationMethod === 'phone' && pendingVerification.phone && (
                <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-900">
                  <span>رقم الهاتف اليمني (طريقة التسجيل):</span>
                  <span className="font-mono text-white flex items-center gap-1.5" dir="ltr">
                    {pendingVerification.phone}
                    {pendingVerification.phoneVerified ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">موثق ✓</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">بانتظار التأكيد</span>
                    )}
                  </span>
                </div>
              )}
              {pendingVerification.verificationMethod === 'email' && pendingVerification.email && (
                <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-900">
                  <span>البريد الإلكتروني (طريقة التسجيل):</span>
                  <span className="font-mono text-white flex items-center gap-1.5" dir="ltr">
                    {pendingVerification.email}
                    {pendingVerification.emailVerified ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">موثق ✓</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">بانتظار التأكيد</span>
                    )}
                  </span>
                </div>
              )}
              {userProfile?.academicStudentNumber && (
                <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-900">
                  <span>رقم القيد الجامعي المحجوز:</span>
                  <span className="font-mono text-teal-300 font-bold" dir="ltr">
                    {userProfile.academicStudentNumber}
                  </span>
                </div>
              )}
            </div>

            {/* Instant Smart Dispatch Notification Banner (SMS / Email OTP Code) */}
            <div className="p-3.5 rounded-xl bg-teal-950/40 border border-teal-700/50 space-y-2 text-xs">
              <div className="font-bold text-teal-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {pendingVerification.verificationMethod === 'phone'
                      ? 'رمز توثيق رقم الهاتف (SMS OTP):'
                      : 'رمز توثيق البريد الإلكتروني (Email OTP):'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingVerification.verificationMethod === 'phone' && pendingVerification.phoneCode) {
                      setPhoneOtpInput(pendingVerification.phoneCode);
                    }
                    if (pendingVerification.verificationMethod === 'email' && pendingVerification.emailCode) {
                      setEmailOtpInput(pendingVerification.emailCode);
                    }
                  }}
                  className="text-[11px] px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold transition-colors"
                >
                  تعبئة رمز التوثيق تلقائياً
                </button>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {pendingVerification.verificationMethod === 'phone'
                  ? 'أدخل رمز التوثيق المكون من 6 أرقام لتأكيد ملكية رقم الهاتف وتوثيق حسابك في السحابة:'
                  : 'تم إرسال رابط التفعيل الرسمي عبر Firebase لبريدك الإلكتروني، ويمكنك أيضاً إدخال رمز التوثيق الرقمي التالي مباشرة:'}
              </p>
              <div className="pt-1">
                {pendingVerification.verificationMethod === 'phone' && pendingVerification.phone && !pendingVerification.phoneVerified && (
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">رمز توثيق الهاتف (SMS OTP):</span>
                    <strong className="font-mono text-base text-amber-300 tracking-widest" dir="ltr">
                      {pendingVerification.phoneCode}
                    </strong>
                  </div>
                )}
                {pendingVerification.verificationMethod === 'email' && pendingVerification.email && !pendingVerification.emailVerified && (
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">رمز توثيق البريد (Email OTP):</span>
                    <strong className="font-mono text-base text-teal-300 tracking-widest" dir="ltr">
                      {pendingVerification.emailCode}
                    </strong>
                  </div>
                )}
              </div>
            </div>

            {verifyError && (
              <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {verifySuccess && (
              <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{verifySuccess}</span>
              </div>
            )}

            <form onSubmit={handleVerifyAccountSubmit} className="space-y-4 text-xs">
              {pendingVerification.verificationMethod === 'phone' && pendingVerification.phone && !pendingVerification.phoneVerified && (
                <div>
                  <label className="block text-slate-300 mb-1.5 font-semibold flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-teal-400" />
                    <span>أدخل رمز توثيق رقم الهاتف ({pendingVerification.phone}):</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={phoneOtpInput}
                    onChange={(e) => setPhoneOtpInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="أدخل الرمز المكون من 6 أرقام"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center text-base tracking-widest focus:outline-none focus:border-teal-500"
                    dir="ltr"
                  />
                </div>
              )}

              {pendingVerification.verificationMethod === 'email' && pendingVerification.email && !pendingVerification.emailVerified && (
                <div>
                  <label className="block text-slate-300 mb-1.5 font-semibold flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-teal-400" />
                    <span>أدخل رمز توثيق البريد الإلكتروني ({pendingVerification.email}):</span>
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={emailOtpInput}
                    onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="أدخل رمز البريد (6 أرقام) أو اضغط على الرابط المرسل لبريدك"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center text-base tracking-widest focus:outline-none focus:border-teal-500"
                    dir="ltr"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={verifyLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
                >
                  {verifyLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>تأكيد توثيق الحساب وتفعيله الآن</span>
                </button>
                <button
                  type="button"
                  disabled={verifyLoading}
                  onClick={handleResendVerificationCodes}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>إعادة إرسال الرمز</span>
                </button>
              </div>
            </form>
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
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20 text-white font-black text-xl shrink-0">
                  U
                </div>
                <div>
                  <div className="font-bold text-sm text-white leading-tight">منصة UMED الطبية</div>
                  <div className="text-[11px] text-teal-400 font-semibold mt-0.5">
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

                  {isStudentApproved && (
                    <>
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
                    </>
                  )}
                </div>
              )}

              {/* LEADERSHIP NAVIGATION ITEMS (Platform Owner, University Owner, Batch Rep, Dept Head) */}
              {isAdminMode && (
                <div className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    إدارة الجامعة والدفعة ({getRoleLabelArabic(activeRole)})
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
                      <span>اعتماد طلبات القيد</span>
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
                  <span>الإعدادات والحساب</span>
                </button>
              </div>
            </div>

            {/* Sidebar User Card Footer */}
            <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {userProfile?.displayNameArabic || user.displayName || 'مستخدم UMED'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate" dir="ltr">
                    {formatUserIdentifier(user.email, userProfile?.phone)}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                    isOwnerMode
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : isAdminMode
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  }`}
                >
                  {getRoleLabelArabic(activeRole)}
                </span>
              </div>
              <button
                onClick={logout}
                className="w-full py-1.5 px-2.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/50 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>تسجيل الخروج من الحساب</span>
              </button>
            </div>
          </aside>

          {/* MAIN WORKSPACE CONTENT AREA */}
          <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden">
            
            {/* Clean Contextual Top Bar (Zero Telemetry Clutter) */}
            <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-3.5 py-2.5 sm:px-6 sm:py-3">
              <div className="max-w-6xl mx-auto flex items-center justify-between gap-2.5">
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

                <div className="flex items-center gap-2 shrink-0">
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
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        activeRole === 'student'
                          ? 'bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border-teal-500/40'
                          : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                      }`}
                      title="التبديل السريع بين بوابة الإدارة ومعاينة واجهة الطالب"
                    >
                      {activeRole === 'student' ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                          <span>العودة لبوابة الإدارة</span>
                        </>
                      ) : (
                        <>
                          <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="hidden sm:inline">معاينة كطالب</span>
                        </>
                      )}
                    </button>
                  )}

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

                  <button
                    onClick={() => toggleThemeMode(!isDarkMode)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    title={isDarkMode ? 'التبديل إلى الوضع النهاري الفاتح' : 'التبديل إلى الوضع الليلي الداكن'}
                  >
                    {isDarkMode ? (
                      <Sun className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Moon className="w-4 h-4 text-indigo-400" />
                    )}
                  </button>
                </div>
              </div>
            </header>

            {/* Page Content Viewport */}
            <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 py-4 sm:px-6 sm:py-6">
              
              {/* STUDENT WORKSPACE VIEWS */}
              {!isAdminMode && (activeTab === 'student_dashboard' || activeTab === 'student_library' || activeTab === 'student_assessments') && (
                <StudentDashboard
                  uid={user.uid}
                  userEmail={user.email || ''}
                  displayNameArabic={userProfile?.displayNameArabic || user.displayName || 'طالب كلية الطب البشري'}
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
                <StudentProfile
                  uid={user.uid}
                  userEmail={user.email || ''}
                  displayNameArabic={userProfile?.displayNameArabic || user.displayName || 'طالب كلية الطب البشري'}
                  initialEnrollment={studentEnrollment}
                  onNavigateTab={(tab) => {
                    if (tab === 'library') setActiveTab('student_library');
                    else if (tab === 'assessments') setActiveTab('student_assessments');
                    else setActiveTab('student_dashboard');
                  }}
                />
              )}

              {/* ADMIN, UNIVERSITY OWNER, BATCH REP & DEPT HEAD WORKSPACE VIEWS */}
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

              {/* ADMIN TAB: AUDIT LOGS */}
              {isAdminMode && activeTab === 'audit' && (
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

              {/* TAB: SETTINGS, APPEARANCE, SYSTEM STATUS & ACCOUNT (الإعدادات والحساب) */}
              {activeTab === 'auth' && (
                <div className="max-w-3xl mx-auto space-y-6">
                  
                  {/* 1. Theme & Appearance Settings (الوضع الليلي والنهاري) */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="pb-3 border-b border-slate-800">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        {isDarkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-400" />}
                        <span>إعدادات المظهر والعرض (الوضع الليلي / النهاري)</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        اختر نمط الإضاءة المناسب للقراءة والمذاكرة الطبية مع تباين كامل للنصوص والبطاقات
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <button
                        onClick={() => toggleThemeMode(true)}
                        className={`p-4 rounded-xl border text-right transition-all flex items-center justify-between ${
                          isDarkMode
                            ? 'bg-teal-600/20 border-teal-500 text-white font-bold shadow-md'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400">
                            <Moon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">الوضع الليلي (الداكن)</div>
                            <div className="text-[11px] text-slate-400">مريح للعين في الإضاءة المنخفضة</div>
                          </div>
                        </div>
                        {isDarkMode && <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />}
                      </button>

                      <button
                        onClick={() => toggleThemeMode(false)}
                        className={`p-4 rounded-xl border text-right transition-all flex items-center justify-between ${
                          !isDarkMode
                            ? 'bg-teal-600/20 border-teal-500 text-white font-bold shadow-md'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                            <Sun className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">الوضع النهاري (الفاتح)</div>
                            <div className="text-[11px] text-slate-400">خلفية فاتحة عالية الوضوح للقراءة النهارية</div>
                          </div>
                        </div>
                        {!isDarkMode && <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />}
                      </button>
                    </div>
                  </div>

                  {/* 2. Workspace Mode Switcher (Strictly for Authorized Leaders Only) */}
                  {isAuthorizedAdmin && (
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

                  {/* 3. Account Information, Verification & Logout */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <UserCheck className="w-5 h-5 text-teal-400" />
                        <span>بيانات الحساب وتأكيد التوثيق</span>
                      </h2>
                      <span
                        className={`text-xs px-2.5 py-1 rounded border font-semibold ${
                          userProfile?.isVerified
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {userProfile?.isVerified ? 'حساب موثق ✓' : 'بانتظار تأكيد التوثيق'}
                      </span>
                    </div>

                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5 text-xs">
                      <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                        <span className="text-slate-400">الاسم الكامل:</span>
                        <strong className="text-white">{userProfile?.displayNameArabic || user.displayName || 'مستخدم مسجل'}</strong>
                      </div>
                      <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                        <span className="text-slate-400">طريقة التسجيل المعتمدة:</span>
                        <span className="font-semibold text-teal-300">
                          {userProfile?.registrationMethod === 'phone' || user.email?.startsWith('phone_')
                            ? 'تسجيل مستقل برقم الهاتف (+967)'
                            : userProfile?.registrationMethod === 'google'
                            ? 'حساب Google الرسمي'
                            : 'تسجيل مستقل بالبريد الإلكتروني'}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                        <span className="text-slate-400">معرف الدخول الأساسي:</span>
                        <span className="font-mono text-teal-300 break-all" dir="ltr">
                          {formatUserIdentifier(user.email, userProfile?.phone)}
                        </span>
                      </div>
                      {userProfile?.phone && !user.email?.startsWith('phone_') && (
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                          <span className="text-slate-400">رقم الهاتف المرتبط:</span>
                          <span className="font-mono text-emerald-300" dir="ltr">{userProfile.phone}</span>
                        </div>
                      )}
                      {(userProfile?.academicStudentNumber || studentEnrollment?.academicStudentNumber) && (
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                          <span className="text-slate-400">رقم القيد الأكاديمي المحجوز:</span>
                          <span className="font-mono text-teal-300 font-bold" dir="ltr">
                            {userProfile?.academicStudentNumber || studentEnrollment?.academicStudentNumber}
                          </span>
                        </div>
                      )}
                      <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                        <span className="text-slate-400">حالة توثيق الحساب:</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(userProfile?.registrationMethod === 'phone' || user.email?.startsWith('phone_') || userProfile?.phone) && (
                            <span className={`text-[11px] px-2 py-0.5 rounded border ${userProfile?.phoneVerified ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300' : 'bg-amber-950/50 border-amber-700 text-amber-300'}`}>
                              توثيق الهاتف: {userProfile?.phoneVerified ? 'موثق ✓' : 'غير موثق'}
                            </span>
                          )}
                          {(!user.email?.startsWith('phone_') && userProfile?.registrationMethod !== 'phone') && (
                            <span className={`text-[11px] px-2 py-0.5 rounded border ${userProfile?.emailVerified || user.emailVerified ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300' : 'bg-amber-950/50 border-amber-700 text-amber-300'}`}>
                              توثيق البريد: {userProfile?.emailVerified || user.emailVerified ? 'موثق ✓' : 'غير موثق'}
                            </span>
                          )}
                          {!userProfile?.isVerified && (
                            <button
                              type="button"
                              onClick={() => startAccountVerification()}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold"
                            >
                              تأكيد توثيق الحساب الآن
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-slate-800/80">
                        <span className="text-slate-400">معرف المستخدم (UID):</span>
                        <span className="font-mono text-slate-400 text-[11px] break-all" dir="ltr">{user.uid}</span>
                      </div>
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <span className="text-slate-400">الوضع والصلاحية النشطة:</span>
                        <span className="font-bold text-amber-400">
                          {getRoleLabelArabic(activeRole)}
                          {roleDoc?.assignedUniversityId && activeRole !== 'platform_owner' ? ` • (${roleDoc.assignedUniversityId})` : ''}
                          {roleDoc?.assignedStudyLevelId ? ` • (${roleDoc.assignedStudyLevelId})` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={logout}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>تسجيل الخروج من المنصة</span>
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

                  {/* Self-Account Cloud Deletion Confirmation Modal */}
                  {showDeleteAccountModal && (
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
                          <div className="font-bold">تحذير هام — هذا الإجراء نهائي ولا يمكن التراجع عنه:</div>
                          <p className="text-[11px] text-rose-300">
                            سيتم حذف حسابك بالكامل من السحابة (ملف المستخدم، صلاحيات الدور، سجل القيد الأكاديمي، نتائج الاختبارات، وتحرير رقم الهاتف والبريد الإلكتروني ورقم القيد) بالإضافة إلى حذف حساب المصادقة.
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
                              <span>تأكيد الحذف النهائي من السحابة</span>
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
    </div>
  );
}
