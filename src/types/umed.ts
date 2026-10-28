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

export type UserRole =
  | 'platform_owner'
  | 'university_admin'
  | 'batch_rep'
  | 'department_head'
  | 'student';

export interface UserRoleDoc {
  uid: string;
  role: UserRole;
  email: string;
  username?: string;
  displayNameArabic?: string;
  phone?: string;
  academicStudentNumber?: string;
  assignedUniversityId?: string; // Present for university_admin, batch_rep, department_head
  assignedStudyLevelId?: string; // Present for batch_rep, department_head (isolates to specific batch/level)
  assignedCourseId?: string; // Optional specific course for department_head
  departmentTitle?: string; // e.g., 'قسم الباطنة العامة' or 'رئيس مادة التشريح'
  assignedAt: string; // ISO 8601
  assignedBy: string; // uid, email, or 'SYSTEM_BOOTSTRAP'
  assignedByRole?: UserRole;
}

export type LeaderboardNameMode =
  | 'full_name'
  | 'custom_username'
  | 'abbreviated'
  | 'anonymous_code';

export interface UserProfile {
  uid: string;
  email: string;
  displayNameArabic: string;
  displayNameEnglish?: string;
  username?: string;
  usernameSkeleton?: string;
  leaderboardNameMode?: LeaderboardNameMode;
  phone?: string;
  academicStudentNumber?: string;
  avatarUrl?: string;
  universityId?: string;
  universityNameArabic?: string;
  specialtyArabic?: string;
  studyLevelId?: string;
  deviceId?: string;
  deviceHardwareHash?: string;
  registrationMethod?: 'username' | 'email' | 'phone' | 'google';
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  isPrimaryOwner?: boolean;
  ownerLinkedEmails?: string[];
  emailVerified?: boolean;
  phoneVerified?: boolean;
  isVerified?: boolean;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrimaryOwnerIdentityConfig {
  primaryEmail: string;
  secondaryEmail: string;
  emails: string[];
  phone: string;
  username?: string;
  displayNameArabic: string;
  academicStudentNumber: string;
  ownerUid?: string;
  updatedAt: string;
}

export interface UniqueIdentifierRecord {
  id: string; // e.g. 'username_...', 'skeleton_...', 'device_...', 'email_...', 'phone_...', 'acad_...'
  type: 'username' | 'username_skeleton' | 'device' | 'email' | 'phone' | 'academic_id';
  value: string;
  normalizedValue: string;
  uid: string;
  username?: string;
  universityId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationChallenge {
  uid: string;
  verificationMethod?: 'email' | 'phone' | 'both';
  email?: string;
  phone?: string;
  emailCode?: string;
  phoneCode?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  firebaseEmailLinkSent?: boolean;
  expiresAt: string;
  createdAt: string;
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
  isArchived?: boolean;
  archivedAt?: string;
}

export interface CourseOffering {
  id: string;
  studyPeriodId?: string;
  studyLevelId: string;
  programId?: string;
  universityId: string;
  curriculumVersionId?: string;
  code: string;
  isArchived?: boolean;
  archivedAt?: string;
  titleArabic: string;
  titleEnglish?: string;
  creditHours?: number;
  instructorId?: string;
  instructorNameArabic?: string;
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
  studentPhone?: string;
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
// 4. Educational Content Library & Course Instructors & Batch Notifications
// ---------------------------------------------------------------------------

export type ResourceType = 'pdf' | 'image' | 'video' | 'audio' | 'link' | 'video_link';

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

export type TeachingType = 'theoretical' | 'practical' | 'both';

export interface CourseInstructor {
  id: string;
  universityId: string;
  studyLevelId: string;
  studyPeriodId?: string;
  courseOfferingId: string;
  courseTitleArabic?: string;
  instructorNameArabic: string;
  academicTitle: string; // e.g. 'أ.د.', 'أ.م.د.', 'د.', 'معيد / مشرف عملي'
  teachingType: TeachingType;
  specialization?: string;
  contactInfo?: string;
  officeHours?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type NotificationCategory =
  | 'lecture'
  | 'exam'
  | 'practical'
  | 'urgent'
  | 'data_shared'
  | 'general';

export interface BatchNotification {
  id: string;
  universityId: string;
  studyLevelId: string; // Specific batch/level (e.g. 'lvl-4') or 'ALL' for university-wide
  courseOfferingId?: string;
  title: string;
  message: string;
  category: NotificationCategory;
  attachmentUrl?: string;
  attachmentType?: ResourceType;
  attachmentLabel?: string;
  authorUid: string;
  authorNameArabic: string;
  authorRole: UserRole;
  isPinned?: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 5. Examinations & Academic Competitions Engine
// ---------------------------------------------------------------------------

export type AssessmentType = 'exam' | 'competition';
export type AssessmentLanguage = 'ar' | 'en' | 'bilingual';
export type QuestionType = 'mcq' | 'true_false' | 'essay' | 'fill_blank';
export type BankQuestionTypeMode = 'hybrid' | 'mcq' | 'true_false' | 'essay' | 'fill_blank';
export type ResultReleasePolicy = 'immediate' | 'after_close' | 'manual';
export type AssessmentStatus = 'draft' | 'published' | 'closed';

export interface UserAcademicContext {
  universityId: string;
  universityNameArabic?: string;
  universityName?: string;
  collegeId: string;
  collegeNameArabic?: string;
  collegeName?: string;
  programId: string;
  programNameArabic?: string;
  programName?: string;
  studyLevelId: string;
  studyLevelNameArabic?: string;
  studyLevelName?: string;
  studyPeriodId?: string;
  studyPeriodNameArabic?: string;
  studyPeriodName?: string;
  blockName?: string;
  courseOfferingId?: string;
  courseNameArabic?: string;
  strictScope: boolean;
  updatedAt: string;
}

export interface QuestionBank {
  id: string;
  titleArabic: string;
  titleEnglish?: string;
  descriptionArabic?: string;
  language?: AssessmentLanguage; // 'ar' | 'en' | 'bilingual'
  questionTypeMode?: BankQuestionTypeMode; // 'hybrid' | 'mcq' | 'true_false' | 'essay' | 'fill_blank'
  universityId: string;
  collegeId?: string;
  programId?: string;
  studyLevelId?: string;
  studyPeriodId?: string;
  blockName?: string;
  courseOfferingId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface QuestionOption {
  id: string; // e.g. 'opt-a', 'opt-b', 'opt-c', 'opt-d', 'opt-e', etc.
  textArabic: string;
  textEnglish?: string;
  explanationArabic?: string; // تعليل الخيار (لماذا هو صحيح أو لماذا هو خاطئ)
  explanationEnglish?: string;
  isCorrect?: boolean;
}

export type QuestionSyncStatus = 'synced' | 'pending_upload' | 'pending_sync' | 'sync_error' | 'conflict' | 'error';

export interface QuestionItemFull {
  id: string;
  bankId: string;
  questionType?: QuestionType; // 'mcq' | 'true_false' | 'essay'
  language?: AssessmentLanguage; // 'ar' | 'en' | 'bilingual'
  stemArabic: string;
  stemEnglish?: string;
  imageUrl?: string;
  options: QuestionOption[];
  correctOptionId: string;
  modelAnswerArabic?: string; // الإجابة النموذجية للأسئلة المقالية
  modelAnswerEnglish?: string;
  explanationArabic?: string; // التعليل العلمي العام للسؤال
  explanationEnglish?: string;
  optionExplanations?: Record<string, string>;
  points: number;
  contentHash?: string;
  syncStatus?: QuestionSyncStatus;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Public Question (Sent to student during test - NEVER contains correctOptionId)
 */
export interface AssessmentQuestionPublic {
  id: string;
  bankId?: string;
  questionType?: QuestionType;
  language?: AssessmentLanguage;
  stemArabic: string;
  stemEnglish?: string;
  imageUrl?: string;
  options: QuestionOption[];
  points: number;
  modelAnswerArabic?: string;
}

/**
 * Protected Question Answer Key (Kept server-side / restricted collection)
 */
export interface QuestionAnswerKey {
  questionId: string;
  assessmentId: string;
  correctOptionId: string;
  modelAnswerArabic?: string;
  explanationArabic?: string;
  explanationEnglish?: string;
  points: number;
}

export interface QuestionValidationIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  messageArabic: string;
  messageEnglish?: string;
}

export interface DetectedAssessmentMetadata {
  titleArabic?: string;
  titleEnglish?: string;
  assessmentType?: AssessmentType; // 'exam' | 'competition'
  language?: AssessmentLanguage; // 'ar' | 'en' | 'bilingual'
  studyLevelId?: string;
  studyLevelName?: string;
  batchName?: string;
  batchNumber?: string;
  courseName?: string;
  blockCode?: string;
  durationMinutes?: number;
  questionDurationSeconds?: number;
  totalQuestions?: number;
}

export interface ParsedQuestionDraft {
  tempId: string;
  deterministicId?: string;
  sourceIndex: number;
  questionType?: QuestionType;
  language?: AssessmentLanguage;
  stemArabic: string;
  stemEnglish?: string;
  imageUrl?: string;
  options: QuestionOption[];
  correctOptionId: string;
  modelAnswerArabic?: string;
  modelAnswerEnglish?: string;
  explanationArabic?: string;
  explanationEnglish?: string;
  points: number;
  selectedForImport: boolean;
  isValid?: boolean;
  issues?: QuestionValidationIssue[];
  isDuplicateInBatch?: boolean;
  isDuplicateInBank?: boolean;
  existingQuestionId?: string;
  contentHash?: string;
  originalExplanationBeforeAi?: string;
  aiGeneratedExplanation?: string;
  optionExplanations?: Record<string, string>;
}

export interface BulkImportDraftSession {
  id?: string;
  bankId: string;
  universityId?: string;
  language?: AssessmentLanguage;
  rawInput?: string;
  rawInputText?: string;
  sourceFormat?: string;
  defaultPoints?: number;
  drafts?: ParsedQuestionDraft[];
  draftQuestions?: ParsedQuestionDraft[];
  detectedMetadata?: DetectedAssessmentMetadata;
  savedAt?: string;
  updatedAt?: string;
}

export interface QuestionOutboxEntry {
  id: string;
  questionId?: string;
  bankId?: string;
  universityId?: string;
  question?: QuestionItemFull;
  operation: 'upsert' | 'delete';
  idempotencyKey?: string;
  status?: string;
  retryCount?: number;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
  queuedAt?: string;
}

export interface Assessment {
  id: string;
  assessmentType: AssessmentType;
  language?: AssessmentLanguage; // 'ar' | 'en' | 'bilingual'
  questionTypeMode?: BankQuestionTypeMode;
  titleArabic: string;
  titleEnglish?: string;
  descriptionArabic?: string;
  universityId: string;
  collegeId?: string;
  programId: string;
  studyLevelId: string;
  studyPeriodId?: string;
  blockName?: string;
  batchName?: string;
  batchNumber?: string;
  courseOfferingId?: string;
  durationMinutes: number; // e.g. 45
  enableExamTimer?: boolean;
  questionDurationSeconds?: number;
  availabilityDurationHours?: number;
  allowTrialSharing?: boolean;
  showLeaderboard?: boolean;
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
  durationSeconds?: number;
}

export interface QuestionReviewItem {
  questionId: string;
  questionType?: QuestionType;
  stemArabic: string;
  stemEnglish?: string;
  imageUrl?: string;
  options: QuestionOption[];
  correctOptionId?: string;
  studentAnswer?: string;
  isCorrect?: boolean;
  explanationArabic?: string;
  modelAnswerArabic?: string;
  points: number;
}

export interface AssessmentResult {
  id: string;
  attemptId: string;
  assessmentId: string;
  uid: string;
  studentNameArabic: string;
  studentDisplayNamePublic?: string;
  studentUsername?: string;
  leaderboardNameMode?: LeaderboardNameMode;
  durationSeconds?: number;
  academicStudentNumber?: string;
  score: number;
  totalPoints: number;
  percentage: number;
  submittedAt: string;
  gradedAt: string;
  isReleased: boolean;
  releasedAt?: string;
  questionReviews?: QuestionReviewItem[];
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
  | 'RESOURCE_DELETED'
  | 'INSTRUCTOR_ADDED'
  | 'INSTRUCTOR_DELETED'
  | 'BATCH_NOTIFICATION_SENT'
  | 'USER_ACCOUNT_DELETED'
  | 'USER_PROFILE_UPDATED'
  | 'USER_ARCHIVED'
  | 'USER_UNARCHIVED'
  | 'USER_VERIFIED'
  | 'USERS_EXPORTED'
  | 'QUESTIONS_BULK_IMPORTED';

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
      id: 'blk-fnd-1',
      levelId: 'lvl-1',
      periodType: 'block' as const,
      titleArabic: 'بلوك العلوم الطبية التأسيسية والخلية',
      titleEnglish: 'Foundation & Cell Biology Block',
      code: 'FND-101',
      order: 1,
    },
    {
      id: 'blk-hem-2',
      levelId: 'lvl-2',
      periodType: 'block' as const,
      titleArabic: 'بلوك الدم والجهاز اللمفاوي (Hematology)',
      titleEnglish: 'Hematology & Lymphatic System Block',
      code: 'HEM-201',
      order: 1,
    },
    {
      id: 'blk-msk-2',
      levelId: 'lvl-2',
      periodType: 'block' as const,
      titleArabic: 'بلوك الجهاز العضلي الهيكلي (MSK)',
      titleEnglish: 'Musculoskeletal System Block',
      code: 'MSK-202',
      order: 2,
    },
    {
      id: 'blk-git-3',
      levelId: 'lvl-3',
      periodType: 'block' as const,
      titleArabic: 'بلوك الجهاز الهضمي والكبد (GIT)',
      titleEnglish: 'Gastrointestinal & Hepatobiliary Block',
      code: 'GIT-301',
      order: 1,
    },
    {
      id: 'blk-cns-3',
      levelId: 'lvl-3',
      periodType: 'block' as const,
      titleArabic: 'بلوك الجهاز العصبي المركزي (CNS)',
      titleEnglish: 'Central Nervous System Block',
      code: 'CNS-302',
      order: 2,
    },
    {
      id: 'blk-cvs',
      levelId: 'lvl-4',
      periodType: 'block' as const,
      titleArabic: 'بلوك الجهاز القلبي الوعائي (CVS)',
      titleEnglish: 'Cardiovascular System Block',
      code: 'CVS-401',
      order: 1,
    },
    {
      id: 'blk-rs',
      levelId: 'lvl-4',
      periodType: 'block' as const,
      titleArabic: 'بلوك الجهاز التنفسي (Respiratory)',
      titleEnglish: 'Respiratory System Block',
      code: 'RESP-402',
      order: 2,
    },
    {
      id: 'blk-ren-5',
      levelId: 'lvl-5',
      periodType: 'block' as const,
      titleArabic: 'بلوك الكلى والمسالك البولية (Renal)',
      titleEnglish: 'Renal & Urinary System Block',
      code: 'REN-501',
      order: 1,
    },
    {
      id: 'blk-end-5',
      levelId: 'lvl-5',
      periodType: 'block' as const,
      titleArabic: 'بلوك الغدد الصماء والتكاثر (Endocrine)',
      titleEnglish: 'Endocrine & Reproductive Block',
      code: 'END-502',
      order: 2,
    },
    {
      id: 'blk-im-6',
      levelId: 'lvl-6',
      periodType: 'block' as const,
      titleArabic: 'دورة الباطنة العامة السريرية (Internal Medicine)',
      titleEnglish: 'Internal Medicine Clerkship',
      code: 'MED-601',
      order: 1,
    },
    {
      id: 'blk-surg-7',
      levelId: 'lvl-7',
      periodType: 'block' as const,
      titleArabic: 'دورة الجراحة العامة والطوارئ (General Surgery)',
      titleEnglish: 'General Surgery & Emergency Clerkship',
      code: 'SURG-701',
      order: 1,
    },
  ],
};
