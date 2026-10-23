/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Platform Owner Exclusive Users Management Console
 * Restricted strictly to Platform Owner (alssaedy50@gmail.com / alssaedy500@gmail.com)
 * Supports:
 *  - Primary Owner Identity Configuration & Cloud Deduplication
 *  - Viewing all registered user accounts from Cloud Firestore
 *  - Editing any user's profile, identifiers, academic scope, and role in Cloud Firestore
 *  - Confirming / Toggling account verification status in Cloud Firestore
 *  - Archiving / Unarchiving user accounts in Cloud Firestore
 *  - Complete, permanent Cloud Deletion of any user account after confirmation
 *  - Exporting user data to CSV (Excel UTF-8 BOM) and JSON
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  Crown,
  ShieldCheck,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Archive,
  ArchiveRestore,
  Download,
  FileSpreadsheet,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  Hash,
  UserCheck,
  X,
  Lock,
  Building2,
  Layers
} from 'lucide-react';
import {
  UserRole,
  University,
  StudyLevel,
  EnrollmentStatus,
  PrimaryOwnerIdentityConfig,
  DAR_AL_SALAM_SEED
} from '../../types/umed.ts';
import {
  ManagedCloudUserRecord,
  fetchAllUsersForPlatformOwner,
  updateUserAccountByPlatformOwner,
  toggleArchiveUserByPlatformOwner,
  confirmVerifyUserByPlatformOwner,
  deleteUserAccountCompletelyFromCloud,
  fetchPrimaryOwnerIdentity,
  syncAndDeduplicatePrimaryOwnerIdentity,
  writeAuditLogToCloud,
  INITIAL_OWNER_EMAILS
} from '../../lib/firebase.ts';
import { fetchUniversities, fetchStudyLevels } from '../../services/academicService.ts';
import { getRoleLabelArabic } from '../../services/batchGovernanceService.ts';

interface PlatformUsersManagerProps {
  callerUid: string;
  callerEmail: string;
  callerRole?: UserRole;
}

export default function PlatformUsersManager({
  callerUid,
  callerEmail,
  callerRole = 'platform_owner'
}: PlatformUsersManagerProps) {
  const [users, setUsers] = useState<ManagedCloudUserRecord[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>(DAR_AL_SALAM_SEED.studyLevels);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Primary Owner Official Identity State
  const [ownerConfig, setOwnerConfig] = useState<PrimaryOwnerIdentityConfig | null>(null);
  const [ownerNameInput, setOwnerNameInput] = useState<string>('المالك الأساسي لمنصة UMED الطبية');
  const [ownerPhoneInput, setOwnerPhoneInput] = useState<string>('+967770000001');
  const [ownerAcadInput, setOwnerAcadInput] = useState<string>('OWNER-UMED-001');
  const [ownerSyncLoading, setOwnerSyncLoading] = useState<boolean>(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived' | 'verified' | 'unverified'>('all');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<ManagedCloudUserRecord | null>(null);
  const [editNameAr, setEditNameAr] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editAcadNum, setEditAcadNum] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('student');
  const [editUnivId, setEditUnivId] = useState<string>('univ-dar-al-salam');
  const [editLevelId, setEditLevelId] = useState<string>('lvl-4');
  const [editEnrStatus, setEditEnrStatus] = useState<EnrollmentStatus | 'not_enrolled'>('approved');
  const [editVerified, setEditVerified] = useState<boolean>(true);
  const [editArchived, setEditArchived] = useState<boolean>(false);
  const [editArchiveReason, setEditArchiveReason] = useState<string>('');

  // Delete Confirmation Modal State
  const [deletingUser, setDeletingUser] = useState<ManagedCloudUserRecord | null>(null);

  // Archive Reason Modal State
  const [archivingUser, setArchivingUser] = useState<ManagedCloudUserRecord | null>(null);
  const [archiveReasonInput, setArchiveReasonInput] = useState<string>('');

  const loadCloudData = async () => {
    if (callerRole !== 'platform_owner') return;
    setLoading(true);
    try {
      const [ownerId, allUsers, univList, lvlList] = await Promise.all([
        fetchPrimaryOwnerIdentity(),
        fetchAllUsersForPlatformOwner(),
        fetchUniversities(),
        fetchStudyLevels()
      ]);

      setOwnerConfig(ownerId);
      setOwnerNameInput(ownerId.displayNameArabic || 'المالك الأساسي لمنصة UMED الطبية');
      setOwnerPhoneInput(ownerId.phone || '+967770000001');
      setOwnerAcadInput(ownerId.academicStudentNumber || 'OWNER-UMED-001');

      setUsers(allUsers);
      setUniversities(univList);
      if (lvlList.length > 0) {
        setStudyLevels(lvlList);
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'تعذر تحميل بيانات المستخدمين من السحابة'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCloudData();
  }, [callerRole]);

  // Strict security guard: Only Platform Owner can view or manage users data
  if (callerRole !== 'platform_owner') {
    return (
      <div className="bg-slate-900/90 border border-rose-800/60 rounded-2xl p-8 text-center space-y-3" dir="rtl">
        <Lock className="w-10 h-10 text-rose-400 mx-auto" />
        <h2 className="text-base font-bold text-white">قسم حصري لمالك المنصة العام فقط</h2>
        <p className="text-xs text-slate-400">
          عرض وإدارة وتعديل وحذف وأرشفة وتصدير حسابات المستخدمين متاح حصرياً لمالك المنصة الأساسي.
        </p>
      </div>
    );
  }

  const handleSyncPrimaryOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setOwnerSyncLoading(true);
    setStatusMsg(null);
    try {
      const updated = await syncAndDeduplicatePrimaryOwnerIdentity({
        ownerUid: callerUid,
        phone: ownerPhoneInput.trim(),
        displayNameArabic: ownerNameInput.trim(),
        academicStudentNumber: ownerAcadInput.trim()
      });
      setOwnerConfig(updated);
      setOwnerPhoneInput(updated.phone);
      setOwnerNameInput(updated.displayNameArabic);
      setOwnerAcadInput(updated.academicStudentNumber);
      await loadCloudData();
      setStatusMsg({
        type: 'success',
        text: 'تم تثبيت بيانات المالك الأساسي (alssaedy50@gmail.com و alssaedy500@gmail.com ورقم الهاتف) وحجزها حصرياً وإزالة أي تكرار من السحابة بنجاح ✓'
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'تعذر تحديث بيانات المالك الأساسي'
      });
    } finally {
      setOwnerSyncLoading(false);
    }
  };

  const openEditModal = (u: ManagedCloudUserRecord) => {
    setEditingUser(u);
    setEditNameAr(u.displayNameArabic);
    setEditEmail(u.email);
    setEditPhone(u.phone);
    setEditAcadNum(u.academicStudentNumber);
    setEditRole(u.role);
    setEditUnivId(u.universityId || 'univ-dar-al-salam');
    setEditLevelId(u.studyLevelId || 'lvl-4');
    setEditEnrStatus(u.enrollmentStatus);
    setEditVerified(u.isVerified);
    setEditArchived(u.isArchived);
    setEditArchiveReason(u.archiveReason || '');
    setStatusMsg(null);
  };

  const handleSaveUserEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setActionLoading(true);
    setStatusMsg(null);

    try {
      await updateUserAccountByPlatformOwner({
        callerUid,
        callerEmail,
        targetUid: editingUser.uid,
        displayNameArabic: editNameAr,
        email: editEmail,
        phone: editPhone,
        academicStudentNumber: editAcadNum,
        role: editRole,
        universityId: editUnivId,
        studyLevelId: editLevelId,
        enrollmentStatus: editEnrStatus,
        isVerified: editVerified,
        isArchived: editArchived,
        archiveReason: editArchiveReason
      });

      setEditingUser(null);
      await loadCloudData();
      setStatusMsg({
        type: 'success',
        text: `تم تحديث بيانات الحساب (${editNameAr}) ومزامنتها بالكامل في قاعدة بيانات السحابة بنجاح ✓`
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'فشل تحديث بيانات المستخدم في السحابة'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuickVerifyToggle = async (u: ManagedCloudUserRecord) => {
    if (u.isPrimaryOwner) return;
    setActionLoading(true);
    setStatusMsg(null);
    try {
      const nextVerified = !u.isVerified;
      await confirmVerifyUserByPlatformOwner({
        callerUid,
        callerEmail,
        targetUid: u.uid,
        verified: nextVerified
      });
      await loadCloudData();
      setStatusMsg({
        type: 'success',
        text: nextVerified
          ? `تم تأكيد توثيق حساب "${u.displayNameArabic}" في السحابة بنجاح ✓`
          : `تم إلغاء توثيق حساب "${u.displayNameArabic}" في السحابة.`
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'تعذر تغيير حالة التوثيق'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmArchiveToggle = async () => {
    if (!archivingUser) return;
    setActionLoading(true);
    setStatusMsg(null);
    try {
      const nextArchive = !archivingUser.isArchived;
      await toggleArchiveUserByPlatformOwner({
        callerUid,
        callerEmail,
        targetUid: archivingUser.uid,
        archive: nextArchive,
        reason: archiveReasonInput.trim() || undefined
      });
      const targetName = archivingUser.displayNameArabic;
      setArchivingUser(null);
      setArchiveReasonInput('');
      await loadCloudData();
      setStatusMsg({
        type: 'success',
        text: nextArchive
          ? `تمت أرشفة حساب "${targetName}" وإيقاف صلاحية دخوله في السحابة بنجاح.`
          : `تم إلغاء أرشفة حساب "${targetName}" واستعادة تفعيله في السحابة بنجاح ✓`
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'تعذر تنفيذ عملية الأرشفة في السحابة'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmPermanentDelete = async () => {
    if (!deletingUser) return;
    setActionLoading(true);
    setStatusMsg(null);
    try {
      const targetName = deletingUser.displayNameArabic;
      await deleteUserAccountCompletelyFromCloud({
        targetUid: deletingUser.uid,
        performedBy: callerEmail || callerUid,
        isSelfDelete: false
      });
      setDeletingUser(null);
      await loadCloudData();
      setStatusMsg({
        type: 'success',
        text: `تم حذف حساب "${targetName}" وكافة سجلاته ومعرفاته نهائياً من قاعدة بيانات السحابة ✓`
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'تعذر حذف الحساب من السحابة'
      });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (statusFilter === 'active' && u.isArchived) return false;
    if (statusFilter === 'archived' && !u.isArchived) return false;
    if (statusFilter === 'verified' && !u.isVerified) return false;
    if (statusFilter === 'unverified' && u.isVerified) return false;
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      u.displayNameArabic.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone.toLowerCase().includes(q) ||
      u.academicStudentNumber.toLowerCase().includes(q) ||
      u.uid.toLowerCase().includes(q) ||
      (u.ownerLinkedEmails && u.ownerLinkedEmails.some(e => e.toLowerCase().includes(q)))
    );
  });

  const handleExportCSV = async () => {
    const headers = [
      'UID',
      'الاسم الكامل',
      'البريد الإلكتروني',
      'رقم الهاتف',
      'رقم القيد الأكاديمي',
      'الرتبة / الصلاحية',
      'الجامعة',
      'المستوى الدراسي',
      'طريقة التسجيل',
      'حالة التوثيق',
      'حالة الحساب (نشط/مؤرشف)',
      'تاريخ الإنشاء'
    ];

    const escapeCsv = (val: string) => `"${String(val || '').replace(/"/g, '""')}"`;

    const rows = filteredUsers.map((u) => [
      escapeCsv(u.uid),
      escapeCsv(u.displayNameArabic),
      escapeCsv(u.isPrimaryOwner ? 'alssaedy50@gmail.com / alssaedy500@gmail.com' : u.email || '—'),
      escapeCsv(u.phone || '—'),
      escapeCsv(u.academicStudentNumber || '—'),
      escapeCsv(getRoleLabelArabic(u.role)),
      escapeCsv(universities.find(un => un.id === u.universityId)?.nameArabic || u.universityId),
      escapeCsv(studyLevels.find(l => l.id === u.studyLevelId)?.titleArabic || u.studyLevelId),
      escapeCsv(u.registrationMethod === 'phone' ? 'رقم هاتف' : u.registrationMethod === 'google' ? 'Google' : 'بريد إلكتروني'),
      escapeCsv(u.isVerified ? 'موثق' : 'غير موثق'),
      escapeCsv(u.isArchived ? 'مؤرشف' : 'نشط'),
      escapeCsv(u.createdAt)
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `umed-users-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await writeAuditLogToCloud({
      action: 'USERS_EXPORTED',
      performedBy: callerEmail || callerUid,
      details: { format: 'CSV', count: filteredUsers.length }
    });
  };

  const handleExportJSON = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: callerEmail || callerUid,
      totalRecords: filteredUsers.length,
      primaryOwnerIdentity: ownerConfig,
      users: filteredUsers
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `umed-users-cloud-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await writeAuditLogToCloud({
      action: 'USERS_EXPORTED',
      performedBy: callerEmail || callerUid,
      details: { format: 'JSON', count: filteredUsers.length }
    });
  };

  const totalCount = users.length;
  const activeCount = users.filter(u => !u.isArchived).length;
  const archivedCount = users.filter(u => u.isArchived).length;
  const verifiedCount = users.filter(u => u.isVerified).length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* 1. Primary Platform Owner Official Identity & Anti-Duplication Console */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border border-amber-500/40 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  الهوية الرسمية للمالك الأساسي للمنصة (منع التكرار والحجز السحابي)
                </h2>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                  محمي ضد التكرار ✓
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                إيميلات المالك الأساسي ورقم هاتفه محجوزة حصرياً في السحابة ولا يمكن لأي مستخدم آخر التسجيل بها أو تكرارها
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSyncPrimaryOwner} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 mb-1.5 font-semibold">حسابات البريد الإلكتروني للمالك الأساسي (محمية وثابتة):</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {INITIAL_OWNER_EMAILS.map((email, idx) => (
                <div key={email} className="px-3 py-2.5 rounded-xl bg-slate-950 border border-amber-500/40 text-amber-300 font-mono font-bold flex items-center justify-between text-[11px]" dir="ltr">
                  <span className="truncate">{email}</span>
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 mr-1" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">

          <div className="md:col-span-4">
            <label className="block text-slate-300 mb-1 font-semibold">رقم هاتف المالك الأساسي:</label>
            <input
              type="tel"
              required
              value={ownerPhoneInput}
              onChange={(e) => setOwnerPhoneInput(e.target.value)}
              placeholder="+967770000001"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-amber-500"
              dir="ltr"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-slate-300 mb-1 font-semibold">اسم المالك الأساسي:</label>
            <input
              type="text"
              required
              value={ownerNameInput}
              onChange={(e) => setOwnerNameInput(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={ownerSyncLoading}
              className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg"
            >
              {ownerSyncLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              <span>تثبيت ومنع التكرار</span>
            </button>
          </div>
        </div>
      </form>
    </div>

      {/* 2. Summary Statistics & Cloud Export Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-teal-400 font-semibold">
              <Users className="w-4 h-4" />
              <span>إدارة حسابات وبيانات المستخدمين السحابية (حصري لمالك المنصة)</span>
            </div>
            <h3 className="text-lg font-bold text-white mt-0.5">
              سجل المستخدمين الشامل — تعديل، توثيق، أرشفة، حذف سحابي، وتصدير
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير Excel / CSV ({filteredUsers.length})</span>
            </button>

            <button
              type="button"
              onClick={handleExportJSON}
              className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <FileJson className="w-4 h-4" />
              <span>تصدير JSON</span>
            </button>

            <button
              type="button"
              onClick={loadCloudData}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث من السحابة</span>
            </button>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-slate-400">إجمالي الحسابات في السحابة</div>
            <div className="text-lg font-black text-white font-mono mt-1">{totalCount}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-900/50">
            <div className="text-slate-400">الحسابات النشطة</div>
            <div className="text-lg font-black text-emerald-400 font-mono mt-1">{activeCount}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-teal-900/50">
            <div className="text-slate-400">الحسابات الموثقة رسمياً</div>
            <div className="text-lg font-black text-teal-400 font-mono mt-1">{verifiedCount}</div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-900/50">
            <div className="text-slate-400">الحسابات المؤرشفة</div>
            <div className="text-lg font-black text-amber-400 font-mono mt-1">{archivedCount}</div>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم، البريد الإلكتروني، رقم الهاتف، رقم القيد، أو UID..."
              className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="md:col-span-4 flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'active', label: 'نشط' },
              { id: 'verified', label: 'موثق ✓' },
              { id: 'unverified', label: 'غير موثق' },
              { id: 'archived', label: 'مؤرشف' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="md:col-span-3">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold"
            >
              <option value="ALL">جميع الرتب والصلاحيات</option>
              <option value="platform_owner">مالك المنصة العام</option>
              <option value="university_admin">مالك / مشرف جامعة</option>
              <option value="batch_rep">مندوب دفعة / مستوى</option>
              <option value="department_head">رئيس قسم / مادة</option>
              <option value="student">طالب طب بشري</option>
            </select>
          </div>
        </div>

        {statusMsg && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/50 border-rose-800 text-rose-300'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Users List Table / Cards */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <RefreshCw className="w-7 h-7 animate-spin text-teal-400 mx-auto" />
            <div>جارٍ جلب ومزامنة سجلات المستخدمين من قاعدة بيانات السحابة...</div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
            لا توجد حسابات مطابقة لمعايير البحث الحالية.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUsers.map((u) => {
              const univName = universities.find(un => un.id === u.universityId)?.nameArabic || u.universityId;
              const lvlName = studyLevels.find(l => l.id === u.studyLevelId)?.titleArabic || u.studyLevelId;

              return (
                <div
                  key={u.uid}
                  className={`p-4 rounded-2xl border transition-all ${
                    u.isPrimaryOwner
                      ? 'bg-amber-950/20 border-amber-500/50'
                      : u.isArchived
                      ? 'bg-slate-950/70 border-rose-900/50 opacity-85'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {u.displayNameArabic}
                        </span>

                        {u.isPrimaryOwner && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                            👑 المالك الأساسي للمنصة (غير قابل للتكرار)
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            u.role === 'platform_owner'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : u.role === 'university_admin'
                              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                              : u.role === 'batch_rep'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : u.role === 'department_head'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {getRoleLabelArabic(u.role)}
                        </span>

                        {u.isVerified ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            موثق سحابياً ✓
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            غير موثق
                          </span>
                        )}

                        {u.isArchived ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                            مؤرشف / موقوف
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-teal-500/15 text-teal-300 border border-teal-500/30 text-[10px] font-semibold">
                            نشط
                          </span>
                        )}
                      </div>

                      {/* Identifiers Row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-300">
                        {u.isPrimaryOwner ? (
                          <span className="flex items-center gap-1.5 font-mono text-amber-300" dir="ltr">
                            <Mail className="w-3.5 h-3.5 text-amber-400" />
                            <span>alssaedy50@gmail.com | alssaedy500@gmail.com</span>
                          </span>
                        ) : u.email ? (
                          <span className="flex items-center gap-1.5 font-mono text-teal-300" dir="ltr">
                            <Mail className="w-3.5 h-3.5 text-teal-400" />
                            <span>{u.email}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">بدون بريد (تسجيل عبر الهاتف)</span>
                        )}

                        {u.phone && (
                          <span className="flex items-center gap-1.5 font-mono text-emerald-300" dir="ltr">
                            <Phone className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{u.phone}</span>
                          </span>
                        )}

                        {u.academicStudentNumber && (
                          <span className="flex items-center gap-1.5 font-mono text-indigo-300" dir="ltr">
                            <Hash className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{u.academicStudentNumber}</span>
                          </span>
                        )}
                      </div>

                      {/* Scope & Metadata Row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{univName}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-slate-500" />
                          <span>{lvlName}</span>
                        </span>
                        <span>
                          طريقة التسجيل:{' '}
                          <strong className="text-slate-300">
                            {u.registrationMethod === 'phone'
                              ? 'برقم الهاتف'
                              : u.registrationMethod === 'google'
                              ? 'حساب Google'
                              : 'بالبريد الإلكتروني'}
                          </strong>
                        </span>
                        <span className="font-mono text-[10px] text-slate-500" dir="ltr">
                          UID: {u.uid}
                        </span>
                      </div>

                      {u.isArchived && u.archiveReason && (
                        <div className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-lg px-2.5 py-1 inline-block">
                          سبب الأرشفة: {u.archiveReason}
                        </div>
                      )}
                    </div>

                    {/* Cloud Actions Toolbar */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(u)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>تعديل البيانات</span>
                      </button>

                      {!u.isPrimaryOwner && (
                        <>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleQuickVerifyToggle(u)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                              u.isVerified
                                ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                                : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
                            }`}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{u.isVerified ? 'إلغاء التوثيق' : 'تأكيد التوثيق ✓'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => {
                              setArchivingUser(u);
                              setArchiveReasonInput(u.archiveReason || '');
                            }}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                              u.isArchived
                                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                                : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-slate-700'
                            }`}
                          >
                            {u.isArchived ? (
                              <>
                                <ArchiveRestore className="w-3.5 h-3.5" />
                                <span>استعادة من الأرشيف</span>
                              </>
                            ) : (
                              <>
                                <Archive className="w-3.5 h-3.5" />
                                <span>أرشفة</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => setDeletingUser(u)}
                            className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 text-xs font-bold flex items-center gap-1.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف سحابي</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =====================================================================
          MODAL 1: EDIT USER DATA IN CLOUD FIRESTORE
         ===================================================================== */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs overflow-y-auto flex justify-center items-start sm:items-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 sm:p-6 my-auto max-h-[92dvh] overflow-y-auto shadow-2xl space-y-4 text-xs" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white">
                  تعديل بيانات الحساب ومزامنتها في السحابة ({editingUser.displayNameArabic})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUserEdits} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الاسم الرباعي بالعربية:</label>
                  <input
                    type="text"
                    required
                    value={editNameAr}
                    onChange={(e) => setEditNameAr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">رقم القيد الأكاديمي (فريد):</label>
                  <input
                    type="text"
                    value={editAcadNum}
                    onChange={(e) => setEditAcadNum(e.target.value)}
                    placeholder="MED-2025-001"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">البريد الإلكتروني (اختياري لمستخدمي الهاتف):</label>
                  <input
                    type="email"
                    disabled={editingUser.isPrimaryOwner}
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono disabled:opacity-60"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">رقم الهاتف اليمني (+967):</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+967771234567"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الرتبة / الصلاحية:</label>
                  <select
                    disabled={editingUser.isPrimaryOwner}
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold disabled:opacity-60"
                  >
                    <option value="student">طالب طب بشري</option>
                    <option value="department_head">رئيس قسم / مادة</option>
                    <option value="batch_rep">مندوب دفعة / مستوى</option>
                    <option value="university_admin">مالك / مشرف جامعة</option>
                    <option value="platform_owner">مالك منصة مشارك</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الجامعة:</label>
                  <select
                    value={editUnivId}
                    onChange={(e) => setEditUnivId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    {universities.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nameArabic}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المستوى / الدفعة:</label>
                  <select
                    value={editLevelId}
                    onChange={(e) => setEditLevelId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    {studyLevels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.titleArabic}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">حالة القيد الأكاديمي:</label>
                  <select
                    value={editEnrStatus}
                    onChange={(e) => setEditEnrStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="approved">معتمد (Approved)</option>
                    <option value="pending">قيد المراجعة (Pending)</option>
                    <option value="rejected">مرفوض (Rejected)</option>
                    <option value="not_enrolled">غير مقيد</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-semibold">
                    <input
                      type="checkbox"
                      disabled={editingUser.isPrimaryOwner}
                      checked={editVerified}
                      onChange={(e) => setEditVerified(e.target.checked)}
                      className="rounded border-slate-700 text-teal-500 focus:ring-teal-500"
                    />
                    <span>حساب موثق رسمياً ✓</span>
                  </label>
                </div>

                {!editingUser.isPrimaryOwner && (
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-rose-300 font-semibold">
                      <input
                        type="checkbox"
                        checked={editArchived}
                        onChange={(e) => setEditArchived(e.target.checked)}
                        className="rounded border-slate-700 text-rose-500 focus:ring-rose-500"
                      />
                      <span>أرشفة الحساب (إيقاف)</span>
                    </label>
                  </div>
                )}
              </div>

              {editArchived && !editingUser.isPrimaryOwner && (
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">سبب الأرشفة (يُحفظ في السحابة):</label>
                  <input
                    type="text"
                    value={editArchiveReason}
                    onChange={(e) => setEditArchiveReason(e.target.value)}
                    placeholder="مثال: تخرج الطالب أو إيقاف مؤقت للحساب..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 shadow-lg"
                >
                  {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>حفظ التعديلات في السحابة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: ARCHIVE / UNARCHIVE CONFIRMATION
         ===================================================================== */}
      {archivingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs overflow-y-auto flex justify-center items-start sm:items-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-5 sm:p-6 my-auto shadow-2xl space-y-4 text-xs" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Archive className="w-4 h-4" />
                <span>{archivingUser.isArchived ? 'استعادة الحساب من الأرشيف' : 'تأكيد أرشفة الحساب في السحابة'}</span>
              </div>
              <button
                type="button"
                onClick={() => setArchivingUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-300 leading-relaxed">
              {archivingUser.isArchived
                ? `هل ترغب في إلغاء أرشفة حساب "${archivingUser.displayNameArabic}" وإعادة تفعيله في السحابة؟`
                : `عند أرشفة حساب "${archivingUser.displayNameArabic}" سيتم الاحتفاظ ببياناته في الأرشيف السحابي مع إيقاف إمكانية دخوله للمنصة حتى يتم استعادته.`}
            </p>

            {!archivingUser.isArchived && (
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">سبب الأرشفة (اختياري):</label>
                <input
                  type="text"
                  value={archiveReasonInput}
                  onChange={(e) => setArchiveReasonInput(e.target.value)}
                  placeholder="مثال: انتهاء الفصل الدراسي أو إيقاف إداري..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setArchivingUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmArchiveToggle}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1.5"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{archivingUser.isArchived ? 'تأكيد الاستعادة السحابية' : 'تأكيد الأرشفة السحابية'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: PERMANENT CLOUD ACCOUNT DELETION CONFIRMATION
         ===================================================================== */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs overflow-y-auto flex justify-center items-start sm:items-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-rose-600/50 rounded-2xl max-w-md w-full p-5 sm:p-6 my-auto shadow-2xl space-y-4 text-xs" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <Trash2 className="w-4 h-4" />
                <span>تأكيد الحذف النهائي للحساب من السحابة</span>
              </div>
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 space-y-2 text-rose-200 leading-relaxed">
              <div className="font-bold text-rose-300">
                تحذير: سيتم حذف الحساب التالي نهائياً من قاعدة بيانات السحابة (Firestore):
              </div>
              <div className="text-white font-bold">{deletingUser.displayNameArabic}</div>
              <div className="font-mono text-[11px]" dir="ltr">
                {deletingUser.email || deletingUser.phone || deletingUser.uid}
              </div>
              <ul className="list-disc list-inside text-[11px] text-rose-300/90 space-y-0.5 pt-1">
                <li>حذف ملف المستخدم (userProfiles) والرتبة (userRoles)</li>
                <li>تحرير وحذف البريد ورقم الهاتف ورقم القيد من سجل المعرفات الفريدة (uniqueIdentifiers)</li>
                <li>حذف طلبات القيد الأكاديمي (studentEnrollments) ونتائج الاختبارات</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmPermanentDelete}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 shadow-lg"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>تأكيد الحذف النهائي من السحابة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
