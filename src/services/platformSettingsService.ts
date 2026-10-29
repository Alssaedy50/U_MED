/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Platform Branding, Terms of Use, Privacy Policy & Contact Channels Service
 * Managed exclusively by the Platform Owner from Account Settings,
 * with Offline-First Caching + Real-Time Cloud Firestore Synchronization.
 */

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, auth, cleanFirestoreData, writeAuditLogToCloud } from '../lib/firebase.ts';

export interface PlatformContactChannels {
  whatsappNumber: string;
  supportEmail: string;
  supportPhone: string;
  telegramUrl: string;
  facebookUrl: string;
  websiteUrl: string;
  officeAddressArabic: string;
  workingHoursArabic: string;
}

export interface PlatformBrandingAndPolicies {
  platformShortName: string;
  platformNameArabic: string;
  platformTaglineArabic: string;
  logoDataUrl: string;
  termsOfUseArabic: string;
  privacyPolicyArabic: string;
  contactChannels: PlatformContactChannels;
  updatedAt: string;
  updatedBy: string;
}

const PLATFORM_SETTINGS_LS_KEY = 'umed_platform_settings_v1';
const PLATFORM_SETTINGS_OUTBOX_KEY = 'umed_platform_settings_pending_sync_v1';

export const DEFAULT_PLATFORM_SETTINGS: PlatformBrandingAndPolicies = {
  platformShortName: 'UMED',
  platformNameArabic: 'UMED — منصة التعليم الطبي اليمنية',
  platformTaglineArabic: 'منصة التعليم الطبي والأكاديمي الموحدة لطلاب كليات الطب البشري والعلوم الصحية في الجامعات اليمنية',
  logoDataUrl: '',
  termsOfUseArabic: `1. طبيعة المنصة والغرض الأكاديمي:
تُعد منصة UMED بيئة تعليمية طبية أكاديمية مخصصة لطلاب كليات الطب البشري والعلوم الصحية في الجامعات اليمنية، وتهدف إلى تنظيم المقررات والبلوكات الدراسية والاختبارات التقييمية والمسابقات العلمية.

2. شروط التسجيل واستخدام الحساب:
• يلتزم الطالب بالتسجيل ببياناته الحقيقية ورقم قيده الجامعي الصحيح أو وسيلة الاتصال المعتمدة (رقم الهاتف أو البريد الإلكتروني).
• يُمنع مشاركة بيانات الدخول الشخصية مع الغير أو انتحال صفة أي طالب أو عضو هيئة تدريس.
• يحق للطالب اختيار صيغة عرض اسمه في لوحة الترتيب التنافسية (الاسم الكامل، الاسم الأول، أو لقب/اسم مستخدم مخصص) بما يتوافق مع الآداب الأكاديمية.

3. نزاهة الاختبارات والمسابقات الطبية:
• تُعقد الاختبارات والمسابقات الطبية لقياس المستوى العلمي الحقيقي وتحفيز التنافس الشريف بين الطلاب.
• عند مشاركة رابط اختبار تجريبي، يُسمح بحل الأسئلة مباشرةً، ويلزم إنشاء حساب موثق في المنصة لإظهار النتيجة المعتمدة وحفظ الترتيب.

4. حقوق الملكية الفكرية والمحتوى العلمي:
• جميع المحاضرات، الملخصات، وبنوك الأسئلة المنشورة مخصصة للاستخدام الدراسي والأكاديمي لطلاب الدفعة والجامعة المعنية.`,
  privacyPolicyArabic: `1. حماية البيانات الشخصية والأكاديمية:
تلتزم إدارة المنصة بحماية خصوصية بيانات جميع الطلاب وأعضاء هيئة التدريس، بما في ذلك الاسم، رقم القيد الجامعي، رقم الهاتف، والبريد الإلكتروني، وعدم مشاركتها مع أي طرف خارجي.

2. استخدام البيانات داخل المنصة:
• تُستخدم بيانات القيد الجامعي حصرياً للتحقق من انتماء الطالب إلى جامعته ودفعته الدراسية وتخصيص المقررات والاختبارات المناسبة له.
• يمتلك كل طالب حرية التحكم في كيفية ظهور اسمه أمام زملائه في لوحة نتائج الاختبارات والمسابقات من خلال إعدادات العرض الفوري.

3. التخزين المحلي والعمل دون اتصال (Offline-First):
• يحفظ التطبيق نسخة محلية مشفرة وآمنة من المحاضرات والاختبارات على جهاز المستخدم لتمكينه من الدراسة وحل الاختبارات دون اتصال بالإنترنت، وتتم مزامنتها تلقائياً مع السحابة فور عودة الاتصال.

4. حق إدارة وحذف الحساب:
• يمتلك المستخدم الحق الكامل في تعديل تفضيلاته أو حذف حسابه وبياناته نهائياً من السحابة في أي وقت من خلال تبويب (الإعدادات والحساب).`,
  contactChannels: {
    whatsappNumber: '+967770000000',
    supportEmail: 'alssaedy50@gmail.com',
    supportPhone: '+967770000000',
    telegramUrl: 'https://t.me/umed_yemen',
    facebookUrl: '',
    websiteUrl: '',
    officeAddressArabic: 'الجمهورية اليمنية — صنعاء — الإدارة العامة للمنصة الأكاديمية الطبية',
    workingHoursArabic: 'متاح على مدار الساعة (دعم فني وأكاديمي مستمر)'
  },
  updatedAt: '2025-01-01T00:00:00.000Z',
  updatedBy: 'SYSTEM_DEFAULT'
};

type PlatformSettingsListener = (settings: PlatformBrandingAndPolicies) => void;
const listeners = new Set<PlatformSettingsListener>();
let autoSyncAttached = false;

export function getCachedPlatformSettings(): PlatformBrandingAndPolicies {
  try {
    const raw = localStorage.getItem(PLATFORM_SETTINGS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return mergeWithDefaultSettings(parsed);
    }
  } catch {}
  return DEFAULT_PLATFORM_SETTINGS;
}

function mergeWithDefaultSettings(partial: any): PlatformBrandingAndPolicies {
  if (!partial || typeof partial !== 'object') return DEFAULT_PLATFORM_SETTINGS;
  return {
    platformShortName:
      typeof partial.platformShortName === 'string' && partial.platformShortName.trim()
        ? partial.platformShortName.trim()
        : DEFAULT_PLATFORM_SETTINGS.platformShortName,
    platformNameArabic:
      typeof partial.platformNameArabic === 'string' && partial.platformNameArabic.trim()
        ? partial.platformNameArabic.trim()
        : DEFAULT_PLATFORM_SETTINGS.platformNameArabic,
    platformTaglineArabic:
      typeof partial.platformTaglineArabic === 'string' && partial.platformTaglineArabic.trim()
        ? partial.platformTaglineArabic.trim()
        : DEFAULT_PLATFORM_SETTINGS.platformTaglineArabic,
    logoDataUrl: typeof partial.logoDataUrl === 'string' ? partial.logoDataUrl : '',
    termsOfUseArabic:
      typeof partial.termsOfUseArabic === 'string' && partial.termsOfUseArabic.trim()
        ? partial.termsOfUseArabic
        : DEFAULT_PLATFORM_SETTINGS.termsOfUseArabic,
    privacyPolicyArabic:
      typeof partial.privacyPolicyArabic === 'string' && partial.privacyPolicyArabic.trim()
        ? partial.privacyPolicyArabic
        : DEFAULT_PLATFORM_SETTINGS.privacyPolicyArabic,
    contactChannels: {
      whatsappNumber:
        partial.contactChannels?.whatsappNumber ?? DEFAULT_PLATFORM_SETTINGS.contactChannels.whatsappNumber,
      supportEmail:
        partial.contactChannels?.supportEmail ?? DEFAULT_PLATFORM_SETTINGS.contactChannels.supportEmail,
      supportPhone:
        partial.contactChannels?.supportPhone ?? DEFAULT_PLATFORM_SETTINGS.contactChannels.supportPhone,
      telegramUrl:
        partial.contactChannels?.telegramUrl ?? DEFAULT_PLATFORM_SETTINGS.contactChannels.telegramUrl,
      facebookUrl:
        partial.contactChannels?.facebookUrl ?? DEFAULT_PLATFORM_SETTINGS.contactChannels.facebookUrl,
      websiteUrl:
        partial.contactChannels?.websiteUrl ?? DEFAULT_PLATFORM_SETTINGS.contactChannels.websiteUrl,
      officeAddressArabic:
        partial.contactChannels?.officeAddressArabic ??
        DEFAULT_PLATFORM_SETTINGS.contactChannels.officeAddressArabic,
      workingHoursArabic:
        partial.contactChannels?.workingHoursArabic ??
        DEFAULT_PLATFORM_SETTINGS.contactChannels.workingHoursArabic
    },
    updatedAt: partial.updatedAt || DEFAULT_PLATFORM_SETTINGS.updatedAt,
    updatedBy: partial.updatedBy || DEFAULT_PLATFORM_SETTINGS.updatedBy
  };
}

let lastSyncedBrandingSignature = '';

export function syncBrandingToServer(
  settings: PlatformBrandingAndPolicies,
  force = false
): void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  try {
    const signature = `${settings.platformShortName || ''}|${settings.platformNameArabic || ''}|${(settings.logoDataUrl || '').length}|${settings.updatedAt || ''}`;
    if (!force && signature === lastSyncedBrandingSignature) return;
    lastSyncedBrandingSignature = signature;

    fetch('/api/platform-branding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platformShortName: settings.platformShortName,
        platformNameArabic: settings.platformNameArabic,
        platformTaglineArabic: settings.platformTaglineArabic,
        logoDataUrl: settings.logoDataUrl,
        updatedAt: settings.updatedAt
      })
    }).catch(() => {});
  } catch {}
}

function applyBrandingToDocumentHead(settings: PlatformBrandingAndPolicies): void {
  if (typeof document === 'undefined') return;
  try {
    if (settings.platformNameArabic) {
      document.title = settings.platformNameArabic;
    }
    if (settings.platformShortName) {
      const appleTitleMeta = document.querySelector(
        "meta[name='apple-mobile-web-app-title']"
      ) as HTMLMetaElement | null;
      if (appleTitleMeta) {
        appleTitleMeta.content = settings.platformShortName;
      }
    }

    let iconLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      document.head.appendChild(iconLink);
    }

    let appleTouchIconLink = document.querySelector(
      "link[rel='apple-touch-icon']"
    ) as HTMLLinkElement | null;
    if (!appleTouchIconLink) {
      appleTouchIconLink = document.createElement('link');
      appleTouchIconLink.rel = 'apple-touch-icon';
      document.head.appendChild(appleTouchIconLink);
    }

    if (settings.logoDataUrl) {
      iconLink.removeAttribute('type');
      iconLink.href = settings.logoDataUrl;
      appleTouchIconLink.href = settings.logoDataUrl;
    } else {
      iconLink.type = 'image/svg+xml';
      iconLink.href = '/icon.svg';
      appleTouchIconLink.href = '/api/pwa-icon?size=192';
    }

    let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    if (manifestLink.getAttribute('href') !== '/api/pwa-manifest') {
      manifestLink.href = '/api/pwa-manifest';
    }

    if (settings.logoDataUrl || settings.updatedBy !== 'SYSTEM_DEFAULT') {
      syncBrandingToServer(settings);
    }
  } catch {}
}

function notifyPlatformSettingsListeners(settings: PlatformBrandingAndPolicies): void {
  applyBrandingToDocumentHead(settings);
  listeners.forEach((cb) => {
    try {
      cb(settings);
    } catch {}
  });
}

export async function fetchPlatformSettings(): Promise<PlatformBrandingAndPolicies> {
  const local = getCachedPlatformSettings();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return local;
  }

  try {
    // 1. Read from `uniqueIdentifiers/platform_global_settings` (100% publicly readable on live umed-yemen)
    const pubSnap = await getDoc(doc(db, 'uniqueIdentifiers', 'platform_global_settings'));
    if (pubSnap.exists() && pubSnap.data()?.settings) {
      const remote = mergeWithDefaultSettings(pubSnap.data()!.settings);
      const localTime = new Date(local.updatedAt || 0).getTime();
      const remoteTime = new Date(remote.updatedAt || 0).getTime();
      if (remoteTime >= localTime) {
        localStorage.setItem(PLATFORM_SETTINGS_LS_KEY, JSON.stringify(remote));
        notifyPlatformSettingsListeners(remote);
        return remote;
      }
    }
  } catch {}

  try {
    // 2. Fallback read from `system/platform_settings`
    const sysSnap = await getDoc(doc(db, 'system', 'platform_settings'));
    if (sysSnap.exists()) {
      const remote = mergeWithDefaultSettings(sysSnap.data());
      const localTime = new Date(local.updatedAt || 0).getTime();
      const remoteTime = new Date(remote.updatedAt || 0).getTime();
      if (remoteTime >= localTime) {
        localStorage.setItem(PLATFORM_SETTINGS_LS_KEY, JSON.stringify(remote));
        notifyPlatformSettingsListeners(remote);
        return remote;
      }
    }
  } catch {}

  return local;
}

export async function savePlatformSettingsByOwner(
  updates: Partial<PlatformBrandingAndPolicies>,
  ownerIdentifier: string
): Promise<{ settings: PlatformBrandingAndPolicies; syncedToCloud: boolean }> {
  const current = getCachedPlatformSettings();
  const nowIso = new Date().toISOString();

  const merged: PlatformBrandingAndPolicies = mergeWithDefaultSettings({
    ...current,
    ...updates,
    contactChannels: {
      ...current.contactChannels,
      ...(updates.contactChannels || {})
    },
    updatedAt: nowIso,
    updatedBy: ownerIdentifier || auth.currentUser?.email || 'PLATFORM_OWNER'
  });

  try {
    localStorage.setItem(PLATFORM_SETTINGS_LS_KEY, JSON.stringify(merged));
    localStorage.setItem(PLATFORM_SETTINGS_OUTBOX_KEY, JSON.stringify(merged));
  } catch {}

  notifyPlatformSettingsListeners(merged);
  syncBrandingToServer(merged, true);

  const synced = await flushPendingPlatformSettingsSync();
  return {
    settings: merged,
    syncedToCloud: synced
  };
}

export async function flushPendingPlatformSettingsSync(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  const rawPending = localStorage.getItem(PLATFORM_SETTINGS_OUTBOX_KEY);
  if (!rawPending) return true;

  const uid = auth.currentUser?.uid;
  if (!uid) return false;

  try {
    const pending: PlatformBrandingAndPolicies = JSON.parse(rawPending);
    let wroteAny = false;

    try {
      await setDoc(
        doc(db, 'uniqueIdentifiers', 'platform_global_settings'),
        cleanFirestoreData({
          uid,
          type: 'platform_settings',
          settings: pending,
          updatedAt: pending.updatedAt
        }),
        { merge: true }
      );
      wroteAny = true;
    } catch {}

    try {
      await setDoc(doc(db, 'system', 'platform_settings'), cleanFirestoreData(pending), { merge: true });
      wroteAny = true;
    } catch {}

    if (wroteAny) {
      localStorage.removeItem(PLATFORM_SETTINGS_OUTBOX_KEY);
      writeAuditLogToCloud({
        action: 'PLATFORM_SETTINGS_UPDATED' as any,
        performedBy: pending.updatedBy,
        targetUid: uid,
        details: {
          platformShortName: pending.platformShortName,
          platformNameArabic: pending.platformNameArabic,
          hasCustomLogo: Boolean(pending.logoDataUrl)
        }
      }).catch(() => {});
      return true;
    }
  } catch {}

  return false;
}

export function subscribeToPlatformSettings(
  onUpdate: (settings: PlatformBrandingAndPolicies) => void
): () => void {
  listeners.add(onUpdate);
  const initial = getCachedPlatformSettings();
  applyBrandingToDocumentHead(initial);
  onUpdate(initial);

  if (!autoSyncAttached && typeof window !== 'undefined') {
    autoSyncAttached = true;
    window.addEventListener('online', () => {
      flushPendingPlatformSettingsSync().catch(() => {});
    });
  }

  fetchPlatformSettings().catch(() => {});

  let unsubPub = () => {};
  let unsubSys = () => {};

  try {
    unsubPub = onSnapshot(
      doc(db, 'uniqueIdentifiers', 'platform_global_settings'),
      (snap) => {
        if (snap.exists() && snap.data()?.settings) {
          const remote = mergeWithDefaultSettings(snap.data()!.settings);
          try {
            localStorage.setItem(PLATFORM_SETTINGS_LS_KEY, JSON.stringify(remote));
          } catch {}
          notifyPlatformSettingsListeners(remote);
        }
      },
      () => {}
    );
  } catch {}

  try {
    unsubSys = onSnapshot(
      doc(db, 'system', 'platform_settings'),
      (snap) => {
        if (snap.exists()) {
          const remote = mergeWithDefaultSettings(snap.data());
          try {
            localStorage.setItem(PLATFORM_SETTINGS_LS_KEY, JSON.stringify(remote));
          } catch {}
          notifyPlatformSettingsListeners(remote);
        }
      },
      () => {}
    );
  } catch {}

  return () => {
    listeners.delete(onUpdate);
    unsubPub();
    unsubSys();
  };
}

/**
 * Compresses and resizes an uploaded image file on the client (works 100% offline & online)
 * into a crisp DataURL suitable for instant rendering and Firestore storage.
 */
export function compressLogoFileToDataUrl(file: File, maxDimension = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('يرجى اختيار ملف صورة صالح (PNG, JPG, WEBP, SVG)'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشل قراءة ملف الشعار من الجهاز'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (file.type === 'image/svg+xml' && dataUrl.length < 120000) {
        resolve(dataUrl);
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('تعذر معالجة الصورة المختارة'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressedPng = canvas.toDataURL('image/png');
          if (compressedPng.length <= 180000) {
            resolve(compressedPng);
          } else {
            resolve(canvas.toDataURL('image/webp', 0.9));
          }
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
