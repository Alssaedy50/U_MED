import React, { useState, useEffect } from 'react';
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
  AtSign,
  Edit3,
  Camera,
  Upload
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  isPrimaryOwnerEmail,
  getDeviceFingerprint,
  YEMEN_UNIVERSITIES_OPTIONS,
  MEDICAL_SPECIALTIES_OPTIONS,
  STUDY_LEVELS_OPTIONS,
  MEDICAL_PRESET_AVATARS,
  compressAndReadProfileImage
} from '../../lib/firebase.ts';
import { saveUserAcademicContext } from '../../services/academicService.ts';
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
    updateFullProfile,
    logout,
    deleteOwnAccount,
    activeRole,
    setActiveRole,
    isAuthorizedAdmin
  } = useAuth();

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

  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [deleteAccountLoading, setDeleteAccountLoading] = useState<boolean>(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.username) setProfileUsernameEdit(userProfile.username);
    if (userProfile?.displayNameArabic) setProfileDisplayNameEdit(userProfile.displayNameArabic);
    if (userProfile?.avatarUrl !== undefined) setProfileAvatarEdit(userProfile.avatarUrl || '');
    if (userProfile?.universityId) setProfileUniversityEdit(userProfile.universityId);
    if (userProfile?.specialtyArabic) setProfileSpecialtyEdit(userProfile.specialtyArabic);
    if (userProfile?.studyLevelId) setProfileStudyLevelEdit(userProfile.studyLevelId);
  }, [
    userProfile?.username,
    userProfile?.displayNameArabic,
    userProfile?.avatarUrl,
    userProfile?.universityId,
    userProfile?.specialtyArabic,
    userProfile?.studyLevelId
  ]);

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
      setDeleteAccountError(err.message || 'تعذر حذف الحساب من السحابة');
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{platformSettings.platformNameArabic}</h3>
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

      {/* 1. Theme & Appearance Settings (4 ثيمات احترافية) */}
      <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="pb-3 border-b border-[var(--border-color)]">
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            <span>إعدادات المظهر والثيمات (طبي / ذهبي / نهاري / غامق)</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
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

            {(roleDoc?.role === 'platform_owner' || roleDoc?.role === 'university_admin' || roleDoc?.role === 'batch_rep') && (
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

      {/* 3. Cloud Unique Username (@username), Profile Picture & Academic Details (When Logged In) */}
      {user && (
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-color)]">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <AtSign className="w-5 h-5 text-teal-400" />
              <span>اسم المستخدم الفريد (@username)، الصورة الشخصية، والبيانات الأكاديمية</span>
            </h2>
            <span className="text-xs px-2.5 py-1 rounded border font-semibold bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
              مُزامن سحابياً ✓
            </span>
          </div>

          <form onSubmit={handleUpdateCloudUsername} className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-teal-400 flex items-center gap-1.5">
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
              <div
                className={`p-2.5 rounded-xl font-bold border ${
                  profileUpdateMessage.type === 'success'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                }`}
              >
                {profileUpdateMessage.text}
              </div>
            )}

            {/* Avatar Upload & Presets */}
            <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-teal-400" />
                  <span>صورة الملف الشخصي:</span>
                </span>
                {profileAvatarEdit && (
                  <button
                    type="button"
                    onClick={() => setProfileAvatarEdit('')}
                    className="text-[11px] text-rose-400 hover:underline font-semibold"
                  >
                    حذف الصورة الحالية
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[var(--bg-input)] border-2 border-teal-500/40 flex items-center justify-center overflow-hidden shrink-0">
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

                <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/40 text-teal-400 font-bold text-xs flex items-center gap-1.5 transition-colors">
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
                          : 'border-[var(--border-color)] opacity-75 hover:opacity-100'
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
                <label className="block text-[var(--text-muted)] mb-1">
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
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[var(--text-muted)] mb-1">الاسم المعروض في المنصة:</label>
                <input
                  type="text"
                  value={profileDisplayNameEdit}
                  onChange={(e) => setProfileDisplayNameEdit(e.target.value)}
                  placeholder="د. أحمد محمد"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[var(--text-muted)] mb-1">الجامعة:</label>
                <select
                  value={profileUniversityEdit}
                  onChange={(e) => setProfileUniversityEdit(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500"
                >
                  {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                    <option key={u.id} value={u.id}>{u.nameArabic}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-muted)] mb-1">التخصص:</label>
                <select
                  value={profileSpecialtyEdit}
                  onChange={(e) => setProfileSpecialtyEdit(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500"
                >
                  {MEDICAL_SPECIALTIES_OPTIONS.map((sp) => (
                    <option key={sp.id} value={sp.nameArabic}>{sp.nameArabic}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-muted)] mb-1">المستوى الدراسي:</label>
                <select
                  value={profileStudyLevelEdit}
                  onChange={(e) => setProfileStudyLevelEdit(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-teal-400 font-bold focus:outline-none focus:border-teal-500"
                >
                  {STUDY_LEVELS_OPTIONS.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>{lvl.nameArabic}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-[var(--text-muted)]">
                عند تغيير اسم المستخدم يتم حذف الاسم القديم من السحابة فوراً وحجز الاسم الجديد بدون تكرار أو تشابه.
              </span>
              <button
                type="submit"
                disabled={profileUpdateLoading}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs transition-colors"
              >
                {profileUpdateLoading ? 'جارٍ الحفظ في السحابة...' : 'حفظ وتحديث جميع البيانات في السحابة'}
              </button>
            </div>
          </form>

          <div className="p-4 bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)] space-y-2.5 text-xs">
            <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">الاسم المعروض:</span>
              <strong className="text-[var(--text-primary)]">{userProfile?.displayNameArabic || user.displayName || 'مستخدم مسجل'}</strong>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">اسم المستخدم الفريد (@username):</span>
              <span className="font-mono text-teal-400 font-bold" dir="ltr">
                {userProfile?.username ? `@${userProfile.username}` : 'غير محدد بعد'}
              </span>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">الجامعة والتخصص:</span>
              <span className="text-[var(--text-primary)] font-semibold">
                {userProfile?.universityNameArabic || 'جامعة دار السلام الدولية للعلوم والتكنولوجيا'} · {userProfile?.specialtyArabic || 'الطب البشري والجراحة العامة (MBBS)'}
              </span>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">بصمة الجهاز الموثقة (حساب واحد لكل هاتف):</span>
              <span className="font-mono text-emerald-400 text-[11px] tabular-nums" dir="ltr">
                {userProfile?.deviceId || getDeviceFingerprint().deviceId} ✓
              </span>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">معرف المستخدم السحابي (UID):</span>
              <span className="font-mono text-[var(--text-muted)] text-[11px] break-all" dir="ltr">{user.uid}</span>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-[var(--text-muted)]">الوضع والصلاحية النشطة:</span>
              <span className="font-bold text-amber-400">
                {renderBiDiRoleLabel(activeRole)}
              </span>
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
                <span>حذف الحساب نهائياً من السحابة</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Self-Account Cloud Deletion Confirmation Modal */}
      {user && showDeleteAccountModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-start sm:items-center justify-center p-4 overflow-y-auto overscroll-contain">
          <div className="umed-card max-w-md w-full my-auto bg-[var(--bg-card)] border border-rose-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <span>تأكيد حذف الحساب نهائياً من السحابة</span>
              </h3>
              <button
                onClick={() => setShowDeleteAccountModal(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 space-y-1.5 leading-relaxed">
              <div className="font-bold">تحذير هام — هذا الإجراء يحذف بياناتك فوراً من السحابة:</div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                سيتم حذف حسابك بالكامل من السحابة مباشرةً (ملف المستخدم، اسم المستخدم الفريد @username، صلاحيات الدور، سجل القيد، ونتائج الاختبارات) بحيث لا تبقى أي نسخة منه في السحابة.
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
                  لتأكيد الحذف النهائي من السحابة، اكتب العبارة التالية: <code className="text-rose-400 font-bold">حذف حسابي</code>
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
                  <span>تأكيد الحذف الفوري من السحابة</span>
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
