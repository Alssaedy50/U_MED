# UMED Data Model & Firestore Schema Specification

## 1. Document Collections Hierarchy

```
root
├── countries/{countryId}
├── universities/{universityId}
├── colleges/{collegeId}
├── programs/{programId}
├── curriculumVersions/{curriculumId}
├── studyLevels/{levelId}
├── studyPeriods/{periodId}
├── courseOfferings/{courseId}
├── userRoles/{uid}
├── userProfiles/{uid}
├── studentEnrollments/{enrollmentId}
├── academicChangeRequests/{requestId}
├── educationalResources/{resourceId}
├── assessments/{assessmentId}
├── assessmentQuestions/{questionId}
├── questionAnswerKeys/{questionId} (PROTECTED)
├── assessmentAttempts/{attemptId}
├── assessmentResults/{resultId}
└── auditLogs/{logId} (IMMUTABLE)
```

---

## 2. Collection Schemas & Field Definitions

### 2.1 `universities`
- `id` (string): Stable slug, e.g., `univ-dar-al-salam`
- `countryId` (string): Reference to `countries/YE`
- `nameArabic` (string): 'جامعة دار السلام الدولية للعلوم والتكنولوجيا'
- `nameEnglish` (string): 'Dar Al Salam International University'
- `type` (string): `'public'` | `'private'`
- `cityArabic` (string): 'صنعاء'
- `enrollmentPolicy` (string): `'immediate'` | `'approval_required'`
- `isActive` (boolean): `true`
- `createdAt` (timestamp), `updatedAt` (timestamp)

### 2.2 `studyLevels`
- `id` (string): Stable level ID e.g., `lvl-1`, `lvl-7`, `lvl-internship`
- `curriculumVersionId` (string): Reference to parent curriculum version
- `programId` (string): Reference to parent program
- `universityId` (string): Reference to parent university
- `order` (number): 1 through 7 for standard levels; 8 for internship
- `stageType` (string): `'regular'` | `'internship'`
- `titleArabic` (string): 'المستوى الأول', ..., 'سنة الامتياز'
- `durationMonths` (number, optional): e.g., 12 for internship
- `isActive` (boolean): `true`

### 2.3 `studentEnrollments`
- `id` (string): Unique enrollment document ID
- `uid` (string): Firebase Auth User ID
- `universityId`, `collegeId`, `programId`, `curriculumVersionId`, `currentStudyLevelId`
- `academicStudentNumber` (string): University registration / roll number
- `academicYear` (string): e.g., '2025/2026'
- `status` (string): `'pending'` | `'approved'` | `'rejected'` | `'suspended'`
- `reviewedBy` (string, optional): Admin UID
- `reviewedAt` (timestamp, optional)
- `enrolledAt` (timestamp)

### 2.4 `assessments` & `assessmentAttempts`
- **Assessment**:
  - `id`, `assessmentType` (`'exam'` | `'competition'`)
  - `titleArabic`, `titleEnglish`, `durationMinutes`, `maxAttempts`
  - `opensAt`, `closesAt`, `resultReleasePolicy` (`'immediate'` | `'after_close'` | `'manual'`)
  - `status` (`'draft'` | `'published'` | `'closed'`)
- **Attempt**:
  - `id`, `assessmentId`, `uid`
  - `startedAt`, `expiresAt`
  - `answers` (map of `questionId` -> `selectedOptionId`)
  - `status` (`'in_progress'` | `'submitted'` | `'scored'`)

### 2.5 `questionAnswerKeys` (Strictly Protected)
- `questionId` (string)
- `assessmentId` (string)
- `correctOptionId` (string)
- `explanationArabic` (string, optional)
- `points` (number)

---

## 3. Dar Al Salam University Seed Structure
- **Country**: اليمن (`YE`)
- **University**: جامعة دار السلام الدولية للعلوم والتكنولوجيا (Private, Sana'a)
- **College**: كلية الطب البشري (College of Human Medicine)
- **Program**: بكالوريوس طب وجراحة عامة (MBBS, Block System)
- **Levels**:
  1. المستوى الأول (Foundation)
  2. المستوى الثاني (Basic Medical Sciences I)
  3. المستوى الثالث (Basic Medical Sciences II)
  4. المستوى الرابع (System Blocks I & Pathology)
  5. المستوى الخامس (System Blocks II & Clinical Skills)
  6. المستوى السادس (Junior Clinical Clerkships)
  7. المستوى السابع (Senior Clinical Practice)
  8. سنة الامتياز (Internship Year, 12 Months Clinical Training)

---

## 4. Relational Integrity, Idempotency & Safe Deactivation Rules (Phase 3)

### 4.1 Idempotent Seeding Architecture
- The seed loader (`seedDarAlSalamToFirestore`) writes deterministic document IDs across all 8 hierarchical tiers:
  - `countries/YE`
  - `universities/univ-dar-al-salam`
  - `colleges/col-human-medicine`
  - `programs/prog-mbbs`
  - `curriculumVersions/cur-dar-2024`
  - `studyLevels/lvl-1` ... `studyLevels/lvl-7`, `studyLevels/lvl-internship`
  - `studyPeriods/blk-cvs`, `studyPeriods/blk-rs`
  - `courseOfferings/crs-anat-cvs`
- Running the seed loader multiple times performs idempotent merges (`merge: true`), preventing duplicate entities in Firestore and ensuring repeatable deployment across environments.

### 4.2 Safe Deactivation (`isActive`) Over Destructive Deletion
- To preserve academic history, enrollments, and past examination records:
  - Universities, Colleges, Programs, Levels, Blocks, and Courses utilize soft-status flags (`isActive: boolean`).
  - Attempting to hard-delete an entity triggers `checkEntityDependencies()`, verifying whether child records (e.g. Colleges within a University, Programs within a College, or Blocks within a Study Level) exist.
  - Entities with existing dependencies are strictly protected against accidental deletion, guiding administrators to safe deactivation (`isActive: false`).

