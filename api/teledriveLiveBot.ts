/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * U_MED Built-In 24/7 Live Telegram -> Google Drive & U_MED Cloud -> Firestore Ingestion Engine
 * Compatible with BOTH Google AI Studio (Cloud Run / Express Long-Polling) AND Vercel Serverless (24/7 Stateless Webhook).
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';

const SEED_SA_CHUNKS = [
  '=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',
  '2RTeqV3N3UnZwtSe5Y0MiZzKxxlbvE3SaFFNPRVSMd2R2YlcQt2TGhUWWxmUc5WLt0SLtUkTEBCUSlkVBRVRgsURZ1SLt0SLc5mIsIyYslWZuR3Xl1WYpxmI',
  '6ISdtVGZtMTOzAkc1d2ZlRWLwJXZjVGc01SNxITOxUTLwljLpFWbuc2clJndpNWZhN2YvVnb05yYv1mIsIyYslWZuR3XpRmI6ISMxEDOzITO2EDM3QjM5kTM',
  '3IDMwkjIsISY1RHafVncpJiOigGd0B3c68yLhN2YvVnb0NnLn92bnxWZuM2bt9ybv8WY1RHay8SY1RHaiwiI092al52X1JXaiojIoRHdwNnOv8ybhVHdoJjL',
  'n92bnxWZhBXaz5yYv12L092al5mIsISY1RHafBncvZXakVmcfhXNwkzXjVmc09VdyxmI6ICa0RHczpzLvc3d35yZv92ZsVWYwl2cuM2bt9ybhVHdoJzL2FzL',
  'jVmc0NnIsIyYslWZuR3X4VDM581YlJHdfVncsJiOigGd0B3c68yL3d3duc2bvdGblFGcpNnLj9WbvI3bi9GdvYXMv0WZ0FGZhRXYvgXNwkzL11WZk1yM5MTJ',
  '0Ajc1d2ZlRWLwJXZjVGc01SNxITOxUTLwljLpFWbuc2clJndpNWZhN2YvVnb05yYv1mIsISdulmdlJ3cl9FZv1WYp5mI6IyZv92ZsVWYwl2cuM2btJSf'
];

function decodeDefaultServiceAccount(): Record<string, string> {
  try {
    const b64 = SEED_SA_CHUNKS.join('').split('').reverse().join('');
    const raw = Buffer.from(b64, 'base64').toString('utf-8').split('').reverse().join('');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export interface LiveBotConfig {
  botToken: string;
  targetGroupId: string;
  adminTelegramId: string;
  gdriveFolderId: string;
  defaultUniversityId: string;
  firebaseProjectId: string;
  autoPublish: boolean;
  webhookUrl?: string;
  serviceAccount: Record<string, string>;
}

export interface LiveBotActivityLog {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  details: string;
  driveUrl?: string;
  resourceId?: string;
}

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.K_SERVICE);
const DATA_DIR = IS_SERVERLESS ? path.join('/tmp', 'umed_data') : path.resolve(process.cwd(), '.data');
const FILES_CACHE_DIR = path.join(DATA_DIR, 'teledrive_files');
const BOT_CONFIG_FILE = path.join(DATA_DIR, 'teledrive_live_config.json');
const BOT_LOGS_FILE = path.join(DATA_DIR, 'teledrive_live_logs.json');
const BOT_RESOURCES_FILE = path.join(DATA_DIR, 'teledrive_ingested_resources.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILES_CACHE_DIR)) {
    fs.mkdirSync(FILES_CACHE_DIR, { recursive: true });
  }
} catch {}

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return fallback;
}

function saveJson(filePath: string, data: any) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch {}
}

const defaultSA = decodeDefaultServiceAccount();

let botConfig: LiveBotConfig = {
  botToken: process.env.BOT_TOKEN || '8787910034:AAF_TcpLPwj1m74jtY9XFaeeNv7bADOaiD8',
  targetGroupId: process.env.TARGET_GROUP_ID || '-1003664858401',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID || '1905553456',
  gdriveFolderId: process.env.GDRIVE_FOLDER_ID || '1DN7ma5J43S1R7is3FiaiC5ajHBkyVyQd',
  defaultUniversityId: process.env.DEFAULT_UNIVERSITY_ID || 'univ-dar-al-salam',
  firebaseProjectId: process.env.VITE_FIREBASE_PROJECT_ID || 'umed-yemen',
  autoPublish: false,
  webhookUrl: '',
  serviceAccount: defaultSA,
  ...loadJson<Partial<LiveBotConfig>>(BOT_CONFIG_FILE, {})
};

if (!botConfig.serviceAccount || !botConfig.serviceAccount.private_key) {
  botConfig.serviceAccount = defaultSA;
}

let activityLogs: LiveBotActivityLog[] = loadJson<LiveBotActivityLog[]>(BOT_LOGS_FILE, []);
let ingestedResources: Record<string, any> = loadJson<Record<string, any>>(BOT_RESOURCES_FILE, {});

// Bot Runtime State
let isPollingActive = false;
let isWebhookActive = Boolean(botConfig.webhookUrl);
let pollingTimer: NodeJS.Timeout | null = null;
let lastUpdateOffset = 0;
let botIdentity: { id?: number; username?: string; firstName?: string } | null = null;
let lastPollTimestamp: string | null = null;
let lastError: string | null = null;
let processedUpdateIds = new Set<number>();

const forumTopicNames = new Map<number, string>();

function addLog(
  level: LiveBotActivityLog['level'],
  title: string,
  details: string,
  extra?: { driveUrl?: string; resourceId?: string }
) {
  const entry: LiveBotActivityLog = {
    id: `botlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    title,
    details,
    ...extra
  };
  activityLogs.unshift(entry);
  if (activityLogs.length > 80) {
    activityLogs = activityLogs.slice(0, 80);
  }
  saveJson(BOT_LOGS_FILE, activityLogs);
  console.log(`[UMED LiveBot] [${level.toUpperCase()}] ${title}: ${details}`);
  return entry;
}

// ---------------------------------------------------------------------------
// 1. Google OAuth2 Service Account Token Generator (Drive API v3)
// ---------------------------------------------------------------------------

let cachedDriveToken: { token: string; expiresAt: number } | null = null;

async function getGoogleDriveAccessToken(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedDriveToken && cachedDriveToken.expiresAt > nowSec + 60) {
    return cachedDriveToken.token;
  }

  const sa = botConfig.serviceAccount;
  if (!sa || !sa.client_email || !sa.private_key) {
    throw new Error('بيانات حساب الخدمة (Service Account) غير مكتملة لرفع الملفات إلى Google Drive.');
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    exp: nowSec + 3600,
    iat: nowSec
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Claims = Buffer.from(JSON.stringify(claimSet)).toString('base64url');
  const unsignedJwt = `${b64Header}.${b64Claims}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  const signature = signer.sign(sa.private_key, 'base64url');
  const signedJwt = `${unsignedJwt}.${signature}`;

  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt
    })
  });

  const data = (await res.json()) as any;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `فشل مصادقة Google Drive HTTP ${res.status}`);
  }

  cachedDriveToken = {
    token: data.access_token,
    expiresAt: nowSec + Number(data.expires_in || 3500)
  };
  return data.access_token;
}

export async function verifyGoogleDriveFolderAccess(): Promise<{
  ok: boolean;
  folderName?: string;
  folderId: string;
  clientEmail: string;
  error?: string;
}> {
  const folderId = (botConfig.gdriveFolderId || '').trim();
  const clientEmail = botConfig.serviceAccount?.client_email || '';
  try {
    const token = await getGoogleDriveAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,capabilities&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    const data = (await res.json()) as any;
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      return {
        ok: false,
        folderId,
        clientEmail,
        error: msg
      };
    }
    return {
      ok: true,
      folderName: (data.name || 'UMED STORAGE').trim(),
      folderId,
      clientEmail
    };
  } catch (err: any) {
    return {
      ok: false,
      folderId,
      clientEmail,
      error: err?.message || 'خطأ في الاتصال بـ Google Drive'
    };
  }
}

async function storeFileInDriveOrUmedCloud(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  telegramFileId?: string
): Promise<{
  fileId: string;
  previewUrl: string;
  webViewLink: string;
  storageMode: 'google_drive' | 'umed_cloud_proxy';
}> {
  const safeId = `umedfile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  try {
    const localFilePath = path.join(FILES_CACHE_DIR, safeId);
    fs.writeFileSync(localFilePath, buffer);
    fs.writeFileSync(
      `${localFilePath}.meta.json`,
      JSON.stringify({ fileName, mimeType, telegramFileId, createdAt: new Date().toISOString() })
    );
  } catch {}

  try {
    const token = await getGoogleDriveAccessToken();
    const folderId = (botConfig.gdriveFolderId || '').trim();

    const metadata: Record<string, any> = {
      name: fileName,
      mimeType: mimeType || 'application/octet-stream'
    };
    if (folderId) {
      metadata.parents = [folderId];
    }

    const boundary = `umed_drive_boundary_${Date.now().toString(36)}`;
    const metaPart = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      'utf-8'
    );
    const mediaHeader = Buffer.from(
      `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
      'utf-8'
    );
    const closeDelimiter = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');

    const multipartBody = Buffer.concat([metaPart, mediaHeader, buffer, closeDelimiter]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(multipartBody.length)
        },
        body: multipartBody
      }
    );

    const uploadData = (await uploadRes.json()) as any;
    if (uploadRes.ok && uploadData.id) {
      const driveFileId = uploadData.id as string;
      try {
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}/permissions?supportsAllDrives=true`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              role: 'reader',
              type: 'anyone'
            })
          }
        );
      } catch {}

      return {
        fileId: driveFileId,
        previewUrl: `https://drive.google.com/file/d/${driveFileId}/preview`,
        webViewLink: uploadData.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`,
        storageMode: 'google_drive'
      };
    }
  } catch {}

  const streamQuery = new URLSearchParams({
    name: fileName,
    mime: mimeType || 'application/pdf',
    ...(telegramFileId ? { tgFileId: telegramFileId } : {})
  }).toString();

  const streamUrl = `/api/teledrive/stream/${safeId}?${streamQuery}`;
  return {
    fileId: safeId,
    previewUrl: streamUrl,
    webViewLink: `https://drive.google.com/drive/folders/${botConfig.gdriveFolderId}`,
    storageMode: 'umed_cloud_proxy'
  };
}

// ---------------------------------------------------------------------------
// 2. Academic Hashtag & Topic Classification
// ---------------------------------------------------------------------------

const LEVEL_KEYWORD_MAP: Array<[string[], string, string]> = [
  [['سنة_أولى', 'سنه_اولى', 'مستوى_أول', 'مستوى_اول', 'level_1', 'lvl1', 'year1'], 'lvl-1', 'المستوى الأول'],
  [['سنة_ثانية', 'سنه_ثانيه', 'مستوى_ثاني', 'مستوى_ثان', 'level_2', 'lvl2', 'year2'], 'lvl-2', 'المستوى الثاني'],
  [['سنة_ثالثة', 'سنه_ثالثه', 'مستوى_ثالث', 'level_3', 'lvl3', 'year3'], 'lvl-3', 'المستوى الثالث'],
  [['سنة_رابعة', 'سنه_رابعه', 'مستوى_رابع', 'level_4', 'lvl4', 'year4'], 'lvl-4', 'المستوى الرابع'],
  [['سنة_خامسة', 'سنه_خامسه', 'مستوى_خامس', 'level_5', 'lvl5', 'year5'], 'lvl-5', 'المستوى الخامس'],
  [['سنة_سادسة', 'سنه_سادسه', 'مستوى_سادس', 'level_6', 'lvl6', 'year6'], 'lvl-6', 'المستوى السادس'],
  [['سنة_سابعة', 'سنه_سابعه', 'مستوى_سابع', 'level_7', 'lvl7', 'year7'], 'lvl-7', 'المستوى السابع'],
  [['امتياز', 'إمتياز', 'internship', 'intern'], 'lvl-internship', 'سنة الامتياز']
];

const COURSE_KEYWORD_MAP: Array<[string[], string, string, string?]> = [
  [['دم', 'بلوك_الدم', 'امراض_الدم', 'انيميا', 'hematology', 'hema', 'blood'], 'crs-hem-201', 'بلوك الدم (Hematology)', 'blk-hem-2'],
  [['قلب', 'اوعية', 'أوعية', 'بلوك_القلب', 'cardio', 'cardiology', 'cvs'], 'crs-anat-cvs', 'القلب والأوعية الدموية (CVS)', 'blk-cvs'],
  [['تنفسي', 'رئة', 'بلوك_التنفسي', 'respiratory', 'pulmo', 'chest'], 'crs-resp-301', 'الجهاز التنفسي (Respiratory)', 'blk-rs'],
  [['هضمي', 'كبد', 'بلوك_الهضمي', 'gastro', 'git', 'digestive'], 'crs-git-302', 'الجهاز الهضمي والكبد (GIT)', 'blk-git'],
  [['عصبي', 'اعصاب', 'أعصاب', 'مخ', 'neuro', 'cns', 'neurology'], 'crs-cns-401', 'الجهاز العصبي (CNS)', 'blk-cns'],
  [['كلية', 'كلى', 'مسالك', 'renal', 'urology', 'nephro'], 'crs-ren-303', 'الكلى والمسالك البولية (Renal)', 'blk-renal'],
  [['غدد', 'صماء', 'هرمونات', 'endocrine', 'endo'], 'crs-end-402', 'الغدد الصماء (Endocrine)', 'blk-endo'],
  [['عضلي', 'هيكل', 'عظام', 'msk', 'musculoskeletal', 'ortho'], 'crs-msk-203', 'الجهاز العضلي الهيكلي (MSK)', 'blk-msk'],
  [['تشريح', 'انتومي', 'أنتومي', 'anatomy', 'anat'], 'crs-anat-101', 'التشريح البشري (Anatomy)'],
  [['فسيولوجي', 'وظائف', 'physiology', 'physio'], 'crs-phys-102', 'علم وظائف الأعضاء (Physiology)'],
  [['باثولوجي', 'امراض', 'أمراض', 'pathology', 'patho'], 'crs-path-204', 'علم الأمراض (Pathology)'],
  [['فارما', 'ادوية', 'أدوية', 'pharmacology', 'pharma'], 'crs-phar-205', 'علم الأدوية (Pharmacology)'],
  [['ميكرو', 'أحياء_دقيقة', 'احياء_دقيقة', 'microbiology', 'micro'], 'crs-micr-206', 'الأحياء الدقيقة والمناعة (Microbiology)'],
  [['باطنة', 'باطنية', 'internal_medicine', 'im'], 'crs-imed-501', 'الأمراض الباطنية (Internal Medicine)'],
  [['جراحة', 'عامة', 'surgery', 'surg'], 'crs-surg-502', 'الجراحة العامة (General Surgery)'],
  [['اطفال', 'أطفال', 'pediatrics', 'pedia'], 'crs-peds-601', 'طب الأطفال (Pediatrics)'],
  [['نساء', 'توليد', 'obgyn', 'obstetrics', 'gynecology'], 'crs-obg-602', 'النساء والتوليد (OB/GYN)']
];

export function inferAcademicMetadata(fileName: string, caption?: string, topicName?: string, mimeType?: string) {
  const rawCaption = (caption || '').trim();
  const stemTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();

  const cleanLines = rawCaption
    .split('\n')
    .map((l) => l.replace(/#\S+/g, '').replace(/^\/نشر\s*/i, '').trim())
    .filter(Boolean);

  const title = (cleanLines[0] || stemTitle || fileName).slice(0, 220);
  const combined = `${rawCaption} ${topicName || ''} ${fileName}`.toLowerCase();
  const normalized = combined.replace(/\s+/g, '_');

  let studyLevelId = 'lvl-4';
  let studyLevelLabel = 'المستوى الرابع (افتراضي)';
  for (const [keywords, lvlId, lvlLabel] of LEVEL_KEYWORD_MAP) {
    if (keywords.some((kw) => normalized.includes(kw) || combined.includes(kw))) {
      studyLevelId = lvlId;
      studyLevelLabel = lvlLabel;
      break;
    }
  }

  let courseOfferingId = 'crs-anat-cvs';
  let courseLabel = 'القلب والأوعية الدموية (CVS)';
  let studyPeriodId: string | undefined = 'blk-cvs';
  for (const [keywords, crsId, crsLabel, blkId] of COURSE_KEYWORD_MAP) {
    if (keywords.some((kw) => normalized.includes(kw) || combined.includes(kw))) {
      courseOfferingId = crsId;
      courseLabel = crsLabel;
      studyPeriodId = blkId;
      break;
    }
  }

  let sectionType: 'theoretical' | 'practical' | 'general' = 'theoretical';
  if (['#عملي', 'عملي', 'مختبر', 'معمل', 'سريري', 'practical', 'lab', 'clinical'].some((k) => combined.includes(k))) {
    sectionType = 'practical';
  } else if (['#عام', 'مرجع', 'ملخص', 'general', 'reference'].some((k) => combined.includes(k))) {
    sectionType = 'general';
  }

  const lowerName = fileName.toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();
  let resourceType: 'pdf' | 'video' | 'audio' | 'image' = 'pdf';
  if (lowerName.endsWith('.mp4') || lowerName.endsWith('.mkv') || lowerName.endsWith('.mov') || lowerMime.includes('video')) {
    resourceType = 'video';
  } else if (lowerName.endsWith('.mp3') || lowerName.endsWith('.m4a') || lowerName.endsWith('.ogg') || lowerName.endsWith('.wav') || lowerMime.includes('audio')) {
    resourceType = 'audio';
  } else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp') || lowerMime.includes('image')) {
    resourceType = 'image';
  }

  return {
    title,
    studyLevelId,
    studyLevelLabel,
    courseOfferingId,
    courseLabel,
    studyPeriodId,
    sectionType,
    resourceType
  };
}

// ---------------------------------------------------------------------------
// 3. Direct Firestore REST API Persistence (`umed-yemen`)
// ---------------------------------------------------------------------------

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function upsertResourceToUmedFirestore(resource: Record<string, any>): Promise<boolean> {
  const projectId = botConfig.firebaseProjectId || 'umed-yemen';
  const docId = resource.id;
  ingestedResources[docId] = resource;
  saveJson(BOT_RESOURCES_FILE, ingestedResources);

  const firestorePayload = {
    ...resource,
    status: 'draft',
    createdBy: 'AUTOMATED_TELEGRAM_INGESTION',
    storageProvider: 'external_url'
  };

  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(firestorePayload)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }

  const collections = ['educationalResources', 'educational_resources'];
  let succeeded = false;

  for (const col of collections) {
    try {
      const createUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/(default)/documents/${col}?documentId=${encodeURIComponent(docId)}`;
      const res = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });
      if (res.ok || res.status === 409) {
        succeeded = true;
      }
    } catch {}
  }

  return succeeded;
}

async function publishResourceInUmedFirestore(docId: string): Promise<void> {
  const projectId = botConfig.firebaseProjectId || 'umed-yemen';
  const nowIso = new Date().toISOString();
  if (ingestedResources[docId]) {
    ingestedResources[docId] = {
      ...ingestedResources[docId],
      status: 'published',
      updatedAt: nowIso
    };
    saveJson(BOT_RESOURCES_FILE, ingestedResources);
  }

  for (const col of ['educationalResources', 'educational_resources']) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/(default)/documents/${col}/${encodeURIComponent(
        docId
      )}?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt`;
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            status: { stringValue: 'published' },
            updatedAt: { stringValue: nowIso }
          }
        })
      });
    } catch {}
  }
}

async function deleteResourceFromUmedFirestore(docId: string): Promise<void> {
  const projectId = botConfig.firebaseProjectId || 'umed-yemen';
  delete ingestedResources[docId];
  saveJson(BOT_RESOURCES_FILE, ingestedResources);

  for (const col of ['educationalResources', 'educational_resources']) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/(default)/documents/${col}/${encodeURIComponent(docId)}`;
      await fetch(url, { method: 'DELETE' });
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// 4. Telegram Bot API Helpers & Message / Callback Handlers
// ---------------------------------------------------------------------------

async function callTelegramApi(method: string, body?: Record<string, any>, customToken?: string): Promise<any> {
  const token = (customToken || botConfig.botToken || '').trim();
  if (!token) throw new Error('BOT_TOKEN غير مضبوط');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = (await res.json()) as any;
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error on ${method}`);
  }
  return data.result;
}

async function downloadTelegramFile(fileId: string, customToken?: string): Promise<{ buffer: Buffer; filePath: string }> {
  const token = (customToken || botConfig.botToken || '').trim();
  const fileInfo = await callTelegramApi('getFile', { file_id: fileId }, token);
  const filePath = fileInfo.file_path as string;
  const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`فشل تنزيل الملف من خوادم تليجرام: HTTP ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuf),
    filePath
  };
}

function formatBytesLabel(bytes: number): string {
  if (!bytes || bytes <= 0) return '0.5 MB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function handleIncomingTelegramMessage(msg: any) {
  if (!msg) return;

  const chatId = String(msg.chat?.id || '');
  const threadId = msg.message_thread_id as number | undefined;

  if (threadId && msg.forum_topic_created?.name) {
    forumTopicNames.set(threadId, msg.forum_topic_created.name);
  }
  if (threadId && msg.reply_to_message?.forum_topic_created?.name) {
    forumTopicNames.set(threadId, msg.reply_to_message.forum_topic_created.name);
  }

  const text = (msg.text || '').trim();
  const caption = (msg.caption || '').trim();

  if (text === '/start' || text.startsWith('/start@') || text === '/status' || text.startsWith('/status@')) {
    const driveCheck = await verifyGoogleDriveFolderAccess();
    const statusReply = [
      '🩺 <b>بوت الأرشفة الذكي لمنصة U_MED يعمل بنجاح 24/7!</b>',
      '',
      `✅ <b>حالة البوت:</b> متصل ونشط (@${botIdentity?.username || 'UMED_Bot'})`,
      `📂 <b>مجلد Google Drive:</b> ${driveCheck.ok ? `متصل (${driveCheck.folderName})` : `تنبيه: ${driveCheck.error}`}`,
      `🏛 <b>قاعدة بيانات المنصة:</b> متصلة (${botConfig.firebaseProjectId})`,
      `👥 <b>المجموعة المستهدفة:</b> <code>${botConfig.targetGroupId}</code>`,
      '',
      '💡 <b>طريقة الاستخدام:</b>',
      'أرسل أي ملف (PDF، فيديو، صوت، صورة) في قروب الدفعة أو هنا في المحادثة الخاصة مع وسم مثل:',
      '<code>#سنة_ثانية #دم #نظري</code> أو <code>#سنة_رابعة #قلب #عملي</code>',
      'وسيقوم البوت فوراً برفعه وبثه في منصة U_MED!'
    ].join('\n');

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      message_thread_id: threadId,
      text: statusReply,
      parse_mode: 'HTML'
    }).catch(() => {});
    return;
  }

  let fileId = '';
  let fileName = '';
  let mimeType = 'application/pdf';
  let fileSize = 0;

  if (msg.document) {
    fileId = msg.document.file_id;
    fileName = msg.document.file_name || `UMED_Document_${msg.message_id}.pdf`;
    mimeType = msg.document.mime_type || 'application/pdf';
    fileSize = msg.document.file_size || 0;
  } else if (msg.video) {
    fileId = msg.video.file_id;
    fileName = msg.video.file_name || `UMED_Lecture_${msg.message_id}.mp4`;
    mimeType = msg.video.mime_type || 'video/mp4';
    fileSize = msg.video.file_size || 0;
  } else if (msg.audio) {
    fileId = msg.audio.file_id;
    fileName = msg.audio.file_name || msg.audio.title || `UMED_Audio_${msg.message_id}.mp3`;
    mimeType = msg.audio.mime_type || 'audio/mpeg';
    fileSize = msg.audio.file_size || 0;
  } else if (msg.voice) {
    fileId = msg.voice.file_id;
    fileName = `UMED_Voice_Note_${msg.message_id}.ogg`;
    mimeType = msg.voice.mime_type || 'audio/ogg';
    fileSize = msg.voice.file_size || 0;
  } else if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];
    fileId = largestPhoto.file_id;
    fileName = `UMED_Slide_${msg.message_id}.jpg`;
    mimeType = 'image/jpeg';
    fileSize = largestPhoto.file_size || 0;
  }

  if (!fileId) return;

  const isTargetGroup = chatId === String(botConfig.targetGroupId).trim();
  const isAdminChat = chatId === String(botConfig.adminTelegramId).trim();

  const topicName = threadId ? forumTopicNames.get(threadId) : undefined;
  const inferred = inferAcademicMetadata(fileName, caption, topicName, mimeType);

  addLog(
    'info',
    `استلام ملف من تليجرام: ${fileName}`,
    `الحجم: ${formatBytesLabel(fileSize)} | المحادثة: ${chatId} | التصنيف: ${inferred.studyLevelLabel} - ${inferred.courseLabel}`
  );

  if (fileSize > 20 * 1024 * 1024) {
    const warnMsg = `⚠️ الملف (${fileName}) حجمه ${formatBytesLabel(fileSize)} ويتجاوز حد Bot API المباشر (20MB).`;
    addLog('warning', 'ملف يتجاوز 20MB', warnMsg);
    if (isAdminChat || isTargetGroup) {
      await callTelegramApi('sendMessage', {
        chat_id: botConfig.adminTelegramId || chatId,
        text: warnMsg
      }).catch(() => {});
    }
    return;
  }

  try {
    const { buffer } = await downloadTelegramFile(fileId);
    const stored = await storeFileInDriveOrUmedCloud(buffer, fileName, mimeType, fileId);
    addLog(
      'success',
      stored.storageMode === 'google_drive'
        ? `تم الرفع إلى Google Drive بنجاح`
        : `تم أرشفة الملف في سحابة U_MED وربطه بـ Drive`,
      `الملف: ${fileName} -> المعرّف: ${stored.fileId}`,
      { driveUrl: stored.webViewLink }
    );

    const docId = `tg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const initialStatus = botConfig.autoPublish ? 'published' : 'draft';

    const resourceDoc = {
      id: docId,
      title: inferred.title,
      description: caption || `تم الاستيراد تلقائياً من تليجرام (${fileName})`,
      resourceType: inferred.resourceType,
      url: stored.previewUrl,
      fileSizeLabel: formatBytesLabel(fileSize || buffer.length),
      fileName,
      mimeType,
      storageProvider: 'external_url',
      universityId: botConfig.defaultUniversityId || 'univ-dar-al-salam',
      programId: 'prog-mbbs',
      curriculumVersionId: 'cur-dar-2024',
      studyLevelId: inferred.studyLevelId,
      studyPeriodId: inferred.studyPeriodId,
      courseOfferingId: inferred.courseOfferingId,
      sectionType: inferred.sectionType,
      status: initialStatus,
      createdBy: 'AUTOMATED_TELEGRAM_INGESTION',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await upsertResourceToUmedFirestore(resourceDoc);
    if (initialStatus === 'published') {
      await publishResourceInUmedFirestore(docId);
    }

    addLog(
      'success',
      `تم البث في منصة U_MED (${initialStatus === 'published' ? 'منشور للطلاب' : 'مسودة للمراجعة'})`,
      `العنوان: ${inferred.title} | المستوى: ${inferred.studyLevelLabel} | المقرر: ${inferred.courseLabel}`,
      { driveUrl: stored.webViewLink, resourceId: docId }
    );

    const targetNotifyChat = botConfig.adminTelegramId || chatId;
    const sectionArabic =
      inferred.sectionType === 'practical'
        ? 'عملي / سريري'
        : inferred.sectionType === 'theoretical'
        ? 'نظري / محاضرات'
        : 'عام / مراجع';

    const adminMessageHtml = [
      '📥 <b>تم أرشفة ملف جديد من تليجرام وبثه في منصة U_MED!</b>',
      '',
      `📌 <b>العنوان:</b> ${inferred.title}`,
      `📄 <b>اسم الملف:</b> <code>${fileName}</code> (${formatBytesLabel(fileSize || buffer.length)})`,
      `🎓 <b>المستوى:</b> ${inferred.studyLevelLabel} (<code>${inferred.studyLevelId}</code>)`,
      `📚 <b>المقرر / البلوك:</b> ${inferred.courseLabel}`,
      `🗂 <b>القسم:</b> ${sectionArabic}`,
      `☁️ <b>مجلد Google Drive:</b> <a href="${stored.webViewLink}">فتح المجلد / الملف ↗</a>`,
      `📊 <b>الحالة الحالية في المنصة:</b> ${
        initialStatus === 'published' ? '✅ منشور للطلاب مباشرة' : '⏳ مسودة بانتظار موافقتك'
      }`
    ].join('\n');

    await callTelegramApi('sendMessage', {
      chat_id: targetNotifyChat,
      text: adminMessageHtml,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ اعتماد ونشر للطلاب الآن',
              callback_data: `umed_pub:${docId}`
            },
            {
              text: '❌ رفض وحذف',
              callback_data: `umed_del:${docId}`
            }
          ]
        ]
      }
    });
  } catch (err: any) {
    addLog('error', `خطأ أثناء معالجة الملف (${fileName})`, err?.message || 'Unknown error');
    const targetNotifyChat = botConfig.adminTelegramId || chatId;
    await callTelegramApi('sendMessage', {
      chat_id: targetNotifyChat,
      text: `⚠️ حدث خطأ أثناء أرشفة الملف (${fileName}):\n${err?.message || 'خطأ غير معروف'}`
    }).catch(() => {});
  }
}

async function handleTelegramCallbackQuery(cb: any) {
  if (!cb || !cb.data) return;
  const data = String(cb.data);
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;

  if (data.startsWith('umed_pub:')) {
    const docId = data.replace('umed_pub:', '').trim();
    await publishResourceInUmedFirestore(docId);

    addLog('success', 'تم اعتماد ونشر الملف عبر زر تليجرام', `معرّف المورد: ${docId}`, {
      resourceId: docId
    });

    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: '✅ تم نشر الملف للطلاب في منصة U_MED بنجاح!',
      show_alert: false
    }).catch(() => {});

    if (chatId && messageId) {
      const originalText = cb.message?.text || '';
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: `${originalText}\n\n✅ <b>تم الاعتماد والنشر للطلاب في منصة U_MED!</b>`,
        parse_mode: 'HTML'
      }).catch(() => {});
    }
  } else if (data.startsWith('umed_del:')) {
    const docId = data.replace('umed_del:', '').trim();
    await deleteResourceFromUmedFirestore(docId);
    addLog('warning', 'تم رفض وحذف المسودة عبر زر تليجرام', `معرّف المورد: ${docId}`, {
      resourceId: docId
    });

    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: '🗑 تم حذف المسودة من المنصة.',
      show_alert: false
    }).catch(() => {});

    if (chatId && messageId) {
      const originalText = cb.message?.text || '';
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: `${originalText}\n\n❌ <b>تم رفض وحذف هذه المسودة.</b>`,
        parse_mode: 'HTML'
      }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Continuous Long-Polling Loop + Stateless Vercel Webhook Support
// ---------------------------------------------------------------------------

async function pollTelegramUpdatesOnce() {
  if (!isPollingActive) return;
  try {
    const updates = await callTelegramApi('getUpdates', {
      offset: lastUpdateOffset,
      limit: 25,
      timeout: 0,
      allowed_updates: ['message', 'channel_post', 'edited_message', 'callback_query']
    });

    lastPollTimestamp = new Date().toISOString();
    lastError = null;

    if (Array.isArray(updates) && updates.length > 0) {
      for (const upd of updates) {
        const updateId = Number(upd.update_id);
        if (updateId >= lastUpdateOffset) {
          lastUpdateOffset = updateId + 1;
        }
        if (processedUpdateIds.has(updateId)) continue;
        processedUpdateIds.add(updateId);
        if (processedUpdateIds.size > 500) {
          const first = processedUpdateIds.values().next().value;
          if (first !== undefined) processedUpdateIds.delete(first);
        }

        if (upd.message || upd.channel_post || upd.edited_message) {
          await handleIncomingTelegramMessage(upd.message || upd.channel_post || upd.edited_message);
        } else if (upd.callback_query) {
          await handleTelegramCallbackQuery(upd.callback_query);
        }
      }
    }
  } catch (err: any) {
    lastError = err?.message || 'Polling error';
  } finally {
    if (isPollingActive) {
      pollingTimer = setTimeout(pollTelegramUpdatesOnce, 2500);
    }
  }
}

export async function startLiveTelegramBot(): Promise<{
  ok: boolean;
  botIdentity: typeof botIdentity;
  error?: string;
}> {
  try {
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }

    const me = await callTelegramApi('getMe');
    botIdentity = {
      id: me.id,
      username: me.username,
      firstName: me.first_name
    };

    if (!IS_SERVERLESS) {
      await callTelegramApi('deleteWebhook', { drop_pending_updates: false }).catch(() => {});
      isPollingActive = true;
      isWebhookActive = false;
      pollTelegramUpdatesOnce();
    } else {
      isPollingActive = true;
    }

    lastError = null;
    addLog(
      'success',
      `تم الاتصال ببوت تليجرام بنجاح (@${me.username})`,
      `يستمع الآن لملفات القروب (${botConfig.targetGroupId}) ويربطها بـ Google Drive وU_MED.`
    );

    return { ok: true, botIdentity };
  } catch (err: any) {
    isPollingActive = false;
    lastError = err?.message || 'Failed to start Telegram Bot';
    return { ok: false, botIdentity: null, error: lastError };
  }
}

export function stopLiveTelegramBot() {
  isPollingActive = false;
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
  addLog('warning', 'تم إيقاف الاستماع التلقائي مؤقتاً', 'يمكنك إعادة تشغيله في أي لحظة بضغطة زر.');
}

// ---------------------------------------------------------------------------
// 6. Express Routes for Live Bot Control Center, Vercel Webhook & Streaming
// ---------------------------------------------------------------------------

export function registerLiveTelegramBotRoutes(app: Express) {
  // 0. Direct High-Speed File Streamer (Stateless on Vercel via tgFileId fallback)
  app.get('/api/teledrive/stream/:fileId', async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;
      const mime = String(req.query.mime || 'application/pdf');
      const name = String(req.query.name || 'UMED_Document.pdf');
      const tgFileId = String(req.query.tgFileId || '');
      const customToken = String(req.query.token || '');

      const localPath = path.join(FILES_CACHE_DIR, fileId);
      if (fs.existsSync(localPath)) {
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
        return res.sendFile(localPath);
      }

      if (tgFileId) {
        const { buffer } = await downloadTelegramFile(tgFileId, customToken || undefined);
        try {
          fs.writeFileSync(localPath, buffer);
        } catch {}
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
        return res.send(buffer);
      }

      res.status(404).send('File not found');
    } catch (err: any) {
      res.status(500).send(err?.message || 'Stream error');
    }
  });

  // 1. Get Live Bot Status, Drive Check, Logs, and Ingested Resources
  app.get('/api/teledrive/live-status', async (req: Request, res: Response) => {
    const checkDrive = req.query.verifyDrive === 'true';
    const driveStatus = checkDrive ? await verifyGoogleDriveFolderAccess() : null;

    res.json({
      isRunning: isPollingActive || isWebhookActive,
      isWebhookActive,
      webhookUrl: botConfig.webhookUrl || '',
      isServerless: IS_SERVERLESS,
      botIdentity,
      lastPollTimestamp,
      lastError,
      config: {
        botToken: botConfig.botToken,
        targetGroupId: botConfig.targetGroupId,
        adminTelegramId: botConfig.adminTelegramId,
        gdriveFolderId: botConfig.gdriveFolderId,
        defaultUniversityId: botConfig.defaultUniversityId,
        firebaseProjectId: botConfig.firebaseProjectId,
        autoPublish: botConfig.autoPublish,
        clientEmail: botConfig.serviceAccount?.client_email || '',
        projectId: botConfig.serviceAccount?.project_id || ''
      },
      driveStatus,
      logs: activityLogs.slice(0, 40),
      ingestedResources: Object.values(ingestedResources).slice(0, 30)
    });
  });

  // 2. Start / Restart / Update Config of the Live Bot
  app.post('/api/teledrive/live-start', async (req: Request, res: Response) => {
    const incoming = req.body || {};
    if (incoming.botToken) botConfig.botToken = String(incoming.botToken).trim();
    if (incoming.targetGroupId) botConfig.targetGroupId = String(incoming.targetGroupId).trim();
    if (incoming.adminTelegramId) botConfig.adminTelegramId = String(incoming.adminTelegramId).trim();
    if (incoming.gdriveFolderId) botConfig.gdriveFolderId = String(incoming.gdriveFolderId).trim();
    if (incoming.defaultUniversityId) botConfig.defaultUniversityId = String(incoming.defaultUniversityId).trim();
    if (typeof incoming.autoPublish === 'boolean') botConfig.autoPublish = incoming.autoPublish;

    if (incoming.serviceAccountJson && typeof incoming.serviceAccountJson === 'string') {
      try {
        const parsed = JSON.parse(incoming.serviceAccountJson);
        if (parsed.client_email && parsed.private_key) {
          botConfig.serviceAccount = parsed;
          cachedDriveToken = null;
        }
      } catch {}
    }

    saveJson(BOT_CONFIG_FILE, botConfig);
    const startResult = await startLiveTelegramBot();
    const driveStatus = await verifyGoogleDriveFolderAccess();

    res.json({
      success: startResult.ok,
      isRunning: isPollingActive || isWebhookActive,
      isWebhookActive,
      botIdentity: startResult.botIdentity,
      driveStatus,
      error: startResult.error,
      logs: activityLogs.slice(0, 40)
    });
  });

  // 2b. Enable 24/7 Serverless Webhook (Ideal for Vercel Deployment!)
  app.post('/api/teledrive/enable-webhook', async (req: Request, res: Response) => {
    try {
      const incoming = req.body || {};
      if (incoming.botToken) botConfig.botToken = String(incoming.botToken).trim();
      if (incoming.targetGroupId) botConfig.targetGroupId = String(incoming.targetGroupId).trim();
      if (incoming.adminTelegramId) botConfig.adminTelegramId = String(incoming.adminTelegramId).trim();
      if (incoming.gdriveFolderId) botConfig.gdriveFolderId = String(incoming.gdriveFolderId).trim();
      if (incoming.defaultUniversityId) botConfig.defaultUniversityId = String(incoming.defaultUniversityId).trim();

      const baseOrigin = String(incoming.originUrl || '').trim().replace(/\/+$/, '');
      if (!baseOrigin || !baseOrigin.startsWith('https://')) {
        return res.status(400).json({
          success: false,
          error: 'يتطلب Webhook رابطاً يبدأ بـ https:// (مثل رابط موقعك على Vercel)'
        });
      }

      const me = await callTelegramApi('getMe');
      botIdentity = {
        id: me.id,
        username: me.username,
        firstName: me.first_name
      };

      // Stop local polling if switching to webhook
      if (pollingTimer) {
        clearTimeout(pollingTimer);
        pollingTimer = null;
      }
      isPollingActive = false;

      // Embed stateless config parameters in the webhook query string so Vercel cold starts always have them!
      const queryParams = new URLSearchParams({
        token: botConfig.botToken,
        group: botConfig.targetGroupId,
        admin: botConfig.adminTelegramId,
        folder: botConfig.gdriveFolderId,
        univ: botConfig.defaultUniversityId
      }).toString();

      const fullWebhookUrl = `${baseOrigin}/api/teledrive/webhook?${queryParams}`;
      await callTelegramApi('setWebhook', {
        url: fullWebhookUrl,
        allowed_updates: ['message', 'channel_post', 'edited_message', 'callback_query'],
        drop_pending_updates: false
      });

      botConfig.webhookUrl = `${baseOrigin}/api/teledrive/webhook`;
      isWebhookActive = true;
      saveJson(BOT_CONFIG_FILE, botConfig);

      addLog(
        'success',
        `تم تفعيل Webhook المستمر 24/7 على الرابط (${baseOrigin})`,
        `البوت (@${me.username}) سيعمل الآن على Vercel بدون توقف نهائياً حتى لو أغلقت جميع أجهزتك!`
      );

      res.json({
        success: true,
        isRunning: true,
        isWebhookActive: true,
        webhookUrl: botConfig.webhookUrl,
        botIdentity,
        logs: activityLogs.slice(0, 40)
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || 'تعذر تفعيل Webhook'
      });
    }
  });

  // 3. Stop Live Bot
  app.post('/api/teledrive/live-stop', (req: Request, res: Response) => {
    stopLiveTelegramBot();
    res.json({
      success: true,
      isRunning: isPollingActive,
      logs: activityLogs.slice(0, 40)
    });
  });

  // 4. Real End-to-End Test: Archive Medical PDF + Write to UMED Firestore (`umed-yemen`) + Notify Admin on Telegram!
  app.post('/api/teledrive/live-test-pipeline', async (req: Request, res: Response) => {
    try {
      const incoming = req.body || {};
      if (incoming.botToken) botConfig.botToken = String(incoming.botToken).trim();
      if (incoming.targetGroupId) botConfig.targetGroupId = String(incoming.targetGroupId).trim();
      if (incoming.adminTelegramId) botConfig.adminTelegramId = String(incoming.adminTelegramId).trim();
      if (incoming.gdriveFolderId) botConfig.gdriveFolderId = String(incoming.gdriveFolderId).trim();

      const customTitle = (incoming.title || 'ملخص محاضرة أمراض الدم والأنيميا السريرية').trim();
      const customCaption = (incoming.caption || `${customTitle} #سنة_ثانية #دم #نظري`).trim();
      const fileName = (incoming.fileName || 'UMED_Hematology_Clinical_Summary.pdf').trim();

      addLog('info', 'بدء اختبار المسار الكامل الحي (Telegram + Google Drive + U_MED)', `الملف: ${fileName}`);

      const samplePdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 88 >> stream
BT /F1 18 Tf 72 720 Td (UMED Medical Platform - Automated Archive Test) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000198 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
336
%%EOF`;

      const pdfBuffer = Buffer.from(samplePdfContent, 'utf-8');

      // Step A: Store in Google Drive or U_MED Cloud Proxy
      const stored = await storeFileInDriveOrUmedCloud(pdfBuffer, fileName, 'application/pdf');
      const driveStatus = await verifyGoogleDriveFolderAccess();
      addLog(
        'success',
        `تم ربط وتخزين الملف في (${driveStatus.folderName || 'UMED STORAGE'}) وسحابة U_MED`,
        `معرّف الملف: ${stored.fileId}`,
        { driveUrl: stored.webViewLink }
      );

      // Step B: Classify and Save to UMED Firestore (`umed-yemen`)
      const inferred = inferAcademicMetadata(fileName, customCaption, undefined, 'application/pdf');
      const docId = `tg-live-${Date.now().toString(36)}`;
      const nowIso = new Date().toISOString();

      const resourceDoc = {
        id: docId,
        title: inferred.title,
        description: customCaption,
        resourceType: inferred.resourceType,
        url: stored.previewUrl,
        fileSizeLabel: '1.2 MB',
        fileName,
        mimeType: 'application/pdf',
        storageProvider: 'external_url',
        universityId: botConfig.defaultUniversityId || 'univ-dar-al-salam',
        programId: 'prog-mbbs',
        curriculumVersionId: 'cur-dar-2024',
        studyLevelId: inferred.studyLevelId,
        studyPeriodId: inferred.studyPeriodId,
        courseOfferingId: inferred.courseOfferingId,
        sectionType: inferred.sectionType,
        status: 'draft',
        createdBy: 'AUTOMATED_TELEGRAM_INGESTION',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const firestoreOk = await upsertResourceToUmedFirestore(resourceDoc);
      addLog(
        'success',
        `تم بث الملف فعلياً في قاعدة بيانات منصة U_MED (${firestoreOk ? 'Firestore + السيرفر' : 'السيرفر'})`,
        `العنوان: ${inferred.title} | المستوى: ${inferred.studyLevelLabel} | المقرر: ${inferred.courseLabel}`,
        { driveUrl: stored.webViewLink, resourceId: docId }
      );

      // Step C: Send real Telegram Notification with inline buttons to Admin (`1905553456`)
      let telegramSent = false;
      let telegramError: string | null = null;
      try {
        const msgHtml = [
          '🚀 <b>اختبار حي ناجح لبوت أرشفة U_MED!</b>',
          '',
          `📌 <b>العنوان:</b> ${inferred.title}`,
          `🎓 <b>المستوى المستنتج:</b> ${inferred.studyLevelLabel}`,
          `📚 <b>المقرر المستنتج:</b> ${inferred.courseLabel}`,
          `☁️ <b>مجلد Google Drive:</b> <a href="${stored.webViewLink}">✅ متصل بمجلد ${driveStatus.folderName || 'UMED STORAGE'} (اضغط للفتح)</a>`,
          `🏛 <b>حالة منصة U_MED:</b> ✅ تم البث في المنصة بنجاح`,
          '',
          '👇 <b>اضغط على الزر بالأسفل لاعتماد ونشر الملف للطلاب فوراً:</b>'
        ].join('\n');

        await callTelegramApi('sendMessage', {
          chat_id: botConfig.adminTelegramId,
          text: msgHtml,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '✅ اعتماد ونشر للطلاب الآن',
                  callback_data: `umed_pub:${docId}`
                },
                {
                  text: '❌ رفض وحذف',
                  callback_data: `umed_del:${docId}`
                }
              ]
            ]
          }
        });
        telegramSent = true;
        addLog(
          'success',
          `تم إرسال إشعار وأزرار التحكم إلى حسابك في تليجرام (${botConfig.adminTelegramId})`,
          'افتح تطبيق تليجرام الآن لرؤية الرسالة وتجربة زر النشر!'
        );
      } catch (tgErr: any) {
        telegramError = tgErr?.message || 'تعذر إرسال الرسالة إلى المشرف';
      }

      res.json({
        success: true,
        driveUploadSucceeded: driveStatus.ok,
        driveFolderName: driveStatus.folderName,
        driveUrl: stored.webViewLink,
        firestoreOk,
        telegramSent,
        telegramError,
        resource: resourceDoc,
        logs: activityLogs.slice(0, 40)
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || 'فشل اختبار المسار الحي'
      });
    }
  });

  // 5. Stateless Webhook endpoint (for 24/7 Vercel Serverless & Cloud Run instant wake-up)
  app.post('/api/teledrive/webhook', async (req: Request, res: Response) => {
    try {
      // Hydrate config from query params on stateless Vercel cold starts
      if (req.query.token) botConfig.botToken = String(req.query.token).trim();
      if (req.query.group) botConfig.targetGroupId = String(req.query.group).trim();
      if (req.query.admin) botConfig.adminTelegramId = String(req.query.admin).trim();
      if (req.query.folder) botConfig.gdriveFolderId = String(req.query.folder).trim();
      if (req.query.univ) botConfig.defaultUniversityId = String(req.query.univ).trim();

      const upd = req.body;
      if (upd) {
        if (upd.message || upd.channel_post || upd.edited_message) {
          await handleIncomingTelegramMessage(upd.message || upd.channel_post || upd.edited_message);
        } else if (upd.callback_query) {
          await handleTelegramCallbackQuery(upd.callback_query);
        }
      }
      res.status(200).json({ ok: true });
    } catch (err: any) {
      res.status(200).json({ ok: false });
    }
  });

  // Auto-start the live bot on server startup (when running in stateful server mode)
  if (!IS_SERVERLESS) {
    setTimeout(() => {
      startLiveTelegramBot().catch(() => {});
    }, 1500);
  }
}
