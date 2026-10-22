/**
 * Student enrollment and academic-change request service.
 *
 * Uses the established Firestore collections documented by UMED:
 * studentEnrollments and academicChangeRequests. Authorization must also be
 * enforced by Firestore Security Rules; UI visibility is not an access control.
 */
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  updateDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import type { StudentEnrollment, EnrollmentStatus } from '../types/umed.ts';

export async function fetchStudentEnrollment(uid: string): Promise<StudentEnrollment | null> {
  if (!uid) return null;
  const q = query(collection(db, 'studentEnrollments'), where('uid', '==', uid));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  // Prefer an approved enrollment when a student has multiple historical records.
  const enrollments = snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data()
  })) as StudentEnrollment[];
  return enrollments.find((item) => item.status === 'approved')
    ?? enrollments.find((item) => item.status === 'pending')
    ?? enrollments[0]
    ?? null;
}

export async function fetchEnrollmentsForAdmin(
  universityId: string
): Promise<StudentEnrollment[]> {
  if (!universityId) return [];
  const q = query(
    collection(db, 'studentEnrollments'),
    where('universityId', '==', universityId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data()
  })) as StudentEnrollment[];
}

export async function updateEnrollmentStatus(
  enrollmentId: string,
  status: EnrollmentStatus,
  reviewedBy: string,
  rejectionReason?: string
): Promise<void> {
  if (!enrollmentId) throw new Error('Enrollment ID is required.');
  if (!reviewedBy) throw new Error('Reviewer identity is required.');

  const patch: Record<string, unknown> = {
    status,
    reviewedBy,
    reviewedAt: serverTimestamp()
  };
  if (status === 'rejected') {
    patch.rejectionReason = rejectionReason?.trim() || '';
  } else {
    patch.rejectionReason = '';
  }

  await updateDoc(doc(db, 'studentEnrollments', enrollmentId), patch);
}

export interface AcademicChangeRequestInput {
  uid: string;
  enrollmentId: string;
  universityId: string;
  requestedLevelId?: string;
  requestedAcademicNumber?: string;
  reason: string;
}

export async function submitAcademicChangeRequest(
  input: AcademicChangeRequestInput
): Promise<void> {
  if (!input.uid || !input.enrollmentId || !input.universityId) {
    throw new Error('Required enrollment details are missing.');
  }
  if (!input.reason.trim()) {
    throw new Error('Please provide a reason for the requested change.');
  }

  const requestRef = doc(collection(db, 'academicChangeRequests'));
  await setDoc(requestRef, {
    id: requestRef.id,
    uid: input.uid,
    enrollmentId: input.enrollmentId,
    universityId: input.universityId,
    requestedLevelId: input.requestedLevelId ?? null,
    requestedAcademicNumber: input.requestedAcademicNumber?.trim() ?? null,
    reason: input.reason.trim(),
    status: 'pending',
    createdAt: serverTimestamp()
  });
}
