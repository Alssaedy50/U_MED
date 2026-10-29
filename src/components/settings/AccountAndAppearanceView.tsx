/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED AccountAndAppearanceView Component
 * Focused on:
 * 1. Appearance & Theme Selection
 * 2. Student Academic Profile Summary Card (navigates to 'student_profile' instead of duplicating the form)
 * 3. Password & Security Management
 * 4. Account & Login Sessions Management (hiding technical UID & cloud sync internals from regular students)
 */

import React, { useState } from 'react';
import { updatePassword } from 'firebase/auth';
import {
  CheckCircle2,
  AlertCircle,
  LogOut,
  Crown,
  RefreshCw,
  Stethoscope,
  X,
  Trash2,
  ShieldAlert,
  Sparkles,
  User,
  Lock,
  ShieldCheck,
  Smartphone,
  ChevronLeft,
  Building2,
  GraduationCap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  auth,
  isPrimaryOwnerEmail,
  getDeviceFingerprint,
  STUDY_LEVELS_OPTIONS
} from '../../lib/firebase.ts';
import { PlatformBrandingAndPolicies } from '../../services/platformSettingsService.ts';
import {
  PlatformLogoBadge,
  PlatformOwnerSettingsCard
} from './PlatformOwnerSettingsModalAndCard.tsx';
import { PWASettingsCard } from '../pwa/PWAInstallModalAndBanner.tsx';
import {
  ActiveTabType,
  UmedTheme,
  THEME_OPTIONS,
  renderBiDiRoleLabel
} from '../navigation/WorkspaceShellNav.tsx';
import StudentOnboardingGate from '../auth/StudentOnboardingGate.tsx';

interface AccountAndAppearanceViewProps {
  theme: UmedTheme;
  setTheme: (theme: UmedTheme) => void;
  setActiveTab: (tab: ActiveTabType) => void;
  platformSettings: PlatformBrandingAndPolicies;
  isStrictPlatformOwner: boolean;
  onOpenLegalModal: (tab: 'terms' | 'privacy' | 'contact') => void;
}

export default function AccountAndAppearanceView({
  theme,
  setTheme,
  setActiveTab,
  platformSettings,
  isStrictPlatformOwner,
  onOpenLegalModal
}: AccountAndAppearanceViewProps) {
  const {
    user,
    roleDoc,
    userProfile,
    logout,
    deleteOwnAccount,
    activeRole,
    setActiveRole,
    isAuthorizedAdmin
  } = useAuth();

  // Password & Security State
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordSaving, setPasswordSaving] = useState<boolean>(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Account Deletion Modal State
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [deleteAccountLoading, setDeleteAccountLoading] = useState<boolean>(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.trim().length < 6) {
      setPasswordFeedback({
        type: 'error',
        text: 'يجب أن تتكون كلمة المرور الجديدة من 6 أحرف أو أرقام على الأقل.'
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        type: 'error',
        text: 'كلمتا المرور غير متطابقتين، يرجى التأكد من كتابتهما بشكل متطابق.'
      });
      return;
    }

    if (!auth.currentUser) {
      setPasswordFeedback({
        type: 'error',
        text: 'يرجى تسجيل الدخول مجدداً لتحديث كلمة المرور.'
      });
      return;
    }

    setPasswordSaving(true);
    try {
      await updatePassword(auth.currentUser, newPassword.trim());
      setNewPassword('');
      setConfirmPassword('');
      setPasswordFeedback({
        type: 'success',
        text: 'تم تحديث كلمة المرور وتأمين حسابك بنجاح ✓'
      });
    } catch (err: any) {
      const code = String(err?.code || err?.message || '');
      if (code.includes('requires-recent-login')) {
        setPasswordFeedback({
          type: 'error',
          text: 'لأسباب أمنية، يرجى تسجيل الخروج ثم الدخول مجدداً قبل تغيير كلمة المرور.'
        });
      } else {
        setPasswordFeedback({
          type: 'error',
          text: err?.message || 'تعذر تحديث كلمة المرور في الوقت الحالي.'
        });
      }
    } finally {
      setPasswordSaving(false);
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
    } catch (err: any) {
      setDeleteAccountError(err.message || 'تعذر حذف الحساب');
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  const currentLevelLabel =
    STUDY_LEVELS_OPTIONS.find((l) => l.id === (userProfile?.studyLevelId || 'lvl-4'))?.nameArabic ||
    'المستوى الرابع';

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      {!user && (
        <StudentOnboardingGate
          platformSettings={platformSettings}
          onOpenLegalContact={() => onOpenLegalModal('contact')}
          onAuthenticated={(tab) => setActiveTab(tab)}
        />
      )}

      {/* EXCLUSIVE PLATFORM OWNER BRANDING, TERMS/PRIVACY & CONTACT CHANNELS CONSOLE */}
      {user && isStrictPlatformOwner && (
        <PlatformOwnerSettingsCard
          ownerEmail={user.email || user.uid}
          settings={platformSettings}
          onOpenPreviewModal={(tab) => onOpenLegalModal(tab)}
        />
      )}

      {/* Quick Legal & Contact Channels Access Card for All Users */}
      <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PlatformLogoBadge settings={platformSettings} size="md" />
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {platformSettings.platformNameArabic}
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              {platformSettings.platformTaglineArabic}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onOpenLegalModal('terms')}
            className="px-3 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] font-semibold transition-colors"
          >
            شروط الاستخدام
          </button>
          <button
            type="button"
            onClick={() => onOpenLegalModal('privacy')}
            className="px-3 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] font-semibold transition-colors"
          >
            سياسة الخصوصية
          </button>
          <button
            type="button"
            onClick={() => onOpenLegalModal('contact')}
            className="px-3 py-1.5 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/40 text-teal-400 font-bold transition-colors"
          >
            تواصل مع المنصة
          </button>
        </div>
      </div>

      {/* 0. Installable App (PWA) & Offline Auto-Sync Panel */}
      <PWASettingsCard />

      {/* 1. Theme & Appearance Settings */}
      <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="pb-3 border-b border-[var(--border-color)]">
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            <span>المظهر واختيار الثيم</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            اختر المظهر اللوني المفضل لديك مع تباين واضح للنصوص والبطاقات وحفظ تلقائي لاختيارك
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
                    ? 'bg-teal-600/15 border-teal-500 text-[var(--text-primary)] font-bold shadow-sm'
                    : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-center text-teal-400 shrink-0">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">ثيم {opt.label}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{opt.subtitle}</div>
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
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="pb-3 border-b border-[var(--border-color)]">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              <span>تبديل بوابة العمل (خاص بالمالك، مالك الجامعة، ومناديب الدفعات)</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
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
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                    : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                    ? 'bg-teal-500/20 border-teal-500 text-teal-400'
                    : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>🏛️ مالك الجامعة</span>
                {activeRole === 'university_admin' && <CheckCircle2 className="w-4 h-4 text-teal-400" />}
              </button>
            )}

            {(roleDoc?.role === 'platform_owner' ||
              roleDoc?.role === 'university_admin' ||
              roleDoc?.role === 'batch_rep') && (
              <button
                onClick={() => {
                  setActiveRole('batch_rep');
                  setActiveTab('roles');
                }}
                className={`p-3.5 rounded-xl border font-bold text-right transition-all flex items-center justify-between ${
                  activeRole === 'batch_rep'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                    : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                    : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                  : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>🎓 معاينة كطالب</span>
              {activeRole === 'student' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
            </button>
          </div>
        </div>
      )}

      {/* 3. Academic Profile Summary Card (Redirects to 'student_profile') */}
      {user && (
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {userProfile?.avatarUrl ? (
                <img
                  src={userProfile.avatarUrl}
                  alt={userProfile.displayNameArabic || 'صورة الطالب'}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-teal-500/40 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white font-black text-xl shrink-0">
                  {(userProfile?.displayNameArabic || user.displayName || 'ط').trim().charAt(0)}
                </div>
              )}

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold text-[var(--text-primary)] truncate">
                    د. {userProfile?.displayNameArabic || user.displayName || 'طالب الطب البشري'}
                  </h2>
                  {userProfile?.username && (
                    <span
                      className="px-2 py-0.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 font-mono text-xs font-bold"
                      dir="ltr"
                    >
                      @{userProfile.username}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-teal-400" />
                    <span>
                      {userProfile?.universityNameArabic ||
                        'جامعة دار السلام الدولية للعلوم والتكنولوجيا'}
                    </span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-teal-400 font-semibold">
                    <Stethoscope className="w-3.5 h-3.5" />
                    <span>
                      {userProfile?.specialtyArabic || 'الطب البشري والجراحة العامة (MBBS)'}
                    </span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-amber-400 font-semibold">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>{currentLevelLabel}</span>
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('student_profile')}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs shrink-0"
            >
              <User className="w-4 h-4" />
              <span>الانتقال إلى ملفي الأكاديمي لتعديل البيانات</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 4. Password & Security Management */}
      {user && (
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="pb-3 border-b border-[var(--border-color)]">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Lock className="w-5 h-5 text-teal-400" />
              <span>كلمة المرور والأمان</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              تعيين أو تحديث كلمة المرور الخاصة بحسابك لتأمين الدخول من أي متصفح
            </p>
          </div>

          {passwordFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border flex items-center gap-2 ${
                passwordFeedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
              }`}
            >
              {passwordFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{passwordFeedback.text}</span>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                  كلمة المرور الجديدة:
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="6 أحرف أو أرقام على الأقل"
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-teal-500"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                  تأكيد كلمة المرور الجديدة:
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد كتابة كلمة المرور"
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-teal-500"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={passwordSaving || !newPassword.trim()}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                {passwordSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>حفظ كلمة المرور الجديدة</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Account & Login Sessions Management */}
      {user && (
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="pb-3 border-b border-[var(--border-color)]">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-400" />
              <span>إدارة الحساب وجلسات الدخول</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              تفاصيل الجلسة النشطة على هذا الجهاز وخيارات تسجيل الخروج أو إغلاق الحساب
            </p>
          </div>

          <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)] space-y-2.5 text-xs">
            <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-teal-400" />
                <span>الجهاز الموثق للجلسة الحالية:</span>
              </span>
              <span className="font-mono text-emerald-400 text-[11px] font-bold" dir="ltr">
                نشط وموثق ({(userProfile?.deviceId || getDeviceFingerprint().deviceId).slice(-8)}) ✓
              </span>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-[var(--text-muted)]">نوع الحساب والصلاحية:</span>
              <span className="font-bold text-amber-400">{renderBiDiRoleLabel(activeRole)}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={logout}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--bg-elevated)] hover:opacity-90 text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
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
                className="py-2.5 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/40 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف الحساب نهائياً</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Self-Account Deletion Confirmation Modal */}
      {user && showDeleteAccountModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto overscroll-contain">
          <div className="umed-card max-w-md w-full my-auto bg-[var(--bg-card)] border border-rose-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>تأكيد حذف الحساب نهائياً</span>
              </h3>
              <button
                onClick={() => setShowDeleteAccountModal(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 space-y-1.5 leading-relaxed">
              <div className="font-bold">تحذير هام — هذا الإجراء نهائي ولا يمكن التراجع عنه:</div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                سيتم حذف حسابك بالكامل (ملف المستخدم، اسم المستخدم الفريد @username، سجل القيد، ونتائج الاختبارات) بشكل نهائي.
              </p>
            </div>

            {deleteAccountError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteAccountError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmDeleteOwnAccount} className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1.5 font-semibold">
                  لتأكيد الحذف النهائي، اكتب العبارة التالية:{' '}
                  <code className="text-rose-400 font-bold">حذف حسابي</code>
                </label>
                <input
                  type="text"
                  required
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="حذف حسابي"
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-rose-500/40 text-[var(--text-primary)] text-center font-bold focus:outline-none focus:border-rose-500"
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
                  <span>تأكيد الحذف النهائي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteAccountModal(false)}
                  className="py-2.5 px-4 rounded-xl bg-[var(--bg-elevated)] hover:opacity-90 text-[var(--text-primary)] border border-[var(--border-color)] font-semibold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
