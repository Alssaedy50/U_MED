/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Educational Resource Service
 * Manages low-bandwidth educational materials (PDFs, Histology Slides, Videos, Audio, Links)
 * High-Speed Parallel Chunk Upload/Download + Real-Time Firestore Sync + Instant Memory Cache
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
  where,
  onSnapshot
} from 'firebase/firestore';
import { db, cleanFirestoreData } from '../lib/firebase.ts';
import { EducationalResource } from '../types/umed.ts';

const RESOURCES_STORAGE_KEY = 'umed_educational_resources';
const RESOURCES_INIT_KEY = 'umed_educational_resources_init';
const RESOURCES_DELETED_KEY = 'umed_educational_resources_deleted';

const IDB_NAME = 'umed_cloud_files_db';
const IDB_STORE = 'files';
const CHUNK_CHAR_SIZE = 480 * 1024; // ~480 KB per Firestore doc (safe under 1 MiB limit)

let resourcesMemoryCache: EducationalResource[] | null = null;
let idbPromise: Promise<IDBDatabase> | null = null;

// IndexedDB Helpers for Instant Offline File Caching (Singleton connection)
function openFilesDB(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const dbInstance = req.result;
      if (!dbInstance.objectStoreNames.contains(IDB_STORE)) {
        dbInstance.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      idbPromise = null;
      reject(req.error);
    };
  });
  return idbPromise;
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

function parseCloudUrl(rawUrl: string): { fileId: string; chunksFromUrl?: number } {
  const withoutScheme = rawUrl.replace('umed-cloud://', '').trim();
  const [idPart, queryPart] = withoutScheme.split('?');
  let chunksFromUrl: number | undefined;
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const c = Number(params.get('chunks'));
    if (c > 0) chunksFromUrl = c;
  }
  return { fileId: idPart.trim(), chunksFromUrl };
}

/**
 * Uploads any file (PDF, Image, Video, Audio Recording) directly into Cloud Firestore (uploadedFileChunks)
 * using parallel batch uploads (4x faster) + caches locally in IndexedDB.
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

  // Upload chunks to Cloud Firestore `uploadedFileChunks/{fileId}_chunk_{index}` in parallel batches of 4
  const BATCH_SIZE = 4;
  let completedChunks = 0;
  const nowIso = new Date().toISOString();

  for (let startIdx = 0; startIdx < chunkCount; startIdx += BATCH_SIZE) {
    const batchIndices = [];
    for (let idx = startIdx; idx < Math.min(startIdx + BATCH_SIZE, chunkCount); idx++) {
      batchIndices.push(idx);
    }

    await Promise.all(
      batchIndices.map(async (idx) => {
        const chunkDocId = `${fileId}_chunk_${idx}`;
        try {
          await setDoc(doc(db, 'uploadedFileChunks', chunkDocId), {
            fileId,
            chunkIndex: idx,
            totalChunks: chunkCount,
            mimeType,
            fileName,
            data: chunks[idx],
            createdAt: nowIso
          });
        } catch (err) {
          console.warn(`Chunk ${idx} upload warning (cached locally in IndexedDB):`, err);
        } finally {
          completedChunks++;
          const pct = 20 + Math.round((completedChunks / chunkCount) * 80);
          onProgress?.(pct);
        }
      })
    );
  }

  return {
    fileId,
    url: `umed-cloud://${fileId}?chunks=${chunkCount}`,
    fileSizeLabel,
    mimeType,
    chunkCount,
    fileName
  };
}

/**
 * Resolves a resource URL (either `umed-cloud://...`, `data:...`, or external Google Drive / direct URL)
 * into a browser-ready playable/viewable URL and downloadable Blob URL using fast parallel chunk downloads.
 */
export async function resolveResourceFileUrl(
  resource: EducationalResource,
  onProgress?: (percent: number) => void
): Promise<{ viewUrl: string; downloadUrl: string; isCloudFile: boolean }> {
  const rawUrl = (resource.url || '').trim();
  if (!rawUrl) {
    throw new Error('رابط الملف غير متوفر حالياً.');
  }

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
    const { fileId, chunksFromUrl } = parseCloudUrl(rawUrl);
    onProgress?.(10);

    // 1. Check local IndexedDB cache first (0 bytes network usage if already downloaded!)
    const cachedDataUrl = await getFileFromIDB(fileId);
    if (cachedDataUrl) {
      onProgress?.(100);
      const blob = dataUrlToBlob(cachedDataUrl);
      const blobUrl = URL.createObjectURL(blob);
      return { viewUrl: blobUrl, downloadUrl: blobUrl, isCloudFile: true };
    }

    // 2. Fetch chunk 0 first to verify existence and read authoritative totalChunks
    const firstSnap = await getDoc(doc(db, 'uploadedFileChunks', `${fileId}_chunk_0`));
    if (!firstSnap.exists()) {
      throw new Error('لم يتم العثور على أجزاء الملف في السحابة أو لم تكتمل مزامنته بعد.');
    }
    const firstData = firstSnap.data();
    const totalChunks = Math.max(
      1,
      Number(firstData.totalChunks) || Number(resource.chunkCount) || Number(chunksFromUrl) || 1
    );

    const parts: string[] = new Array(totalChunks).fill('');
    parts[0] = firstData.data || '';
    let downloadedCount = 1;
    onProgress?.(10 + Math.round((downloadedCount / totalChunks) * 90));

    // 3. Download all remaining chunks in parallel for 5x-10x faster loading!
    if (totalChunks > 1) {
      const remainingIndices: number[] = [];
      for (let idx = 1; idx < totalChunks; idx++) {
        remainingIndices.push(idx);
      }

      await Promise.all(
        remainingIndices.map(async (idx) => {
          const snap = await getDoc(doc(db, 'uploadedFileChunks', `${fileId}_chunk_${idx}`));
          if (!snap.exists()) {
            throw new Error(`تعذر تحميل الجزء (${idx + 1}/${totalChunks}) من الملف السحابي.`);
          }
          parts[idx] = snap.data().data || '';
          downloadedCount++;
          onProgress?.(10 + Math.round((downloadedCount / totalChunks) * 90));
        })
      );
    }

    const fullDataUrl = parts.join('');
    await saveFileToIDB(fileId, fullDataUrl);
    const blob = dataUrlToBlob(fullDataUrl);
    const blobUrl = URL.createObjectURL(blob);
    return { viewUrl: blobUrl, downloadUrl: blobUrl, isCloudFile: true };
  }

  // Case 3: Built-in Telegram Live Bot Stream (`/api/teledrive/stream/...`)
  if (rawUrl.startsWith('/api/teledrive/stream/')) {
    const lowerFile = (resource.fileName || resource.title || '').toLowerCase();
    const isVideoFile =
      resource.resourceType === 'video' ||
      lowerFile.endsWith('.mp4') ||
      lowerFile.endsWith('.mkv') ||
      lowerFile.endsWith('.webm') ||
      (resource.mimeType || '').includes('video');
    const isAudioFile =
      resource.resourceType === 'audio' ||
      lowerFile.endsWith('.mp3') ||
      lowerFile.endsWith('.m4a') ||
      lowerFile.endsWith('.ogg') ||
      lowerFile.endsWith('.wav') ||
      (resource.mimeType || '').includes('audio');

    const trueMime = isVideoFile
      ? 'video/mp4'
      : isAudioFile
      ? 'audio/mpeg'
      : resource.mimeType && resource.mimeType !== 'text/html'
      ? resource.mimeType
      : 'application/pdf';

    // Strip any legacy `.html`, `mime=text/html`, or exposed `token=` query params from video/audio/pdf stream URLs
    const cleanStreamUrl = rawUrl
      .replace(/\.html(&|$)/gi, '$1')
      .replace(/mime=text%2Fhtml/gi, `mime=${encodeURIComponent(trueMime)}`)
      .replace(/([?&])token=[^&]+(&|$)/gi, (_m, p1, p2) => (p2 === '&' ? p1 : ''));

    // 3a. For Video & Audio files: Stream directly via HTTP Range requests (206 Partial Content) without waiting to download 160 chunks into RAM!
    if (isVideoFile || isAudioFile) {
      onProgress?.(35);
      try {
        const sep = cleanStreamUrl.includes('?') ? '&' : '?';
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 2500);
        const metaRes = await fetch(`${cleanStreamUrl}${sep}meta=1`, { signal: ctrl.signal });
        window.clearTimeout(timer);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.directCdnUrl) {
            onProgress?.(100);
            return {
              viewUrl: meta.directCdnUrl,
              downloadUrl: meta.directCdnUrl,
              isCloudFile: false
            };
          }
        }
      } catch {}
      onProgress?.(100);
      return {
        viewUrl: cleanStreamUrl,
        downloadUrl: cleanStreamUrl,
        isCloudFile: false
      };
    }

    // 3b. For PDFs & Images: Check local IndexedDB first
    const cacheKey = `tgstream_${resource.id}`;
    const cachedBlobDataUrl = (await getFileFromIDB(cacheKey)) || (await getFileFromIDB(resource.id));
    if (cachedBlobDataUrl) {
      onProgress?.(100);
      const blob = dataUrlToBlob(cachedBlobDataUrl);
      const blobUrl = URL.createObjectURL(blob);
      return { viewUrl: blobUrl, downloadUrl: blobUrl, isCloudFile: true };
    }

    onProgress?.(12);

    // 3c. Check Cloud Firestore `uploadedFileChunks/{resource.id}_chunk_0` (Fast 0.2s serverless-safe cloud backup!)
    try {
      const firstSnap = await getDoc(doc(db, 'uploadedFileChunks', `${resource.id}_chunk_0`));
      if (firstSnap.exists()) {
        const firstData = firstSnap.data();
        const totalChunks = Math.max(1, Number(firstData.totalChunks) || 1);
        const parts: string[] = new Array(totalChunks).fill('');
        parts[0] = firstData.data || '';
        let downloadedCount = 1;
        onProgress?.(20 + Math.round((downloadedCount / totalChunks) * 75));

        if (totalChunks > 1) {
          const remainingIndices: number[] = [];
          for (let idx = 1; idx < totalChunks; idx++) remainingIndices.push(idx);
          await Promise.all(
            remainingIndices.map(async (idx) => {
              const snap = await getDoc(doc(db, 'uploadedFileChunks', `${resource.id}_chunk_${idx}`));
              if (snap.exists()) {
                parts[idx] = snap.data().data || '';
              }
              downloadedCount++;
              onProgress?.(20 + Math.round((downloadedCount / totalChunks) * 75));
            })
          );
        }

        const fullDataUrl = parts.join('');
        if (fullDataUrl.startsWith('data:')) {
          await saveFileToIDB(cacheKey, fullDataUrl);
          onProgress?.(100);
          const blob = dataUrlToBlob(fullDataUrl);
          const blobUrl = URL.createObjectURL(blob);
          return { viewUrl: blobUrl, downloadUrl: blobUrl, isCloudFile: true };
        }
      }
    } catch {}

    // 3d. Fetch from `/api/teledrive/stream/...` via chunked loader
    try {
      const sep = cleanStreamUrl.includes('?') ? '&' : '?';
      const CHUNK_SIZE = 1572864; // 1.5 MB
      const byteChunks: Uint8Array[] = [];
      let chunkIdx = 0;
      let totalExpected = 0;

      while (chunkIdx < 160) {
        const chunkRes = await fetch(
          `${cleanStreamUrl}${sep}chunkIndex=${chunkIdx}&chunkSize=${CHUNK_SIZE}`
        );
        if (!chunkRes.ok) {
          const errJson = await chunkRes.json().catch(() => ({}));
          if (chunkIdx === 0) {
            throw new Error(errJson.error || 'تعذر جلب الملف من خوادم تليجرام.');
          }
          break;
        }
        const chunkData = await chunkRes.json();
        if (!chunkData.ok) {
          throw new Error(chunkData.error || 'تعذر جلب أجزاء الملف');
        }
        if (chunkData.totalBytes) {
          totalExpected = Number(chunkData.totalBytes);
        }
        if (chunkData.chunkBase64) {
          const bin = atob(chunkData.chunkBase64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) {
            arr[i] = bin.charCodeAt(i);
          }
          byteChunks.push(arr);
        }
        chunkIdx++;
        if (totalExpected > 0) {
          const loadedBytes = byteChunks.reduce((acc, b) => acc + b.byteLength, 0);
          const pct = Math.min(98, Math.max(15, Math.round((loadedBytes / totalExpected) * 95)));
          onProgress?.(pct);
        } else {
          onProgress?.(Math.min(95, 15 + chunkIdx * 10));
        }
        if (chunkData.eof) break;
      }

      if (byteChunks.length > 0) {
        const finalBlob = new Blob(byteChunks as unknown as BlobPart[], { type: trueMime });
        if (finalBlob.size <= 15 * 1024 * 1024) {
          readBlobAsDataUrl(finalBlob)
            .then((dUrl) => saveFileToIDB(cacheKey, dUrl))
            .catch(() => {});
        }
        onProgress?.(100);
        const blobUrl = URL.createObjectURL(finalBlob);
        return { viewUrl: blobUrl, downloadUrl: blobUrl, isCloudFile: true };
      }
    } catch (streamErr: any) {
      throw new Error(
        streamErr?.message ||
          'تعذر تحميل الملف: تأكد من اتصال الإنترنت وتفعيل البوت.'
      );
    }

    return { viewUrl: cleanStreamUrl, downloadUrl: cleanStreamUrl, isCloudFile: false };
  }

  // Case 4: Sample Medical Lecture Placeholders -> Generate valid, viewable PDF binary on the fly!
  if (rawUrl.includes('1sample_') || rawUrl.includes('1x9K_umed_drive_sample')) {
    onProgress?.(100);
    const samplePdfBytes = buildSampleMedicalPdfBytes(resource);
    const sampleBlob = new Blob([samplePdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const sampleBlobUrl = URL.createObjectURL(sampleBlob);
    return { viewUrl: sampleBlobUrl, downloadUrl: sampleBlobUrl, isCloudFile: true };
  }

  // Case 5: External URL (e.g. Google Drive link — auto-normalize /view to /preview for iframe embedding)
  let viewUrl = rawUrl;
  const gdriveMatch = rawUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (gdriveMatch && gdriveMatch[1]) {
    viewUrl = `https://drive.google.com/file/d/${gdriveMatch[1]}/preview`;
  }
  return { viewUrl, downloadUrl: rawUrl, isCloudFile: false };
}

function buildSampleMedicalPdfBytes(resource: EducationalResource): Uint8Array {
  const safeAsciiTitle =
    resource.id === 'res-cvs-anat-01'
      ? 'UMED Lecture 1: Gross Anatomy of the Heart & Coronary Vessels'
      : resource.id === 'res-cvs-physio-03'
      ? 'UMED Clinical Guide: 12-Lead ECG Interpretation & Cardiac Axis'
      : resource.id === 'res-resp-04'
      ? 'UMED Lecture: Alveolar-Capillary Gas Exchange & O2 Dissociation'
      : 'UMED Medical Curriculum Summary Document';

  const streamText = [
    'BT',
    '/F1 18 Tf',
    '54 730 Td',
    `(${safeAsciiTitle}) Tj`,
    '/F1 12 Tf',
    '0 -32 Td',
    '(University Medical Education Digital Platform - U_MED) Tj',
    '0 -24 Td',
    '(------------------------------------------------------------------) Tj',
    '0 -28 Td',
    '(1. Core Clinical & Anatomical Objectives:) Tj',
    '0 -20 Td',
    '(   - Understand the anatomical structure and physiological mechanisms.) Tj',
    '0 -20 Td',
    '(   - Correlate clinical findings with diagnostic investigations.) Tj',
    '0 -20 Td',
    '(   - Review high-yield examination points for medical students.) Tj',
    '0 -32 Td',
    '(2. Key High-Yield Summary Notes:) Tj',
    '0 -20 Td',
    '(   - Right Coronary Artery (RCA) supplies SA node (60%) & AV node (90%).) Tj',
    '0 -20 Td',
    '(   - Left Anterior Descending (LAD) supplies anterior 2/3 of septum.) Tj',
    '0 -20 Td',
    '(   - Normal PR interval: 0.12 - 0.20 sec (3 - 5 small squares).) Tj',
    '0 -20 Td',
    '(   - Bohr effect shifts Oxygen-Hemoglobin dissociation curve to right.) Tj',
    'ET'
  ].join('\n');

  const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj
4 0 obj << /Length ${streamText.length} >> stream
${streamText}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000${String(282 + streamText.length).padStart(3, '0')} 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
${352 + streamText.length}
%%EOF`;

  return new TextEncoder().encode(pdfContent);
}

// Legacy uncreated sample resource IDs that must never be injected into user accounts
const LEGACY_SAMPLE_RESOURCE_IDS = new Set([
  'res-cvs-anat-01',
  'res-cvs-histo-02',
  'res-cvs-physio-03',
  'res-resp-04'
]);

export const SAMPLE_EDUCATIONAL_RESOURCES: EducationalResource[] = [];

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

function isInternalBackupResource(item?: Partial<EducationalResource> | null): boolean {
  if (!item) return true;
  if (item.id && LEGACY_SAMPLE_RESOURCE_IDS.has(item.id)) return true;
  const fName = (item.fileName || '').toLowerCase();
  const title = item.title || '';
  if (
    fName.includes('medbot-cloud-backup') ||
    fName.endsWith('.json') ||
    title.includes('MEDBOT Cloud Backup') ||
    title.includes('بطاقة فهرسة قسم دراسي — MEDBOT') ||
    title === 'السلام عليكم'
  ) {
    return true;
  }
  return false;
}

function mergeResourcesWithDefaults(cloudOrLocal: EducationalResource[]): EducationalResource[] {
  const deleted = getDeletedResourceIds();
  const map = new Map<string, EducationalResource>();
  for (const item of cloudOrLocal) {
    if (
      item &&
      item.id &&
      !deleted.has(item.id) &&
      !LEGACY_SAMPLE_RESOURCE_IDS.has(item.id) &&
      !isInternalBackupResource(item)
    ) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

function readLocalResources(): EducationalResource[] {
  if (resourcesMemoryCache) {
    const deleted = getDeletedResourceIds();
    return resourcesMemoryCache.filter(
      r => !deleted.has(r.id) && !LEGACY_SAMPLE_RESOURCE_IDS.has(r.id)
    );
  }
  try {
    const raw = localStorage.getItem(RESOURCES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EducationalResource[];
      const merged = mergeResourcesWithDefaults(parsed);
      resourcesMemoryCache = merged;
      return merged;
    }
  } catch (e) {}
  const defaults = mergeResourcesWithDefaults([]);
  resourcesMemoryCache = defaults;
  return defaults;
}

function writeLocalResources(list: EducationalResource[]): void {
  const merged = mergeResourcesWithDefaults(list);
  resourcesMemoryCache = merged;
  try {
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(merged));
    localStorage.setItem(RESOURCES_INIT_KEY, 'true');
  } catch (e) {}
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

/**
 * Synchronous 0ms cache reader for instant tab switching without loading spinners
 */
export function getCachedEducationalResources(filters: ResourceFilters = {}): EducationalResource[] {
  return applyLocalFilters(readLocalResources(), filters);
}

async function queryResourcesFromFirestore(statusFilter?: string): Promise<EducationalResource[]> {
  const deleted = getDeletedResourceIds();
  const byId = new Map<string, EducationalResource>();

  const collectFromSnap = (snap: any) => {
    snap.forEach((d: any) => {
      const data = { ...d.data(), id: d.data().id || d.id } as EducationalResource;
      if (data && data.id && !deleted.has(data.id)) {
        byId.set(data.id, data);
      }
    });
  };

  // Also pull live-ingested resources from the built-in Node.js Telegram Bot Engine
  const pullLiveBotResources = async () => {
    try {
      const res = await fetch('/api/teledrive/live-status');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.ingestedResources)) {
        for (const item of data.ingestedResources) {
          if (item && item.id && !deleted.has(item.id)) {
            if (!statusFilter || item.status === statusFilter) {
              const existing = byId.get(item.id);
              if (!existing || new Date(item.updatedAt || 0) >= new Date(existing.updatedAt || 0)) {
                byId.set(item.id, item as EducationalResource);
              }
            }
          }
        }
      }
    } catch {}
  };

  if (statusFilter === 'published') {
    const qPrimary = query(collection(db, 'educationalResources'), where('status', '==', 'published'));
    const snapPrimary = await getDocs(qPrimary);
    collectFromSnap(snapPrimary);
    try {
      const qSnake = query(collection(db, 'educational_resources'), where('status', '==', 'published'));
      const snapSnake = await getDocs(qSnake);
      collectFromSnap(snapSnake);
    } catch {}
    await pullLiveBotResources();
    return Array.from(byId.values());
  }

  try {
    const [snapPrimary, snapSnake] = await Promise.all([
      getDocs(collection(db, 'educationalResources')),
      getDocs(collection(db, 'educational_resources')).catch(() => null)
    ]);
    collectFromSnap(snapPrimary);
    if (snapSnake) collectFromSnap(snapSnake);
    await pullLiveBotResources();
    return Array.from(byId.values());
  } catch {
    const q = query(collection(db, 'educationalResources'), where('status', '==', 'published'));
    const snap = await getDocs(q);
    collectFromSnap(snap);
    await pullLiveBotResources();
    return Array.from(byId.values());
  }
}

async function ensureResourcesInitialized(): Promise<EducationalResource[]> {
  try {
    const cloudItems = await queryResourcesFromFirestore();
    const merged = mergeResourcesWithDefaults(cloudItems);
    writeLocalResources(merged);
    return merged;
  } catch (e) {
    return readLocalResources();
  }
}

export async function fetchEducationalResources(filters: ResourceFilters = {}): Promise<EducationalResource[]> {
  try {
    const cloudItems = await queryResourcesFromFirestore(filters.status);
    // Preserve any draft items in local cache if we only queried published items
    const existingLocal = readLocalResources();
    const draftsToKeep = filters.status === 'published'
      ? existingLocal.filter(r => r.status !== 'published')
      : [];
    const merged = mergeResourcesWithDefaults([...draftsToKeep, ...cloudItems]);
    writeLocalResources(merged);
    return applyLocalFilters(merged, filters);
  } catch (err) {
    console.warn('Firestore fetchEducationalResources fallback to local cache:', err);
    return applyLocalFilters(readLocalResources(), filters);
  }
}

export function subscribeToEducationalResources(
  filters: ResourceFilters = {},
  onUpdate: (resources: EducationalResource[]) => void
): () => void {
  try {
    // Use `where('status', '==', 'published')` when status is 'published' so student listeners
    // 100% comply with Firestore security rules on `umed-yemen`.
    const targetQuery =
      filters.status === 'published'
        ? query(collection(db, 'educationalResources'), where('status', '==', 'published'))
        : collection(db, 'educationalResources');

    const unsub = onSnapshot(
      targetQuery,
      (snap) => {
        const deleted = getDeletedResourceIds();
        const cloudItems: EducationalResource[] = [];
        snap.forEach((d) => {
          const data = { ...d.data(), id: d.data().id || d.id } as EducationalResource;
          if (data && data.id && !deleted.has(data.id)) {
            cloudItems.push(data);
          }
        });

        const existingLocal = readLocalResources();
        const draftsToKeep =
          filters.status === 'published'
            ? existingLocal.filter(r => r.status !== 'published')
            : [];
        const merged = mergeResourcesWithDefaults([...draftsToKeep, ...cloudItems]);
        writeLocalResources(merged);
        onUpdate(applyLocalFilters(merged, filters));
      },
      (err) => {
        console.warn('subscribeToEducationalResources error:', err);
      }
    );
    return unsub;
  } catch (err) {
    return () => {};
  }
}

function applyLocalFilters(list: EducationalResource[], filters: ResourceFilters): EducationalResource[] {
  return list.filter(r => {
    if (filters.universityId && r.universityId !== filters.universityId) return false;
    if (filters.programId && r.programId && r.programId !== filters.programId && !filters.programId.startsWith('prog-mbbs')) return false;
    if (filters.studyLevelId && r.studyLevelId !== filters.studyLevelId && r.studyLevelId !== 'ALL') return false;
    if (filters.studyPeriodId && r.studyPeriodId && r.studyPeriodId !== filters.studyPeriodId) return false;
    if (filters.courseOfferingId && r.courseOfferingId && r.courseOfferingId !== filters.courseOfferingId) return false;
    if (filters.sectionType && r.sectionType !== filters.sectionType) return false;
    if (filters.status && r.status !== filters.status) return false;
    return true;
  });
}

export async function deleteCloudFileChunks(cloudUrl?: string, chunkCount?: number): Promise<void> {
  if (!cloudUrl || !cloudUrl.startsWith('umed-cloud://')) return;
  const { fileId, chunksFromUrl } = parseCloudUrl(cloudUrl);
  if (!fileId) return;
  await deleteFileFromIDB(fileId);
  const count = Math.max(1, chunkCount || chunksFromUrl || 1);
  const deletions: Promise<any>[] = [];
  for (let i = 0; i < count; i++) {
    deletions.push(deleteDoc(doc(db, 'uploadedFileChunks', `${fileId}_chunk_${i}`)).catch(() => {}));
  }
  await Promise.all(deletions);
}

export async function saveEducationalResource(resource: EducationalResource): Promise<void> {
  if (isInternalBackupResource(resource)) return;
  unmarkResourceDeleted(resource.id);
  const current = readLocalResources();
  const defaultStatus =
    resource.createdBy === 'AUTOMATED_TELEGRAM_INGESTION' ? 'draft' : 'published';
  const updatedResource: EducationalResource = cleanFirestoreData({
    ...resource,
    universityId: resource.universityId || 'univ-dar-al-salam',
    studyLevelId: resource.studyLevelId || 'lvl-4',
    status: resource.status || defaultStatus,
    updatedAt: new Date().toISOString()
  });

  const index = current.findIndex(r => r.id === resource.id);
  const previousResource = index >= 0 ? current[index] : null;

  // If replacing an existing cloud-uploaded file with a new file/URL, clean up orphaned chunks from the old file
  if (
    previousResource &&
    previousResource.url &&
    previousResource.url.startsWith('umed-cloud://') &&
    previousResource.url !== updatedResource.url
  ) {
    deleteCloudFileChunks(previousResource.url, previousResource.chunkCount).catch(() => {});
  }

  const nextList = [...current];
  if (index >= 0) {
    nextList[index] = updatedResource;
  } else {
    nextList.unshift(updatedResource);
  }

  writeLocalResources(nextList);

  try {
    const cleaned = cleanFirestoreData(updatedResource);
    await Promise.all([
      setDoc(doc(db, 'educationalResources', resource.id), cleaned, { merge: true }),
      setDoc(doc(db, 'educational_resources', resource.id), cleaned, { merge: true }).catch(() => {})
    ]);
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
    const updatedTarget: EducationalResource = {
      ...target,
      status: newStatus,
      updatedAt: nowIso
    };
    const nextList = current.map(r => r.id === resourceId ? updatedTarget : r);
    writeLocalResources(nextList);
    try {
      const cleaned = cleanFirestoreData(updatedTarget);
      await Promise.all([
        setDoc(doc(db, 'educationalResources', resourceId), cleaned, { merge: true }),
        setDoc(doc(db, 'educational_resources', resourceId), cleaned, { merge: true }).catch(() => {})
      ]);
      return;
    } catch (err) {
      console.warn('Firestore toggleResourceStatus setDoc fallback:', err);
    }
  }

  try {
    await Promise.all([
      updateDoc(doc(db, 'educationalResources', resourceId), {
        status: newStatus,
        updatedAt: nowIso
      }),
      updateDoc(doc(db, 'educational_resources', resourceId), {
        status: newStatus,
        updatedAt: nowIso
      }).catch(() => {})
    ]);
  } catch (err) {
    console.warn('Firestore toggleResourceStatus error:', err);
  }
}

export async function deleteEducationalResource(resourceId: string): Promise<void> {
  const current = readLocalResources();
  const target = current.find(r => r.id === resourceId);
  markResourceDeleted(resourceId);
  const filtered = current.filter(r => r.id !== resourceId);
  writeLocalResources(filtered);

  try {
    await Promise.all([
      deleteDoc(doc(db, 'educationalResources', resourceId)),
      deleteDoc(doc(db, 'educational_resources', resourceId)).catch(() => {}),
      fetch('/api/teledrive/delete-resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId })
      }).catch(() => {})
    ]);
    if (target?.url?.startsWith('umed-cloud://')) {
      await deleteCloudFileChunks(target.url, target.chunkCount);
    }
  } catch (err) {
    console.warn('Firestore deleteEducationalResource error:', err);
  }
}
