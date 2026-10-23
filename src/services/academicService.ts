/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Academic Hierarchy Service
 * Manages Universities, Colleges, Programs, Curricula, Levels, Blocks, and Courses
 * High-Speed In-Memory Cache + Real-Time Firestore Sync + LocalStorage Persistence & Cascade Deletion
 */

import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase.ts';
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
// Hybrid In-Memory + LocalStorage + Real-Time Firestore Synchronization
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

export type CollectionKey = Exclude<keyof typeof STORAGE_KEYS, 'deletedIds'>;

const FIRESTORE_COLLECTIONS: Record<CollectionKey, string> = {
  countries: 'countries',
  universities: 'universities',
  colleges: 'colleges',
  programs: 'programs',
  curriculumVersions: 'curriculumVersions',
  studyLevels: 'studyLevels',
  studyPeriods: 'studyPeriods',
  courseOfferings: 'courseOfferings'
};

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

// Fast in-memory cache for 0ms synchronous access across tabs
const memoryCache: Partial<Record<CollectionKey, any[]>> = {};
const syncedCollections = new Set<CollectionKey>();
const inFlightFetches: Partial<Record<CollectionKey, Promise<any[]>>> = {};
const hierarchyListeners = new Set<() => void>();
let realtimeWatchersStarted = false;

function notifyHierarchyListeners() {
  hierarchyListeners.forEach(cb => {
    try {
      cb();
    } catch (e) {}
  });
}

function getDeletedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.deletedIds);
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}

function saveDeletedIds(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.deletedIds, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function markIdDeleted(id: string): void {
  const set = getDeletedIds();
  set.add(id);
  saveDeletedIds(set);
  // Sync deleted IDs to system/deleted_entities if user is platform owner / admin
  if (auth.currentUser) {
    setDoc(
      doc(db, 'system', 'deleted_entities'),
      { ids: Array.from(set), updatedAt: new Date().toISOString() },
      { merge: true }
    ).catch(() => {});
  }
}

function unmarkIdDeleted(id: string): void {
  const set = getDeletedIds();
  if (set.has(id)) {
    set.delete(id);
    saveDeletedIds(set);
    if (auth.currentUser) {
      setDoc(
        doc(db, 'system', 'deleted_entities'),
        { ids: Array.from(set), updatedAt: new Date().toISOString() },
        { merge: true }
      ).catch(() => {});
    }
  }
}

function clearDeletedIds(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.deletedIds);
    if (auth.currentUser) {
      setDoc(
        doc(db, 'system', 'deleted_entities'),
        { ids: [], updatedAt: new Date().toISOString() },
        { merge: true }
      ).catch(() => {});
    }
  } catch (e) {}
}

function mergeWithDefaults<T extends { id: string }>(key: CollectionKey, cloudOrLocalItems: T[]): T[] {
  const deleted = getDeletedIds();
  const defaults = (DEFAULT_SEED_DATA[key] as T[]) || [];
  const mergedMap = new Map<string, T>();

  for (const defItem of defaults) {
    if (!deleted.has(defItem.id)) {
      mergedMap.set(defItem.id, defItem);
    }
  }
  for (const item of cloudOrLocalItems) {
    if (item && item.id && !deleted.has(item.id)) {
      mergedMap.set(item.id, item);
    }
  }
  return Array.from(mergedMap.values());
}

function readLocalCollection<T extends { id: string }>(key: CollectionKey): T[] | null {
  if (memoryCache[key]) {
    const deleted = getDeletedIds();
    return (memoryCache[key] as T[]).filter(item => !deleted.has(item.id));
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as T[];
      const merged = mergeWithDefaults<T>(key, parsed);
      memoryCache[key] = merged;
      return merged;
    }
  } catch (e) {}
  return null;
}

function writeLocalCollection<T extends { id: string }>(key: CollectionKey, items: T[]): void {
  const deleted = getDeletedIds();
  const clean = items.filter(item => item && item.id && !deleted.has(item.id));
  memoryCache[key] = clean;
  try {
    localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(clean));
    localStorage.setItem(`${STORAGE_KEYS[key]}_init`, 'true');
  } catch (e) {}
}

/**
 * Synchronous instant cache reader for UI components to avoid loading spinners on tab switch
 */
export function getCachedCollection<T extends { id: string }>(
  key: CollectionKey,
  filterFn?: (item: T) => boolean
): T[] {
  const existing = readLocalCollection<T>(key) || mergeWithDefaults<T>(key, []);
  return filterFn ? existing.filter(filterFn) : existing;
}

/**
 * Starts real-time Firestore listeners for all academic hierarchy collections so any change made
 * by an admin or batch representative is immediately reflected across all connected users.
 */
export function startAcademicRealtimeSync(): void {
  if (realtimeWatchersStarted || !db) return;
  realtimeWatchersStarted = true;

  // Listen to shared deleted entity IDs
  try {
    onSnapshot(
      doc(db, 'system', 'deleted_entities'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.ids)) {
            saveDeletedIds(new Set(data.ids));
            notifyHierarchyListeners();
          }
        }
      },
      () => {}
    );
  } catch (e) {}

  (Object.keys(FIRESTORE_COLLECTIONS) as CollectionKey[]).forEach((key) => {
    const colName = FIRESTORE_COLLECTIONS[key];
    try {
      onSnapshot(
        collection(db, colName),
        (snap) => {
          const cloudItems: any[] = [];
          snap.forEach((d) => {
            const data = d.data();
            if (data && (data.id || d.id)) {
              cloudItems.push({ ...data, id: data.id || d.id });
            }
          });
          const merged = mergeWithDefaults(key, cloudItems);
          writeLocalCollection(key, merged);
          syncedCollections.add(key);
          notifyHierarchyListeners();
        },
        () => {}
      );
    } catch (e) {}
  });
}

export function subscribeToAcademicHierarchy(onUpdate: () => void): () => void {
  startAcademicRealtimeSync();
  hierarchyListeners.add(onUpdate);
  return () => {
    hierarchyListeners.delete(onUpdate);
  };
}

async function ensureCollectionInitialized<T extends { id: string }>(
  key: CollectionKey,
  firestoreCollectionName: string
): Promise<T[]> {
  startAcademicRealtimeSync();
  const currentLocal = readLocalCollection<T>(key);
  if (currentLocal !== null && syncedCollections.has(key)) {
    return currentLocal;
  }

  const deleted = getDeletedIds();
  let firestoreList: T[] = [];
  try {
    const snap = await getDocs(collection(db, firestoreCollectionName));
    snap.forEach(d => {
      const data = d.data() as T;
      const item = { ...data, id: data.id || d.id };
      if (!deleted.has(item.id)) {
        firestoreList.push(item);
      }
    });
    syncedCollections.add(key);
  } catch (e) {}

  const merged = mergeWithDefaults<T>(key, [...(currentLocal || []), ...firestoreList]);
  writeLocalCollection(key, merged);
  return merged;
}

async function upsertHybridItem<T extends { id: string }>(
  key: CollectionKey,
  firestoreCollectionName: string,
  item: T
): Promise<void> {
  unmarkIdDeleted(item.id);
  const current = readLocalCollection<T>(key) || mergeWithDefaults<T>(key, []);
  const idx = current.findIndex(existing => existing.id === item.id);
  const updatedList = [...current];
  if (idx >= 0) {
    updatedList[idx] = { ...updatedList[idx], ...item };
  } else {
    updatedList.push(item);
  }
  writeLocalCollection(key, updatedList);
  notifyHierarchyListeners();

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
  const current = readLocalCollection<T>(key) || mergeWithDefaults<T>(key, []);
  markIdDeleted(id);
  const filtered = current.filter(item => item.id !== id);
  writeLocalCollection(key, filtered);
  notifyHierarchyListeners();

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
  startAcademicRealtimeSync();

  // If already synced in this session via getDocs or onSnapshot, return from memoryCache in 0ms!
  if (syncedCollections.has(key) && memoryCache[key]) {
    const cached = readLocalCollection<T>(key) || [];
    return filterFn ? cached.filter(filterFn) : cached;
  }

  // Deduplicate concurrent network requests for the same collection
  if (!inFlightFetches[key]) {
    inFlightFetches[key] = (async () => {
      try {
        const snap = await getDocs(collection(db, firestoreCollectionName));
        const cloudItems: T[] = [];
        snap.forEach((d) => {
          const data = d.data() as T;
          if (data && (data.id || d.id)) {
            cloudItems.push({ ...data, id: data.id || d.id });
          }
        });
        const merged = mergeWithDefaults<T>(key, cloudItems);
        writeLocalCollection(key, merged);
        syncedCollections.add(key);
        return merged;
      } catch (err) {
        const fallback = readLocalCollection<T>(key) || mergeWithDefaults<T>(key, []);
        writeLocalCollection(key, fallback);
        return fallback;
      } finally {
        delete inFlightFetches[key];
      }
    })();
  }

  const list = (await inFlightFetches[key]) as T[];
  return filterFn ? list.filter(filterFn) : list;
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
  startAcademicRealtimeSync();
  try {
    return onSnapshot(
      collection(db, 'universities'),
      (snap) => {
        const list: University[] = [];
        snap.forEach(d => {
          const data = d.data() as University;
          if (data && (data.id || d.id)) list.push({ ...data, id: data.id || d.id });
        });
        const merged = mergeWithDefaults<University>('universities', list);
        writeLocalCollection('universities', merged);
        syncedCollections.add('universities');
        onUpdate(merged);
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
  const enriched: StudyPeriod = {
    ...period,
    universityId: period.universityId || 'univ-dar-al-salam'
  };
  await upsertHybridItem<StudyPeriod>('studyPeriods', 'studyPeriods', enriched);
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
  const enriched: CourseOffering = {
    ...course,
    universityId: course.universityId || 'univ-dar-al-salam'
  };
  await upsertHybridItem<CourseOffering>('courseOfferings', 'courseOfferings', enriched);
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
  notifyHierarchyListeners();

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
