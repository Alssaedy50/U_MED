/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Educational Resource Service
 * Manages low-bandwidth educational materials (PDFs, Histology Slides, Links)
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
import { EducationalResource, ResourceType } from '../types/umed.ts';

// Initial verified sample resources for Dar Al Salam University (Level 4 - CVS & RESP Blocks)
const SAMPLE_EDUCATIONAL_RESOURCES: EducationalResource[] = [
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
  try {
    let q = query(collection(db, 'educationalResources'));
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }
    if (filters.universityId) {
      q = query(q, where('universityId', '==', filters.universityId));
    }
    if (filters.studyLevelId) {
      q = query(q, where('studyLevelId', '==', filters.studyLevelId));
    }
    const snap = await getDocs(q);
    const list: EducationalResource[] = [];
    snap.forEach((d) => list.push(d.data() as EducationalResource));

    if (list.length > 0) {
      return applyLocalFilters(list, filters);
    }
  } catch (err) {
    console.warn('Firestore fetchEducationalResources error, using default sample library:', err);
  }

  // Fallback to sample library with local storage sync
  try {
    const cached = localStorage.getItem('umed_educational_resources');
    if (cached) {
      const parsed: EducationalResource[] = JSON.parse(cached);
      return applyLocalFilters(parsed, filters);
    }
  } catch (e) {}

  return applyLocalFilters(SAMPLE_EDUCATIONAL_RESOURCES, filters);
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
  try {
    await setDoc(doc(db, 'educationalResources', resource.id), {
      ...resource,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore saveEducationalResource failed, syncing to local storage cache:', err);
  }

  try {
    const existing: EducationalResource[] = JSON.parse(localStorage.getItem('umed_educational_resources') || '[]');
    const index = existing.findIndex(r => r.id === resource.id);
    if (index >= 0) {
      existing[index] = resource;
    } else {
      existing.unshift(resource);
    }
    localStorage.setItem('umed_educational_resources', JSON.stringify(existing));
  } catch (e) {}
}

export async function toggleResourceStatus(resourceId: string, newStatus: 'published' | 'draft' | 'archived'): Promise<void> {
  try {
    await updateDoc(doc(db, 'educationalResources', resourceId), {
      status: newStatus,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Firestore toggleResourceStatus error:', err);
  }

  try {
    const existing: EducationalResource[] = JSON.parse(localStorage.getItem('umed_educational_resources') || '[]');
    const target = existing.find(r => r.id === resourceId);
    if (target) {
      target.status = newStatus;
      target.updatedAt = new Date().toISOString();
      localStorage.setItem('umed_educational_resources', JSON.stringify(existing));
    }
  } catch (e) {}
}

export async function deleteEducationalResource(resourceId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'educationalResources', resourceId));
  } catch (err) {
    console.warn('Firestore deleteEducationalResource error:', err);
  }

  try {
    const existing: EducationalResource[] = JSON.parse(localStorage.getItem('umed_educational_resources') || '[]');
    const filtered = existing.filter(r => r.id !== resourceId);
    localStorage.setItem('umed_educational_resources', JSON.stringify(filtered));
  } catch (e) {}
}
