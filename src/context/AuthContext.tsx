/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Authentication & Authorization Context
 * Manages Firebase User session, Strict Role-Based Access Control, and Firestore Connectivity
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, deleteUser } from 'firebase/auth';
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
  signUpWithUsername,
  signInWithIdentifier,
  claimOrUpdateUniqueUsername,
  updateStudentFullProfileInCloud,
  ensureUserHasUniqueCloudUsername,
  normalizeUsername,
  validateUsernameFormat,
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
  testFirestoreConnection,
  isAccountDeletedInCloud,
  deleteUserAccountCompletelyFromCloud,
  syncAndDeduplicatePrimaryOwnerIdentity
} from '../lib/firebase.ts';
import { UserRole, UserRoleDoc, UserProfile, VerificationChallenge, StudentEnrollment } from '../types/umed.ts';

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
  loginWithIdentifier: (identifier: string, pass?: string) => Promise<void>;
  registerWithUsername: (
    username: string,
    pass?: string,
    nameArabic?: string,
    extraProfile?: {
      avatarUrl?: string;
      universityId?: string;
      universityNameArabic?: string;
      specialtyArabic?: string;
      studyLevelId?: string;
    }
  ) => Promise<UserProfile>;
  updateUniqueUsername: (
    newUsername: string,
    displayNameArabic?: string
  ) => Promise<{ username: string; profile: UserProfile; message: string }>;
  updateFullProfile: (params: {
    newUsername?: string;
    displayNameArabic?: string;
    avatarUrl?: string | null;
    universityId?: string;
    universityNameArabic?: string;
    specialtyArabic?: string;
    studyLevelId?: string;
  }) => Promise<{ username: string; profile: UserProfile; enrollment: StudentEnrollment; message: string }>;
  loginEmail: (email: string, pass: string) => Promise<void>;
  registerEmail: (
    email: string,
    pass: string,
    nameArabic?: string,
    academicStudentNumber?: string,
    customUsername?: string
  ) => Promise<void>;
  loginPhone: (phone: string, pass: string) => Promise<void>;
  registerPhone: (
    phone: string,
    pass: string,
    nameArabic?: string,
    academicStudentNumber?: string,
    customUsername?: string
  ) => Promise<void>;
  verifyCurrentAccount: (params: {
    phoneCodeInput?: string;
    emailCodeInput?: string;
    checkFirebaseEmailLink?: boolean;
  }) => Promise<{ verified: boolean; message: string }>;
  resendVerification: () => Promise<VerificationChallenge | null>;
  startAccountVerification: () => Promise<VerificationChallenge | null>;
  deleteOwnAccount: () => Promise<void>;
  logout: () => Promise<void>;
  bootstrapInitialOwner: () => Promise<{ success: boolean; message: string }>;
  checkConnectivity: () => Promise<void>;
  activeRole: UserRole;
  realRole: UserRole;
  setActiveRole: (role: UserRole) => void;
  isAuthorizedAdmin: boolean;
  isAccountArchived: boolean;
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
    setFirestoreError(null);
  };

  const loadRoleForUser = async (currentUser: User) => {
    try {
      const cachedRole = localStorage.getItem(`umed_cached_role_${currentUser.uid}`);
      if (cachedRole) {
        setRoleDoc(JSON.parse(cachedRole));
      } else if (isInitialOwnerEmail(currentUser.email)) {
        setRoleDoc({
          uid: currentUser.uid,
          email: currentUser.email || '',
          role: 'platform_owner',
          assignedBy: 'SYSTEM_BOOTSTRAP',
          assignedAt: new Date().toISOString()
        });
      }
    } catch (e) {}

    const fsRole = await fetchUserRole(currentUser.uid, currentUser.email);
    if (fsRole) {
      setRoleDoc(fsRole);
      try {
        localStorage.setItem(`umed_cached_role_${currentUser.uid}`, JSON.stringify(fsRole));
      } catch (e) {}
      if (isInitialOwnerEmail(currentUser.email)) {
        try {
          await syncAndDeduplicatePrimaryOwnerIdentity({ ownerUid: currentUser.uid });
          const token = await currentUser.getIdToken();
          await requestPlatformOwnerBootstrap(token, currentUser.uid, currentUser.email || '');
        } catch (e) {}
      }
      return;
    }

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

    if (!isInitialOwnerEmail(currentUser.email)) {
      setRoleDoc(null);
    }
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
        setPendingVerification(null);

        // Immediately hydrate cached role and profile so UI renders without waiting on slow mobile networks
        try {
          const cachedRole = localStorage.getItem(`umed_cached_role_${currentUser.uid}`);
          if (cachedRole) {
            setRoleDoc(JSON.parse(cachedRole));
          } else if (isInitialOwnerEmail(currentUser.email)) {
            setRoleDoc({
              uid: currentUser.uid,
              email: currentUser.email || '',
              role: 'platform_owner',
              assignedBy: 'SYSTEM_BOOTSTRAP',
              assignedAt: new Date().toISOString()
            });
          }
        } catch (e) {}

        try {
          const cachedProf = localStorage.getItem(`umed_cached_profile_${currentUser.uid}`);
          if (cachedProf) {
            setUserProfile(JSON.parse(cachedProf));
          }
        } catch (e) {}

        // Release initial loading screen immediately
        setLoading(false);

        // Background cloud synchronization & unique username guarantee
        (async () => {
          if (!isInitialOwnerEmail(currentUser.email)) {
            const wasDeleted = await isAccountDeletedInCloud(currentUser.uid);
            if (wasDeleted) {
              try {
                await deleteUser(currentUser);
              } catch (e) {}
              try {
                await logOut();
              } catch (e) {}
              setUser(null);
              setRoleDoc(null);
              setUserProfile(null);
              setPendingVerification(null);
              return;
            }
          }

          try {
            await currentUser.getIdToken();
          } catch (err: any) {
            console.warn('Using active session without token refresh:', err?.message || err);
          }

          try {
            await loadRoleForUser(currentUser);
            const existingProfile = await fetchUserProfile(currentUser.uid);
            const ensuredProfile = await ensureUserHasUniqueCloudUsername(currentUser, existingProfile);
            setUserProfile(ensuredProfile);
            setPendingVerification(null);
            try {
              localStorage.setItem(`umed_cached_profile_${currentUser.uid}`, JSON.stringify(ensuredProfile));
            } catch (e) {}
          } catch (err) {
            console.warn('Could not load user data from remote Firestore:', err);
          }
        })();

        // Real-time listeners for userRole & userProfile changes (including cloud deletion or archiving!)
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

          unsubProfile = onSnapshot(doc(db, 'userProfiles', currentUser.uid), async (snap) => {
            if (snap.exists()) {
              const p = snap.data() as UserProfile;
              setUserProfile(p);
              setPendingVerification(null);
              try {
                localStorage.setItem(`umed_cached_profile_${currentUser.uid}`, JSON.stringify(p));
              } catch (e) {}
            } else if (!isInitialOwnerEmail(currentUser.email)) {
              // Check if deleted in cloud while session was open
              const deletedNow = await isAccountDeletedInCloud(currentUser.uid);
              if (deletedNow) {
                try {
                  await deleteUser(currentUser);
                } catch {}
                try {
                  await logOut();
                } catch {}
              }
            }
          }, () => {});
        } catch (e) {}
      } else {
        setUser(null);
        setRoleDoc(null);
        setUserProfile(null);
        setPendingVerification(null);
        setActiveRoleOverride(null);
        setLoading(false);
      }
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
      const isOwner = isInitialOwnerEmail(u.email);
      if (isOwner) {
        await syncAndDeduplicatePrimaryOwnerIdentity({
          ownerUid: u.uid,
          displayNameArabic: u.displayName || undefined
        });
      }
      const existing = await fetchUserProfile(u.uid);
      const ensured = await ensureUserHasUniqueCloudUsername(u, existing);
      setUserProfile(ensured);
      setPendingVerification(null);
      await loadRoleForUser(u);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Mandatory First-Time Student Account Creation with Unique Username (4+ English letters, case-insensitive),
   * Device Verification Guard, Profile Picture, University, Specialty, and Study Level
   */
  const registerWithUsername = async (
    username: string,
    pass?: string,
    nameArabic?: string,
    extraProfile?: {
      avatarUrl?: string;
      universityId?: string;
      universityNameArabic?: string;
      specialtyArabic?: string;
      studyLevelId?: string;
    }
  ): Promise<UserProfile> => {
    setLoading(true);
    try {
      const { user: u, profile } = await signUpWithUsername(username, pass, nameArabic, extraProfile);
      setUserProfile(profile);
      setPendingVerification(null);
      try {
        localStorage.setItem(`umed_cached_profile_${u.uid}`, JSON.stringify(profile));
      } catch (e) {}
      await loadRoleForUser(u);
      return profile;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Unified Sign-In: Accepts Unique Username (@username), Email, or Yemen Phone Number
   */
  const loginWithIdentifier = async (identifier: string, pass?: string) => {
    setLoading(true);
    try {
      const u = await signInWithIdentifier(identifier, pass);
      if (isInitialOwnerEmail(u.email)) {
        await syncAndDeduplicatePrimaryOwnerIdentity({ ownerUid: u.uid });
      }
      const existing = await fetchUserProfile(u.uid);
      const ensured = await ensureUserHasUniqueCloudUsername(u, existing);
      setUserProfile(ensured);
      setPendingVerification(null);
      await loadRoleForUser(u);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Updates the current user's unique username in Cloud Firestore, immediately deleting the old username reservation.
   */
  const updateUniqueUsername = async (
    newUsername: string,
    displayNameArabic?: string
  ): Promise<{ username: string; profile: UserProfile; message: string }> => {
    if (!user) throw new Error('يجب تسجيل الدخول أولاً لتعديل اسم المستخدم الفريد.');
    const updated = await claimOrUpdateUniqueUsername({
      uid: user.uid,
      newUsername,
      displayNameArabic
    });
    setUserProfile(updated.profile);
    try {
      localStorage.setItem(`umed_cached_profile_${user.uid}`, JSON.stringify(updated.profile));
    } catch (e) {}
    return {
      username: updated.username,
      profile: updated.profile,
      message: `تم حفظ وتحديث اسم المستخدم الفريد (@${updated.username}) في السحابة بنجاح ✓`
    };
  };

  /**
   * Updates the student's full profile (username, displayNameArabic, avatarUrl, university, specialty, studyLevel)
   * in Cloud Firestore and syncs local state immediately.
   */
  const updateFullProfile = async (params: {
    newUsername?: string;
    displayNameArabic?: string;
    avatarUrl?: string | null;
    universityId?: string;
    universityNameArabic?: string;
    specialtyArabic?: string;
    studyLevelId?: string;
  }) => {
    if (!user) throw new Error('يجب تسجيل الدخول أولاً لتحديث بيانات ملفك الشخصي.');
    const res = await updateStudentFullProfileInCloud({
      uid: user.uid,
      ...params
    });
    setUserProfile(res.profile);
    try {
      localStorage.setItem(`umed_cached_profile_${user.uid}`, JSON.stringify(res.profile));
    } catch (e) {}
    return {
      ...res,
      message: `تم حفظ ومزامنة الملف الشخصي (@${res.username}) والبيانات الأكاديمية في السحابة بنجاح ✓`
    };
  };

  const loginEmail = async (email: string, pass: string) => {
    return loginWithIdentifier(email, pass);
  };

  /**
   * Optional Email Registration (no mandatory verification or academic ID required)
   */
  const registerEmail = async (
    email: string,
    pass: string,
    nameArabic?: string,
    academicStudentNumber?: string,
    customUsername?: string
  ) => {
    setLoading(true);
    try {
      const normEmail = normalizeEmail(email);
      const isOwner = isInitialOwnerEmail(normEmail);
      const normAcad = academicStudentNumber && academicStudentNumber.trim()
        ? normalizeAcademicId(academicStudentNumber)
        : undefined;
      const normUser = customUsername && customUsername.trim()
        ? normalizeUsername(customUsername)
        : undefined;

      const uniqueness = await checkIdentifierUniqueness({
        username: normUser,
        email: normEmail,
        academicStudentNumber: normAcad,
        allowOwnerSelfRegister: isOwner
      });
      if (!uniqueness.isUnique) {
        throw new Error(uniqueness.message || 'البيانات المدخلة مسجلة مسبقاً لحساب آخر في المنصة.');
      }

      const u = await signUpWithEmail(normEmail, pass);
      const nowIso = new Date().toISOString();

      if (isOwner) {
        await syncAndDeduplicatePrimaryOwnerIdentity({
          ownerUid: u.uid,
          displayNameArabic: nameArabic?.trim() || undefined,
          academicStudentNumber: normAcad
        });
        setPendingVerification(null);
        await loadRoleForUser(u);
        return;
      }

      const baseProf: UserProfile = {
        uid: u.uid,
        ...(normUser ? { username: normUser } : {}),
        email: normEmail,
        displayNameArabic: (nameArabic && nameArabic.trim()) || normUser || normEmail.split('@')[0],
        ...(normAcad ? { academicStudentNumber: normAcad } : {}),
        registrationMethod: 'email',
        isActive: true,
        isArchived: false,
        emailVerified: true,
        phoneVerified: true,
        isVerified: true,
        verifiedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const ensuredProf = await ensureUserHasUniqueCloudUsername(u, baseProf);
      await reserveUniqueIdentifiers({
        uid: u.uid,
        username: ensuredProf.username,
        email: normEmail,
        academicStudentNumber: normAcad
      });

      setPendingVerification(null);
      setUserProfile(ensuredProf);
      try {
        localStorage.setItem(`umed_cached_profile_${u.uid}`, JSON.stringify(ensuredProf));
      } catch (e) {}
      await loadRoleForUser(u);
    } finally {
      setLoading(false);
    }
  };

  const loginPhone = async (phone: string, pass: string) => {
    return loginWithIdentifier(phone, pass);
  };

  /**
   * Optional Phone Registration (no mandatory verification or academic ID required)
   */
  const registerPhone = async (
    phone: string,
    pass: string,
    nameArabic?: string,
    academicStudentNumber?: string,
    customUsername?: string
  ) => {
    setLoading(true);
    try {
      const normPhone = normalizeYemenPhone(phone);
      if (!normPhone) {
        throw new Error('INVALID_PHONE_NUMBER');
      }
      const normAcad = academicStudentNumber && academicStudentNumber.trim()
        ? normalizeAcademicId(academicStudentNumber)
        : undefined;
      const normUser = customUsername && customUsername.trim()
        ? normalizeUsername(customUsername)
        : undefined;

      const uniqueness = await checkIdentifierUniqueness({
        username: normUser,
        phone: normPhone,
        academicStudentNumber: normAcad
      });
      if (!uniqueness.isUnique) {
        throw new Error(uniqueness.message || 'البيانات المدخلة مسجلة مسبقاً لحساب آخر في المنصة.');
      }

      const { user: u, normalizedPhone } = await signUpWithPhone(normPhone, pass);
      const nowIso = new Date().toISOString();

      const baseProf: UserProfile = {
        uid: u.uid,
        ...(normUser ? { username: normUser } : {}),
        email: '',
        phone: normalizedPhone,
        ...(normAcad ? { academicStudentNumber: normAcad } : {}),
        displayNameArabic: (nameArabic && nameArabic.trim()) || normUser || `user_${normalizedPhone.slice(-4)}`,
        registrationMethod: 'phone',
        isActive: true,
        isArchived: false,
        emailVerified: true,
        phoneVerified: true,
        isVerified: true,
        verifiedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const ensuredProf = await ensureUserHasUniqueCloudUsername(u, baseProf);
      await reserveUniqueIdentifiers({
        uid: u.uid,
        username: ensuredProf.username,
        phone: normalizedPhone,
        academicStudentNumber: normAcad
      });

      setPendingVerification(null);
      setUserProfile(ensuredProf);
      try {
        localStorage.setItem(`umed_cached_profile_${u.uid}`, JSON.stringify(ensuredProf));
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

    const nowIso = new Date().toISOString();
    const baseProf: UserProfile = userProfile || {
      uid: user.uid,
      email: user.email && !user.email.startsWith('phone_') ? user.email : '',
      displayNameArabic: user.displayName || 'طالب طب بشري',
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const updatedProf: UserProfile = {
      ...baseProf,
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
    const method: 'email' | 'phone' | 'both' =
      pendingVerification?.verificationMethod ||
      (userProfile?.registrationMethod === 'phone'
        ? 'phone'
        : userProfile?.registrationMethod === 'email'
        ? 'email'
        : userProfile?.phone && !realEmail
        ? 'phone'
        : 'email');

    const ch = await issueVerificationChallenge(user, {
      email: method === 'email' || method === 'both' ? realEmail : undefined,
      phone: method === 'phone' || method === 'both' ? userProfile?.phone : undefined,
      method
    });
    setPendingVerification(ch);
    return ch;
  };

  const startAccountVerification = async (): Promise<VerificationChallenge | null> => {
    return resendVerification();
  };

  const deleteOwnAccount = async (): Promise<void> => {
    if (!user) throw new Error('لا يوجد حساب مسجل حالياً');
    if (isInitialOwnerEmail(user.email)) {
      throw new Error('لا يمكن حذف الحساب الأساسي لمالك المنصة (Primary Platform Owner).');
    }
    setLoading(true);
    try {
      await deleteUserAccountCompletelyFromCloud({
        targetUid: user.uid,
        performedBy: user.email || userProfile?.phone || user.uid,
        isSelfDelete: true
      });
      setUser(null);
      setRoleDoc(null);
      setUserProfile(null);
      setPendingVerification(null);
      setActiveRoleOverride(null);
    } finally {
      setLoading(false);
    }
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

  const effectiveRole: UserRole = isAuthorizedAdmin
    ? activeRoleOverride || realRole
    : 'student';

  const isAccountArchived = Boolean(
    user &&
      !isInitialOwnerEmail(user.email) &&
      realRole !== 'platform_owner' &&
      (userProfile?.isArchived === true || userProfile?.isActive === false)
  );

  const handleSetActiveRole = (r: UserRole) => {
    if (!isAuthorizedAdmin) return;
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
        loginWithIdentifier,
        registerWithUsername,
        updateUniqueUsername,
        updateFullProfile,
        loginEmail,
        registerEmail,
        loginPhone,
        registerPhone,
        verifyCurrentAccount,
        resendVerification,
        startAccountVerification,
        deleteOwnAccount,
        logout,
        bootstrapInitialOwner,
        checkConnectivity,
        activeRole: effectiveRole,
        realRole,
        setActiveRole: handleSetActiveRole,
        isAuthorizedAdmin,
        isAccountArchived,
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
