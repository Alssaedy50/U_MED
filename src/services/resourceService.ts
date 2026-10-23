/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Educational Resource Service
 * Manages low-bandwidth educational materials (PDFs, Histology Slides, Links)
 * Full Dynamic CRUD with Hybrid Firestore + LocalStorage Synchronization
 */

import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { EducationalResource } from '../types/umed.ts';

const RESOURCES_STORAGE_KEY = 'umed_educational_resources';
const RESOURCES_INIT_KEY = 'umed_educational_resources_init';
const RESOURCES_DELETED_KEY = 'umed_educational_resources_deleted';

// Initial verified sample resources for Dar Al Salam University (Level 4 - CVS & RESP Blocks)
export const SAMPLE_EDUCATIONAL_RESOURCES: EducationalResource[] = [
  {
    id: 'res-cvs-anat-01',
    title: 'محاضرة تشريح القلب والأوعية الكبرى (Gross Anatomy of Heart)',
    description: 'شرح تفصيلي لتشريح حجرات القلب والصمامات والتروية التاجية مع مخططات توضيحية.',
    resourceType: 'pdf',
    url: 'https://drive.google.com/file/d/1sample_cvs_anatomy/preview',
    fileSizeLabel: '1.8 MB',
    universityId: 'univ-dar-al-salam',
    programId: 'prog-mbbs',
    curriculumVersionId: 'cur-dar-2024',
    studyLevelId: 'lvl-4',
    studyPeriodId: 'blk-cvs',
    courseOfferingId: 'crs-anat-cvs',
    sectionType: 'theoretical',
    status: 'published',
    createdBy: 'DR_ALSSAEDY',
    createdAt: '2025-09-10T10:00:00Z',
    updatedAt: '2025-09-10T10:00:00Z'
  },
  {
    id: 'res-cvs-histo-02',
    title: 'شريحة هستولوجي: عضلة القلب والأقراص البينية (Cardiac Muscle Histology)',
    description: 'صورة مجهرية عالية الدقة للشريحة النسيجية لعضلة القلب وتفرعات الألياف العضلية والأقراص البينية (Intercalated Discs).',
    resourceType: 'image',
    url: 'https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&w=1200&q=80',
    fileSizeLabel: '420 KB',
    universityId: 'univ-dar-al-salam',
    programId: 'prog-mbbs',
    curriculumVersionId: 'cur-dar-2024',
    studyLevelId: 'lvl-4',
    studyPeriodId: 'blk-cvs',
    courseOfferingId: 'crs-anat-cvs',
    sectionType: 'practical',
    status: 'published',
    createdBy: 'DR_ALSSAEDY',
    createdAt: '2025-09-12T14:30:00Z',
    updatedAt: '2025-09-12T14:30:00Z'
  },
  {
    id: 'res-cvs-physio-03',
    title: 'دليل تخطيط كهربية القلب السريري (ECG Interpretation Guide)',
    description: 'ملف تفاعلي لقراءة ورسم موجات تخطيط القلب السريرية وحساب المحور الكهربائي للقلب.',
    resourceType: 'pdf',
    url: 'https://drive.google.com/file/d/1sample_ecg_guide/preview',
    fileSizeLabel: '2.4 MB',
    universityId: 'univ-dar-al-salam',
    programId: 'prog-mbbs',
    curriculumVersionId: 'cur-dar-2024',
    studyLevelId: 'lvl-4',
    studyPeriodId: 'blk-cvs',
    courseOfferingId: 'crs-anat-cvs',
    sectionType: 'practical',
    status: 'published',
    createdBy: 'DR_ALSSAEDY',
    createdAt: '2025-09-15T09:00:00Z',
    updatedAt: '2025-09-15T09:00:00Z'
  },
  {
    id: 'res-resp-04',
    title: 'محاضرة فسيولوجيا التبادل الغازي الرئوي (Gas Exchange Physiology)',
    description: 'آليات انتشار الأكسجين وثاني أكسيد الكربون عبر الغشاء السنخي الشعيري ومنحنى تفكك الأكسي هيموجلوبين.',
    resourceType: 'pdf',
    url: 'https://drive.google.com/file/d/1sample_gas_exchange/preview',
    fileSizeLabel: '1.2 MB',
    universityId: 'univ-dar-al-salam',
    programId: 'prog-mbbs',
    curriculumVersionId: 'cur-dar-2024',
    studyLevelId: 'lvl-4',
    studyPeriodId: 'blk-rs',
    sectionType: 'theoretical',
    status: 'published',
    createdBy: 'DR_ALSSAEDY',
    createdAt: '2025-09-20T11:00:00Z',
    updatedAt: '2025-09-20T11:00:00Z'
  }
];

function getDeletedResourceIds(): Set<string> {
  try {
    const raw = localStorage.getItem(RESOURCES_DELETED_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}

function markResourceDeleted(id: string): void {
  try {
    const set = getDeletedResourceIds();
    set.add(id);
    localStorage.setItem(RESOURCES_DELETED_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

function unmarkResourceDeleted(id: string): void {
  try {
    const set = getDeletedResourceIds();
    if (set.has(id)) {
      set.delete(id);
      localStorage.setItem(RESOURCES_DELETED_KEY, JSON.stringify(Array.from(set)));
    }
  } catch (e) {}
}

async function ensureResourcesInitialized(): Promise<EducationalResource[]> {
  const deleted = getDeletedResourceIds();
  const isInit = localStorage.getItem(RESOURCES_INIT_KEY) === 'true';

  try {
    const raw = localStorage.getItem(RESOURCES_STORAGE_KEY);
    if (isInit && raw !== null) {
      const parsed: EducationalResource[] = JSON.parse(raw);
      return parsed.filter(r => !deleted.has(r.id));
    }
  } catch (e) {}

  const mergedMap = new Map<string, EducationalResource>();
  SAMPLE_EDUCATIONAL_RESOURCES.forEach(item => {
    if (!deleted.has(item.id)) mergedMap.set(item.id, item);
  });

  try {
    const snap = await getDocs(collection(db, 'educationalResources'));
    snap.forEach(d => {
      const data = d.data() as EducationalResource;
      if (data && data.id && !deleted.has(data.id)) {
        mergedMap.set(data.id, data);
      }
    });
  } catch (e) {}

  const list = Array.from(mergedMap.values());
  try {
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(list));
    localStorage.setItem(RESOURCES_INIT_KEY, 'true');
  } catch (e) {}

  return list;
}

export interface ResourceFilters {
  universityId?: string;
  programId?: string;
  studyLevelId?: string;
  studyPeriodId?: string;
  courseOfferingId?: string;
  sectionType?: 'theoretical' | 'practical' | 'general';
  status?: 'published' | 'draft' | 'archived';
}

export async function fetchEducationalResources(filters: ResourceFilters = {}): Promise<EducationalResource[]> {
  const deleted = getDeletedResourceIds();
  const localList = await ensureResourcesInitialized();
  const mergedMap = new Map<string, EducationalResource>();

  localList.forEach(item => {
    if (!deleted.has(item.id)) mergedMap.set(item.id, item);
  });

  try {
    const snap = await getDocs(collection(db, 'educationalResources'));
    snap.forEach((d) => {
      const data = d.data() as EducationalResource;
      if (data && data.id && !deleted.has(data.id)) {
        // Keep local edits if newer
        const existingLocal = mergedMap.get(data.id);
        if (!existingLocal || (data.updatedAt && existingLocal.updatedAt && data.updatedAt >= existingLocal.updatedAt)) {
          mergedMap.set(data.id, data);
        }
      }
    });
  } catch (err) {
    console.warn('Firestore fetchEducationalResources fallback to local cache:', err);
  }

  const finalItems = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  try {
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(finalItems));
    localStorage.setItem(RESOURCES_INIT_KEY, 'true');
  } catch (e) {}

  return applyLocalFilters(finalItems, filters);
}

function applyLocalFilters(list: EducationalResource[], filters: ResourceFilters): EducationalResource[] {
  return list.filter(r => {
    if (filters.universityId && r.universityId !== filters.universityId) return false;
    if (filters.programId && r.programId !== filters.programId) return false;
    if (filters.studyLevelId && r.studyLevelId !== filters.studyLevelId) return false;
    if (filters.studyPeriodId && r.studyPeriodId && r.studyPeriodId !== filters.studyPeriodId) return false;
    if (filters.courseOfferingId && r.courseOfferingId && r.courseOfferingId !== filters.courseOfferingId) return false;
    if (filters.sectionType && r.sectionType !== filters.sectionType) return false;
    if (filters.status && r.status !== filters.status) return false;
    return true;
  });
}

export async function saveEducationalResource(resource: EducationalResource): Promise<void> {
  unmarkResourceDeleted(resource.id);
  const current = await ensureResourcesInitialized();
  const updatedResource: EducationalResource = {
    ...resource,
    updatedAt: new Date().toISOString()
  };

  const index = current.findIndex(r => r.id === resource.id);
  if (index >= 0) {
    current[index] = updatedResource;
  } else {
    current.unshift(updatedResource);
  }

  try {
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(current));
    localStorage.setItem(RESOURCES_INIT_KEY, 'true');
  } catch (e) {}

  try {
    await setDoc(doc(db, 'educationalResources', resource.id), updatedResource, { merge: true });
  } catch (err) {
    console.warn('Firestore saveEducationalResource fallback to localStorage:', err);
  }
}

export const updateEducationalResource = saveEducationalResource;

export async function toggleResourceStatus(resourceId: string, newStatus: 'published' | 'draft' | 'archived'): Promise<void> {
  const current = await ensureResourcesInitialized();
  const nowIso = new Date().toISOString();
  const target = current.find(r => r.id === resourceId);
  if (target) {
    target.status = newStatus;
    target.updatedAt = nowIso;
    try {
      localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(current));
    } catch (e) {}
  }

  try {
    await updateDoc(doc(db, 'educationalResources', resourceId), {
      status: newStatus,
      updatedAt: nowIso
    });
  } catch (err) {
    console.warn('Firestore toggleResourceStatus error:', err);
  }
}

export async function deleteEducationalResource(resourceId: string): Promise<void> {
  const current = await ensureResourcesInitialized();
  markResourceDeleted(resourceId);
  const filtered = current.filter(r => r.id !== resourceId);

  try {
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {}

  try {
    await deleteDoc(doc(db, 'educationalResources', resourceId));
  } catch (err) {
    console.warn('Firestore deleteEducationalResource error:', err);
  }
}
