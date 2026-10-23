/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Authentication & Authorization Context
 * Manages Firebase User session, Strict Role-Based Access Control, and Firestore Connectivity
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { 
  auth, 
  db,
  INITIAL_OWNER_EMAIL,
  isInitialOwnerEmail,
  signInWithGoogle, 
  signInWithEmail, 
  signUpWithEmail, 
  signInWithPhone,
  signUpWithPhone,
  normalizeYemenPhone,
  normalizeEmail,
  normalizeAcademicId,
  checkIdentifierUniqueness,
  reserveUniqueIdentifiers,
  issueVerificationChallenge,
  getVerificationChallenge,
  verifyAccountChallenge,
  logOut, 
  fetchUserRole, 
  fetchUserProfile,
  saveUserProfile,
  requestPlatformOwnerBootstrap,
  testFirestoreConnection
} from '../lib/firebase.ts';
import { UserRole, UserRoleDoc, UserProfile, VerificationChallenge } from '../types/umed.ts';

interface AuthContextType {
  user: User | null;
  roleDoc: UserRoleDoc | null;
  userProfile: UserProfile | null;
  pendingVerification: VerificationChallenge | null;
  loading: boolean;
  isOnline: boolean;
  firestoreConnected: boolean;
  firestoreLatency: number | null;
  firestoreError: string | null;
  loginGoogle: () => Promise<void>;
  loginEmail: (email: string, pass: string) => Promise<void>;
  registerEmail: (
    email: string,
    pass: string,
    nameArabic: string,
    phoneRequired?: string,
    academicStudentNumber?: string
  ) => Promise<void>;
  loginPhone: (phone: string, pass: string) => Promise<void>;
  registerPhone: (
    phone: string,
    pass: string,
    nameArabic: string,
    emailOptional?: string,
    academicStudentNumber?: string
  ) => Promise<void>;
  verifyCurrentAccount: (params: {
    phoneCodeInput?: string;
    emailCodeInput?: string;
    checkFirebaseEmailLink?: boolean;
  }) => Promise<{ verified: boolean; message: string }>;
  resendVerification: () => Promise<VerificationChallenge | null>;
  startAccountVerification: () => Promise<VerificationChallenge | null>;
  logout: () => Promise<void>;
  bootstrapInitialOwner: () => Promise<{ success: boolean; message: string }>;
  checkConnectivity: () => Promise<void>;
  activeRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  isAuthorizedAdmin: boolean;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [roleDoc, setRoleDoc] = useState<UserRoleDoc | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [pendingVerification, setPendingVerification] = useState<VerificationChallenge | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);
  const [firestoreLatency, setFirestoreLatency] = useState<number | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [activeRoleOverride, setActiveRoleOverride] = useState<UserRole | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkConnectivity = async () => {
    const probe = await testFirestoreConnection();
    setFirestoreConnected(probe.connected);
    setFirestoreLatency(probe.latencyMs);
    setFirestoreError(probe.error || null);
  };

  useEffect(() => {
    checkConnectivity();
    const interval = setInterval(checkConnectivity, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadRoleForUser = async (currentUser: User) => {
    // Instant local cache hydration first
    try {
      const cachedRole = localStorage.getItem(`umed_cached_role_${currentUser.uid}`);
      if (cachedRole) {
        setRoleDoc(JSON.parse(cachedRole));
      }
    } catch (e) {}

    // 1. Check Firestore & Owner Email match first
    const fsRole = await fetchUserRole(currentUser.uid, currentUser.email);
    if (fsRole) {
      setRoleDoc(fsRole);
      try {
        localStorage.setItem(`umed_cached_role_${currentUser.uid}`, JSON.stringify(fsRole));
      } catch (e) {}
      // If owner email, also sync with server silently
      if (isInitialOwnerEmail(currentUser.email)) {
        try {
          const token = await currentUser.getIdToken();
          await requestPlatformOwnerBootstrap(token, currentUser.uid, currentUser.email || '');
        } catch (e) {}
      }
      return;
    }

    // 2. Fallback check against API
    try {
      const res = await fetch(`/api/admin/user-role/${currentUser.uid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.role) {
          setRoleDoc(data.role);
          try {
            localStorage.setItem(`umed_cached_role_${currentUser.uid}`, JSON.stringify(data.role));
          } catch (e) {}
          return;
        }
      }
    } catch (e) {}

    setRoleDoc(null);
  };

  const refreshRole = async () => {
    if (user) {
      await loadRoleForUser(user);
    }
  };

  useEffect(() => {
    let unsubRole: (() => void) | null = null;
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubRole) { unsubRole(); unsubRole = null; }
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }

      if (currentUser) {
        setUser(currentUser);
        // Hydrate cached profile immediately
        try {
          const cachedProf = localStorage.getItem(`umed_cached_profile_${currentUser.uid}`);
          if (cachedProf) {
            setUserProfile(JSON.parse(cachedProf));
          }
        } catch (e) {}

        // Hydrate active verification challenge if account is newly created and unverified
        if (!isInitialOwnerEmail(currentUser.email)) {
          getVerificationChallenge(currentUser.uid).then((ch) => {
            if (ch && (!ch.emailVerified || !ch.phoneVerified)) {
              setPendingVerification(ch);
            } else {
              setPendingVerification(null);
            }
          }).catch(() => {});
        } else {
          setPendingVerification(null);
        }

        try {
          await currentUser.getIdToken();
        } catch (err: any) {
          console.warn('Using active session without token refresh:', err?.message || err);
        }
        try {
          await loadRoleForUser(currentUser);
          const profile = await fetchUserProfile(currentUser.uid);
          if (profile) {
            setUserProfile(profile);
            try {
              localStorage.setItem(`umed_cached_profile_${currentUser.uid}`, JSON.stringify(profile));
            } catch (e) {}
          }
        } catch (err) {
          console.warn('Could not load user data from remote Firestore:', err);
        }

        // Real-time listeners for userRole & userProfile changes
        try {
          unsubRole = onSnapshot(doc(db, 'userRoles', currentUser.uid), (snap) => {
            if (snap.exists()) {
              const r = snap.data() as UserRoleDoc;
              setRoleDoc(r);
              try {
                localStorage.setItem(`umed_cached_role_${currentUser.uid}`, JSON.stringify(r));
              } catch (e) {}
            }
          }, () => {});

          unsubProfile = onSnapshot(doc(db, 'userProfiles', currentUser.uid), (snap) => {
            if (snap.exists()) {
              const p = snap.data() as UserProfile;
              setUserProfile(p);
              try {
                localStorage.setItem(`umed_cached_profile_${currentUser.uid}`, JSON.stringify(p));
              } catch (e) {}
            }
          }, () => {});
        } catch (e) {}
      } else {
        setUser(null);
        setRoleDoc(null);
        setUserProfile(null);
        setPendingVerification(null);
        setActiveRoleOverride(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubRole) unsubRole();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const loginGoogle = async () => {
    setLoading(true);
    try {
      const u = await signInWithGoogle();
      const existing = await fetchUserProfile(u.uid);
      if (!existing) {
        // Verify Google email isn't conflicting with another UID
        const uniqueCheck = await checkIdentifierUniqueness({
          email: u.email || undefined,
          excludeUid: u.uid
        });
        if (!uniqueCheck.isUnique) {
          await logOut();
          throw new Error(uniqueCheck.message || 'هذا البريد مسجل مسبقاً لحساب آخر');
        }
        const nowIso = new Date().toISOString();
        const newProf: UserProfile = {
          uid: u.uid,
          email: u.email ? normalizeEmail(u.email) : '',
          displayNameArabic: u.displayName || 'طالب طب بشري',
          avatarUrl: u.photoURL || undefined,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          isVerified: true,
          verifiedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        await saveUserProfile(newProf);
        setUserProfile(newProf);
      }
      await loadRoleForUser(u);
    } finally {
      setLoading(false);
    }
  };

  const loginEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const u = await signInWithEmail(email, pass);
      await loadRoleForUser(u);
    } finally {
      setLoading(false);
    }
  };

  const registerEmail = async (
    email: string,
    pass: string,
    nameArabic: string,
    phoneRequired?: string,
    academicStudentNumber?: string
  ) => {
    setLoading(true);
    try {
      const normEmail = normalizeEmail(email);
      const normPhone = phoneRequired && phoneRequired.trim() ? normalizeYemenPhone(phoneRequired) : undefined;
      const normAcad = academicStudentNumber && academicStudentNumber.trim()
        ? normalizeAcademicId(academicStudentNumber)
        : undefined;

      // 1. Pre-Creation Uniqueness Validation (Email + Phone + Academic Student Number)
      const uniqueness = await checkIdentifierUniqueness({
        email: normEmail,
        phone: normPhone,
        academicStudentNumber: normAcad
      });
      if (!uniqueness.isUnique) {
        throw new Error(uniqueness.message || 'البيانات المدخلة مسجلة مسبقاً لحساب آخر في المنصة.');
      }

      // 2. Create Firebase Auth Account
      const u = await signUpWithEmail(normEmail, pass);
      const isOwner = isInitialOwnerEmail(normEmail);
      const nowIso = new Date().toISOString();

      // 3. Reserve Unique Identifiers in Cloud Firestore
      await reserveUniqueIdentifiers({
        uid: u.uid,
        email: normEmail,
        phone: normPhone,
        academicStudentNumber: normAcad
      });

      // 4. Issue Verification Challenge (Real Firebase Email Link + 6-Digit OTP for Email & Phone)
      let challenge: VerificationChallenge | null = null;
      if (!isOwner) {
        challenge = await issueVerificationChallenge(u, {
          email: normEmail,
          phone: normPhone
        });
        setPendingVerification(challenge);
      }

      const newProf: UserProfile = {
        uid: u.uid,
        email: normEmail,
        displayNameArabic: nameArabic.trim(),
        ...(normPhone ? { phone: normPhone } : {}),
        ...(normAcad ? { academicStudentNumber: normAcad } : {}),
        isActive: true,
        emailVerified: isOwner ? true : Boolean(challenge?.emailVerified),
        phoneVerified: isOwner ? true : Boolean(challenge?.phoneVerified),
        isVerified: isOwner ? true : Boolean(challenge?.emailVerified && challenge?.phoneVerified),
        ...(isOwner ? { verifiedAt: nowIso } : {}),
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await saveUserProfile(newProf);
      setUserProfile(newProf);
      try {
        localStorage.setItem(`umed_cached_profile_${u.uid}`, JSON.stringify(newProf));
      } catch (e) {}
      await loadRoleForUser(u);
    } finally {
      setLoading(false);
    }
  };

  const loginPhone = async (phone: string, pass: string) => {
    setLoading(true);
    try {
      const u = await signInWithPhone(phone, pass);
      await loadRoleForUser(u);
    } finally {
      setLoading(false);
    }
  };

  const registerPhone = async (
    phone: string,
    pass: string,
    nameArabic: string,
    emailOptional?: string,
    academicStudentNumber?: string
  ) => {
    setLoading(true);
    try {
      const normPhone = normalizeYemenPhone(phone);
      if (!normPhone) {
        throw new Error('INVALID_PHONE_NUMBER');
      }
      const normEmail = emailOptional && emailOptional.trim() ? normalizeEmail(emailOptional) : undefined;
      const normAcad = academicStudentNumber && academicStudentNumber.trim()
        ? normalizeAcademicId(academicStudentNumber)
        : undefined;

      // 1. Pre-Creation Uniqueness Validation (Phone + Optional Email + Academic Student Number)
      const uniqueness = await checkIdentifierUniqueness({
        phone: normPhone,
        email: normEmail,
        academicStudentNumber: normAcad
      });
      if (!uniqueness.isUnique) {
        throw new Error(uniqueness.message || 'البيانات المدخلة مسجلة مسبقاً لحساب آخر في المنصة.');
      }

      // 2. Create Firebase Auth Account for Phone
      const { user: u, normalizedPhone } = await signUpWithPhone(normPhone, pass);
      const nowIso = new Date().toISOString();

      // 3. Reserve Unique Identifiers in Cloud Firestore
      await reserveUniqueIdentifiers({
        uid: u.uid,
        phone: normalizedPhone,
        email: normEmail,
        academicStudentNumber: normAcad
      });

      // 4. Issue Verification Challenge for Phone (and Email if provided)
      const challenge = await issueVerificationChallenge(u, {
        phone: normalizedPhone,
        email: normEmail
      });
      setPendingVerification(challenge);

      const newProf: UserProfile = {
        uid: u.uid,
        email: normEmail || u.email || '',
        phone: normalizedPhone,
        ...(normAcad ? { academicStudentNumber: normAcad } : {}),
        displayNameArabic: nameArabic.trim(),
        isActive: true,
        emailVerified: Boolean(challenge.emailVerified),
        phoneVerified: Boolean(challenge.phoneVerified),
        isVerified: Boolean(challenge.emailVerified && challenge.phoneVerified),
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await saveUserProfile(newProf);
      setUserProfile(newProf);
      try {
        localStorage.setItem(`umed_cached_profile_${u.uid}`, JSON.stringify(newProf));
      } catch (e) {}
      await loadRoleForUser(u);
    } finally {
      setLoading(false);
    }
  };

  const verifyCurrentAccount = async (params: {
    phoneCodeInput?: string;
    emailCodeInput?: string;
    checkFirebaseEmailLink?: boolean;
  }): Promise<{ verified: boolean; message: string }> => {
    if (!user) throw new Error('يجب تسجيل الدخول أولاً');
    const res = await verifyAccountChallenge(user, params);
    setPendingVerification(res.challenge);

    if (userProfile) {
      const nowIso = new Date().toISOString();
      const updatedProf: UserProfile = {
        ...userProfile,
        emailVerified: res.emailVerified,
        phoneVerified: res.phoneVerified,
        isVerified: res.verified,
        ...(res.verified ? { verifiedAt: nowIso } : {}),
        updatedAt: nowIso
      };
      await saveUserProfile(updatedProf);
      setUserProfile(updatedProf);
      try {
        localStorage.setItem(`umed_cached_profile_${user.uid}`, JSON.stringify(updatedProf));
      } catch (e) {}
    }

    return { verified: res.verified, message: res.message };
  };

  const resendVerification = async (): Promise<VerificationChallenge | null> => {
    if (!user) return null;
    const realEmail =
      userProfile?.email && !userProfile.email.startsWith('phone_')
        ? userProfile.email
        : user.email && !user.email.startsWith('phone_')
        ? user.email
        : undefined;
    const ch = await issueVerificationChallenge(user, {
      email: realEmail,
      phone: userProfile?.phone
    });
    setPendingVerification(ch);
    return ch;
  };

  const startAccountVerification = async (): Promise<VerificationChallenge | null> => {
    return resendVerification();
  };

  const logout = async () => {
    await logOut();
    setRoleDoc(null);
    setUserProfile(null);
    setPendingVerification(null);
    setActiveRoleOverride(null);
  };

  const bootstrapInitialOwner = async () => {
    if (!user) throw new Error('يجب تسجيل الدخول أولاً');
    let token = '';
    try {
      token = await user.getIdToken();
    } catch (e) {}
    const result = await requestPlatformOwnerBootstrap(token, user.uid, user.email || '');
    if (result.roleDoc) {
      setRoleDoc(result.roleDoc);
    }
    return result;
  };

  // True administrative/leadership privilege check (never granted to regular unpromoted students)
  const isAuthorizedAdmin = Boolean(
    user &&
      (roleDoc?.role === 'platform_owner' ||
        roleDoc?.role === 'university_admin' ||
        roleDoc?.role === 'batch_rep' ||
        roleDoc?.role === 'department_head' ||
        isInitialOwnerEmail(user.email))
  );

  const realRole: UserRole =
    isInitialOwnerEmail(user?.email)
      ? 'platform_owner'
      : roleDoc?.role || 'student';

  // Only allow role preview switching if the user is an authorized leader/admin
  const effectiveRole: UserRole = isAuthorizedAdmin
    ? activeRoleOverride || realRole
    : 'student';

  const handleSetActiveRole = (r: UserRole) => {
    if (!isAuthorizedAdmin) return;
    // Prevent non-owners from escalating their preview mode above their realRole
    const rank: Record<UserRole, number> = {
      platform_owner: 5,
      university_admin: 4,
      batch_rep: 3,
      department_head: 2,
      student: 1
    };
    if (rank[r] <= rank[realRole]) {
      setActiveRoleOverride(r);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        roleDoc:
          roleDoc ||
          (isInitialOwnerEmail(user?.email)
            ? {
                uid: user!.uid,
                role: 'platform_owner',
                email: user!.email || INITIAL_OWNER_EMAIL,
                assignedAt: new Date().toISOString(),
                assignedBy: 'SYSTEM_BOOTSTRAP'
              }
            : null),
        userProfile,
        pendingVerification,
        loading,
        isOnline,
        firestoreConnected,
        firestoreLatency,
        firestoreError,
        loginGoogle,
        loginEmail,
        registerEmail,
        loginPhone,
        registerPhone,
        verifyCurrentAccount,
        resendVerification,
        startAccountVerification,
        logout,
        bootstrapInitialOwner,
        checkConnectivity,
        activeRole: effectiveRole,
        setActiveRole: handleSetActiveRole,
        isAuthorizedAdmin,
        refreshRole
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
