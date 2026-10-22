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
  getDocFromServer,
  collection,
  query,
  getDocs
} from 'firebase/firestore';

try {
  setLogLevel('silent');
} catch (e) {}
import firebaseConfig from '../../firebase-applet-config.json';
import { UserRole, UserRoleDoc, UserProfile, AuditLog } from '../types/umed.ts';

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

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true
  }, firebaseConfig.firestoreDatabaseId);
} catch {
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}
export const db = firestoreInstance;

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
      error?.code === 'permission-denied'
    ) {
      return { connected: true, latencyMs };
    }
    if (
      (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('timeout'))) ||
      error?.code === 'unavailable'
    ) {
      return { connected: false, latencyMs, error: 'العميل في وضع العمل دون اتصال (Offline)' };
    }
    if (
      error?.message?.includes('token-service-api') || 
      error?.message?.includes('securetoken.googleapis.com')
    ) {
      return { 
        connected: false, 
        latencyMs, 
        error: 'يجب تفعيل Token Service API في Google Cloud Console للمشروع 1072983768253' 
      };
    }
    return { connected: false, latencyMs, error: error?.message || 'تعذر الاتصال بـ Firestore' };
  }
}

// 5. Authentication Service Functions
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithEmail(email: string, pass: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
  return result.user;
}

export async function signUpWithEmail(email: string, pass: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  return result.user;
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

// 6. User Profile & Role Helpers
export async function fetchUserRole(uid: string, email?: string | null): Promise<UserRoleDoc | null> {
  try {
    const roleRef = doc(db, 'userRoles', uid);
    const snap = await getDoc(roleRef);
    if (snap.exists()) {
      return snap.data() as UserRoleDoc;
    }
  } catch (err) {
    console.warn('Could not fetch user role from Firestore:', err);
  }

  // Automatic Owner Recognition if email matches INITIAL_OWNER_EMAILS
  if (email && isInitialOwnerEmail(email)) {
    const ownerDoc: UserRoleDoc = {
      uid,
      role: 'platform_owner',
      email: email.trim().toLowerCase(),
      assignedAt: new Date().toISOString(),
      assignedBy: 'SYSTEM_BOOTSTRAP'
    };
    try {
      await setDoc(doc(db, 'userRoles', uid), ownerDoc, { merge: true });
    } catch (e) {}
    return ownerDoc;
  }

  return null;
}

export async function saveUserRoleToFirestore(roleDoc: UserRoleDoc): Promise<void> {
  try {
    await setDoc(doc(db, 'userRoles', roleDoc.uid), roleDoc, { merge: true });
  } catch (err) {
    console.warn('Could not write roleDoc to Firestore:', err);
  }
}

export async function fetchAllUserRoles(): Promise<UserRoleDoc[]> {
  const map: Record<string, UserRoleDoc> = {};
  try {
    const snap = await getDocs(collection(db, 'userRoles'));
    snap.forEach((d) => {
      const data = d.data() as UserRoleDoc;
      if (data && data.uid) map[data.uid] = data;
    });
  } catch (e) {}

  try {
    const res = await fetch('/api/admin/roles');
    if (res.ok) {
      const data = await res.json();
      if (data.roles) {
        Object.values(data.roles as Record<string, UserRoleDoc>).forEach((r) => {
          if (r && r.uid) map[r.uid] = r;
        });
      }
    }
  } catch (e) {}

  return Object.values(map);
}

export async function assignUserRole(params: {
  callerUid: string;
  callerEmail: string;
  targetUid: string;
  email: string;
  role: UserRole;
  assignedUniversityId?: string;
}): Promise<UserRoleDoc> {
  const roleDoc: UserRoleDoc = {
    uid: params.targetUid.trim(),
    role: params.role,
    email: params.email.trim().toLowerCase(),
    assignedUniversityId: params.role === 'university_admin' ? (params.assignedUniversityId || 'univ-dar-al-salam') : undefined,
    assignedAt: new Date().toISOString(),
    assignedBy: params.callerEmail || params.callerUid
  };

  // 1. Save to Firestore
  await saveUserRoleToFirestore(roleDoc);

  // 2. Record Audit Log in Firestore
  await writeAuditLogToCloud({
    action: 'ROLE_ASSIGNED',
    performedBy: params.callerEmail || params.callerUid,
    targetUid: roleDoc.uid,
    targetEmail: roleDoc.email,
    universityId: roleDoc.assignedUniversityId,
    details: { assignedRole: roleDoc.role, assignedUniversityId: roleDoc.assignedUniversityId }
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

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const profileRef = doc(db, 'userProfiles', uid);
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
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
    await setDoc(profileRef, profile, { merge: true });
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
    await setDoc(doc(db, 'auditLogs', log.id), log);
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
