/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Hierarchical Governance, Subject Doctors & Batch Notifications Console
 * Implements the full delegation chain:
 *   1. Platform Owner -> Adds Universities & Promotes University Owners (and sees/controls everything)
 *   2. University Owner -> Promotes Batch/Level Representatives (strictly isolated to their university)
 *   3. Batch Representative -> Promotes Department/Subject Heads, Adds Theoretical/Practical Doctors,
 *      Broadcasts Batch Notifications, and Shares Data/Files/Videos/Links (strictly isolated to their batch)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Crown,
  Building2,
  Users,
  Stethoscope,
  Bell,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Upload,
  Link as LinkIcon,
  BookOpen,
  Layers,
  UserCheck,
  ShieldCheck
} from 'lucide-react';
import {
  UserRole,
  UserRoleDoc,
  University,
  StudyLevel,
  CourseOffering,
  CourseInstructor,
  TeachingType,
  BatchNotification,
  NotificationCategory,
  ResourceType,
  DAR_AL_SALAM_SEED
} from '../../types/umed.ts';
import { fetchAllUserRoles } from '../../lib/firebase.ts';
import {
  fetchUniversities,
  saveUniversity,
  saveCollege,
  saveProgram,
  saveCurriculumVersion,
  saveStudyLevel,
  fetchStudyLevels,
  fetchCourseOfferings
} from '../../services/academicService.ts';
import {
  getRoleLabelArabic,
  getAllowedPromotableRoles,
  promoteUserInHierarchy,
  revokeUserRoleInHierarchy,
  fetchRegisteredUsersDirectory,
  DirectoryUserCandidate,
  fetchCourseInstructors,
  saveCourseInstructor,
  deleteCourseInstructor,
  fetchBatchNotifications,
  createBatchNotification,
  deleteBatchNotification
} from '../../services/batchGovernanceService.ts';
import {
  uploadFileToCloudFirestore,
  saveEducationalResource
} from '../../services/resourceService.ts';

interface HierarchyGovernanceConsoleProps {
  callerUid: string;
  callerEmail: string;
  callerNameArabic: string;
  callerRole: UserRole;
  callerUniversityId?: string;
  callerStudyLevelId?: string;
  callerCourseId?: string;
  initialSubTab?: 'promotions' | 'instructors' | 'notifications';
  onRolesUpdated?: () => void;
}

export default function HierarchyGovernanceConsole({
  callerUid,
  callerEmail,
  callerNameArabic,
  callerRole,
  callerUniversityId,
  callerStudyLevelId,
  initialSubTab = 'promotions',
  onRolesUpdated
}: HierarchyGovernanceConsoleProps) {
  const canPromoteUsers =
    callerRole === 'platform_owner' ||
    callerRole === 'university_admin' ||
    callerRole === 'batch_rep';

  const [subTab, setSubTab] = useState<'promotions' | 'instructors' | 'notifications'>(
    canPromoteUsers ? initialSubTab : 'instructors'
  );

  // Scoped Academic Context
  const [universities, setUniversities] = useState<University[]>([]);
  const [selectedUnivId, setSelectedUnivId] = useState<string>(
    callerRole === 'platform_owner'
      ? callerUniversityId || 'univ-dar-al-salam'
      : callerUniversityId || 'univ-dar-al-salam'
  );
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>(DAR_AL_SALAM_SEED.studyLevels);
  const [selectedLevelId, setSelectedLevelId] = useState<string>(
    callerRole === 'batch_rep' || callerRole === 'department_head'
      ? callerStudyLevelId || 'lvl-4'
      : callerStudyLevelId || 'lvl-4'
  );
  const [courses, setCourses] = useState<CourseOffering[]>([]);

  // Directory & Assigned Roles State
  const [assignedRoles, setAssignedRoles] = useState<UserRoleDoc[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUserCandidate[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Quick Add New University Modal (Platform Owner)
  const [showNewUnivModal, setShowNewUnivModal] = useState<boolean>(false);
  const [newUnivNameAr, setNewUnivNameAr] = useState<string>('');
  const [newUnivNameEn, setNewUnivNameEn] = useState<string>('');
  const [newUnivCityAr, setNewUnivCityAr] = useState<string>('صنعاء');
  const [newUnivType, setNewUnivType] = useState<'public' | 'private'>('private');

  // Role Promotion Form State
  const allowedRoles = getAllowedPromotableRoles(callerRole);
  const [targetRole, setTargetRole] = useState<UserRole>(
    allowedRoles[0]?.role || 'department_head'
  );
  const [targetUid, setTargetUid] = useState<string>('');
  const [targetEmail, setTargetEmail] = useState<string>('');
  const [targetNameAr, setTargetNameAr] = useState<string>('');
  const [targetPhone, setTargetPhone] = useState<string>('');
  const [targetAcadNum, setTargetAcadNum] = useState<string>('');
  const [targetCourseId, setTargetCourseId] = useState<string>('');
  const [targetDeptTitle, setTargetDeptTitle] = useState<string>('');

  // Course Instructors State
  const [instructors, setInstructors] = useState<CourseInstructor[]>([]);
  const [editingInstructor, setEditingInstructor] = useState<CourseInstructor | null>(null);
  const [instNameAr, setInstNameAr] = useState<string>('');
  const [instTitle, setInstTitle] = useState<string>('د.');
  const [instTeachingType, setInstTeachingType] = useState<TeachingType>('theoretical');
  const [instCourseId, setInstCourseId] = useState<string>('');
  const [instSpec, setInstSpec] = useState<string>('');
  const [instContact, setInstContact] = useState<string>('');
  const [instOfficeHours, setInstOfficeHours] = useState<string>('');

  // Batch Notifications & Quick Data Share State
  const [notifications, setNotifications] = useState<BatchNotification[]>([]);
  const [notifTitle, setNotifTitle] = useState<string>('');
  const [notifMessage, setNotifMessage] = useState<string>('');
  const [notifCategory, setNotifCategory] = useState<NotificationCategory>('lecture');
  const [notifPinned, setNotifPinned] = useState<boolean>(false);
  const [notifCourseId, setNotifCourseId] = useState<string>('');
  const [notifAttachmentUrl, setNotifAttachmentUrl] = useState<string>('');
  const [notifAttachmentType, setNotifAttachmentType] = useState<ResourceType>('pdf');
  const [notifAttachmentLabel, setNotifAttachmentLabel] = useState<string>('');
  const [alsoPublishToLibrary, setAlsoPublishToLibrary] = useState<boolean>(true);
  const [uploadingAttachment, setUploadingAttachment] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (allowedRoles.length > 0 && !allowedRoles.some(r => r.role === targetRole)) {
      setTargetRole(allowedRoles[0].role);
    }
  }, [callerRole]);

  // Enforce University & Batch Locking for non-Platform Owners
  const effectiveUnivId =
    callerRole === 'platform_owner'
      ? selectedUnivId
      : callerUniversityId || 'univ-dar-al-salam';

  const effectiveLevelId =
    callerRole === 'batch_rep' || callerRole === 'department_head'
      ? callerStudyLevelId || 'lvl-4'
      : selectedLevelId;

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [allUnivs, allLvls, allCrs, allRoles, dirUsers, instList, notifList] = await Promise.all([
        fetchUniversities(),
        fetchStudyLevels(),
        fetchCourseOfferings(),
        fetchAllUserRoles(),
        fetchRegisteredUsersDirectory({
          universityId: callerRole === 'platform_owner' ? undefined : effectiveUnivId,
          studyLevelId:
            callerRole === 'batch_rep' || callerRole === 'department_head'
              ? effectiveLevelId
              : undefined
        }),
        fetchCourseInstructors({
          universityId: effectiveUnivId,
          studyLevelId: effectiveLevelId
        }),
        fetchBatchNotifications({
          universityId: effectiveUnivId,
          studyLevelId: effectiveLevelId
        })
      ]);

      // Filter universities visible to caller
      const scopedUnivs =
        callerRole === 'platform_owner'
          ? allUnivs
          : allUnivs.filter(u => u.id === effectiveUnivId);
      setUniversities(scopedUnivs.length > 0 ? scopedUnivs : allUnivs);

      // Filter levels for selected university
      const univLevels = allLvls.filter(l => !l.universityId || l.universityId === effectiveUnivId);
      const finalLevels = univLevels.length > 0 ? univLevels : DAR_AL_SALAM_SEED.studyLevels;
      setStudyLevels(finalLevels);

      // Filter courses for selected university and level
      const levelCourses = allCrs.filter(
        c =>
          (!c.universityId || c.universityId === effectiveUnivId) &&
          (!c.studyLevelId || c.studyLevelId === effectiveLevelId)
      );
      setCourses(levelCourses);
      if (levelCourses.length > 0 && !instCourseId) {
        setInstCourseId(levelCourses[0].id);
      }

      // Filter roles visible to caller
      const scopedRoles = allRoles.filter(r => {
        if (callerRole === 'platform_owner') return true;
        if (callerRole === 'university_admin') {
          return r.assignedUniversityId === effectiveUnivId;
        }
        if (callerRole === 'batch_rep' || callerRole === 'department_head') {
          return (
            r.assignedUniversityId === effectiveUnivId &&
            r.assignedStudyLevelId === effectiveLevelId
          );
        }
        return false;
      });

      setAssignedRoles(scopedRoles);
      setDirectoryUsers(dirUsers);
      setInstructors(instList);
      setNotifications(notifList);
    } catch (e: any) {
      console.warn('HierarchyGovernanceConsole load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [effectiveUnivId, effectiveLevelId, callerRole]);

  // Create a new independent University with its default College, Program, Curriculum, and 8 Levels
  const handleCreateNewUniversity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnivNameAr.trim()) return;
    setStatusMsg(null);
    try {
      const slug = `univ-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      const newUniv: University = {
        id: slug,
        countryId: 'YE',
        nameArabic: newUnivNameAr.trim(),
        nameEnglish: newUnivNameEn.trim() || newUnivNameAr.trim(),
        type: newUnivType,
        cityArabic: newUnivCityAr.trim() || 'صنعاء',
        enrollmentPolicy: 'approval_required',
        isActive: true,
        createdAt: now,
        updatedAt: now
      };
      await saveUniversity(newUniv);

      const colId = `col-med-${slug}`;
      await saveCollege({
        id: colId,
        universityId: slug,
        nameArabic: 'كلية الطب البشري',
        nameEnglish: 'College of Human Medicine',
        code: 'MED',
        isActive: true,
        createdAt: now
      });

      const progId = `prog-mbbs-${slug}`;
      await saveProgram({
        id: progId,
        collegeId: colId,
        universityId: slug,
        nameArabic: 'بكالوريوس الطب والجراحة العامة (MBBS)',
        nameEnglish: 'Bachelor of Medicine and Bachelor of Surgery',
        degree: 'bachelor',
        studySystem: 'block',
        totalRegularLevels: 7,
        hasInternship: true,
        internshipDurationMonths: 12,
        isActive: true,
        createdAt: now
      });

      const curId = `cur-2025-${slug}`;
      await saveCurriculumVersion({
        id: curId,
        programId: progId,
        universityId: slug,
        versionName: '2025-BLOCKS',
        isCurrent: true,
        effectiveFrom: '2025-01-01',
        createdAt: now
      });

      // Provision standard 7 levels + internship for the new university
      for (const baseLvl of DAR_AL_SALAM_SEED.studyLevels) {
        await saveStudyLevel({
          ...baseLvl,
          id: `${baseLvl.id}-${slug}`,
          curriculumVersionId: curId,
          programId: progId,
          universityId: slug
        });
      }

      setUniversities(prev => [...prev, newUniv]);
      setSelectedUnivId(newUniv.id);
      setNewUnivNameAr('');
      setNewUnivNameEn('');
      setShowNewUnivModal(false);
      setStatusMsg({
        type: 'success',
        text: `تم إنشاء "${newUniv.nameArabic}" كجامعة مستقلة بالكامل مع مستوياتها الدراسية. يمكنك الآن تعيين مالك الجامعة لها.`
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل إنشاء الجامعة الجديدة' });
    }
  };

  const handleSelectCandidateForPromotion = (u: DirectoryUserCandidate) => {
    setTargetUid(u.uid);
    setTargetEmail(u.email || `${u.uid}@umed.edu.ye`);
    setTargetNameAr(u.displayNameArabic || '');
    setTargetPhone(u.phone || '');
    setTargetAcadNum(u.academicStudentNumber || '');
    if (u.universityId && callerRole === 'platform_owner') {
      setSelectedUnivId(u.universityId);
    }
    if (u.studyLevelId && callerRole !== 'batch_rep') {
      setSelectedLevelId(u.studyLevelId);
    }
    setStatusMsg({
      type: 'success',
      text: `تم اختيار "${u.displayNameArabic}" — اختر الرتبة واضغط على زر الترقية الآن.`
    });
  };

  const handlePromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const finalUid = targetUid.trim() || `user-${Date.now().toString(36)}`;
    const finalEmail = targetEmail.trim() || `${finalUid}@umed.edu.ye`;

    if (!targetEmail.trim() && !targetPhone.trim() && !targetUid.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'يرجى اختيار طالب/مستخدم من القائمة أو إدخال البريد الإلكتروني أو رقم الهاتف أو المعرف (UID).'
      });
      return;
    }

    try {
      const assignedDoc = await promoteUserInHierarchy({
        callerUid,
        callerEmail,
        callerRole,
        callerUniversityId: effectiveUnivId,
        callerStudyLevelId: effectiveLevelId,
        targetUid: finalUid,
        targetEmail: finalEmail,
        targetDisplayNameArabic: targetNameAr.trim() || undefined,
        targetPhone: targetPhone.trim() || undefined,
        targetAcademicStudentNumber: targetAcadNum.trim() || undefined,
        newRole: targetRole,
        assignedUniversityId: effectiveUnivId,
        assignedStudyLevelId:
          targetRole === 'batch_rep' || targetRole === 'department_head'
            ? effectiveLevelId
            : undefined,
        assignedCourseId: targetRole === 'department_head' ? targetCourseId || undefined : undefined,
        departmentTitle: targetRole === 'department_head' ? targetDeptTitle.trim() || undefined : undefined
      });

      setStatusMsg({
        type: 'success',
        text: `تمت ترقية "${assignedDoc.displayNameArabic || assignedDoc.email}" إلى رتبة (${getRoleLabelArabic(assignedDoc.role)}) بنجاح ✓`
      });
      setTargetUid('');
      setTargetEmail('');
      setTargetNameAr('');
      setTargetPhone('');
      setTargetAcadNum('');
      setTargetDeptTitle('');
      await loadAllData();
      onRolesUpdated?.();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'تعذر تنفيذ الترقية' });
    }
  };

  const handleRevokeRole = async (rDoc: UserRoleDoc) => {
    setStatusMsg(null);
    try {
      await revokeUserRoleInHierarchy({
        callerUid,
        callerEmail,
        callerRole,
        callerUniversityId: effectiveUnivId,
        callerStudyLevelId: effectiveLevelId,
        targetRoleDoc: rDoc
      });
      setStatusMsg({
        type: 'success',
        text: `تم إلغاء صلاحية "${rDoc.displayNameArabic || rDoc.email}" وإعادته إلى وضع الطالب العادي.`
      });
      await loadAllData();
      onRolesUpdated?.();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'تعذر إلغاء الصلاحية' });
    }
  };

  const handleSaveInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instNameAr.trim()) return;
    setStatusMsg(null);

    const selectedCourseObj = courses.find(c => c.id === instCourseId);
    const now = new Date().toISOString();

    const instObj: CourseInstructor = {
      id: editingInstructor?.id || `inst-${Date.now().toString(36)}`,
      universityId: effectiveUnivId,
      studyLevelId: effectiveLevelId,
      courseOfferingId: instCourseId || 'general',
      courseTitleArabic: selectedCourseObj?.titleArabic || 'مقرر عام بالدفعة',
      instructorNameArabic: instNameAr.trim(),
      academicTitle: instTitle,
      teachingType: instTeachingType,
      specialization: instSpec.trim() || undefined,
      contactInfo: instContact.trim() || undefined,
      officeHours: instOfficeHours.trim() || undefined,
      createdBy: callerEmail || callerUid,
      createdAt: editingInstructor?.createdAt || now,
      updatedAt: now
    };

    try {
      await saveCourseInstructor(instObj, callerEmail || callerUid);
      setStatusMsg({
        type: 'success',
        text: editingInstructor
          ? `تم تحديث بيانات ${instObj.academicTitle} ${instObj.instructorNameArabic} بنجاح ✓`
          : `تمت إضافة ${instObj.academicTitle} ${instObj.instructorNameArabic} (${
              instObj.teachingType === 'theoretical'
                ? 'دكتور مادة نظرية'
                : instObj.teachingType === 'practical'
                ? 'دكتور مادة عملية'
                : 'نظري وعملي'
            }) بنجاح ✓`
      });
      setEditingInstructor(null);
      setInstNameAr('');
      setInstSpec('');
      setInstContact('');
      setInstOfficeHours('');
      await loadAllData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل حفظ بيانات الدكتور' });
    }
  };

  const handleDeleteInstructor = async (id: string) => {
    setStatusMsg(null);
    try {
      await deleteCourseInstructor(id, callerEmail || callerUid, effectiveUnivId);
      setInstructors(prev => prev.filter(i => i.id !== id));
      setStatusMsg({ type: 'success', text: 'تم حذف سجل الدكتور من الدفعة بنجاح' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل الحذف' });
    }
  };

  const handleUploadNotificationFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAttachment(true);
    setUploadProgress(5);
    setStatusMsg(null);

    let detectedType: ResourceType = 'pdf';
    const lower = file.name.toLowerCase();
    if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/.test(lower)) {
      detectedType = 'image';
    } else if (file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/.test(lower)) {
      detectedType = 'video';
    } else if (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac)$/.test(lower)) {
      detectedType = 'audio';
    } else if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
      detectedType = 'pdf';
    }

    try {
      const uploaded = await uploadFileToCloudFirestore(file, file.name, (pct) => {
        setUploadProgress(pct);
      });
      setNotifAttachmentUrl(uploaded.url);
      setNotifAttachmentType(detectedType);
      setNotifAttachmentLabel(`${file.name} (${uploaded.fileSizeLabel})`);
      if (!notifTitle.trim()) {
        setNotifTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setStatusMsg({
        type: 'success',
        text: `تم رفع الملف (${file.name}) بنجاح وجاهز للإرسال للدفعة ✓`
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'تعذر رفع الملف' });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    setStatusMsg(null);

    try {
      const created = await createBatchNotification({
        universityId: effectiveUnivId,
        studyLevelId: effectiveLevelId,
        courseOfferingId: notifCourseId || undefined,
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        category: notifCategory,
        attachmentUrl: notifAttachmentUrl.trim() || undefined,
        attachmentType: notifAttachmentUrl.trim() ? notifAttachmentType : undefined,
        attachmentLabel: notifAttachmentLabel.trim() || undefined,
        authorUid: callerUid,
        authorNameArabic: callerNameArabic || callerEmail,
        authorRole: callerRole,
        isPinned: notifPinned
      });

      // If an attachment or link was included and user checked "alsoPublishToLibrary", automatically add to batch's Educational Resources!
      if (notifAttachmentUrl.trim() && alsoPublishToLibrary) {
        const now = new Date().toISOString();
        await saveEducationalResource({
          id: `res-${Date.now().toString(36)}`,
          title: notifTitle.trim(),
          description: notifMessage.trim(),
          resourceType: notifAttachmentType,
          url: notifAttachmentUrl.trim(),
          fileSizeLabel: notifAttachmentLabel || 'ملف دفعة',
          storageProvider: notifAttachmentUrl.startsWith('umed-cloud://')
            ? 'firestore_cloud'
            : 'external_url',
          universityId: effectiveUnivId,
          programId: 'prog-mbbs',
          curriculumVersionId: 'cur-dar-2024',
          studyLevelId: effectiveLevelId,
          courseOfferingId: notifCourseId || undefined,
          sectionType: notifCategory === 'practical' ? 'practical' : 'theoretical',
          status: 'published',
          createdBy: callerEmail || callerUid,
          createdAt: now,
          updatedAt: now
        });
      }

      setNotifications(prev => [created, ...prev]);
      setNotifTitle('');
      setNotifMessage('');
      setNotifAttachmentUrl('');
      setNotifAttachmentLabel('');
      setNotifPinned(false);
      setStatusMsg({
        type: 'success',
        text: 'تم نشر الإشعار ومشاركة الداتا لطلاب الدفعة بنجاح ✓'
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل إرسال الإشعار' });
    }
  };

  const currentUniversityObj = universities.find(u => u.id === effectiveUnivId);
  const currentLevelObj = studyLevels.find(l => l.id === effectiveLevelId);

  const filteredDirectoryUsers = directoryUsers.filter(u => {
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    return (
      u.displayNameArabic?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q) ||
      u.academicStudentNumber?.toLowerCase().includes(q) ||
      u.uid.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Scope & Hierarchy Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-teal-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>نظام الحوكمة الهرمية وعزل الجامعات والدفعات</span>
              <span>·</span>
              <span>صلاحيتك الحالية: {getRoleLabelArabic(callerRole)}</span>
            </div>
            <h2 className="text-lg font-bold text-white">
              إدارة الترقيات، دكاترة المواد (النظري والعملي)، وإشعارات وداتا الدفعة
            </h2>
            <p className="text-xs text-slate-400">
              كل جامعة معزولة تماماً عن الجامعات الأخرى، ولا يظهر لأي طالب إلا بيانات جامعته ودفعته المعتمدة.
            </p>
          </div>

          <button
            onClick={loadAllData}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث البيانات</span>
          </button>
        </div>

        {/* Active Scope Selector Bar (Platform Owner chooses any Univ & Level; Univ Owner chooses Level; Batch Rep is locked to their Batch) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-400 font-semibold flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-teal-400" />
                <span>الجامعة النشطة (نطاق العزل المؤسسي):</span>
              </label>
              {callerRole === 'platform_owner' && (
                <button
                  type="button"
                  onClick={() => setShowNewUnivModal(true)}
                  className="text-[11px] text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>إضافة جامعة مستقلة جديدة</span>
                </button>
              )}
            </div>
            {callerRole === 'platform_owner' ? (
              <select
                value={selectedUnivId}
                onChange={(e) => setSelectedUnivId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-semibold"
              >
                {universities.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nameArabic} ({u.cityArabic})
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-teal-300 font-bold flex items-center justify-between">
                <span>{currentUniversityObj?.nameArabic || effectiveUnivId}</span>
                <span className="text-[10px] text-slate-400 font-normal">معزولة ومرتبطة بحسابك</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>الدفعة / المستوى الدراسي النشط:</span>
            </label>
            {callerRole === 'platform_owner' || callerRole === 'university_admin' ? (
              <select
                value={selectedLevelId}
                onChange={(e) => setSelectedLevelId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-semibold"
              >
                {studyLevels.map(lvl => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.titleArabic} ({lvl.titleEnglish})
                  </option>
                ))}
              </select>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-amber-300 font-bold flex items-center justify-between">
                <span>{currentLevelObj?.titleArabic || effectiveLevelId}</span>
                <span className="text-[10px] text-slate-400 font-normal">دفعتك المخصصة</span>
              </div>
            )}
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap gap-2 pt-1">
          {canPromoteUsers && (
            <button
              type="button"
              onClick={() => setSubTab('promotions')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                subTab === 'promotions'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Crown className="w-4 h-4" />
              <span>
                {callerRole === 'platform_owner'
                  ? 'ترقية مُلاك الجامعات ومناديب الدفعات ورؤساء الأقسام'
                  : callerRole === 'university_admin'
                  ? 'ترقية مناديب الدفعات والمستويات ورؤساء الأقسام'
                  : 'ترقية رؤساء الأقسام والمواد في الدفعة'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSubTab('instructors')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
              subTab === 'instructors'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>دكاترة المواد النظرية والعملية ({instructors.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('notifications')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
              subTab === 'notifications'
                ? 'bg-teal-600 text-white'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>مشاركة إشعارات وداتا الدفعة ({notifications.length})</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
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

      {/* =====================================================================
          SUB-TAB 1: HIERARCHICAL ROLE PROMOTION & DELEGATION
         ===================================================================== */}
      {subTab === 'promotions' && canPromoteUsers && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Promotion Form Column */}
          <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <UserCheck className="w-4 h-4 text-teal-400" />
              <span>
                {callerRole === 'platform_owner'
                  ? 'إضافة وترقية مالك جامعة / مندوب دفعة / رئيس قسم'
                  : callerRole === 'university_admin'
                  ? 'ترقية مندوب دفعة أو مستوى / رئيس قسم'
                  : 'ترقية رئيس قسم أو مادة دراسية في الدفعة'}
              </span>
            </h3>

            <form onSubmit={handlePromoteSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">الرتبة الإدارية المراد الترقية إليها:</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold"
                >
                  {allowedRoles.map(item => (
                    <option key={item.role} value={item.role}>
                      {item.labelArabic}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  {allowedRoles.find(r => r.role === targetRole)?.descriptionArabic}
                </p>
              </div>

              {targetRole === 'department_head' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">المسمى / القسم العلمي:</label>
                    <input
                      type="text"
                      value={targetDeptTitle}
                      onChange={(e) => setTargetDeptTitle(e.target.value)}
                      placeholder="مثال: رئيس قسم التشريح / الباطنة"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">المادة المرتبطة (اختياري):</label>
                    <select
                      value={targetCourseId}
                      onChange={(e) => setTargetCourseId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="">كافة مواد الدفعة</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.titleArabic} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">الاسم الرباعي بالعربية:</label>
                <input
                  type="text"
                  required
                  value={targetNameAr}
                  onChange={(e) => setTargetNameAr(e.target.value)}
                  placeholder="مثال: د. أحمد محمد يحيى الشامي"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">البريد الإلكتروني:</label>
                  <input
                    type="text"
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">رقم الهاتف اليمني:</label>
                  <input
                    type="text"
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    placeholder="+967771234567"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">معرف الحساب (UID):</label>
                  <input
                    type="text"
                    value={targetUid}
                    onChange={(e) => setTargetUid(e.target.value)}
                    placeholder="يُملأ تلقائياً عند اختيار طالب"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px]"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">رقم القيد (اختياري):</label>
                  <input
                    type="text"
                    value={targetAcadNum}
                    onChange={(e) => setTargetAcadNum(e.target.value)}
                    placeholder="MED-2025-101"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px]"
                    dir="ltr"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
              >
                <Crown className="w-4 h-4" />
                <span>اعتماد الترقية وحفظ الصلاحية في السحابة</span>
              </button>
            </form>
          </div>

          {/* Directory Picker & Active Promoted Leaders Column */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. Registered Students/Users Picker */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-400" />
                  <span>دليل المستخدمين والطلاب المسجلين (اضغط لاختيار وترقية أي حساب)</span>
                </h3>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="ابحث بالاسم أو الهاتف أو القيد..."
                    className="w-full pr-8 pl-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>
              </div>

              {filteredDirectoryUsers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                  لا توجد حسابات مطابقة للبحث في هذا النطاق حالياً — يمكنك كتابة بيانات المستخدم مباشرة في نموذج الترقية.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-950">
                  {filteredDirectoryUsers.map(u => (
                    <div
                      key={u.uid}
                      className="p-3 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-900/80 transition-colors text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-white">{u.displayNameArabic}</div>
                        <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 font-mono">
                          {u.phone && <span>{u.phone}</span>}
                          {u.email && !u.email.startsWith('phone_') && <span>· {u.email}</span>}
                          {u.academicStudentNumber && (
                            <span className="text-teal-400">· قيد: {u.academicStudentNumber}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectCandidateForPromotion(u)}
                        className="px-3 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/30 font-semibold text-[11px] transition-colors"
                      >
                        اختيار للترقية
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Currently Promoted Leaders Table */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span>قائمة القيادات والصلاحيات المعتمدة ({assignedRoles.length})</span>
              </h3>

              {assignedRoles.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                  لم يتم تعيين أي صلاحيات في هذا النطاق بعد.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                        <th className="p-2.5">الاسم / المعرف</th>
                        <th className="p-2.5">الرتبة الإدارية</th>
                        <th className="p-2.5">نطاق العزل (الجامعة / الدفعة)</th>
                        <th className="p-2.5">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {assignedRoles.map((r) => {
                        const univName =
                          universities.find(u => u.id === r.assignedUniversityId)?.nameArabic ||
                          r.assignedUniversityId ||
                          'كافة الجامعات';
                        const lvlName =
                          studyLevels.find(l => l.id === r.assignedStudyLevelId)?.titleArabic ||
                          r.assignedStudyLevelId ||
                          'كافة المستويات';
                        return (
                          <tr key={r.uid} className="hover:bg-slate-800/30">
                            <td className="p-2.5">
                              <div className="font-bold text-white">
                                {r.displayNameArabic || r.email}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                                {r.phone || r.email}
                              </div>
                            </td>
                            <td className="p-2.5">
                              <span className="font-semibold text-teal-300">
                                {getRoleLabelArabic(r.role)}
                              </span>
                              {r.departmentTitle && (
                                <div className="text-[11px] text-amber-300 mt-0.5">
                                  {r.departmentTitle}
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-slate-300">
                              <div>{univName}</div>
                              {r.assignedStudyLevelId && (
                                <div className="text-[11px] text-slate-400">{lvlName}</div>
                              )}
                            </td>
                            <td className="p-2.5">
                              {r.role !== 'platform_owner' && (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeRole(r)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-[11px] font-semibold"
                                >
                                  إلغاء الترقية
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: THEORETICAL & PRACTICAL SUBJECT DOCTORS MANAGER
         ===================================================================== */}
      {subTab === 'instructors' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add/Edit Doctor Form */}
          <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Stethoscope className="w-4 h-4 text-teal-400" />
              <span>
                {editingInstructor
                  ? 'تعديل بيانات دكتور المادة'
                  : 'إضافة دكتور مادة نظرية أو عملية للدفعة'}
              </span>
            </h3>

            <form onSubmit={handleSaveInstructor} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">اللقب العلمي:</label>
                  <select
                    value={instTitle}
                    onChange={(e) => setInstTitle(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="أ.د.">أ.د. (أستاذ دكتور)</option>
                    <option value="أ.م.د.">أ.م.د. (أستاذ مشارك)</option>
                    <option value="د.">د. (دكتور / أستاذ مساعد)</option>
                    <option value="معيد / مشرف عملي">معيد / مشرف عملي</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-300 mb-1 font-semibold">اسم الدكتور الثلاثي/الرباعي:</label>
                  <input
                    type="text"
                    required
                    value={instNameAr}
                    onChange={(e) => setInstNameAr(e.target.value)}
                    placeholder="مثال: عبدالرحمن محمد الشامي"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">نوع التدريس (مادة نظرية أو عملية):</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'theoretical', label: 'دكتور مادة نظرية' },
                    { id: 'practical', label: 'دكتور مادة عملية' },
                    { id: 'both', label: 'نظري + عملي معاً' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setInstTeachingType(opt.id as TeachingType)}
                      className={`py-2 px-2 rounded-xl font-bold text-[11px] border transition-colors ${
                        instTeachingType === opt.id
                          ? 'bg-teal-600 text-white border-teal-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">المادة الدراسية في هذه الدفعة:</label>
                <select
                  value={instCourseId}
                  onChange={(e) => setInstCourseId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="general">مقرر عام للدفعة</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.titleArabic} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">التخصص الدقيق / القسم العلمي:</label>
                <input
                  type="text"
                  value={instSpec}
                  onChange={(e) => setInstSpec(e.target.value)}
                  placeholder="مثال: استشاري أمراض القلب والقسطرة / التشريح السريري"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">مواعيد المحاضرات / الساعات المكتبية:</label>
                  <input
                    type="text"
                    value={instOfficeHours}
                    onChange={(e) => setInstOfficeHours(e.target.value)}
                    placeholder="مثال: الأحد والثلاثاء 9:00 ص"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">القاعة / المعمل / جهة التواصل:</label>
                  <input
                    type="text"
                    value={instContact}
                    onChange={(e) => setInstContact(e.target.value)}
                    placeholder="قاعة ابن سينا / معمل التشريح"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{editingInstructor ? 'حفظ التعديلات' : 'إضافة الدكتور للدفعة'}</span>
                </button>
                {editingInstructor && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingInstructor(null);
                      setInstNameAr('');
                      setInstSpec('');
                      setInstContact('');
                      setInstOfficeHours('');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Doctors List for Active Batch */}
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between border-b border-slate-800 pb-3">
              <span>قائمة دكاترة المواد النظرية والعملية للدفعة الحالية ({instructors.length})</span>
              <span className="text-xs text-teal-400 font-normal">
                {currentLevelObj?.titleArabic}
              </span>
            </h3>

            {instructors.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                لم يتم إضافة دكاترة لهذه الدفعة بعد. استخدم النموذج الجانبي لإضافة دكتور مادة نظرية أو عملية.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {instructors.map((inst) => (
                  <div
                    key={inst.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-white text-sm">
                          {inst.academicTitle} {inst.instructorNameArabic}
                        </div>
                        <span className="text-[11px] font-semibold text-teal-300 shrink-0">
                          {inst.teachingType === 'theoretical'
                            ? 'مادة نظرية'
                            : inst.teachingType === 'practical'
                            ? 'مادة عملية / معمل'
                            : 'نظري وعملي'}
                        </span>
                      </div>

                      <div className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 shrink-0" />
                        <span>{inst.courseTitleArabic || 'مقرر الدفعة'}</span>
                      </div>

                      {inst.specialization && (
                        <p className="text-[11px] text-slate-400">{inst.specialization}</p>
                      )}

                      <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-900">
                        {inst.officeHours && <div>المواعيد: {inst.officeHours}</div>}
                        {inst.contactInfo && <div>المكان / القاعة: {inst.contactInfo}</div>}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-900">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingInstructor(inst);
                          setInstNameAr(inst.instructorNameArabic);
                          setInstTitle(inst.academicTitle);
                          setInstTeachingType(inst.teachingType);
                          setInstCourseId(inst.courseOfferingId);
                          setInstSpec(inst.specialization || '');
                          setInstContact(inst.contactInfo || '');
                          setInstOfficeHours(inst.officeHours || '');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>تعديل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteInstructor(inst.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900 text-rose-300 text-[11px] flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: BATCH NOTIFICATIONS & INSTANT DATA BROADCAST
         ===================================================================== */}
      {subTab === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Create Notification & Attach Data Form */}
          <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Bell className="w-4 h-4 text-amber-400" />
              <span>إرسال إشعار للدفعة ومشاركة داتا (صور / فيديو / ملفات / روابط)</span>
            </h3>

            <form onSubmit={handleBroadcastNotification} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">تصنيف الإشعار:</label>
                  <select
                    value={notifCategory}
                    onChange={(e) => setNotifCategory(e.target.value as NotificationCategory)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="lecture">موعد / ملخص محاضرة</option>
                    <option value="data_shared">مشاركة داتا وملفات جديدة</option>
                    <option value="practical">تدريب عملي / معمل</option>
                    <option value="exam">تنبيه اختبار أو مسابقة</option>
                    <option value="urgent">إشعار عاجل للدفعة</option>
                    <option value="general">إعلان عام للدفعة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المادة المرتبطة:</label>
                  <select
                    value={notifCourseId}
                    onChange={(e) => setNotifCourseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="">إعلان عام لكامل الدفعة</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.titleArabic}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان الإشعار أو الداتا المرسلة:</label>
                <input
                  type="text"
                  required
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="مثال: تم رفع سلايدات وفيديو محاضرة القلب + موعد العملي"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">تفاصيل الإشعار لطلاب الدفعة:</label>
                <textarea
                  rows={3}
                  required
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  placeholder="اكتب تفاصيل الإشعار أو التوجيهات لزملائك في الدفعة..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              {/* Attach File (PDF, Image, Video, Audio) or Direct Link */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-teal-400">إرفاق داتا مع الإشعار (صورة / فيديو / ملف PDF / صوت / رابط):</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/*,video/*,audio/*"
                    onChange={handleUploadNotificationFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingAttachment}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-[11px] flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{uploadingAttachment ? `جارٍ الرفع ${uploadProgress}%` : 'رفع ملف من جهازك'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1 text-[11px]">نوع المرفق:</label>
                    <select
                      value={notifAttachmentType}
                      onChange={(e) => setNotifAttachmentType(e.target.value as ResourceType)}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-[11px]"
                    >
                      <option value="pdf">ملف PDF</option>
                      <option value="image">صورة / شريحة</option>
                      <option value="video">ملف فيديو</option>
                      <option value="video_link">رابط فيديو</option>
                      <option value="audio">تسجيل صوتي</option>
                      <option value="link">رابط خارجي</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-400 mb-1 text-[11px]">رابط المرفق أو معرف الملف السحابي:</label>
                    <input
                      type="text"
                      value={notifAttachmentUrl}
                      onChange={(e) => setNotifAttachmentUrl(e.target.value)}
                      placeholder="https://... أو ارفع ملفاً من الزر أعلاه"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-[11px]"
                      dir="ltr"
                    />
                  </div>
                </div>

                {notifAttachmentUrl && (
                  <label className="flex items-center gap-2 text-[11px] text-emerald-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={alsoPublishToLibrary}
                      onChange={(e) => setAlsoPublishToLibrary(e.target.checked)}
                      className="rounded border-slate-700"
                    />
                    <span>إضافة هذا المرفق تلقائياً إلى المكتبة الطبية للدفعة أيضاً</span>
                  </label>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifPinned}
                  onChange={(e) => setNotifPinned(e.target.checked)}
                  className="rounded border-slate-700"
                />
                <span>تثبيت هذا الإشعار في أعلى لوحة طلاب الدفعة</span>
              </label>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
              >
                <Bell className="w-4 h-4" />
                <span>نشر الإشعار وإرسال الداتا لطلاب الدفعة الآن</span>
              </button>
            </form>
          </div>

          {/* Active Batch Notifications Feed */}
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between border-b border-slate-800 pb-3">
              <span>سجل إشعارات وداتا الدفعة المنشورة ({notifications.length})</span>
              <span className="text-xs text-amber-400 font-normal">
                {currentLevelObj?.titleArabic}
              </span>
            </h3>

            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                لا توجد إشعارات منشورة لهذه الدفعة حالياً.
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-bold text-white text-sm">{n.title}</span>
                        {n.isPinned && (
                          <span className="text-[11px] text-amber-300 font-semibold">· مثبت</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteBatchNotification(n.id);
                          setNotifications(prev => prev.filter(item => item.id !== n.id));
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="حذف الإشعار"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                      {n.message}
                    </p>

                    {n.attachmentUrl && (
                      <div className="pt-1">
                        <a
                          href={n.attachmentUrl.startsWith('umed-cloud://') ? '#library' : n.attachmentUrl}
                          target={n.attachmentUrl.startsWith('umed-cloud://') ? undefined : '_blank'}
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-teal-300 hover:text-teal-200 font-semibold bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800"
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                          <span>{n.attachmentLabel || 'فتح المرفق / الرابط المرسل'}</span>
                        </a>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-900">
                      <span>
                        بواسطة: {n.authorNameArabic} ({getRoleLabelArabic(n.authorRole)})
                      </span>
                      <span className="font-mono">
                        {new Date(n.createdAt).toLocaleDateString('ar-YE')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Quick Add Independent University (Platform Owner) */}
      {showNewUnivModal && callerRole === 'platform_owner' && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain">
          <div className="max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">إضافة جامعة يمنية مستقلة جديدة</h3>
            <p className="text-xs text-slate-400">
              سيتم إنشاء هيكل أكاديمي ومستويات دراسية مستقلة تماماً لهذه الجامعة بحيث تكون معزولة عن بقية الجامعات.
            </p>
            <form onSubmit={handleCreateNewUniversity} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الجامعة بالعربية:</label>
                <input
                  type="text"
                  required
                  value={newUnivNameAr}
                  onChange={(e) => setNewUnivNameAr(e.target.value)}
                  placeholder="مثال: جامعة صنعاء / جامعة العلوم والتكنولوجيا"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الجامعة بالإنجليزية:</label>
                <input
                  type="text"
                  value={newUnivNameEn}
                  onChange={(e) => setNewUnivNameEn(e.target.value)}
                  placeholder="Sana'a University"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  dir="ltr"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المدينة:</label>
                  <input
                    type="text"
                    value={newUnivCityAr}
                    onChange={(e) => setNewUnivCityAr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">نوع الجامعة:</label>
                  <select
                    value={newUnivType}
                    onChange={(e) => setNewUnivType(e.target.value as 'public' | 'private')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="public">حكومية</option>
                    <option value="private">أهلية / خاصة</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold"
                >
                  إنشاء الجامعة وتفعيل عزلها
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewUnivModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300"
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
