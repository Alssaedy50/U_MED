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
  VerificationChallenge
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

// Initial Owner Email Constants (Supports configured and primary developer emails)
export const INITIAL_OWNER_EMAILS = [
  'alssaedy500@gmail.com',
  'alssaedy50@gmail.com'
];

export const isInitialOwnerEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return INITIAL_OWNER_EMAILS.includes(email.trim().toLowerCase());
};

export const INITIAL_OWNER_EMAIL = INITIAL_OWNER_EMAILS[0];

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
// 5B. Global Uniqueness Registry (Email, Phone Number, Academic ID)
// ---------------------------------------------------------------------------

const UNIQUE_CACHE_KEY = 'umed_unique_identifiers_cache';

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

/**
 * Checks that Email, Phone Number, and Academic Student Number are 100% unique
 * and not registered to any other user account (`uid !== excludeUid`).
 */
export async function checkIdentifierUniqueness(params: {
  email?: string;
  phone?: string;
  academicStudentNumber?: string;
  excludeUid?: string;
}): Promise<{
  isUnique: boolean;
  conflictField?: 'email' | 'phone' | 'academic_id';
  message?: string;
}> {
  const excludeUid = params.excludeUid?.trim() || '';
  const localCache = getLocalUniqueCache();

  // 1. Check Email Uniqueness
  if (params.email && params.email.trim() && !params.email.startsWith('phone_')) {
    const emailValidation = validateEmailFormat(params.email);
    if (!emailValidation.valid) {
      return { isUnique: false, conflictField: 'email', message: emailValidation.message };
    }
    const normEmail = emailValidation.normalized;
    const emailDocId = getEmailDocKey(normEmail);

    // Check Local Cache
    const cachedEmailRec = localCache[emailDocId];
    if (cachedEmailRec && cachedEmailRec.uid && cachedEmailRec.uid !== excludeUid) {
      return {
        isUnique: false,
        conflictField: 'email',
        message: `البريد الإلكتروني (${normEmail}) مسجل مسبقاً لحساب آخر في المنصة. لا يُسمح باستخدام نفس البريد لأكثر من حساب.`
      };
    }

    // Check Firestore uniqueIdentifiers
    try {
      const snap = await getDoc(doc(db, 'uniqueIdentifiers', emailDocId));
      if (snap.exists()) {
        const data = snap.data() as UniqueIdentifierRecord;
        saveLocalUniqueRecord(data);
        if (data.uid && data.uid !== excludeUid) {
          return {
            isUnique: false,
            conflictField: 'email',
            message: `البريد الإلكتروني (${normEmail}) مسجل مسبقاً لحساب آخر في المنصة. لا يُسمح باستخدام نفس البريد لأكثر من حساب.`
          };
        }
      }
    } catch (e) {}

    // Check Firestore userProfiles query
    try {
      const q = query(collection(db, 'userProfiles'), where('email', '==', normEmail));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (d.id !== excludeUid) {
          return {
            isUnique: false,
            conflictField: 'email',
            message: `البريد الإلكتروني (${normEmail}) مرتبط بحساب آخر مسجل مسبقاً في المنصة.`
          };
        }
      }
    } catch (e) {}

    // Check Firebase Auth signInMethods if creating a new account (no excludeUid)
    if (!excludeUid) {
      try {
        const methods = await fetchSignInMethodsForEmail(auth, normEmail);
        if (methods && methods.length > 0) {
          return {
            isUnique: false,
            conflictField: 'email',
            message: `البريد الإلكتروني (${normEmail}) مسجل مسبقاً في المنصة، يرجى تسجيل الدخول به أو استخدام بريد مختلف.`
          };
        }
      } catch (e) {}
    }
  }

  // 2. Check Phone Number Uniqueness
  if (params.phone && params.phone.trim()) {
    const phoneValidation = validateYemenPhoneFormat(params.phone);
    if (!phoneValidation.valid) {
      return { isUnique: false, conflictField: 'phone', message: phoneValidation.message };
    }
    const normPhone = phoneValidation.normalized;
    const phoneDocId = getPhoneDocKey(normPhone);

    // Check Local Cache
    if (phoneDocId) {
      const cachedPhoneRec = localCache[phoneDocId];
      if (cachedPhoneRec && cachedPhoneRec.uid && cachedPhoneRec.uid !== excludeUid) {
        return {
          isUnique: false,
          conflictField: 'phone',
          message: `رقم الهاتف (${normPhone}) مسجل مسبقاً لحساب آخر في المنصة. لا يُسمح بالتسجيل بنفس رقم الهاتف لأكثر من حساب.`
        };
      }

      // Check Firestore uniqueIdentifiers
      try {
        const snap = await getDoc(doc(db, 'uniqueIdentifiers', phoneDocId));
        if (snap.exists()) {
          const data = snap.data() as UniqueIdentifierRecord;
          saveLocalUniqueRecord(data);
          if (data.uid && data.uid !== excludeUid) {
            return {
              isUnique: false,
              conflictField: 'phone',
              message: `رقم الهاتف (${normPhone}) مسجل مسبقاً لحساب آخر في المنصة. لا يُسمح بالتسجيل بنفس رقم الهاتف لأكثر من حساب.`
            };
          }
        }
      } catch (e) {}
    }

    // Check Firestore userProfiles query for phone
    try {
      const q = query(collection(db, 'userProfiles'), where('phone', '==', normPhone));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (d.id !== excludeUid) {
          return {
            isUnique: false,
            conflictField: 'phone',
            message: `رقم الهاتف (${normPhone}) مرتبط بحساب مستخدم آخر مسجل مسبقاً.`
          };
        }
      }
    } catch (e) {}

    // Check Firebase Auth synthetic phone email if creating a new account
    if (!excludeUid) {
      try {
        const synthEmail = phoneToAuthEmail(normPhone);
        const methods = await fetchSignInMethodsForEmail(auth, synthEmail);
        if (methods && methods.length > 0) {
          return {
            isUnique: false,
            conflictField: 'phone',
            message: `رقم الهاتف (${normPhone}) مسجل مسبقاً في المنصة، يرجى الانتقال إلى تبويب "تسجيل الدخول".`
          };
        }
      } catch (e) {}
    }
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

    // Check Local Cache
    const cachedAcadRec = localCache[acadDocId];
    if (cachedAcadRec && cachedAcadRec.uid && cachedAcadRec.uid !== excludeUid) {
      return {
        isUnique: false,
        conflictField: 'academic_id',
        message: `رقم القيد الأكاديمي (${normAcad}) مسجل مسبقاً لطالب آخر في المنصة. لا يمكن استخدام نفس رقم القيد لأكثر من حساب.`
      };
    }

    // Check Local Enrollments list
    try {
      const rawEnr = localStorage.getItem('umed_enrollments_all');
      if (rawEnr) {
        const list = JSON.parse(rawEnr) as Array<{ uid: string; academicStudentNumber?: string; status?: string }>;
        const duplicateLocal = list.find(
          (e) =>
            e.uid &&
            e.uid !== excludeUid &&
            e.academicStudentNumber &&
            getAcademicIdDocKey(e.academicStudentNumber) === acadDocId
        );
        if (duplicateLocal) {
          return {
            isUnique: false,
            conflictField: 'academic_id',
            message: `رقم القيد الأكاديمي (${normAcad}) مسجل مسبقاً لطالب آخر في المنصة. لا يُسمح بتكرار رقم القيد.`
          };
        }
      }
    } catch (e) {}

    // Check Firestore uniqueIdentifiers
    try {
      const snap = await getDoc(doc(db, 'uniqueIdentifiers', acadDocId));
      if (snap.exists()) {
        const data = snap.data() as UniqueIdentifierRecord;
        saveLocalUniqueRecord(data);
        if (data.uid && data.uid !== excludeUid) {
          return {
            isUnique: false,
            conflictField: 'academic_id',
            message: `رقم القيد الأكاديمي (${normAcad}) مسجل مسبقاً لطالب آخر في المنصة. لا يمكن استخدام نفس رقم القيد لأكثر من حساب.`
          };
        }
      }
    } catch (e) {}

    // Check Firestore studentEnrollments & userProfiles
    try {
      const qEnr = query(collection(db, 'studentEnrollments'), where('academicStudentNumber', '==', normAcad));
      const snapEnr = await getDocs(qEnr);
      for (const d of snapEnr.docs) {
        const data = d.data();
        if (data.uid && data.uid !== excludeUid) {
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
  removeLocalUniqueRecord(acadKey);
  try {
    await deleteDoc(doc(db, 'uniqueIdentifiers', acadKey));
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// 5C. Account Verification Engine (Email Link + Phone & Email 6-Digit OTP)
// ---------------------------------------------------------------------------

function generateSixDigitOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function issueVerificationChallenge(
  user: User,
  params: { email?: string; phone?: string }
): Promise<VerificationChallenge> {
  const realEmail =
    params.email && !params.email.startsWith('phone_')
      ? normalizeEmail(params.email)
      : user.email && !user.email.startsWith('phone_')
      ? normalizeEmail(user.email)
      : undefined;

  const normPhone = params.phone ? normalizeYemenPhone(params.phone) : undefined;
  let firebaseEmailLinkSent = false;

  // Trigger real Firebase Email Verification link if user has a real email address
  if (realEmail && user && !user.emailVerified) {
    try {
      await sendEmailVerification(user);
      firebaseEmailLinkSent = true;
    } catch (e) {
      console.warn('Firebase sendEmailVerification info:', e);
    }
  }

  const phoneCode = normPhone ? generateSixDigitOtp() : undefined;
  const emailCode = realEmail ? generateSixDigitOtp() : undefined;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

  const challenge: VerificationChallenge = cleanFirestoreData({
    uid: user.uid,
    ...(realEmail ? { email: realEmail, emailCode } : {}),
    ...(normPhone ? { phone: normPhone, phoneCode } : {}),
    emailVerified: realEmail ? Boolean(user.emailVerified) : true,
    phoneVerified: normPhone ? false : true,
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
    const cached = localStorage.getItem(`umed_verification_${uid}`);
    if (cached) return JSON.parse(cached) as VerificationChallenge;
  } catch (e) {}

  try {
    const snap = await getDoc(doc(db, 'verificationChallenges', uid));
    if (snap.exists()) {
      const ch = snap.data() as VerificationChallenge;
      try {
        localStorage.setItem(`umed_verification_${uid}`, JSON.stringify(ch));
      } catch (e) {}
      return ch;
    }
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
      message: 'تم التحقق من الحساب بنجاح ✓'
    };
  }

  let emailVerified = currentChallenge.emailVerified;
  let phoneVerified = currentChallenge.phoneVerified;

  // 1. Check if user clicked the official Firebase verification link in their email
  if (params.checkFirebaseEmailLink || !emailVerified) {
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified || user.emailVerified) {
        emailVerified = true;
      }
    } catch (e) {}
  }

  // 2. Check Email OTP Code if entered
  if (!emailVerified && params.emailCodeInput && currentChallenge.emailCode) {
    if (params.emailCodeInput.trim() === currentChallenge.emailCode.trim()) {
      emailVerified = true;
    } else if (!params.checkFirebaseEmailLink) {
      throw new Error('رمز التحقق من البريد الإلكتروني غير صحيح. يرجى التأكد من الرمز المكون من 6 أرقام.');
    }
  }

  // 3. Check Phone OTP Code if entered
  if (!phoneVerified && currentChallenge.phoneCode) {
    if (!params.phoneCodeInput || !params.phoneCodeInput.trim()) {
      if (!params.checkFirebaseEmailLink) {
        throw new Error('يرجى إدخال رمز التحقق المرسل لرقم الهاتف المكون من 6 أرقام.');
      }
    } else if (params.phoneCodeInput.trim() === currentChallenge.phoneCode.trim()) {
      phoneVerified = true;
    } else {
      throw new Error('رمز التحقق من رقم الهاتف غير صحيح. يرجى التأكد من الأرقام الستة.');
    }
  }

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

  const allVerified = emailVerified && phoneVerified;

  if (allVerified) {
    try {
      localStorage.removeItem(`umed_verification_${user.uid}`);
    } catch (e) {}
  }

  return {
    verified: allVerified,
    emailVerified,
    phoneVerified,
    challenge: allVerified ? null : updatedChallenge,
    message: allVerified
      ? 'تم التحقق من رقم الهاتف والبريد الإلكتروني وتوثيق الحساب بنجاح ✓'
      : 'تم تحديث حالة التحقق، يرجى استكمال الخطوة المتبقية.'
  };
}

// 6. Authentication Service Functions
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithEmail(emailOrPhone: string, pass: string): Promise<User> {
  const targetEmail = isPhoneIdentifier(emailOrPhone)
    ? phoneToAuthEmail(emailOrPhone)
    : emailOrPhone.trim().toLowerCase();
  const result = await signInWithEmailAndPassword(auth, targetEmail, pass);
  return result.user;
}

export async function signUpWithEmail(email: string, pass: string): Promise<User> {
  const emailCheck = validateEmailFormat(email);
  if (!emailCheck.valid) {
    throw new Error(emailCheck.message || 'البريد الإلكتروني غير صحيح');
  }
  const result = await createUserWithEmailAndPassword(auth, emailCheck.normalized, pass);
  return result.user;
}

export async function signInWithPhone(phone: string, pass: string): Promise<User> {
  const authEmail = phoneToAuthEmail(phone);
  const result = await signInWithEmailAndPassword(auth, authEmail, pass);
  return result.user;
}

export async function signUpWithPhone(phone: string, pass: string): Promise<{ user: User; normalizedPhone: string }> {
  const check = validateYemenPhoneFormat(phone);
  if (!check.valid || !check.normalized) {
    throw new Error(check.message || 'INVALID_PHONE_NUMBER');
  }
  const authEmail = phoneToAuthEmail(check.normalized);
  const result = await createUserWithEmailAndPassword(auth, authEmail, pass);
  return { user: result.user, normalizedPhone: check.normalized };
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

// 6. User Profile & Role Helpers
export async function fetchUserRole(uid: string, email?: string | null): Promise<UserRoleDoc | null> {
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

  // Automatic Owner Recognition if email matches INITIAL_OWNER_EMAILS
  if (email && isInitialOwnerEmail(email)) {
    const ownerDoc: UserRoleDoc = {
      uid,
      role: 'platform_owner',
      email: email.trim().toLowerCase(),
      assignedAt: new Date().toISOString(),
      assignedBy: 'SYSTEM_BOOTSTRAP',
      assignedByRole: 'platform_owner'
    };
    writeLocalRoleEntry(ownerDoc);
    try {
      await setDoc(doc(db, 'userRoles', uid), ownerDoc, { merge: true });
    } catch (e) {}
    return ownerDoc;
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
  const map: Record<string, UserRoleDoc> = { ...readLocalRolesMap() };
  try {
    const snap = await getDocs(collection(db, 'userRoles'));
    snap.forEach((d) => {
      const data = d.data() as UserRoleDoc;
      if (data && data.uid) {
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
          if (r && r.uid && !map[r.uid]) map[r.uid] = r;
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

// 7. Platform Owner Bootstrap Caller (Persists in both Server & Cloud Firestore)
export async function requestPlatformOwnerBootstrap(
  token: string,
  uid: string,
  email: string
): Promise<{ success: boolean; message: string; roleDoc?: UserRoleDoc }> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!isInitialOwnerEmail(normalizedEmail)) {
    throw new Error(`البريد الإلكتروني (${normalizedEmail}) غير مصرح له بتأسيس مالك المنصة.`);
  }

  const ownerRoleDoc: UserRoleDoc = {
    uid,
    role: 'platform_owner',
    email: normalizedEmail,
    assignedAt: new Date().toISOString(),
    assignedBy: 'SERVER_BOOTSTRAP'
  };

  // Persist directly to Firestore for serverless permanence
  await saveUserRoleToFirestore(ownerRoleDoc);
  await writeAuditLogToCloud({
    action: 'OWNER_PROVISIONED',
    performedBy: normalizedEmail,
    targetUid: uid,
    targetEmail: normalizedEmail,
    details: { email: normalizedEmail, reason: 'Verified against INITIAL_OWNER_EMAIL' }
  });

  // Also invoke backend API endpoint
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
  } catch (e) {
    // Fallback to Firestore verification result if serverless endpoint is cold-starting
  }

  return {
    success: true,
    message: 'تم التحقق وترقية الحساب إلى مالك المنصة (Platform Owner) وحفظه سحابياً بنجاح!',
    roleDoc: ownerRoleDoc
  };
}

// 8. Audit Logs Helpers (Merged Firestore + Server API)
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
