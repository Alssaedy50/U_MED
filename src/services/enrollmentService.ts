/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Student Enrollment & Profile Service
 * Manages Registration Cascading, Approvals, and Academic Change Requests
 */

import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { 
  StudentEnrollment, 
  EnrollmentStatus, 
  AcademicChangeRequest 
} from '../types/umed.ts';

// ---------------------------------------------------------------------------
// 1. Student Enrollment Operations
// ---------------------------------------------------------------------------

export async function fetchStudentEnrollment(uid: string): Promise<StudentEnrollment | null> {
  try {
    const q = query(collection(db, 'studentEnrollments'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data() as StudentEnrollment;
    }
  } catch (err) {
    console.warn('Firestore fetchStudentEnrollment error:', err);
  }

  // Fallback to local storage cache if network is intermittent
  try {
    const cached = localStorage.getItem(`umed_enrollment_${uid}`);
    if (cached) return JSON.parse(cached);
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
  } catch (e) {}

  return enrollment;
}

// ---------------------------------------------------------------------------
// 2. Admin Enrollment Queue Operations
// ---------------------------------------------------------------------------

export async function fetchEnrollmentsForAdmin(universityId?: string): Promise<StudentEnrollment[]> {
  try {
    let q = query(collection(db, 'studentEnrollments'));
    if (universityId) {
      q = query(collection(db, 'studentEnrollments'), where('universityId', '==', universityId));
    }
    const snap = await getDocs(q);
    const list: StudentEnrollment[] = [];
    snap.forEach((d) => list.push(d.data() as StudentEnrollment));
    if (list.length > 0) return list;
  } catch (err) {
    console.warn('Firestore fetchEnrollmentsForAdmin error:', err);
  }

  // Fallback demo list if database has no records yet
  return [
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
}

export async function updateEnrollmentStatus(
  enrollmentId: string, 
  status: EnrollmentStatus, 
  reviewedBy: string, 
  rejectionReason?: string
): Promise<void> {
  const payload = {
    status,
    reviewedBy,
    reviewedAt: new Date().toISOString(),
    rejectionReason: rejectionReason || null,
    updatedAt: new Date().toISOString()
  };

  try {
    await updateDoc(doc(db, 'studentEnrollments', enrollmentId), payload);
  } catch (err) {
    console.warn('Could not update enrollment directly, reporting to server API:', err);
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

// Aliases for compatibility
export const getEnrollmentByUserId = fetchStudentEnrollment;
export const submitEnrollment = submitEnrollmentRequest;
export const getUniversityEnrollments = fetchEnrollmentsForAdmin;
export const approveEnrollment = (id: string, reviewer: string) => updateEnrollmentStatus(id, 'approved', reviewer);
export const rejectEnrollment = (id: string, reviewer: string, reason?: string) => updateEnrollmentStatus(id, 'rejected', reviewer, reason);

// ---------------------------------------------------------------------------
// 3. Academic Change Requests
// ---------------------------------------------------------------------------

export async function submitAcademicChangeRequest(params: {
  uid: string;
  enrollmentId: string;
  universityId: string;
  requestedLevelId?: string;
  requestedAcademicNumber?: string;
  reason: string;
}): Promise<AcademicChangeRequest> {
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

  return changeReq;
}
