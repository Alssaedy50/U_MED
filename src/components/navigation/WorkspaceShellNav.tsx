/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Unified Workspace Navigation Shell
 * - Exports UmedTheme, THEME_OPTIONS, ActiveTabType, and re-exports renderBiDiRoleLabel
 * - Removes redundant 'enrollment_queue' and 'audit' items from the Sidebar (now merged into 'users_manager' and 'backup_restore')
 *   while keeping them in the ActiveTabType union for full TypeScript compatibility.
 * - Mobile Top Header is streamlined (Hamburger + Current Section Title + Notification Bell),
 *   with Theme Switcher, Admin/Student Mode Toggle, and @username badge accessible in the Sidebar on mobile and Top Header on desktop.
 */

import React from 'react';
import {
  BookOpen,
  Trophy,
  User,
  Settings,
  Building2,
  Users,
  ShieldCheck,
  Database,
  Bell,
  Menu,
  X,
  LogOut,
  GraduationCap,
  Layers,
  Palette,
  ArrowLeftRight,
  Stethoscope,
  Sun,
  Moon,
  Crown
} from 'lucide-react';
import { UserRole } from '../../types/umed.ts';
import { PlatformBrandingAndPolicies } from '../../services/platformSettingsService.ts';
import { PlatformLogoBadge } from '../settings/PlatformOwnerSettingsModalAndCard.tsx';
import { PWASidebarInstallCard, PWAHeaderControls } from '../pwa/PWAInstallModalAndBanner.tsx';
import { renderBiDiRoleLabel } from '../../utils/roleHelpers.tsx';

export { renderBiDiRoleLabel };

export type UmedTheme = 'medical' | 'light' | 'dark' | 'gold';

export const THEME_OPTIONS: {
  id: UmedTheme;
  label: string;
  shortLabel: string;
  subtitle: string;
  description: string;
  dotColor: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'medical',
    label: 'الطبي (Medical Teal)',
    shortLabel: 'طبي',
    subtitle: 'هوية سريرية مريحة للعين بتدرجات الفيروزي الطبي',
    description: 'هوية سريرية مريحة للعين بتدرجات الفيروزي الطبي',
    dotColor: 'bg-teal-400',
    icon: Stethoscope
  },
  {
    id: 'light',
    label: 'الفاتح (Clinical Light)',
    shortLabel: 'فاتح',
    subtitle: 'سطوع نهاري واضح للقراءة السريعة والمحاضرات',
    description: 'سطوع نهاري واضح للقراءة السريعة والمحاضرات',
    dotColor: 'bg-sky-400',
    icon: Sun
  },
  {
    id: 'dark',
    label: 'الليلي (Deep Slate)',
    shortLabel: 'ليلي',
    subtitle: 'تباين داكن مريح للمذاكرة الليلية الطويلة',
    description: 'تباين داكن مريح للمذاكرة الليلية الطويلة',
    dotColor: 'bg-indigo-400',
    icon: Moon
  },
  {
    id: 'gold',
    label: 'الذهبي الملكي (Royal Gold)',
    shortLabel: 'ذهبي',
    subtitle: 'تصميم فاخر بلمسات ذهبية أكاديمية',
    description: 'تصميم فاخر بلمسات ذهبية أكاديمية',
    dotColor: 'bg-amber-400',
    icon: Crown
  }
];

export type ActiveTabType =
  | 'student_dashboard'
  | 'student_portal'
  | 'student_library'
  | 'student_exams'
  | 'student_profile'
  | 'content_manager'
  | 'library'
  | 'exams_manager'
  | 'assessments'
  | 'hierarchy_governance'
  | 'roles'
  | 'users_manager'
  | 'enrollment_queue'
  | 'backup_restore'
  | 'audit'
  | 'academic'
  | 'settings';

interface SidebarNavItem {
  id: ActiveTabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface WorkspaceSidebarProps {
  activeTab: ActiveTabType;
  onSelectTab: (tab: ActiveTabType) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  userRole: UserRole;
  isAdminWorkspaceMode: boolean;
  onToggleWorkspaceMode: () => void;
  canAccessAdminWorkspace: boolean;
  displayNameArabic: string;
  username?: string;
  userEmail?: string;
  avatarDataUrl?: string;
  theme: UmedTheme;
  onChangeTheme: (theme: UmedTheme) => void;
  platformSettings: PlatformBrandingAndPolicies;
  onOpenLegalModal: (tab: 'terms' | 'privacy' | 'contact') => void;
  onSignOut: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  userRole,
  isAdminWorkspaceMode,
  onToggleWorkspaceMode,
  canAccessAdminWorkspace,
  displayNameArabic,
  username,
  userEmail,
  avatarDataUrl,
  theme,
  onChangeTheme,
  platformSettings,
  onOpenLegalModal,
  onSignOut
}) => {
  const isOwner = userRole === 'platform_owner';
  const isUnivAdmin = userRole === 'university_admin';

  const studentNavItems: SidebarNavItem[] = [
    { id: 'student_portal', label: 'مقرراتي والدفعة', icon: GraduationCap },
    { id: 'student_library', label: 'المكتبة الطبية الرقمية', icon: BookOpen },
    { id: 'student_exams', label: 'الاختبارات والمسابقات', icon: Trophy },
    { id: 'student_profile', label: 'ملفي الأكاديمي', icon: User },
    { id: 'settings', label: 'الإعدادات والمظهر', icon: Settings }
  ];

  // Unified Admin Sidebar Items ('enrollment_queue' and 'audit' merged into 'users_manager' and 'backup_restore')
  const adminNavItems: SidebarNavItem[] = [
    { id: 'content_manager', label: 'إدارة المحتوى والمكتبة', icon: BookOpen },
    { id: 'exams_manager', label: 'إدارة الاختبارات والبنوك', icon: Trophy },
    { id: 'hierarchy_governance', label: 'حوكمة الدفعات والإعلانات', icon: ShieldCheck },
    ...(isOwner || isUnivAdmin
      ? [
          {
            id: 'academic' as ActiveTabType,
            label: 'إدارة الهيكل الأكاديمي',
            icon: Building2
          },
          {
            id: 'users_manager' as ActiveTabType,
            label: 'المستخدمون واعتماد القيد',
            icon: Users
          }
        ]
      : []),
    ...(isOwner
      ? [
          {
            id: 'backup_restore' as ActiveTabType,
            label: 'النسخ الاحتياطي وسجل التدقيق',
            icon: Database
          }
        ]
      : []),
    { id: 'settings', label: 'الإعدادات والمظهر', icon: Settings }
  ];

  const itemsToRender =
    isAdminWorkspaceMode && canAccessAdminWorkspace ? adminNavItems : studentNavItems;

  const sidebarContent = (
    <aside
      className="w-72 h-full bg-[var(--bg-sidebar)] border-l border-[var(--border-color)] flex flex-col justify-between select-none overflow-y-auto"
      dir="rtl"
    >
      <div className="space-y-3 p-3.5">
        {/* Brand Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <PlatformLogoBadge settings={platformSettings} size="md" />
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                {platformSettings.platformShortName || 'UMED'}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">
                {platformSettings.platformNameArabic}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-xl bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="إغلاق القائمة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Identity & @username Card (Always accessible in Sidebar for mobile users) */}
        <div className="p-3 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2">
          <div className="flex items-center gap-2.5">
            {avatarDataUrl ? (
              <img
                src={avatarDataUrl}
                alt={displayNameArabic}
                className="w-10 h-10 rounded-xl object-cover border border-teal-500/40 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 font-bold text-sm shrink-0">
                {(displayNameArabic || 'ط').trim().charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-[var(--text-primary)] truncate">
                {displayNameArabic || 'طالب الطب البشري'}
              </div>
              {username && (
                <div className="text-[11px] text-teal-400 font-mono truncate" dir="ltr">
                  @{username}
                </div>
              )}
              {!username && userEmail && (
                <div className="text-[10px] text-[var(--text-muted)] font-mono truncate" dir="ltr">
                  {userEmail}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-color)]">
            <span className="px-2 py-0.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 text-[10px] font-bold">
              {renderBiDiRoleLabel(userRole)}
            </span>

            {canAccessAdminWorkspace && (
              <button
                type="button"
                onClick={() => {
                  onToggleWorkspaceMode();
                  onCloseMobile();
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 transition-colors"
              >
                <ArrowLeftRight className="w-3 h-3" />
                <span>{isAdminWorkspaceMode ? 'بوابة الطالب' : 'لوحة المشرف'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {itemsToRender.map((item) => {
            const Icon = item.icon;
            const isSelected =
              activeTab === item.id ||
              (item.id === 'users_manager' && activeTab === 'enrollment_queue') ||
              (item.id === 'backup_restore' && activeTab === 'audit');

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2.5 transition-all ${
                  isSelected
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Theme Switcher inside Sidebar (Accessible on Mobile & Desktop) */}
        <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2">
          <div className="text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-teal-400" />
            <span>مظهر المنصة السريع:</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeTheme(opt.id)}
                className={`py-1.5 px-1 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 border transition-all ${
                  theme === opt.id
                    ? 'bg-teal-600 text-white border-teal-500'
                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${opt.dotColor}`} />
                <span>{opt.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom PWA Install Card + Legal Links + Sign Out */}
      <div className="space-y-2 pb-4">
        <PWASidebarInstallCard />

        <div className="px-3.5 pt-2 space-y-2">
          <div className="flex items-center justify-center gap-3 text-[10px] text-[var(--text-muted)]">
            <button
              type="button"
              onClick={() => onOpenLegalModal('terms')}
              className="hover:text-teal-400"
            >
              الشروط
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => onOpenLegalModal('privacy')}
              className="hover:text-teal-400"
            >
              الخصوصية
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => onOpenLegalModal('contact')}
              className="hover:text-teal-400"
            >
              تواصل معنا
            </button>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="w-full py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:block shrink-0">{sidebarContent}</div>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {isOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};

interface WorkspaceTopHeaderProps {
  sectionTitle: string;
  onOpenMobileSidebar: () => void;
  unreadNotificationsCount: number;
  onOpenNotifications: () => void;
  username?: string;
  userRole: UserRole;
  canAccessAdminWorkspace: boolean;
  isAdminWorkspaceMode: boolean;
  onToggleWorkspaceMode: () => void;
  theme: UmedTheme;
  onChangeTheme: (theme: UmedTheme) => void;
}

export const WorkspaceTopHeader: React.FC<WorkspaceTopHeaderProps> = ({
  sectionTitle,
  onOpenMobileSidebar,
  unreadNotificationsCount,
  onOpenNotifications,
  username,
  canAccessAdminWorkspace,
  isAdminWorkspaceMode,
  onToggleWorkspaceMode,
  theme,
  onChangeTheme
}) => {
  return (
    <header
      className="sticky top-0 z-30 h-14 px-3.5 sm:px-6 bg-[var(--bg-header)] backdrop-blur-md border-b border-[var(--border-color)] flex items-center justify-between gap-3"
      dir="rtl"
    >
      {/* Right Side: Mobile Hamburger + Clear Section Title */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
          aria-label="فتح القائمة الجانبية"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] truncate">
          {sectionTitle}
        </h1>
      </div>

      {/* Left Side: Desktop Controls (hidden md:flex) + Notification Bell */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Desktop-Only Controls to Keep Mobile Header Uncluttered */}
        <div className="hidden md:flex items-center gap-2">
          {username && (
            <span
              className="px-2.5 py-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-teal-400 text-xs font-mono font-bold"
              dir="ltr"
            >
              @{username}
            </span>
          )}

          {canAccessAdminWorkspace && (
            <button
              type="button"
              onClick={onToggleWorkspaceMode}
              className="px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-400 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{isAdminWorkspaceMode ? 'وضع الطالب' : 'وضع المشرف'}</span>
            </button>
          )}

          <select
            value={theme}
            onChange={(e) => onChangeTheme(e.target.value as UmedTheme)}
            className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-primary)]"
            aria-label="اختيار الثيم"
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                ثيم: {t.shortLabel}
              </option>
            ))}
          </select>

          <PWAHeaderControls />
        </div>

        {/* Notification Bell (Always visible on Mobile & Desktop) */}
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative p-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] transition-colors"
          aria-label="مركز الإشعارات"
        >
          <Bell className="w-5 h-5 text-teal-400" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

interface MobileBottomTabBarProps {
  activeTab: ActiveTabType;
  onSelectTab: (tab: ActiveTabType) => void;
  isAdminWorkspaceMode: boolean;
}

export const MobileBottomTabBar: React.FC<MobileBottomTabBarProps> = ({
  activeTab,
  onSelectTab,
  isAdminWorkspaceMode
}) => {
  if (isAdminWorkspaceMode) return null;

  const tabs: {
    id: ActiveTabType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'student_portal', label: 'الدراسة', icon: Layers },
    { id: 'student_library', label: 'المكتبة', icon: BookOpen },
    { id: 'student_exams', label: 'الاختبارات', icon: Trophy },
    { id: 'student_profile', label: 'ملفي', icon: User }
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-15 bg-[var(--bg-header)] backdrop-blur-md border-t border-[var(--border-color)] grid grid-cols-4 px-2"
      dir="rtl"
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive =
          activeTab === t.id ||
          (t.id === 'student_portal' && activeTab === 'student_dashboard');
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTab(t.id)}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${
              isActive ? 'text-teal-400' : 'text-[var(--text-muted)]'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
