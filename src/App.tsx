/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED — Yemen-First Medical Education Platform
 * Production Application Entry & Role-Isolated Console
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
  Plus
} from 'lucide-react';
import { useAuth } from './context/AuthContext.tsx';
import { UserRole, UserRoleDoc, AuditLog } from './types/umed.ts';
import { fetchMergedAuditLogs, fetchAllUserRoles, assignUserRole } from './lib/firebase.ts';
import StudentDashboard from './components/student/StudentDashboard.tsx';

// Code-splitting admin heavy modules to minimize student initial bundle size
const AcademicStructureManager = React.lazy(() => import('./components/admin/AcademicStructureManager.tsx'));
const EnrollmentApprovalManager = React.lazy(() => import('./components/admin/EnrollmentApprovalManager.tsx'));
const EducationalContentManager = React.lazy(() => import('./components/admin/EducationalContentManager.tsx'));
const AssessmentManager = React.lazy(() => import('./components/admin/AssessmentManager.tsx'));
const BackupRestoreConsole = React.lazy(() => import('./components/admin/BackupRestoreConsole.tsx'));

type ActiveTabType =
  | 'student_dashboard'
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

  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
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
  const [activeTab, setActiveTab] = useState<ActiveTabType>('student_dashboard');

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

  // Ensure students cannot stay on an admin tab
  useEffect(() => {
    if (!isAuthorizedAdmin && activeTab !== 'student_dashboard' && activeTab !== 'auth') {
      setActiveTab('student_dashboard');
    }
  }, [isAuthorizedAdmin, activeTab]);

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

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} transition-colors duration-200`} dir="rtl">
      
      {/* 1. Global Connectivity & Theme Status Bar */}
      <div className="bg-slate-900 border-b border-slate-800 text-xs px-4 py-2 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {isOnline ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>متصل</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-400 font-medium animate-pulse">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>وضع عدم الاتصال</span>
                </span>
              )}
            </div>

            <span className="text-slate-700">|</span>

            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden sm:inline text-slate-400">السحابة:</span>
              {firestoreConnected ? (
                <span className="text-teal-300 font-semibold flex items-center gap-1">
                  <span>متصلة</span>
                  {firestoreLatency !== null && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-950 border border-teal-800 text-teal-400 font-mono">
                      {firestoreLatency}ms
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-amber-400 font-semibold">جاري الفحص...</span>
              )}
              <button 
                onClick={checkConnectivity}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                title="إعادة فحص الاتصال"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
              <span>{isDarkMode ? 'وضع نهاري' : 'وضع ليلي'}</span>
            </button>

            {user && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs">
                <span className={`font-bold flex items-center gap-1 ${
                  activeRole === 'platform_owner' ? 'text-amber-400' :
                  activeRole === 'university_admin' ? 'text-teal-400' :
                  'text-indigo-400'
                }`}>
                  {activeRole === 'platform_owner' && <Crown className="w-3 h-3" />}
                  {activeRole === 'platform_owner' ? 'مالك المنصة' :
                   activeRole === 'university_admin' ? 'مشرف الجامعة' : 'طالب طب'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Platform Main Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20 text-white font-black text-xl">
              U
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base sm:text-lg text-white">UMED — منصة التعليم الطبي اليمنية</h1>
                <span className="hidden sm:inline-block text-[11px] px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-semibold">
                  كليات الطب البشري • نظام البلوكات
                </span>
              </div>
              <p className="text-xs text-slate-400">
                المقررات الدراسية، المكتبة الطبية منخفضة الاستهلاك، والاختبارات والمسابقات السريرية
              </p>
            </div>
          </div>

          {/* User Profile Mini Bar */}
          {user && (
            <div className="flex items-center gap-3 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
              <div className="text-right">
                <div className="text-xs font-bold text-white">
                  {userProfile?.displayNameArabic || user.displayName || user.email}
                </div>
                <div className="text-[10px] text-slate-400 font-mono" dir="ltr">
                  {user.email}
                </div>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Bar (Only shown when logged in; Admin tabs strictly isolated to Authorized Admins) */}
        {user && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <nav className="flex space-x-reverse space-x-2 border-t border-slate-800/60 py-2 overflow-x-auto no-scrollbar">
              
              {/* Student Primary Dashboard Tab */}
              <button
                onClick={() => setActiveTab('student_dashboard')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === 'student_dashboard'
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white bg-slate-800/60'
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>{isAuthorizedAdmin ? 'معاينة لوحة الطالب' : 'لوحة الطالب الطبية'}</span>
              </button>

              {/* ADMIN-ONLY TABS */}
              {isAuthorizedAdmin && (
                <>
                  <button
                    onClick={() => setActiveTab('academic')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeTab === 'academic'
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>الهيكل الأكاديمي والجامعات</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('content_manager')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeTab === 'content_manager'
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>إدارة المحتوى والمكتبة</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('assessments_manager')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeTab === 'assessments_manager'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span>إدارة الاختبارات والمسابقات</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('enrollment_queue')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeTab === 'enrollment_queue'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>اعتماد طلبات القيد</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('backup_restore')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeTab === 'backup_restore'
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <HardDrive className="w-3.5 h-3.5 text-teal-400" />
                    <span>النسخ الاحتياطي</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('roles')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeTab === 'roles'
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>إدارة المشرفين والصلاحيات</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('audit')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeTab === 'audit'
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>سجل التدقيق</span>
                  </button>
                </>
              )}

              <button
                onClick={() => setActiveTab('auth')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeTab === 'auth'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>حسابي</span>
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* 3. Main Body */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        
        {/* IF NOT LOGGED IN: SHOW CLEAN LOGIN / REGISTRATION PORTAL */}
        {!user ? (
          <div className="max-w-md mx-auto my-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center mx-auto text-white font-black text-2xl shadow-lg shadow-teal-500/20">
                U
              </div>
              <h2 className="text-lg font-bold text-white">مرحباً بك في منصة UMED الطبية</h2>
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
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow"
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
        ) : (
          /* AUTHENTICATED USER VIEWS */
          <>
            {activeTab === 'student_dashboard' && (
              <StudentDashboard
                uid={user.uid}
                userEmail={user.email || ''}
                displayNameArabic={userProfile?.displayNameArabic || user.displayName || 'طالب كلية الطب البشري'}
              />
            )}

            <React.Suspense
              fallback={
                <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-teal-400" />
                  <span className="text-xs font-semibold">جارٍ تحميل واجهة الإدارة المحسّنة...</span>
                </div>
              }
            >
              {isAuthorizedAdmin && activeTab === 'academic' && (
                <AcademicStructureManager />
              )}

              {isAuthorizedAdmin && activeTab === 'content_manager' && (
                <EducationalContentManager
                  adminUid={user.uid}
                  assignedUniversityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                />
              )}

              {isAuthorizedAdmin && activeTab === 'assessments_manager' && (
                <AssessmentManager
                  universityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                />
              )}

              {isAuthorizedAdmin && activeTab === 'enrollment_queue' && (
                <EnrollmentApprovalManager
                  adminUid={user.uid}
                  assignedUniversityId={roleDoc?.assignedUniversityId}
                />
              )}

              {isAuthorizedAdmin && activeTab === 'backup_restore' && (
                <BackupRestoreConsole
                  adminEmail={user.email || ''}
                  assignedUniversityId={roleDoc?.assignedUniversityId || 'univ-dar-al-salam'}
                />
              )}
            </React.Suspense>

            {/* ADMIN TAB: ROLES & UNIVERSITY ADMIN ASSIGNMENT */}
            {isAuthorizedAdmin && activeTab === 'roles' && (
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
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
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

                  {/* Admin View Switcher */}
                  <div className="pt-4 border-t border-slate-800">
                    <span className="text-xs text-slate-400 block mb-2 font-semibold">وضع المعاينة السريع للمسؤول:</span>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <button
                        onClick={() => setActiveRole('platform_owner')}
                        className={`p-2 rounded-xl border font-bold ${activeRole === 'platform_owner' ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                      >
                        👑 مالك المنصة
                      </button>
                      <button
                        onClick={() => setActiveRole('university_admin')}
                        className={`p-2 rounded-xl border font-bold ${activeRole === 'university_admin' ? 'bg-teal-500/20 border-teal-500 text-teal-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                      >
                        🏛️ مشرف جامعة
                      </button>
                      <button
                        onClick={() => { setActiveRole('student'); setActiveTab('student_dashboard'); }}
                        className={`p-2 rounded-xl border font-bold ${activeRole === 'student' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}
                      >
                        🎓 معاينة كطالب
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ADMIN TAB: AUDIT LOGS */}
            {isAuthorizedAdmin && activeTab === 'audit' && (
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

            {/* TAB: ACCOUNT DETAILS & OWNER VERIFICATION */}
            {activeTab === 'auth' && (
              <div className="max-w-2xl mx-auto bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-teal-400" />
                    <span>بيانات الحساب والجلسة النشطة</span>
                  </h2>
                  <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    متصل وموثق ✓
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
                    <span className="text-slate-400">الصلاحية المعتمدة:</span>
                    <span className="font-bold text-amber-400">
                      {roleDoc?.role === 'platform_owner' ? '👑 مالك المنصة (Platform Owner)' :
                       roleDoc?.role === 'university_admin' ? '🏛️ مشرف جامعة (University Admin)' :
                       '🎓 طالب طب بشري (Student)'}
                    </span>
                  </div>
                </div>

                {isAuthorizedAdmin && (
                  <div className="p-4 bg-slate-950 rounded-xl border border-amber-500/30 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <Crown className="w-4 h-4" />
                        <span>تأكيد ومزامنة صلاحية مالك المنصة سحابياً</span>
                      </span>
                    </div>
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
                      {bootstrapLoading ? 'جاري التحقق والمزامنة...' : 'تأكيد وحفظ صلاحية المالك في Firestore والخادم'}
                    </button>
                  </div>
                )}

                <button
                  onClick={logout}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>تسجيل الخروج من المنصة</span>
                </button>
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}
