/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Academic Hierarchy Service
 * Manages Universities, Colleges, Programs, Curricula, Levels, Blocks, and Courses
 * Full Dynamic CRUD with Hybrid Firestore + LocalStorage Persistence & Cascade Deletion
 */

import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { 
  Country, 
  University, 
  College, 
  AcademicProgram, 
  CurriculumVersion, 
  StudyLevel, 
  StudyPeriod, 
  CourseOffering, 
  DAR_AL_SALAM_SEED 
} from '../types/umed.ts';

// ---------------------------------------------------------------------------
// Hybrid LocalStorage + Firestore Synchronization Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  countries: 'umed_acad_countries',
  universities: 'umed_acad_universities',
  colleges: 'umed_acad_colleges',
  programs: 'umed_acad_programs',
  curriculumVersions: 'umed_acad_curricula',
  studyLevels: 'umed_acad_levels',
  studyPeriods: 'umed_acad_periods',
  courseOfferings: 'umed_acad_courses',
  deletedIds: 'umed_acad_deleted_ids'
} as const;

type CollectionKey = Exclude<keyof typeof STORAGE_KEYS, 'deletedIds'>;

const DEFAULT_SEED_DATA: Record<CollectionKey, any[]> = {
  countries: [DAR_AL_SALAM_SEED.country],
  universities: [DAR_AL_SALAM_SEED.university],
  colleges: [DAR_AL_SALAM_SEED.college],
  programs: [DAR_AL_SALAM_SEED.program],
  curriculumVersions: [DAR_AL_SALAM_SEED.curriculumVersion],
  studyLevels: DAR_AL_SALAM_SEED.studyLevels,
  studyPeriods: DAR_AL_SALAM_SEED.sampleBlocks.map(b => ({
    id: b.id,
    studyLevelId: 'lvl-4',
    curriculumVersionId: 'cur-dar-2024',
    universityId: 'univ-dar-al-salam',
    periodType: b.periodType,
    titleArabic: b.titleArabic,
    titleEnglish: b.titleEnglish,
    code: b.code,
    order: b.order,
    isActive: true
  })),
  courseOfferings: [
    {
      id: 'crs-anat-cvs',
      studyPeriodId: 'blk-cvs',
      studyLevelId: 'lvl-4',
      curriculumVersionId: 'cur-dar-2024',
      universityId: 'univ-dar-al-salam',
      titleArabic: 'تشريح الجهاز القلبي الوعائي',
      titleEnglish: 'Anatomy of Cardiovascular System',
      code: 'ANAT-401',
      creditHours: 3,
      isActive: true
    }
  ]
};

function getDeletedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.deletedIds);
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}

function markIdDeleted(id: string): void {
  try {
    const set = getDeletedIds();
    set.add(id);
    localStorage.setItem(STORAGE_KEYS.deletedIds, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function unmarkIdDeleted(id: string): void {
  try {
    const set = getDeletedIds();
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(STORAGE_KEYS.deletedIds, JSON.stringify(Array.from(set)));
    }
  } catch (e) {}
}

function clearDeletedIds(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.deletedIds);
  } catch (e) {}
}

function readLocalCollection<T extends { id: string }>(key: CollectionKey): T[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as T[];
      const deleted = getDeletedIds();
      return parsed.filter(item => !deleted.has(item.id));
    }
  } catch (e) {}
  return null;
}

function writeLocalCollection<T extends { id: string }>(key: CollectionKey, items: T[]): void {
  try {
    const deleted = getDeletedIds();
    const clean = items.filter(item => !deleted.has(item.id));
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(clean));
    localStorage.setItem(`${STORAGE_KEYS[key]}_init`, 'true');
  } catch (e) {}
}

/**
 * Ensures default seed entities for a collection are materialized in localStorage & Firestore
 * before performing single-item create/update/toggle/delete so other default items never vanish.
 */
async function ensureCollectionInitialized<T extends { id: string }>(
  key: CollectionKey,
  firestoreCollectionName: string
): Promise<T[]> {
  const deleted = getDeletedIds();
  let currentLocal = readLocalCollection<T>(key);
  const isInitialized = localStorage.getItem(`${STORAGE_KEYS[key]}_init`) === 'true';

  if (!isInitialized || currentLocal === null) {
    const defaults = (DEFAULT_SEED_DATA[key] as T[]).filter(item => !deleted.has(item.id));
    let firestoreList: T[] = [];
    try {
      const snap = await getDocs(collection(db, firestoreCollectionName));
      snap.forEach(d => {
        const data = d.data() as T;
        if (!deleted.has(data.id)) {
          firestoreList.push(data);
        }
      });
    } catch (e) {}

    // Merge defaults with any existing Firestore docs so we never lose unseeded defaults
    const mergedMap = new Map<string, T>();
    defaults.forEach(item => mergedMap.set(item.id, item));
    firestoreList.forEach(item => mergedMap.set(item.id, item));
    currentLocal = Array.from(mergedMap.values());
    writeLocalCollection(key, currentLocal);

    // If Firestore had fewer items than defaults, persist the missing defaults to Firestore in background
    if (firestoreList.length < defaults.length) {
      const existingIds = new Set(firestoreList.map(i => i.id));
      for (const defItem of defaults) {
        if (!existingIds.has(defItem.id)) {
          setDoc(doc(db, firestoreCollectionName, defItem.id), defItem, { merge: true }).catch(() => {});
        }
      }
    }
  }

  return currentLocal;
}

async function upsertHybridItem<T extends { id: string }>(
  key: CollectionKey,
  firestoreCollectionName: string,
  item: T
): Promise<void> {
  unmarkIdDeleted(item.id);
  const current = await ensureCollectionInitialized<T>(key, firestoreCollectionName);
  const idx = current.findIndex(existing => existing.id === item.id);
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...item };
  } else {
    current.push(item);
  }
  writeLocalCollection(key, current);

  try {
    await setDoc(doc(db, firestoreCollectionName, item.id), item, { merge: true });
  } catch (err) {
    console.warn(`Firestore setDoc fallback (${firestoreCollectionName}/${item.id}):`, err);
  }
}

async function removeHybridItem<T extends { id: string }>(
  key: CollectionKey,
  firestoreCollectionName: string,
  id: string
): Promise<void> {
  const current = await ensureCollectionInitialized<T>(key, firestoreCollectionName);
  markIdDeleted(id);
  const filtered = current.filter(item => item.id !== id);
  writeLocalCollection(key, filtered);

  try {
    await deleteDoc(doc(db, firestoreCollectionName, id));
  } catch (err) {
    console.warn(`Firestore deleteDoc fallback (${firestoreCollectionName}/${id}):`, err);
  }
}

async function fetchHybridCollection<T extends { id: string }>(
  key: CollectionKey,
  firestoreCollectionName: string,
  filterFn?: (item: T) => boolean
): Promise<T[]> {
  const isInitialized = localStorage.getItem(`${STORAGE_KEYS[key]}_init`) === 'true';
  const localItems = readLocalCollection<T>(key) || [];

  try {
    const snap = await getDocs(collection(db, firestoreCollectionName));
    if (!snap.empty) {
      // Cloud Firestore is the definitive source of truth across all devices!
      const cloudItems: T[] = [];
      snap.forEach((d) => {
        const data = d.data() as T;
        if (data && data.id) {
          cloudItems.push(data);
          unmarkIdDeleted(data.id);
        }
      });

      writeLocalCollection(key, cloudItems);
      return filterFn ? cloudItems.filter(filterFn) : cloudItems;
    }
  } catch (err) {
    console.warn(`Firestore fetch error (${firestoreCollectionName}), using local/seed cache:`, err);
  }

  if (isInitialized && localItems.length > 0) {
    return filterFn ? localItems.filter(filterFn) : localItems;
  }

  const defaults = (DEFAULT_SEED_DATA[key] as T[]);
  writeLocalCollection(key, defaults);
  return filterFn ? defaults.filter(filterFn) : defaults;
}

// ---------------------------------------------------------------------------
// 1. Countries
// ---------------------------------------------------------------------------

export async function fetchCountries(): Promise<Country[]> {
  return fetchHybridCollection<Country>('countries', 'countries');
}

export async function saveCountry(country: Country): Promise<void> {
  await upsertHybridItem<Country>('countries', 'countries', country);
}

export async function deleteCountry(countryId: string): Promise<void> {
  await removeHybridItem<Country>('countries', 'countries', countryId);
}

// ---------------------------------------------------------------------------
// 2. Universities
// ---------------------------------------------------------------------------

export async function fetchUniversities(countryId: string = 'YE'): Promise<University[]> {
  return fetchHybridCollection<University>(
    'universities',
    'universities',
    (u) => !countryId || u.countryId === countryId
  );
}

export function subscribeToUniversities(onUpdate: (universities: University[]) => void): () => void {
  try {
    return onSnapshot(
      collection(db, 'universities'),
      (snap) => {
        const list: University[] = [];
        snap.forEach(d => {
          const data = d.data() as University;
          if (data && data.id) list.push(data);
        });
        if (list.length > 0) {
          writeLocalCollection('universities', list);
          onUpdate(list);
        }
      },
      (err) => console.warn('subscribeToUniversities error:', err)
    );
  } catch {
    return () => {};
  }
}

export async function saveUniversity(university: University): Promise<void> {
  const updated: University = {
    ...university,
    updatedAt: new Date().toISOString()
  };
  await upsertHybridItem<University>('universities', 'universities', updated);

  // Ensure every university has at least a default College of Medicine & MBBS Program so students & admins can use it immediately
  try {
    const existingCols = await fetchColleges(university.id);
    if (existingCols.length === 0) {
      const now = new Date().toISOString();
      const defaultColId = university.id === 'univ-dar-al-salam' ? 'col-medicine-dar' : `col-med-${university.id}`;
      await saveCollege({
        id: defaultColId,
        universityId: university.id,
        nameArabic: 'كلية الطب البشري والعلوم الصحية',
        nameEnglish: 'Faculty of Medicine & Health Sciences',
        code: 'MED',
        isActive: true,
        createdAt: now
      });
      await saveProgram({
        id: university.id === 'univ-dar-al-salam' ? 'prog-mbbs' : `prog-mbbs-${university.id}`,
        collegeId: defaultColId,
        universityId: university.id,
        nameArabic: 'بكالوريوس الطب العام والجراحة (MBBS)',
        nameEnglish: 'Bachelor of Medicine, Bachelor of Surgery (MBBS)',
        degree: 'bachelor',
        studySystem: 'block',
        totalRegularLevels: 7,
        hasInternship: true,
        internshipDurationMonths: 12,
        isActive: true,
        createdAt: now
      });
    }
  } catch (e) {}
}

export async function toggleUniversityActive(universityId: string, currentStatus: boolean): Promise<void> {
  const current = await ensureCollectionInitialized<University>('universities', 'universities');
  const target = current.find(u => u.id === universityId);
  const nextStatus = !currentStatus;
  const now = new Date().toISOString();

  if (target) {
    await upsertHybridItem<University>('universities', 'universities', {
      ...target,
      isActive: nextStatus,
      updatedAt: now
    });
  } else {
    try {
      await updateDoc(doc(db, 'universities', universityId), {
        isActive: nextStatus,
        updatedAt: now
      });
    } catch (e) {}
  }
}

export async function deleteUniversity(universityId: string, forceCascade: boolean = false): Promise<void> {
  if (forceCascade) {
    const colleges = await fetchColleges(universityId);
    for (const col of colleges) {
      await deleteCollege(col.id, true);
    }
  }
  await removeHybridItem<University>('universities', 'universities', universityId);
}

// ---------------------------------------------------------------------------
// 3. Colleges
// ---------------------------------------------------------------------------

export async function fetchColleges(universityId?: string): Promise<College[]> {
  return fetchHybridCollection<College>(
    'colleges',
    'colleges',
    (c) => !universityId || c.universityId === universityId
  );
}

export async function saveCollege(college: College): Promise<void> {
  await upsertHybridItem<College>('colleges', 'colleges', college);
}

export async function toggleCollegeActive(collegeId: string, currentStatus: boolean): Promise<void> {
  const current = await ensureCollectionInitialized<College>('colleges', 'colleges');
  const target = current.find(c => c.id === collegeId);
  const nextStatus = !currentStatus;

  if (target) {
    await upsertHybridItem<College>('colleges', 'colleges', {
      ...target,
      isActive: nextStatus
    });
  } else {
    try {
      await updateDoc(doc(db, 'colleges', collegeId), { isActive: nextStatus });
    } catch (e) {}
  }
}

export async function deleteCollege(collegeId: string, forceCascade: boolean = false): Promise<void> {
  if (forceCascade) {
    const programs = await fetchPrograms(collegeId);
    for (const prog of programs) {
      await deleteProgram(prog.id, true);
    }
  }
  await removeHybridItem<College>('colleges', 'colleges', collegeId);
}

// ---------------------------------------------------------------------------
// 4. Academic Programs
// ---------------------------------------------------------------------------

export async function fetchPrograms(collegeId?: string): Promise<AcademicProgram[]> {
  return fetchHybridCollection<AcademicProgram>(
    'programs',
    'programs',
    (p) => !collegeId || p.collegeId === collegeId
  );
}

export async function saveProgram(program: AcademicProgram): Promise<void> {
  await upsertHybridItem<AcademicProgram>('programs', 'programs', program);
}

export async function toggleProgramActive(programId: string, currentStatus: boolean): Promise<void> {
  const current = await ensureCollectionInitialized<AcademicProgram>('programs', 'programs');
  const target = current.find(p => p.id === programId);
  const nextStatus = !currentStatus;

  if (target) {
    await upsertHybridItem<AcademicProgram>('programs', 'programs', {
      ...target,
      isActive: nextStatus
    });
  } else {
    try {
      await updateDoc(doc(db, 'programs', programId), { isActive: nextStatus });
    } catch (e) {}
  }
}

export async function deleteProgram(programId: string, forceCascade: boolean = false): Promise<void> {
  if (forceCascade) {
    const levels = await fetchStudyLevels(programId);
    for (const lvl of levels) {
      await deleteStudyLevel(lvl.id, true);
    }
  }
  await removeHybridItem<AcademicProgram>('programs', 'programs', programId);
}

// ---------------------------------------------------------------------------
// 5. Curriculum Versions
// ---------------------------------------------------------------------------

export async function fetchCurriculumVersions(programId?: string): Promise<CurriculumVersion[]> {
  return fetchHybridCollection<CurriculumVersion>(
    'curriculumVersions',
    'curriculumVersions',
    (c) => !programId || c.programId === programId
  );
}

export async function saveCurriculumVersion(curriculum: CurriculumVersion): Promise<void> {
  await upsertHybridItem<CurriculumVersion>('curriculumVersions', 'curriculumVersions', curriculum);
}

// ---------------------------------------------------------------------------
// 6. Study Levels & Internship Stage
// ---------------------------------------------------------------------------

export async function fetchStudyLevels(programId?: string): Promise<StudyLevel[]> {
  const list = await fetchHybridCollection<StudyLevel>(
    'studyLevels',
    'studyLevels',
    (l) => !programId || l.programId === programId || programId.startsWith('prog-mbbs')
  );
  return [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function saveStudyLevel(level: StudyLevel): Promise<void> {
  await upsertHybridItem<StudyLevel>('studyLevels', 'studyLevels', level);
}

export async function toggleStudyLevelActive(levelId: string, currentStatus: boolean): Promise<void> {
  const current = await ensureCollectionInitialized<StudyLevel>('studyLevels', 'studyLevels');
  const target = current.find(l => l.id === levelId);
  const nextStatus = !currentStatus;

  if (target) {
    await upsertHybridItem<StudyLevel>('studyLevels', 'studyLevels', {
      ...target,
      isActive: nextStatus
    });
  } else {
    try {
      await updateDoc(doc(db, 'studyLevels', levelId), { isActive: nextStatus });
    } catch (e) {}
  }
}

export async function deleteStudyLevel(levelId: string, forceCascade: boolean = false): Promise<void> {
  if (forceCascade) {
    const periods = await fetchStudyPeriods(levelId);
    for (const period of periods) {
      await deleteStudyPeriod(period.id, true);
    }
  }
  await removeHybridItem<StudyLevel>('studyLevels', 'studyLevels', levelId);
}

// ---------------------------------------------------------------------------
// 7. Study Periods / Blocks
// ---------------------------------------------------------------------------

export async function fetchStudyPeriods(studyLevelId?: string, universityId?: string): Promise<StudyPeriod[]> {
  const list = await fetchHybridCollection<StudyPeriod>(
    'studyPeriods',
    'studyPeriods',
    (p) =>
      (!studyLevelId || p.studyLevelId === studyLevelId) &&
      (!universityId || !p.universityId || p.universityId === universityId)
  );
  return [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function saveStudyPeriod(period: StudyPeriod): Promise<void> {
  await upsertHybridItem<StudyPeriod>('studyPeriods', 'studyPeriods', period);
}

export async function toggleStudyPeriodActive(periodId: string, currentStatus: boolean): Promise<void> {
  const current = await ensureCollectionInitialized<StudyPeriod>('studyPeriods', 'studyPeriods');
  const target = current.find(p => p.id === periodId);
  const nextStatus = !currentStatus;

  if (target) {
    await upsertHybridItem<StudyPeriod>('studyPeriods', 'studyPeriods', {
      ...target,
      isActive: nextStatus
    });
  } else {
    try {
      await updateDoc(doc(db, 'studyPeriods', periodId), { isActive: nextStatus });
    } catch (e) {}
  }
}

export async function deleteStudyPeriod(periodId: string, forceCascade: boolean = false): Promise<void> {
  if (forceCascade) {
    const courses = await fetchCourseOfferings(periodId);
    for (const course of courses) {
      await deleteCourseOffering(course.id);
    }
  }
  await removeHybridItem<StudyPeriod>('studyPeriods', 'studyPeriods', periodId);
}

// ---------------------------------------------------------------------------
// 8. Course Offerings & Sections
// ---------------------------------------------------------------------------

export async function fetchCourseOfferings(studyPeriodId?: string, universityId?: string): Promise<CourseOffering[]> {
  return fetchHybridCollection<CourseOffering>(
    'courseOfferings',
    'courseOfferings',
    (c) =>
      (!studyPeriodId || c.studyPeriodId === studyPeriodId) &&
      (!universityId || !c.universityId || c.universityId === universityId)
  );
}

export async function saveCourseOffering(course: CourseOffering): Promise<void> {
  await upsertHybridItem<CourseOffering>('courseOfferings', 'courseOfferings', course);
}

export async function toggleCourseOfferingActive(courseId: string, currentStatus: boolean): Promise<void> {
  const current = await ensureCollectionInitialized<CourseOffering>('courseOfferings', 'courseOfferings');
  const target = current.find(c => c.id === courseId);
  const nextStatus = !currentStatus;

  if (target) {
    await upsertHybridItem<CourseOffering>('courseOfferings', 'courseOfferings', {
      ...target,
      isActive: nextStatus
    });
  } else {
    try {
      await updateDoc(doc(db, 'courseOfferings', courseId), { isActive: nextStatus });
    } catch (e) {}
  }
}

export async function deleteCourseOffering(courseId: string): Promise<void> {
  await removeHybridItem<CourseOffering>('courseOfferings', 'courseOfferings', courseId);
}

// ---------------------------------------------------------------------------
// 9. Relational Dependency & Safe / Cascade Deletion Validation
// ---------------------------------------------------------------------------

export interface DependencyCheckResult {
  canDelete: boolean;
  reason?: string;
  dependentCount: number;
}

export async function checkEntityDependencies(
  entityType: 'university' | 'college' | 'program' | 'level' | 'period' | 'course',
  entityId: string
): Promise<DependencyCheckResult> {
  try {
    if (entityType === 'university') {
      const colleges = await fetchColleges(entityId);
      if (colleges.length > 0) {
        return {
          canDelete: false,
          reason: `توجد ${colleges.length} كليات مرتبطة بهذه الجامعة. يمكنك اختيار "التعطيل الآمن" أو "الحذف النهائي المتسلسل" مع كافة العناصر التابعة.`,
          dependentCount: colleges.length
        };
      }
    } else if (entityType === 'college') {
      const programs = await fetchPrograms(entityId);
      if (programs.length > 0) {
        return {
          canDelete: false,
          reason: `يوجد ${programs.length} برنامج أكاديمي مرتبط بهذه الكلية. يمكنك اختيار "التعطيل الآمن" أو "الحذف النهائي المتسلسل".`,
          dependentCount: programs.length
        };
      }
    } else if (entityType === 'program') {
      const levels = await fetchStudyLevels(entityId);
      if (levels.length > 0) {
        return {
          canDelete: false,
          reason: `يوجد ${levels.length} مستوى دراسي مرتبط بهذا البرنامج الأكاديمي. يمكنك اختيار "التعطيل الآمن" أو "الحذف النهائي المتسلسل".`,
          dependentCount: levels.length
        };
      }
    } else if (entityType === 'level') {
      const periods = await fetchStudyPeriods(entityId);
      if (periods.length > 0) {
        return {
          canDelete: false,
          reason: `يوجد ${periods.length} بلوك/فترة دراسية مسجلة في هذا المستوى الدراسي. يمكنك اختيار "التعطيل الآمن" أو "الحذف النهائي المتسلسل".`,
          dependentCount: periods.length
        };
      }
    } else if (entityType === 'period') {
      const courses = await fetchCourseOfferings(entityId);
      if (courses.length > 0) {
        return {
          canDelete: false,
          reason: `يوجد ${courses.length} مقرر دراسي مسجل داخل هذا البلوك. يمكنك اختيار "التعطيل الآمن" أو "الحذف النهائي المتسلسل".`,
          dependentCount: courses.length
        };
      }
    } else if (entityType === 'course') {
      return { canDelete: true, dependentCount: 0 };
    }
  } catch (err) {
    console.warn('Dependency check error:', err);
  }

  return { canDelete: true, dependentCount: 0 };
}

// ---------------------------------------------------------------------------
// 10. Idempotent Dar Al Salam University Demonstration Seed Loader
// ---------------------------------------------------------------------------

export async function seedDarAlSalamToFirestore(performedBy: string = 'PLATFORM_OWNER'): Promise<{
  success: boolean;
  message: string;
  itemsCreated: number;
}> {
  clearDeletedIds();

  const univWithTimestamp: University = {
    ...DAR_AL_SALAM_SEED.university,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString()
  };

  const colWithTimestamp: College = {
    ...DAR_AL_SALAM_SEED.college,
    createdAt: '2024-01-01T00:00:00Z'
  };

  const progWithTimestamp: AcademicProgram = {
    ...DAR_AL_SALAM_SEED.program,
    createdAt: '2024-01-01T00:00:00Z'
  };

  const curWithTimestamp: CurriculumVersion = {
    ...DAR_AL_SALAM_SEED.curriculumVersion,
    createdAt: '2024-01-01T00:00:00Z'
  };

  const periodsList: StudyPeriod[] = DAR_AL_SALAM_SEED.sampleBlocks.map(blk => ({
    id: blk.id,
    studyLevelId: 'lvl-4',
    curriculumVersionId: 'cur-dar-2024',
    universityId: 'univ-dar-al-salam',
    periodType: blk.periodType,
    titleArabic: blk.titleArabic,
    titleEnglish: blk.titleEnglish,
    code: blk.code,
    order: blk.order,
    isActive: true
  }));

  const defaultCourse: CourseOffering = {
    id: 'crs-anat-cvs',
    studyPeriodId: 'blk-cvs',
    studyLevelId: 'lvl-4',
    curriculumVersionId: 'cur-dar-2024',
    universityId: 'univ-dar-al-salam',
    titleArabic: 'تشريح الجهاز القلبي الوعائي',
    titleEnglish: 'Anatomy of Cardiovascular System',
    code: 'ANAT-401',
    creditHours: 3,
    isActive: true
  };

  // Merge with existing local collections so other universities' entities are never overwritten
  const mergeSeedWithLocal = <T extends { id: string }>(key: CollectionKey, seedItems: T[]) => {
    const existing = readLocalCollection<T>(key) || [];
    const map = new Map<string, T>();
    existing.forEach(item => map.set(item.id, item));
    seedItems.forEach(item => map.set(item.id, item));
    writeLocalCollection(key, Array.from(map.values()));
  };

  mergeSeedWithLocal('countries', [DAR_AL_SALAM_SEED.country]);
  mergeSeedWithLocal('universities', [univWithTimestamp]);
  mergeSeedWithLocal('colleges', [colWithTimestamp]);
  mergeSeedWithLocal('programs', [progWithTimestamp]);
  mergeSeedWithLocal('curriculumVersions', [curWithTimestamp]);
  mergeSeedWithLocal('studyLevels', DAR_AL_SALAM_SEED.studyLevels);
  mergeSeedWithLocal('studyPeriods', periodsList);
  mergeSeedWithLocal('courseOfferings', [defaultCourse]);

  let count = 1 + 1 + 1 + 1 + 1 + DAR_AL_SALAM_SEED.studyLevels.length + periodsList.length + 1;

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'countries', DAR_AL_SALAM_SEED.country.id), DAR_AL_SALAM_SEED.country, { merge: true });
    batch.set(doc(db, 'universities', univWithTimestamp.id), univWithTimestamp, { merge: true });
    batch.set(doc(db, 'colleges', colWithTimestamp.id), colWithTimestamp, { merge: true });
    batch.set(doc(db, 'programs', progWithTimestamp.id), progWithTimestamp, { merge: true });
    batch.set(doc(db, 'curriculumVersions', curWithTimestamp.id), curWithTimestamp, { merge: true });

    for (const lvl of DAR_AL_SALAM_SEED.studyLevels) {
      batch.set(doc(db, 'studyLevels', lvl.id), lvl, { merge: true });
    }

    for (const blk of periodsList) {
      batch.set(doc(db, 'studyPeriods', blk.id), blk, { merge: true });
    }

    batch.set(doc(db, 'courseOfferings', defaultCourse.id), defaultCourse, { merge: true });

    await batch.commit();
  } catch (error: any) {
    console.warn('Firestore seed batch warning (saved in localStorage):', error);
  }

  try {
    await fetch('/api/admin/seed-dar-al-salam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ performedBy, itemsCount: count })
    });
  } catch (e) {}

  return {
    success: true,
    message: `تم تثبيت ومزامنة بذور جامعة دار السلام بنجاح (${count} كيان أكاديمي بدون تكرار).`,
    itemsCreated: count
  };
}
