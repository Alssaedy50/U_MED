/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Core Domain Types and Data Contracts
 * Yemen-First Medical Education Platform
 */

// ---------------------------------------------------------------------------
// 1. Roles & Permissions
// ---------------------------------------------------------------------------

export type UserRole = 'platform_owner' | 'university_admin' | 'student';

export interface UserRoleDoc {
  uid: string;
  role: UserRole;
  email: string;
  assignedUniversityId?: string; // Present when role === 'university_admin'
  assignedAt: string; // ISO 8601
  assignedBy: string; // uid or 'SYSTEM_BOOTSTRAP'
}

export interface UserProfile {
  uid: string;
  email: string;
  displayNameArabic: string;
  displayNameEnglish?: string;
  phone?: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 2. Academic Hierarchy
// ---------------------------------------------------------------------------

export interface Country {
  id: string; // e.g. 'YE'
  code: string; // 'YE'
  nameArabic: string; // 'اليمن'
  nameEnglish: string; // 'Yemen'
  dialCode: string; // '+967'
  isActive: boolean;
  createdAt: string;
}

export type UniversityType = 'public' | 'private';

export interface University {
  id: string; // e.g. 'univ-dar-al-salam'
  countryId: string; // 'YE'
  nameArabic: string; // 'جامعة دار السلام الدولية للعلوم والتكنولوجيا'
  nameEnglish: string; // 'Dar Al Salam International University'
  type: UniversityType; // 'private'
  cityArabic: string; // 'صنعاء'
  logoUrl?: string;
  websiteUrl?: string;
  enrollmentPolicy: 'immediate' | 'approval_required';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface College {
  id: string; // e.g. 'col-medicine'
  universityId: string;
  nameArabic: string; // 'كلية الطب البشري'
  nameEnglish: string; // 'College of Human Medicine'
  code?: string;
  isActive: boolean;
  createdAt: string;
}

export type StudySystem = 'block' | 'semester' | 'traditional';

export interface AcademicProgram {
  id: string; // e.g. 'prog-mbbs'
  collegeId: string;
  universityId: string;
  nameArabic: string; // 'بكالوريوس الطب والجراحة العامة'
  nameEnglish: string; // 'Bachelor of Medicine, Bachelor of Surgery (MBBS)'
  degree: 'bachelor' | 'diploma' | 'postgraduate';
  studySystem: StudySystem;
  totalRegularLevels: number; // e.g. 7
  hasInternship: boolean; // true
  internshipDurationMonths?: number; // e.g. 12
  isActive: boolean;
  createdAt: string;
}

export interface CurriculumVersion {
  id: string; // e.g. 'cur-dar-2024'
  programId: string;
  universityId: string;
  versionName: string; // '2024-BLOCKS'
  isCurrent: boolean;
  effectiveFrom: string; // '2024-09-01'
  notes?: string;
  createdAt: string;
}

export type StageType = 'regular' | 'internship';

export interface StudyLevel {
  id: string; // e.g. 'lvl-1', 'lvl-7', 'lvl-intern'
  curriculumVersionId: string;
  programId: string;
  universityId: string;
  order: number; // 1 to 7 for regular; 8 for internship
  stageType: StageType;
  titleArabic: string; // 'المستوى الأول', ..., 'سنة الامتياز (تدريب سريري)'
  titleEnglish: string; // 'Level 1', ..., 'Internship'
  durationMonths?: number; // 12 for internship
  isActive: boolean;
}

export type PeriodType = 'block' | 'semester' | 'rotation' | 'module';

export interface StudyPeriod {
  id: string; // e.g. 'period-b1-cardio'
  studyLevelId: string;
  curriculumVersionId: string;
  universityId: string;
  periodType: PeriodType;
  titleArabic: string;
  titleEnglish?: string;
  code?: string;
  order: number;
  isActive: boolean;
}

export interface CourseOffering {
  id: string;
  studyPeriodId?: string;
  studyLevelId: string;
  programId?: string;
  universityId: string;
  curriculumVersionId?: string;
  code: string;
  titleArabic: string;
  titleEnglish?: string;
  creditHours?: number;
  isActive: boolean;
}

export type SectionType = 'theoretical' | 'practical' | 'general';

export interface CourseSection {
  id: string;
  courseOfferingId: string;
  universityId: string;
  sectionType: SectionType;
  titleArabic: string;
  titleEnglish?: string;
  capacity?: number;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// 3. Student Enrollment & Academic Identity
// ---------------------------------------------------------------------------

export type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface StudentEnrollment {
  id: string;
  uid: string;
  studentEmail?: string;
  studentNameArabic?: string;
  studentNameEnglish?: string;
  academicStudentNumber?: string;
  universityId: string;
  collegeId: string;
  programId: string;
  curriculumVersionId: string;
  currentStudyLevelId: string;
  academicYear: string;
  enrollmentStatus?: EnrollmentStatus;
  status?: EnrollmentStatus;
  requestedAt?: string; // ISO 8601
  enrolledAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface AcademicChangeRequest {
  id: string;
  uid: string;
  universityId: string;
  enrollmentId?: string;
  requestType?: 'level_transfer' | 'data_correction' | 'leave_of_absence';
  targetStudyLevelId?: string;
  requestedLevelId?: string;
  requestedAcademicNumber?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt?: string;
  createdAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

// ---------------------------------------------------------------------------
// 4. Educational Content Library
// ---------------------------------------------------------------------------

export type ResourceType = 'pdf' | 'image' | 'audio' | 'link' | 'video_link';

export interface EducationalResource {
  id: string;
  title: string;
  description?: string;
  resourceType: ResourceType;
  url: string; // umed-cloud://<fileId>, Google Drive viewer link, verified Direct URL, or data URL
  fileSizeLabel?: string; // e.g. '2.4 MB' for low-bandwidth warning
  fileName?: string;
  mimeType?: string;
  chunkCount?: number;
  storageProvider?: 'firestore_cloud' | 'external_url';
  universityId: string;
  programId: string;
  curriculumVersionId: string;
  studyLevelId: string;
  studyPeriodId?: string;
  courseOfferingId?: string;
  sectionType: 'theoretical' | 'practical' | 'general';
  status: 'draft' | 'published' | 'archived';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 5. Examinations & Academic Competitions Engine
// ---------------------------------------------------------------------------

export type AssessmentType = 'exam' | 'competition';
export type ResultReleasePolicy = 'immediate' | 'after_close' | 'manual';
export type AssessmentStatus = 'draft' | 'published' | 'closed';

export interface QuestionBank {
  id: string;
  titleArabic: string;
  titleEnglish?: string;
  descriptionArabic?: string;
  universityId: string;
  programId?: string;
  studyLevelId?: string;
  courseOfferingId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface QuestionOption {
  id: string; // e.g. 'opt-a'
  textArabic: string;
  textEnglish?: string;
}

export interface QuestionItemFull {
  id: string;
  bankId: string;
  stemArabic: string;
  stemEnglish?: string;
  imageUrl?: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanationArabic?: string;
  explanationEnglish?: string;
  points: number;
  createdBy: string;
  createdAt: string;
}

/**
 * Public Question (Sent to student during test - NEVER contains correctOptionId)
 */
export interface AssessmentQuestionPublic {
  id: string;
  bankId?: string;
  stemArabic: string;
  stemEnglish?: string;
  imageUrl?: string;
  options: QuestionOption[];
  points: number;
}

/**
 * Protected Question Answer Key (Kept server-side / restricted collection)
 */
export interface QuestionAnswerKey {
  questionId: string;
  assessmentId: string;
  correctOptionId: string;
  explanationArabic?: string;
  explanationEnglish?: string;
  points: number;
}

export interface Assessment {
  id: string;
  assessmentType: AssessmentType;
  titleArabic: string;
  titleEnglish?: string;
  descriptionArabic?: string;
  universityId: string;
  programId: string;
  studyLevelId: string;
  courseOfferingId?: string;
  durationMinutes: number; // e.g. 45
  maxAttempts: number; // usually 1 for exams, 1 or more for competitions
  opensAt: string; // ISO 8601
  closesAt: string; // ISO 8601
  resultReleasePolicy: ResultReleasePolicy;
  status: AssessmentStatus;
  questionIds: string[];
  totalPoints: number;
  shuffleQuestions?: boolean;
  createdBy: string;
  createdAt: string;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'expired' | 'scored';

export interface AssessmentAttempt {
  id: string;
  assessmentId: string;
  uid: string;
  startedAt: string; // Server timestamp
  expiresAt: string; // min(closesAt, startedAt + duration)
  submittedAt?: string;
  status: AttemptStatus;
  answers: Record<string, string>; // questionId -> selectedOptionId (progressively saved)
  lastSavedAt: string;
  attemptNumber: number;
}

export interface AssessmentResult {
  id: string;
  attemptId: string;
  assessmentId: string;
  uid: string;
  studentNameArabic: string;
  academicStudentNumber?: string;
  score: number;
  totalPoints: number;
  percentage: number;
  submittedAt: string;
  gradedAt: string;
  isReleased: boolean;
  releasedAt?: string;
}

// ---------------------------------------------------------------------------
// 6. Security, Auditing & Administration
// ---------------------------------------------------------------------------

export type AuditAction = 
  | 'OWNER_PROVISIONED'
  | 'ROLE_ASSIGNED'
  | 'ROLE_REVOKED'
  | 'ENROLLMENT_APPROVED'
  | 'ENROLLMENT_REJECTED'
  | 'ASSESSMENT_SCORED'
  | 'RESULTS_RELEASED'
  | 'SEED_LOADED'
  | 'ACADEMIC_STRUCTURE_UPDATED'
  | 'RESOURCE_CREATED'
  | 'RESOURCE_UPDATED'
  | 'RESOURCE_DELETED';

export interface AuditLog {
  id: string;
  action: AuditAction;
  performedBy: string; // uid or 'SERVER_BOOTSTRAP'
  targetUid?: string;
  targetEmail?: string;
  targetId?: string;
  universityId?: string;
  details: string | Record<string, any>;
  timestamp: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// 7. Dar Al Salam University Initial Demonstration Seed Constants
// ---------------------------------------------------------------------------

export const DAR_AL_SALAM_SEED = {
  country: {
    id: 'YE',
    code: 'YE',
    nameArabic: 'الجمهورية اليمنية',
    nameEnglish: 'Republic of Yemen',
    dialCode: '+967',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
  },
  university: {
    id: 'univ-dar-al-salam',
    countryId: 'YE',
    nameArabic: 'جامعة دار السلام الدولية للعلوم والتكنولوجيا',
    nameEnglish: 'Dar Al Salam International University for Science and Technology',
    type: 'private' as UniversityType,
    cityArabic: 'صنعاء',
    enrollmentPolicy: 'approval_required' as const,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  college: {
    id: 'col-medicine-dar',
    universityId: 'univ-dar-al-salam',
    nameArabic: 'كلية الطب البشري',
    nameEnglish: 'College of Human Medicine',
    code: 'MED',
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
  },
  program: {
    id: 'prog-mbbs',
    collegeId: 'col-medicine-dar',
    universityId: 'univ-dar-al-salam',
    nameArabic: 'بكالوريوس الطب والجراحة العامة (MBBS)',
    nameEnglish: 'Bachelor of Medicine and Bachelor of Surgery',
    degree: 'bachelor' as const,
    studySystem: 'block' as StudySystem,
    totalRegularLevels: 7,
    hasInternship: true,
    internshipDurationMonths: 12,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
  },
  curriculumVersion: {
    id: 'cur-dar-2024',
    programId: 'prog-mbbs',
    universityId: 'univ-dar-al-salam',
    versionName: '2024-BLOCKS',
    isCurrent: true,
    effectiveFrom: '2024-09-01',
    notes: 'نظام البلوكات المتكامل بـ 7 مستويات اعتيادية + سنة الامتياز',
    createdAt: '2024-01-01T00:00:00Z',
  },
  // 7 Regular Study Levels + Distinct Internship Stage
  studyLevels: [
    {
      id: 'lvl-1',
      curriculumVersionId: 'cur-dar-2024',
      programId: 'prog-mbbs',
      universityId: 'univ-dar-al-salam',
      order: 1,
      stageType: 'regular' as StageType,
      titleArabic: 'المستوى الأول',
      titleEnglish: 'Level 1 (Foundation)',
      isActive: true,
    },
    {
      id: 'lvl-2',
      curriculumVersionId: 'cur-dar-2024',
      programId: 'prog-mbbs',
      universityId: 'univ-dar-al-salam',
      order: 2,
      stageType: 'regular' as StageType,
      titleArabic: 'المستوى الثاني',
      titleEnglish: 'Level 2 (Basic Medical Sciences I)',
      isActive: true,
    },
    {
      id: 'lvl-3',
      curriculumVersionId: 'cur-dar-2024',
      programId: 'prog-mbbs',
      universityId: 'univ-dar-al-salam',
      order: 3,
      stageType: 'regular' as StageType,
      titleArabic: 'المستوى الثالث',
      titleEnglish: 'Level 3 (Basic Medical Sciences II)',
      isActive: true,
    },
    {
      id: 'lvl-4',
      curriculumVersionId: 'cur-dar-2024',
      programId: 'prog-mbbs',
      universityId: 'univ-dar-al-salam',
      order: 4,
      stageType: 'regular' as StageType,
      titleArabic: 'المستوى الرابع',
      titleEnglish: 'Level 4 (System Blocks I)',
      isActive: true,
    },
    {
      id: 'lvl-5',
      curriculumVersionId: 'cur-dar-2024',
      programId: 'prog-mbbs',
      universityId: 'univ-dar-al-salam',
      order: 5,
      stageType: 'regular' as StageType,
      titleArabic: 'المستوى الخامس',
      titleEnglish: 'Level 5 (System Blocks II & Clinical Skills)',
      isActive: true,
    },
    {
      id: 'lvl-6',
      curriculumVersionId: 'cur-dar-2024',
      programId: 'prog-mbbs',
      universityId: 'univ-dar-al-salam',
      order: 6,
      stageType: 'regular' as StageType,
      titleArabic: 'المستوى السادس',
      titleEnglish: 'Level 6 (Junior Clinical Clerkships)',
      isActive: true,
    },
    {
      id: 'lvl-7',
      curriculumVersionId: 'cur-dar-2024',
      programId: 'prog-mbbs',
      universityId: 'univ-dar-al-salam',
      order: 7,
      stageType: 'regular' as StageType,
      titleArabic: 'المستوى السابع',
      titleEnglish: 'Level 7 (Senior Clinical Practice & Final Rotations)',
      isActive: true,
    },
    {
      id: 'lvl-internship',
      curriculumVersionId: 'cur-dar-2024',
      programId: 'prog-mbbs',
      universityId: 'univ-dar-al-salam',
      order: 8,
      stageType: 'internship' as StageType,
      titleArabic: 'سنة الامتياز (التدريب السريري التكميلي)',
      titleEnglish: 'Internship Year (Clinical Rotation Program)',
      durationMonths: 12,
      isActive: true,
    },
  ],
  sampleBlocks: [
    {
      id: 'blk-cvs',
      levelId: 'lvl-4',
      periodType: 'block' as const,
      titleArabic: 'بلوك الجهاز القلبي الوعائي',
      titleEnglish: 'Cardiovascular System Block',
      code: 'CVS-401',
      order: 1,
    },
    {
      id: 'blk-rs',
      levelId: 'lvl-4',
      periodType: 'block' as const,
      titleArabic: 'بلوك الجهاز التنفسي',
      titleEnglish: 'Respiratory System Block',
      code: 'RESP-402',
      order: 2,
    },
  ],
};
