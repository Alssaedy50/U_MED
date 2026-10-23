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
  X
} from 'lucide-react';
import { useAuth } from './context/AuthContext.tsx';
import { UserRole, UserRoleDoc, AuditLog, StudentEnrollment } from './types/umed.ts';
import { fetchMergedAuditLogs, fetchAllUserRoles, assignUserRole } from './lib/firebase.ts';
import { fetchStudentEnrollment } from './services/enrollmentService.ts';
import StudentDashboard from './components/student/StudentDashboard.tsx';
import StudentProfile from './components/student/StudentProfile.tsx';

// Code-splitting admin heavy modules to minimize student initial bundle size
const AcademicStructureManager = React.lazy(() => import('./components/admin/AcademicStructureManager.tsx'));
const EnrollmentApprovalManager = React.lazy(() => import('./components/admin/EnrollmentApprovalManager.tsx'));
const EducationalContentManager = React.lazy(() => import('./components/admin/EducationalContentManager.tsx'));
const AssessmentManager = React.lazy(() => import('./components/admin/AssessmentManager.tsx'));
const BackupRestoreConsole = React.lazy(() => import('./components/admin/BackupRestoreConsole.tsx'));

type ActiveTabType =
  | 'student_dashboard'
  | 'student_library'
  | 'student_assessments'
  | 'student_profile'
  | 'academic'
  | 'content_manager'
  | 'assessments_manager'
  | 'enrollment_queue'
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
    logout, 
    bootstrapInitialOwner, 
    checkConnectivity,
    activeRole,
    setActiveRole,
    isAuthorizedAdmin
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

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [displayNameInput, setDisplayNameInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState<boolean>(false);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [assignedRolesList, setAssignedRolesList] = useState<UserRoleDoc[]>([]);
  const [studentEnrollment, setStudentEnrollment] = useState<StudentEnrollment | null>(null);
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

  // True when an authorized admin is in Admin or Owner mode (NOT previewing as a student)
  const isAdminMode = Boolean(
    isAuthorizedAdmin && (activeRole === 'platform_owner' || activeRole === 'university_admin')
  );
  const isOwnerMode = Boolean(isAuthorizedAdmin && activeRole === 'platform_owner');

  // Role assignment form state (Platform Owner only)
  const [targetUidInput, setTargetUidInput] = useState<string>('');
  const [targetEmailInput, setTargetEmailInput] = useState<string>('');
  const [targetRoleInput, setTargetRoleInput] = useState<UserRole>('university_admin');
  const [targetUnivInput, setTargetUnivInput] = useState<string>('univ-dar-al-salam');
  const [roleAssignMsg, setRoleAssignMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshAdminData = async () => {
    if (!isAuthorizedAdmin) return;
    try {
      const [logs, roles] = await Promise.all([
        fetchMergedAuditLogs(),
        fetchAllUserRoles()
      ]);
      setAuditLogs(logs);
      setAssignedRolesList(roles);
    } catch (e) {
      console.warn('Failed to refresh admin data:', e);
    }
  };

  useEffect(() => {
    if (isAuthorizedAdmin) {
      refreshAdminData();
    }
  }, [isAuthorizedAdmin, activeTab]);

  // Load current user's student enrollment status
  useEffect(() => {
    if (!user) {
      setStudentEnrollment(null);
      return;
    }
    fetchStudentEnrollment(user.uid).then(enr => {
      setStudentEnrollment(enr);
    });
  }, [user?.uid, activeTab]);

  const isStudentApproved = studentEnrollment?.status === 'approved';

  // Strict Workspace Isolation:
  // 1) When in Student Mode (!isAdminMode), block access to all admin tabs
  // 2) Gate approved-only student tabs until enrollment is approved
  // 3) When in Admin Mode (isAdminMode), default to 'enrollment_queue' if currently on a student tab
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
        studentEnrollment &&
        studentEnrollment.status !== 'approved'
      ) {
        setActiveTab('student_dashboard');
      }
    } else if (studentTabs.includes(activeTab)) {
      setActiveTab('enrollment_queue');
    } else if (!isOwnerMode && (activeTab === 'roles' || activeTab === 'backup_restore')) {
      setActiveTab('enrollment_queue');
    }
  }, [isAdminMode, isOwnerMode, activeTab, studentEnrollment?.status]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    try {
      if (authTab === 'login') {
        await loginEmail(emailInput, passwordInput);
        setAuthSuccess('تم تسجيل الدخول بنجاح');
        setActiveTab('student_dashboard');
      } else {
        if (!displayNameInput.trim()) {
          setAuthError('يرجى إدخال الاسم الرباعي بالعربية');
          return;
        }
        await registerEmail(emailInput, passwordInput, displayNameInput);
        setAuthSuccess('تم إنشاء الحساب وتسجيل الدخول بنجاح');
        setActiveTab('student_dashboard');
      }
      setPasswordInput('');
    } catch (err: any) {
      let msg = err.message || 'حدث خطأ أثناء المصادقة';
      if (msg.includes('user-not-found') || msg.includes('invalid-credential')) {
        msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      } else if (msg.includes('wrong-password')) {
        msg = 'كلمة المرور غير صحيحة';
      } else if (msg.includes('email-already-in-use')) {
        msg = 'البريد الإلكتروني مسجل مسبقاً، يرجى تسجيل الدخول به';
      } else if (msg.includes('weak-password')) {
        msg = 'كلمة المرور ضعيفة (يجب أن تكون 6 أحرف على الأقل)';
      }
      setAuthError(msg);
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
      if (msg.includes('unauthorized-domain')) {
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

  const handleAssignRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !targetUidInput.trim() || !targetEmailInput.trim()) return;
    setRoleAssignMsg(null);
    try {
      await assignUserRole({
        callerUid: user.uid,
        callerEmail: user.email || '',
        targetUid: targetUidInput,
        email: targetEmailInput,
        role: targetRoleInput,
        assignedUniversityId: targetUnivInput
      });
      setRoleAssignMsg({ type: 'success', text: 'تم تعيين الصلاحية وحفظها في السحابة وسجل التدقيق بنجاح.' });
      setTargetUidInput('');
      setTargetEmailInput('');
      await refreshAdminData();
    } catch (err: any) {
      setRoleAssignMsg({ type: 'error', text: err.message || 'فشل تعيين الدور' });
    }
  };

  // Active Page Title Lookup for Contextual Top Header
  const getPageTitleInfo = (): { title: string; subtitle: string } => {
    switch (activeTab) {
      case 'student_dashboard':
        return { title: 'المقررات والبلوكات الدراسية', subtitle: 'استعراض البلوكات والمقررات المخصصة لمستواك الأكاديمي' };
      case 'student_library':
        return { title: 'المكتبة الطبية والشرائح', subtitle: 'المحاضرات، المراجع، والشرائح السريرية منخفضة الاستهلاك' };
      case 'student_assessments':
        return { title: 'الاختبارات والمسابقات السريرية', subtitle: 'الاختبارات الدورية والمسابقات التفاعلية مع التصحيح الفوري' };
      case 'student_profile':
        return { title: 'الملف الأكاديمي والتقدم', subtitle: 'البيانات الأكاديمية، نسبة إنجاز البلوكات، والنشاط الأخير' };
      case 'enrollment_queue':
        return { title: 'اعتماد طلبات القيد الأكاديمي', subtitle: 'مراجعة واعتماد قيد الطلاب الجدد وطلبات تعديل البيانات' };
      case 'academic':
        return { title: 'الهيكل الأكاديمي والجامعات', subtitle: 'إدارة الكليات، المستويات، البلوكات، والمقررات الدراسية' };
      case 'content_manager':
        return { title: 'إدارة المحتوى والمكتبة الرقمية', subtitle: 'رفع وتنظيم المحاضرات والمراجع الطبية حسب البلوك والمقرر' };
      case 'assessments_manager':
        return { title: 'إدارة الاختبارات والمسابقات', subtitle: 'إنشاء بنوك الأسئلة، جدولة الاختبارات، وإعلان النتائج' };
      case 'backup_restore':
        return { title: 'النسخ الاحتياطي والاستعادة', subtitle: 'تصدير واستيراد قواعد البيانات الأكاديمية المعتمدة' };
      case 'roles':
        return { title: 'إدارة المشرفين والصلاحيات', subtitle: 'تعيين مشرفي الجامعات وضبط صلاحيات الوصول (RBAC)' };
      case 'audit':
        return { title: 'سجل التدقيق السحابي', subtitle: 'توثيق العمليات الإدارية والأكاديمية غير القابل للتعديل' };
      case 'auth':
        return { title: 'الإعدادات والحساب', subtitle: 'إعدادات المظهر (الوضع الليلي/النهاري)، حالة السحابة، وبيانات الجلسة' };
      default:
        return { title: 'منصة UMED الطبية', subtitle: 'التعليم الطبي الموحد لكليات الطب البشري' };
    }
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
      {firestoreError && (
        <div className="bg-amber-950/90 border-b border-amber-600/60 px-4 py-2.5 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-medium">{firestoreError}</span>
          </div>
          <a
            href="https://console.developers.google.com/apis/api/securetoken.googleapis.com/overview?project=1072983768253"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors shrink-0 shadow flex items-center gap-1"
          >
            <span>تفعيل الخدمة في Google Cloud</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* IF INITIALIZING AUTH SESSION ON RELOAD: DO NOT FLASH LOGIN FORM */}
      {loading ? (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center space-y-3 shadow-2xl">
            <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
            <h2 className="text-sm font-bold text-white">جارٍ استعادة جلستك النشطة في منصة UMED...</h2>
            <p className="text-xs text-slate-400">يرجى الانتظار لحظة ريثما يتم التحقق من بيانات الحساب والقيد الأكاديمي</p>
          </div>
        </div>
      ) : !user ? (
        /* UNAUTHENTICATED LOGIN / REGISTER VIEW */
        <div className="min-h-screen flex flex-col justify-center py-10 px-4 sm:px-6">
          <div className="max-w-md w-full mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
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

            <form onSubmit={handleEmailAuth} className="space-y-3.5 text-xs">
              {authTab === 'register' && (
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
              )}

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

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">كلمة المرور:</label>
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
                disabled={loading}
                className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
              >
                <LogIn className="w-4 h-4" />
                <span>{authTab === 'login' ? 'تسجيل الدخول للمنصة' : 'إنشاء الحساب والمتابعة لتسجيل القيد'}</span>
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
      ) : (
        /* AUTHENTICATED WORKSPACE WITH RTL SIDEBAR NAVIGATION */
        <div className="min-h-screen flex">
          
          {/* Mobile Sidebar Backdrop */}
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 lg:hidden"
            />
          )}

          {/* RTL SIDEBAR MENU (قائمة جانبية) */}
          <aside
            className={`fixed lg:sticky top-0 right-0 z-50 h-screen w-68 bg-slate-900 border-l border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 ${
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
                    {isOwnerMode
                      ? 'بوابة مالك المنصة'
                      : isAdminMode
                      ? 'بوابة مشرف الجامعة'
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

              {/* ADMIN & OWNER NAVIGATION ITEMS */}
              {isAdminMode && (
                <div className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    إدارة الكلية والمنصة
                  </div>

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

                  <button
                    onClick={() => setActiveTab('academic')}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === 'academic'
                        ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    <Building2 className="w-4 h-4 shrink-0" />
                    <span>الهيكل الأكاديمي والجامعات</span>
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
                    <span>إدارة المحتوى والمكتبة</span>
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
                    <>
                      <div className="pt-3 px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        صلاحيات مالك المنصة
                      </div>

                      <button
                        onClick={() => setActiveTab('roles')}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                          activeTab === 'roles'
                            ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>إدارة المشرفين والصلاحيات</span>
                      </button>

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
                    </>
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
                    {user.email}
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
                  {isOwnerMode ? 'المالك' : isAdminMode ? 'مشرف' : 'طالب'}
                </span>
              </div>
            </div>
          </aside>

          {/* MAIN WORKSPACE CONTENT AREA */}
          <div className="flex-1 flex flex-col min-w-0">
            
            {/* Clean Contextual Top Bar (Zero Telemetry Clutter) */}
            <header className="sticky top-0 z-30 bg-slate-900/85 backdrop-blur border-b border-slate-800 px-4 py-3 sm:px-6">
              <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 lg:hidden transition-colors"
                    title="فتح القائمة الجانبية"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  <div>
                    <h1 className="text-sm sm:text-base font-bold text-white">{pageInfo.title}</h1>
                    <p className="text-[11px] text-slate-400 hidden sm:block">{pageInfo.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('auth')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    title="الإعدادات والحساب"
                  >
                    <Settings className="w-3.5 h-3.5 text-teal-400" />
                    <span className="hidden sm:inline">الإعدادات</span>
                  </button>
                </div>
              </div>
            </header>

            {/* Page Content Viewport */}
            <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:px-6">
              
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

              {/* ADMIN & OWNER WORKSPACE VIEWS */}
              <React.Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-teal-400" />
                    <span className="text-xs font-semibold">جارٍ تحميل الوحدة الإدارية...</span>
                  </div>
                }
              >
                {isAdminMode && activeTab === 'academic' && (
                  <AcademicStructureManager />
                )}

                {isAdminMode && activeTab === 'content_manager' && (
                  <EducationalContentManager
                    adminUid={user.uid}
                    assignedUniversityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                  />
                )}

                {isAdminMode && activeTab === 'assessments_manager' && (
                  <AssessmentManager
                    universityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                  />
                )}

                {isAdminMode && activeTab === 'enrollment_queue' && (
                  <EnrollmentApprovalManager
                    adminUid={user.uid}
                    assignedUniversityId={roleDoc?.assignedUniversityId}
                  />
                )}

                {isOwnerMode && activeTab === 'backup_restore' && (
                  <BackupRestoreConsole
                    adminEmail={user.email || ''}
                    assignedUniversityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                  />
                )}
              </React.Suspense>

              {/* ADMIN TAB: ROLES & UNIVERSITY ADMIN ASSIGNMENT (Owner Only) */}
              {isOwnerMode && activeTab === 'roles' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-teal-400" />
                      <span>تعيين مشرفي الجامعات والصلاحيات (RBAC)</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      يمكن لمالك المنصة منح صلاحية مشرف جامعة (<code className="text-teal-300 font-mono">university_admin</code>) لأي عضو هيئة تدريس أو مسؤول تسجيل عبر معرف حسابه (UID).
                    </p>

                    {roleAssignMsg && (
                      <div className={`p-3 rounded-xl border text-xs ${
                        roleAssignMsg.type === 'success'
                          ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/50 border-rose-800 text-rose-300'
                      }`}>
                        {roleAssignMsg.text}
                      </div>
                    )}

                    <form onSubmit={handleAssignRoleSubmit} className="space-y-3 text-xs">
                      <div>
                        <label className="block text-slate-300 mb-1 font-semibold">معرف المستخدم في Firebase (UID):</label>
                        <input
                          type="text"
                          required
                          value={targetUidInput}
                          onChange={(e) => setTargetUidInput(e.target.value)}
                          placeholder="انسخ الـ UID من صفحة حساب المشرف"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 mb-1 font-semibold">البريد الإلكتروني للمشرف:</label>
                        <input
                          type="email"
                          required
                          value={targetEmailInput}
                          onChange={(e) => setTargetEmailInput(e.target.value)}
                          placeholder="admin@daralsalam.edu.ye"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                          dir="ltr"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-300 mb-1 font-semibold">الرتبة المطلوبة:</label>
                          <select
                            value={targetRoleInput}
                            onChange={(e) => setTargetRoleInput(e.target.value as UserRole)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold"
                          >
                            <option value="university_admin">مشرف جامعة (University Admin)</option>
                            <option value="platform_owner">مالك منصة (Platform Owner)</option>
                            <option value="student">طالب (إلغاء الإشراف)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-300 mb-1 font-semibold">الجامعة المخصصة:</label>
                          <input
                            type="text"
                            value={targetUnivInput}
                            onChange={(e) => setTargetUnivInput(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                            dir="ltr"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center justify-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        <span>حفظ وتعيين الصلاحية سحابياً</span>
                      </button>
                    </form>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 className="text-sm font-bold text-white">قائمة الحسابات الإدارية المعتمدة ({assignedRolesList.length})</h3>
                      <button
                        onClick={refreshAdminData}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                        title="تحديث القائمة"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto text-xs">
                      {assignedRolesList.map((r) => (
                        <div key={r.uid} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                          <div>
                            <div className="font-bold text-white font-mono" dir="ltr">{r.email || r.uid}</div>
                            <div className="text-[10px] text-slate-500 font-mono" dir="ltr">UID: {r.uid}</div>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            r.role === 'platform_owner' ? 'bg-amber-500/20 text-amber-300' : 'bg-teal-500/20 text-teal-300'
                          }`}>
                            {r.role === 'platform_owner' ? 'مالك المنصة' : 'مشرف جامعة'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

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

                  {/* 2. Workspace Mode Switcher (Strictly for Authorized Admins/Owner Only) */}
                  {isAuthorizedAdmin && (
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                      <div className="pb-3 border-b border-slate-800">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <Crown className="w-5 h-5 text-amber-400" />
                          <span>تبديل بوابة العمل (خاص بالمالك والمشرفين المعتمدين)</span>
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          يمكنك التبديل بين بوابة الإدارة الكاملة أو معاينة المنصة كما تظهر للطالب
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <button
                          onClick={() => {
                            setActiveRole('platform_owner');
                            setActiveTab('enrollment_queue');
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

                        <button
                          onClick={() => {
                            setActiveRole('university_admin');
                            setActiveTab('enrollment_queue');
                          }}
                          className={`p-3.5 rounded-xl border font-bold text-right transition-all flex items-center justify-between ${
                            activeRole === 'university_admin'
                              ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>🏛️ مشرف جامعة</span>
                          {activeRole === 'university_admin' && <CheckCircle2 className="w-4 h-4 text-teal-400" />}
                        </button>

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

                      {isOwnerMode && (
                        <div className="pt-3 border-t border-slate-800 space-y-2.5 text-xs">
                          {bootstrapMessage && (
                            <div className="p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-800 text-emerald-300">
                              {bootstrapMessage}
                            </div>
                          )}
                          <button
                            onClick={handleBootstrapOwner}
                            disabled={bootstrapLoading}
                            className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold transition-colors"
                          >
                            {bootstrapLoading ? 'جاري التحقق والمزامنة...' : 'تأكيد ومزامنة صلاحية المالك في قاعدة بيانات السحابة'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. Cloud & Network Diagnostics (Moved from main header into Settings) */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div>
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <Database className="w-5 h-5 text-teal-400" />
                          <span>حالة الاتصال والمزامنة السحابية</span>
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          مؤشرات اتصال الشبكة وقاعدة البيانات السحابية (تعمل تلقائياً في الخلفية)
                        </p>
                      </div>
                      <button
                        onClick={checkConnectivity}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>فحص الاتصال</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                        <span className="text-slate-400">حالة شبكة الإنترنت:</span>
                        {isOnline ? (
                          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                            <Wifi className="w-4 h-4" />
                            <span>متصل بالشبكة</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                            <WifiOff className="w-4 h-4" />
                            <span>وضع عدم الاتصال</span>
                          </span>
                        )}
                      </div>

                      <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                        <span className="text-slate-400">قاعدة البيانات السحابية:</span>
                        {firestoreConnected ? (
                          <span className="text-teal-300 font-bold flex items-center gap-1.5">
                            <span>متصلة</span>
                            {firestoreLatency !== null && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-950 border border-teal-800 text-teal-400 font-mono">
                                {firestoreLatency}ms
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-amber-400 font-bold">قيد المزامنة المحلية</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 4. Account Information & Logout */}
                  <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <UserCheck className="w-5 h-5 text-teal-400" />
                        <span>بيانات الحساب والجلسة النشطة</span>
                      </h2>
                      <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                        حساب موثق ✓
                      </span>
                    </div>

                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5 text-xs">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                        <span className="text-slate-400">الاسم الكامل:</span>
                        <strong className="text-white">{userProfile?.displayNameArabic || user.displayName || 'مستخدم مسجل'}</strong>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                        <span className="text-slate-400">البريد الإلكتروني:</span>
                        <span className="font-mono text-teal-300" dir="ltr">{user.email}</span>
                      </div>
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/80">
                        <span className="text-slate-400">معرف المستخدم (UID):</span>
                        <span className="font-mono text-slate-400 text-[11px]" dir="ltr">{user.uid}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">الوضع والصلاحية النشطة:</span>
                        <span className="font-bold text-amber-400">
                          {activeRole === 'platform_owner' ? '👑 مالك المنصة (Platform Owner)' :
                           activeRole === 'university_admin' ? '🏛️ مشرف جامعة (University Admin)' :
                           '🎓 طالب طب بشري'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={logout}
                      className="w-full py-2.5 px-4 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>تسجيل الخروج من المنصة</span>
                    </button>
                  </div>

                </div>
              )}

            </main>
          </div>
        </div>
      )}
    </div>
  );
}
