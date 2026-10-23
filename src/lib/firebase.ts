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

// Dynamic Firebase Configuration supporting Cloudflare/Vercel Environment Variables
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId,
};

// Primary Platform Owner Official Details (Non-duplicable & Strictly Reserved)
export const INITIAL_OWNER_EMAILS = [
  'alssaedy50@gmail.com',
  'alssaedy500@gmail.com'
];

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
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

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
  return digits.length >= 8;
}

export function phoneToAuthEmail(phoneInput: string): string {
  const check = validateYemenPhoneFormat(phoneInput);
  if (!check.valid || !check.normalized) {
    throw new Error('INVALID_PHONE_NUMBER');
  }
  const cleanDigits = check.normalized.replace(/\D/g, '');
  return `phone_${cleanDigits}@umed.edu.ye`;
}

export function formatUserIdentifier(email?: string | null, phone?: string | null): string {
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
 * Checks that Email, Phone Number, and Academic Student Number are 100% unique
 * and not registered to any other active user account (`uid !== excludeUid`).
 * Also enforces Primary Owner identifier protection so no other account can claim
 * alssaedy50@gmail.com, alssaedy500@gmail.com, or the Primary Owner's phone number.
 */
export async function checkIdentifierUniqueness(params: {
  email?: string;
  phone?: string;
  academicStudentNumber?: string;
  excludeUid?: string;
  allowOwnerSelfRegister?: boolean;
}): Promise<{
  isUnique: boolean;
  conflictField?: 'email' | 'phone' | 'academic_id';
  message?: string;
}> {
  const excludeUid = params.excludeUid?.trim() || '';
  const ownerIdentity = await fetchPrimaryOwnerIdentity();
  const isCallerOwnerEmail = Boolean(params.email && isInitialOwnerEmail(params.email));

  // 1. Check Email Uniqueness
  if (params.email && params.email.trim() && !params.email.startsWith('phone_')) {
    const emailValidation = validateEmailFormat(params.email);
    if (!emailValidation.valid) {
      return { isUnique: false, conflictField: 'email', message: emailValidation.message };
    }
    const normEmail = emailValidation.normalized;
    const emailDocId = getEmailDocKey(normEmail);

    // Protect Primary Owner Emails from non-owner claims
    if (isInitialOwnerEmail(normEmail)) {
      if (excludeUid && ownerIdentity.ownerUid && excludeUid !== ownerIdentity.ownerUid) {
        return {
          isUnique: false,
          conflictField: 'email',
          message: `البريد الإلكتروني (${normEmail}) مخصص حصرياً للمالك الأساسي للمنصة ولا يُسمح بتكراره أو ربطه بحساب آخر.`
        };
      }
    }

    // Check Firestore uniqueIdentifiers first (Cloud Source of Truth)
    let cloudChecked = false;
    try {
      const snap = await getDoc(doc(db, 'uniqueIdentifiers', emailDocId));
      cloudChecked = true;
      if (snap.exists()) {
        const data = snap.data() as UniqueIdentifierRecord;
        // Check if this uid was deleted
        const isDeleted = data.uid ? await isAccountDeletedInCloud(data.uid) : false;
        if (isDeleted) {
          await releaseIdentifierKeyFromCloud(emailDocId);
        } else {
          saveLocalUniqueRecord(data);
          if (data.uid && data.uid !== excludeUid) {
            // Allow primary owner to claim/unify their own reserved record
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
        // Not in Firestore -> purge any stale local cache
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

    // Check Firestore userProfiles query (when authenticated)
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

    // Protect Primary Owner Phone from non-owner claims
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

    // Check Firestore userProfiles query for phone (when authenticated)
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

    // Check Firestore studentEnrollments
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
 * Reserves Email, Phone Number, and Academic Registration Number in Firestore `uniqueIdentifiers`
 * so no other account can claim them.
 */
export async function reserveUniqueIdentifiers(params: {
  uid: string;
  email?: string;
  phone?: string;
  academicStudentNumber?: string;
  universityId?: string;
}): Promise<void> {
  if (!params.uid) return;
  const nowIso = new Date().toISOString();
  const recordsToWrite: UniqueIdentifierRecord[] = [];

  if (params.email && params.email.trim() && !params.email.startsWith('phone_')) {
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

  // If phone changed from old owner phone, release old phone key
  if (currentConfig.phone && currentConfig.phone !== normPhone) {
    await releaseIdentifierKeyFromCloud(getPhoneDocKey(currentConfig.phone));
  }

  const updatedConfig: PrimaryOwnerIdentityConfig = {
    primaryEmail: 'alssaedy50@gmail.com',
    secondaryEmail: 'alssaedy500@gmail.com',
    emails: ['alssaedy50@gmail.com', 'alssaedy500@gmail.com'],
    phone: normPhone,
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

  // Reserve BOTH official owner emails + official owner phone + official academic number to prevent any duplication
  for (const ownerEmail of INITIAL_OWNER_EMAILS) {
    await reserveUniqueIdentifiers({
      uid: params.ownerUid,
      email: ownerEmail,
      phone: normPhone,
      academicStudentNumber: normAcad
    });
  }

  // Deduplicate any duplicate owner profiles or roles in Firestore
  try {
    const profilesSnap = await getDocs(collection(db, 'userProfiles'));
    for (const d of profilesSnap.docs) {
      const p = d.data() as UserProfile;
      const isOwnerMatch =
        isInitialOwnerEmail(p.email) ||
        p.isPrimaryOwner ||
        (p.phone && normalizeYemenPhone(p.phone) === normPhone);
      if (isOwnerMatch && d.id !== params.ownerUid) {
        // Remove duplicate owner profile doc so only the active ownerUid remains
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

  // Ensure canonical owner profile and role exist in Firestore
  const activeEmail = auth.currentUser?.email && isInitialOwnerEmail(auth.currentUser.email)
    ? normalizeEmail(auth.currentUser.email)
    : 'alssaedy50@gmail.com';

  const ownerProfile: UserProfile = {
    uid: params.ownerUid,
    email: activeEmail,
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
// 5C. Separated Account Verification Engine (Phone OR Email Verification)
// ---------------------------------------------------------------------------

function generateSixDigitOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function issueVerificationChallenge(
  user: User,
  params: {
    email?: string;
    phone?: string;
    method?: 'email' | 'phone' | 'both';
  }
): Promise<VerificationChallenge> {
  const realEmail =
    params.email && !params.email.startsWith('phone_')
      ? normalizeEmail(params.email)
      : user.email && !user.email.startsWith('phone_')
      ? normalizeEmail(user.email)
      : undefined;

  const normPhone = params.phone ? normalizeYemenPhone(params.phone) : undefined;

  // Determine strict separated method: 'phone' only verifies phone, 'email' only verifies email
  const method: 'email' | 'phone' | 'both' =
    params.method ||
    (normPhone && !realEmail ? 'phone' : realEmail && !normPhone ? 'email' : 'both');

  let firebaseEmailLinkSent = false;

  // Trigger real Firebase Email Verification link if verifying email
  if ((method === 'email' || method === 'both') && realEmail && user && !user.emailVerified) {
    try {
      await sendEmailVerification(user);
      firebaseEmailLinkSent = true;
    } catch (e) {
      console.warn('Firebase sendEmailVerification info:', e);
    }
  }

  const needPhoneVerify = method === 'phone' || (method === 'both' && Boolean(normPhone));
  const needEmailVerify = method === 'email' || (method === 'both' && Boolean(realEmail));

  const phoneCode = needPhoneVerify && normPhone ? generateSixDigitOtp() : undefined;
  const emailCode = needEmailVerify && realEmail ? generateSixDigitOtp() : undefined;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

  const challenge: VerificationChallenge = cleanFirestoreData({
    uid: user.uid,
    verificationMethod: method,
    ...(needEmailVerify && realEmail ? { email: realEmail, emailCode } : {}),
    ...(needPhoneVerify && normPhone ? { phone: normPhone, phoneCode } : {}),
    emailVerified: needEmailVerify ? Boolean(user.emailVerified) : true,
    phoneVerified: needPhoneVerify ? false : true,
    firebaseEmailLinkSent,
    expiresAt,
    createdAt: now.toISOString()
  });

  try {
    localStorage.setItem(`umed_verification_${user.uid}`, JSON.stringify(challenge));
  } catch (e) {}

  try {
    await setDoc(doc(db, 'verificationChallenges', user.uid), cleanFirestoreData(challenge), { merge: true });
  } catch (e) {}

  return challenge;
}

export async function getVerificationChallenge(uid: string): Promise<VerificationChallenge | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'verificationChallenges', uid));
    if (snap.exists()) {
      const ch = snap.data() as VerificationChallenge;
      if (ch.emailVerified && ch.phoneVerified) {
        try {
          localStorage.removeItem(`umed_verification_${uid}`);
        } catch (e) {}
        return null;
      }
      try {
        localStorage.setItem(`umed_verification_${uid}`, JSON.stringify(ch));
      } catch (e) {}
      return ch;
    } else {
      try {
        localStorage.removeItem(`umed_verification_${uid}`);
      } catch (e) {}
      return null;
    }
  } catch (e) {}

  try {
    const cached = localStorage.getItem(`umed_verification_${uid}`);
    if (cached) return JSON.parse(cached) as VerificationChallenge;
  } catch (e) {}

  return null;
}

export async function verifyAccountChallenge(
  user: User,
  params: {
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
  let currentChallenge = await getVerificationChallenge(user.uid);
  if (!currentChallenge) {
    return {
      verified: true,
      emailVerified: true,
      phoneVerified: true,
      challenge: null,
      message: 'تم تأكيد توثيق الحساب بنجاح ✓'
    };
  }

  let emailVerified = currentChallenge.emailVerified;
  let phoneVerified = currentChallenge.phoneVerified;

  // 1. Check if user clicked the official Firebase verification link in their email
  if (!emailVerified) {
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified || user.emailVerified) {
        emailVerified = true;
      }
    } catch (e) {}
  }

  // 2. Check Email OTP Code if needed
  if (!emailVerified && currentChallenge.emailCode) {
    if (params.emailCodeInput && params.emailCodeInput.trim()) {
      if (params.emailCodeInput.trim() === currentChallenge.emailCode.trim()) {
        emailVerified = true;
      } else {
        throw new Error('رمز التحقق من البريد الإلكتروني غير صحيح. يرجى التأكد من الأرقام الستة.');
      }
    } else if (!emailVerified) {
      throw new Error('يرجى إدخال رمز التحقق المرسل للبريد الإلكتروني (6 أرقام) أو الضغط على رابط التفعيل في بريدك.');
    }
  }

  // 3. Check Phone OTP Code if needed
  if (!phoneVerified && currentChallenge.phoneCode) {
    if (!params.phoneCodeInput || !params.phoneCodeInput.trim()) {
      throw new Error('يرجى إدخال رمز التحقق المرسل لرقم الهاتف المكون من 6 أرقام.');
    } else if (params.phoneCodeInput.trim() === currentChallenge.phoneCode.trim()) {
      phoneVerified = true;
    } else {
      throw new Error('رمز التحقق من رقم الهاتف غير صحيح. يرجى التأكد من الأرقام الستة.');
    }
  }

  const allVerified = emailVerified && phoneVerified;

  if (allVerified) {
    try {
      localStorage.removeItem(`umed_verification_${user.uid}`);
    } catch (e) {}
    try {
      await deleteDoc(doc(db, 'verificationChallenges', user.uid));
    } catch (e) {
      try {
        await setDoc(
          doc(db, 'verificationChallenges', user.uid),
          cleanFirestoreData({ ...currentChallenge, emailVerified: true, phoneVerified: true }),
          { merge: true }
        );
      } catch {}
    }
  } else {
    const updatedChallenge: VerificationChallenge = cleanFirestoreData({
      ...currentChallenge,
      emailVerified,
      phoneVerified
    });
    try {
      localStorage.setItem(`umed_verification_${user.uid}`, JSON.stringify(updatedChallenge));
    } catch (e) {}
    try {
      await setDoc(doc(db, 'verificationChallenges', user.uid), cleanFirestoreData(updatedChallenge), { merge: true });
    } catch (e) {}
  }

  return {
    verified: allVerified,
    emailVerified,
    phoneVerified,
    challenge: allVerified ? null : { ...currentChallenge, emailVerified, phoneVerified },
    message: allVerified
      ? 'تم تأكيد توثيق الحساب وتفعيله سحابياً بنجاح ✓'
      : 'تم تحديث حالة التحقق، يرجى إكمال الرمز المتبقي.'
  };
}

// ---------------------------------------------------------------------------
// 6. Authentication Service Functions (Separated Email vs. Phone + Cloud Checks)
// ---------------------------------------------------------------------------

async function enforceCloudAccountIntegrityAfterSignIn(signedInUser: User): Promise<User> {
  // 1. Check if this account was deleted from the cloud by the Platform Owner or previously self-deleted
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

  // 2. Check if this account is archived in userProfiles
  if (!isInitialOwnerEmail(signedInUser.email)) {
    try {
      const profSnap = await getDoc(doc(db, 'userProfiles', signedInUser.uid));
      if (profSnap.exists()) {
        const prof = profSnap.data() as UserProfile;
        if (prof.isArchived || prof.isActive === false) {
          throw new Error('ACCOUNT_ARCHIVED');
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
    // Fallback: if the user registered by phone and later linked an email in userProfiles
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

  try {
    const result = await createUserWithEmailAndPassword(auth, normEmail, pass);
    unmarkUidDeletedLocally(result.user.uid);
    return result.user;
  } catch (err: any) {
    // If Firebase Auth still had an orphaned credential from an account that was deleted from Firestore Cloud,
    // recover cleanly if the user signs in or purge the deleted Firebase Auth record and recreate it!
    if (err?.code === 'auth/email-already-in-use') {
      try {
        const emailDocId = getEmailDocKey(normEmail);
        const idSnap = await getDoc(doc(db, 'uniqueIdentifiers', emailDocId));
        const hasActiveIdentifier = idSnap.exists() && !(await isAccountDeletedInCloud((idSnap.data() as UniqueIdentifierRecord).uid));
        if (!hasActiveIdentifier) {
          // Orphaned auth user from a previously deleted cloud account: sign in, delete old auth user, and create fresh!
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
    // Fallback: if the user registered via Email (or is the Primary Owner with linked phone)
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
// 7. User Profile & Role Helpers
// ---------------------------------------------------------------------------

export async function fetchUserRole(uid: string, email?: string | null): Promise<UserRoleDoc | null> {
  // Automatic Owner Recognition & Deduplication if email matches INITIAL_OWNER_EMAILS
  if (email && isInitialOwnerEmail(email)) {
    const ownerIdentity = getCachedPrimaryOwnerIdentity();
    const ownerDoc: UserRoleDoc = {
      uid,
      role: 'platform_owner',
      email: email.trim().toLowerCase(),
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

  // Fallback to local roles map if offline
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

  // 1. Save to Firestore & Local Cache
  await saveUserRoleToFirestore(roleDoc);

  // 2. Record Audit Log in Firestore
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

  // 3. Also sync with backend API if reachable
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
    // Fallback: set role to 'student'
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
  try {
    const profileRef = doc(db, 'userProfiles', profile.uid);
    await setDoc(profileRef, cleanFirestoreData(profile), { merge: true });
    await reserveUniqueIdentifiers({
      uid: profile.uid,
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
 * (`userProfiles`, `userRoles`, `uniqueIdentifiers`, `verificationChallenges`,
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
  let emailToRelease: string | undefined;
  let phoneToRelease: string | undefined;
  let acadToRelease: string | undefined;

  try {
    const profSnap = await getDoc(doc(db, 'userProfiles', targetUid));
    if (profSnap.exists()) {
      const p = profSnap.data() as UserProfile;
      emailToRelease = p.email;
      phoneToRelease = p.phone;
      acadToRelease = p.academicStudentNumber;
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

  // Protect Primary Owner account from being deleted by mistake
  if (emailToRelease && isInitialOwnerEmail(emailToRelease)) {
    throw new Error('لا يمكن حذف الحساب الأساسي لمالك المنصة (Primary Platform Owner).');
  }

  // 2. Delete all reserved uniqueIdentifiers in Firestore & Local Cache
  if (emailToRelease && !emailToRelease.startsWith('phone_')) {
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

  // 6. Delete Verification Challenge, User Role, and User Profile in Firestore
  try {
    await deleteDoc(doc(db, 'verificationChallenges', targetUid));
  } catch (e) {}

  removeLocalRoleEntry(targetUid);
  try {
    await deleteDoc(doc(db, 'userRoles', targetUid));
  } catch (e) {}

  try {
    await deleteDoc(doc(db, 'userProfiles', targetUid));
  } catch (e) {}

  // 7. Record Tombstone in Firestore `deletedAccounts` so any cached session is invalidated
  markUidDeletedLocally(targetUid);
  try {
    await setDoc(doc(db, 'deletedAccounts', targetUid), {
      uid: targetUid,
      deletedAt: new Date().toISOString(),
      deletedBy: performedBy,
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
      releasedEmail: emailToRelease,
      releasedPhone: phoneToRelease,
      releasedAcademicId: acadToRelease
    }
  });

  // 10. If Self-Delete, delete the Firebase Authentication user record and sign out
  if (isSelfDelete && auth.currentUser && auth.currentUser.uid === targetUid) {
    try {
      await deleteUser(auth.currentUser);
    } catch (e) {
      // Even if Firebase Auth requires recent login, sign out immediately; tombstone in deletedAccounts blocks future access
    }
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
  registrationMethod: 'email' | 'phone' | 'google';
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

  // 1. Load deleted accounts from Cloud Firestore
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

  // 2. Load all userProfiles from Firestore
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

  // 3. Load all userRoles from Firestore
  try {
    const rolesList = await fetchAllUserRoles();
    rolesList.forEach((r) => {
      if (r.uid && !deletedUids.has(r.uid)) {
        rolesMap.set(r.uid, r);
      }
    });
  } catch (e) {}

  // 4. Load all studentEnrollments from Firestore
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
    const cleanEmail = isSyntheticPhoneEmail ? '' : rawEmail;

    const extractedPhoneFromEmail = isSyntheticPhoneEmail
      ? `+${rawEmail.replace(/^phone_/, '').replace(/@umed\.edu\.ye$/, '')}`
      : '';
    const phone = prof?.phone || roleDoc?.phone || enr?.studentPhone || extractedPhoneFromEmail || '';
    const academicStudentNumber =
      prof?.academicStudentNumber || roleDoc?.academicStudentNumber || enr?.academicStudentNumber || '';

    const isOwner =
      Boolean(prof?.isPrimaryOwner) ||
      isInitialOwnerEmail(cleanEmail) ||
      (ownerConfig.ownerUid ? uid === ownerConfig.ownerUid : false);

    const regMethod: 'email' | 'phone' | 'google' =
      prof?.registrationMethod ||
      (isSyntheticPhoneEmail || (phone && !cleanEmail) ? 'phone' : 'email');

    const emailVerified = isOwner ? true : Boolean(prof?.emailVerified ?? (cleanEmail ? true : false));
    const phoneVerified = isOwner ? true : Boolean(prof?.phoneVerified ?? (phone ? true : false));
    const isVerified = isOwner ? true : Boolean(prof?.isVerified ?? (emailVerified && phoneVerified));
    const isArchived = isOwner ? false : Boolean(prof?.isArchived || prof?.isActive === false);

    rawRecords.push({
      uid,
      displayNameArabic:
        (isOwner ? ownerConfig.displayNameArabic : '') ||
        prof?.displayNameArabic ||
        roleDoc?.displayNameArabic ||
        enr?.studentNameArabic ||
        'مستخدم مسجل',
      email: isOwner ? ownerConfig.primaryEmail : cleanEmail,
      phone: isOwner ? ownerConfig.phone : phone,
      academicStudentNumber: isOwner ? ownerConfig.academicStudentNumber : academicStudentNumber,
      role: isOwner ? 'platform_owner' : roleDoc?.role || 'student',
      universityId: roleDoc?.assignedUniversityId || enr?.universityId || 'univ-dar-al-salam',
      studyLevelId: roleDoc?.assignedStudyLevelId || enr?.currentStudyLevelId || 'lvl-4',
      assignedCourseId: roleDoc?.assignedCourseId,
      departmentTitle: roleDoc?.departmentTitle,
      enrollmentStatus: enr ? (enr.status || enr.enrollmentStatus || 'pending') : 'not_enrolled',
      enrollmentId: enr?.id,
      registrationMethod: regMethod,
      isVerified,
      emailVerified,
      phoneVerified,
      isActive: !isArchived,
      isArchived,
      archivedAt: prof?.archivedAt,
      archiveReason: prof?.archiveReason,
      isPrimaryOwner: isOwner,
      ownerLinkedEmails: isOwner ? ['alssaedy50@gmail.com', 'alssaedy500@gmail.com'] : undefined,
      createdAt: prof?.createdAt || enr?.enrolledAt || roleDoc?.assignedAt || new Date().toISOString(),
      updatedAt: prof?.updatedAt || enr?.updatedAt || roleDoc?.assignedAt || new Date().toISOString()
    });
  }

  // Deduplicate Primary Owner records so only ONE unified Primary Owner record is ever shown
  const ownerRecords = rawRecords.filter(r => r.isPrimaryOwner);
  const nonOwnerRecords = rawRecords.filter(r => !r.isPrimaryOwner);

  let unifiedOwner: ManagedCloudUserRecord;
  const preferredOwnerUid =
    (auth.currentUser && isInitialOwnerEmail(auth.currentUser.email) ? auth.currentUser.uid : undefined) ||
    ownerConfig.ownerUid ||
    ownerRecords[0]?.uid ||
    'owner-primary-umed';

  unifiedOwner = {
    uid: preferredOwnerUid,
    displayNameArabic: ownerConfig.displayNameArabic || DEFAULT_OWNER_NAME_ARABIC,
    email: 'alssaedy50@gmail.com',
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
    ownerLinkedEmails: ['alssaedy50@gmail.com', 'alssaedy500@gmail.com'],
    createdAt: ownerRecords[0]?.createdAt || '2024-01-01T00:00:00.000Z',
    updatedAt: ownerConfig.updatedAt || new Date().toISOString()
  };

  // Deduplicate non-owner records by email or phone if any legacy duplicate existed
  const seenEmails = new Set<string>(['alssaedy50@gmail.com', 'alssaedy500@gmail.com']);
  const seenPhones = new Set<string>([unifiedOwner.phone]);
  const deduplicatedUsers: ManagedCloudUserRecord[] = [unifiedOwner];

  nonOwnerRecords.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  for (const item of nonOwnerRecords) {
    const normE = item.email ? normalizeEmail(item.email) : '';
    const normP = item.phone ? normalizeYemenPhone(item.phone) : '';
    if (normE && seenEmails.has(normE)) continue;
    if (normP && seenPhones.has(normP)) continue;
    if (normE) seenEmails.add(normE);
    if (normP) seenPhones.add(normP);
    deduplicatedUsers.push(item);
  }

  return deduplicatedUsers;
}

/**
 * Updates a user's profile, role, verification status, archive status, and enrollment in Cloud Firestore.
 * Exclusively callable by the Platform Owner.
 */
export async function updateUserAccountByPlatformOwner(params: {
  callerUid: string;
  callerEmail: string;
  targetUid: string;
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

  const cleanEmail = params.email && params.email.trim() ? normalizeEmail(params.email) : '';
  const cleanPhone = params.phone && params.phone.trim() ? normalizeYemenPhone(params.phone) : '';
  const cleanAcad =
    params.academicStudentNumber && params.academicStudentNumber.trim()
      ? normalizeAcademicId(params.academicStudentNumber)
      : '';

  // Validate uniqueness excluding targetUid
  const uniqueness = await checkIdentifierUniqueness({
    email: cleanEmail || undefined,
    phone: cleanPhone || undefined,
    academicStudentNumber: cleanAcad || undefined,
    excludeUid: params.targetUid,
    allowOwnerSelfRegister: isInitialOwnerEmail(cleanEmail)
  });

  if (!uniqueness.isUnique) {
    throw new Error(uniqueness.message || 'البيانات المدخلة متعارضة مع حساب مستخدم آخر في المنصة.');
  }

  // Release old identifiers if they were changed
  if (
    existingProfile?.email &&
    !existingProfile.email.startsWith('phone_') &&
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
    email: cleanEmail || existingProfile?.email || '',
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
    emailVerified: params.isVerified ? true : Boolean(existingProfile?.emailVerified),
    phoneVerified: params.isVerified ? true : Boolean(existingProfile?.phoneVerified),
    isVerified: isOwnerTarget ? true : params.isVerified,
    ...(params.isVerified ? { verifiedAt: existingProfile?.verifiedAt || nowIso } : {}),
    createdAt: existingProfile?.createdAt || nowIso,
    updatedAt: nowIso
  });

  await saveUserProfile(updatedProfile);

  // If verified by owner, remove any pending verification challenge from Firestore
  if (params.isVerified) {
    try {
      await deleteDoc(doc(db, 'verificationChallenges', params.targetUid));
      localStorage.removeItem(`umed_verification_${params.targetUid}`);
    } catch (e) {}
  }

  // Update Role in Firestore
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
      displayNameArabic: params.displayNameArabic.trim(),
      phone: cleanPhone || undefined,
      academicStudentNumber: cleanAcad || undefined,
      role: isOwnerTarget ? 'platform_owner' : params.role,
      assignedUniversityId: params.universityId,
      assignedStudyLevelId: params.studyLevelId
    });
  }

  // Update or Create Student Enrollment in Firestore if enrollmentStatus is set
  if (params.enrollmentStatus && params.enrollmentStatus !== 'not_enrolled') {
    const enrId = `enr-${params.targetUid}`;
    const enrDoc: StudentEnrollment = cleanFirestoreData({
      id: enrId,
      uid: params.targetUid,
      studentNameArabic: params.displayNameArabic.trim(),
      ...(cleanEmail ? { studentEmail: cleanEmail } : {}),
      ...(cleanPhone ? { studentPhone: cleanPhone } : {}),
      academicStudentNumber: cleanAcad || `MED-${params.targetUid.slice(0, 6).toUpperCase()}`,
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

  // If this is the Primary Owner, also sync owner_identity in Firestore
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
      displayNameArabic: params.displayNameArabic,
      role: params.role,
      isVerified: params.isVerified,
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
    await setDoc(doc(db, 'userProfiles', params.targetUid), cleanFirestoreData(updated), { merge: true });
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
