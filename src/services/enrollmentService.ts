/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Student Enrollment & Profile Service
 * Manages Registration Cascading, Approvals, Direct Editing/Deletion, and Academic Change Requests
 */

import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  setDoc, 
  deleteDoc,
  query, 
  where,
  onSnapshot
} from 'firebase/firestore';
import { 
  db, 
  cleanFirestoreData,
  checkIdentifierUniqueness,
  reserveUniqueIdentifiers,
  releaseAcademicIdentifier,
  normalizeAcademicId,
  getAcademicIdDocKey,
  getLocalDeletedUids
} from '../lib/firebase.ts';
import { 
  StudentEnrollment, 
  EnrollmentStatus, 
  AcademicChangeRequest 
} from '../types/umed.ts';

const ENROLLMENTS_STORAGE_KEY = 'umed_enrollments_all';
const ENROLLMENTS_INIT_KEY = 'umed_enrollments_init';
const ENROLLMENTS_DELETED_KEY = 'umed_enrollments_deleted_ids';
const CHANGE_REQUESTS_STORAGE_KEY = 'umed_academic_change_requests';
const CHANGE_REQUESTS_INIT_KEY = 'umed_academic_change_requests_init';

const DEFAULT_DEMO_ENROLLMENTS: StudentEnrollment[] = [
  {
    id: 'enr-demo-1',
    uid: 'user-demo-s1',
    studentNameArabic: 'أحمد محمد الشرعبي',
    universityId: 'univ-dar-al-salam',
    collegeId: 'col-medicine-dar',
    programId: 'prog-mbbs',
    curriculumVersionId: 'cur-dar-2024',
    currentStudyLevelId: 'lvl-4',
    academicStudentNumber: 'MED-2022-0451',
    academicYear: '2025/2026',
    status: 'pending',
    enrolledAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 'enr-demo-2',
    uid: 'user-demo-s2',
    studentNameArabic: 'سارة عبدالكريم الحكيمي',
    universityId: 'univ-dar-al-salam',
    collegeId: 'col-medicine-dar',
    programId: 'prog-mbbs',
    curriculumVersionId: 'cur-dar-2024',
    currentStudyLevelId: 'lvl-internship',
    academicStudentNumber: 'MED-2019-0118',
    academicYear: '2025/2026',
    status: 'approved',
    reviewedBy: 'SYSTEM_ADMIN',
    reviewedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    enrolledAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString()
  }
];

const DEFAULT_DEMO_CHANGE_REQUESTS: AcademicChangeRequest[] = [
  {
    id: 'req-demo-1',
    uid: 'user-demo-s1',
    enrollmentId: 'enr-demo-1',
    universityId: 'univ-dar-al-salam',
    requestedLevelId: 'lvl-5',
    requestedAcademicNumber: 'MED-2022-0451',
    reason: 'تم اجتياز اختبارات الدور التكميلي والانتقال للمستوى الخامس رسمياً في الكلية.',
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString()
  }
];

function getDeletedEnrollmentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ENROLLMENTS_DELETED_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}

function markEnrollmentDeleted(id: string) {
  try {
    const set = getDeletedEnrollmentIds();
    set.add(id);
    localStorage.setItem(ENROLLMENTS_DELETED_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function unmarkEnrollmentDeleted(id: string) {
  try {
    const set = getDeletedEnrollmentIds();
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(ENROLLMENTS_DELETED_KEY, JSON.stringify(Array.from(set)));
    }
  } catch (e) {}
}

function getLocalEnrollments(): StudentEnrollment[] {
  try {
    const raw = localStorage.getItem(ENROLLMENTS_STORAGE_KEY);
    if (raw) {
      const deleted = getDeletedEnrollmentIds();
      const deletedUids = getLocalDeletedUids();
      return (JSON.parse(raw) as StudentEnrollment[]).filter(
        e => !deleted.has(e.id) && !deletedUids.has(e.uid)
      );
    }
  } catch (e) {}
  return [];
}

function saveLocalEnrollments(list: StudentEnrollment[]) {
  try {
    const deleted = getDeletedEnrollmentIds();
    const deletedUids = getLocalDeletedUids();
    const clean = list.filter(e => !deleted.has(e.id) && !deletedUids.has(e.uid));
    localStorage.setItem(ENROLLMENTS_STORAGE_KEY, JSON.stringify(clean));
    localStorage.setItem(ENROLLMENTS_INIT_KEY, 'true');
  } catch (e) {}
}

function getLocalChangeRequests(): AcademicChangeRequest[] {
  try {
    const raw = localStorage.getItem(CHANGE_REQUESTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function saveLocalChangeRequests(list: AcademicChangeRequest[]) {
  try {
    localStorage.setItem(CHANGE_REQUESTS_STORAGE_KEY, JSON.stringify(list));
    localStorage.setItem(CHANGE_REQUESTS_INIT_KEY, 'true');
  } catch (e) {}
}

function pickNewestEnrollment(a: StudentEnrollment, b: StudentEnrollment): StudentEnrollment {
  const timeA = new Date(a.updatedAt || a.reviewedAt || a.enrolledAt || 0).getTime();
  const timeB = new Date(b.updatedAt || b.reviewedAt || b.enrolledAt || 0).getTime();
  if (timeA !== timeB) {
    return timeA > timeB ? a : b;
  }
  if (a.status === 'approved' && b.status !== 'approved') return a;
  if (b.status === 'approved' && a.status !== 'approved') return b;
  return b;
}

// ---------------------------------------------------------------------------
// 1. Student Enrollment Operations
// ---------------------------------------------------------------------------

export async function fetchStudentEnrollment(uid: string): Promise<StudentEnrollment | null> {
  if (!uid) return null;
  const deleted = getDeletedEnrollmentIds();

  // 1. Read local cache first so we never lose state if offline or if local was just updated
  let localCandidate: StudentEnrollment | null = null;
  try {
    const cachedRaw = localStorage.getItem(`umed_enrollment_${uid}`);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw) as StudentEnrollment;
      if (!deleted.has(parsed.id)) {
        localCandidate = parsed;
      }
    }
    const allLocal = getLocalEnrollments().filter(e => e.uid === uid && !deleted.has(e.id));
    for (const item of allLocal) {
      localCandidate = localCandidate ? pickNewestEnrollment(localCandidate, item) : item;
    }
  } catch (e) {}

  // 2. Query Firestore (both deterministic doc ID and uid query for legacy docs)
  let remoteCandidate: StudentEnrollment | null = null;
  try {
    const deterministicRef = doc(db, 'studentEnrollments', `enr-${uid}`);
    const detSnap = await getDoc(deterministicRef);
    if (detSnap.exists() && !deleted.has(detSnap.id)) {
      remoteCandidate = { id: detSnap.id, ...detSnap.data() } as StudentEnrollment;
    }

    const q = query(collection(db, 'studentEnrollments'), where('uid', '==', uid));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      if (!deleted.has(d.id)) {
        const item = { id: d.id, ...d.data() } as StudentEnrollment;
        remoteCandidate = remoteCandidate ? pickNewestEnrollment(remoteCandidate, item) : item;
      }
    });
  } catch (err) {
    console.warn('Firestore fetchStudentEnrollment error:', err);
  }

  // 3. Resolve best candidate and ensure both LocalStorage & Firestore stay synchronized
  let winner: StudentEnrollment | null = null;
  if (localCandidate && remoteCandidate) {
    winner = pickNewestEnrollment(localCandidate, remoteCandidate);
  } else {
    winner = remoteCandidate || localCandidate;
  }

  if (winner) {
    try {
      localStorage.setItem(`umed_enrollment_${uid}`, JSON.stringify(winner));
      const allLocal = getLocalEnrollments();
      const idx = allLocal.findIndex(e => e.id === winner!.id || e.uid === uid);
      if (idx >= 0) {
        allLocal[idx] = winner;
        saveLocalEnrollments(allLocal);
      } else {
        saveLocalEnrollments([winner, ...allLocal]);
      }
    } catch (e) {}

    // If local was newer than remote or remote didn't exist yet, sync up to Firestore
    if (!remoteCandidate || winner !== remoteCandidate) {
      setDoc(doc(db, 'studentEnrollments', winner.id), cleanFirestoreData(winner), { merge: true }).catch(() => {});
    }
  }

  return winner;
}

export async function verifyAcademicStudentNumberAvailable(
  academicStudentNumber: string,
  excludeUid?: string
): Promise<{ available: boolean; normalized: string; message?: string }> {
  const normalized = normalizeAcademicId(academicStudentNumber);
  if (!normalized || normalized.length < 3) {
    return {
      available: false,
      normalized,
      message: 'يرجى إدخال رقم قيد أكاديمي / جامعي صحيح (3 خانات على الأقل).'
    };
  }

  // 1. Check via Global Uniqueness Registry (Firestore uniqueIdentifiers + userProfiles + studentEnrollments)
  const check = await checkIdentifierUniqueness({
    academicStudentNumber: normalized,
    excludeUid
  });
  if (!check.isUnique) {
    return {
      available: false,
      normalized,
      message: check.message || `رقم القيد الأكاديمي (${normalized}) مسجل مسبقاً لطالب آخر في المنصة.`
    };
  }

  // 2. Also cross-check against all fetched enrollments in admin/local list
  const allEnrollments = await fetchEnrollmentsForAdmin();
  const targetKey = getAcademicIdDocKey(normalized);
  const conflicting = allEnrollments.find(
    (e) =>
      e.uid !== excludeUid &&
      e.academicStudentNumber &&
      getAcademicIdDocKey(e.academicStudentNumber) === targetKey
  );

  if (conflicting) {
    return {
      available: false,
      normalized,
      message: `رقم القيد الأكاديمي (${normalized}) مسجل مسبقاً لحساب طالب آخر (${conflicting.studentNameArabic || 'حساب مسجل'}). لا يُسمح بتكرار رقم القيد.`
    };
  }

  return { available: true, normalized };
}

export async function submitEnrollmentRequest(params: {
  uid: string;
  studentNameArabic?: string;
  studentEmail?: string;
  studentPhone?: string;
  universityId: string;
  collegeId: string;
  programId: string;
  curriculumVersionId: string;
  currentStudyLevelId: string;
  academicStudentNumber: string;
  academicYear: string;
  policy: 'immediate' | 'approval_required';
}): Promise<StudentEnrollment> {
  // 1. Strict Uniqueness Check on Academic Registration Number (رقم القيد)
  const availability = await verifyAcademicStudentNumberAvailable(params.academicStudentNumber, params.uid);
  if (!availability.available) {
    throw new Error(availability.message || 'رقم القيد الأكاديمي مسجل مسبقاً لحساب آخر');
  }
  const normalizedAcadNumber = availability.normalized;

  // Deterministic ID per student UID prevents duplicate pending records
  const enrollmentId = `enr-${params.uid}`;
  unmarkEnrollmentDeleted(enrollmentId);
  const status: EnrollmentStatus = params.policy === 'immediate' ? 'approved' : 'pending';
  const nowIso = new Date().toISOString();

  const enrollment: StudentEnrollment = cleanFirestoreData({
    id: enrollmentId,
    uid: params.uid,
    studentNameArabic: params.studentNameArabic?.trim() || 'طالب كلية الطب البشري',
    ...(params.studentEmail ? { studentEmail: params.studentEmail.trim().toLowerCase() } : {}),
    ...(params.studentPhone ? { studentPhone: params.studentPhone.trim() } : {}),
    universityId: params.universityId,
    collegeId: params.collegeId,
    programId: params.programId,
    curriculumVersionId: params.curriculumVersionId,
    currentStudyLevelId: params.currentStudyLevelId,
    academicStudentNumber: normalizedAcadNumber,
    academicYear: params.academicYear,
    status,
    enrolledAt: nowIso,
    updatedAt: nowIso
  });

  // Save to local cache immediately so page refresh never loses registration
  try {
    localStorage.setItem(`umed_enrollment_${params.uid}`, JSON.stringify(enrollment));
    const currentAll = getLocalEnrollments();
    saveLocalEnrollments([
      enrollment,
      ...currentAll.filter(e => e.id !== enrollmentId && e.uid !== params.uid)
    ]);
  } catch (e) {}

  // Reserve unique identifiers in Cloud Firestore
  await reserveUniqueIdentifiers({
    uid: params.uid,
    email: params.studentEmail,
    phone: params.studentPhone,
    academicStudentNumber: normalizedAcadNumber,
    universityId: params.universityId
  });

  try {
    await setDoc(doc(db, 'studentEnrollments', enrollmentId), cleanFirestoreData(enrollment), { merge: true });
    // Also clean up any older random-ID enrollment docs for this same uid
    const q = query(collection(db, 'studentEnrollments'), where('uid', '==', params.uid));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      if (d.id !== enrollmentId) {
        await deleteDoc(doc(db, 'studentEnrollments', d.id)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Could not write enrollment directly to Firestore, saved to local cache:', err);
  }

  return enrollment;
}

// ---------------------------------------------------------------------------
// 2. Admin Enrollment Queue & Direct CRUD Operations
// ---------------------------------------------------------------------------

export async function fetchEnrollmentsForAdmin(universityId?: string): Promise<StudentEnrollment[]> {
  const deleted = getDeletedEnrollmentIds();
  const deletedUids = getLocalDeletedUids();
  const localList = getLocalEnrollments();

  try {
    let q = query(collection(db, 'studentEnrollments'));
    if (universityId) {
      q = query(collection(db, 'studentEnrollments'), where('universityId', '==', universityId));
    }
    const snap = await getDocs(q);
    const firestoreList: StudentEnrollment[] = [];
    snap.forEach((d) => {
      const data = { id: d.id, ...d.data() } as StudentEnrollment;
      if (!deleted.has(d.id) && !deletedUids.has(data.uid)) {
        firestoreList.push(data);
      }
    });

    if (firestoreList.length > 0 || localList.length > 0) {
      const byIdMap = new Map<string, StudentEnrollment>();
      for (const item of localList) {
        if (!deleted.has(item.id) && !deletedUids.has(item.uid)) {
          byIdMap.set(item.id, item);
        }
      }
      for (const remoteItem of firestoreList) {
        if (deleted.has(remoteItem.id) || deletedUids.has(remoteItem.uid)) continue;
        const existingLocal = byIdMap.get(remoteItem.id);
        if (existingLocal) {
          const winner = pickNewestEnrollment(existingLocal, remoteItem);
          byIdMap.set(remoteItem.id, winner);
          if (winner === existingLocal && existingLocal.updatedAt !== remoteItem.updatedAt) {
            setDoc(doc(db, 'studentEnrollments', winner.id), cleanFirestoreData(winner), { merge: true }).catch(() => {});
          }
        } else {
          byIdMap.set(remoteItem.id, remoteItem);
        }
      }

      // Deduplicate by UID (keep newest record per student UID)
      const byUidMap = new Map<string, StudentEnrollment>();
      for (const item of byIdMap.values()) {
        const key = item.uid || item.id;
        const prev = byUidMap.get(key);
        if (!prev) {
          byUidMap.set(key, item);
        } else {
          byUidMap.set(key, pickNewestEnrollment(prev, item));
        }
      }

      const merged = Array.from(byUidMap.values()).sort(
        (a, b) => new Date(b.updatedAt || b.enrolledAt || 0).getTime() - new Date(a.updatedAt || a.enrolledAt || 0).getTime()
      );
      saveLocalEnrollments(merged);
      return universityId ? merged.filter(e => e.universityId === universityId) : merged;
    }

    saveLocalEnrollments([]);
    return [];
  } catch (err) {
    console.warn('Firestore fetchEnrollmentsForAdmin error:', err);
  }

  return universityId ? localList.filter(e => e.universityId === universityId) : localList;
}

export async function updateEnrollmentStatus(
  enrollmentId: string, 
  status: EnrollmentStatus, 
  reviewedBy: string, 
  rejectionReason?: string
): Promise<StudentEnrollment> {
  const nowIso = new Date().toISOString();
  const existing = await fetchEnrollmentsForAdmin();
  let target = existing.find(e => e.id === enrollmentId);

  if (!target) {
    try {
      const snap = await getDoc(doc(db, 'studentEnrollments', enrollmentId));
      if (snap.exists()) {
        target = { id: snap.id, ...snap.data() } as StudentEnrollment;
      }
    } catch (e) {}
  }

  const baseItem: StudentEnrollment = target || {
    id: enrollmentId,
    uid: enrollmentId.startsWith('enr-') ? enrollmentId.replace(/^enr-/, '') : 'student',
    universityId: 'univ-dar-al-salam',
    collegeId: 'col-human-medicine',
    programId: 'prog-mbbs',
    curriculumVersionId: 'cur-dar-2024',
    currentStudyLevelId: 'lvl-4',
    academicStudentNumber: 'MED-0000',
    academicYear: '2025/2026',
    status,
    enrolledAt: nowIso,
    updatedAt: nowIso
  };

  const updatedItem: StudentEnrollment = cleanFirestoreData({
    ...baseItem,
    status,
    reviewedBy,
    reviewedAt: nowIso,
    rejectionReason: status === 'rejected' ? (rejectionReason || 'لم يتم استيفاء متطلبات القيد') : '',
    updatedAt: nowIso
  });

  // 1. Update local storage immediately
  const updatedList = existing.some(e => e.id === enrollmentId)
    ? existing.map(e => (e.id === enrollmentId || (updatedItem.uid && e.uid === updatedItem.uid)) ? updatedItem : e)
    : [updatedItem, ...existing];
  saveLocalEnrollments(updatedList);

  if (updatedItem.uid) {
    try {
      localStorage.setItem(`umed_enrollment_${updatedItem.uid}`, JSON.stringify(updatedItem));
    } catch (e) {}
  }

  // 2. Persist to Firestore (both by enrollmentId and any duplicate docs for the same uid)
  try {
    await setDoc(doc(db, 'studentEnrollments', enrollmentId), cleanFirestoreData(updatedItem), { merge: true });
    if (updatedItem.uid) {
      const q = query(collection(db, 'studentEnrollments'), where('uid', '==', updatedItem.uid));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (d.id !== enrollmentId) {
          await setDoc(doc(db, 'studentEnrollments', d.id), cleanFirestoreData({ ...updatedItem, id: d.id }), { merge: true });
        }
      }
    }
  } catch (err) {
    console.warn('Could not update enrollment directly in Firestore, saved locally:', err);
  }

  // 3. Record audit log via backend server
  try {
    await fetch('/api/admin/enrollment-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentId,
        status,
        reviewedBy,
        rejectionReason: updatedItem.rejectionReason
      })
    });
  } catch (e) {}

  return updatedItem;
}

export async function updateStudentEnrollment(
  enrollmentId: string,
  updates: Partial<StudentEnrollment>
): Promise<StudentEnrollment | null> {
  const nowIso = new Date().toISOString();
  const existing = await fetchEnrollmentsForAdmin();
  const target = existing.find(e => e.id === enrollmentId);
  if (!target) return null;

  const nextUpdates = { ...updates };
  if (nextUpdates.academicStudentNumber && nextUpdates.academicStudentNumber.trim()) {
    const availability = await verifyAcademicStudentNumberAvailable(
      nextUpdates.academicStudentNumber,
      target.uid
    );
    if (!availability.available) {
      throw new Error(availability.message || 'رقم القيد الأكاديمي مسجل مسبقاً لطالب آخر');
    }
    nextUpdates.academicStudentNumber = availability.normalized;
  }

  const updatedEnrollment: StudentEnrollment = cleanFirestoreData({
    ...target,
    ...nextUpdates,
    id: enrollmentId,
    updatedAt: nowIso
  });

  if (
    target.academicStudentNumber &&
    updatedEnrollment.academicStudentNumber &&
    getAcademicIdDocKey(target.academicStudentNumber) !== getAcademicIdDocKey(updatedEnrollment.academicStudentNumber)
  ) {
    await releaseAcademicIdentifier(target.academicStudentNumber);
  }

  if (updatedEnrollment.academicStudentNumber && updatedEnrollment.uid) {
    await reserveUniqueIdentifiers({
      uid: updatedEnrollment.uid,
      academicStudentNumber: updatedEnrollment.academicStudentNumber,
      universityId: updatedEnrollment.universityId
    });
  }

  saveLocalEnrollments(existing.map(e => e.id === enrollmentId ? updatedEnrollment : e));
  if (updatedEnrollment.uid) {
    try {
      localStorage.setItem(`umed_enrollment_${updatedEnrollment.uid}`, JSON.stringify(updatedEnrollment));
    } catch (e) {}
  }

  try {
    await setDoc(doc(db, 'studentEnrollments', enrollmentId), cleanFirestoreData(updatedEnrollment), { merge: true });
    if (updatedEnrollment.uid) {
      const q = query(collection(db, 'studentEnrollments'), where('uid', '==', updatedEnrollment.uid));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (d.id !== enrollmentId) {
          await setDoc(doc(db, 'studentEnrollments', d.id), cleanFirestoreData({ ...updatedEnrollment, id: d.id }), { merge: true });
        }
      }
    }
  } catch (err) {
    console.warn('Firestore updateStudentEnrollment fallback:', err);
  }

  return updatedEnrollment;
}

export async function deleteEnrollment(enrollmentId: string): Promise<void> {
  const existing = await fetchEnrollmentsForAdmin();
  const target = existing.find(e => e.id === enrollmentId);
  markEnrollmentDeleted(enrollmentId);

  if (target?.academicStudentNumber) {
    await releaseAcademicIdentifier(target.academicStudentNumber);
  }

  const filtered = existing.filter(e => e.id !== enrollmentId);
  saveLocalEnrollments(filtered);
  if (target?.uid) {
    try {
      localStorage.removeItem(`umed_enrollment_${target.uid}`);
    } catch (e) {}
  }

  try {
    await deleteDoc(doc(db, 'studentEnrollments', enrollmentId));
    if (target?.uid) {
      const q = query(collection(db, 'studentEnrollments'), where('uid', '==', target.uid));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        markEnrollmentDeleted(d.id);
        await deleteDoc(doc(db, 'studentEnrollments', d.id)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Firestore deleteEnrollment fallback:', err);
  }
}

// Aliases for compatibility
export const getEnrollmentByUserId = fetchStudentEnrollment;
export const submitEnrollment = submitEnrollmentRequest;
export const getUniversityEnrollments = fetchEnrollmentsForAdmin;
export const approveEnrollment = (id: string, reviewer: string) => updateEnrollmentStatus(id, 'approved', reviewer);
export const rejectEnrollment = (id: string, reviewer: string, reason?: string) => updateEnrollmentStatus(id, 'rejected', reviewer, reason);

// ---------------------------------------------------------------------------
// 3. Academic Change Requests (Student Submission & Admin Review/Approval)
// ---------------------------------------------------------------------------

export async function fetchAcademicChangeRequestsForAdmin(universityId?: string): Promise<AcademicChangeRequest[]> {
  const deletedUids = getLocalDeletedUids();
  const localReqs = getLocalChangeRequests().filter(r => !deletedUids.has(r.uid));

  try {
    let q = query(collection(db, 'academicChangeRequests'));
    if (universityId) {
      q = query(collection(db, 'academicChangeRequests'), where('universityId', '==', universityId));
    }
    const snap = await getDocs(q);
    const list: AcademicChangeRequest[] = [];
    snap.forEach(d => {
      const data = { id: d.id, ...d.data() } as AcademicChangeRequest;
      if (!deletedUids.has(data.uid)) {
        list.push(data);
      }
    });
    if (list.length > 0 || localReqs.length > 0) {
      const mergedMap: Record<string, AcademicChangeRequest> = {};
      localReqs.forEach(r => { mergedMap[r.id] = r; });
      list.forEach(r => {
        const local = mergedMap[r.id];
        if (local && local.status !== 'pending' && r.status === 'pending') {
          setDoc(doc(db, 'academicChangeRequests', local.id), cleanFirestoreData(local), { merge: true }).catch(() => {});
        } else {
          mergedMap[r.id] = r;
        }
      });
      const merged = Object.values(mergedMap).filter(r => !deletedUids.has(r.uid));
      saveLocalChangeRequests(merged);
      return universityId ? merged.filter(r => r.universityId === universityId) : merged;
    }

    saveLocalChangeRequests([]);
    return [];
  } catch (err) {
    console.warn('Firestore fetchAcademicChangeRequestsForAdmin fallback:', err);
  }

  return universityId ? localReqs.filter(r => r.universityId === universityId) : localReqs;
}

export async function submitAcademicChangeRequest(params: {
  uid: string;
  enrollmentId: string;
  universityId: string;
  requestedLevelId?: string;
  requestedAcademicNumber?: string;
  reason: string;
}): Promise<AcademicChangeRequest> {
  let cleanRequestedAcademicNumber: string | undefined;
  if (params.requestedAcademicNumber && params.requestedAcademicNumber.trim()) {
    const availability = await verifyAcademicStudentNumberAvailable(params.requestedAcademicNumber, params.uid);
    if (!availability.available) {
      throw new Error(availability.message || 'رقم القيد الأكاديمي المطلوب مسجل مسبقاً لطالب آخر.');
    }
    cleanRequestedAcademicNumber = availability.normalized;
  }

  const existing = await fetchAcademicChangeRequestsForAdmin();
  const reqId = `req-${Date.now().toString(36)}`;
  const changeReq: AcademicChangeRequest = cleanFirestoreData({
    id: reqId,
    uid: params.uid,
    enrollmentId: params.enrollmentId,
    universityId: params.universityId,
    ...(params.requestedLevelId ? { requestedLevelId: params.requestedLevelId } : {}),
    ...(cleanRequestedAcademicNumber ? { requestedAcademicNumber: cleanRequestedAcademicNumber } : {}),
    reason: params.reason,
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  saveLocalChangeRequests([changeReq, ...existing]);

  try {
    await setDoc(doc(db, 'academicChangeRequests', reqId), cleanFirestoreData(changeReq));
  } catch (err) {
    console.warn('Could not submit change request to Firestore:', err);
  }

  return changeReq;
}

export async function reviewAcademicChangeRequest(
  requestId: string,
  status: 'approved' | 'rejected',
  reviewedBy: string
): Promise<AcademicChangeRequest | null> {
  const nowIso = new Date().toISOString();
  const requests = await fetchAcademicChangeRequestsForAdmin();
  let targetReq = requests.find(r => r.id === requestId) || null;

  if (!targetReq) {
    try {
      const snap = await getDoc(doc(db, 'academicChangeRequests', requestId));
      if (snap.exists()) {
        targetReq = { id: snap.id, ...snap.data() } as AcademicChangeRequest;
      }
    } catch (e) {}
  }

  if (!targetReq) return null;

  const updatedReq: AcademicChangeRequest = cleanFirestoreData({
    ...targetReq,
    status,
    reviewedBy,
    reviewedAt: nowIso
  });

  saveLocalChangeRequests(requests.map(r => r.id === requestId ? updatedReq : r));

  try {
    await setDoc(doc(db, 'academicChangeRequests', requestId), cleanFirestoreData(updatedReq), { merge: true });
  } catch (err) {
    console.warn('Firestore reviewAcademicChangeRequest fallback:', err);
  }

  // If approved, automatically update student's enrollment document (currentStudyLevelId & academicStudentNumber)
  if (status === 'approved' && targetReq.enrollmentId) {
    const enrollmentUpdates: Partial<StudentEnrollment> = {};
    if (targetReq.requestedLevelId) {
      enrollmentUpdates.currentStudyLevelId = targetReq.requestedLevelId;
    }
    if (targetReq.requestedAcademicNumber) {
      enrollmentUpdates.academicStudentNumber = targetReq.requestedAcademicNumber.trim();
    }
    if (Object.keys(enrollmentUpdates).length > 0) {
      await updateStudentEnrollment(targetReq.enrollmentId, enrollmentUpdates);
    }
  }

  return updatedReq;
}

// ---------------------------------------------------------------------------
// 4. Real-Time Automatic Firestore Subscriptions (Zero-Stop Live Sync)
// ---------------------------------------------------------------------------

export function subscribeToStudentEnrollment(
  uid: string,
  onUpdate: (enrollment: StudentEnrollment | null) => void
): () => void {
  if (!uid) return () => {};
  const deleted = getDeletedEnrollmentIds();

  // Listen to deterministic enrollment document enr-{uid}
  const unsubDoc = onSnapshot(
    doc(db, 'studentEnrollments', `enr-${uid}`),
    (snap) => {
      if (snap.exists() && !deleted.has(snap.id)) {
        const remote = { id: snap.id, ...snap.data() } as StudentEnrollment;
        try {
          const cachedRaw = localStorage.getItem(`umed_enrollment_${uid}`);
          const local = cachedRaw ? (JSON.parse(cachedRaw) as StudentEnrollment) : null;
          const winner = local ? pickNewestEnrollment(local, remote) : remote;
          localStorage.setItem(`umed_enrollment_${uid}`, JSON.stringify(winner));
          onUpdate(winner);
        } catch (e) {
          onUpdate(remote);
        }
      }
    },
    () => {}
  );

  // Also listen to uid query for any legacy enrollment document
  const q = query(collection(db, 'studentEnrollments'), where('uid', '==', uid));
  const unsubQuery = onSnapshot(
    q,
    (snap) => {
      let best: StudentEnrollment | null = null;
      snap.forEach((d) => {
        if (!deleted.has(d.id)) {
          const item = { id: d.id, ...d.data() } as StudentEnrollment;
          best = best ? pickNewestEnrollment(best, item) : item;
        }
      });
      if (best) {
        try {
          const cachedRaw = localStorage.getItem(`umed_enrollment_${uid}`);
          const local = cachedRaw ? (JSON.parse(cachedRaw) as StudentEnrollment) : null;
          const winner = local ? pickNewestEnrollment(local, best) : best;
          localStorage.setItem(`umed_enrollment_${uid}`, JSON.stringify(winner));
          onUpdate(winner);
        } catch (e) {
          onUpdate(best);
        }
      }
    },
    () => {}
  );

  return () => {
    unsubDoc();
    unsubQuery();
  };
}

export function subscribeToAdminEnrollments(
  universityId: string | undefined,
  onUpdate: (list: StudentEnrollment[]) => void
): () => void {
  const q = universityId
    ? query(collection(db, 'studentEnrollments'), where('universityId', '==', universityId))
    : query(collection(db, 'studentEnrollments'));

  const unsub = onSnapshot(
    q,
    (snap) => {
      const deleted = getDeletedEnrollmentIds();
      const deletedUids = getLocalDeletedUids();
      const localList = getLocalEnrollments();
      const byIdMap = new Map<string, StudentEnrollment>();

      for (const item of localList) {
        if (!deleted.has(item.id) && !deletedUids.has(item.uid)) {
          byIdMap.set(item.id, item);
        }
      }

      snap.forEach((d) => {
        const remoteItem = { id: d.id, ...d.data() } as StudentEnrollment;
        if (!deleted.has(d.id) && !deletedUids.has(remoteItem.uid)) {
          const existingLocal = byIdMap.get(remoteItem.id);
          if (existingLocal) {
            byIdMap.set(remoteItem.id, pickNewestEnrollment(existingLocal, remoteItem));
          } else {
            byIdMap.set(remoteItem.id, remoteItem);
          }
        }
      });

      const byUidMap = new Map<string, StudentEnrollment>();
      for (const item of byIdMap.values()) {
        const key = item.uid || item.id;
        const prev = byUidMap.get(key);
        byUidMap.set(key, prev ? pickNewestEnrollment(prev, item) : item);
      }

      const merged = Array.from(byUidMap.values()).sort(
        (a, b) => new Date(b.updatedAt || b.enrolledAt || 0).getTime() - new Date(a.updatedAt || a.enrolledAt || 0).getTime()
      );
      saveLocalEnrollments(merged);
      onUpdate(universityId ? merged.filter(e => e.universityId === universityId) : merged);
    },
    () => {}
  );

  return unsub;
}
