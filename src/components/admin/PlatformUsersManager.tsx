/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Platform Users & Enrollment Governance Console
 * - Internal Tab 1: Users Directory & Account Management (with compact ⋮ Actions Dropdown & Side Drawer Details)
 * - Internal Tab 2: Academic Enrollment Approvals & Change Requests (<EnrollmentApprovalManager />)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Search,
  MoreVertical,
  ShieldCheck,
  Archive,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  GraduationCap,
  Eye,
  X,
  UserCheck
} from 'lucide-react';
import {
  ManagedCloudUserRecord,
  fetchAllUsersForPlatformOwner,
  updateUserAccountByPlatformOwner,
  toggleArchiveUserByPlatformOwner,
  confirmVerifyUserByPlatformOwner,
  deleteUserAccountCompletelyFromCloud,
  YEMEN_UNIVERSITIES_OPTIONS
} from '../../lib/firebase.ts';
import { UserRole, DAR_AL_SALAM_SEED } from '../../types/umed.ts';
import { renderBiDiRoleLabel } from '../../utils/roleHelpers.tsx';
import EnrollmentApprovalManager from './EnrollmentApprovalManager.tsx';

interface PlatformUsersManagerProps {
  callerUid: string;
  callerEmail: string;
  callerRole?: UserRole;
  assignedUniversityId?: string;
  initialSubTab?: 'users_directory' | 'enrollment_approvals';
}

export default function PlatformUsersManager({
  callerUid,
  callerEmail,
  assignedUniversityId,
  initialSubTab = 'users_directory'
}: PlatformUsersManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'users_directory' | 'enrollment_approvals'>(
    initialSubTab
  );

  const [users, setUsers] = useState<ManagedCloudUserRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');

  // Row Dropdown & Side Drawer State
  const [openMenuUid, setOpenMenuUid] = useState<string | null>(null);
  const [drawerUser, setDrawerUser] = useState<ManagedCloudUserRecord | null>(null);

  // Edit Form inside Side Drawer
  const [editNameAr, setEditNameAr] = useState<string>('');
  const [editUsername, setEditUsername] = useState<string>('');
  const [editUnivId, setEditUnivId] = useState<string>('univ-dar-al-salam');
  const [editLevelId, setEditLevelId] = useState<string>('lvl-1');
  const [editRole, setEditRole] = useState<UserRole>('student');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 4500);
  };

  const getUniversityNameAr = (univId?: string) => {
    return (
      YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === univId)?.nameArabic ||
      'جامعة دار السلام الدولية للعلوم والتكنولوجيا'
    );
  };

  const getStudyLevelNameAr = (levelId?: string) => {
    return (
      DAR_AL_SALAM_SEED.studyLevels.find((l) => l.id === levelId)?.titleArabic ||
      'المستوى الأول'
    );
  };

  const loadAllUsers = useCallback(async () => {
    setLoading(true);
    try {
      const records = await fetchAllUsersForPlatformOwner();
      const scoped = assignedUniversityId
        ? records.filter((r) => !r.universityId || r.universityId === assignedUniversityId)
        : records;
      setUsers(scoped);
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر تحميل سجل المستخدمين.');
    } finally {
      setLoading(false);
    }
  }, [assignedUniversityId]);

  useEffect(() => {
    if (activeSubTab === 'users_directory') {
      loadAllUsers();
    }
  }, [activeSubTab, loadAllUsers]);

  const openUserSideDrawer = (record: ManagedCloudUserRecord) => {
    setDrawerUser(record);
    setOpenMenuUid(null);
    setEditNameAr(record.displayNameArabic || '');
    setEditUsername(record.username || '');
    setEditUnivId(record.universityId || 'univ-dar-al-salam');
    setEditLevelId(record.studyLevelId || 'lvl-1');
    setEditRole((record.role as UserRole) || 'student');
  };

  const handleSaveDrawerChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerUser) return;
    setSavingEdit(true);
    try {
      await updateUserAccountByPlatformOwner({
        callerUid,
        callerEmail: callerEmail || callerUid,
        targetUid: drawerUser.uid,
        displayNameArabic: editNameAr.trim(),
        username: editUsername.trim() || undefined,
        email: drawerUser.email || undefined,
        phone: drawerUser.phone || undefined,
        academicStudentNumber: drawerUser.academicStudentNumber || undefined,
        universityId: editUnivId,
        studyLevelId: editLevelId,
        role: editRole,
        enrollmentStatus: drawerUser.enrollmentStatus,
        isVerified: drawerUser.isVerified,
        isArchived: drawerUser.isArchived
      });
      showToast('success', `تم تحديث بيانات وصلاحيات "${editNameAr}" بنجاح.`);
      setDrawerUser(null);
      await loadAllUsers();
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر حفظ التعديلات.');
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === 'active' && u.isArchived) return false;
      if (statusFilter === 'archived' && !u.isArchived) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.displayNameArabic.toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Unified Header & 2 Internal Tabs */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                إدارة المستخدمين واعتماد القيد الأكاديمي
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                المركز الموحد لإدارة حسابات الطلاب والمشرفين ومراجعة طلبات القيد الأكاديمي
              </p>
            </div>
          </div>

          {activeSubTab === 'users_directory' && (
            <button
              type="button"
              onClick={loadAllUsers}
              className="px-3.5 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
              <span>تحديث القائمة ({users.length})</span>
            </button>
          )}
        </div>

        {/* Internal Sub-Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]">
          <button
            type="button"
            onClick={() => setActiveSubTab('users_directory')}
            className={`py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeSubTab === 'users_directory'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>سجل وإدارة حسابات المستخدمين ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('enrollment_approvals')}
            className={`py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeSubTab === 'enrollment_approvals'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>طلبات ومراجعات القيد الأكاديمي</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SUB-TAB 2: MERGED ENROLLMENT APPROVAL MANAGER */}
      {activeSubTab === 'enrollment_approvals' ? (
        <EnrollmentApprovalManager
          adminUid={callerUid}
          assignedUniversityId={assignedUniversityId}
        />
      ) : (
        /* SUB-TAB 1: USERS DIRECTORY WITH DROPDOWN ACTIONS & SIDE DRAWER */
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم، @username، أو البريد الإلكتروني..."
                className="w-full pr-9 pl-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-primary)]"
            >
              <option value="all">جميع الأدوار</option>
              <option value="platform_owner">مالك المنصة</option>
              <option value="university_admin">مشرف جامعة</option>
              <option value="department_head">رئيس قسم</option>
              <option value="batch_rep">مندوب دفعة</option>
              <option value="student">طالب طب</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-primary)]"
            >
              <option value="active">الحسابات النشطة</option>
              <option value="archived">الحسابات المؤرشفة</option>
              <option value="all">الكل</option>
            </select>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
                  <th className="py-3 px-3 font-bold">المستخدم</th>
                  <th className="py-3 px-3 font-bold">الجامعة والدفعة</th>
                  <th className="py-3 px-3 font-bold">الدور</th>
                  <th className="py-3 px-3 font-bold">الحالة</th>
                  <th className="py-3 px-3 font-bold text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredUsers.map((u) => (
                  <tr
                    key={u.uid}
                    className="hover:bg-[var(--bg-elevated)]/60 transition-colors"
                  >
                    <td className="py-3 px-3">
                      <div className="font-bold text-[var(--text-primary)]">
                        {u.displayNameArabic}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] font-mono" dir="ltr">
                        {u.username ? `@${u.username} • ` : ''}
                        {u.email}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {getUniversityNameAr(u.universityId)}
                      </div>
                      <div className="text-[11px] text-teal-400">
                        {getStudyLevelNameAr(u.studyLevelId)}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 text-[11px] font-bold inline-block">
                        {renderBiDiRoleLabel(u.role)}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {u.isArchived ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                          مؤرشف
                        </span>
                      ) : u.isVerified ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                          موثق ✓
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 text-[10px] font-bold">
                          نشط
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-left relative">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openUserSideDrawer(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-teal-500/20 text-[var(--text-secondary)] hover:text-teal-400 text-[11px] font-bold flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>التفاصيل</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuUid((prev) => (prev === u.uid ? null : u.uid))
                          }
                          className="p-1.5 rounded-lg bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                          title="قائمة الإجراءات"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Sleek ⋮ Dropdown Menu */}
                      {openMenuUid === u.uid && (
                        <div className="absolute left-3 top-11 z-30 w-48 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl py-1.5 text-right text-xs">
                          <button
                            type="button"
                            onClick={() => openUserSideDrawer(u)}
                            className="w-full px-3 py-2 hover:bg-[var(--bg-elevated)] flex items-center gap-2 text-[var(--text-primary)] font-semibold"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-teal-400" />
                            <span>تعديل البيانات والصلاحية</span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              setOpenMenuUid(null);
                              await confirmVerifyUserByPlatformOwner({
                                callerUid,
                                callerEmail: callerEmail || callerUid,
                                targetUid: u.uid,
                                verified: !u.isVerified
                              });
                              await loadAllUsers();
                            }}
                            className="w-full px-3 py-2 hover:bg-[var(--bg-elevated)] flex items-center gap-2 text-emerald-400 font-semibold"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{u.isVerified ? 'إلغاء التوثيق' : 'توثيق الحساب رسمياً'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              setOpenMenuUid(null);
                              await toggleArchiveUserByPlatformOwner({
                                callerUid,
                                callerEmail: callerEmail || callerUid,
                                targetUid: u.uid,
                                archive: !u.isArchived
                              });
                              await loadAllUsers();
                            }}
                            className="w-full px-3 py-2 hover:bg-[var(--bg-elevated)] flex items-center gap-2 text-amber-400 font-semibold"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>{u.isArchived ? 'استعادة من الأرشيف' : 'أرشفة الحساب'}</span>
                          </button>

                          {u.role !== 'platform_owner' && (
                            <button
                              type="button"
                              onClick={async () => {
                                setOpenMenuUid(null);
                                await deleteUserAccountCompletelyFromCloud({
                                  targetUid: u.uid,
                                  performedBy: callerEmail || callerUid
                                });
                                showToast('success', 'تم حذف الحساب نهائياً من السحابة.');
                                await loadAllUsers();
                              }}
                              className="w-full px-3 py-2 hover:bg-rose-500/15 flex items-center gap-2 text-rose-400 font-semibold border-t border-[var(--border-color)] mt-1 pt-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف الحساب نهائياً</span>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Details & Edit Side Drawer */}
      {drawerUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex justify-end"
          dir="rtl"
        >
          <div className="w-full max-w-md bg-[var(--bg-card)] border-r border-[var(--border-color)] h-full p-5 overflow-y-auto flex flex-col justify-between shadow-2xl">
            <form onSubmit={handleSaveDrawerChanges} className="space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                    بطاقة تفاصيل وتعديل المستخدم
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] font-mono" dir="ltr">
                    {drawerUser.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerUser(null)}
                  className="p-1.5 rounded-lg bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">
                    الاسم الثلاثي بالعربية
                  </label>
                  <input
                    type="text"
                    required
                    value={editNameAr}
                    onChange={(e) => setEditNameAr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">
                    اسم المستخدم (@username)
                  </label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    dir="ltr"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">
                    الجامعة
                  </label>
                  <select
                    value={editUnivId}
                    onChange={(e) => setEditUnivId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  >
                    {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nameArabic}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">
                    المستوى الدراسي / الدفعة
                  </label>
                  <select
                    value={editLevelId}
                    onChange={(e) => setEditLevelId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  >
                    {DAR_AL_SALAM_SEED.studyLevels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.titleArabic}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">
                    الدور والصلاحية في المنصة
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    disabled={drawerUser.role === 'platform_owner'}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold"
                  >
                    <option value="student">طالب طب (Student)</option>
                    <option value="batch_rep">مندوب دفعة (Batch Rep)</option>
                    <option value="department_head">رئيس قسم (Department Head)</option>
                    <option value="university_admin">مشرف جامعة (University Admin)</option>
                    {drawerUser.role === 'platform_owner' && (
                      <option value="platform_owner">مالك المنصة (Platform Owner)</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border-color)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerUser(null)}
                  className="px-4 py-2 rounded-xl bg-[var(--bg-input)] text-[var(--text-secondary)] text-xs font-bold"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  {savingEdit ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>حفظ التعديلات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
