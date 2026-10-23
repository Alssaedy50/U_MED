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
  getDoc,
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { db, cleanFirestoreData } from '../lib/firebase.ts';
import { EducationalResource } from '../types/umed.ts';

const RESOURCES_STORAGE_KEY = 'umed_educational_resources';
const RESOURCES_INIT_KEY = 'umed_educational_resources_init';
const RESOURCES_DELETED_KEY = 'umed_educational_resources_deleted';

const IDB_NAME = 'umed_cloud_files_db';
const IDB_STORE = 'files';
const CHUNK_CHAR_SIZE = 480 * 1024; // ~480 KB per Firestore doc (safe under 1 MiB limit)

// IndexedDB Helpers for Instant Offline File Caching
function openFilesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const dbInstance = req.result;
      if (!dbInstance.objectStoreNames.contains(IDB_STORE)) {
        dbInstance.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveFileToIDB(fileId: string, dataUrl: string): Promise<void> {
  try {
    const idb = await openFilesDB();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(dataUrl, fileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

async function getFileFromIDB(fileId: string): Promise<string | null> {
  try {
    const idb = await openFilesDB();
    return await new Promise<string | null>((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(fileId);
      req.onsuccess = () => resolve((req.result as string) || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function deleteFileFromIDB(fileId: string): Promise<void> {
  try {
    const idb = await openFilesDB();
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(fileId);
  } catch (e) {}
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('تعذر قراءة الملف من الجهاز'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const header = parts[0] || '';
  const base64 = parts[1] || '';
  const mimeMatch = header.match(/data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
}

/**
 * Uploads any file (PDF, Image, Audio Recording) directly into Cloud Firestore (uploadedFileChunks)
 * + caches locally in IndexedDB. Works 100% on the free Firebase Spark tier with zero extra config.
 */
export async function uploadFileToCloudFirestore(
  file: File | Blob,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<{
  fileId: string;
  url: string;
  fileSizeLabel: string;
  mimeType: string;
  chunkCount: number;
  fileName: string;
}> {
  const maxBytes = 15 * 1024 * 1024; // 15 MB safeguard
  if (file.size > maxBytes) {
    throw new Error('حجم الملف يتجاوز الحد الأقصى المسموح به للرفع المباشر (15 ميجابايت). للملفات الضخمة يرجى رفعها على Google Drive ووضع الرابط.');
  }

  onProgress?.(5);
  const dataUrl = await readBlobAsDataUrl(file);
  const fileId = `file-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const mimeType = file.type || 'application/octet-stream';
  const fileSizeLabel = formatFileSize(file.size);

  // Split into safe chunks for Firestore
  const chunks: string[] = [];
  for (let i = 0; i < dataUrl.length; i += CHUNK_CHAR_SIZE) {
    chunks.push(dataUrl.slice(i, i + CHUNK_CHAR_SIZE));
  }
  const chunkCount = chunks.length;

  // Save to local IndexedDB immediately so local preview is instant
  await saveFileToIDB(fileId, dataUrl);
  onProgress?.(20);

  // Upload chunks to Cloud Firestore `uploadedFileChunks/{fileId}_chunk_{index}`
  for (let idx = 0; idx < chunkCount; idx++) {
    const chunkDocId = `${fileId}_chunk_${idx}`;
    try {
      await setDoc(doc(db, 'uploadedFileChunks', chunkDocId), {
        fileId,
        chunkIndex: idx,
        totalChunks: chunkCount,
        mimeType,
        fileName,
        data: chunks[idx],
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn(`Chunk ${idx} upload warning (cached locally in IndexedDB):`, err);
    }
    const pct = 20 + Math.round(((idx + 1) / chunkCount) * 80);
    onProgress?.(pct);
  }

  return {
    fileId,
    url: `umed-cloud://${fileId}`,
    fileSizeLabel,
    mimeType,
    chunkCount,
    fileName
  };
}

/**
 * Resolves a resource URL (either `umed-cloud://...`, `data:...`, or external Google Drive / direct URL)
 * into a browser-ready playable/viewable URL and downloadable Blob URL.
 */
export async function resolveResourceFileUrl(
  resource: EducationalResource,
  onProgress?: (percent: number) => void
): Promise<{ viewUrl: string; downloadUrl: string; isCloudFile: boolean }> {
  const rawUrl = (resource.url || '').trim();

  // Case 1: Direct Data URL
  if (rawUrl.startsWith('data:')) {
    try {
      const blob = dataUrlToBlob(rawUrl);
      const blobUrl = URL.createObjectURL(blob);
      return { viewUrl: blobUrl, downloadUrl: blobUrl, isCloudFile: true };
    } catch {
      return { viewUrl: rawUrl, downloadUrl: rawUrl, isCloudFile: true };
    }
  }

  // Case 2: Cloud Firestore Chunked File (`umed-cloud://<fileId>`)
  if (rawUrl.startsWith('umed-cloud://')) {
    const fileId = rawUrl.replace('umed-cloud://', '').trim();
    onProgress?.(10);

    // 1. Check local IndexedDB cache first (0 bytes network usage if already downloaded!)
    const cachedDataUrl = await getFileFromIDB(fileId);
    if (cachedDataUrl) {
      onProgress?.(100);
      const blob = dataUrlToBlob(cachedDataUrl);
      const blobUrl = URL.createObjectURL(blob);
      return { viewUrl: blobUrl, downloadUrl: blobUrl, isCloudFile: true };
    }

    // 2. Fetch chunks from Cloud Firestore `uploadedFileChunks`
    const expectedChunks = resource.chunkCount || 1;
    const parts: string[] = [];
    for (let idx = 0; idx < expectedChunks; idx++) {
      const snap = await getDoc(doc(db, 'uploadedFileChunks', `${fileId}_chunk_${idx}`));
      if (!snap.exists()) {
        throw new Error('لم يتم العثور على أجزاء الملف في السحابة أو لم تكتمل مزامنته بعد.');
      }
      const chunkData = snap.data();
      parts.push(chunkData.data || '');
      onProgress?.(10 + Math.round(((idx + 1) / expectedChunks) * 90));
    }

    const fullDataUrl = parts.join('');
    await saveFileToIDB(fileId, fullDataUrl);
    const blob = dataUrlToBlob(fullDataUrl);
    const blobUrl = URL.createObjectURL(blob);
    return { viewUrl: blobUrl, downloadUrl: blobUrl, isCloudFile: true };
  }

  // Case 3: External URL (e.g. Google Drive link — auto-normalize /view to /preview for iframe embedding)
  let viewUrl = rawUrl;
  const gdriveMatch = rawUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (gdriveMatch && gdriveMatch[1]) {
    viewUrl = `https://drive.google.com/file/d/${gdriveMatch[1]}/preview`;
  }
  return { viewUrl, downloadUrl: rawUrl, isCloudFile: false };
}

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
  const updatedResource: EducationalResource = cleanFirestoreData({
    ...resource,
    updatedAt: new Date().toISOString()
  });

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
    await setDoc(doc(db, 'educationalResources', resource.id), cleanFirestoreData(updatedResource), { merge: true });
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
  const target = current.find(r => r.id === resourceId);
  markResourceDeleted(resourceId);
  const filtered = current.filter(r => r.id !== resourceId);

  try {
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {}

  try {
    await deleteDoc(doc(db, 'educationalResources', resourceId));
    // Also clean up cloud file chunks if it was a direct upload
    if (target?.url?.startsWith('umed-cloud://')) {
      const fileId = target.url.replace('umed-cloud://', '').trim();
      await deleteFileFromIDB(fileId);
      const count = target.chunkCount || 1;
      for (let i = 0; i < count; i++) {
        await deleteDoc(doc(db, 'uploadedFileChunks', `${fileId}_chunk_${i}`)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Firestore deleteEducationalResource error:', err);
  }
}
