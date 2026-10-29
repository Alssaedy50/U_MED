/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED StudentOnboardingGate Component
 * Features a 2-step registration wizard for new students:
 * - Step 1: Full Name, Unique Username (@username), and Password
 * - Step 2: University, Specialty, Study Level, and Avatar
 * Keeps the single PWA install button in the header without bottom duplication.
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  UserCheck,
  LogOut,
  LogIn,
  RefreshCw,
  Stethoscope,
  Phone,
  Mail,
  Archive,
  GraduationCap,
  AtSign,
  Camera,
  Smartphone,
  Upload,
  ChevronLeft,
  ChevronRight,
  User
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  checkIdentifierUniqueness,
  normalizeUsername,
  validateUsernameFormat,
  checkDeviceSingleAccountPolicy,
  getDeviceFingerprint,
  YEMEN_UNIVERSITIES_OPTIONS,
  MEDICAL_SPECIALTIES_OPTIONS,
  STUDY_LEVELS_OPTIONS,
  MEDICAL_PRESET_AVATARS,
  compressAndReadProfileImage
} from '../../lib/firebase.ts';
import { saveUserAcademicContext } from '../../services/academicService.ts';
import { PlatformBrandingAndPolicies } from '../../services/platformSettingsService.ts';
import { PlatformLogoBadge } from '../settings/PlatformOwnerSettingsModalAndCard.tsx';
import { PWAHeaderControls } from '../pwa/PWAInstallModalAndBanner.tsx';
import { ActiveTabType } from '../navigation/WorkspaceShellNav.tsx';

interface StudentOnboardingGateProps {
  platformSettings: PlatformBrandingAndPolicies;
  onOpenLegalContact: () => void;
  onAuthenticated: (targetTab: ActiveTabType) => void;
  initialAuthTab?: 'login' | 'register';
}

export function ArchivedAccountGate({
  archiveReason,
  onLogout
}: {
  archiveReason?: string;
  onLogout: () => void;
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-8 px-4 overflow-y-auto">
      <div className="umed-card max-w-md w-full mx-auto bg-[var(--bg-card)] border border-amber-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400">
          <Archive className="w-7 h-7" />
        </div>
        <h1 className="text-base font-bold text-[var(--text-primary)]">
          هذا الحساب مؤرشف وموقوف حالياً
        </h1>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          تم أرشفة حسابك في قاعدة البيانات السحابية من قِبل مالك المنصة. لا يمكنك الوصول إلى المحتوى الدراسي بهذا الحساب حتى يتم إلغاء الأرشفة.
        </p>
        {archiveReason && (
          <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-amber-400">
            سبب الأرشفة: {archiveReason}
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}

export default function StudentOnboardingGate({
  platformSettings,
  onOpenLegalContact,
  onAuthenticated,
  initialAuthTab = 'register'
}: StudentOnboardingGateProps) {
  const {
    loginGoogle,
    loginEmail,
    registerEmail,
    loginPhone,
    registerPhone,
    loginWithIdentifier,
    registerWithUsername
  } = useAuth();

  const [authTab, setAuthTab] = useState<'login' | 'register'>(initialAuthTab);
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [authMethod, setAuthMethod] = useState<'username' | 'phone' | 'email'>('username');

  // Step 1 Registration & Login Inputs
  const [displayNameInput, setDisplayNameInput] = useState<string>('');
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [loginIdentifierInput, setLoginIdentifierInput] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');

  // Step 2 Academic & Avatar Inputs
  const [regAvatarUrl, setRegAvatarUrl] = useState<string>('');
  const [regUniversityId, setRegUniversityId] = useState<string>('univ-dar-al-salam');
  const [regSpecialtyArabic, setRegSpecialtyArabic] = useState<string>(
    'الطب البشري والجراحة العامة (MBBS)'
  );
  const [regStudyLevelId, setRegStudyLevelId] = useState<string>('lvl-4');
  const [regSubmitting, setRegSubmitting] = useState<boolean>(false);

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
    setUniquenessStatus((prev) => ({ ...prev, checking: true }));
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

  const handleProceedToStepTwo = () => {
    setAuthError(null);
    if (!displayNameInput.trim()) {
      setAuthError('يرجى إدخال الاسم الكامل بالعربية أولاً.');
      return;
    }
    const fmt = validateUsernameFormat(usernameInput);
    if (!fmt.valid) {
      setAuthError(fmt.message || 'يجب أن يتكون اسم المستخدم من 4 أحرف إنجليزية على الأقل.');
      return;
    }
    if (uniquenessStatus.available === false) {
      setAuthError(uniquenessStatus.reason || 'اسم المستخدم غير متاح، يرجى اختيار اسم آخر.');
      return;
    }
    setRegisterStep(2);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (authTab === 'register' && authMethod === 'username' && registerStep === 1) {
      handleProceedToStepTwo();
      return;
    }

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
        onAuthenticated('student_dashboard');
      } else {
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

        if (authMethod === 'username') {
          const fmt = validateUsernameFormat(usernameInput);
          if (!fmt.valid) {
            setAuthError(fmt.message || 'يجب أن يتكون اسم المستخدم من 4 أحرف إنجليزية على الأقل');
            setRegSubmitting(false);
            return;
          }
          const univObj = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === regUniversityId);
          const univNameArabic =
            univObj?.nameArabic || 'جامعة دار السلام الدولية للعلوم والتكنولوجيا';

          await registerWithUsername(
            usernameInput.trim(),
            passwordInput || undefined,
            displayNameInput.trim() || undefined,
            {
              avatarUrl: regAvatarUrl || undefined,
              universityId: regUniversityId,
              universityNameArabic: univNameArabic,
              specialtyArabic: regSpecialtyArabic,
              studyLevelId: regStudyLevelId
            }
          );

          saveUserAcademicContext({
            universityId: regUniversityId,
            universityNameArabic: univNameArabic,
            studyLevelId: regStudyLevelId
          });

          setAuthSuccess(
            'تم تسجيل اسم المستخدم وتوثيق جهازك ومزامنة ملفك الأكاديمي في السحابة بنجاح ✓'
          );
        } else if (authMethod === 'phone') {
          if (!phoneInput.trim()) {
            setAuthError('يرجى إدخال رقم الهاتف اليمني (مثال: 771234567)');
            setRegSubmitting(false);
            return;
          }
          await registerPhone(
            phoneInput,
            passwordInput,
            displayNameInput.trim() || `مستخدم ${phoneInput.trim()}`
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
            displayNameInput.trim() || emailInput.split('@')[0]
          );
          setAuthSuccess('تم إنشاء حسابك السحابي بنجاح ✓');
        }
        onAuthenticated('student_dashboard');
      }
      setPasswordInput('');
    } catch (err: any) {
      let msg = err.message || 'حدث خطأ أثناء المصادقة';
      if (msg.includes('ACCOUNT_DELETED_FROM_CLOUD')) {
        msg = 'هذا الحساب تم حذفه نهائياً من السحابة. يمكنك تسجيل حساب جديد الآن.';
      } else if (msg.includes('ACCOUNT_ARCHIVED')) {
        msg = 'هذا الحساب مؤرشف وموقوف مؤقتاً من قِبل إدارة المنصة.';
      } else if (msg.includes('INVALID_PHONE_NUMBER')) {
        msg =
          'يرجى إدخال رقم هاتف يمني صحيح مكوّن من 9 أرقام يبدأ بـ 70 أو 71 أو 73 أو 77 أو 78 (مثال: 771234567)';
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
      onAuthenticated('student_dashboard');
    } catch {
      setAuthTab('login');
      setAuthMethod('username');
      setLoginIdentifierInput(devicePolicy.existingUsername);
      setAuthError('يرجى إدخال كلمة المرور الخاصة بحسابك للدخول');
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError(null);
    setAuthSuccess(null);
    try {
      await loginGoogle();
      setAuthSuccess('تم تسجيل الدخول بواسطة Google بنجاح');
      onAuthenticated('student_dashboard');
    } catch (err: any) {
      let msg = err.message || 'تعذر تسجيل الدخول بواسطة Google';
      if (msg.includes('ACCOUNT_DELETED_FROM_CLOUD')) {
        msg = 'هذا الحساب تم حذفه نهائياً من السحابة.';
      } else if (msg.includes('ACCOUNT_ARCHIVED')) {
        msg = 'هذا الحساب مؤرشف وموقوف مؤقتاً من قِبل إدارة المنصة.';
      } else if (msg.includes('unauthorized-domain')) {
        msg =
          'نطاق الموقع الحالي غير مضاف بعد في قائمة Authorized domains داخل إعدادات Firebase Authentication.';
      }
      setAuthError(msg);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-6 px-3.5 sm:px-6 overflow-y-auto" dir="rtl">
      <div className="umed-card max-w-xl w-full mx-auto bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-7 shadow-2xl space-y-5">
        {/* Brand Header with Single Install Button in Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <PlatformLogoBadge settings={platformSettings} size="md" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] truncate">
                {platformSettings.platformNameArabic}
              </h1>
              <p className="text-xs text-teal-400 font-semibold">
                بوابة الدخول والتسجيل الأكاديمي للطلاب
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAHeaderControls />
            <button
              type="button"
              onClick={onOpenLegalContact}
              className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] text-[11px] font-bold shrink-0"
            >
              المساعدة والشروط
            </button>
          </div>
        </div>

        {/* Device Single-Account Verification Banner */}
        <div
          className={`p-3.5 rounded-xl border text-xs space-y-2 ${
            devicePolicy.checking
              ? 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)]'
              : devicePolicy.allowed
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/40 text-amber-400'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold">
              <Smartphone className="w-4 h-4 text-teal-400 shrink-0" />
              <span>نظام التحقق من الهاتف لمنع تعدد الحسابات:</span>
            </div>
            <span
              className="font-mono text-[10px] px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] tabular-nums"
              dir="ltr"
            >
              ID: {devicePolicy.deviceId.slice(-10)}
            </span>
          </div>

          {devicePolicy.checking ? (
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" />
              <span>جارٍ فحص بصمة الجهاز والتحقق من عدم وجود حساب مسبق على هذا الهاتف...</span>
            </div>
          ) : devicePolicy.allowed ? (
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              ✓ هذا الهاتف موثّق ومتاح لتسجيل حساب طالب واحد فريد.
            </p>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[11px] text-amber-400 leading-relaxed font-semibold">
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
        <div className="flex bg-[var(--bg-input)] p-1 rounded-xl border border-[var(--border-color)] text-xs">
          <button
            type="button"
            onClick={() => {
              setAuthTab('register');
              setRegisterStep(1);
              setAuthMethod('username');
              setAuthError(null);
            }}
            className={`flex-1 py-2.5 rounded-lg font-bold transition-colors ${
              authTab === 'register'
                ? 'bg-teal-600 text-white shadow'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            إنشاء حساب جديد
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
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            تسجيل الدخول لحساب مسجل
          </button>
        </div>

        {authTab === 'login' && (
          <div className="grid grid-cols-3 gap-2 bg-[var(--bg-input)] p-1 rounded-xl border border-[var(--border-color)] text-xs">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('username');
                setAuthError(null);
              }}
              className={`py-2 px-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                authMethod === 'username'
                  ? 'bg-[var(--bg-elevated)] text-teal-400 border border-teal-500/40'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  ? 'bg-[var(--bg-elevated)] text-teal-400 border border-teal-500/40'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  ? 'bg-[var(--bg-elevated)] text-teal-400 border border-teal-500/40'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>بالبريد الإلكتروني</span>
            </button>
          </div>
        )}

        {authError && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{authError}</span>
          </div>
        )}

        {authSuccess && (
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <span>{authSuccess}</span>
          </div>
        )}

        <form onSubmit={handleAuthSubmit} className="space-y-4 text-xs">
          {authTab === 'register' ? (
            <>
              {/* Two-Step Progress Indicator */}
              <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setRegisterStep(1)}
                  className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                    registerStep === 1
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-teal-400 hover:bg-[var(--bg-card)]'
                  }`}
                >
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>الخطوة 1: الهوية والدخول</span>
                </button>
                <button
                  type="button"
                  onClick={handleProceedToStepTwo}
                  className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                    registerStep === 2
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                  <span>الخطوة 2: الجامعة والصورة</span>
                </button>
              </div>

              {registerStep === 1 ? (
                /* STEP 1: Full Name, Unique Username (@username), and Password */
                <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-3.5">
                  <div>
                    <label className="block text-[var(--text-primary)] font-bold mb-1">
                      الاسم الكامل بالعربية *
                    </label>
                    <input
                      type="text"
                      required
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      placeholder="مثال: أحمد محمد علي"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[var(--text-primary)] font-bold flex items-center justify-between flex-wrap gap-1 mb-1">
                      <span>اسم المستخدم الفريد (@username) *</span>
                      <span className="text-[10px] text-teal-400 font-semibold">
                        4 أحرف إنجليزية على الأقل (A = a)
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
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    {usernameInput.trim() && (
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1 mt-1">
                        <span>الاسم الموحد في السحابة:</span>
                        <code className="text-teal-400 font-mono font-bold" dir="ltr">
                          @{normalizeUsername(usernameInput)}
                        </code>
                      </div>
                    )}

                    {(uniquenessStatus.checking || uniquenessStatus.available !== null) && (
                      <div
                        className={`mt-2 p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${
                          uniquenessStatus.checking
                            ? 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-muted)]'
                            : uniquenessStatus.available
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                            : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                        }`}
                      >
                        {uniquenessStatus.checking ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400 shrink-0" />
                            <span>جارٍ فحص التوفر وعدم التشابه...</span>
                          </>
                        ) : uniquenessStatus.available ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>اسم المستخدم فريد ومتاح للتسجيل ✓</span>
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

                  <div>
                    <label className="block text-[var(--text-primary)] font-bold mb-1">
                      كلمة المرور (لتأمين حسابك):
                    </label>
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="6 أحرف أو أرقام على الأقل (أو اتركه فارغاً للدخول السريع)"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-teal-500"
                      dir="ltr"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleProceedToStepTwo}
                    disabled={uniquenessStatus.checking || uniquenessStatus.available === false}
                    className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-md"
                  >
                    <span>التالي: اختيار الجامعة والتخصص والصورة</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* STEP 2: University, Specialty, Study Level, and Avatar */
                <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1 text-[11px]">
                        الجامعة:
                      </label>
                      <select
                        value={regUniversityId}
                        onChange={(e) => setRegUniversityId(e.target.value)}
                        className="w-full px-2.5 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-teal-500"
                      >
                        {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nameArabic}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1 text-[11px]">
                        التخصص:
                      </label>
                      <select
                        value={regSpecialtyArabic}
                        onChange={(e) => setRegSpecialtyArabic(e.target.value)}
                        className="w-full px-2.5 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-teal-500"
                      >
                        {MEDICAL_SPECIALTIES_OPTIONS.map((sp) => (
                          <option key={sp.id} value={sp.nameArabic}>
                            {sp.nameArabic}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1 text-[11px]">
                        المستوى الدراسي:
                      </label>
                      <select
                        value={regStudyLevelId}
                        onChange={(e) => setRegStudyLevelId(e.target.value)}
                        className="w-full px-2.5 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-teal-400 font-bold text-xs focus:outline-none focus:border-teal-500"
                      >
                        {STUDY_LEVELS_OPTIONS.map((lvl) => (
                          <option key={lvl.id} value={lvl.id}>
                            {lvl.nameArabic}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Avatar Selection */}
                  <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-teal-400" />
                        <span>الصورة الرمزية (اختياري):</span>
                      </span>
                      {regAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => setRegAvatarUrl('')}
                          className="text-[11px] text-rose-400 hover:underline font-semibold"
                        >
                          إزالة الصورة
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-[var(--bg-input)] border-2 border-teal-500/40 flex items-center justify-center overflow-hidden shrink-0">
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

                      <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/40 text-teal-400 font-bold text-xs flex items-center gap-1.5 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>رفع صورة شخصية</span>
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
                                : 'border-[var(--border-color)] opacity-75 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={presetUrl}
                              alt={`Avatar ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setRegisterStep(1)}
                      className="px-4 py-3 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] font-bold flex items-center gap-1.5"
                    >
                      <ChevronRight className="w-4 h-4" />
                      <span>السابق</span>
                    </button>

                    <button
                      type="submit"
                      disabled={
                        regSubmitting || !devicePolicy.allowed || uniquenessStatus.available === false
                      }
                      className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/25"
                    >
                      {regSubmitting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                      <span>
                        {!devicePolicy.allowed
                          ? 'هذا الهاتف مرتبط بحساب مسبق'
                          : 'إتمام التسجيل والدخول للمنصة'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* LOGIN FORM FOR RETURNING STUDENTS OR PLATFORM OWNER */
            <>
              <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-3">
                {authMethod === 'username' ? (
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                      اسم المستخدم (@username) أو البريد الإلكتروني أو رقم الهاتف:
                    </label>
                    <input
                      type="text"
                      required
                      value={loginIdentifierInput}
                      onChange={(e) => setLoginIdentifierInput(e.target.value)}
                      placeholder="@ahmedmed أو email@example.com"
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-teal-500"
                      dir="ltr"
                    />
                  </div>
                ) : authMethod === 'phone' ? (
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                      رقم الهاتف المحمول:
                    </label>
                    <div className="flex items-center gap-2" dir="ltr">
                      <span className="px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-teal-400 font-mono font-bold select-none shrink-0">
                        +967
                      </span>
                      <input
                        type="tel"
                        required
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="771234567"
                        className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-teal-500"
                        dir="ltr"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                      البريد الإلكتروني:
                    </label>
                    <input
                      type="email"
                      required
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-teal-500"
                      dir="ltr"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold">
                    كلمة المرور{' '}
                    {authMethod === 'username' ? '(اتركها فارغة إذا سجلت بدون كلمة مرور)' : ''}:
                  </label>
                  <input
                    type="password"
                    required={authMethod !== 'username'}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-teal-500"
                    dir="ltr"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={regSubmitting}
                className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/25"
              >
                {regSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                <span>تسجيل الدخول إلى المنصة</span>
              </button>
            </>
          )}
        </form>

        {authTab === 'login' && (
          <>
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border-color)]"></div>
              </div>
              <div className="relative flex justify-center text-[10px]">
                <span className="bg-[var(--bg-card)] px-3 text-[var(--text-muted)]">
                  أو الدخول عبر Google
                </span>
              </div>
            </div>

            <button
              onClick={handleGoogleAuth}
              disabled={regSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow border border-slate-300"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.87c2.26-2.09 3.67-5.17 3.67-9.15z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.05c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.15C3.29 21.36 7.35 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.26C.46 8.2.01 9.99.01 12c0 2.01.45 3.8 1.25 5.39l4.01-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.29 2.64 1.26 6.61l4.01 3.15c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
              <span>الدخول بحساب Google</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
