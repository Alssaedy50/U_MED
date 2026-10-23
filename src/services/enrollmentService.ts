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
  updateDoc, 
  deleteDoc,
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { 
  StudentEnrollment, 
  EnrollmentStatus, 
  AcademicChangeRequest 
} from '../types/umed.ts';

const ENROLLMENTS_STORAGE_KEY = 'umed_enrollments_all';
const ENROLLMENTS_INIT_KEY = 'umed_enrollments_init';
const CHANGE_REQUESTS_STORAGE_KEY = 'umed_academic_change_requests';
const CHANGE_REQUESTS_INIT_KEY = 'umed_academic_change_requests_init';

const DEFAULT_DEMO_ENROLLMENTS: StudentEnrollment[] = [
  {
    id: 'enr-demo-1',
    uid: 'user-demo-s1',
    universityId: 'univ-dar-al-salam',
    collegeId: 'col-human-medicine',
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
    universityId: 'univ-dar-al-salam',
    collegeId: 'col-human-medicine',
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

function getLocalEnrollments(): StudentEnrollment[] {
  try {
    const raw = localStorage.getItem(ENROLLMENTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function saveLocalEnrollments(list: StudentEnrollment[]) {
  try {
    localStorage.setItem(ENROLLMENTS_STORAGE_KEY, JSON.stringify(list));
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

// ---------------------------------------------------------------------------
// 1. Student Enrollment Operations
// ---------------------------------------------------------------------------

export async function fetchStudentEnrollment(uid: string): Promise<StudentEnrollment | null> {
  try {
    const q = query(collection(db, 'studentEnrollments'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = { id: snap.docs[0].id, ...snap.docs[0].data() } as StudentEnrollment;
      localStorage.setItem(`umed_enrollment_${uid}`, JSON.stringify(data));
      return data;
    }
  } catch (err) {
    console.warn('Firestore fetchStudentEnrollment error:', err);
  }

  // Fallback to local storage cache
  try {
    const cached = localStorage.getItem(`umed_enrollment_${uid}`);
    if (cached) return JSON.parse(cached);
    const allLocal = getLocalEnrollments();
    const found = allLocal.find(e => e.uid === uid);
    if (found) return found;
  } catch (e) {}

  return null;
}

export async function submitEnrollmentRequest(params: {
  uid: string;
  universityId: string;
  collegeId: string;
  programId: string;
  curriculumVersionId: string;
  currentStudyLevelId: string;
  academicStudentNumber: string;
  academicYear: string;
  policy: 'immediate' | 'approval_required';
}): Promise<StudentEnrollment> {
  const enrollmentId = `enr-${params.uid}-${Date.now().toString(36)}`;
  const status: EnrollmentStatus = params.policy === 'immediate' ? 'approved' : 'pending';

  const enrollment: StudentEnrollment = {
    id: enrollmentId,
    uid: params.uid,
    universityId: params.universityId,
    collegeId: params.collegeId,
    programId: params.programId,
    curriculumVersionId: params.curriculumVersionId,
    currentStudyLevelId: params.currentStudyLevelId,
    academicStudentNumber: params.academicStudentNumber.trim(),
    academicYear: params.academicYear,
    status,
    enrolledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'studentEnrollments', enrollmentId), enrollment);
  } catch (err) {
    console.warn('Could not write enrollment directly to Firestore, saving to local cache:', err);
  }

  try {
    localStorage.setItem(`umed_enrollment_${params.uid}`, JSON.stringify(enrollment));
    const currentAll = await fetchEnrollmentsForAdmin();
    saveLocalEnrollments([enrollment, ...currentAll.filter(e => e.id !== enrollmentId)]);
  } catch (e) {}

  return enrollment;
}

// ---------------------------------------------------------------------------
// 2. Admin Enrollment Queue & Direct CRUD Operations
// ---------------------------------------------------------------------------

export async function fetchEnrollmentsForAdmin(universityId?: string): Promise<StudentEnrollment[]> {
  const localList = getLocalEnrollments();
  const isInitialized = localStorage.getItem(ENROLLMENTS_INIT_KEY) === 'true';

  try {
    let q = query(collection(db, 'studentEnrollments'));
    if (universityId) {
      q = query(collection(db, 'studentEnrollments'), where('universityId', '==', universityId));
    }
    const snap = await getDocs(q);
    const list: StudentEnrollment[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() } as StudentEnrollment));
    if (list.length > 0) {
      const mergedMap: Record<string, StudentEnrollment> = {};
      localList.forEach(item => { mergedMap[item.id] = item; });
      list.forEach(item => { mergedMap[item.id] = item; });
      const merged = Object.values(mergedMap);
      saveLocalEnrollments(merged);
      return universityId ? merged.filter(e => e.universityId === universityId) : merged;
    }
  } catch (err) {
    console.warn('Firestore fetchEnrollmentsForAdmin error:', err);
  }

  if (isInitialized || localList.length > 0) {
    return universityId ? localList.filter(e => e.universityId === universityId) : localList;
  }

  // Materialize default demo enrollments if not initialized yet
  saveLocalEnrollments(DEFAULT_DEMO_ENROLLMENTS);
  for (const demo of DEFAULT_DEMO_ENROLLMENTS) {
    try {
      await setDoc(doc(db, 'studentEnrollments', demo.id), demo, { merge: true });
    } catch (e) {}
  }

  return universityId
    ? DEFAULT_DEMO_ENROLLMENTS.filter(e => e.universityId === universityId)
    : DEFAULT_DEMO_ENROLLMENTS;
}

export async function updateEnrollmentStatus(
  enrollmentId: string, 
  status: EnrollmentStatus, 
  reviewedBy: string, 
  rejectionReason?: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const existing = await fetchEnrollmentsForAdmin();
  const target = existing.find(e => e.id === enrollmentId);

  const updatedItem: StudentEnrollment = {
    ...(target || {
      id: enrollmentId,
      uid: 'student',
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
    }),
    status,
    reviewedBy,
    reviewedAt: nowIso,
    rejectionReason: rejectionReason || undefined,
    updatedAt: nowIso
  };

  try {
    await setDoc(doc(db, 'studentEnrollments', enrollmentId), updatedItem, { merge: true });
  } catch (err) {
    console.warn('Could not update enrollment directly, reporting to server API:', err);
  }

  saveLocalEnrollments(existing.map(e => e.id === enrollmentId ? updatedItem : e));
  if (updatedItem.uid) {
    try {
      localStorage.setItem(`umed_enrollment_${updatedItem.uid}`, JSON.stringify(updatedItem));
    } catch (e) {}
  }

  // Record audit log via backend server
  try {
    await fetch('/api/admin/enrollment-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enrollmentId,
        status,
        reviewedBy,
        rejectionReason
      })
    });
  } catch (e) {}
}

export async function updateStudentEnrollment(
  enrollmentId: string,
  updates: Partial<StudentEnrollment>
): Promise<StudentEnrollment | null> {
  const nowIso = new Date().toISOString();
  const existing = await fetchEnrollmentsForAdmin();
  const target = existing.find(e => e.id === enrollmentId);
  if (!target) return null;

  const updatedEnrollment: StudentEnrollment = {
    ...target,
    ...updates,
    id: enrollmentId,
    updatedAt: nowIso
  };

  try {
    await setDoc(doc(db, 'studentEnrollments', enrollmentId), updatedEnrollment, { merge: true });
  } catch (err) {
    console.warn('Firestore updateStudentEnrollment fallback:', err);
  }

  saveLocalEnrollments(existing.map(e => e.id === enrollmentId ? updatedEnrollment : e));
  if (updatedEnrollment.uid) {
    try {
      localStorage.setItem(`umed_enrollment_${updatedEnrollment.uid}`, JSON.stringify(updatedEnrollment));
    } catch (e) {}
  }

  return updatedEnrollment;
}

export async function deleteEnrollment(enrollmentId: string): Promise<void> {
  const existing = await fetchEnrollmentsForAdmin();
  const target = existing.find(e => e.id === enrollmentId);

  try {
    await deleteDoc(doc(db, 'studentEnrollments', enrollmentId));
  } catch (err) {
    console.warn('Firestore deleteEnrollment fallback:', err);
  }

  const filtered = existing.filter(e => e.id !== enrollmentId);
  saveLocalEnrollments(filtered);
  if (target?.uid) {
    try {
      localStorage.removeItem(`umed_enrollment_${target.uid}`);
    } catch (e) {}
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
  const localReqs = getLocalChangeRequests();
  const isInitialized = localStorage.getItem(CHANGE_REQUESTS_INIT_KEY) === 'true';

  try {
    let q = query(collection(db, 'academicChangeRequests'));
    if (universityId) {
      q = query(collection(db, 'academicChangeRequests'), where('universityId', '==', universityId));
    }
    const snap = await getDocs(q);
    const list: AcademicChangeRequest[] = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() } as AcademicChangeRequest));
    if (list.length > 0) {
      const mergedMap: Record<string, AcademicChangeRequest> = {};
      localReqs.forEach(r => { mergedMap[r.id] = r; });
      list.forEach(r => { mergedMap[r.id] = r; });
      const merged = Object.values(mergedMap);
      saveLocalChangeRequests(merged);
      return universityId ? merged.filter(r => r.universityId === universityId) : merged;
    }
  } catch (err) {
    console.warn('Firestore fetchAcademicChangeRequestsForAdmin fallback:', err);
  }

  if (isInitialized || localReqs.length > 0) {
    return universityId ? localReqs.filter(r => r.universityId === universityId) : localReqs;
  }

  saveLocalChangeRequests(DEFAULT_DEMO_CHANGE_REQUESTS);
  for (const demo of DEFAULT_DEMO_CHANGE_REQUESTS) {
    try {
      await setDoc(doc(db, 'academicChangeRequests', demo.id), demo, { merge: true });
    } catch (e) {}
  }

  return universityId
    ? DEFAULT_DEMO_CHANGE_REQUESTS.filter(r => r.universityId === universityId)
    : DEFAULT_DEMO_CHANGE_REQUESTS;
}

export async function submitAcademicChangeRequest(params: {
  uid: string;
  enrollmentId: string;
  universityId: string;
  requestedLevelId?: string;
  requestedAcademicNumber?: string;
  reason: string;
}): Promise<AcademicChangeRequest> {
  const existing = await fetchAcademicChangeRequestsForAdmin();
  const reqId = `req-${Date.now().toString(36)}`;
  const changeReq: AcademicChangeRequest = {
    id: reqId,
    uid: params.uid,
    enrollmentId: params.enrollmentId,
    universityId: params.universityId,
    requestedLevelId: params.requestedLevelId,
    requestedAcademicNumber: params.requestedAcademicNumber,
    reason: params.reason,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'academicChangeRequests', reqId), changeReq);
  } catch (err) {
    console.warn('Could not submit change request to Firestore:', err);
  }

  saveLocalChangeRequests([changeReq, ...existing]);
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

  const updatedReq: AcademicChangeRequest = {
    ...targetReq,
    status,
    reviewedBy,
    reviewedAt: nowIso
  };

  try {
    await setDoc(doc(db, 'academicChangeRequests', requestId), updatedReq, { merge: true });
  } catch (err) {
    console.warn('Firestore reviewAcademicChangeRequest fallback:', err);
  }

  saveLocalChangeRequests(requests.map(r => r.id === requestId ? updatedReq : r));

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
