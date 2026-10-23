/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Multi-Tier Hierarchy, Course Instructors & Batch Notifications Service
 * Enforces strict University & Batch/Level isolation and hierarchical role delegation:
 *   Platform Owner -> University Owner -> Batch/Level Rep -> Department/Subject Head -> Student
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import {
  db,
  cleanFirestoreData,
  assignUserRole,
  revokeUserRole,
  writeAuditLogToCloud
} from '../lib/firebase.ts';
import {
  UserRole,
  UserRoleDoc,
  UserProfile,
  StudentEnrollment,
  CourseInstructor,
  BatchNotification
} from '../types/umed.ts';
import { fetchEnrollmentsForAdmin } from './enrollmentService.ts';

const INSTRUCTORS_STORAGE_KEY = 'umed_course_instructors';
const INSTRUCTORS_INIT_KEY = 'umed_course_instructors_init';
const NOTIFICATIONS_STORAGE_KEY = 'umed_batch_notifications';
const NOTIFICATIONS_INIT_KEY = 'umed_batch_notifications_init';

export const DEFAULT_COURSE_INSTRUCTORS: CourseInstructor[] = [
  {
    id: 'inst-cvs-theo-1',
    universityId: 'univ-dar-al-salam',
    studyLevelId: 'lvl-4',
    studyPeriodId: 'blk-cvs',
    courseOfferingId: 'crs-anat-cvs',
    courseTitleArabic: 'تشريح الجهاز القلبي الوعائي',
    instructorNameArabic: 'عبدالرحمن محمد الشامي',
    academicTitle: 'أ.د.',
    teachingType: 'theoretical',
    specialization: 'التشريح السريري والأجنة الطبية',
    contactInfo: 'قسم العلوم الطبية الأساسية — مبنى كلية الطب',
    officeHours: 'الأحد والثلاثاء (10:00 ص - 12:30 م)',
    createdBy: 'SYSTEM_SEED',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'inst-cvs-prac-1',
    universityId: 'univ-dar-al-salam',
    studyLevelId: 'lvl-4',
    studyPeriodId: 'blk-cvs',
    courseOfferingId: 'crs-anat-cvs',
    courseTitleArabic: 'تشريح الجهاز القلبي الوعائي',
    instructorNameArabic: 'سمية علي المقطري',
    academicTitle: 'د.',
    teachingType: 'practical',
    specialization: 'مشرفة معمل التشريح والمجسمات السريرية',
    contactInfo: 'المشرحة المركزية — القاعة العملية (B2)',
    officeHours: 'الإثنين والأربعاء (09:00 ص - 01:00 م)',
    createdBy: 'SYSTEM_SEED',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  }
];

export const DEFAULT_BATCH_NOTIFICATIONS: BatchNotification[] = [
  {
    id: 'notif-dar-lvl4-1',
    universityId: 'univ-dar-al-salam',
    studyLevelId: 'lvl-4',
    courseOfferingId: 'crs-anat-cvs',
    title: 'موعد المحاضرة النظرية والعملية لبلوك القلب والأوعية الدموية (CVS-401)',
    message: 'تنويه لطلاب الدفعة (المستوى الرابع): تم رفع ملف محاضرة تشريح القلب والشرائح العملية في المكتبة الطبية، وسيكون التطبيق العملي في المشرحة يوم الإثنين القادم الساعة 9 صباحاً.',
    category: 'lecture',
    authorUid: 'SYSTEM_SEED',
    authorNameArabic: 'مندوب دفعة المستوى الرابع',
    authorRole: 'batch_rep',
    isPinned: true,
    createdAt: '2025-02-10T08:00:00Z'
  }
];

// ---------------------------------------------------------------------------
// 1. Role Hierarchy Labels & Validation Rules
// ---------------------------------------------------------------------------

export function getRoleLabelArabic(role?: UserRole): string {
  switch (role) {
    case 'platform_owner':
      return 'مالك المنصة العام (Platform Owner)';
    case 'university_admin':
      return 'مالك / مشرف الجامعة (University Owner)';
    case 'batch_rep':
      return 'مندوب الدفعة / المستوى (Batch Representative)';
    case 'department_head':
      return 'رئيس قسم أو مادة (Department / Subject Head)';
    default:
      return 'طالب طب بشري (Student)';
  }
}

export function getAllowedPromotableRoles(callerRole: UserRole): {
  role: UserRole;
  labelArabic: string;
  descriptionArabic: string;
}[] {
  if (callerRole === 'platform_owner') {
    return [
      {
        role: 'university_admin',
        labelArabic: 'مالك جامعة (University Owner)',
        descriptionArabic: 'يدير جامعته بالكامل ويرقّي مناديب الدفعات والمستويات ويعتمد القيود'
      },
      {
        role: 'batch_rep',
        labelArabic: 'مندوب دفعة أو مستوى (Batch Rep)',
        descriptionArabic: 'يرقّي رؤساء الأقسام، يضيف دكاترة النظري والعملي، ويدير بلوكات ومواد واختبارات وإشعارات وداتا دفعته'
      },
      {
        role: 'department_head',
        labelArabic: 'رئيس قسم أو مادة (Department / Subject Head)',
        descriptionArabic: 'يشرف على مادة أو قسم علمي محدد داخل الدفعة ويشارك ملفاتها وإشعاراتها'
      },
      {
        role: 'platform_owner',
        labelArabic: 'مالك منصة مشارك (Co-Platform Owner)',
        descriptionArabic: 'صلاحيات شاملة على كافة الجامعات والمستويات في المنصة'
      }
    ];
  }

  if (callerRole === 'university_admin') {
    return [
      {
        role: 'batch_rep',
        labelArabic: 'مندوب دفعة أو مستوى (Batch Representative)',
        descriptionArabic: 'صلاحية إدارة الدفعة/المستوى المحدد داخل جامعتك، ترقية رؤساء الأقسام، وإضافة الدكاترة والبلوكات والاختبارات والداتا'
      },
      {
        role: 'department_head',
        labelArabic: 'رئيس قسم أو مادة (Department / Subject Head)',
        descriptionArabic: 'صلاحية الإشراف على قسم أو مقرر دراسي محدد داخل جامعتك'
      }
    ];
  }

  if (callerRole === 'batch_rep') {
    return [
      {
        role: 'department_head',
        labelArabic: 'رئيس قسم أو مادة (Department / Subject Head)',
        descriptionArabic: 'ترقية طالب في دفعتك ليكون رئيس قسم أو مسؤول مادة دراسية داخل نفس المستوى والجامعة'
      }
    ];
  }

  return [];
}

/**
 * Enforces strict hierarchical delegation rules:
 * - Platform Owner -> can promote anyone to university_admin, batch_rep, department_head, platform_owner
 * - University Owner -> can ONLY promote within their assignedUniversityId to batch_rep or department_head
 * - Batch Rep -> can ONLY promote within their assignedUniversityId + assignedStudyLevelId to department_head
 */
export async function promoteUserInHierarchy(params: {
  callerUid: string;
  callerEmail: string;
  callerRole: UserRole;
  callerUniversityId?: string;
  callerStudyLevelId?: string;
  targetUid: string;
  targetEmail: string;
  targetDisplayNameArabic?: string;
  targetPhone?: string;
  targetAcademicStudentNumber?: string;
  newRole: UserRole;
  assignedUniversityId?: string;
  assignedStudyLevelId?: string;
  assignedCourseId?: string;
  departmentTitle?: string;
}): Promise<UserRoleDoc> {
  const { callerRole, newRole } = params;

  // 1. Validate caller permission to grant `newRole`
  const allowedRoles = getAllowedPromotableRoles(callerRole).map(r => r.role);
  if (!allowedRoles.includes(newRole)) {
    throw new Error('غير مصرح لحسابك بترقية مستخدم إلى هذه الرتبة الإدارية.');
  }

  // 2. Enforce University isolation for university_admin and batch_rep
  const effectiveUniversityId =
    callerRole === 'platform_owner'
      ? params.assignedUniversityId || 'univ-dar-al-salam'
      : params.callerUniversityId || params.assignedUniversityId || 'univ-dar-al-salam';

  if (callerRole !== 'platform_owner' && params.assignedUniversityId && params.assignedUniversityId !== effectiveUniversityId) {
    throw new Error('لا يمكنك ترقية مستخدمين خارج نطاق جامعتك المعتمدة.');
  }

  // 3. Enforce Study Level (Batch) isolation for batch_rep
  const effectiveStudyLevelId =
    callerRole === 'batch_rep'
      ? params.callerStudyLevelId || params.assignedStudyLevelId || 'lvl-4'
      : params.assignedStudyLevelId;

  if (callerRole === 'batch_rep' && params.assignedStudyLevelId && params.assignedStudyLevelId !== effectiveStudyLevelId) {
    throw new Error('كمندوب دفعة، يمكنك ترقية رؤساء الأقسام والمواد ضمن دفعتك ومستواك الدراسي فقط.');
  }

  if ((newRole === 'batch_rep' || newRole === 'department_head') && !effectiveStudyLevelId) {
    throw new Error('يرجى تحديد المستوى الدراسي / الدفعة المرتبطة بهذه الترقية.');
  }

  return assignUserRole({
    callerUid: params.callerUid,
    callerEmail: params.callerEmail,
    callerRole: params.callerRole,
    targetUid: params.targetUid,
    email: params.targetEmail,
    displayNameArabic: params.targetDisplayNameArabic,
    phone: params.targetPhone,
    academicStudentNumber: params.targetAcademicStudentNumber,
    role: newRole,
    assignedUniversityId: effectiveUniversityId,
    assignedStudyLevelId: effectiveStudyLevelId,
    assignedCourseId: params.assignedCourseId,
    departmentTitle: params.departmentTitle
  });
}

export async function revokeUserRoleInHierarchy(params: {
  callerUid: string;
  callerEmail: string;
  callerRole: UserRole;
  callerUniversityId?: string;
  callerStudyLevelId?: string;
  targetRoleDoc: UserRoleDoc;
}): Promise<void> {
  const { callerRole, targetRoleDoc } = params;

  if (callerRole === 'university_admin') {
    if (
      targetRoleDoc.role === 'platform_owner' ||
      targetRoleDoc.role === 'university_admin' ||
      targetRoleDoc.assignedUniversityId !== params.callerUniversityId
    ) {
      throw new Error('يمكن لمالك الجامعة إلغاء ترقية مناديب الدفعات ورؤساء الأقسام التابعين لجامعته فقط.');
    }
  } else if (callerRole === 'batch_rep') {
    if (
      targetRoleDoc.role !== 'department_head' ||
      targetRoleDoc.assignedUniversityId !== params.callerUniversityId ||
      targetRoleDoc.assignedStudyLevelId !== params.callerStudyLevelId
    ) {
      throw new Error('يمكن لمندوب الدفعة إلغاء ترقية رؤساء الأقسام والمواد داخل دفعته فقط.');
    }
  } else if (callerRole !== 'platform_owner') {
    throw new Error('غير مصرح لك بإلغاء الصلاحيات.');
  }

  await revokeUserRole({
    callerUid: params.callerUid,
    callerEmail: params.callerEmail,
    targetUid: targetRoleDoc.uid,
    targetEmail: targetRoleDoc.email,
    universityId: targetRoleDoc.assignedUniversityId
  });
}

// ---------------------------------------------------------------------------
// 2. Directory of Registered Users & Students (Scoped by University & Batch)
// ---------------------------------------------------------------------------

export interface DirectoryUserCandidate {
  uid: string;
  email: string;
  displayNameArabic: string;
  phone?: string;
  academicStudentNumber?: string;
  universityId?: string;
  studyLevelId?: string;
  enrollmentStatus?: string;
  currentRole?: UserRole;
}

export async function fetchRegisteredUsersDirectory(filterScope?: {
  universityId?: string;
  studyLevelId?: string;
}): Promise<DirectoryUserCandidate[]> {
  const map = new Map<string, DirectoryUserCandidate>();

  // 1. Load from userProfiles in Firestore
  try {
    const snap = await getDocs(collection(db, 'userProfiles'));
    snap.forEach(d => {
      const p = d.data() as UserProfile;
      if (p && p.uid) {
        map.set(p.uid, {
          uid: p.uid,
          email: p.email || '',
          displayNameArabic: p.displayNameArabic || 'مستخدم مسجل',
          phone: p.phone,
          academicStudentNumber: p.academicStudentNumber
        });
      }
    });
  } catch (e) {}

  // 2. Merge with studentEnrollments (gives universityId and studyLevelId for each student)
  try {
    const enrollments = await fetchEnrollmentsForAdmin(filterScope?.universityId);
    for (const enr of enrollments) {
      if (!enr.uid) continue;
      const existing = map.get(enr.uid);
      map.set(enr.uid, {
        uid: enr.uid,
        email: enr.studentEmail || existing?.email || '',
        displayNameArabic: enr.studentNameArabic || existing?.displayNameArabic || 'طالب مسجل',
        phone: enr.studentPhone || existing?.phone,
        academicStudentNumber: enr.academicStudentNumber || existing?.academicStudentNumber,
        universityId: enr.universityId,
        studyLevelId: enr.currentStudyLevelId,
        enrollmentStatus: enr.status || enr.enrollmentStatus
      });
    }
  } catch (e) {}

  let list = Array.from(map.values());

  if (filterScope?.universityId) {
    list = list.filter(u => !u.universityId || u.universityId === filterScope.universityId);
  }
  if (filterScope?.studyLevelId) {
    list = list.filter(u => !u.studyLevelId || u.studyLevelId === filterScope.studyLevelId);
  }

  return list;
}

// ---------------------------------------------------------------------------
// 3. Course Instructors (دكتور مادة نظرية أو عملية)
// ---------------------------------------------------------------------------

function readLocalInstructors(): CourseInstructor[] {
  try {
    const raw = localStorage.getItem(INSTRUCTORS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CourseInstructor[];
  } catch (e) {}
  return [];
}

function writeLocalInstructors(items: CourseInstructor[]): void {
  try {
    localStorage.setItem(INSTRUCTORS_STORAGE_KEY, JSON.stringify(items));
    localStorage.setItem(INSTRUCTORS_INIT_KEY, 'true');
  } catch (e) {}
}

export async function fetchCourseInstructors(filters?: {
  universityId?: string;
  studyLevelId?: string;
  courseOfferingId?: string;
}): Promise<CourseInstructor[]> {
  const isInit = localStorage.getItem(INSTRUCTORS_INIT_KEY) === 'true';
  const localList = readLocalInstructors();
  const map = new Map<string, CourseInstructor>();

  if (!isInit && localList.length === 0) {
    DEFAULT_COURSE_INSTRUCTORS.forEach(item => map.set(item.id, item));
  } else {
    localList.forEach(item => map.set(item.id, item));
  }

  try {
    const snap = await getDocs(collection(db, 'courseInstructors'));
    snap.forEach(d => {
      const data = d.data() as CourseInstructor;
      if (data && data.id) {
        map.set(data.id, data);
      }
    });
  } catch (e) {}

  const merged = Array.from(map.values());
  writeLocalInstructors(merged);

  return merged.filter(inst => {
    if (filters?.universityId && inst.universityId !== filters.universityId) return false;
    if (filters?.studyLevelId && inst.studyLevelId !== filters.studyLevelId) return false;
    if (filters?.courseOfferingId && inst.courseOfferingId !== filters.courseOfferingId) return false;
    return true;
  });
}

export async function saveCourseInstructor(
  instructor: CourseInstructor,
  performedBy: string
): Promise<CourseInstructor> {
  const now = new Date().toISOString();
  const cleanItem: CourseInstructor = cleanFirestoreData({
    ...instructor,
    updatedAt: now,
    createdAt: instructor.createdAt || now
  });

  const current = await fetchCourseInstructors();
  const updated = [...current.filter(i => i.id !== cleanItem.id), cleanItem];
  writeLocalInstructors(updated);

  try {
    await setDoc(doc(db, 'courseInstructors', cleanItem.id), cleanItem, { merge: true });
  } catch (e) {
    console.warn('Firestore courseInstructors save fallback:', e);
  }

  await writeAuditLogToCloud({
    action: 'INSTRUCTOR_ADDED',
    performedBy,
    universityId: cleanItem.universityId,
    details: {
      instructorName: cleanItem.instructorNameArabic,
      teachingType: cleanItem.teachingType,
      courseOfferingId: cleanItem.courseOfferingId,
      studyLevelId: cleanItem.studyLevelId
    }
  });

  return cleanItem;
}

export async function deleteCourseInstructor(
  instructorId: string,
  performedBy: string,
  universityId?: string
): Promise<void> {
  const current = readLocalInstructors();
  writeLocalInstructors(current.filter(i => i.id !== instructorId));

  try {
    await deleteDoc(doc(db, 'courseInstructors', instructorId));
  } catch (e) {}

  await writeAuditLogToCloud({
    action: 'INSTRUCTOR_DELETED',
    performedBy,
    universityId,
    details: { instructorId }
  });
}

// ---------------------------------------------------------------------------
// 4. Batch Notifications (مشاركة إشعارات للدفعة وإرسال الروابط والملفات)
// ---------------------------------------------------------------------------

function readLocalNotifications(): BatchNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BatchNotification[];
  } catch (e) {}
  return [];
}

function writeLocalNotifications(items: BatchNotification[]): void {
  try {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(items));
    localStorage.setItem(NOTIFICATIONS_INIT_KEY, 'true');
  } catch (e) {}
}

export async function fetchBatchNotifications(filters?: {
  universityId?: string;
  studyLevelId?: string;
}): Promise<BatchNotification[]> {
  const isInit = localStorage.getItem(NOTIFICATIONS_INIT_KEY) === 'true';
  const localList = readLocalNotifications();
  const map = new Map<string, BatchNotification>();

  if (!isInit && localList.length === 0) {
    DEFAULT_BATCH_NOTIFICATIONS.forEach(n => map.set(n.id, n));
  } else {
    localList.forEach(n => map.set(n.id, n));
  }

  try {
    const snap = await getDocs(collection(db, 'batchNotifications'));
    snap.forEach(d => {
      const data = d.data() as BatchNotification;
      if (data && data.id) {
        map.set(data.id, data);
      }
    });
  } catch (e) {}

  const merged = Array.from(map.values()).sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  writeLocalNotifications(merged);

  return merged.filter(n => {
    if (filters?.universityId && n.universityId !== filters.universityId) return false;
    if (
      filters?.studyLevelId &&
      n.studyLevelId !== filters.studyLevelId &&
      n.studyLevelId !== 'ALL'
    ) {
      return false;
    }
    return true;
  });
}

export function subscribeToBatchNotifications(
  universityId: string,
  studyLevelId: string,
  onUpdate: (notifications: BatchNotification[]) => void
): () => void {
  try {
    const q = query(
      collection(db, 'batchNotifications'),
      where('universityId', '==', universityId)
    );
    return onSnapshot(
      q,
      (snap) => {
        const list: BatchNotification[] = [];
        snap.forEach(d => {
          const item = d.data() as BatchNotification;
          if (item && (item.studyLevelId === studyLevelId || item.studyLevelId === 'ALL' || !studyLevelId)) {
            list.push(item);
          }
        });
        if (list.length > 0) {
          list.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
          onUpdate(list);
        }
      },
      () => {}
    );
  } catch {
    return () => {};
  }
}

export async function createBatchNotification(
  notification: Omit<BatchNotification, 'id' | 'createdAt'>
): Promise<BatchNotification> {
  const now = new Date().toISOString();
  const fullItem: BatchNotification = cleanFirestoreData({
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    createdAt: now
  });

  const current = await fetchBatchNotifications();
  writeLocalNotifications([fullItem, ...current]);

  try {
    await setDoc(doc(db, 'batchNotifications', fullItem.id), fullItem, { merge: true });
  } catch (e) {
    console.warn('Firestore batchNotifications save fallback:', e);
  }

  await writeAuditLogToCloud({
    action: 'BATCH_NOTIFICATION_SENT',
    performedBy: fullItem.authorNameArabic || fullItem.authorUid,
    universityId: fullItem.universityId,
    details: {
      title: fullItem.title,
      studyLevelId: fullItem.studyLevelId,
      category: fullItem.category
    }
  });

  return fullItem;
}

export async function deleteBatchNotification(notificationId: string): Promise<void> {
  const current = readLocalNotifications();
  writeLocalNotifications(current.filter(n => n.id !== notificationId));
  try {
    await deleteDoc(doc(db, 'batchNotifications', notificationId));
  } catch (e) {}
}
