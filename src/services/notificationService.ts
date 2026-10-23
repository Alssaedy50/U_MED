/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Multi-Channel Real-Time Notification & Sound Engine
 * Provides instant alerts for:
 * 1. Posts & Batch Announcements (منشورات الدفعة)
 * 2. Medical Data & Resources (محتوى وداتا سريرية وأكاديمية)
 * 3. Exams & Clinical Tests (اختبارات دورية وفصلية)
 * 4. Competitions & Medical Quizzes (مسابقات وتحديات علمية)
 * 5. Academic & Enrollment Status Updates (تحديثات الاعتماد والحالة)
 */

export type NotificationCategoryType =
  | 'post'
  | 'data'
  | 'exam'
  | 'competition'
  | 'update'
  | 'system';

export interface AppNotification {
  id: string;
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
const NOTIFICATIONS_STORAGE_KEY = 'umed_inapp_notifications_v1';
const MAX_NOTIFICATIONS_STORED = 60;

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

// Listeners for in-app reactive notification updates
type NotificationListener = (notifications: AppNotification[]) => void;
const listeners = new Set<NotificationListener>();

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
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Define harmonic frequency combinations based on alert category
    let notes: number[] = [587.33, 880]; // D5 -> A5 (pleasant chime)
    let noteDuration = 0.12;

    if (category === 'exam' || category === 'competition') {
      // Triumphant/Urgent clinical triad: C5 (523.25) -> E5 (659.25) -> G5 (783.99) -> C6 (1046.5)
      notes = [523.25, 659.25, 783.99, 1046.5];
      noteDuration = 0.09;
    } else if (category === 'update') {
      // Status update / approval chime: F#5 (739.99) -> B5 (987.77)
      notes = [739.99, 987.77];
      noteDuration = 0.14;
    } else if (category === 'data') {
      // Knowledge / lecture addition: E5 (659.25) -> G#5 (830.61)
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

    // Close audio context after playback ends to preserve memory
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
    icon: '/icon-192.png',
    badge: '/icon-192.png',
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
  } catch (swErr) {
    // Fall back to standard Notification constructor
  }

  try {
    new Notification(title, notifOptions);
  } catch (e) {}
}

/**
 * Get all stored in-app notifications
 */
export function getStoredNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as AppNotification[];
    }
  } catch (e) {}
  return [];
}

/**
 * Dispatch an in-app notification and trigger sound & native popups if enabled
 */
export function dispatchAppNotification(params: {
  title: string;
  body: string;
  category: NotificationCategoryType;
  actionTab?: string;
  actionPayload?: Record<string, unknown>;
  authorName?: string;
  skipSound?: boolean;
  skipBrowser?: boolean;
}): AppNotification | null {
  const settings = getNotificationSettings();
  if (!settings.enabled) return null;

  // Filter check by category
  if (params.category === 'post' && !settings.notifyPosts) return null;
  if (params.category === 'data' && !settings.notifyData) return null;
  if (params.category === 'exam' && !settings.notifyExams) return null;
  if (params.category === 'competition' && !settings.notifyCompetitions) return null;
  if (params.category === 'update' && !settings.notifyUpdates) return null;

  const newNotification: AppNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: params.title,
    body: params.body,
    category: params.category,
    createdAt: new Date().toISOString(),
    read: false,
    actionTab: params.actionTab,
    actionPayload: params.actionPayload,
    authorName: params.authorName
  };

  // Save to stored notifications list
  try {
    const current = getStoredNotifications();
    const updated = [newNotification, ...current].slice(0, MAX_NOTIFICATIONS_STORED);
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {}

  // Trigger sound alert
  if (!params.skipSound) {
    playNotificationSound(params.category);
  }

  // Trigger native browser notification
  if (!params.skipBrowser) {
    sendNativeBrowserNotification(params.title, {
      body: params.body,
      category: params.category,
      actionTab: params.actionTab,
      tag: `umed-${params.category}`
    });
  }

  // Notify active UI listeners
  notifyAllListeners();

  return newNotification;
}

/**
 * Mark a single notification as read
 */
export function markNotificationAsRead(id: string): void {
  try {
    const current = getStoredNotifications();
    const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
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
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
    notifyAllListeners();
  } catch (e) {}
}

/**
 * Clear all notifications
 */
export function clearAllNotifications(): void {
  try {
    localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
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
