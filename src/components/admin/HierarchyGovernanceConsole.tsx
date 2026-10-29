/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Batch & Hierarchy Governance Console
 * - Streamlined University selector with direct link to Academic Structure Management (no duplicate university creation form)
 * - Batch Notifications tab: Broadcasts announcements and links existing Medical Library resources (removed duplicate file upload)
 * - Supervisor Promotions tab: Smart autocomplete search input to find and promote students directly
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Bell,
  Stethoscope,
  Search,
  Plus,
  Trash2,
  Pin,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Building2,
  BookOpen,
  ExternalLink,
  UserCheck,
  X
} from 'lucide-react';
import {
  University,
  StudyLevel,
  CourseOffering,
  CourseInstructor,
  BatchNotification,
  NotificationCategory,
  TeachingType,
  EducationalResource,
  UserRole,
  DAR_AL_SALAM_SEED
} from '../../types/umed.ts';
import {
  fetchUniversities,
  fetchStudyLevels,
  fetchCourseOfferings
} from '../../services/academicService.ts';
import {
  getRoleLabelArabic,
  getAllowedPromotableRoles,
  promoteUserInHierarchy,
  revokeUserRoleInHierarchy,
  DirectoryUserCandidate,
  fetchRegisteredUsersDirectory,
  fetchCourseInstructors,
  saveCourseInstructor,
  deleteCourseInstructor,
  fetchBatchNotifications,
  createBatchNotification,
  deleteBatchNotification
} from '../../services/batchGovernanceService.ts';
import { fetchEducationalResources } from '../../services/resourceService.ts';
import { renderBiDiRoleLabel } from '../../utils/roleHelpers.tsx';

interface HierarchyGovernanceConsoleProps {
  callerUid: string;
  callerEmail?: string;
  callerNameArabic: string;
  callerRole: UserRole;
  assignedUniversityId?: string;
  assignedStudyLevelId?: string;
  onNavigateToAcademicStructure?: () => void;
}

export default function HierarchyGovernanceConsole({
  callerUid,
  callerEmail = '',
  callerNameArabic,
  callerRole,
  assignedUniversityId,
  assignedStudyLevelId,
  onNavigateToAcademicStructure
}: HierarchyGovernanceConsoleProps) {
  const isOwner = callerRole === 'platform_owner';
  const isBatchLocked =
    (callerRole === 'batch_rep' || callerRole === 'department_head') &&
    Boolean(assignedStudyLevelId);

  const [activeTab, setActiveTab] = useState<'promotions' | 'notifications' | 'instructors'>(
    'notifications'
  );

  // Scope Selectors
  const [universities, setUniversities] = useState<University[]>([DAR_AL_SALAM_SEED.university]);
  const [selectedUnivId, setSelectedUnivId] = useState<string>(
    assignedUniversityId || 'univ-dar-al-salam'
  );
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>(DAR_AL_SALAM_SEED.studyLevels);
  const [selectedLevelId, setSelectedLevelId] = useState<string>(
    assignedStudyLevelId || 'lvl-1'
  );
  const [courses, setCourses] = useState<CourseOffering[]>([]);

  // Tab 1: Smart Search Supervisor Promotions
  const [directoryCandidates, setDirectoryCandidates] = useState<DirectoryUserCandidate[]>([]);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState<string>('');
  const [selectedCandidate, setSelectedCandidate] = useState<DirectoryUserCandidate | null>(null);
  const [targetRoleToAssign, setTargetRoleToAssign] = useState<UserRole>('batch_rep');
  const [promoting, setPromoting] = useState<boolean>(false);

  // Tab 2: Batch Notifications (linked to existing Library resources only)
  const [notifications, setNotifications] = useState<BatchNotification[]>([]);
  const [libraryResources, setLibraryResources] = useState<EducationalResource[]>([]);
  const [notifTitle, setNotifTitle] = useState<string>('');
  const [notifMessage, setNotifMessage] = useState<string>('');
  const [notifCategory, setNotifCategory] = useState<NotificationCategory>('lecture');
  const [notifCourseId, setNotifCourseId] = useState<string>('');
  const [linkedResourceId, setLinkedResourceId] = useState<string>('');
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [publishingNotif, setPublishingNotif] = useState<boolean>(false);

  // Tab 3: Course Instructors
  const [instructors, setInstructors] = useState<CourseInstructor[]>([]);
  const [instNameAr, setInstNameAr] = useState<string>('');
  const [instCourseId, setInstCourseId] = useState<string>('');
  const [instAcademicTitle, setInstAcademicTitle] = useState<string>('أستاذ مساعد (Asst. Prof.)');
  const [instTeachingType, setInstTeachingType] = useState<TeachingType>('both');

  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const allowedRoleItems = useMemo(() => getAllowedPromotableRoles(callerRole), [callerRole]);

  useEffect(() => {
    if (
      allowedRoleItems.length > 0 &&
      !allowedRoleItems.some((item) => item.role === targetRoleToAssign)
    ) {
      setTargetRoleToAssign(allowedRoleItems[0].role);
    }
  }, [allowedRoleItems, targetRoleToAssign]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 4500);
  };

  const loadScopeData = useCallback(async () => {
    setLoading(true);
    try {
      const univs = await fetchUniversities();
      const effectiveUnivs = univs.length > 0 ? univs : [DAR_AL_SALAM_SEED.university];
      setUniversities(effectiveUnivs);

      const activeUniv = assignedUniversityId || selectedUnivId || effectiveUnivs[0].id;
      const lvls = await fetchStudyLevels();
      const sortedLvls = [...lvls].sort((a, b) => a.order - b.order);
      setStudyLevels(sortedLvls);

      const activeLvl =
        assignedStudyLevelId ||
        (sortedLvls.some((l) => l.id === selectedLevelId)
          ? selectedLevelId
          : sortedLvls[0]?.id || 'lvl-1');

      const [allCourses, notifs, insts, dirUsers, resources] = await Promise.all([
        fetchCourseOfferings(undefined, activeUniv),
        fetchBatchNotifications({ universityId: activeUniv, studyLevelId: activeLvl }),
        fetchCourseInstructors({ universityId: activeUniv, studyLevelId: activeLvl }),
        fetchRegisteredUsersDirectory({ universityId: activeUniv }),
        fetchEducationalResources({ universityId: activeUniv })
      ]);

      const levelCourses = allCourses.filter(
        (c) => c.studyLevelId === activeLvl && !c.isArchived
      );
      setCourses(levelCourses);
      setNotifications(notifs);
      setInstructors(insts);
      setDirectoryCandidates(dirUsers);
      setLibraryResources(
        resources.filter((r) => !r.studyLevelId || r.studyLevelId === activeLvl)
      );
      if (levelCourses.length > 0 && !instCourseId) {
        setInstCourseId(levelCourses[0].id);
      }
    } catch (err) {
      console.error('Error loading governance console data:', err);
    } finally {
      setLoading(false);
    }
  }, [assignedUniversityId, assignedStudyLevelId, selectedUnivId, selectedLevelId, instCourseId]);

  useEffect(() => {
    loadScopeData();
  }, [loadScopeData]);

  // Smart Search Autocomplete Results (Max 8 matching candidates)
  const matchingCandidates = useMemo(() => {
    const q = candidateSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return directoryCandidates
      .filter(
        (c) =>
          c.displayNameArabic.toLowerCase().includes(q) ||
          (c.academicStudentNumber || '').toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.uid.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [directoryCandidates, candidateSearchQuery]);

  // Active supervisors in the current scope
  const activeSupervisors = useMemo(() => {
    return directoryCandidates.filter((c) => c.currentRole && c.currentRole !== 'student');
  }, [directoryCandidates]);

  const handlePromoteSelectedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    setPromoting(true);
    try {
      await promoteUserInHierarchy({
        callerUid,
        callerEmail: callerEmail || callerUid,
        callerRole,
        callerUniversityId: assignedUniversityId || selectedUnivId,
        callerStudyLevelId: assignedStudyLevelId || selectedLevelId,
        targetUid: selectedCandidate.uid,
        targetEmail: selectedCandidate.email,
        targetDisplayNameArabic: selectedCandidate.displayNameArabic,
        newRole: targetRoleToAssign,
        assignedUniversityId: selectedUnivId,
        assignedStudyLevelId:
          targetRoleToAssign === 'university_admin' ? undefined : selectedLevelId
      });
      showMessage(
        'success',
        `تمت ترقية "${selectedCandidate.displayNameArabic}" إلى دور (${getRoleLabelArabic(
          targetRoleToAssign
        )}) بنجاح.`
      );
      setSelectedCandidate(null);
      setCandidateSearchQuery('');
      await loadScopeData();
    } catch (err: any) {
      showMessage('error', err?.message || 'تعذر تنفيذ الترقية.');
    } finally {
      setPromoting(false);
    }
  };

  const handlePublishBatchNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    setPublishingNotif(true);
    try {
      const linkedRes = libraryResources.find((r) => r.id === linkedResourceId);
      await createBatchNotification({
        universityId: selectedUnivId,
        studyLevelId: selectedLevelId,
        courseOfferingId: notifCourseId || undefined,
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        category: notifCategory,
        attachmentUrl: linkedRes?.url || undefined,
        attachmentType: linkedRes?.resourceType || undefined,
        attachmentLabel: linkedRes ? linkedRes.title : undefined,
        authorUid: callerUid,
        authorNameArabic: callerNameArabic || 'مشرف الدفعة',
        authorRole: callerRole,
        isPinned
      });
      setNotifTitle('');
      setNotifMessage('');
      setLinkedResourceId('');
      setIsPinned(false);
      showMessage('success', 'تم نشر إعلان الدفعة وإشعار جميع طلاب الدفعة فوراً.');
      await loadScopeData();
    } catch (err: any) {
      showMessage('error', err?.message || 'تعذر نشر الإعلان.');
    } finally {
      setPublishingNotif(false);
    }
  };

  const handleAddInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instNameAr.trim() || !instCourseId) return;
    try {
      const nowIso = new Date().toISOString();
      const targetCourse = courses.find((c) => c.id === instCourseId);
      const record: CourseInstructor = {
        id: `inst-${Date.now().toString(36)}`,
        universityId: selectedUnivId,
        studyLevelId: selectedLevelId,
        courseOfferingId: instCourseId,
        courseTitleArabic: targetCourse?.titleArabic || '',
        instructorNameArabic: instNameAr.trim(),
        academicTitle: instAcademicTitle,
        teachingType: instTeachingType,
        createdBy: callerUid,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      await saveCourseInstructor(record, callerUid);
      setInstNameAr('');
      showMessage('success', 'تمت إضافة دكتور المقرر بنجاح.');
      await loadScopeData();
    } catch (err: any) {
      showMessage('error', err?.message || 'تعذر حفظ دكتور المقرر.');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header & Academic Scope Bar (No duplicate university creation form) */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                حوكمة الدفعات وإعلانات المندوبين والترقيات
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                إدارة منشورات الدفعة، ربط موارد المكتبة، وترقية المشرفين والمندوبين ضمن النطاق الأكاديمي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOwner && onNavigateToAcademicStructure && (
              <button
                type="button"
                onClick={onNavigateToAcademicStructure}
                className="px-3.5 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-400 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>إدارة الهيكل الأكاديمي والجامعات</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={loadScopeData}
              className="p-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)]"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Scope Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-color)]">
          <div>
            <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
              الجامعة:
            </label>
            <select
              value={selectedUnivId}
              onChange={(e) => setSelectedUnivId(e.target.value)}
              disabled={Boolean(assignedUniversityId) && !isOwner}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-primary)]"
            >
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nameArabic} ({u.cityArabic})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
              المستوى الدراسي / الدفعة:
            </label>
            <select
              value={selectedLevelId}
              onChange={(e) => setSelectedLevelId(e.target.value)}
              disabled={isBatchLocked}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-primary)]"
            >
              {studyLevels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.titleArabic}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Internal Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'notifications'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>إشعارات ومنشورات الدفعة ({notifications.length})</span>
          </button>

          {allowedRoleItems.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('promotions')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'promotions'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>ترقية المشرفين والمندوبين</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('instructors')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'instructors'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>دكاترة مقررات الدفعة ({instructors.length})</span>
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

      {/* TAB 1: BATCH NOTIFICATIONS (Linked to Existing Library Resources) */}
      {activeTab === 'notifications' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
          <form
            onSubmit={handlePublishBatchNotification}
            className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-3"
          >
            <h3 className="text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <Bell className="w-4 h-4 text-teal-400" />
              <span>نشر إعلان أو تنبيه أكاديمي جديد لطلاب الدفعة</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder="عنوان الإعلان (مثال: موعد محاضرة التشريح السريري)"
                className="sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
              />
              <select
                value={notifCategory}
                onChange={(e) => setNotifCategory(e.target.value as NotificationCategory)}
                className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
              >
                <option value="lecture">تنبيه محاضرة</option>
                <option value="exam">موعد اختبار</option>
                <option value="practical">تدريب عملي / سريري</option>
                <option value="data_shared">مشاركة مرجع من المكتبة</option>
                <option value="urgent">إعلان عاجل</option>
                <option value="general">إعلان عام للدفعة</option>
              </select>
            </div>

            <textarea
              required
              rows={3}
              value={notifMessage}
              onChange={(e) => setNotifMessage(e.target.value)}
              placeholder="اكتب تفاصيل الإعلان لزملائك في الدفعة..."
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                  المقرر المرتبط (اختياري):
                </label>
                <select
                  value={notifCourseId}
                  onChange={(e) => setNotifCourseId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                >
                  <option value="">إعلان عام للدفعة</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.titleArabic} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                  ربط بمورد موجود في المكتبة الطبية (اختياري):
                </label>
                <select
                  value={linkedResourceId}
                  onChange={(e) => setLinkedResourceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                >
                  <option value="">بدون مرفق من المكتبة</option>
                  {libraryResources.map((res) => (
                    <option key={res.id} value={res.id}>
                      [{res.resourceType.toUpperCase()}] {res.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="rounded border-slate-700 text-teal-600 focus:ring-teal-500"
                />
                <span>تثبيت الإعلان في أعلى لوحة الدفعة</span>
              </label>

              <button
                type="submit"
                disabled={publishingNotif}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                {publishingNotif ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>نشر الإعلان الآن</span>
              </button>
            </div>
          </form>

          <div className="space-y-2.5">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]">
                لا توجد إعلانات منشورة لهذه الدفعة حالياً.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.isPinned && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center gap-1">
                          <Pin className="w-3 h-3" />
                          <span>مثبت</span>
                        </span>
                      )}
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {n.title}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        بواسطة: {n.authorNameArabic}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] whitespace-pre-line">
                      {n.message}
                    </p>
                    {n.attachmentLabel && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 text-[11px] font-bold">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>مورد مرتبط: {n.attachmentLabel}</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteBatchNotification(n.id);
                      await loadScopeData();
                    }}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 shrink-0"
                    title="حذف الإعلان"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SMART SEARCH SUPERVISOR PROMOTIONS */}
      {activeTab === 'promotions' && allowedRoleItems.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-5 shadow-lg">
          <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-3">
            <h3 className="text-xs font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-400" />
              <span>البحث الذكي عن طالب لترقيته مباشرة</span>
            </h3>
            <p className="text-[11px] text-[var(--text-muted)]">
              ابحث بالاسم الثلاثي أو الرقم الأكاديمي أو البريد الإلكتروني لاختيار الطالب وترقيته فوراً
            </p>

            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute right-3.5 top-3" />
              <input
                type="text"
                value={candidateSearchQuery}
                onChange={(e) => {
                  setCandidateSearchQuery(e.target.value);
                  setSelectedCandidate(null);
                }}
                placeholder="اكتب اسم الطالب أو الرقم الأكاديمي أو البريد الإلكتروني..."
                className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:border-indigo-500 focus:outline-none"
              />

              {/* Autocomplete Dropdown Results */}
              {matchingCandidates.length > 0 && !selectedCandidate && (
                <div className="mt-1.5 bg-[var(--bg-card)] border border-indigo-500/40 rounded-xl shadow-2xl divide-y divide-[var(--border-color)] max-h-60 overflow-y-auto">
                  {matchingCandidates.map((cand) => (
                    <button
                      key={cand.uid}
                      type="button"
                      onClick={() => {
                        setSelectedCandidate(cand);
                        setCandidateSearchQuery(cand.displayNameArabic);
                      }}
                      className="w-full p-3 text-right hover:bg-[var(--bg-elevated)] flex items-center justify-between gap-2 transition-colors"
                    >
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          {cand.displayNameArabic}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono" dir="ltr">
                          {cand.academicStudentNumber ? `${cand.academicStudentNumber} • ` : ''}
                          {cand.email}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 text-[10px] font-bold">
                        {renderBiDiRoleLabel(cand.currentRole || 'student')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedCandidate && (
              <form
                onSubmit={handlePromoteSelectedUser}
                className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-[var(--text-primary)]">
                      الطالب المحدد: {selectedCandidate.displayNameArabic}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono" dir="ltr">
                      {selectedCandidate.email}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCandidate(null);
                      setCandidateSearchQuery('');
                    }}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    تغيير الطالب
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <select
                    value={targetRoleToAssign}
                    onChange={(e) => setTargetRoleToAssign(e.target.value as UserRole)}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-primary)]"
                  >
                    {allowedRoleItems.map((item) => (
                      <option key={item.role} value={item.role}>
                        {item.labelArabic}
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    disabled={promoting}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    {promoting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                    <span>اعتماد الترقية الآن</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Current Active Supervisors List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-[var(--text-secondary)]">
              المشرفون والمندوبون الحاليون في هذه الجامعة ({activeSupervisors.length}):
            </h4>
            {activeSupervisors.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]">
                لا يوجد مشرفون معينون حالياً في هذا النطاق.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeSupervisors.map((sup) => (
                  <div
                    key={sup.uid}
                    className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                        {sup.displayNameArabic}
                      </div>
                      <div className="text-[10px] text-indigo-400 font-bold">
                        {renderBiDiRoleLabel(sup.currentRole)}
                      </div>
                    </div>
                    {sup.currentRole !== 'platform_owner' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await revokeUserRoleInHierarchy({
                            callerUid,
                            callerEmail: callerEmail || callerUid,
                            callerRole,
                            callerUniversityId: selectedUnivId,
                            callerStudyLevelId: selectedLevelId,
                            targetRoleDoc: {
                              uid: sup.uid,
                              email: sup.email,
                              role: sup.currentRole || 'student',
                              assignedUniversityId: sup.universityId || selectedUnivId,
                              assignedStudyLevelId: sup.studyLevelId || selectedLevelId,
                              assignedAt: new Date().toISOString(),
                              assignedBy: callerUid
                            }
                          });
                          showMessage('success', 'تمت إعادة المستخدم إلى صلاحية طالب عادي.');
                          await loadScopeData();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 text-[10px] font-bold shrink-0"
                      >
                        إعفاء
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: COURSE INSTRUCTORS */}
      {activeTab === 'instructors' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
          <form
            onSubmit={handleAddInstructor}
            className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] grid grid-cols-1 sm:grid-cols-4 gap-2.5"
          >
            <input
              type="text"
              required
              value={instNameAr}
              onChange={(e) => setInstNameAr(e.target.value)}
              placeholder="اسم دكتور المقرر بالعربية"
              className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
            />
            <select
              value={instCourseId}
              onChange={(e) => setInstCourseId(e.target.value)}
              required
              className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
            >
              <option value="">اختر المقرر...</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titleArabic}
                </option>
              ))}
            </select>
            <select
              value={instAcademicTitle}
              onChange={(e) => setInstAcademicTitle(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
            >
              <option value="أستاذ دكتور (Prof.)">أستاذ دكتور (Prof.)</option>
              <option value="أستاذ مشارك (Assoc. Prof.)">أستاذ مشارك (Assoc. Prof.)</option>
              <option value="أستاذ مساعد (Asst. Prof.)">أستاذ مساعد (Asst. Prof.)</option>
              <option value="مدرس / محاضر (Lecturer)">مدرس / محاضر (Lecturer)</option>
              <option value="معيد / مشرف سريري (Clinical Tutor)">
                معيد / مشرف سريري (Clinical Tutor)
              </option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة الدكتور</span>
            </button>
          </form>

          <div className="space-y-2">
            {instructors.map((inst) => (
              <div
                key={inst.id}
                className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    {inst.academicTitle} / {inst.instructorNameArabic}
                  </div>
                  <div className="text-[11px] text-teal-400">{inst.courseTitleArabic}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteCourseInstructor(inst.id, callerUid, selectedUnivId);
                    await loadScopeData();
                  }}
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
