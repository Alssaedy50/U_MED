/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Firebase Client SDK Initialization & Data Access Layer
 * Yemen-First Medical Education Platform (UMED)
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  fetchSignInMethodsForEmail,
  deleteUser,
  signOut,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  setLogLevel,
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc,
  getDocFromServer,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';

try {
  setLogLevel('silent');
} catch (e) {}
import firebaseAppletConfig from '../../firebase-applet-config.json';
import { 
  UserRole, 
  UserRoleDoc, 
  UserProfile, 
  AuditLog,
  UniqueIdentifierRecord,
  VerificationChallenge,
  PrimaryOwnerIdentityConfig,
  StudentEnrollment,
  EnrollmentStatus
} from '../types/umed.ts';

// Dynamic Firebase Configuration supporting Vite & Node/Test Environment Variables
const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};

export const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
  measurementId: metaEnv.VITE_FIREBASE_MEASUREMENT_ID || firebaseAppletConfig.measurementId,
  firestoreDatabaseId: metaEnv.VITE_FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId,
};

// Primary Platform Owner Official Details (Non-duplicable & Strictly Reserved)
export const INITIAL_OWNER_EMAILS = [
  'alssaedy50@gmail.com',
  'alssaedy500@gmail.com',
  'doctoshi50@gmail.com',
  (metaEnv.VITE_INITIAL_OWNER_EMAIL || '').trim().toLowerCase()
].filter(Boolean);

export const INITIAL_OWNER_EMAIL = INITIAL_OWNER_EMAILS[0];
export const DEFAULT_OWNER_PHONE = '+967770000001';
export const DEFAULT_OWNER_ACADEMIC_ID = 'OWNER-UMED-001';
export const DEFAULT_OWNER_NAME_ARABIC = 'المالك الأساسي لمنصة UMED الطبية';

export const isInitialOwnerEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return INITIAL_OWNER_EMAILS.includes(email.trim().toLowerCase());
};

export const isPrimaryOwnerEmail = isInitialOwnerEmail;

// 1. Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Client Analytics disabled to prevent unnecessary installations requests with restricted keys
export const analytics = null;

// 2. Export Auth & Firestore instances (forced long-polling prevents 10s WebChannel timeout in iFrames)
export const auth = getAuth(app);

const dbId = (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)') 
  ? firebaseConfig.firestoreDatabaseId 
  : undefined;

let firestoreInstance;
try {
  firestoreInstance = dbId
    ? initializeFirestore(app, { experimentalForceLongPolling: true, ignoreUndefinedProperties: true }, dbId)
    : initializeFirestore(app, { experimentalForceLongPolling: true, ignoreUndefinedProperties: true });
} catch {
  firestoreInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
}
export const db = firestoreInstance;

/**
 * Recursively strips undefined fields so Firestore setDoc/updateDoc never throws
 * "Unsupported field value: undefined"
 */
export function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanFirestoreData(item)) as unknown as T;
  }
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    if (v !== undefined) {
      cleaned[k] = cleanFirestoreData(v);
    }
  }
  return cleaned as T;
}

// 3. Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// 4. Test Firestore Connection
export async function testFirestoreConnection(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const probePromise = getDocFromServer(doc(db, 'system', 'connection_probe'));
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 4000)
    );
    await Promise.race([probePromise, timeoutPromise]);
    return { connected: true, latencyMs: Date.now() - start };
  } catch (error: any) {
    const latencyMs = Date.now() - start;
    if (
      error?.code === 'not-found' ||
      error?.message?.includes('not-found') ||
      error?.code === 'permission-denied' ||
      error?.message?.includes('token-service-api') || 
      error?.message?.includes('securetoken.googleapis.com')
    ) {
      return { connected: true, latencyMs };
    }
    if (
      (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('timeout'))) ||
      error?.code === 'unavailable'
    ) {
      return { connected: false, latencyMs, error: 'العميل في وضع العمل دون اتصال (Offline)' };
    }
    return { connected: false, latencyMs, error: error?.message || 'تعذر الاتصال بـ Firestore' };
  }
}

// 5. Phone Number, Email, & Academic ID Normalization & Validation (Yemen +967 First)
export function normalizeYemenPhone(phoneInput: string): string {
  const digits = phoneInput.replace(/[^\d+]/g, '');
  const rawDigits = digits.replace(/\D/g, '');

  // Standard 9-digit Yemen mobile number starting with 7 (e.g. 771234567, 73..., 71..., 70..., 78...)
  if (rawDigits.length === 9 && rawDigits.startsWith('7')) {
    return `+967${rawDigits}`;
  }
  // 10-digit starting with 07 (e.g. 0771234567)
  if (rawDigits.length === 10 && rawDigits.startsWith('07')) {
    return `+967${rawDigits.slice(1)}`;
  }
  // Starting with 967 (e.g. 967771234567)
  if (rawDigits.startsWith('967') && rawDigits.length === 12 && rawDigits[3] === '7') {
    return `+${rawDigits}`;
  }
  // Starting with 00967 (e.g. 00967771234567)
  if (rawDigits.startsWith('00967') && rawDigits.length === 14 && rawDigits[5] === '7') {
    return `+${rawDigits.slice(2)}`;
  }
  if (rawDigits.length >= 9 && rawDigits.length <= 15) {
    return `+${rawDigits}`;
  }
  return '';
}

export function validateYemenPhoneFormat(phoneInput: string): { valid: boolean; normalized: string; message?: string } {
  const normalized = normalizeYemenPhone(phoneInput);
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      message: 'يرجى إدخال رقم هاتف يمني صحيح مكوّن من 9 أرقام يبدأ بـ 7 (مثال: 771234567)'
    };
  }
  // If Yemen +967 number, enforce valid operator prefix (77, 78, 71, 73, 70) and exact 9 digits after +967
  if (normalized.startsWith('+967')) {
    const localPart = normalized.slice(4);
    if (!/^(77|78|71|73|70)\d{7}$/.test(localPart)) {
      return {
        valid: false,
        normalized,
        message: 'رقم الهاتف اليمني يجب أن يتكون من 9 أرقام ويبدأ بـ (77 أو 78 أو 71 أو 73 أو 70)'
      };
    }
  }
  return { valid: true, normalized };
}

export function normalizeEmail(emailInput: string): string {
  return emailInput.trim().toLowerCase();
}

export function validateEmailFormat(emailInput: string): { valid: boolean; normalized: string; message?: string } {
  const normalized = normalizeEmail(emailInput);
  if (!normalized || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      message: 'يرجى إدخال بريد إلكتروني صحيح وفعّال (مثال: student@gmail.com)'
    };
  }
  return { valid: true, normalized };
}

export function normalizeAcademicId(academicInput: string): string {
  return academicInput
    .trim()
    .toUpperCase()
    .replace(/[\s/_]+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Normalizes a username so that Uppercase (Capital) and Lowercase (Small) English letters
 * have the exact same value (`A-Z` === `a-z`).
 */
export function normalizeUsername(usernameInput: string): string {
  return (usernameInput || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Computes a canonical anti-similarity skeleton for a username to prevent
 * similar/confusable usernames (e.g. `Ahmed_Med` vs `ahmedmed` vs `ahmeed_med` vs `ahm3d_m3d`).
 * - Lowercases all characters (`A-Z` === `a-z`)
 * - Removes all separators (`_`, `.`, `-`)
 * - Normalizes lookalike digits (`0` -> `o`, `1` -> `l`)
 * - Collapses repeated consecutive letters (`aaahmed` -> `ahmed`, `ahmmed` -> `ahmed`)
 */
export function getUsernameSimilarityKey(usernameInput: string): string {
  const norm = normalizeUsername(usernameInput);
  if (!norm) return '';
  return norm
    .replace(/[_.-]+/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/([a-z])\1+/g, '$1');
}

export function getUsernameSkeletonDocKey(usernameInput: string): string {
  const skel = getUsernameSimilarityKey(usernameInput);
  if (!skel) return '';
  return `skeleton_${skel}`;
}

/**
 * Validates that a username:
 * 1. Uses English characters (`A-Z` or `a-z`, treated identically) with optional digits/underscores.
 * 2. Contains AT LEAST 4 English letters (`[a-zA-Z]`).
 * 3. Does not exceed 30 characters.
 */
export function validateUsernameFormat(usernameInput: string): {
  valid: boolean;
  normalized: string;
  similarityKey: string;
  englishLettersCount: number;
  message?: string;
} {
  const rawTrimmed = (usernameInput || '').trim().replace(/^@+/, '');
  const hasArabicOrInvalidChars = /[^a-zA-Z0-9_\s]/.test(rawTrimmed);
  const normalized = normalizeUsername(rawTrimmed);
  const similarityKey = getUsernameSimilarityKey(normalized);
  const englishLettersCount = (normalized.match(/[a-z]/g) || []).length;

  if (!rawTrimmed) {
    return {
      valid: false,
      normalized: '',
      similarityKey: '',
      englishLettersCount: 0,
      message: 'يرجى إدخال اسم المستخدم (4 أحرف إنجليزية على الأقل).'
    };
  }

  if (hasArabicOrInvalidChars) {
    return {
      valid: false,
      normalized,
      similarityKey,
      englishLettersCount,
      message: 'اسم المستخدم يجب أن يتكون من أحرف إنجليزية فقط (A-Z) وتُعامل الأحرف الكبيرة والصغيرة بنفس القيمة.'
    };
  }

  if (englishLettersCount < 4 || normalized.length < 4) {
    return {
      valid: false,
      normalized,
      similarityKey,
      englishLettersCount,
      message: `اسم المستخدم يجب أن يحتوي على 4 أحرف إنجليزية على الأقل (أدخلت ${englishLettersCount} أحرف إنجليزية حالياً). الأحرف الكبيرة والصغيرة لها نفس القيمة.`
    };
  }

  if (normalized.length > 30) {
    return {
      valid: false,
      normalized: normalized.slice(0, 30),
      similarityKey,
      englishLettersCount,
      message: 'اسم المستخدم يجب ألا يتجاوز 30 حرفاً.'
    };
  }

  return {
    valid: true,
    normalized,
    similarityKey,
    englishLettersCount
  };
}

export function getUsernameDocKey(usernameInput: string): string {
  const norm = normalizeUsername(usernameInput);
  if (!norm) return '';
  return `username_${norm}`;
}

export function usernameToAuthEmail(usernameInput: string): string {
  const norm = normalizeUsername(usernameInput);
  if (!norm || norm.length < 3) {
    throw new Error('اسم المستخدم يجب أن يتكون من 4 أحرف إنجليزية على الأقل.');
  }
  return `user_${norm}@users.umed.edu.ye`;
}

export function getDefaultUsernamePassword(usernameInput: string): string {
  const norm = normalizeUsername(usernameInput);
  return `Umed_Cloud_${norm}_2026!`;
}

export function isSyntheticUserEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return (
    (lower.startsWith('phone_') && lower.endsWith('@umed.edu.ye')) ||
    (lower.startsWith('user_') && lower.endsWith('@users.umed.edu.ye'))
  );
}

export function extractUsernameFromAuthEmail(email?: string | null): string {
  if (!email) return '';
  const lower = email.trim().toLowerCase();
  const mAscii = lower.match(/^user_([a-z0-9._-]+)@users\.umed\.edu\.ye$/i);
  if (mAscii && !mAscii[1].startsWith('u')) {
    return mAscii[1];
  }
  const mHex = lower.match(/^user_u([0-9a-f_]+)@users\.umed\.edu\.ye$/i);
  if (mHex && mHex[1]) {
    try {
      return mHex[1]
        .split('_')
        .filter(Boolean)
        .map((hex) => String.fromCharCode(parseInt(hex, 16)))
        .join('');
    } catch {
      return mHex[1];
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// 5A. Device Fingerprint & Single-Account-Per-Phone Verification System
// ---------------------------------------------------------------------------

const DEVICE_ID_STORAGE_KEY = 'umed_device_id_v1';
const DEVICE_BOUND_ACCOUNT_KEY = 'umed_device_bound_account_v1';

function readDeviceCookie(): string {
  try {
    if (typeof document === 'undefined') return '';
    const match = document.cookie.match(/(?:^|;\s*)umed_device_id=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function writeDeviceCookie(deviceId: string): void {
  try {
    if (typeof document === 'undefined') return;
    const maxAge = 60 * 60 * 24 * 365 * 5; // 5 years
    document.cookie = `umed_device_id=${encodeURIComponent(deviceId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {}
}

/**
 * Generates a deterministic hardware signature of the phone/browser + persistent device ID
 * to prevent opening multiple student accounts from the same phone.
 */
export function getDeviceFingerprint(): { deviceId: string; hardwareHash: string } {
  let hardwareHash = 'hw_default';
  try {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      const screenPart = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 24}`;
      const ratioPart = `${Math.round((window.devicePixelRatio || 1) * 100)}`;
      const coresPart = `${navigator.hardwareConcurrency || 4}`;
      const touchPart = `${navigator.maxTouchPoints || 0}`;
      const platformPart = (navigator.platform || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const tzPart = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const uaClean = (navigator.userAgent || '')
        .toLowerCase()
        .replace(/\b(chrome|version|safari|firefox|edg)\/[\d.]+/g, '')
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 48);
      const rawTrait = `${screenPart}_${ratioPart}_${coresPart}_${touchPart}_${platformPart}_${tzPart}_${uaClean}`;
      let hash = 5381;
      for (let i = 0; i < rawTrait.length; i++) {
        hash = (hash * 33) ^ rawTrait.charCodeAt(i);
      }
      hardwareHash = `hw_${(hash >>> 0).toString(16)}_${screenPart}_${coresPart}`;
    }
  } catch {}

  let deviceId = '';
  try {
    deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY) || readDeviceCookie() || '';
    if (!deviceId) {
      const rand = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      deviceId = `dev_${rand}`;
    }
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    writeDeviceCookie(deviceId);
  } catch {
    deviceId = `dev_${hardwareHash}`;
  }

  return { deviceId, hardwareHash };
}

export function getDeviceDocKey(deviceId: string): string {
  const clean = (deviceId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  return clean ? `device_${clean}` : '';
}

export function getLocalDeviceBoundAccount(): {
  uid: string;
  username: string;
  displayNameArabic?: string;
} | null {
  try {
    const raw = localStorage.getItem(DEVICE_BOUND_ACCOUNT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.uid && parsed.username) return parsed;
    }
  } catch {}
  return null;
}

export function saveLocalDeviceBoundAccount(info: {
  uid: string;
  username: string;
  displayNameArabic?: string;
}): void {
  try {
    localStorage.setItem(DEVICE_BOUND_ACCOUNT_KEY, JSON.stringify(info));
  } catch {}
}

export function clearLocalDeviceBoundAccount(): void {
  try {
    localStorage.removeItem(DEVICE_BOUND_ACCOUNT_KEY);
  } catch {}
}

/**
 * Verifies that this phone/device does not already have another active account registered.
 * Prevents opening more than one student account from the same phone.
 */
export async function checkDeviceSingleAccountPolicy(params?: {
  excludeUid?: string;
  candidateUsername?: string;
  callerEmail?: string;
}): Promise<{
  allowed: boolean;
  existingUid?: string;
  existingUsername?: string;
  existingDisplayName?: string;
  message?: string;
}> {
  if (params?.callerEmail && isInitialOwnerEmail(params.callerEmail)) {
    return { allowed: true };
  }
  const excludeUid = params?.excludeUid?.trim() || '';
  const candidateNorm = params?.candidateUsername ? normalizeUsername(params.candidateUsername) : '';
  const { deviceId } = getDeviceFingerprint();
  const deviceDocId = getDeviceDocKey(deviceId);

  // 1. Check Cloud Firestore device reservation (`uniqueIdentifiers/device_<deviceId>`)
  if (deviceDocId) {
    try {
      const snap = await getDoc(doc(db, 'uniqueIdentifiers', deviceDocId));
      if (snap.exists()) {
        const rec = snap.data() as UniqueIdentifierRecord;
        if (rec.uid && rec.uid !== excludeUid) {
          const isDeleted = await isAccountDeletedInCloud(rec.uid);
          if (isDeleted) {
            await releaseIdentifierKeyFromCloud(deviceDocId);
            clearLocalDeviceBoundAccount();
          } else {
            const profSnap = await getDoc(doc(db, 'userProfiles', rec.uid)).catch(() => null);
            if (!profSnap || !profSnap.exists()) {
              // Stale device lock where profile was deleted
              await releaseIdentifierKeyFromCloud(deviceDocId);
              clearLocalDeviceBoundAccount();
            } else {
              const prof = profSnap.data() as UserProfile;
              const boundUsername = normalizeUsername(prof.username || rec.username || rec.value || '');
              // If the student typed their own bound username on this phone, allow them so signUpWithUsername can auto-login!
              if (candidateNorm && boundUsername && candidateNorm === boundUsername) {
                return {
                  allowed: true,
                  existingUid: rec.uid,
                  existingUsername: boundUsername,
                  existingDisplayName: prof.displayNameArabic
                };
              }
              saveLocalDeviceBoundAccount({
                uid: rec.uid,
                username: boundUsername,
                displayNameArabic: prof.displayNameArabic
              });
              return {
                allowed: false,
                existingUid: rec.uid,
                existingUsername: boundUsername,
                existingDisplayName: prof.displayNameArabic,
                message: `نظام التحقق من الجهاز: هذا الهاتف مسجل به حساب مسبقاً باسم المستخدم (@${boundUsername}). لا يُسمح بفتح أكثر من حساب من نفس الهاتف.`
              };
            }
          }
        }
      }
    } catch {}
  }

  // 2. Check local device bound account cache
  const localBound = getLocalDeviceBoundAccount();
  if (localBound && localBound.uid && localBound.uid !== excludeUid) {
    const isDeleted = await isAccountDeletedInCloud(localBound.uid);
    if (isDeleted) {
      clearLocalDeviceBoundAccount();
    } else {
      const boundUsername = normalizeUsername(localBound.username);
      if (candidateNorm && boundUsername && candidateNorm === boundUsername) {
        return {
          allowed: true,
          existingUid: localBound.uid,
          existingUsername: boundUsername,
          existingDisplayName: localBound.displayNameArabic
        };
      }
      return {
        allowed: false,
        existingUid: localBound.uid,
        existingUsername: boundUsername,
        existingDisplayName: localBound.displayNameArabic,
        message: `نظام التحقق من الجهاز: هذا الهاتف مرتبط بحساب مسجل مسبقاً (@${boundUsername}). لا يُسمح بفتح أكثر من حساب من نفس الهاتف.`
      };
    }
  }

  return { allowed: true };
}

export async function reserveDeviceAccountBinding(uid: string, username: string, displayNameArabic?: string): Promise<void> {
  if (!uid || !username) return;
  const normUser = normalizeUsername(username);
  const { deviceId } = getDeviceFingerprint();
  const deviceDocId = getDeviceDocKey(deviceId);
  const nowIso = new Date().toISOString();

  saveLocalDeviceBoundAccount({ uid, username: normUser, displayNameArabic });

  if (deviceDocId) {
    const rec: UniqueIdentifierRecord = {
      id: deviceDocId,
      type: 'device',
      value: normUser,
      normalizedValue: deviceId,
      uid,
      username: normUser,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    saveLocalUniqueRecord(rec);
    try {
      await setDoc(doc(db, 'uniqueIdentifiers', deviceDocId), cleanFirestoreData(rec), { merge: true });
    } catch {}
  }
}

export async function releaseDeviceAccountBinding(deviceId?: string): Promise<void> {
  clearLocalDeviceBoundAccount();
  const targetDeviceId = deviceId || getDeviceFingerprint().deviceId;
  const docKey = getDeviceDocKey(targetDeviceId);
  if (docKey) {
    await releaseIdentifierKeyFromCloud(docKey);
  }
}

// ---------------------------------------------------------------------------
// 5A-2. Profile Picture Upload/Compression & Academic Options (University / Specialty / Level)
// ---------------------------------------------------------------------------

export const YEMEN_UNIVERSITIES_OPTIONS: { id: string; nameArabic: string; cityArabic: string }[] = [
  { id: 'univ-dar-al-salam', nameArabic: 'جامعة دار السلام الدولية للعلوم والتكنولوجيا', cityArabic: 'صنعاء' },
  { id: 'univ-sanaa', nameArabic: 'جامعة صنعاء', cityArabic: 'صنعاء' },
  { id: 'univ-aden', nameArabic: 'جامعة عدن', cityArabic: 'عدن' },
  { id: 'univ-ust', nameArabic: 'جامعة العلوم والتكنولوجيا', cityArabic: 'صنعاء / عدن' },
  { id: 'univ-21-sep', nameArabic: 'جامعة 21 سبتمبر للعلوم الطبية والتطبيقية', cityArabic: 'صنعاء' },
  { id: 'univ-al-razi', nameArabic: 'جامعة الرازي', cityArabic: 'صنعاء' },
  { id: 'univ-taiz', nameArabic: 'جامعة تعز', cityArabic: 'تعز' },
  { id: 'univ-hadhramout', nameArabic: 'جامعة حضرموت', cityArabic: 'المكلا' },
  { id: 'univ-ibb', nameArabic: 'جامعة إب', cityArabic: 'إب' },
  { id: 'univ-thamar', nameArabic: 'جامعة ذمار', cityArabic: 'ذمار' },
  { id: 'univ-hodeidah', nameArabic: 'جامعة الحديدة', cityArabic: 'الحديدة' },
  { id: 'univ-al-saeedah', nameArabic: 'جامعة السعيدة', cityArabic: 'صنعاء / ذمار' },
  { id: 'univ-national', nameArabic: 'الجامعة الوطنية', cityArabic: 'صنعاء / تعز' },
  { id: 'univ-hikma', nameArabic: 'جامعة الحكمة', cityArabic: 'صنعاء / تعز / ذمار' },
  { id: 'univ-queen-arwa', nameArabic: 'جامعة الملكة أروى', cityArabic: 'صنعاء' },
  { id: 'univ-al-jened', nameArabic: 'جامعة الجند للعلوم والتكنولوجيا', cityArabic: 'تعز' }
];

export const MEDICAL_SPECIALTIES_OPTIONS: { id: string; nameArabic: string }[] = [
  { id: 'spec-mbbs', nameArabic: 'الطب العام والجراحة (MBBS)' },
  { id: 'spec-dentistry', nameArabic: 'طب وجراحة الفم والأسنان (BDS)' },
  { id: 'spec-pharmacy', nameArabic: 'الصيدلة السريرية والدوائية (PharmD)' },
  { id: 'spec-labs', nameArabic: 'المختبرات الطبية والعلوم التشخيصية' },
  { id: 'spec-nursing', nameArabic: 'التمريض العالي والرعاية الحرجة' },
  { id: 'spec-anesthesia', nameArabic: 'التخدير والعناية المركزة' },
  { id: 'spec-physio', nameArabic: 'العلاج الطبيعي والتأهيل الطبي' },
  { id: 'spec-radiology', nameArabic: 'الأشعة والتصوير الطبي التشخيصي' },
  { id: 'spec-nutrition', nameArabic: 'التغذية العلاجية والحميات' }
];

export const STUDY_LEVELS_OPTIONS: { id: string; nameArabic: string }[] = [
  { id: 'lvl-1', nameArabic: 'المستوى الأول (Year 1)' },
  { id: 'lvl-2', nameArabic: 'المستوى الثاني (Year 2)' },
  { id: 'lvl-3', nameArabic: 'المستوى الثالث (Year 3)' },
  { id: 'lvl-4', nameArabic: 'المستوى الرابع (Year 4)' },
  { id: 'lvl-5', nameArabic: 'المستوى الخامس (Year 5)' },
  { id: 'lvl-6', nameArabic: 'المستوى السادس (Year 6)' },
  { id: 'lvl-internship', nameArabic: 'سنة الامتياز السريرية (Internship)' }
];

export const MEDICAL_PRESET_AVATARS: string[] = [
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0d9488"/><stop offset="100%" stop-color="#047857"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g1)"/><circle cx="60" cy="44" r="20" fill="#f8fafc"/><path d="M26 104c4-22 20-34 34-34s30 12 34 34" fill="#f8fafc"/><path d="M52 78v14m16-14v14" stroke="#0d9488" stroke-width="4" stroke-linecap="round"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0284c7"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g2)"/><circle cx="60" cy="44" r="20" fill="#f8fafc"/><path d="M26 104c4-22 20-34 34-34s30 12 34 34" fill="#f8fafc"/><circle cx="60" cy="86" r="6" fill="#0284c7"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#4338ca"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g3)"/><circle cx="60" cy="44" r="20" fill="#f8fafc"/><path d="M26 104c4-22 20-34 34-34s30 12 34 34" fill="#f8fafc"/><path d="M55 85h10M60 80v10" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#d97706"/><stop offset="100%" stop-color="#b45309"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g4)"/><circle cx="60" cy="44" r="20" fill="#f8fafc"/><path d="M26 104c4-22 20-34 34-34s30 12 34 34" fill="#f8fafc"/></svg>')}`
];

/**
 * Compresses and center-crops an uploaded image file to a fast 240x240 JPEG Data URL (~15-30 KB)
 * so it can be stored directly in Cloud Firestore (`userProfiles.avatarUrl`) and synced across devices.
 */
export function compressAndReadProfileImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('يرجى اختيار ملف صورة صالح (JPG أو PNG أو WebP).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة من الجهاز.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('صيغة الصورة غير مدعومة.'));
      img.onload = () => {
        try {
          const targetSize = 240;
          const canvas = document.createElement('canvas');
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(String(reader.result || ''));
            return;
          }
          const minSide = Math.min(img.width, img.height);
          const sx = Math.max(0, (img.width - minSide) / 2);
          const sy = Math.max(0, (img.height - minSide) / 2);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, targetSize, targetSize);
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          resolve(dataUrl);
        } catch (err) {
          resolve(String(reader.result || ''));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function getAcademicIdDocKey(academicInput: string): string {
  const alphanumeric = academicInput.trim().toUpperCase().replace(/[^A-Z0-9\u0600-\u06FF]/g, '');
  return `acad_${alphanumeric}`;
}

export function getEmailDocKey(emailInput: string): string {
  const clean = normalizeEmail(emailInput).replace(/[^a-z0-9@._-]/g, '_');
  return `email_${clean}`;
}

export function getPhoneDocKey(phoneInput: string): string {
  const norm = normalizeYemenPhone(phoneInput);
  const digits = norm.replace(/\D/g, '');
  return digits ? `phone_${digits}` : '';
}

export function isPhoneIdentifier(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes('@')) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8 && /^[\d+\s()-]+$/.test(trimmed);
}

export function phoneToAuthEmail(phoneInput: string): string {
  const check = validateYemenPhoneFormat(phoneInput);
  if (!check.valid || !check.normalized) {
    throw new Error('INVALID_PHONE_NUMBER');
  }
  const cleanDigits = check.normalized.replace(/\D/g, '');
  return `phone_${cleanDigits}@umed.edu.ye`;
}

export function formatUserIdentifier(
  email?: string | null,
  phone?: string | null,
  username?: string | null
): string {
  if (username && username.trim()) return `@${normalizeUsername(username)}`;
  const extractedUser = extractUsernameFromAuthEmail(email);
  if (extractedUser) return `@${extractedUser}`;
  if (phone && phone.trim()) return phone.trim();
  if (!email) return '';
  const match = email.match(/^phone_(\d+)@umed\.edu\.ye$/i);
  if (match) {
    return `+${match[1]}`;
  }
  return email;
}

// ---------------------------------------------------------------------------
// 5B. Primary Owner Official Identity & Global Uniqueness Registry
// ---------------------------------------------------------------------------

const UNIQUE_CACHE_KEY = 'umed_unique_identifiers_cache';
const OWNER_IDENTITY_CACHE_KEY = 'umed_primary_owner_identity';
const DELETED_USERS_CACHE_KEY = 'umed_deleted_user_uids';

export function getLocalDeletedUids(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_USERS_CACHE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}

export function markUidDeletedLocally(uid: string): void {
  if (!uid) return;
  try {
    const set = getLocalDeletedUids();
    set.add(uid);
    localStorage.setItem(DELETED_USERS_CACHE_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

export function unmarkUidDeletedLocally(uid: string): void {
  if (!uid) return;
  try {
    const set = getLocalDeletedUids();
    if (set.has(uid)) {
      set.delete(uid);
      localStorage.setItem(DELETED_USERS_CACHE_KEY, JSON.stringify(Array.from(set)));
    }
  } catch (e) {}
}

export async function isAccountDeletedInCloud(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, 'deletedAccounts', uid));
    if (snap.exists()) {
      markUidDeletedLocally(uid);
      return true;
    }
  } catch (e) {}
  return false;
}

export function getCachedPrimaryOwnerIdentity(): PrimaryOwnerIdentityConfig {
  try {
    const raw = localStorage.getItem(OWNER_IDENTITY_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PrimaryOwnerIdentityConfig;
      return {
        ...parsed,
        primaryEmail: 'alssaedy50@gmail.com',
        secondaryEmail: 'alssaedy500@gmail.com',
        emails: ['alssaedy50@gmail.com', 'alssaedy500@gmail.com'],
        phone: normalizeYemenPhone(parsed.phone || DEFAULT_OWNER_PHONE) || DEFAULT_OWNER_PHONE,
        username: parsed.username || 'umed_owner',
        displayNameArabic: parsed.displayNameArabic || DEFAULT_OWNER_NAME_ARABIC,
        academicStudentNumber: parsed.academicStudentNumber || DEFAULT_OWNER_ACADEMIC_ID
      };
    }
  } catch (e) {}
  return {
    primaryEmail: 'alssaedy50@gmail.com',
    secondaryEmail: 'alssaedy500@gmail.com',
    emails: ['alssaedy50@gmail.com', 'alssaedy500@gmail.com'],
    phone: DEFAULT_OWNER_PHONE,
    username: 'umed_owner',
    displayNameArabic: DEFAULT_OWNER_NAME_ARABIC,
    academicStudentNumber: DEFAULT_OWNER_ACADEMIC_ID,
    updatedAt: new Date().toISOString()
  };
}

export async function fetchPrimaryOwnerIdentity(): Promise<PrimaryOwnerIdentityConfig> {
  const fallback = getCachedPrimaryOwnerIdentity();
  try {
    const snap = await getDoc(doc(db, 'system', 'owner_identity'));
    if (snap.exists()) {
      const data = snap.data() as Partial<PrimaryOwnerIdentityConfig>;
      const merged: PrimaryOwnerIdentityConfig = {
        primaryEmail: 'alssaedy50@gmail.com',
        secondaryEmail: 'alssaedy500@gmail.com',
        emails: ['alssaedy50@gmail.com', 'alssaedy500@gmail.com'],
        phone: normalizeYemenPhone(data.phone || fallback.phone) || DEFAULT_OWNER_PHONE,
        username: data.username || fallback.username || 'umed_owner',
        displayNameArabic: data.displayNameArabic || fallback.displayNameArabic,
        academicStudentNumber: data.academicStudentNumber || fallback.academicStudentNumber,
        ownerUid: data.ownerUid || fallback.ownerUid,
        updatedAt: data.updatedAt || new Date().toISOString()
      };
      try {
        localStorage.setItem(OWNER_IDENTITY_CACHE_KEY, JSON.stringify(merged));
      } catch (e) {}
      return merged;
    }
  } catch (e) {}
  return fallback;
}

export function isInitialOwnerPhone(phone?: string | null): boolean {
  if (!phone) return false;
  const norm = normalizeYemenPhone(phone);
  if (!norm) return false;
  const ownerConfig = getCachedPrimaryOwnerIdentity();
  return norm === ownerConfig.phone;
}

function getLocalUniqueCache(): Record<string, UniqueIdentifierRecord> {
  try {
    const raw = localStorage.getItem(UNIQUE_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function saveLocalUniqueRecord(rec: UniqueIdentifierRecord) {
  try {
    const map = getLocalUniqueCache();
    map[rec.id] = rec;
    localStorage.setItem(UNIQUE_CACHE_KEY, JSON.stringify(map));
  } catch (e) {}
}

function removeLocalUniqueRecord(id: string) {
  try {
    const map = getLocalUniqueCache();
    if (map[id]) {
      delete map[id];
      localStorage.setItem(UNIQUE_CACHE_KEY, JSON.stringify(map));
    }
  } catch (e) {}
}

export async function releaseIdentifierKeyFromCloud(docKey?: string): Promise<void> {
  if (!docKey || !docKey.trim()) return;
  removeLocalUniqueRecord(docKey);
  try {
    await deleteDoc(doc(db, 'uniqueIdentifiers', docKey));
  } catch (e) {}
}

/**
 * Checks that Username (case-insensitive + anti-similarity), Email, Phone Number, and Academic Student Number
 * are 100% unique and not registered to any other active user account (`uid !== excludeUid`).
 */
export async function checkIdentifierUniqueness(params: {
  username?: string;
  email?: string;
  phone?: string;
  academicStudentNumber?: string;
  excludeUid?: string;
  allowOwnerSelfRegister?: boolean;
}): Promise<{
  isUnique: boolean;
  conflictField?: 'username' | 'email' | 'phone' | 'academic_id';
  message?: string;
}> {
  const excludeUid = params.excludeUid?.trim() || '';
  const ownerIdentity = await fetchPrimaryOwnerIdentity();
  const isCallerOwnerEmail = Boolean(params.email && isInitialOwnerEmail(params.email));

  // 0. Check Unique Username (`username`) + Case-Insensitivity + Anti-Similarity in Cloud Firestore
  if (params.username && params.username.trim()) {
    const usernameValidation = validateUsernameFormat(params.username);
    if (!usernameValidation.valid) {
      return {
        isUnique: false,
        conflictField: 'username',
        message: usernameValidation.message
      };
    }
    const normUsername = usernameValidation.normalized;
    const similarityKey = usernameValidation.similarityKey;
    const usernameDocId = getUsernameDocKey(normUsername);
    const skeletonDocId = getUsernameSkeletonDocKey(normUsername);

    // 0.1 Exact case-insensitive check in `uniqueIdentifiers/username_<norm>`
    let cloudChecked = false;
    try {
      const snap = await getDoc(doc(db, 'uniqueIdentifiers', usernameDocId));
      cloudChecked = true;
      if (snap.exists()) {
        const data = snap.data() as UniqueIdentifierRecord;
        const isDeleted = data.uid ? await isAccountDeletedInCloud(data.uid) : false;
        if (isDeleted) {
          await releaseIdentifierKeyFromCloud(usernameDocId);
        } else {
          saveLocalUniqueRecord(data);
          if (data.uid && data.uid !== excludeUid) {
            return {
              isUnique: false,
              conflictField: 'username',
              message: `اسم المستخدم (@${normUsername}) محجوز ومستخدم مسبقاً في السحابة (الأحرف الكبيرة والصغيرة لها نفس القيمة). يرجى اختيار اسم مستخدم آخر.`
            };
          }
        }
      } else {
        removeLocalUniqueRecord(usernameDocId);
      }
    } catch (e) {}

    // 0.2 Anti-Similarity check in `uniqueIdentifiers/skeleton_<skel>`
    if (skeletonDocId) {
      try {
        const skelSnap = await getDoc(doc(db, 'uniqueIdentifiers', skeletonDocId));
        if (skelSnap.exists()) {
          const skelData = skelSnap.data() as UniqueIdentifierRecord;
          const isDeleted = skelData.uid ? await isAccountDeletedInCloud(skelData.uid) : false;
          if (isDeleted) {
            await releaseIdentifierKeyFromCloud(skeletonDocId);
          } else if (skelData.uid && skelData.uid !== excludeUid) {
            const existingName = skelData.username || skelData.value || normUsername;
            return {
              isUnique: false,
              conflictField: 'username',
              message: `منع تشابه أسماء المستخدمين: اسم المستخدم (@${normUsername}) مشابه جداً أو مطابق لاسم مستخدم مسجل مسبقاً (@${existingName}). يرجى اختيار اسم مستخدم مختلف ومميز.`
            };
          }
        }
      } catch (e) {}
    }

    if (!cloudChecked) {
      const localCache = getLocalUniqueCache();
      const cachedRec = localCache[usernameDocId] || (skeletonDocId ? localCache[skeletonDocId] : undefined);
      if (cachedRec && cachedRec.uid && cachedRec.uid !== excludeUid) {
        return {
          isUnique: false,
          conflictField: 'username',
          message: `اسم المستخدم (@${normUsername}) مستخدم أو مشابه لاسم مسجل مسبقاً.`
        };
      }
    }

    // 0.3 Verify against all active `userProfiles` in Cloud Firestore for both exact & similarity match
    try {
      const snap = await getDocs(collection(db, 'userProfiles'));
      for (const d of snap.docs) {
        if (d.id === excludeUid) continue;
        const prof = d.data() as UserProfile;
        if (!prof || !prof.username) continue;
        const otherNorm = normalizeUsername(prof.username);
        const otherSkel = getUsernameSimilarityKey(otherNorm);
        if (otherNorm === normUsername || (similarityKey && otherSkel === similarityKey)) {
          if (!(await isAccountDeletedInCloud(d.id))) {
            return {
              isUnique: false,
              conflictField: 'username',
              message:
                otherNorm === normUsername
                  ? `اسم المستخدم (@${normUsername}) مرتبط بحساب طالب آخر في السحابة.`
                  : `منع تشابه أسماء المستخدمين: الاسم (@${normUsername}) يتشابه مع اسم المستخدم المسجل (@${otherNorm}). يرجى اختيار اسم مختلف.`
            };
          }
        }
      }
    } catch (e) {}
  }

  // 1. Check Email Uniqueness
  if (params.email && params.email.trim() && !isSyntheticUserEmail(params.email)) {
    const emailValidation = validateEmailFormat(params.email);
    if (!emailValidation.valid) {
      return { isUnique: false, conflictField: 'email', message: emailValidation.message };
    }
    const normEmail = emailValidation.normalized;
    const emailDocId = getEmailDocKey(normEmail);

    if (isInitialOwnerEmail(normEmail)) {
      if (excludeUid && ownerIdentity.ownerUid && excludeUid !== ownerIdentity.ownerUid) {
        return {
          isUnique: false,
          conflictField: 'email',
          message: `البريد الإلكتروني (${normEmail}) مخصص حصرياً للمالك الأساسي للمنصة ولا يُسمح بتكراره أو ربطه بحساب آخر.`
        };
      }
    }

    let cloudChecked = false;
    try {
      const snap = await getDoc(doc(db, 'uniqueIdentifiers', emailDocId));
      cloudChecked = true;
      if (snap.exists()) {
        const data = snap.data() as UniqueIdentifierRecord;
        const isDeleted = data.uid ? await isAccountDeletedInCloud(data.uid) : false;
        if (isDeleted) {
          await releaseIdentifierKeyFromCloud(emailDocId);
        } else {
          saveLocalUniqueRecord(data);
          if (data.uid && data.uid !== excludeUid) {
            if (!(isInitialOwnerEmail(normEmail) && (data.uid === 'PRIMARY_OWNER_RESERVED' || params.allowOwnerSelfRegister))) {
              return {
                isUnique: false,
                conflictField: 'email',
                message: `البريد الإلكتروني (${normEmail}) مسجل مسبقاً لحساب آخر في المنصة. لا يُسمح بتكرار البريد الإلكتروني.`
              };
            }
          }
        }
      } else {
        removeLocalUniqueRecord(emailDocId);
      }
    } catch (e) {}

    if (!cloudChecked) {
      const localCache = getLocalUniqueCache();
      const cachedEmailRec = localCache[emailDocId];
      if (cachedEmailRec && cachedEmailRec.uid && cachedEmailRec.uid !== excludeUid) {
        return {
          isUnique: false,
          conflictField: 'email',
          message: `البريد الإلكتروني (${normEmail}) مسجل مسبقاً لحساب آخر في المنصة.`
        };
      }
    }

    try {
      const q = query(collection(db, 'userProfiles'), where('email', '==', normEmail));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (d.id !== excludeUid && !(await isAccountDeletedInCloud(d.id))) {
          if (!(isInitialOwnerEmail(normEmail) && params.allowOwnerSelfRegister)) {
            return {
              isUnique: false,
              conflictField: 'email',
              message: `البريد الإلكتروني (${normEmail}) مرتبط بحساب مسجل مسبقاً في المنصة.`
            };
          }
        }
      }
    } catch (e) {}
  }

  // 2. Check Phone Number Uniqueness
  if (params.phone && params.phone.trim()) {
    const phoneValidation = validateYemenPhoneFormat(params.phone);
    if (!phoneValidation.valid) {
      return { isUnique: false, conflictField: 'phone', message: phoneValidation.message };
    }
    const normPhone = phoneValidation.normalized;
    const phoneDocId = getPhoneDocKey(normPhone);

    if (normPhone === ownerIdentity.phone && !isCallerOwnerEmail) {
      if (!excludeUid || (ownerIdentity.ownerUid && excludeUid !== ownerIdentity.ownerUid)) {
        return {
          isUnique: false,
          conflictField: 'phone',
          message: `رقم الهاتف (${normPhone}) مخصص حصرياً للمالك الأساسي للمنصة ولا يمكن تكراره أو التسجيل به لحساب آخر.`
        };
      }
    }

    if (phoneDocId) {
      let cloudChecked = false;
      try {
        const snap = await getDoc(doc(db, 'uniqueIdentifiers', phoneDocId));
        cloudChecked = true;
        if (snap.exists()) {
          const data = snap.data() as UniqueIdentifierRecord;
          const isDeleted = data.uid ? await isAccountDeletedInCloud(data.uid) : false;
          if (isDeleted) {
            await releaseIdentifierKeyFromCloud(phoneDocId);
          } else {
            saveLocalUniqueRecord(data);
            if (data.uid && data.uid !== excludeUid) {
              if (!(isCallerOwnerEmail && data.uid === 'PRIMARY_OWNER_RESERVED')) {
                return {
                  isUnique: false,
                  conflictField: 'phone',
                  message: `رقم الهاتف (${normPhone}) مسجل مسبقاً لحساب آخر في المنصة. لا يُسمح بالتسجيل بنفس رقم الهاتف لأكثر من حساب.`
                };
              }
            }
          }
        } else {
          removeLocalUniqueRecord(phoneDocId);
        }
      } catch (e) {}

      if (!cloudChecked) {
        const localCache = getLocalUniqueCache();
        const cachedPhoneRec = localCache[phoneDocId];
        if (cachedPhoneRec && cachedPhoneRec.uid && cachedPhoneRec.uid !== excludeUid) {
          return {
            isUnique: false,
            conflictField: 'phone',
            message: `رقم الهاتف (${normPhone}) مسجل مسبقاً لحساب آخر في المنصة.`
          };
        }
      }
    }

    try {
      const q = query(collection(db, 'userProfiles'), where('phone', '==', normPhone));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (d.id !== excludeUid && !(await isAccountDeletedInCloud(d.id))) {
          return {
            isUnique: false,
            conflictField: 'phone',
            message: `رقم الهاتف (${normPhone}) مرتبط بحساب مستخدم آخر مسجل مسبقاً.`
          };
        }
      }
    } catch (e) {}
  }

  // 3. Check Academic Registration Number (رقم القيد الأكاديمي) Uniqueness
  if (params.academicStudentNumber && params.academicStudentNumber.trim()) {
    const normAcad = normalizeAcademicId(params.academicStudentNumber);
    const acadDocId = getAcademicIdDocKey(params.academicStudentNumber);

    if (normAcad.length < 3) {
      return {
        isUnique: false,
        conflictField: 'academic_id',
        message: 'يرجى إدخال رقم قيد أكاديمي / جامعي صحيح (3 خانات على الأقل).'
      };
    }

    if (normAcad === ownerIdentity.academicStudentNumber && !isCallerOwnerEmail) {
      if (!excludeUid || (ownerIdentity.ownerUid && excludeUid !== ownerIdentity.ownerUid)) {
        return {
          isUnique: false,
          conflictField: 'academic_id',
          message: `الرمز (${normAcad}) محجوز للمالك الأساسي للمنصة.`
        };
      }
    }

    let cloudChecked = false;
    try {
      const snap = await getDoc(doc(db, 'uniqueIdentifiers', acadDocId));
      cloudChecked = true;
      if (snap.exists()) {
        const data = snap.data() as UniqueIdentifierRecord;
        const isDeleted = data.uid ? await isAccountDeletedInCloud(data.uid) : false;
        if (isDeleted) {
          await releaseIdentifierKeyFromCloud(acadDocId);
        } else {
          saveLocalUniqueRecord(data);
          if (data.uid && data.uid !== excludeUid) {
            if (!(isCallerOwnerEmail && data.uid === 'PRIMARY_OWNER_RESERVED')) {
              return {
                isUnique: false,
                conflictField: 'academic_id',
                message: `رقم القيد الأكاديمي (${normAcad}) مسجل مسبقاً لطالب آخر في المنصة. لا يمكن استخدام نفس رقم القيد لأكثر من حساب.`
              };
            }
          }
        }
      } else {
        removeLocalUniqueRecord(acadDocId);
      }
    } catch (e) {}

    if (!cloudChecked) {
      const localCache = getLocalUniqueCache();
      const cachedAcadRec = localCache[acadDocId];
      if (cachedAcadRec && cachedAcadRec.uid && cachedAcadRec.uid !== excludeUid) {
        return {
          isUnique: false,
          conflictField: 'academic_id',
          message: `رقم القيد الأكاديمي (${normAcad}) مسجل مسبقاً لطالب آخر في المنصة.`
        };
      }
    }

    try {
      const qEnr = query(collection(db, 'studentEnrollments'), where('academicStudentNumber', '==', normAcad));
      const snapEnr = await getDocs(qEnr);
      for (const d of snapEnr.docs) {
        const data = d.data();
        if (data.uid && data.uid !== excludeUid && !(await isAccountDeletedInCloud(data.uid))) {
          return {
            isUnique: false,
            conflictField: 'academic_id',
            message: `رقم القيد الأكاديمي (${normAcad}) مستخدم بالفعل في سجل قيد طالب آخر.`
          };
        }
      }
    } catch (e) {}
  }

  return { isUnique: true };
}

/**
 * Reserves Username (and its anti-similarity skeleton), Email, Phone Number, and Academic Registration Number
 * in Firestore `uniqueIdentifiers` so no other account can claim them.
 */
export async function reserveUniqueIdentifiers(params: {
  uid: string;
  username?: string;
  email?: string;
  phone?: string;
  academicStudentNumber?: string;
  universityId?: string;
}): Promise<void> {
  if (!params.uid) return;
  const nowIso = new Date().toISOString();
  const recordsToWrite: UniqueIdentifierRecord[] = [];

  if (params.username && params.username.trim()) {
    const normUser = normalizeUsername(params.username);
    const userKey = getUsernameDocKey(normUser);
    const skelKey = getUsernameSkeletonDocKey(normUser);
    const skelVal = getUsernameSimilarityKey(normUser);
    if (normUser && userKey) {
      recordsToWrite.push({
        id: userKey,
        type: 'username',
        value: normUser,
        normalizedValue: normUser,
        uid: params.uid,
        username: normUser,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }
    if (skelVal && skelKey) {
      recordsToWrite.push({
        id: skelKey,
        type: 'username_skeleton',
        value: normUser,
        normalizedValue: skelVal,
        uid: params.uid,
        username: normUser,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }
  }

  if (params.email && params.email.trim() && !isSyntheticUserEmail(params.email)) {
    const normEmail = normalizeEmail(params.email);
    recordsToWrite.push({
      id: getEmailDocKey(normEmail),
      type: 'email',
      value: params.email.trim(),
      normalizedValue: normEmail,
      uid: params.uid,
      createdAt: nowIso,
      updatedAt: nowIso
    });
  }

  if (params.phone && params.phone.trim()) {
    const normPhone = normalizeYemenPhone(params.phone);
    const phoneKey = getPhoneDocKey(normPhone);
    if (normPhone && phoneKey) {
      recordsToWrite.push({
        id: phoneKey,
        type: 'phone',
        value: normPhone,
        normalizedValue: normPhone,
        uid: params.uid,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }
  }

  if (params.academicStudentNumber && params.academicStudentNumber.trim()) {
    const normAcad = normalizeAcademicId(params.academicStudentNumber);
    const acadKey = getAcademicIdDocKey(params.academicStudentNumber);
    if (normAcad && acadKey) {
      recordsToWrite.push({
        id: acadKey,
        type: 'academic_id',
        value: params.academicStudentNumber.trim(),
        normalizedValue: normAcad,
        uid: params.uid,
        ...(params.universityId ? { universityId: params.universityId } : {}),
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }
  }

  for (const rec of recordsToWrite) {
    saveLocalUniqueRecord(rec);
    try {
      await setDoc(doc(db, 'uniqueIdentifiers', rec.id), cleanFirestoreData(rec), { merge: true });
    } catch (e) {}
  }
}

export async function releaseAcademicIdentifier(academicStudentNumber?: string): Promise<void> {
  if (!academicStudentNumber || !academicStudentNumber.trim()) return;
  const acadKey = getAcademicIdDocKey(academicStudentNumber);
  await releaseIdentifierKeyFromCloud(acadKey);
}

export async function releaseUsernameIdentifier(username?: string): Promise<void> {
  if (!username || !username.trim()) return;
  const userKey = getUsernameDocKey(username);
  const skelKey = getUsernameSkeletonDocKey(username);
  await Promise.all([
    releaseIdentifierKeyFromCloud(userKey),
    skelKey ? releaseIdentifierKeyFromCloud(skelKey) : Promise.resolve()
  ]);
}

/**
 * Synchronizes, locks, and deduplicates the Primary Platform Owner's identity
 * (alssaedy50@gmail.com, alssaedy500@gmail.com, official phone number, and academic ID)
 * across Firestore `system/owner_identity`, `uniqueIdentifiers`, `userProfiles`, and `userRoles`.
 */
export async function syncAndDeduplicatePrimaryOwnerIdentity(params: {
  ownerUid: string;
  phone?: string;
  displayNameArabic?: string;
  academicStudentNumber?: string;
}): Promise<PrimaryOwnerIdentityConfig> {
  const currentConfig = await fetchPrimaryOwnerIdentity();
  const normPhone = normalizeYemenPhone(params.phone || currentConfig.phone || DEFAULT_OWNER_PHONE) || DEFAULT_OWNER_PHONE;
  const normAcad = normalizeAcademicId(params.academicStudentNumber || currentConfig.academicStudentNumber || DEFAULT_OWNER_ACADEMIC_ID);
  const nameAr = (params.displayNameArabic || currentConfig.displayNameArabic || DEFAULT_OWNER_NAME_ARABIC).trim();
  const nowIso = new Date().toISOString();

  if (currentConfig.phone && currentConfig.phone !== normPhone) {
    await releaseIdentifierKeyFromCloud(getPhoneDocKey(currentConfig.phone));
  }

  const updatedConfig: PrimaryOwnerIdentityConfig = {
    primaryEmail: 'alssaedy50@gmail.com',
    secondaryEmail: 'alssaedy500@gmail.com',
    emails: ['alssaedy50@gmail.com', 'alssaedy500@gmail.com'],
    phone: normPhone,
    username: currentConfig.username || 'umed_owner',
    displayNameArabic: nameAr,
    academicStudentNumber: normAcad,
    ownerUid: params.ownerUid,
    updatedAt: nowIso
  };

  try {
    localStorage.setItem(OWNER_IDENTITY_CACHE_KEY, JSON.stringify(updatedConfig));
  } catch (e) {}

  try {
    await setDoc(doc(db, 'system', 'owner_identity'), cleanFirestoreData(updatedConfig), { merge: true });
  } catch (e) {}

  for (const ownerEmail of INITIAL_OWNER_EMAILS) {
    await reserveUniqueIdentifiers({
      uid: params.ownerUid,
      username: updatedConfig.username || 'umed_owner',
      email: ownerEmail,
      phone: normPhone,
      academicStudentNumber: normAcad
    });
  }

  try {
    const profilesSnap = await getDocs(collection(db, 'userProfiles'));
    for (const d of profilesSnap.docs) {
      const p = d.data() as UserProfile;
      const isOwnerMatch =
        isInitialOwnerEmail(p.email) ||
        p.isPrimaryOwner ||
        (p.phone && normalizeYemenPhone(p.phone) === normPhone);
      if (isOwnerMatch && d.id !== params.ownerUid) {
        await deleteDoc(doc(db, 'userProfiles', d.id)).catch(() => {});
      }
    }

    const rolesSnap = await getDocs(collection(db, 'userRoles'));
    for (const d of rolesSnap.docs) {
      const r = d.data() as UserRoleDoc;
      if (isInitialOwnerEmail(r.email) && d.id !== params.ownerUid) {
        await deleteDoc(doc(db, 'userRoles', d.id)).catch(() => {});
        removeLocalRoleEntry(d.id);
      }
    }
  } catch (e) {}

  const activeEmail = auth.currentUser?.email && isInitialOwnerEmail(auth.currentUser.email)
    ? normalizeEmail(auth.currentUser.email)
    : 'alssaedy50@gmail.com';

  const ownerProfile: UserProfile = {
    uid: params.ownerUid,
    email: activeEmail,
    username: updatedConfig.username || 'umed_owner',
    usernameSkeleton: getUsernameSimilarityKey(updatedConfig.username || 'umed_owner'),
    ownerLinkedEmails: ['alssaedy50@gmail.com', 'alssaedy500@gmail.com'],
    phone: normPhone,
    academicStudentNumber: normAcad,
    displayNameArabic: nameAr,
    registrationMethod: 'email',
    isPrimaryOwner: true,
    isActive: true,
    isArchived: false,
    emailVerified: true,
    phoneVerified: true,
    isVerified: true,
    verifiedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  await saveUserProfile(ownerProfile);

  const ownerRole: UserRoleDoc = {
    uid: params.ownerUid,
    role: 'platform_owner',
    email: activeEmail,
    username: updatedConfig.username || 'umed_owner',
    displayNameArabic: nameAr,
    phone: normPhone,
    academicStudentNumber: normAcad,
    assignedAt: nowIso,
    assignedBy: 'SYSTEM_PRIMARY_OWNER',
    assignedByRole: 'platform_owner'
  };

  await saveUserRoleToFirestore(ownerRole);

  return updatedConfig;
}

// ---------------------------------------------------------------------------
// 5C. Zero-Friction Verification Bypass (No Mandatory OTP / Email / Phone Verification)
// ---------------------------------------------------------------------------

export async function issueVerificationChallenge(
  user: User,
  params: {
    email?: string;
    phone?: string;
    method?: 'email' | 'phone' | 'both';
  }
): Promise<VerificationChallenge> {
  const now = new Date().toISOString();
  try {
    localStorage.removeItem(`umed_verification_${user.uid}`);
    await deleteDoc(doc(db, 'verificationChallenges', user.uid)).catch(() => {});
  } catch (e) {}
  return {
    uid: user.uid,
    verificationMethod: params.method || 'email',
    emailVerified: true,
    phoneVerified: true,
    expiresAt: now,
    createdAt: now
  };
}

export async function getVerificationChallenge(uid: string): Promise<VerificationChallenge | null> {
  if (!uid) return null;
  try {
    localStorage.removeItem(`umed_verification_${uid}`);
  } catch (e) {}
  return null;
}

export async function verifyAccountChallenge(
  user: User,
  _params: {
    phoneCodeInput?: string;
    emailCodeInput?: string;
    checkFirebaseEmailLink?: boolean;
  }
): Promise<{
  verified: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  challenge: VerificationChallenge | null;
  message: string;
}> {
  try {
    localStorage.removeItem(`umed_verification_${user.uid}`);
    await deleteDoc(doc(db, 'verificationChallenges', user.uid)).catch(() => {});
  } catch (e) {}
  return {
    verified: true,
    emailVerified: true,
    phoneVerified: true,
    challenge: null,
    message: 'الحساب مفعل وموثق تلقائياً ✓'
  };
}

// ---------------------------------------------------------------------------
// 6. Authentication Service Functions (Username, Device Guard, Email, Phone & Google)
// ---------------------------------------------------------------------------

async function enforceCloudAccountIntegrityAfterSignIn(signedInUser: User): Promise<User> {
  const deletedInCloud = await isAccountDeletedInCloud(signedInUser.uid);
  if (deletedInCloud) {
    try {
      await deleteUser(signedInUser);
    } catch (e) {}
    try {
      await signOut(auth);
    } catch (e) {}
    throw new Error('ACCOUNT_DELETED_FROM_CLOUD');
  }

  if (!isInitialOwnerEmail(signedInUser.email)) {
    try {
      const profSnap = await getDoc(doc(db, 'userProfiles', signedInUser.uid));
      if (profSnap.exists()) {
        const prof = profSnap.data() as UserProfile;
        if (prof.isArchived || prof.isActive === false) {
          throw new Error('ACCOUNT_ARCHIVED');
        }
        if (prof.username) {
          await reserveDeviceAccountBinding(signedInUser.uid, prof.username, prof.displayNameArabic);
        }
      }
    } catch (err: any) {
      if (err?.message === 'ACCOUNT_ARCHIVED') {
        throw err;
      }
    }
  }

  return signedInUser;
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return enforceCloudAccountIntegrityAfterSignIn(result.user);
}

/**
 * Mandatory First-Time Student Account Creation with:
 * - Minimum 4 English letters username (case-insensitive `A-Z` === `a-z`)
 * - Anti-Similarity username check in Cloud Firestore
 * - Single-Account-Per-Phone Device Verification Guard
 * - Optional Profile Picture (`avatarUrl`), University, Specialty, and Study Level
 */
export async function signUpWithUsername(
  usernameInput: string,
  pass?: string,
  displayNameArabicInput?: string,
  extraProfile?: {
    avatarUrl?: string;
    universityId?: string;
    universityNameArabic?: string;
    specialtyArabic?: string;
    studyLevelId?: string;
  }
): Promise<{ user: User; normalizedUsername: string; profile: UserProfile }> {
  const check = validateUsernameFormat(usernameInput);
  if (!check.valid || !check.normalized) {
    throw new Error(check.message || 'INVALID_USERNAME');
  }
  const normUsername = check.normalized;
  const effectivePass = pass && pass.trim().length >= 6 ? pass.trim() : getDefaultUsernamePassword(normUsername);

  // 1. Check Device Single-Account Policy (prevents opening multiple accounts from the same phone)
  const devicePolicy = await checkDeviceSingleAccountPolicy({
    candidateUsername: normUsername
  });
  if (!devicePolicy.allowed) {
    throw new Error(
      devicePolicy.message ||
        `نظام التحقق من الجهاز: هذا الهاتف مسجل به حساب مسبقاً (@${devicePolicy.existingUsername}). لا يُسمح بفتح أكثر من حساب من نفس الهاتف.`
    );
  }

  // If the student entered the exact username already bound to THIS phone, sign them right in!
  if (devicePolicy.existingUsername && devicePolicy.existingUsername === normUsername) {
    try {
      const existingUser = await signInWithUsername(normUsername, effectivePass);
      const existingProf = await fetchUserProfile(existingUser.uid);
      if (existingProf) {
        return { user: existingUser, normalizedUsername: normUsername, profile: existingProf };
      }
    } catch {}
  }

  // 2. Check Cloud Uniqueness & Anti-Similarity
  const uniqueness = await checkIdentifierUniqueness({ username: normUsername });
  if (!uniqueness.isUnique) {
    throw new Error(uniqueness.message || `اسم المستخدم (@${normUsername}) مستخدم أو مشابه لاسم مسجل مسبقاً.`);
  }

  const authEmail = usernameToAuthEmail(normUsername);
  const { deviceId, hardwareHash } = getDeviceFingerprint();

  let createdUser: User;
  try {
    const result = await createUserWithEmailAndPassword(auth, authEmail, effectivePass);
    unmarkUidDeletedLocally(result.user.uid);
    createdUser = result.user;
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      try {
        const userDocId = getUsernameDocKey(normUsername);
        const idSnap = userDocId ? await getDoc(doc(db, 'uniqueIdentifiers', userDocId)) : null;
        const hasActiveIdentifier =
          idSnap && idSnap.exists() && !(await isAccountDeletedInCloud((idSnap.data() as UniqueIdentifierRecord).uid));
        if (!hasActiveIdentifier) {
          const oldSignIn = await signInWithEmailAndPassword(auth, authEmail, effectivePass);
          const oldUid = oldSignIn.user.uid;
          try {
            await deleteDoc(doc(db, 'deletedAccounts', oldUid));
          } catch {}
          await deleteUser(oldSignIn.user);
          const freshResult = await createUserWithEmailAndPassword(auth, authEmail, effectivePass);
          unmarkUidDeletedLocally(freshResult.user.uid);
          createdUser = freshResult.user;
        } else {
          throw err;
        }
      } catch {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const nowIso = new Date().toISOString();
  const displayNameArabic = (displayNameArabicInput || '').trim() || normUsername;
  const universityId = extraProfile?.universityId || 'univ-dar-al-salam';
  const matchedUniv = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === universityId);
  const universityNameArabic =
    extraProfile?.universityNameArabic?.trim() ||
    matchedUniv?.nameArabic ||
    'جامعة دار السلام الدولية للعلوم والتكنولوجيا';
  const specialtyArabic = extraProfile?.specialtyArabic?.trim() || 'الطب العام والجراحة (MBBS)';
  const studyLevelId = extraProfile?.studyLevelId || 'lvl-4';

  const profile: UserProfile = cleanFirestoreData({
    uid: createdUser.uid,
    email: authEmail,
    username: normUsername,
    usernameSkeleton: check.similarityKey,
    displayNameArabic,
    ...(extraProfile?.avatarUrl ? { avatarUrl: extraProfile.avatarUrl } : {}),
    universityId,
    universityNameArabic,
    specialtyArabic,
    studyLevelId,
    deviceId,
    deviceHardwareHash: hardwareHash,
    leaderboardNameMode: 'custom_username',
    registrationMethod: 'username',
    isActive: true,
    isArchived: false,
    emailVerified: true,
    phoneVerified: true,
    isVerified: true,
    verifiedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso
  });

  await saveUserProfile(profile);
  await reserveDeviceAccountBinding(createdUser.uid, normUsername, displayNameArabic);

  // Also create/sync StudentEnrollment record in Cloud Firestore (`studentEnrollments/enr-{uid}`)
  const enrId = `enr-${createdUser.uid}`;
  const enrDoc: StudentEnrollment = cleanFirestoreData({
    id: enrId,
    uid: createdUser.uid,
    studentNameArabic: displayNameArabic,
    academicStudentNumber: normUsername.toUpperCase(),
    universityId,
    collegeId: 'col-med-dar',
    programId: 'prog-mbbs',
    curriculumVersionId: 'cur-dar-2024',
    currentStudyLevelId: studyLevelId,
    academicYear: '2025-2026',
    status: 'approved',
    enrolledAt: nowIso,
    updatedAt: nowIso
  });

  try {
    await setDoc(doc(db, 'studentEnrollments', enrId), enrDoc, { merge: true });
    localStorage.setItem(`umed_enrollment_${createdUser.uid}`, JSON.stringify(enrDoc));
    localStorage.setItem(
      'umed_user_academic_context',
      JSON.stringify({
        universityId,
        collegeId: 'col-med-dar',
        programId: 'prog-mbbs',
        studyLevelId
      })
    );
  } catch (e) {}

  return { user: createdUser, normalizedUsername: normUsername, profile };
}

/**
 * Signs in a user using their Unique Username (case-insensitive).
 * Supports both custom passwords and the device-synced default username credential.
 */
export async function signInWithUsername(usernameInput: string, pass?: string): Promise<User> {
  const normUsername = normalizeUsername(usernameInput);
  if (!normUsername || normUsername.length < 3) {
    throw new Error('يرجى إدخال اسم مستخدم صحيح (4 أحرف إنجليزية على الأقل).');
  }
  const directAuthEmail = usernameToAuthEmail(normUsername);
  const candidatePasswords = Array.from(
    new Set([
      ...(pass && pass.trim() ? [pass.trim()] : []),
      getDefaultUsernamePassword(normUsername)
    ])
  );

  let resolvedAuthEmails: string[] = [];
  try {
    const userDocId = getUsernameDocKey(normUsername);
    const idSnap = await getDoc(doc(db, 'uniqueIdentifiers', userDocId));
    if (idSnap.exists()) {
      const idData = idSnap.data() as UniqueIdentifierRecord;
      if (idData.uid && !(await isAccountDeletedInCloud(idData.uid))) {
        const profSnap = await getDoc(doc(db, 'userProfiles', idData.uid));
        if (profSnap.exists()) {
          const prof = profSnap.data() as UserProfile;
          if (prof.email) resolvedAuthEmails.push(prof.email);
          if (prof.phone) {
            try {
              resolvedAuthEmails.push(phoneToAuthEmail(prof.phone));
            } catch {}
          }
        }
      }
    }
  } catch (e) {}

  if (!resolvedAuthEmails.includes(directAuthEmail)) {
    resolvedAuthEmails.push(directAuthEmail);
  }

  let lastErr: any = null;
  for (const candidateEmail of resolvedAuthEmails) {
    for (const candidatePass of candidatePasswords) {
      try {
        const result = await signInWithEmailAndPassword(auth, candidateEmail, candidatePass);
        return await enforceCloudAccountIntegrityAfterSignIn(result.user);
      } catch (err: any) {
        if (err?.message === 'ACCOUNT_DELETED_FROM_CLOUD' || err?.message === 'ACCOUNT_ARCHIVED') {
          throw err;
        }
        lastErr = err;
      }
    }
  }

  // Fallback query on userProfiles where username == normUsername
  try {
    const q = query(collection(db, 'userProfiles'), where('username', '==', normUsername));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const prof = d.data() as UserProfile;
      if (prof.email && !resolvedAuthEmails.includes(prof.email)) {
        for (const candidatePass of candidatePasswords) {
          try {
            const result = await signInWithEmailAndPassword(auth, prof.email, candidatePass);
            return await enforceCloudAccountIntegrityAfterSignIn(result.user);
          } catch (innerErr: any) {
            lastErr = innerErr;
          }
        }
      }
    }
  } catch (err: any) {
    if (err?.message === 'ACCOUNT_DELETED_FROM_CLOUD' || err?.message === 'ACCOUNT_ARCHIVED') {
      throw err;
    }
  }

  throw lastErr || new Error('auth/invalid-credential');
}

/**
 * Smart Unified Sign-In: accepts a Unique Username (@username), Email, or Yemen Phone Number.
 */
export async function signInWithIdentifier(identifierInput: string, pass?: string): Promise<User> {
  const raw = (identifierInput || '').trim();
  if (!raw) {
    throw new Error('يرجى إدخال اسم المستخدم أو البريد الإلكتروني أو رقم الهاتف.');
  }

  if (!raw.startsWith('@') && raw.includes('@') && raw.split('@')[1]?.includes('.')) {
    if (!pass || !pass.trim()) {
      throw new Error('يرجى إدخال كلمة المرور لتسجيل الدخول بالبريد الإلكتروني.');
    }
    return signInWithEmail(raw, pass);
  }

  if (isPhoneIdentifier(raw)) {
    if (!pass || !pass.trim()) {
      throw new Error('يرجى إدخال كلمة المرور لتسجيل الدخول برقم الهاتف.');
    }
    try {
      return await signInWithPhone(raw, pass);
    } catch (phoneErr: any) {
      if (phoneErr?.message === 'ACCOUNT_DELETED_FROM_CLOUD' || phoneErr?.message === 'ACCOUNT_ARCHIVED') {
        throw phoneErr;
      }
      return signInWithUsername(raw, pass);
    }
  }

  return signInWithUsername(raw, pass);
}

export async function signInWithEmail(emailInput: string, pass: string): Promise<User> {
  const emailCheck = validateEmailFormat(emailInput);
  if (!emailCheck.valid) {
    throw new Error('INVALID_EMAIL_FORMAT');
  }
  const normEmail = emailCheck.normalized;

  try {
    const result = await signInWithEmailAndPassword(auth, normEmail, pass);
    return await enforceCloudAccountIntegrityAfterSignIn(result.user);
  } catch (err: any) {
    if (
      err?.code === 'auth/user-not-found' ||
      err?.code === 'auth/invalid-credential'
    ) {
      try {
        const emailDocId = getEmailDocKey(normEmail);
        const idSnap = await getDoc(doc(db, 'uniqueIdentifiers', emailDocId));
        if (idSnap.exists()) {
          const idData = idSnap.data() as UniqueIdentifierRecord;
          if (idData.uid) {
            const profSnap = await getDoc(doc(db, 'userProfiles', idData.uid));
            if (profSnap.exists()) {
              const prof = profSnap.data() as UserProfile;
              if (prof.phone) {
                const synthEmail = phoneToAuthEmail(prof.phone);
                const fallbackResult = await signInWithEmailAndPassword(auth, synthEmail, pass);
                return await enforceCloudAccountIntegrityAfterSignIn(fallbackResult.user);
              }
            }
          }
        }
      } catch (innerErr: any) {
        if (innerErr?.message === 'ACCOUNT_DELETED_FROM_CLOUD' || innerErr?.message === 'ACCOUNT_ARCHIVED') {
          throw innerErr;
        }
      }
    }
    throw err;
  }
}

export async function signUpWithEmail(email: string, pass: string): Promise<User> {
  const emailCheck = validateEmailFormat(email);
  if (!emailCheck.valid) {
    throw new Error(emailCheck.message || 'INVALID_EMAIL_FORMAT');
  }
  const normEmail = emailCheck.normalized;

  if (!isInitialOwnerEmail(normEmail)) {
    const devicePolicy = await checkDeviceSingleAccountPolicy({ callerEmail: normEmail });
    if (!devicePolicy.allowed) {
      throw new Error(devicePolicy.message);
    }
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, normEmail, pass);
    unmarkUidDeletedLocally(result.user.uid);
    return result.user;
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      try {
        const emailDocId = getEmailDocKey(normEmail);
        const idSnap = await getDoc(doc(db, 'uniqueIdentifiers', emailDocId));
        const hasActiveIdentifier = idSnap.exists() && !(await isAccountDeletedInCloud((idSnap.data() as UniqueIdentifierRecord).uid));
        if (!hasActiveIdentifier) {
          const oldSignIn = await signInWithEmailAndPassword(auth, normEmail, pass);
          const oldUid = oldSignIn.user.uid;
          try {
            await deleteDoc(doc(db, 'deletedAccounts', oldUid));
          } catch {}
          await deleteUser(oldSignIn.user);
          const freshResult = await createUserWithEmailAndPassword(auth, normEmail, pass);
          unmarkUidDeletedLocally(freshResult.user.uid);
          return freshResult.user;
        }
      } catch {}
    }
    throw err;
  }
}

export async function signInWithPhone(phone: string, pass: string): Promise<User> {
  const check = validateYemenPhoneFormat(phone);
  if (!check.valid || !check.normalized) {
    throw new Error('INVALID_PHONE_NUMBER');
  }
  const normPhone = check.normalized;
  const authEmail = phoneToAuthEmail(normPhone);

  try {
    const result = await signInWithEmailAndPassword(auth, authEmail, pass);
    return await enforceCloudAccountIntegrityAfterSignIn(result.user);
  } catch (err: any) {
    if (
      err?.code === 'auth/user-not-found' ||
      err?.code === 'auth/invalid-credential'
    ) {
      try {
        const phoneDocId = getPhoneDocKey(normPhone);
        if (phoneDocId) {
          const idSnap = await getDoc(doc(db, 'uniqueIdentifiers', phoneDocId));
          if (idSnap.exists()) {
            const idData = idSnap.data() as UniqueIdentifierRecord;
            if (idData.uid) {
              const profSnap = await getDoc(doc(db, 'userProfiles', idData.uid));
              if (profSnap.exists()) {
                const prof = profSnap.data() as UserProfile;
                if (prof.email && !prof.email.startsWith('phone_')) {
                  const fallbackResult = await signInWithEmailAndPassword(auth, prof.email, pass);
                  return await enforceCloudAccountIntegrityAfterSignIn(fallbackResult.user);
                }
              }
            }
          }
        }
      } catch (innerErr: any) {
        if (innerErr?.message === 'ACCOUNT_DELETED_FROM_CLOUD' || innerErr?.message === 'ACCOUNT_ARCHIVED') {
          throw innerErr;
        }
      }
    }
    throw err;
  }
}

export async function signUpWithPhone(phone: string, pass: string): Promise<{ user: User; normalizedPhone: string }> {
  const check = validateYemenPhoneFormat(phone);
  if (!check.valid || !check.normalized) {
    throw new Error(check.message || 'INVALID_PHONE_NUMBER');
  }
  const normPhone = check.normalized;
  const authEmail = phoneToAuthEmail(normPhone);

  const devicePolicy = await checkDeviceSingleAccountPolicy();
  if (!devicePolicy.allowed) {
    throw new Error(devicePolicy.message);
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, authEmail, pass);
    unmarkUidDeletedLocally(result.user.uid);
    return { user: result.user, normalizedPhone: normPhone };
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      try {
        const phoneDocId = getPhoneDocKey(normPhone);
        const idSnap = phoneDocId ? await getDoc(doc(db, 'uniqueIdentifiers', phoneDocId)) : null;
        const hasActiveIdentifier =
          idSnap && idSnap.exists() && !(await isAccountDeletedInCloud((idSnap.data() as UniqueIdentifierRecord).uid));
        if (!hasActiveIdentifier) {
          const oldSignIn = await signInWithEmailAndPassword(auth, authEmail, pass);
          const oldUid = oldSignIn.user.uid;
          try {
            await deleteDoc(doc(db, 'deletedAccounts', oldUid));
          } catch {}
          await deleteUser(oldSignIn.user);
          const freshResult = await createUserWithEmailAndPassword(auth, authEmail, pass);
          unmarkUidDeletedLocally(freshResult.user.uid);
          return { user: freshResult.user, normalizedPhone: normPhone };
        }
      } catch {}
    }
    throw err;
  }
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

const ROLES_LOCAL_MAP_KEY = 'umed_all_roles_cache';

function readLocalRolesMap(): Record<string, UserRoleDoc> {
  try {
    const raw = localStorage.getItem(ROLES_LOCAL_MAP_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

function writeLocalRoleEntry(roleDoc: UserRoleDoc): void {
  try {
    const map = readLocalRolesMap();
    map[roleDoc.uid] = roleDoc;
    localStorage.setItem(ROLES_LOCAL_MAP_KEY, JSON.stringify(map));
    localStorage.setItem(`umed_cached_role_${roleDoc.uid}`, JSON.stringify(roleDoc));
  } catch (e) {}
}

function removeLocalRoleEntry(uid: string): void {
  try {
    const map = readLocalRolesMap();
    delete map[uid];
    localStorage.setItem(ROLES_LOCAL_MAP_KEY, JSON.stringify(map));
    localStorage.removeItem(`umed_cached_role_${uid}`);
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// 7. User Profile, Unique Cloud Username Management, Avatar & Academic Context
// ---------------------------------------------------------------------------

/**
 * Updates a student's full profile in Cloud Firestore (`userProfiles/{uid}`, `users/{uid}`,
 * `uniqueIdentifiers`, `userRoles/{uid}`, and `studentEnrollments/enr-{uid}`):
 * - Unique Username (`username`, min 4 English letters, case-insensitive, anti-similarity)
 * - Display Name (`displayNameArabic`)
 * - Profile Picture (`avatarUrl` — upload/change/remove)
 * - University (`universityId`, `universityNameArabic`)
 * - Specialty (`specialtyArabic`)
 * - Study Level (`studyLevelId`)
 */
export async function updateStudentFullProfileInCloud(params: {
  uid: string;
  newUsername?: string;
  displayNameArabic?: string;
  avatarUrl?: string | null;
  universityId?: string;
  universityNameArabic?: string;
  specialtyArabic?: string;
  studyLevelId?: string;
}): Promise<{ username: string; profile: UserProfile; enrollment: StudentEnrollment }> {
  const { uid } = params;
  if (!uid) throw new Error('معرف المستخدم غير صالح.');

  const existingProfile = await fetchUserProfile(uid);
  const oldUsername = existingProfile?.username ? normalizeUsername(existingProfile.username) : '';

  let normNew = oldUsername;
  let skelNew = getUsernameSimilarityKey(oldUsername);

  if (params.newUsername !== undefined && params.newUsername.trim() !== '') {
    const formatCheck = validateUsernameFormat(params.newUsername);
    if (!formatCheck.valid || !formatCheck.normalized) {
      throw new Error(formatCheck.message || 'صيغة اسم المستخدم غير صالحة.');
    }
    normNew = formatCheck.normalized;
    skelNew = formatCheck.similarityKey;

    const uniqueness = await checkIdentifierUniqueness({
      username: normNew,
      excludeUid: uid
    });
    if (!uniqueness.isUnique) {
      throw new Error(uniqueness.message || `اسم المستخدم (@${normNew}) محجوز أو مشابه لاسم مستخدم آخر.`);
    }
  } else if (!normNew) {
    normNew = `umed_${uid.slice(0, 6).toLowerCase()}`;
    skelNew = getUsernameSimilarityKey(normNew);
  }

  // 1. Immediately delete old username & old similarity skeleton from Cloud Firestore if changed
  if (oldUsername && oldUsername !== normNew) {
    await releaseUsernameIdentifier(oldUsername);
  }

  // Also clean up any stale username_* or skeleton_* documents owned by this uid in uniqueIdentifiers
  try {
    const qIds = query(collection(db, 'uniqueIdentifiers'), where('uid', '==', uid));
    const snapIds = await getDocs(qIds);
    const targetDocId = getUsernameDocKey(normNew);
    const targetSkelId = getUsernameSkeletonDocKey(normNew);
    for (const d of snapIds.docs) {
      const rec = d.data() as UniqueIdentifierRecord;
      if (
        (rec.type === 'username' || d.id.startsWith('username_')) &&
        d.id !== targetDocId
      ) {
        await releaseIdentifierKeyFromCloud(d.id);
      }
      if (
        (rec.type === 'username_skeleton' || d.id.startsWith('skeleton_')) &&
        d.id !== targetSkelId
      ) {
        await releaseIdentifierKeyFromCloud(d.id);
      }
    }
  } catch (e) {}

  const nowIso = new Date().toISOString();
  const nextUniversityId = params.universityId || existingProfile?.universityId || 'univ-dar-al-salam';
  const matchedUniv = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === nextUniversityId);
  const nextUniversityName =
    params.universityNameArabic?.trim() ||
    matchedUniv?.nameArabic ||
    existingProfile?.universityNameArabic ||
    'جامعة دار السلام الدولية للعلوم والتكنولوجيا';
  const nextSpecialty =
    params.specialtyArabic?.trim() ||
    existingProfile?.specialtyArabic ||
    'الطب العام والجراحة (MBBS)';
  const nextLevelId = params.studyLevelId || existingProfile?.studyLevelId || 'lvl-4';
  const nextAvatarUrl =
    params.avatarUrl === null
      ? ''
      : params.avatarUrl !== undefined
      ? params.avatarUrl
      : existingProfile?.avatarUrl || '';

  const { deviceId, hardwareHash } = getDeviceFingerprint();

  const updatedProfile: UserProfile = cleanFirestoreData({
    ...(existingProfile || {}),
    uid,
    email: existingProfile?.email || auth.currentUser?.email || usernameToAuthEmail(normNew),
    username: normNew,
    usernameSkeleton: skelNew,
    displayNameArabic:
      (params.displayNameArabic && params.displayNameArabic.trim()) ||
      existingProfile?.displayNameArabic ||
      auth.currentUser?.displayName ||
      normNew,
    avatarUrl: nextAvatarUrl,
    universityId: nextUniversityId,
    universityNameArabic: nextUniversityName,
    specialtyArabic: nextSpecialty,
    studyLevelId: nextLevelId,
    deviceId: existingProfile?.deviceId || deviceId,
    deviceHardwareHash: existingProfile?.deviceHardwareHash || hardwareHash,
    isActive: existingProfile?.isActive ?? true,
    isArchived: existingProfile?.isArchived ?? false,
    isVerified: true,
    emailVerified: true,
    phoneVerified: true,
    verifiedAt: existingProfile?.verifiedAt || nowIso,
    createdAt: existingProfile?.createdAt || nowIso,
    updatedAt: nowIso
  });

  await saveUserProfile(updatedProfile);
  await reserveDeviceAccountBinding(uid, normNew, updatedProfile.displayNameArabic);

  // Sync username & displayName into userRoles if role doc exists
  try {
    const roleSnap = await getDoc(doc(db, 'userRoles', uid));
    if (roleSnap.exists()) {
      const rData = roleSnap.data() as UserRoleDoc;
      const updatedRole: UserRoleDoc = cleanFirestoreData({
        ...rData,
        username: normNew,
        displayNameArabic: updatedProfile.displayNameArabic
      });
      await saveUserRoleToFirestore(updatedRole);
    }
  } catch (e) {}

  // Sync enrollment record in Cloud Firestore (`studentEnrollments/enr-{uid}`)
  const enrId = `enr-${uid}`;
  const updatedEnrollment: StudentEnrollment = cleanFirestoreData({
    id: enrId,
    uid,
    studentNameArabic: updatedProfile.displayNameArabic,
    academicStudentNumber: existingProfile?.academicStudentNumber || normNew.toUpperCase(),
    universityId: nextUniversityId,
    collegeId: 'col-med-dar',
    programId: 'prog-mbbs',
    curriculumVersionId: 'cur-dar-2024',
    currentStudyLevelId: nextLevelId,
    academicYear: '2025-2026',
    status: 'approved',
    enrolledAt: existingProfile?.createdAt || nowIso,
    updatedAt: nowIso
  });

  try {
    await setDoc(doc(db, 'studentEnrollments', enrId), updatedEnrollment, { merge: true });
    localStorage.setItem(`umed_enrollment_${uid}`, JSON.stringify(updatedEnrollment));
    localStorage.setItem(
      'umed_user_academic_context',
      JSON.stringify({
        universityId: nextUniversityId,
        collegeId: 'col-med-dar',
        programId: 'prog-mbbs',
        studyLevelId: nextLevelId
      })
    );
  } catch (e) {}

  try {
    localStorage.setItem(`umed_cached_profile_${uid}`, JSON.stringify(updatedProfile));
  } catch (e) {}

  return { username: normNew, profile: updatedProfile, enrollment: updatedEnrollment };
}

export async function claimOrUpdateUniqueUsername(params: {
  uid: string;
  newUsername: string;
  displayNameArabic?: string;
}): Promise<{ username: string; profile: UserProfile }> {
  const res = await updateStudentFullProfileInCloud({
    uid: params.uid,
    newUsername: params.newUsername,
    displayNameArabic: params.displayNameArabic
  });
  return { username: res.username, profile: res.profile };
}

/**
 * Ensures any signed-in user has a unique `username` (at least 4 English letters) persisted in Cloud Firestore.
 */
export async function ensureUserHasUniqueCloudUsername(
  user: User,
  existingProfile?: UserProfile | null,
  preferredUsername?: string,
  preferredDisplayNameArabic?: string
): Promise<UserProfile> {
  const nowIso = new Date().toISOString();
  const isOwner = isInitialOwnerEmail(user.email);

  let rawCandidate =
    preferredUsername ||
    existingProfile?.username ||
    extractUsernameFromAuthEmail(user.email) ||
    (isOwner ? 'umed_owner' : '') ||
    (user.email && !isSyntheticUserEmail(user.email) ? user.email.split('@')[0] : '') ||
    `umed_${user.uid.slice(0, 6).toLowerCase()}`;

  let candidateUsername = normalizeUsername(rawCandidate);
  const englishCount = (candidateUsername.match(/[a-z]/g) || []).length;
  if (englishCount < 4) {
    candidateUsername = `umed_${candidateUsername || user.uid.slice(0, 6).toLowerCase()}`;
  }

  const uniqueness = await checkIdentifierUniqueness({
    username: candidateUsername,
    excludeUid: user.uid
  });
  if (!uniqueness.isUnique) {
    candidateUsername = `umed_${candidateUsername.slice(0, 16)}_${user.uid.slice(0, 4).toLowerCase()}`;
  }

  const { deviceId, hardwareHash } = getDeviceFingerprint();

  const profile: UserProfile = cleanFirestoreData({
    ...(existingProfile || {}),
    uid: user.uid,
    email: existingProfile?.email || user.email || usernameToAuthEmail(candidateUsername),
    username: candidateUsername,
    usernameSkeleton: getUsernameSimilarityKey(candidateUsername),
    displayNameArabic:
      (preferredDisplayNameArabic && preferredDisplayNameArabic.trim()) ||
      existingProfile?.displayNameArabic ||
      user.displayName ||
      candidateUsername,
    avatarUrl: existingProfile?.avatarUrl || user.photoURL || undefined,
    universityId: existingProfile?.universityId || 'univ-dar-al-salam',
    universityNameArabic:
      existingProfile?.universityNameArabic || 'جامعة دار السلام الدولية للعلوم والتكنولوجيا',
    specialtyArabic: existingProfile?.specialtyArabic || 'الطب العام والجراحة (MBBS)',
    studyLevelId: existingProfile?.studyLevelId || 'lvl-4',
    deviceId: existingProfile?.deviceId || deviceId,
    deviceHardwareHash: existingProfile?.deviceHardwareHash || hardwareHash,
    registrationMethod:
      existingProfile?.registrationMethod ||
      (user.email?.startsWith('user_')
        ? 'username'
        : user.email?.startsWith('phone_')
        ? 'phone'
        : user.providerData?.[0]?.providerId === 'google.com'
        ? 'google'
        : 'username'),
    isPrimaryOwner: isOwner || Boolean(existingProfile?.isPrimaryOwner),
    isActive: isOwner ? true : (existingProfile?.isActive ?? true),
    isArchived: isOwner ? false : Boolean(existingProfile?.isArchived),
    emailVerified: true,
    phoneVerified: true,
    isVerified: true,
    verifiedAt: existingProfile?.verifiedAt || nowIso,
    createdAt: existingProfile?.createdAt || nowIso,
    updatedAt: nowIso
  });

  await saveUserProfile(profile);
  if (!isOwner) {
    await reserveDeviceAccountBinding(user.uid, candidateUsername, profile.displayNameArabic);
  }
  return profile;
}

export async function fetchUserRole(uid: string, email?: string | null): Promise<UserRoleDoc | null> {
  if (email && isInitialOwnerEmail(email)) {
    const ownerIdentity = getCachedPrimaryOwnerIdentity();
    const ownerDoc: UserRoleDoc = {
      uid,
      role: 'platform_owner',
      email: email.trim().toLowerCase(),
      username: ownerIdentity.username || 'umed_owner',
      displayNameArabic: ownerIdentity.displayNameArabic,
      phone: ownerIdentity.phone,
      academicStudentNumber: ownerIdentity.academicStudentNumber,
      assignedAt: new Date().toISOString(),
      assignedBy: 'SYSTEM_BOOTSTRAP',
      assignedByRole: 'platform_owner'
    };
    writeLocalRoleEntry(ownerDoc);
    try {
      await setDoc(doc(db, 'userRoles', uid), cleanFirestoreData(ownerDoc), { merge: true });
    } catch (e) {}
    return ownerDoc;
  }

  try {
    const roleRef = doc(db, 'userRoles', uid);
    const snap = await getDoc(roleRef);
    if (snap.exists()) {
      const r = snap.data() as UserRoleDoc;
      writeLocalRoleEntry(r);
      return r;
    }
  } catch (err) {
    console.warn('Could not fetch user role from Firestore:', err);
  }

  const localMap = readLocalRolesMap();
  if (localMap[uid]) {
    return localMap[uid];
  }

  return null;
}

export async function saveUserRoleToFirestore(roleDoc: UserRoleDoc): Promise<void> {
  writeLocalRoleEntry(roleDoc);
  try {
    await setDoc(doc(db, 'userRoles', roleDoc.uid), cleanFirestoreData(roleDoc), { merge: true });
  } catch (err) {
    console.warn('Could not write roleDoc to Firestore:', err);
  }
}

export async function fetchAllUserRoles(): Promise<UserRoleDoc[]> {
  const deletedSet = getLocalDeletedUids();
  const map: Record<string, UserRoleDoc> = {};

  Object.entries(readLocalRolesMap()).forEach(([uid, docItem]) => {
    if (!deletedSet.has(uid)) {
      map[uid] = docItem;
    }
  });

  try {
    const snap = await getDocs(collection(db, 'userRoles'));
    snap.forEach((d) => {
      const data = d.data() as UserRoleDoc;
      if (data && data.uid && !deletedSet.has(data.uid)) {
        map[data.uid] = data;
      }
    });
    try {
      localStorage.setItem(ROLES_LOCAL_MAP_KEY, JSON.stringify(map));
    } catch (e) {}
  } catch (e) {}

  try {
    const res = await fetch('/api/admin/roles');
    if (res.ok) {
      const data = await res.json();
      if (data.roles) {
        Object.values(data.roles as Record<string, UserRoleDoc>).forEach((r) => {
          if (r && r.uid && !map[r.uid] && !deletedSet.has(r.uid)) map[r.uid] = r;
        });
      }
    }
  } catch (e) {}

  return Object.values(map).sort(
    (a, b) => new Date(b.assignedAt || 0).getTime() - new Date(a.assignedAt || 0).getTime()
  );
}

export async function assignUserRole(params: {
  callerUid: string;
  callerEmail: string;
  callerRole?: UserRole;
  targetUid: string;
  email: string;
  username?: string;
  displayNameArabic?: string;
  phone?: string;
  academicStudentNumber?: string;
  role: UserRole;
  assignedUniversityId?: string;
  assignedStudyLevelId?: string;
  assignedCourseId?: string;
  departmentTitle?: string;
}): Promise<UserRoleDoc> {
  const needsUniversity =
    params.role === 'university_admin' ||
    params.role === 'batch_rep' ||
    params.role === 'department_head';

  const needsLevel =
    params.role === 'batch_rep' ||
    params.role === 'department_head';

  const roleDoc: UserRoleDoc = cleanFirestoreData({
    uid: params.targetUid.trim(),
    role: params.role,
    email: params.email.trim().toLowerCase(),
    ...(params.username ? { username: normalizeUsername(params.username) } : {}),
    ...(params.displayNameArabic ? { displayNameArabic: params.displayNameArabic.trim() } : {}),
    ...(params.phone ? { phone: params.phone.trim() } : {}),
    ...(params.academicStudentNumber ? { academicStudentNumber: params.academicStudentNumber.trim() } : {}),
    ...(needsUniversity
      ? { assignedUniversityId: params.assignedUniversityId || 'univ-dar-al-salam' }
      : {}),
    ...(needsLevel && params.assignedStudyLevelId
      ? { assignedStudyLevelId: params.assignedStudyLevelId }
      : {}),
    ...(params.role === 'department_head' && params.assignedCourseId
      ? { assignedCourseId: params.assignedCourseId }
      : {}),
    ...(params.role === 'department_head' && params.departmentTitle
      ? { departmentTitle: params.departmentTitle.trim() }
      : {}),
    assignedAt: new Date().toISOString(),
    assignedBy: params.callerEmail || params.callerUid,
    ...(params.callerRole ? { assignedByRole: params.callerRole } : {})
  });

  await saveUserRoleToFirestore(roleDoc);

  await writeAuditLogToCloud({
    action: 'ROLE_ASSIGNED',
    performedBy: params.callerEmail || params.callerUid,
    targetUid: roleDoc.uid,
    targetEmail: roleDoc.email,
    universityId: roleDoc.assignedUniversityId,
    details: {
      assignedRole: roleDoc.role,
      assignedUniversityId: roleDoc.assignedUniversityId,
      assignedStudyLevelId: roleDoc.assignedStudyLevelId,
      departmentTitle: roleDoc.departmentTitle
    }
  });

  try {
    await fetch('/api/admin/assign-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
  } catch (e) {}

  return roleDoc;
}

export async function revokeUserRole(params: {
  callerUid: string;
  callerEmail: string;
  targetUid: string;
  targetEmail?: string;
  universityId?: string;
}): Promise<void> {
  removeLocalRoleEntry(params.targetUid);
  try {
    await deleteDoc(doc(db, 'userRoles', params.targetUid));
  } catch (e) {
    try {
      await setDoc(
        doc(db, 'userRoles', params.targetUid),
        {
          uid: params.targetUid,
          role: 'student',
          email: params.targetEmail || '',
          assignedAt: new Date().toISOString(),
          assignedBy: params.callerEmail || params.callerUid
        },
        { merge: true }
      );
    } catch {}
  }

  await writeAuditLogToCloud({
    action: 'ROLE_REVOKED',
    performedBy: params.callerEmail || params.callerUid,
    targetUid: params.targetUid,
    targetEmail: params.targetEmail,
    universityId: params.universityId,
    details: { reason: 'Revoked to student role' }
  });
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const profileRef = doc(db, 'userProfiles', uid);
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      const prof = snap.data() as UserProfile;
      reserveUniqueIdentifiers({
        uid: prof.uid,
        username: prof.username,
        email: prof.email,
        phone: prof.phone,
        academicStudentNumber: prof.academicStudentNumber
      }).catch(() => {});
      return prof;
    }
    return null;
  } catch (err) {
    console.warn('Could not fetch user profile:', err);
    return null;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const cleaned = cleanFirestoreData(profile);
  try {
    localStorage.setItem(`umed_cached_profile_${profile.uid}`, JSON.stringify(cleaned));
  } catch (e) {}
  try {
    await Promise.all([
      setDoc(doc(db, 'userProfiles', profile.uid), cleaned, { merge: true }),
      setDoc(doc(db, 'users', profile.uid), cleaned, { merge: true }).catch(() => {})
    ]);
    await reserveUniqueIdentifiers({
      uid: profile.uid,
      username: profile.username,
      email: profile.email,
      phone: profile.phone,
      academicStudentNumber: profile.academicStudentNumber
    });
  } catch (err) {
    console.warn('Could not save user profile to Firestore:', err);
  }
}

// ---------------------------------------------------------------------------
// 8. Complete Cloud Account Deletion (Self-Delete & Platform Owner Delete)
// ---------------------------------------------------------------------------

/**
 * Completely deletes a user account and all of its associated records from Cloud Firestore
 * (`userProfiles`, `users`, `userRoles`, `uniqueIdentifiers`, `verificationChallenges`,
 *  `studentEnrollments`, `academicChangeRequests`, `assessmentAttempts`, `assessmentResults`),
 * clears local caches, and if `isSelfDelete` is true, also deletes the Firebase Auth user.
 */
export async function deleteUserAccountCompletelyFromCloud(params: {
  targetUid: string;
  performedBy: string;
  isSelfDelete?: boolean;
}): Promise<void> {
  const { targetUid, performedBy, isSelfDelete } = params;
  if (!targetUid) throw new Error('معرف المستخدم غير صالح للحذف.');

  // 1. Gather user's existing identifiers before deletion so we release all unique keys
  let usernameToRelease: string | undefined;
  let emailToRelease: string | undefined;
  let phoneToRelease: string | undefined;
  let acadToRelease: string | undefined;
  let deviceIdToRelease: string | undefined;

  try {
    const profSnap = await getDoc(doc(db, 'userProfiles', targetUid));
    if (profSnap.exists()) {
      const p = profSnap.data() as UserProfile;
      usernameToRelease = p.username;
      emailToRelease = p.email;
      phoneToRelease = p.phone;
      acadToRelease = p.academicStudentNumber;
      deviceIdToRelease = p.deviceId;
    }
  } catch (e) {}

  try {
    const enrSnap = await getDoc(doc(db, 'studentEnrollments', `enr-${targetUid}`));
    if (enrSnap.exists()) {
      const enr = enrSnap.data() as StudentEnrollment;
      if (!emailToRelease && enr.studentEmail) emailToRelease = enr.studentEmail;
      if (!phoneToRelease && enr.studentPhone) phoneToRelease = enr.studentPhone;
      if (!acadToRelease && enr.academicStudentNumber) acadToRelease = enr.academicStudentNumber;
    }
  } catch (e) {}

  if (emailToRelease && isInitialOwnerEmail(emailToRelease)) {
    throw new Error('لا يمكن حذف الحساب الأساسي لمالك المنصة (Primary Platform Owner).');
  }

  // 2. Immediately delete all reserved uniqueIdentifiers in Firestore & Local Cache
  if (usernameToRelease) {
    await releaseUsernameIdentifier(usernameToRelease);
  }
  if (deviceIdToRelease) {
    await releaseDeviceAccountBinding(deviceIdToRelease);
  } else if (isSelfDelete) {
    await releaseDeviceAccountBinding();
  }
  if (emailToRelease && !isSyntheticUserEmail(emailToRelease)) {
    await releaseIdentifierKeyFromCloud(getEmailDocKey(emailToRelease));
  }
  if (phoneToRelease) {
    await releaseIdentifierKeyFromCloud(getPhoneDocKey(phoneToRelease));
  }
  if (acadToRelease) {
    await releaseIdentifierKeyFromCloud(getAcademicIdDocKey(acadToRelease));
  }

  try {
    const qIds = query(collection(db, 'uniqueIdentifiers'), where('uid', '==', targetUid));
    const snapIds = await getDocs(qIds);
    for (const d of snapIds.docs) {
      await releaseIdentifierKeyFromCloud(d.id);
    }
  } catch (e) {}

  // 3. Delete Student Enrollments in Firestore & Local Cache
  try {
    await deleteDoc(doc(db, 'studentEnrollments', `enr-${targetUid}`));
    const qEnr = query(collection(db, 'studentEnrollments'), where('uid', '==', targetUid));
    const snapEnr = await getDocs(qEnr);
    for (const d of snapEnr.docs) {
      await deleteDoc(doc(db, 'studentEnrollments', d.id)).catch(() => {});
    }
  } catch (e) {}

  // 4. Delete Academic Change Requests in Firestore
  try {
    const qReq = query(collection(db, 'academicChangeRequests'), where('uid', '==', targetUid));
    const snapReq = await getDocs(qReq);
    for (const d of snapReq.docs) {
      await deleteDoc(doc(db, 'academicChangeRequests', d.id)).catch(() => {});
    }
  } catch (e) {}

  // 5. Delete Assessment Attempts & Assessment Results in Firestore
  try {
    const qAtt = query(collection(db, 'assessmentAttempts'), where('uid', '==', targetUid));
    const snapAtt = await getDocs(qAtt);
    for (const d of snapAtt.docs) {
      await deleteDoc(doc(db, 'assessmentAttempts', d.id)).catch(() => {});
    }
  } catch (e) {}

  try {
    const qRes = query(collection(db, 'assessmentResults'), where('uid', '==', targetUid));
    const snapRes = await getDocs(qRes);
    for (const d of snapRes.docs) {
      await deleteDoc(doc(db, 'assessmentResults', d.id)).catch(() => {});
    }
  } catch (e) {}

  // 6. Delete Verification Challenge, User Role, and User Profile (`userProfiles` & `users`) in Firestore
  try {
    await deleteDoc(doc(db, 'verificationChallenges', targetUid));
  } catch (e) {}

  removeLocalRoleEntry(targetUid);
  try {
    await deleteDoc(doc(db, 'userRoles', targetUid));
  } catch (e) {}

  try {
    await Promise.all([
      deleteDoc(doc(db, 'userProfiles', targetUid)),
      deleteDoc(doc(db, 'users', targetUid)).catch(() => {})
    ]);
  } catch (e) {}

  // 7. Record Tombstone in Firestore `deletedAccounts` so any cached session is invalidated
  markUidDeletedLocally(targetUid);
  try {
    await setDoc(doc(db, 'deletedAccounts', targetUid), {
      uid: targetUid,
      deletedAt: new Date().toISOString(),
      deletedBy: performedBy,
      username: usernameToRelease || '',
      email: emailToRelease || '',
      phone: phoneToRelease || ''
    });
  } catch (e) {}

  // 8. Clean up all local caches for this user
  try {
    localStorage.removeItem(`umed_cached_profile_${targetUid}`);
    localStorage.removeItem(`umed_cached_role_${targetUid}`);
    localStorage.removeItem(`umed_enrollment_${targetUid}`);
    localStorage.removeItem(`umed_verification_${targetUid}`);
    const rawEnr = localStorage.getItem('umed_enrollments_all');
    if (rawEnr) {
      const list = JSON.parse(rawEnr) as StudentEnrollment[];
      localStorage.setItem('umed_enrollments_all', JSON.stringify(list.filter(e => e.uid !== targetUid)));
    }
  } catch (e) {}

  // 9. Write Cloud Audit Log
  await writeAuditLogToCloud({
    action: 'USER_ACCOUNT_DELETED',
    performedBy,
    targetUid,
    targetEmail: emailToRelease,
    details: {
      isSelfDelete: Boolean(isSelfDelete),
      releasedUsername: usernameToRelease,
      releasedEmail: emailToRelease,
      releasedPhone: phoneToRelease,
      releasedAcademicId: acadToRelease
    }
  });

  // 10. If Self-Delete, delete the Firebase Authentication user record and sign out
  if (isSelfDelete && auth.currentUser && auth.currentUser.uid === targetUid) {
    try {
      await deleteUser(auth.currentUser);
    } catch (e) {}
    try {
      await signOut(auth);
    } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// 9. Platform Owner Exclusive Cloud User Management Service
// ---------------------------------------------------------------------------

export interface ManagedCloudUserRecord {
  uid: string;
  username: string;
  displayNameArabic: string;
  email: string;
  phone: string;
  academicStudentNumber: string;
  role: UserRole;
  universityId: string;
  studyLevelId: string;
  assignedCourseId?: string;
  departmentTitle?: string;
  enrollmentStatus: EnrollmentStatus | 'not_enrolled';
  enrollmentId?: string;
  registrationMethod: 'username' | 'email' | 'phone' | 'google';
  isVerified: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: string;
  archiveReason?: string;
  isPrimaryOwner: boolean;
  ownerLinkedEmails?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetches, merges, and deduplicates all user accounts from Firestore Cloud
 * (`userProfiles`, `userRoles`, `studentEnrollments`, `deletedAccounts`)
 * exclusively for the Platform Owner.
 */
export async function fetchAllUsersForPlatformOwner(): Promise<ManagedCloudUserRecord[]> {
  const deletedUids = getLocalDeletedUids();

  try {
    const delSnap = await getDocs(collection(db, 'deletedAccounts'));
    delSnap.forEach((d) => {
      deletedUids.add(d.id);
      markUidDeletedLocally(d.id);
    });
  } catch (e) {}

  const profilesMap = new Map<string, UserProfile>();
  const rolesMap = new Map<string, UserRoleDoc>();
  const enrollmentsMap = new Map<string, StudentEnrollment>();

  try {
    const profSnap = await getDocs(collection(db, 'userProfiles'));
    profSnap.forEach((d) => {
      const p = d.data() as UserProfile;
      const uid = p.uid || d.id;
      if (uid && !deletedUids.has(uid)) {
        profilesMap.set(uid, { ...p, uid });
      }
    });
  } catch (e) {}

  try {
    const rolesList = await fetchAllUserRoles();
    rolesList.forEach((r) => {
      if (r.uid && !deletedUids.has(r.uid)) {
        rolesMap.set(r.uid, r);
      }
    });
  } catch (e) {}

  try {
    const enrSnap = await getDocs(collection(db, 'studentEnrollments'));
    enrSnap.forEach((d) => {
      const enr = { id: d.id, ...d.data() } as StudentEnrollment;
      if (enr.uid && !deletedUids.has(enr.uid)) {
        enrollmentsMap.set(enr.uid, enr);
      }
    });
  } catch (e) {}

  const ownerConfig = await fetchPrimaryOwnerIdentity();
  const allUids = new Set<string>([
    ...profilesMap.keys(),
    ...rolesMap.keys(),
    ...enrollmentsMap.keys()
  ]);

  const rawRecords: ManagedCloudUserRecord[] = [];

  for (const uid of allUids) {
    if (deletedUids.has(uid)) continue;
    const prof = profilesMap.get(uid);
    const roleDoc = rolesMap.get(uid);
    const enr = enrollmentsMap.get(uid);

    const rawEmail = prof?.email || roleDoc?.email || enr?.studentEmail || '';
    const isSyntheticPhoneEmail = rawEmail.startsWith('phone_') && rawEmail.endsWith('@umed.edu.ye');
    const isSyntheticUsernameEmail = rawEmail.startsWith('user_') && rawEmail.endsWith('@users.umed.edu.ye');
    const cleanEmail = isSyntheticPhoneEmail || isSyntheticUsernameEmail ? '' : rawEmail;

    const extractedPhoneFromEmail = isSyntheticPhoneEmail
      ? `+${rawEmail.replace(/^phone_/, '').replace(/@umed\.edu\.ye$/, '')}`
      : '';
    const extractedUsernameFromEmail = extractUsernameFromAuthEmail(rawEmail);
    const username = normalizeUsername(
      prof?.username ||
        roleDoc?.username ||
        extractedUsernameFromEmail ||
        (cleanEmail ? cleanEmail.split('@')[0] : '') ||
        `user_${uid.slice(0, 6)}`
    );

    const phone = prof?.phone || roleDoc?.phone || enr?.studentPhone || extractedPhoneFromEmail || '';
    const academicStudentNumber =
      prof?.academicStudentNumber || roleDoc?.academicStudentNumber || enr?.academicStudentNumber || '';

    const isOwner =
      Boolean(prof?.isPrimaryOwner) ||
      isInitialOwnerEmail(cleanEmail) ||
      (ownerConfig.ownerUid ? uid === ownerConfig.ownerUid : false);

    const regMethod: 'username' | 'email' | 'phone' | 'google' =
      prof?.registrationMethod ||
      (isSyntheticUsernameEmail
        ? 'username'
        : isSyntheticPhoneEmail || (phone && !cleanEmail)
        ? 'phone'
        : 'email');

    const isArchived = isOwner ? false : Boolean(prof?.isArchived || prof?.isActive === false);

    rawRecords.push({
      uid,
      username: isOwner ? (ownerConfig.username || 'umed_owner') : username,
      displayNameArabic:
        (isOwner ? ownerConfig.displayNameArabic : '') ||
        prof?.displayNameArabic ||
        roleDoc?.displayNameArabic ||
        enr?.studentNameArabic ||
        username ||
        'مستخدم مسجل',
      email: isOwner ? ownerConfig.primaryEmail : cleanEmail,
      phone: isOwner ? ownerConfig.phone : phone,
      academicStudentNumber: isOwner ? ownerConfig.academicStudentNumber : academicStudentNumber,
      role: isOwner ? 'platform_owner' : roleDoc?.role || 'student',
      universityId: roleDoc?.assignedUniversityId || enr?.universityId || 'univ-dar-al-salam',
      studyLevelId: roleDoc?.assignedStudyLevelId || enr?.currentStudyLevelId || 'lvl-4',
      assignedCourseId: roleDoc?.assignedCourseId,
      departmentTitle: roleDoc?.departmentTitle,
      enrollmentStatus: enr ? (enr.status || 'approved') : 'approved',
      enrollmentId: enr?.id,
      registrationMethod: regMethod,
      isVerified: true,
      emailVerified: true,
      phoneVerified: true,
      isActive: !isArchived,
      isArchived,
      archivedAt: prof?.archivedAt,
      archiveReason: prof?.archiveReason,
      isPrimaryOwner: isOwner,
      ownerLinkedEmails: isOwner ? INITIAL_OWNER_EMAILS : undefined,
      createdAt: prof?.createdAt || enr?.enrolledAt || roleDoc?.assignedAt || new Date().toISOString(),
      updatedAt: prof?.updatedAt || enr?.updatedAt || roleDoc?.assignedAt || new Date().toISOString()
    });
  }

  const ownerRecords = rawRecords.filter(r => r.isPrimaryOwner);
  const nonOwnerRecords = rawRecords.filter(r => !r.isPrimaryOwner);

  const preferredOwnerUid =
    (auth.currentUser && isInitialOwnerEmail(auth.currentUser.email) ? auth.currentUser.uid : undefined) ||
    ownerConfig.ownerUid ||
    ownerRecords[0]?.uid ||
    'owner-primary-umed';

  const preferredOwnerEmail =
    (auth.currentUser && isInitialOwnerEmail(auth.currentUser.email) ? auth.currentUser.email : undefined) ||
    ownerConfig.primaryEmail ||
    INITIAL_OWNER_EMAILS[0];

  const unifiedOwner: ManagedCloudUserRecord = {
    uid: preferredOwnerUid,
    username: ownerConfig.username || 'umed_owner',
    displayNameArabic: ownerConfig.displayNameArabic || DEFAULT_OWNER_NAME_ARABIC,
    email: preferredOwnerEmail,
    phone: ownerConfig.phone || DEFAULT_OWNER_PHONE,
    academicStudentNumber: ownerConfig.academicStudentNumber || DEFAULT_OWNER_ACADEMIC_ID,
    role: 'platform_owner',
    universityId: 'univ-dar-al-salam',
    studyLevelId: 'lvl-4',
    enrollmentStatus: 'approved',
    registrationMethod: 'email',
    isVerified: true,
    emailVerified: true,
    phoneVerified: true,
    isActive: true,
    isArchived: false,
    isPrimaryOwner: true,
    ownerLinkedEmails: INITIAL_OWNER_EMAILS,
    createdAt: ownerRecords[0]?.createdAt || '2024-01-01T00:00:00.000Z',
    updatedAt: ownerConfig.updatedAt || new Date().toISOString()
  };

  const seenUsernames = new Set<string>([unifiedOwner.username]);
  const seenEmails = new Set<string>(INITIAL_OWNER_EMAILS.map(e => e.toLowerCase()));
  const seenPhones = new Set<string>([unifiedOwner.phone]);
  const deduplicatedUsers: ManagedCloudUserRecord[] = [unifiedOwner];

  nonOwnerRecords.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  for (const item of nonOwnerRecords) {
    const normU = item.username ? normalizeUsername(item.username) : '';
    const normE = item.email ? normalizeEmail(item.email) : '';
    const normP = item.phone ? normalizeYemenPhone(item.phone) : '';
    if (normU && seenUsernames.has(normU)) continue;
    if (normE && seenEmails.has(normE)) continue;
    if (normP && seenPhones.has(normP)) continue;
    if (normU) seenUsernames.add(normU);
    if (normE) seenEmails.add(normE);
    if (normP) seenPhones.add(normP);
    deduplicatedUsers.push(item);
  }

  return deduplicatedUsers;
}

/**
 * Updates a user's profile, unique username, role, archive status, and enrollment in Cloud Firestore.
 * Exclusively callable by the Platform Owner.
 */
export async function updateUserAccountByPlatformOwner(params: {
  callerUid: string;
  callerEmail: string;
  targetUid: string;
  username?: string;
  displayNameArabic: string;
  email?: string;
  phone?: string;
  academicStudentNumber?: string;
  role: UserRole;
  universityId: string;
  studyLevelId: string;
  enrollmentStatus?: EnrollmentStatus | 'not_enrolled';
  isVerified: boolean;
  isArchived: boolean;
  archiveReason?: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const existingProfile = await fetchUserProfile(params.targetUid);

  const cleanUsername = params.username && params.username.trim()
    ? normalizeUsername(params.username)
    : existingProfile?.username || `user_${params.targetUid.slice(0, 6)}`;
  const cleanEmail = params.email && params.email.trim() ? normalizeEmail(params.email) : '';
  const cleanPhone = params.phone && params.phone.trim() ? normalizeYemenPhone(params.phone) : '';
  const cleanAcad =
    params.academicStudentNumber && params.academicStudentNumber.trim()
      ? normalizeAcademicId(params.academicStudentNumber)
      : '';

  const uniqueness = await checkIdentifierUniqueness({
    username: cleanUsername || undefined,
    email: cleanEmail || undefined,
    phone: cleanPhone || undefined,
    academicStudentNumber: cleanAcad || undefined,
    excludeUid: params.targetUid,
    allowOwnerSelfRegister: isInitialOwnerEmail(cleanEmail)
  });

  if (!uniqueness.isUnique) {
    throw new Error(uniqueness.message || 'البيانات المدخلة متعارضة مع حساب مستخدم آخر في المنصة.');
  }

  // Immediately delete old identifiers from Cloud Firestore if changed
  if (
    existingProfile?.username &&
    normalizeUsername(existingProfile.username) !== cleanUsername
  ) {
    await releaseUsernameIdentifier(existingProfile.username);
  }
  if (
    existingProfile?.email &&
    !isSyntheticUserEmail(existingProfile.email) &&
    normalizeEmail(existingProfile.email) !== cleanEmail
  ) {
    await releaseIdentifierKeyFromCloud(getEmailDocKey(existingProfile.email));
  }
  if (
    existingProfile?.phone &&
    normalizeYemenPhone(existingProfile.phone) !== cleanPhone
  ) {
    await releaseIdentifierKeyFromCloud(getPhoneDocKey(existingProfile.phone));
  }
  if (
    existingProfile?.academicStudentNumber &&
    normalizeAcademicId(existingProfile.academicStudentNumber) !== cleanAcad
  ) {
    await releaseIdentifierKeyFromCloud(getAcademicIdDocKey(existingProfile.academicStudentNumber));
  }

  const isOwnerTarget = isInitialOwnerEmail(cleanEmail) || Boolean(existingProfile?.isPrimaryOwner);

  const updatedProfile: UserProfile = cleanFirestoreData({
    ...(existingProfile || {}),
    uid: params.targetUid,
    username: cleanUsername,
    email: cleanEmail || existingProfile?.email || usernameToAuthEmail(cleanUsername),
    phone: cleanPhone || undefined,
    academicStudentNumber: cleanAcad || undefined,
    displayNameArabic: params.displayNameArabic.trim(),
    isActive: isOwnerTarget ? true : !params.isArchived,
    isArchived: isOwnerTarget ? false : params.isArchived,
    ...(params.isArchived
      ? {
          archivedAt: existingProfile?.archivedAt || nowIso,
          archivedBy: params.callerEmail || params.callerUid,
          archiveReason: params.archiveReason || 'تمت الأرشفة بواسطة مالك المنصة'
        }
      : {
          archivedAt: '',
          archiveReason: ''
        }),
    emailVerified: true,
    phoneVerified: true,
    isVerified: true,
    verifiedAt: existingProfile?.verifiedAt || nowIso,
    createdAt: existingProfile?.createdAt || nowIso,
    updatedAt: nowIso
  });

  await saveUserProfile(updatedProfile);

  if (params.role === 'student' && !isOwnerTarget) {
    await revokeUserRole({
      callerUid: params.callerUid,
      callerEmail: params.callerEmail,
      targetUid: params.targetUid,
      targetEmail: cleanEmail,
      universityId: params.universityId
    });
  } else {
    await assignUserRole({
      callerUid: params.callerUid,
      callerEmail: params.callerEmail,
      callerRole: 'platform_owner',
      targetUid: params.targetUid,
      email: cleanEmail || `${params.targetUid}@umed.edu.ye`,
      username: cleanUsername,
      displayNameArabic: params.displayNameArabic.trim(),
      phone: cleanPhone || undefined,
      academicStudentNumber: cleanAcad || undefined,
      role: isOwnerTarget ? 'platform_owner' : params.role,
      assignedUniversityId: params.universityId,
      assignedStudyLevelId: params.studyLevelId
    });
  }

  if (params.enrollmentStatus && params.enrollmentStatus !== 'not_enrolled') {
    const enrId = `enr-${params.targetUid}`;
    const enrDoc: StudentEnrollment = cleanFirestoreData({
      id: enrId,
      uid: params.targetUid,
      studentNameArabic: params.displayNameArabic.trim(),
      ...(cleanEmail ? { studentEmail: cleanEmail } : {}),
      ...(cleanPhone ? { studentPhone: cleanPhone } : {}),
      academicStudentNumber: cleanAcad || cleanUsername,
      universityId: params.universityId || 'univ-dar-al-salam',
      collegeId: 'col-medicine-dar',
      programId: 'prog-mbbs',
      curriculumVersionId: 'cur-dar-2024',
      currentStudyLevelId: params.studyLevelId || 'lvl-4',
      academicYear: '2025/2026',
      status: params.enrollmentStatus,
      reviewedBy: params.callerEmail || params.callerUid,
      reviewedAt: nowIso,
      enrolledAt: existingProfile?.createdAt || nowIso,
      updatedAt: nowIso
    });
    try {
      await setDoc(doc(db, 'studentEnrollments', enrId), enrDoc, { merge: true });
      localStorage.setItem(`umed_enrollment_${params.targetUid}`, JSON.stringify(enrDoc));
    } catch (e) {}
  }

  if (isOwnerTarget) {
    await syncAndDeduplicatePrimaryOwnerIdentity({
      ownerUid: params.targetUid,
      phone: cleanPhone || DEFAULT_OWNER_PHONE,
      displayNameArabic: params.displayNameArabic.trim(),
      academicStudentNumber: cleanAcad || DEFAULT_OWNER_ACADEMIC_ID
    });
  }

  await writeAuditLogToCloud({
    action: 'USER_PROFILE_UPDATED',
    performedBy: params.callerEmail || params.callerUid,
    targetUid: params.targetUid,
    targetEmail: cleanEmail,
    universityId: params.universityId,
    details: {
      username: cleanUsername,
      displayNameArabic: params.displayNameArabic,
      role: params.role,
      isArchived: params.isArchived
    }
  });
}

export async function toggleArchiveUserByPlatformOwner(params: {
  callerUid: string;
  callerEmail: string;
  targetUid: string;
  archive: boolean;
  reason?: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const prof = await fetchUserProfile(params.targetUid);
  if (prof?.isPrimaryOwner || isInitialOwnerEmail(prof?.email)) {
    throw new Error('لا يمكن أرشفة حساب المالك الأساسي للمنصة.');
  }

  const updated: Partial<UserProfile> = {
    uid: params.targetUid,
    isActive: !params.archive,
    isArchived: params.archive,
    archivedAt: params.archive ? nowIso : '',
    archivedBy: params.archive ? params.callerEmail || params.callerUid : '',
    archiveReason: params.archive ? params.reason || 'مؤرشف من قبل مالك المنصة' : '',
    updatedAt: nowIso
  };

  try {
    await Promise.all([
      setDoc(doc(db, 'userProfiles', params.targetUid), cleanFirestoreData(updated), { merge: true }),
      setDoc(doc(db, 'users', params.targetUid), cleanFirestoreData(updated), { merge: true }).catch(() => {})
    ]);
  } catch (e) {}

  await writeAuditLogToCloud({
    action: params.archive ? 'USER_ARCHIVED' : 'USER_UNARCHIVED',
    performedBy: params.callerEmail || params.callerUid,
    targetUid: params.targetUid,
    targetEmail: prof?.email,
    details: {
      archive: params.archive,
      reason: params.reason || ''
    }
  });
}

export async function confirmVerifyUserByPlatformOwner(params: {
  callerUid: string;
  callerEmail: string;
  targetUid: string;
  verified: boolean;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const prof = await fetchUserProfile(params.targetUid);

  try {
    await setDoc(
      doc(db, 'userProfiles', params.targetUid),
      cleanFirestoreData({
        uid: params.targetUid,
        isVerified: params.verified,
        emailVerified: params.verified,
        phoneVerified: params.verified,
        ...(params.verified ? { verifiedAt: nowIso } : {}),
        updatedAt: nowIso
      }),
      { merge: true }
    );
    if (params.verified) {
      await deleteDoc(doc(db, 'verificationChallenges', params.targetUid)).catch(() => {});
      localStorage.removeItem(`umed_verification_${params.targetUid}`);
    }
  } catch (e) {}

  await writeAuditLogToCloud({
    action: 'USER_VERIFIED',
    performedBy: params.callerEmail || params.callerUid,
    targetUid: params.targetUid,
    targetEmail: prof?.email,
    details: { verified: params.verified }
  });
}

// 10. Platform Owner Bootstrap Caller (Persists in both Server & Cloud Firestore)
export async function requestPlatformOwnerBootstrap(
  token: string,
  uid: string,
  email: string
): Promise<{ success: boolean; message: string; roleDoc?: UserRoleDoc }> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!isInitialOwnerEmail(normalizedEmail)) {
    throw new Error(`البريد الإلكتروني (${normalizedEmail}) غير مصرح له بتأسيس مالك المنصة.`);
  }

  await syncAndDeduplicatePrimaryOwnerIdentity({ ownerUid: uid });

  const ownerRoleDoc: UserRoleDoc = {
    uid,
    role: 'platform_owner',
    email: normalizedEmail,
    username: 'umed_owner',
    assignedAt: new Date().toISOString(),
    assignedBy: 'SERVER_BOOTSTRAP'
  };

  await saveUserRoleToFirestore(ownerRoleDoc);
  await writeAuditLogToCloud({
    action: 'OWNER_PROVISIONED',
    performedBy: normalizedEmail,
    targetUid: uid,
    targetEmail: normalizedEmail,
    details: { email: normalizedEmail, reason: 'Verified against INITIAL_OWNER_EMAILS' }
  });

  try {
    const response = await fetch('/api/admin/bootstrap-owner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ uid, email: normalizedEmail })
    });
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (e) {}

  return {
    success: true,
    message: 'تم التحقق وتثبيت بيانات المالك الأساسي (Platform Owner) ومنع تكرارها سحابياً بنجاح!',
    roleDoc: ownerRoleDoc
  };
}

// 11. Audit Logs Helpers (Merged Firestore + Server API)
export async function writeAuditLogToCloud(params: {
  action: AuditLog['action'];
  performedBy: string;
  targetUid?: string;
  targetEmail?: string;
  universityId?: string;
  details: string | Record<string, any>;
}): Promise<AuditLog> {
  const log: AuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    action: params.action,
    performedBy: params.performedBy,
    targetUid: params.targetUid,
    targetEmail: params.targetEmail,
    universityId: params.universityId,
    details: params.details,
    timestamp: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'auditLogs', log.id), cleanFirestoreData(log));
  } catch (e) {}

  return log;
}

export async function fetchMergedAuditLogs(): Promise<AuditLog[]> {
  const logsMap: Record<string, AuditLog> = {};

  try {
    const snap = await getDocs(collection(db, 'auditLogs'));
    snap.forEach((d) => {
      const item = d.data() as AuditLog;
      if (item && item.id) logsMap[item.id] = item;
    });
  } catch (e) {}

  try {
    const res = await fetch('/api/admin/audit-logs');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.logs)) {
        data.logs.forEach((item: AuditLog) => {
          if (item && item.id) logsMap[item.id] = item;
        });
      }
    }
  } catch (e) {}

  return Object.values(logsMap).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}
