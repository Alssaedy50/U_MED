/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Authentication & Authorization Context
 * Manages Firebase User session, Strict Role-Based Access Control, and Firestore Connectivity
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { 
  auth, 
  INITIAL_OWNER_EMAIL,
  isInitialOwnerEmail,
  signInWithGoogle, 
  signInWithEmail, 
  signUpWithEmail, 
  logOut, 
  fetchUserRole, 
  fetchUserProfile,
  saveUserProfile,
  requestPlatformOwnerBootstrap,
  testFirestoreConnection
} from '../lib/firebase.ts';
import { UserRole, UserRoleDoc, UserProfile } from '../types/umed.ts';

interface AuthContextType {
  user: User | null;
  roleDoc: UserRoleDoc | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isOnline: boolean;
  firestoreConnected: boolean;
  firestoreLatency: number | null;
  firestoreError: string | null;
  loginGoogle: () => Promise<void>;
  loginEmail: (email: string, pass: string) => Promise<void>;
  registerEmail: (email: string, pass: string, nameArabic: string) => Promise<void>;
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
    // 1. Check Firestore & Owner Email match first
    const fsRole = await fetchUserRole(currentUser.uid, currentUser.email);
    if (fsRole) {
      setRoleDoc(fsRole);
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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          // Pre-flight check: verify token service is enabled on Google Cloud
          await currentUser.getIdToken();
          setUser(currentUser);
          try {
            await loadRoleForUser(currentUser);
            const profile = await fetchUserProfile(currentUser.uid);
            setUserProfile(profile);
          } catch (err) {
            console.warn('Could not load user data from remote Firestore:', err);
          }
        } catch (err: any) {
          console.warn('Token service error or disabled in Google Cloud:', err);
          if (
            err?.message?.includes('token-service-api') ||
            err?.message?.includes('securetoken.googleapis.com')
          ) {
            setFirestoreError('خدمة Token Service API غير مفعلة في مشروع Google Cloud (1072983768253). يرجى الضغط هنا لتفعيلها.');
            try {
              await logOut();
            } catch (e) {}
            setUser(null);
          } else {
            setUser(currentUser);
          }
        }
      } else {
        setUser(null);
        setRoleDoc(null);
        setUserProfile(null);
        setActiveRoleOverride(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginGoogle = async () => {
    setLoading(true);
    try {
      const u = await signInWithGoogle();
      const existing = await fetchUserProfile(u.uid);
      if (!existing) {
        const newProf: UserProfile = {
          uid: u.uid,
          email: u.email || '',
          displayNameArabic: u.displayName || 'طالب طب بشري',
          avatarUrl: u.photoURL || undefined,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
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

  const registerEmail = async (email: string, pass: string, nameArabic: string) => {
    setLoading(true);
    try {
      const u = await signUpWithEmail(email, pass);
      const newProf: UserProfile = {
        uid: u.uid,
        email: u.email || email,
        displayNameArabic: nameArabic.trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await saveUserProfile(newProf);
      setUserProfile(newProf);
      await loadRoleForUser(u);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await logOut();
    setRoleDoc(null);
    setUserProfile(null);
    setActiveRoleOverride(null);
  };

  const bootstrapInitialOwner = async () => {
    if (!user) throw new Error('يجب تسجيل الدخول أولاً');
    const token = await user.getIdToken();
    const result = await requestPlatformOwnerBootstrap(token, user.uid, user.email || '');
    if (result.roleDoc) {
      setRoleDoc(result.roleDoc);
    }
    return result;
  };

  // True administrative privilege check (never granted to regular students)
  const isAuthorizedAdmin = Boolean(
    user &&
      (roleDoc?.role === 'platform_owner' ||
        roleDoc?.role === 'university_admin' ||
        isInitialOwnerEmail(user.email))
  );

  const realRole: UserRole =
    isInitialOwnerEmail(user?.email)
      ? 'platform_owner'
      : roleDoc?.role || 'student';

  // Only allow role preview switching if the user is an authorized admin
  const effectiveRole: UserRole = isAuthorizedAdmin
    ? activeRoleOverride || realRole
    : 'student';

  const handleSetActiveRole = (r: UserRole) => {
    if (!isAuthorizedAdmin) return;
    setActiveRoleOverride(r);
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
        loading,
        isOnline,
        firestoreConnected,
        firestoreLatency,
        firestoreError,
        loginGoogle,
        loginEmail,
        registerEmail,
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
