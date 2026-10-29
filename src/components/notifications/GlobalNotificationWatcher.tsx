/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Global Real-Time Notification Watcher & Live Toast Banner
 * Ensures 100% notification delivery for every user (Normal Student, Batch Rep, Dept Head, Admin, Owner) across:
 * 1. Batch Announcements (منشورات الدفعة)
 * 2. Educational Resources & Clinical Data (داتا ومحاضرات)
 * 3. Exams & Clinical Competitions (اختبارات ومسابقات)
 * 4. Enrollment Approvals & Role Promotions (تحديثات القيد والترقيات)
 * 
 * Uses persistent per-user seen-event tracking (`umed_seen_notif_events_v2_${uid}`) so:
 * - A user logging in AFTER an exam/post/resource was launched still receives the notification immediately.
 * - Reloading the page never duplicates or re-chimes already-received notifications.
 * - Switching accounts on the same device isolates each user's notifications and unread counters.
 */

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, query, where } from 'firebase/firestore';
import { Bell, FileText, Trophy, BookOpen, CheckCircle2, X, ExternalLink } from 'lucide-react';
import { db } from '../../lib/firebase.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  AppNotification,
  setActiveNotificationUser,
  subscribeToLiveNotificationToast,
  markNotificationAsRead,
  syncNotificationsForAssessments,
  syncNotificationsForBatchPosts,
  syncNotificationsForResources,
  syncNotificationForEnrollment,
  syncNotificationForRoleChange
} from '../../services/notificationService.ts';
import { getAssessments } from '../../services/assessmentService.ts';
import { fetchBatchNotifications } from '../../services/batchGovernanceService.ts';
import { fetchEducationalResources } from '../../services/resourceService.ts';
import { fetchStudentEnrollment } from '../../services/enrollmentService.ts';
import { BatchNotification, EducationalResource, Assessment, StudentEnrollment } from '../../types/umed.ts';

interface GlobalNotificationWatcherProps {
  onNavigateTab?: (tab: string, payload?: Record<string, unknown>) => void;
  studentUniversityId?: string;
  studentStudyLevelId?: string;
}

export default function GlobalNotificationWatcher({
  onNavigateTab,
  studentUniversityId,
  studentStudyLevelId
}: GlobalNotificationWatcherProps) {
  const { user, userProfile, roleDoc } = useAuth();
  const [liveToast, setLiveToast] = useState<AppNotification | null>(null);

  // 0. Bind active notification inbox to the logged-in user's UID and account creation baseline
  useEffect(() => {
    setActiveNotificationUser(
      user?.uid || null,
      userProfile?.createdAt || user?.metadata?.creationTime || null
    );
  }, [user?.uid, userProfile?.createdAt, user?.metadata?.creationTime]);

  // Subscribe to live floating toast alerts
  useEffect(() => {
    const unsub = subscribeToLiveNotificationToast((notif) => {
      setLiveToast(notif);
    });
    return () => unsub();
  }, []);

  // Auto-hide live toast after 7 seconds
  useEffect(() => {
    if (!liveToast) return;
    const timer = setTimeout(() => {
      setLiveToast((current) => (current?.id === liveToast.id ? null : current));
    }, 7000);
    return () => clearTimeout(timer);
  }, [liveToast]);

  // Track role promotions for the current user
  useEffect(() => {
    if (!user?.uid || !roleDoc) return;
    syncNotificationForRoleChange(user.uid, roleDoc);
  }, [user?.uid, roleDoc?.role, roleDoc?.assignedAt]);

  const effectiveUnivId = studentUniversityId || userProfile?.universityId || 'univ-dar-al-salam';

  // 1. Real-time Firestore listener for Batch Announcements & Posts (منشورات) scoped to student university
  useEffect(() => {
    if (!db || !user?.uid) return;
    const currentUid = user.uid;

    try {
      const q = query(
        collection(db, 'batchNotifications'),
        where('universityId', '==', effectiveUnivId)
      );
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const items: BatchNotification[] = [];
          snapshot.docs.forEach((d) => {
            items.push({ ...(d.data() as BatchNotification), id: d.id });
          });
          syncNotificationsForBatchPosts(currentUid, items, effectiveUnivId, studentStudyLevelId);
        },
        () => {}
      );

      return () => unsub();
    } catch (e) {}
  }, [user?.uid, effectiveUnivId, studentStudyLevelId]);

  // 2. Real-time Firestore listener for Educational Resources & Clinical Data (داتا ومحاضرات) scoped to student university
  useEffect(() => {
    if (!db || !user?.uid) return;
    const currentUid = user.uid;

    try {
      const q = query(
        collection(db, 'educationalResources'),
        where('universityId', '==', effectiveUnivId),
        where('status', '==', 'published')
      );

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const items: EducationalResource[] = [];
          snapshot.docs.forEach((d) => {
            items.push({ ...(d.data() as EducationalResource), id: d.id });
          });
          syncNotificationsForResources(currentUid, items, effectiveUnivId, studentStudyLevelId);
        },
        () => {}
      );

      return () => unsub();
    } catch (e) {}
  }, [user?.uid, effectiveUnivId, studentStudyLevelId]);

  // 3. Real-time Firestore listener for Exams & Competitions (اختبارات ومسابقات) scoped to student university
  useEffect(() => {
    if (!db || !user?.uid) return;
    const currentUid = user.uid;

    try {
      const q = query(
        collection(db, 'assessments'),
        where('universityId', '==', effectiveUnivId),
        where('status', '==', 'published')
      );

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const items: Assessment[] = [];
          snapshot.docs.forEach((d) => {
            items.push({ ...(d.data() as Assessment), id: d.id });
          });
          syncNotificationsForAssessments(currentUid, items, effectiveUnivId, studentStudyLevelId);
        },
        () => {}
      );

      return () => unsub();
    } catch (e) {}
  }, [user?.uid, effectiveUnivId, studentStudyLevelId]);

  // 4. Real-time Firestore listener for Student Enrollment status updates (تحديثات القيد والاعتماد)
  useEffect(() => {
    if (!db || !user?.uid) return;
    const currentUid = user.uid;

    try {
      const docRef = doc(db, 'studentEnrollments', `enr-${currentUid}`);
      const unsub = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) return;
          const data = { ...(snap.data() as StudentEnrollment), id: snap.id };
          syncNotificationForEnrollment(currentUid, data);
        },
        () => {}
      );

      return () => unsub();
    } catch (e) {}
  }, [user?.uid]);

  // 5. One-time initial sync pass on mount/change (no recurring setInterval polling)
  useEffect(() => {
    if (!user?.uid) return;
    const currentUid = user.uid;

    const runSyncPass = async () => {
      try {
        const [publishedAssessments, batchPosts, publishedResources, enrollment] = await Promise.all([
          getAssessments(effectiveUnivId, undefined, 'published').catch(() => []),
          fetchBatchNotifications({ universityId: effectiveUnivId, studyLevelId: studentStudyLevelId }).catch(() => []),
          fetchEducationalResources({ universityId: effectiveUnivId, studyLevelId: studentStudyLevelId, status: 'published' }).catch(() => []),
          fetchStudentEnrollment(currentUid).catch(() => null)
        ]);

        if (publishedAssessments.length > 0) {
          syncNotificationsForAssessments(currentUid, publishedAssessments, effectiveUnivId, studentStudyLevelId);
        }
        if (batchPosts.length > 0) {
          syncNotificationsForBatchPosts(currentUid, batchPosts, effectiveUnivId, studentStudyLevelId);
        }
        if (publishedResources.length > 0) {
          syncNotificationsForResources(currentUid, publishedResources, effectiveUnivId, studentStudyLevelId);
        }
        if (enrollment) {
          syncNotificationForEnrollment(currentUid, enrollment);
        }
      } catch (e) {}
    };

    runSyncPass();
  }, [user?.uid, effectiveUnivId, studentStudyLevelId]);

  if (!liveToast || !user) return null;

  const handleToastClick = () => {
    markNotificationAsRead(liveToast.id);
    const targetTab =
      liveToast.actionTab ||
      (liveToast.category === 'exam' || liveToast.category === 'competition'
        ? 'student_assessments'
        : liveToast.category === 'data'
        ? 'student_library'
        : 'student_dashboard');

    const enrichedPayload: Record<string, unknown> = {
      ...(liveToast.actionPayload || {}),
      category: liveToast.category,
      assessmentType:
        (liveToast.actionPayload?.assessmentType as string) ||
        (liveToast.category === 'competition'
          ? 'competition'
          : liveToast.category === 'exam'
          ? 'exam'
          : undefined)
    };

    setLiveToast(null);
    if (onNavigateTab) {
      onNavigateTab(targetTab, enrichedPayload);
    }
  };

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[120] w-[94vw] max-w-md pointer-events-auto"
      dir="rtl"
    >
      <div className="bg-slate-900/95 backdrop-blur-md border-2 border-teal-500/70 rounded-2xl p-3.5 shadow-2xl shadow-black/70 flex items-start gap-3 animate-fade-in">
        <div
          className={`p-2.5 rounded-xl shrink-0 text-white shadow-md ${
            liveToast.category === 'competition'
              ? 'bg-amber-600'
              : liveToast.category === 'exam'
              ? 'bg-teal-600'
              : liveToast.category === 'data'
              ? 'bg-emerald-600'
              : liveToast.category === 'update'
              ? 'bg-indigo-600'
              : 'bg-sky-600'
          }`}
        >
          {liveToast.category === 'competition' ? (
            <Trophy className="w-5 h-5" />
          ) : liveToast.category === 'exam' ? (
            <FileText className="w-5 h-5" />
          ) : liveToast.category === 'data' ? (
            <BookOpen className="w-5 h-5" />
          ) : liveToast.category === 'update' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Bell className="w-5 h-5" />
          )}
        </div>

        <div
          onClick={handleToastClick}
          className="flex-1 min-w-0 cursor-pointer"
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/40 text-[10px] font-bold">
              إشعار جديد الآن
            </span>
            <span className="text-[10px] text-slate-400 truncate">
              {liveToast.authorName || 'منصة UMED'}
            </span>
          </div>
          <h4 className="text-xs sm:text-sm font-bold text-white truncate">
            {liveToast.title}
          </h4>
          <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5 leading-relaxed">
            {liveToast.body}
          </p>
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-teal-400 hover:text-teal-300">
            <span>اضغط للفتح والانتقال فوراً</span>
            <ExternalLink className="w-3 h-3" />
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLiveToast(null);
          }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          title="إغلاق التنبيه"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
