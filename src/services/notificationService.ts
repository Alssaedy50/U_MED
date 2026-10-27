/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Multi-Channel Real-Time Notification & Sound Engine
 * Provides instant per-user alerts & cloud-backed inbox synchronization for:
 * 1. Posts & Batch Announcements (منشورات الدفعة)
 * 2. Medical Data & Resources (محتوى وداتا سريرية وأكاديمية)
 * 3. Exams & Clinical Tests (اختبارات دورية وفصلية)
 * 4. Competitions & Medical Quizzes (مسابقات وتحديات علمية)
 * 5. Academic, Role & Enrollment Status Updates (تحديثات الاعتماد والترقيات)
 */

import { Assessment, BatchNotification, EducationalResource, StudentEnrollment, UserRoleDoc } from '../types/umed.ts';

export type NotificationCategoryType =
  | 'post'
  | 'data'
  | 'exam'
  | 'competition'
  | 'update'
  | 'system';

export interface AppNotification {
  id: string;
  eventKey?: string;
  title: string;
  body: string;
  category: NotificationCategoryType;
  createdAt: string;
  read: boolean;
  actionTab?: string;
  actionPayload?: Record<string, unknown>;
  authorName?: string;
}

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  browserPopups: boolean;
  notifyPosts: boolean;
  notifyData: boolean;
  notifyExams: boolean;
  notifyCompetitions: boolean;
  notifyUpdates: boolean;
}

const SETTINGS_STORAGE_KEY = 'umed_notification_settings_v1';
const NOTIFICATIONS_STORAGE_PREFIX = 'umed_inapp_notifications_v2_';
const SEEN_EVENTS_STORAGE_PREFIX = 'umed_seen_notif_events_v2_';
const CLEARED_EVENTS_STORAGE_PREFIX = 'umed_cleared_notif_events_v2_';
const LAST_ENR_STATUS_PREFIX = 'umed_last_enr_status_v2_';
const LAST_ROLE_STATUS_PREFIX = 'umed_last_role_status_v2_';
const MAX_NOTIFICATIONS_STORED = 60;

// Built-in default seed IDs that should not trigger popup alerts
const SEED_ASSESSMENT_IDS = new Set(['asmnt-cvs-midterm', 'comp-clinical-cardio']);
const SEED_POST_IDS = new Set(['notif-dar-lvl4-1']);
const SEED_RESOURCE_IDS = new Set([
  'res-cvs-anat-01',
  'res-cvs-histo-02',
  'res-cvs-physio-03',
  'res-resp-04'
]);

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  sound: true,
  browserPopups: true,
  notifyPosts: true,
  notifyData: true,
  notifyExams: true,
  notifyCompetitions: true,
  notifyUpdates: true
};

let activeNotificationUserId: string = 'guest';

// Listeners for in-app reactive notification list updates
type NotificationListener = (notifications: AppNotification[]) => void;
const listeners = new Set<NotificationListener>();

// Listeners for live floating toast alerts
type LiveToastListener = (notification: AppNotification) => void;
const toastListeners = new Set<LiveToastListener>();

function getStorageKeyForUser(uid?: string): string {
  return `${NOTIFICATIONS_STORAGE_PREFIX}${uid || activeNotificationUserId || 'guest'}`;
}

function getSeenKeyForUser(uid?: string): string {
  return `${SEEN_EVENTS_STORAGE_PREFIX}${uid || activeNotificationUserId || 'guest'}`;
}

function getClearedKeyForUser(uid?: string): string {
  return `${CLEARED_EVENTS_STORAGE_PREFIX}${uid || activeNotificationUserId || 'guest'}`;
}

function getSeenEventSet(uid?: string): Set<string> {
  try {
    const raw = localStorage.getItem(getSeenKeyForUser(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch (e) {}
  return new Set();
}

function saveSeenEventSet(set: Set<string>, uid?: string): void {
  try {
    localStorage.setItem(getSeenKeyForUser(uid), JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function getClearedEventSet(uid?: string): Set<string> {
  try {
    const raw = localStorage.getItem(getClearedKeyForUser(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch (e) {}
  return new Set();
}

function saveClearedEventSet(set: Set<string>, uid?: string): void {
  try {
    localStorage.setItem(getClearedKeyForUser(uid), JSON.stringify(Array.from(set)));
  } catch (e) {}
}

/**
 * Sets the active user UID so notifications, unread badges, and seen states are strictly per-user.
 */
export function setActiveNotificationUser(uid: string | null | undefined): void {
  const nextId = uid || 'guest';
  if (activeNotificationUserId !== nextId) {
    activeNotificationUserId = nextId;
    notifyAllListeners();
  }
}

export function getActiveNotificationUser(): string {
  return activeNotificationUserId;
}

function notifyAllListeners() {
  const current = getStoredNotifications();
  listeners.forEach((listener) => {
    try {
      listener(current);
    } catch (e) {
      console.warn('Notification listener error:', e);
    }
  });
}

function notifyToastListeners(notif: AppNotification) {
  toastListeners.forEach((listener) => {
    try {
      listener(notif);
    } catch (e) {}
  });
}

/**
 * Subscribe to live floating toast banners when a new notification arrives
 */
export function subscribeToLiveNotificationToast(
  callback: (notification: AppNotification) => void
): () => void {
  toastListeners.add(callback);
  return () => {
    toastListeners.delete(callback);
  };
}

/**
 * Retrieve user notification preferences from local storage
 */
export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {}
  return { ...DEFAULT_SETTINGS };
}

/**
 * Update user notification preferences
 */
export function updateNotificationSettings(
  partial: Partial<NotificationSettings>
): NotificationSettings {
  const current = getNotificationSettings();
  const updated = { ...current, ...partial };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {}
  return updated;
}

/**
 * Query current browser notification permission status
 */
export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Request native browser notification permission
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      updateNotificationSettings({ browserPopups: true });
    }
    return permission;
  } catch (err) {
    console.warn('Failed to request notification permission:', err);
    return Notification.permission;
  }
}

/**
 * Self-contained zero-bandwidth audio alert synthesizer using Web Audio API
 * Avoids 404s, slow networks in Yemen, and external asset dependencies.
 */
export function playNotificationSound(category: NotificationCategoryType = 'system'): void {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.sound) return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    let notes: number[] = [587.33, 880]; // D5 -> A5
    let noteDuration = 0.12;

    if (category === 'exam' || category === 'competition') {
      notes = [523.25, 659.25, 783.99, 1046.5];
      noteDuration = 0.09;
    } else if (category === 'update') {
      notes = [739.99, 987.77];
      noteDuration = 0.14;
    } else if (category === 'data') {
      notes = [659.25, 830.61];
      noteDuration = 0.11;
    }

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * noteDuration);

      gain.gain.setValueAtTime(0, now + index * noteDuration);
      gain.gain.linearRampToValueAtTime(0.18, now + index * noteDuration + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * noteDuration + noteDuration * 1.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * noteDuration);
      osc.stop(now + index * noteDuration + noteDuration * 1.5);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, (notes.length * noteDuration + 0.5) * 1000);
  } catch (err) {
    // Autoplay restrictions or audio context error - silently fail
  }
}

/**
 * Dispatches a native browser notification (via ServiceWorker or window.Notification)
 */
export async function sendNativeBrowserNotification(
  title: string,
  options: {
    body: string;
    category?: NotificationCategoryType;
    actionTab?: string;
    tag?: string;
  }
): Promise<void> {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.browserPopups) return;

  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notifOptions: NotificationOptions = {
    body: options.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    dir: 'rtl',
    lang: 'ar',
    tag: options.tag || `umed-${options.category || 'alert'}-${Date.now()}`,
    data: {
      url: '/',
      actionTab: options.actionTab
    }
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, notifOptions);
        return;
      }
    }
  } catch (swErr) {}

  try {
    new Notification(title, notifOptions);
  } catch (e) {}
}

/**
 * Get all stored in-app notifications for the active user
 */
export function getStoredNotifications(uid?: string): AppNotification[] {
  try {
    const raw = localStorage.getItem(getStorageKeyForUser(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as AppNotification[];
      if (!Array.isArray(parsed)) return [];
      const seenKeys = new Set<string>();
      const deduplicated: AppNotification[] = [];
      for (const item of parsed) {
        if (item.category === 'exam' || item.category === 'competition') {
          const asmId = item.actionPayload?.assessmentId as string | undefined;
          const cleanTitle = (item.title || '')
            .replace(/^🏆\s*مسابقة طبية جديدة:\s*/i, '')
            .replace(/^📝\s*اختبار أكاديمي جديد:\s*/i, '')
            .trim();
          const dedupKey = asmId ? `asm_id_${asmId}` : `asm_title_${cleanTitle}`;
          if (cleanTitle && seenKeys.has(dedupKey)) {
            continue;
          }
          if (cleanTitle) {
            seenKeys.add(dedupKey);
          }
        } else if (item.eventKey) {
          if (seenKeys.has(item.eventKey)) continue;
          seenKeys.add(item.eventKey);
        }
        deduplicated.push(item);
      }
      return deduplicated;
    }
  } catch (e) {}
  return [];
}

/**
 * Dispatch an in-app notification and trigger sound, floating toast, & native popups if enabled
 */
export function dispatchAppNotification(params: {
  id?: string;
  eventKey?: string;
  title: string;
  body: string;
  category: NotificationCategoryType;
  createdAt?: string;
  actionTab?: string;
  actionPayload?: Record<string, unknown>;
  authorName?: string;
  skipSound?: boolean;
  skipBrowser?: boolean;
  skipToast?: boolean;
  uid?: string;
}): AppNotification | null {
  const settings = getNotificationSettings();
  if (!settings.enabled) return null;

  if (params.category === 'post' && !settings.notifyPosts) return null;
  if (params.category === 'data' && !settings.notifyData) return null;
  if (params.category === 'exam' && !settings.notifyExams) return null;
  if (params.category === 'competition' && !settings.notifyCompetitions) return null;
  if (params.category === 'update' && !settings.notifyUpdates) return null;

  const targetUid = params.uid || activeNotificationUserId;
  const incomingAsmId = params.actionPayload?.assessmentId as string | undefined;
  const deterministicId =
    params.id ||
    (incomingAsmId
      ? `notif_asm_${incomingAsmId}`
      : params.eventKey
      ? `notif_${params.eventKey}`
      : `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  const newNotification: AppNotification = {
    id: deterministicId,
    eventKey: params.eventKey,
    title: params.title,
    body: params.body,
    category: params.category,
    createdAt: params.createdAt || new Date().toISOString(),
    read: false,
    actionTab: params.actionTab,
    actionPayload: params.actionPayload,
    authorName: params.authorName
  };

  try {
    const current = getStoredNotifications(targetUid).filter((existing) => {
      if (incomingAsmId && existing.actionPayload?.assessmentId === incomingAsmId) {
        return false;
      }
      if (params.eventKey && existing.eventKey === params.eventKey) {
        return false;
      }
      if (existing.id === newNotification.id) {
        return false;
      }
      return true;
    });
    const updated = [newNotification, ...current].slice(0, MAX_NOTIFICATIONS_STORED);
    localStorage.setItem(getStorageKeyForUser(targetUid), JSON.stringify(updated));
  } catch (e) {}

  if (!params.skipSound) {
    playNotificationSound(params.category);
  }

  if (!params.skipBrowser) {
    sendNativeBrowserNotification(params.title, {
      body: params.body,
      category: params.category,
      actionTab: params.actionTab,
      tag: incomingAsmId
        ? `umed-asm-${incomingAsmId}`
        : params.eventKey
        ? `umed-${params.eventKey}`
        : `umed-${params.category}`
    });
  }

  if (!params.skipToast) {
    notifyToastListeners(newNotification);
  }

  notifyAllListeners();

  return newNotification;
}

/**
 * Synchronizes a deterministic cloud event (Assessment, Batch Post, Resource, Enrollment, Role)
 * into the user's notification inbox.
 * - If this user (`uid`) has NEVER seen `eventKey`, dispatches a full alert (unread + chime + toast).
 * - If this user HAS already seen `eventKey` (e.g., on page reload), ensures it stays in their inbox without re-chiming.
 */
export function syncCloudEventNotification(params: {
  uid: string;
  eventKey: string;
  id?: string;
  title: string;
  body: string;
  category: NotificationCategoryType;
  createdAt?: string;
  actionTab?: string;
  actionPayload?: Record<string, unknown>;
  authorName?: string;
}): AppNotification | null {
  if (!params.uid || !params.eventKey) return null;

  const clearedSet = getClearedEventSet(params.uid);
  if (clearedSet.has(params.eventKey)) {
    return null;
  }

  const seenSet = getSeenEventSet(params.uid);
  const alreadySeen = seenSet.has(params.eventKey);

  if (!alreadySeen) {
    seenSet.add(params.eventKey);
    saveSeenEventSet(seenSet, params.uid);
    return dispatchAppNotification({
      id: params.id || `notif_${params.eventKey}`,
      eventKey: params.eventKey,
      title: params.title,
      body: params.body,
      category: params.category,
      createdAt: params.createdAt,
      actionTab: params.actionTab,
      actionPayload: params.actionPayload,
      authorName: params.authorName,
      uid: params.uid
    });
  }

  // Already seen by this user: ensure it is present in the stored list without playing sound/toast
  const existingList = getStoredNotifications(params.uid);
  const incomingAsmId = params.actionPayload?.assessmentId as string | undefined;
  const targetId = params.id || (incomingAsmId ? `notif_asm_${incomingAsmId}` : `notif_${params.eventKey}`);
  const alreadyInList = existingList.some(
    (n) =>
      n.id === targetId ||
      n.eventKey === params.eventKey ||
      (incomingAsmId && n.actionPayload?.assessmentId === incomingAsmId)
  );

  if (!alreadyInList) {
    const silentNotif: AppNotification = {
      id: targetId,
      eventKey: params.eventKey,
      title: params.title,
      body: params.body,
      category: params.category,
      createdAt: params.createdAt || new Date().toISOString(),
      read: false,
      actionTab: params.actionTab,
      actionPayload: params.actionPayload,
      authorName: params.authorName
    };
    try {
      const updated = [silentNotif, ...existingList]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_NOTIFICATIONS_STORED);
      localStorage.setItem(getStorageKeyForUser(params.uid), JSON.stringify(updated));
      notifyAllListeners();
    } catch (e) {}
    return silentNotif;
  }

  return null;
}

/**
 * Syncs published Assessments (Exams & Competitions) into the user's notifications.
 * Guarantees that any user receiving an exam or competition also receives its notification.
 */
export function syncNotificationsForAssessments(
  uid: string,
  assessments: Assessment[],
  studentUniversityId?: string,
  studentStudyLevelId?: string
): void {
  if (!uid || !Array.isArray(assessments)) return;

  for (const data of assessments) {
    if (!data || !data.id || data.status !== 'published') continue;
    if (data.createdBy === 'SYSTEM_SEED' || SEED_ASSESSMENT_IDS.has(data.id)) continue;

    if (studentUniversityId && data.universityId && data.universityId !== studentUniversityId) {
      continue;
    }
    if (
      studentStudyLevelId &&
      data.studyLevelId &&
      data.studyLevelId !== 'ALL' &&
      data.studyLevelId !== studentStudyLevelId
    ) {
      continue;
    }

    const isCompetition = data.assessmentType === 'competition';
    const eventKey = `asm_${data.id}_${isCompetition ? 'competition' : 'exam'}`;

    syncCloudEventNotification({
      uid,
      eventKey,
      id: `notif_asm_${data.id}`,
      title: isCompetition
        ? `🏆 مسابقة طبية جديدة: ${data.titleArabic}`
        : `📝 اختبار أكاديمي جديد: ${data.titleArabic}`,
      body: isCompetition
        ? `مسابقة تنافسية متاحة الآن! المدة: ${data.durationMinutes} دقيقة - إجمالي النقاط: ${data.totalPoints}`
        : `اختبار أكاديمي جديد متاح للمحاولة - المدة: ${data.durationMinutes} دقيقة.`,
      category: isCompetition ? 'competition' : 'exam',
      createdAt: data.createdAt,
      actionTab: 'student_assessments',
      actionPayload: {
        assessmentId: data.id,
        assessmentType: isCompetition ? 'competition' : 'exam',
        universityId: data.universityId,
        studyLevelId: data.studyLevelId
      },
      authorName: isCompetition ? 'قسم المسابقات الطبية' : 'كنترول الاختبارات الأكاديمية'
    });
  }
}

/**
 * Syncs Batch Announcements & Posts into the user's notifications.
 */
export function syncNotificationsForBatchPosts(
  uid: string,
  posts: BatchNotification[],
  studentUniversityId?: string,
  studentStudyLevelId?: string
): void {
  if (!uid || !Array.isArray(posts)) return;

  for (const data of posts) {
    if (!data || !data.id) continue;
    if (data.authorUid === 'SYSTEM_SEED' || SEED_POST_IDS.has(data.id)) continue;

    if (studentUniversityId && data.universityId && data.universityId !== studentUniversityId) {
      continue;
    }
    if (
      studentStudyLevelId &&
      data.studyLevelId &&
      data.studyLevelId !== 'ALL' &&
      data.studyLevelId !== studentStudyLevelId
    ) {
      continue;
    }

    const eventKey = `post_${data.id}`;
    syncCloudEventNotification({
      uid,
      eventKey,
      id: `notif_post_${data.id}`,
      title: `📢 منشور دفعة جديد: ${data.title || 'إعلان أكاديمي'}`,
      body: `${data.authorNameArabic || 'ممثل الدفعة'}: ${(data.message || '').slice(0, 110)}${(data.message || '').length > 110 ? '...' : ''}`,
      category: 'post',
      createdAt: data.createdAt,
      actionTab: 'student_dashboard',
      actionPayload: {
        postId: data.id,
        universityId: data.universityId,
        studyLevelId: data.studyLevelId
      },
      authorName: data.authorNameArabic || 'إدارة الدفعة'
    });
  }
}

/**
 * Syncs published Educational Resources (PDFs, Lectures, Slides, Videos) into the user's notifications.
 */
export function syncNotificationsForResources(
  uid: string,
  resources: EducationalResource[],
  studentUniversityId?: string,
  studentStudyLevelId?: string
): void {
  if (!uid || !Array.isArray(resources)) return;

  for (const data of resources) {
    if (!data || !data.id || data.status !== 'published') continue;
    if (
      data.createdBy === 'SYSTEM_SEED' ||
      data.createdBy === 'DR_ALSSAEDY' ||
      SEED_RESOURCE_IDS.has(data.id)
    ) {
      continue;
    }

    if (studentUniversityId && data.universityId && data.universityId !== studentUniversityId) {
      continue;
    }
    if (
      studentStudyLevelId &&
      data.studyLevelId &&
      data.studyLevelId !== 'ALL' &&
      data.studyLevelId !== studentStudyLevelId
    ) {
      continue;
    }

    const typeLabel =
      data.resourceType === 'pdf'
        ? 'ملف PDF / مذكرة'
        : data.resourceType === 'image'
        ? 'شريحة / صورة سريرية'
        : data.resourceType === 'video' || data.resourceType === 'video_link'
        ? 'محاضرة فيديو'
        : 'رابط ومصدر طبي';

    const eventKey = `res_${data.id}`;
    syncCloudEventNotification({
      uid,
      eventKey,
      id: `notif_res_${data.id}`,
      title: `📚 داتا ومحاضرة طبية جديدة: ${data.title}`,
      body: `تم نشر ${typeLabel} جديد في المكتبة السريرية والأكاديمية.`,
      category: 'data',
      createdAt: data.createdAt,
      actionTab: 'student_library',
      actionPayload: {
        resourceId: data.id,
        universityId: data.universityId,
        studyLevelId: data.studyLevelId
      },
      authorName: 'المكتبة السريرية'
    });
  }
}

/**
 * Syncs Student Enrollment approval/rejection updates into the user's notifications.
 */
export function syncNotificationForEnrollment(
  uid: string,
  enrollment: StudentEnrollment | null
): void {
  if (!uid || !enrollment || !enrollment.status) return;
  const statusKey = `${LAST_ENR_STATUS_PREFIX}${uid}`;
  let previousStatus: string | null = null;
  try {
    previousStatus = localStorage.getItem(statusKey);
  } catch (e) {}

  try {
    localStorage.setItem(statusKey, enrollment.status);
  } catch (e) {}

  if (enrollment.status === 'approved' && previousStatus && previousStatus !== 'approved') {
    syncCloudEventNotification({
      uid,
      eventKey: `enr_${uid}_approved_${enrollment.updatedAt || enrollment.reviewedAt || 'v1'}`,
      title: '🎉 تم اعتماد تسجيلك الأكاديمي بنجاح!',
      body: 'مبارك! تم اعتماد قيدك الجامعي رسميًا في كلية الطب البشري، والآن كافة المقررات والمكتبة والاختبارات مفعلة بالكامل.',
      category: 'update',
      actionTab: 'student_dashboard',
      authorName: 'عمادة كلية الطب البشري'
    });
  } else if (enrollment.status === 'rejected' && previousStatus && previousStatus !== 'rejected') {
    syncCloudEventNotification({
      uid,
      eventKey: `enr_${uid}_rejected_${enrollment.updatedAt || enrollment.reviewedAt || 'v1'}`,
      title: '⚠️ تحديث بخصوص طلب التسجيل الأكاديمي',
      body: enrollment.rejectionReason
        ? `تم إرجاع طلب قيدك للمراجعة: ${enrollment.rejectionReason}`
        : 'تمت مراجعة طلبك وإرجاعه للتعديل. يرجى الدخول لملفك وتحديث البيانات المطلوبة.',
      category: 'update',
      actionTab: 'student_dashboard',
      authorName: 'لجنة القبول والتسجيل'
    });
  }
}

/**
 * Syncs Academic Role promotion updates into the user's notifications.
 */
export function syncNotificationForRoleChange(
  uid: string,
  roleDoc: UserRoleDoc | null
): void {
  if (!uid || !roleDoc || !roleDoc.role) return;
  const roleKey = `${LAST_ROLE_STATUS_PREFIX}${uid}`;
  let previousRole: string | null = null;
  try {
    previousRole = localStorage.getItem(roleKey);
  } catch (e) {}

  try {
    localStorage.setItem(roleKey, roleDoc.role);
  } catch (e) {}

  if (previousRole && previousRole !== roleDoc.role && roleDoc.role !== 'student') {
    const roleLabel =
      roleDoc.role === 'university_admin'
        ? 'مالك / مشرف الجامعة'
        : roleDoc.role === 'batch_rep'
        ? 'مندوب الدفعة / المستوى'
        : roleDoc.role === 'department_head'
        ? 'رئيس قسم أو مادة'
        : 'مالك المنصة';
    syncCloudEventNotification({
      uid,
      eventKey: `role_${uid}_${roleDoc.role}_${roleDoc.assignedAt || 'v1'}`,
      title: `🎖️ ترقية أكاديمية جديدة: ${roleLabel}`,
      body: `تم منح حسابك صلاحيات "${roleLabel}". يمكنك الآن التبديل لبوابة الإدارة من الشريط العلوي.`,
      category: 'update',
      actionTab: 'student_dashboard',
      authorName: 'إدارة المنصة الأكاديمية'
    });
  }
}

/**
 * Mark a single notification as read
 */
export function markNotificationAsRead(id: string): void {
  try {
    const current = getStoredNotifications();
    const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
    localStorage.setItem(getStorageKeyForUser(), JSON.stringify(updated));
    notifyAllListeners();
  } catch (e) {}
}

/**
 * Mark all notifications as read
 */
export function markAllNotificationsAsRead(): void {
  try {
    const current = getStoredNotifications();
    const updated = current.map((n) => ({ ...n, read: true }));
    localStorage.setItem(getStorageKeyForUser(), JSON.stringify(updated));
    notifyAllListeners();
  } catch (e) {}
}

/**
 * Clear all notifications for the current user and mark their eventKeys as cleared
 */
export function clearAllNotifications(): void {
  try {
    const current = getStoredNotifications();
    const clearedSet = getClearedEventSet();
    current.forEach((n) => {
      if (n.eventKey) clearedSet.add(n.eventKey);
      const asmId = n.actionPayload?.assessmentId as string | undefined;
      if (asmId) {
        clearedSet.add(`asm_${asmId}_exam`);
        clearedSet.add(`asm_${asmId}_competition`);
      }
    });
    saveClearedEventSet(clearedSet);
    localStorage.removeItem(getStorageKeyForUser());
    notifyAllListeners();
  } catch (e) {}
}

/**
 * React hook or component subscription to in-app notifications
 */
export function subscribeToAppNotifications(
  callback: (notifications: AppNotification[]) => void
): () => void {
  listeners.add(callback);
  callback(getStoredNotifications());
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Trigger immediate test chime and test notification banner
 */
export async function triggerTestNotification(): Promise<void> {
  const perm = getBrowserNotificationPermission();
  if (perm === 'default') {
    await requestBrowserNotificationPermission();
  }

  dispatchAppNotification({
    title: '🔔 تجربة نظام إشعارات UMED',
    body: 'تم اختبار نغمة التنبيه والإشعار السريري بنجاح. أنت الآن متصل بكافة التحديثات والمناشير والاختبارات المباشرة.',
    category: 'system',
    authorName: 'نظام UMED الأكاديمي'
  });
}
