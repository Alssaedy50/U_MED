/**
 * UMED domain models
 *
 * Shared contracts for the academic hierarchy, student access, learning resources,
 * and assessment engine. These interfaces intentionally preserve additional fields
 * so existing Firestore documents remain forward-compatible.
 *
 * IMPORTANT: Keep document IDs stable; they are referenced by existing records.
 */

export type StageType = 'regular' | 'internship' | string;
export type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | string;
export type ResourceType = 'pdf' | 'document' | 'video' | 'image' | 'link' | 'presentation' | 'other' | string;
export type AssessmentType = 'exam' | 'competition' | string;
export type AssessmentStatus = 'draft' | 'published' | 'closed' | string;
export type ResultReleasePolicy = 'immediate' | 'after_close' | 'manual' | string;
export type UserRole = string;

export interface Country {
  id: string;
  nameArabic: string;
  nameEnglish?: string;
  code?: string;
  [key: string]: any;
}
export interface University {
  id: string;
  countryId: string;
  nameArabic: string;
  nameEnglish?: string;
  type?: 'public' | 'private' | string;
  cityArabic?: string;
  enrollmentPolicy?: 'immediate' | 'approval_required' | string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}
export interface College {
  id: string;
  universityId: string;
  nameArabic: string;
  nameEnglish?: string;
  isActive?: boolean;
  [key: string]: any;
}
export interface AcademicProgram {
  id: string;
  universityId: string;
  collegeId: string;
  nameArabic: string;
  nameEnglish?: string;
  degreeType?: string;
  academicSystem?: string;
  isActive?: boolean;
  [key: string]: any;
}
export interface CurriculumVersion {
  id: string;
  programId: string;
  universityId: string;
  titleArabic?: string;
  titleEnglish?: string;
  code?: string;
  isActive?: boolean;
  [key: string]: any;
}
export interface StudyLevel {
  id: string;
  curriculumVersionId: string;
  programId: string;
  universityId: string;
  order: number;
  stageType: StageType;
  titleArabic: string;
  titleEnglish?: string;
  durationMonths?: number;
  isActive: boolean;
  [key: string]: any;
}
export interface StudyPeriod {
  id: string;
  studyLevelId: string;
  curriculumVersionId: string;
  universityId: string;
  periodType?: string;
  titleArabic: string;
  titleEnglish?: string;
  code?: string;
  order: number;
  isActive: boolean;
  [key: string]: any;
}
export interface CourseOffering {
  id: string;
  studyPeriodId?: string;
  studyLevelId: string;
  curriculumVersionId?: string;
  universityId: string;
  titleArabic: string;
  titleEnglish?: string;
  code?: string;
  creditHours?: number;
  isActive: boolean;
  [key: string]: any;
}
export interface CourseSection {
  id: string;
  courseOfferingId?: string;
  titleArabic?: string;
  titleEnglish?: string;
  [key: string]: any;
}
export interface StudentEnrollment {
  id: string;
  uid: string;
  universityId: string;
  collegeId?: string;
  programId: string;
  curriculumVersionId?: string;
  currentStudyLevelId?: string;
  academicStudentNumber?: string;
  academicYear?: string;
  status: EnrollmentStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  enrolledAt?: string;
  [key: string]: any;
}
export type Enrollment = StudentEnrollment;

export interface EducationalResource {
  id: string;
  universityId: string;
  titleArabic: string;
  titleEnglish?: string;
  descriptionArabic?: string;
  resourceType?: ResourceType;
  type?: ResourceType;
  url?: string;
  fileUrl?: string;
  studyLevelId?: string;
  studyPeriodId?: string;
  courseOfferingId?: string;
  isActive?: boolean;
  createdAt?: string;
  [key: string]: any;
}
export interface UserRoleDoc {
  uid?: string;
  userId?: string;
  email?: string;
  role: UserRole;
  universityId?: string;
  collegeId?: string;
  programId?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}
export interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  universityId?: string;
  [key: string]: any;
}
export interface AuditLog {
  id?: string;
  action?: string;
  actorUid?: string;
  actorEmail?: string;
  performedBy?: string;
  targetId?: string;
  targetType?: string;
  details?: string | Record<string, any>;
  createdAt?: string;
  timestamp?: string;
  [key: string]: any;
}
export interface QuestionOption {
  id: string;
  textArabic?: string;
  textEnglish?: string;
  text?: string;
  [key: string]: any;
}
export interface QuestionBank {
  id: string;
  titleArabic: string;
  titleEnglish?: string;
  descriptionArabic?: string;
  universityId: string;
  programId?: string;
  studyLevelId?: string;
  courseOfferingId?: string;
  createdAt?: string;
  [key: string]: any;
}
export interface QuestionItemFull {
  id: string;
  bankId?: string;
  assessmentId?: string;
  stemArabic?: string;
  stemEnglish?: string;
  options: QuestionOption[];
  correctOptionId?: string;
  explanationArabic?: string;
  points?: number;
  createdBy?: string;
  createdAt?: string;
  [key: string]: any;
}
export interface AssessmentQuestionPublic {
  id: string;
  assessmentId?: string;
  stemArabic?: string;
  stemEnglish?: string;
  options?: QuestionOption[];
  points?: number;
  [key: string]: any;
}
export interface QuestionAnswerKey {
  questionId: string;
  assessmentId?: string;
  correctOptionId: string;
  explanationArabic?: string;
  points?: number;
  [key: string]: any;
}
export interface Assessment {
  id: string;
  universityId?: string;
  programId?: string;
  studyLevelId?: string;
  courseOfferingId?: string;
  assessmentType: AssessmentType;
  titleArabic: string;
  titleEnglish?: string;
  durationMinutes?: number;
  maxAttempts?: number;
  opensAt?: string;
  closesAt?: string;
  resultReleasePolicy?: ResultReleasePolicy;
  status: AssessmentStatus;
  [key: string]: any;
}
export interface AssessmentAttempt {
  id: string;
  assessmentId: string;
  uid: string;
  startedAt?: string;
  expiresAt?: string;
  answers?: Record<string, string>;
  status?: string;
  [key: string]: any;
}
export interface AssessmentResult {
  id: string;
  assessmentId: string;
  uid?: string;
  attemptId?: string;
  score?: number;
  maxScore?: number;
  percentage?: number;
  submittedAt?: string;
  releasedAt?: string;
  [key: string]: any;
}

/**
 * Stable demo/default structure used when Firestore has not been populated yet.
 * IDs match the existing services, seed loader, and documentation.
 */
export const DAR_AL_SALAM_SEED = {
  country: {
    id: 'YE',
    code: 'YE',
    nameArabic: 'اليمن',
    nameEnglish: 'Yemen',
    isActive: true
  } satisfies Country,
  university: {
    id: 'univ-dar-al-salam',
    countryId: 'YE',
    nameArabic: 'جامعة دار السلام الدولية للعلوم والتكنولوجيا',
    nameEnglish: 'Dar Al Salam International University for Science and Technology',
    type: 'private',
    cityArabic: 'صنعاء',
    enrollmentPolicy: 'approval_required',
    isActive: true
  } satisfies University,
  college: {
    id: 'col-human-medicine',
    universityId: 'univ-dar-al-salam',
    nameArabic: 'كلية الطب البشري',
    nameEnglish: 'College of Human Medicine',
    isActive: true
  } satisfies College,
  program: {
    id: 'prog-mbbs',
    universityId: 'univ-dar-al-salam',
    collegeId: 'col-human-medicine',
    nameArabic: 'بكالوريوس الطب والجراحة العامة',
    nameEnglish: 'Bachelor of Medicine and Bachelor of Surgery',
    degreeType: 'MBBS',
    academicSystem: 'blocks',
    isActive: true
  } satisfies AcademicProgram,
  curriculumVersion: {
    id: 'cur-dar-2024',
    universityId: 'univ-dar-al-salam',
    programId: 'prog-mbbs',
    titleArabic: 'الخطة الدراسية 2024 - نظام البلوكات',
    titleEnglish: '2024 Curriculum - Block System',
    code: '2024-BLOCKS',
    isActive: true
  } satisfies CurriculumVersion,
  studyLevels: [
    { id: 'lvl-1', curriculumVersionId: 'cur-dar-2024', programId: 'prog-mbbs', universityId: 'univ-dar-al-salam', order: 1, stageType: 'regular', titleArabic: 'المستوى الأول', titleEnglish: 'Level 1', isActive: true },
    { id: 'lvl-2', curriculumVersionId: 'cur-dar-2024', programId: 'prog-mbbs', universityId: 'univ-dar-al-salam', order: 2, stageType: 'regular', titleArabic: 'المستوى الثاني', titleEnglish: 'Level 2', isActive: true },
    { id: 'lvl-3', curriculumVersionId: 'cur-dar-2024', programId: 'prog-mbbs', universityId: 'univ-dar-al-salam', order: 3, stageType: 'regular', titleArabic: 'المستوى الثالث', titleEnglish: 'Level 3', isActive: true },
    { id: 'lvl-4', curriculumVersionId: 'cur-dar-2024', programId: 'prog-mbbs', universityId: 'univ-dar-al-salam', order: 4, stageType: 'regular', titleArabic: 'المستوى الرابع', titleEnglish: 'Level 4', isActive: true },
    { id: 'lvl-5', curriculumVersionId: 'cur-dar-2024', programId: 'prog-mbbs', universityId: 'univ-dar-al-salam', order: 5, stageType: 'regular', titleArabic: 'المستوى الخامس', titleEnglish: 'Level 5', isActive: true },
    { id: 'lvl-6', curriculumVersionId: 'cur-dar-2024', programId: 'prog-mbbs', universityId: 'univ-dar-al-salam', order: 6, stageType: 'regular', titleArabic: 'المستوى السادس', titleEnglish: 'Level 6', isActive: true },
    { id: 'lvl-7', curriculumVersionId: 'cur-dar-2024', programId: 'prog-mbbs', universityId: 'univ-dar-al-salam', order: 7, stageType: 'regular', titleArabic: 'المستوى السابع', titleEnglish: 'Level 7', isActive: true },
    { id: 'lvl-internship', curriculumVersionId: 'cur-dar-2024', programId: 'prog-mbbs', universityId: 'univ-dar-al-salam', order: 8, stageType: 'internship', titleArabic: 'سنة الامتياز', titleEnglish: 'Internship Year', durationMonths: 12, isActive: true }
  ] satisfies StudyLevel[],
  sampleBlocks: [
    { id: 'blk-cvs', studyLevelId: 'lvl-4', curriculumVersionId: 'cur-dar-2024', universityId: 'univ-dar-al-salam', periodType: 'block', titleArabic: 'بلوك القلب والأوعية الدموية', titleEnglish: 'Cardiovascular System Block', code: 'CVS', order: 1, isActive: true },
    { id: 'blk-rs', studyLevelId: 'lvl-4', curriculumVersionId: 'cur-dar-2024', universityId: 'univ-dar-al-salam', periodType: 'block', titleArabic: 'بلوك الجهاز التنفسي', titleEnglish: 'Respiratory System Block', code: 'RS', order: 2, isActive: true }
  ] satisfies StudyPeriod[]
};
