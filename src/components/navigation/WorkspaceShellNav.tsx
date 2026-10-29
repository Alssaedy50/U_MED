import React, { useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  LogOut,
  Crown,
  FileText,
  Sun,
  Moon,
  Building2,
  Stethoscope,
  Users,
  BookOpen,
  Trophy,
  HardDrive,
  Settings,
  Menu,
  X,
  Phone,
  GraduationCap,
  Bell,
  Check,
  Edit3
} from 'lucide-react';
import { UserRole, UserProfile, UserRoleDocument } from '../../types/umed.ts';
import { formatUserIdentifier } from '../../lib/firebase.ts';
import { PlatformBrandingAndPolicies } from '../../services/platformSettingsService.ts';
import { PlatformLogoBadge } from '../settings/PlatformOwnerSettingsModalAndCard.tsx';
import { PWAHeaderControls, PWASidebarInstallCard } from '../pwa/PWAInstallModalAndBanner.tsx';

export type ActiveTabType =
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

export type UmedTheme = 'medical' | 'gold' | 'light' | 'dark';

export const THEME_OPTIONS: {
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

export function renderBiDiRoleLabel(role?: UserRole) {
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
}

export function getPageTitleInfo(activeTab: ActiveTabType): { title: string; subtitle: string } {
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
        title: 'إدارة المستخدمين وبيانات المالك الأساسي',
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
      return { title: 'الإعدادات والحساب', subtitle: 'إعدادات المظهر، توثيق الحساب، تبديل البوابة، أو إدارة الحساب' };
    default:
      return { title: 'منصة UMED الطبية', subtitle: 'التعليم الطبي الموحد لكليات الطب البشري' };
  }
}

interface WorkspaceSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeTab: ActiveTabType;
  setActiveTab: (tab: ActiveTabType) => void;
  platformSettings: PlatformBrandingAndPolicies;
  activeRole: UserRole;
  isAdminMode: boolean;
  isOwnerMode: boolean;
  isUniversityAdminOrOwner: boolean;
  unreadNotificationCount: number;
  onOpenNotifications: () => void;
  onOpenLegalContact: () => void;
  theme: UmedTheme;
  setTheme: (theme: UmedTheme) => void;
  userEmail?: string | null;
  userDisplayName?: string | null;
  userProfile: UserProfile | null;
  onLogout: () => void;
}

export function WorkspaceSidebar({
  sidebarOpen,
  setSidebarOpen,
  activeTab,
  setActiveTab,
  platformSettings,
  activeRole,
  isAdminMode,
  isOwnerMode,
  isUniversityAdminOrOwner,
  unreadNotificationCount,
  onOpenNotifications,
  onOpenLegalContact,
  theme,
  setTheme,
  userEmail,
  userDisplayName,
  userProfile,
  onLogout
}: WorkspaceSidebarProps) {
  return (
    <>
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 right-0 z-50 h-[100dvh] w-64 max-w-[82vw] bg-[var(--bg-card)] border-l border-[var(--border-color)] flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Brand Header inside Sidebar */}
        <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <PlatformLogoBadge settings={platformSettings} size="md" />
            <div className="min-w-0">
              <div className="font-bold text-sm text-[var(--text-primary)] leading-tight truncate">
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
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] lg:hidden"
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
              <div className="px-3 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                الأقسام الأكاديمية للطالب
              </div>

              <button
                onClick={() => setActiveTab('student_dashboard')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'student_dashboard'
                    ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
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
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
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
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
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
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span>الملف الأكاديمي والتقدم</span>
              </button>
            </div>
          )}

          {/* LEADERSHIP NAVIGATION ITEMS */}
          {isAdminMode && (
            <div className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider leading-relaxed">
                إدارة الجامعة والدفعة — {renderBiDiRoleLabel(activeRole)}
              </div>

              {isOwnerMode && (
                <button
                  onClick={() => setActiveTab('users_manager')}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === 'users_manager'
                      ? 'bg-amber-600 text-slate-950 font-bold shadow-md shadow-amber-600/20'
                      : 'text-amber-400 hover:bg-[var(--bg-elevated)] border border-amber-500/20'
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
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
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
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
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
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
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
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
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
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
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
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
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
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>سجل التدقيق السحابي</span>
              </button>
            </div>
          )}

          {/* SETTINGS & ACCOUNT SECTION */}
          <div className="space-y-1 pt-2 border-t border-[var(--border-color)]">
            <div className="px-3 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
              النظام والحساب
            </div>
            <button
              onClick={() => {
                onOpenNotifications();
                setSidebarOpen(false);
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all"
            >
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-sky-400 shrink-0" />
                <span>مركز التنبيهات والإشعارات</span>
              </div>
              {unreadNotificationCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white shadow tabular-nums">
                  {unreadNotificationCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('auth')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'auth'
                  ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-600/20'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>الإعدادات والحساب (@username)</span>
            </button>
            <button
              onClick={() => {
                onOpenLegalContact();
                setSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-teal-400 hover:bg-[var(--bg-elevated)] transition-all"
            >
              <Phone className="w-4 h-4 text-teal-400 shrink-0" />
              <span>التواصل والشروط والخصوصية</span>
            </button>
          </div>

          {/* Quick 4-Theme Selector inside Sidebar Drawer */}
          <div className="pt-2 border-t border-[var(--border-color)] space-y-2">
            <div className="px-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
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
                        : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-elevated)]'
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
        <div className="p-3.5 border-t border-[var(--border-color)] bg-[var(--bg-input)] space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-600/20 border border-teal-500/40 flex items-center justify-center overflow-hidden shrink-0">
              {userProfile?.avatarUrl ? (
                <img src={userProfile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <Stethoscope className="w-5 h-5 text-teal-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[var(--text-primary)] leading-snug truncate">
                {userProfile?.displayNameArabic || userDisplayName || 'مستخدم UMED'}
              </div>
              <div className="text-[11px] text-teal-400 font-mono truncate" dir="ltr">
                {formatUserIdentifier(userEmail || undefined, userProfile?.phone, userProfile?.username)}
              </div>
            </div>
          </div>
          <span
            className={`block text-center px-2.5 py-1 rounded-lg text-[10px] font-bold leading-snug ${
              isOwnerMode
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : isAdminMode
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
            }`}
          >
            {renderBiDiRoleLabel(activeRole)}
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setActiveTab('auth')}
              className="py-2 px-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 border border-teal-500/30 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>تعديل الحساب</span>
            </button>
            <button
              onClick={onLogout}
              className="py-2 px-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

interface WorkspaceTopHeaderProps {
  activeTab: ActiveTabType;
  setActiveTab: (tab: ActiveTabType) => void;
  onOpenSidebar: () => void;
  userProfile: UserProfile | null;
  isAuthorizedAdmin: boolean;
  activeRole: UserRole;
  realRole: UserRole;
  roleDoc: UserRoleDocument | null;
  setActiveRole: (role: UserRole) => void;
  unreadNotificationCount: number;
  onOpenNotifications: () => void;
  theme: UmedTheme;
  setTheme: (theme: UmedTheme) => void;
}

export function WorkspaceTopHeader({
  activeTab,
  setActiveTab,
  onOpenSidebar,
  userProfile,
  isAuthorizedAdmin,
  activeRole,
  realRole,
  roleDoc,
  setActiveRole,
  unreadNotificationCount,
  onOpenNotifications,
  theme,
  setTheme
}: WorkspaceTopHeaderProps) {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const pageInfo = getPageTitleInfo(activeTab);
  const activeThemeOption = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];
  const ActiveIcon = activeThemeOption.icon;

  return (
    <header className="sticky top-0 z-30 bg-[var(--bg-card)]/95 backdrop-blur border-b border-[var(--border-color)] px-3.5 py-2.5 sm:px-6 sm:py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onOpenSidebar}
            className="p-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-color)] lg:hidden transition-colors shrink-0"
            title="فتح القائمة الجانبية"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">{pageInfo.title}</h1>
            <p className="text-[11px] text-[var(--text-muted)] hidden sm:block truncate">{pageInfo.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('auth')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-400 text-xs font-mono font-bold transition-colors"
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
                  ? 'bg-teal-600/15 hover:bg-teal-600/25 text-teal-400 border-teal-500/40'
                  : 'bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-400 border-indigo-500/40'
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
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-color)] transition-colors"
            title="مركز التنبيهات والإشعارات الفورية"
          >
            <Bell className="w-4 h-4 text-sky-400" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm animate-pulse tabular-nums">
                {unreadNotificationCount > 9 ? '+9' : unreadNotificationCount}
              </span>
            )}
          </button>

          {/* Single Active Theme Button with Popover Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setThemeMenuOpen((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-color)] text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
              title="تغيير مظهر وثيم المنصة"
            >
              <ActiveIcon className="w-4 h-4 text-teal-400 shrink-0" />
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
                  className="absolute left-0 top-full mt-2 w-48 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xl p-1.5 z-50 space-y-1"
                  dir="rtl"
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold text-[var(--text-muted)] border-b border-[var(--border-color)]">
                    اختر مظهر المنصة
                  </div>
                  {THEME_OPTIONS.map((opt) => {
                    const IconComp = opt.icon;
                    const isSelected = theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setTheme(opt.id);
                          setThemeMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all ${
                          isSelected
                            ? 'bg-teal-600 text-white shadow-sm'
                            : 'text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <IconComp className="w-4 h-4 shrink-0" />
                          <div className="text-right">
                            <div>{opt.label}</div>
                            <div className={`text-[10px] font-normal ${isSelected ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>
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
  );
}

interface MobileBottomTabBarProps {
  isAdminMode: boolean;
  activeTab: ActiveTabType;
  setActiveTab: (tab: ActiveTabType) => void;
  onOpenSidebar: () => void;
}

export function MobileBottomTabBar({
  isAdminMode,
  activeTab,
  setActiveTab,
  onOpenSidebar
}: MobileBottomTabBarProps) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-card)]/95 backdrop-blur-md border-t border-[var(--border-color)] shadow-2xl px-1 sm:px-3 pt-1.5"
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
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <UserCheck className="w-4 h-4 mb-0.5" />
              <span className="text-[10px] leading-tight">حسابي</span>
            </button>

            <button
              type="button"
              onClick={onOpenSidebar}
              className="flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
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
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Users className="w-4 h-4 mb-0.5" />
              <span className="text-[10px] leading-tight">توثيق الدفعة</span>
            </button>

            <button
              type="button"
              onClick={onOpenSidebar}
              className="flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
            >
              <Menu className="w-4 h-4 mb-0.5" />
              <span className="text-[10px] leading-tight">القائمة</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
