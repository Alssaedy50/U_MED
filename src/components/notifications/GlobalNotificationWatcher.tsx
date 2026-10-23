/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Global Real-Time Notification Watcher
 * Listens to Cloud Firestore real-time streams for:
 * 1. Batch Announcements (منشورات)
 * 2. Educational Resources & Data (داتا ومحاضرات)
 * 3. Exams & Clinical Competitions (اختبارات ومسابقات)
 * 4. Enrollment & Approval Status Changes (تحديثات)
 * 
 * Invariant: Prevents spam on initial mount by caching baseline snapshot IDs.
 */

import { useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  dispatchAppNotification, 
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission 
} from '../../services/notificationService.ts';
import { BatchNotification, EducationalResource, Assessment, StudentEnrollment } from '../../types/umed.ts';

export default function GlobalNotificationWatcher() {
  const { user } = useAuth();

  // Baseline tracking sets to differentiate existing records from real-time incoming events
  const knownPostIds = useRef<Set<string>>(new Set());
  const postsInitialized = useRef<boolean>(false);

  const knownResourceIds = useRef<Set<string>>(new Set());
  const resourcesInitialized = useRef<boolean>(false);

  const knownAssessmentIds = useRef<Set<string>>(new Set());
  const assessmentsInitialized = useRef<boolean>(false);

  const lastEnrollmentStatus = useRef<string | null>(null);

  // Auto-request or encourage notification permission once on user interaction
  useEffect(() => {
    const handleFirstClick = () => {
      const perm = getBrowserNotificationPermission();
      if (perm === 'default') {
        // We can prompt gently or let user toggle from Notification Center
      }
      window.removeEventListener('click', handleFirstClick);
    };
    window.addEventListener('click', handleFirstClick, { once: true });
    return () => window.removeEventListener('click', handleFirstClick);
  }, []);

  // 1. Listen for new Batch Announcements & Posts (منشورات)
  useEffect(() => {
    if (!db || !user?.uid) return;

    try {
      const q = query(collection(db, 'batchNotifications'));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          if (!postsInitialized.current) {
            snapshot.docs.forEach((d) => knownPostIds.current.add(d.id));
            postsInitialized.current = true;
            return;
          }

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const notifId = change.doc.id;
              if (!knownPostIds.current.has(notifId)) {
                knownPostIds.current.add(notifId);
                const data = change.doc.data() as BatchNotification;

                // Do not notify author of their own post
                if (data.authorUid && user?.uid && data.authorUid === user.uid) {
                  return;
                }

                dispatchAppNotification({
                  title: `📢 منشور دفعة جديد: ${data.title || 'إعلان أكاديمي'}`,
                  body: `${data.authorNameArabic || 'ممثل الدفعة'}: ${(data.message || '').slice(0, 100)}${(data.message || '').length > 100 ? '...' : ''}`,
                  category: 'post',
                  actionTab: 'student_dashboard',
                  authorName: data.authorNameArabic || 'إدارة الدفعة'
                });
              }
            }
          });
        },
        (err) => {
          console.warn('Batch notifications listener error:', err);
        }
      );

      return () => unsub();
    } catch (e) {
      console.warn('Failed to attach batch notifications listener:', e);
    }
  }, [user?.uid]);

  // 2. Listen for new Educational Resources & Clinical Data (داتا ومحاضرات)
  useEffect(() => {
    if (!db || !user?.uid) return;

    try {
      const q = query(
        collection(db, 'educationalResources'),
        where('status', '==', 'published')
      );

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          if (!resourcesInitialized.current) {
            snapshot.docs.forEach((d) => knownResourceIds.current.add(d.id));
            resourcesInitialized.current = true;
            return;
          }

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const resId = change.doc.id;
              if (!knownResourceIds.current.has(resId)) {
                knownResourceIds.current.add(resId);
                const data = change.doc.data() as EducationalResource;

                if (data.createdBy && user?.uid && data.createdBy === user.uid) {
                  return;
                }

                const typeLabel =
                  data.resourceType === 'pdf'
                    ? 'ملف PDF / مذكرة'
                    : data.resourceType === 'image'
                    ? 'شريحة / صورة سريرية'
                    : data.resourceType === 'video' || data.resourceType === 'video_link'
                    ? 'محاضرة فيديو'
                    : 'رابط ومصدر طبي';

                dispatchAppNotification({
                  title: `📚 داتا ومحاضرة طبية جديدة: ${data.title}`,
                  body: `تم نشر ${typeLabel} جديد في المكتبة السريرية والأكاديمية.`,
                  category: 'data',
                  actionTab: 'student_library',
                  authorName: 'المكتبة السريرية'
                });
              }
            }
          });
        },
        (err) => {
          console.warn('Educational resources listener error:', err);
        }
      );

      return () => unsub();
    } catch (e) {
      console.warn('Failed to attach educational resources listener:', e);
    }
  }, [user?.uid]);

  // 3. Listen for new Exams & Competitions (اختبارات ومسابقات)
  useEffect(() => {
    if (!db || !user?.uid) return;

    try {
      const q = query(
        collection(db, 'assessments'),
        where('status', '==', 'published')
      );

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          if (!assessmentsInitialized.current) {
            snapshot.docs.forEach((d) => knownAssessmentIds.current.add(d.id));
            assessmentsInitialized.current = true;
            return;
          }

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const asmId = change.doc.id;
              if (!knownAssessmentIds.current.has(asmId)) {
                knownAssessmentIds.current.add(asmId);
                const data = change.doc.data() as Assessment;

                if (data.createdBy && user?.uid && data.createdBy === user.uid) {
                  return;
                }

                const isCompetition = data.assessmentType === 'competition';

                dispatchAppNotification({
                  title: isCompetition
                    ? `🏆 مسابقة طبية جديدة: ${data.titleArabic}`
                    : `📝 اختبار أكاديمي جديد: ${data.titleArabic}`,
                  body: isCompetition
                    ? `مسابقة تنافسية متاحة الآن! المدة: ${data.durationMinutes} دقيقة - إجمالي النقاط: ${data.totalPoints}`
                    : `اختبار أكاديمي جديد متاح للمحاولة - المدة: ${data.durationMinutes} دقيقة.`,
                  category: isCompetition ? 'competition' : 'exam',
                  actionTab: 'student_assessments',
                  authorName: 'كنترول الاختبارات والمسابقات'
                });
              }
            }
          });
        },
        (err) => {
          console.warn('Assessments listener error:', err);
        }
      );

      return () => unsub();
    } catch (e) {
      console.warn('Failed to attach assessments listener:', e);
    }
  }, [user?.uid]);

  // 4. Listen for User Enrollment & Academic Status Updates (تحديثات الحالة والاعتماد)
  useEffect(() => {
    if (!db || !user?.uid) return;

    try {
      const docRef = doc(db, 'studentEnrollments', `enr-${user.uid}`);
      const unsub = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data() as StudentEnrollment;
          const currentStatus = data.status;

          if (lastEnrollmentStatus.current !== null && lastEnrollmentStatus.current !== currentStatus) {
            if (currentStatus === 'approved') {
              dispatchAppNotification({
                title: '🎉 تم اعتماد تسجيلك الأكاديمي بنجاح!',
                body: 'مبارك! تم اعتماد قيدك الجامعي رسميًا في كلية الطب البشري، والآن كافة المقررات والمكتبة والاختبارات مفعلة بالكامل.',
                category: 'update',
                actionTab: 'student_dashboard',
                authorName: 'عمادة كلية الطب البشري'
              });
            } else if (currentStatus === 'rejected') {
              dispatchAppNotification({
                title: '⚠️ تحديث بخصوص طلب التسجيل الأكاديمي',
                body: 'تمت مراجعة طلبك وإرجاعه للمراجعة أو التعديل. يرجى الدخول لملفك وتحديث البيانات المطلوبة.',
                category: 'update',
                actionTab: 'student_profile',
                authorName: 'لجنة القبول والتسجيل'
              });
            }
          }

          lastEnrollmentStatus.current = currentStatus || null;
        },
        (err) => {
          console.warn('Student enrollment status listener error:', err);
        }
      );

      return () => unsub();
    } catch (e) {
      console.warn('Failed to attach enrollment listener:', e);
    }
  }, [user?.uid]);

  return null;
}
