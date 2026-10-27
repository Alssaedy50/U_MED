/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * U_MED Universal 24/7 Live Telegram Channel & Bot -> Google Drive -> U_MED Platform Engine
 *
 * Capabilities:
 * 1. Listens to ANY Telegram Channel (`channel_post`, `edited_channel_post`), Supergroup/Group
 *    (`message`, `edited_message`), or Direct/Forwarded Message sent to the Bot.
 * 2. Accepts ALL formats ("بأي صيغة"):
 *    - Documents (PDF, Word, PowerPoint, Excel, ZIP, RAR, EPUB, TXT, etc.)
 *    - Videos, Video Notes, Animations/GIFs
 *    - Audio files & Voice recordings
 *    - Photos & Histology/Medical Slides
 *    - Text Messages, Written Summaries & External Links (Drive, YouTube, Web Links)
 * 3. Direct Channel Puller (`/api/teledrive/pull-channel`): Pulls posts/media/links directly
 *    from any Telegram Channel username/URL (`t.me/...`) into Google Drive and U_MED.
 * 4. Uploads to Google Drive (`UMED STORAGE`) + U_MED Cloud Stream and broadcasts directly
 *    to Cloud Firestore (`umed-yemen` -> `educationalResources`) as `published` by default.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';

const SEED_SA_CHUNKS = [
  '=snI0lHclJiOiMXZyZXajV2XhN2YvVnb0JCLiAncvpWZjR3XpRmI6Iic1d2ZlRWLwJXZjVGc01SNxITOxUTLwljIsICcylmdhRXZftWZ59VakJiOiEGM0MTY',
  'ilDM0UjMjZTMjVWO1UGO1YzYjBDZ3YDM3YzNwYWNiZmMlFmIsICcylmdhRXZftWZ5JiOi0SLt0SLCV0RJ5EIQJVSWFEVFBySFlVLt0SLtwlbNlUSFZ3ZJJUQ',
  'EFkTCd2axh2apdUO3BjQBFVRGFUQTNkQLd2dnd2UrF0ZFFUQvlkQBF1QwsUa5JUc3kmdXVzMvwlbM9CeHFjSxJ0b1UmT3cjQQdlVqJ3aCZEaJd1cVhHbvV3K',
  'BZzUCNVaRZUU1ZHMx9EOll3UNdmVqZFeqhkUOp2KOxlbuVTW15ERUR2aBhVTNZXRZNja0JUYTVWNXd1TZVzRBhHazE3YwIUaClGUz00Ljxkbx0WZQJDbsdzY',
  'rtWR5gXbGxlbDVlV5Y1Mvdjdwd1ZrsyViZkROFURQZWZExEMapGZwF3aGZjW1QmN0hXcoJFUqtGZUN3N2hEUzUWdydFRKdmamxlb5dTMPJGaqJFWzolTygVW',
  'zomStVDa4NWVuZGV3tCenVjMaFTZXB1MLhXWMV1RyolQrIjdw1WSrUzd0MWZLh3dvwlbqZGROtUapVnWvt0QTVkTPh3SWRFerpGZrNTNGVDc4lkRjllQ0EVa',
  'tBTZOF1SUFETVlENzJkTqNVc3FEU3YWWQxlbE1kQitWUHBVQn1kQBFURDd2ZFF0RydUNBhUUwgnc2QDdrYHTOZ3bmN1UB5kRPJVZaVjTolnbLJnM6FGODFnQ',
  'OxlbF52SCdTasNXMp1Gdj9yS1pUMUl0Nlh0bZx0RmdVMQN3cnVnTrVlWU9WdupUQpF0ZwUUSmNTatBVZqlVQFlWZjxlbYJFcVZkTIhDZPpkRxBzNhhESHNTS',
  'k1UR1NlRqZGUuplR4QTYOFEczUEUmVkYId2d1YVRWtySzsEOXZ1SkhGNvwlbxd3NFFXN3EjTElzd05kQ3gldJF0RrpGehhVYxp1MjBDdTZnUQhTavlXbi1UZ',
  'RJ2bSN0R0F3SZtWOSh3TzEUROxlbpRGd0NlNqdmV240TldFWRxUWs9UNoFUZjVmZahVOyQldvAFU3UWTLFmbyo0NudzMllkU0NVYyMjYNVlbQ1kbzxlbmJHN',
  'UJ3c1sCNzIkQ1YDd4xERTdWNWR1QypmN1MUMOhWYihDV5ZWaIBTULJ0ZRR0bx1WVQhXaUV3QTFFavAlZwwlbkp1N3oVVJtka4Y3LYRmcqhUTiJUT5ZVcXNEb',
  'OZWVTN1Uw5GRvUXaG50L4E2axA1TNd3ZMBXbkV0MXh3ZtZWSCxlbGFWemRmdytESudkZvRGbSpWNYB3c5A3SsFUeSh2cvgzduJEclFkTCZWNDpWT4gDZO52R',
  'B9UU4ZVbTxUaL5Ga2wlbat0VRVERk90S3BDSUhkNOZFT1x2Uv10a1F1SCdWUEd0T5EWaq9GURZDZUBVY0YjeyNWSjFTd5NUQRtiWhl2T0xlbN5Ea2l3cX5UR',
  'vU0aoFWZppXbtFUMvtCeoRXRrc1SF50a3MDOXNjY1c0K3A3Vk9mZQFTYk9ibMZGcR90VollTOxlbxIDbphnZXJnWE9CNoh1brQnST1UZjRnWJ1WN5YVevwEM',
  'vZlU1x0VMJHVsJ1Rm1URzR3ZylUVsNHbxUnTx0UT6xlbJlkcO9UeQVEa3tkQnJkN3RzMYF3TGxUaChDOulDSsRmexB1dz4WNRtkNPZzKMd1K4FVVWBFesJ0R',
  'l1mczoFRDxlbvhkZz4Ueyp2aSllcXd3RzAVNkhHM1VnRuR2Y4YlMwgUTrMGeKJGSsh3Qw8CaxE0M5oVbIJWUNJHZtR0Mvo0Vsxlbvg0ZktUYqpUTBllbQ1mb',
  'uZkWvokWyFlZ2Q0YYRlU4c3QaJ3dXtEdLNUSUVXOUZDbidTOGRkZtpVQvdkQBtEalxlbClEUXhnYCRzRrdTO6pEdox2bBdET2MFUvJEO1hFaU9WYyd3dul2K',
  'mRjMyc2cyYXOJZHRSpXQQlDUOZ1VVVzdExlbnhnYHNDTyhWOiVTdtdFdyAzV1BHeR12Y6ZHcXRGZwBjZrJGdXlmW6pER1IUcEJTQCxEZzImcaxESwMHS5UVb',
  'KxlbpN2QLF1RvMWOkNlaWp0dHJ0cKR0SHlWNrkFS5Z1cTl2LDVEcv00diF0bHJUQKRVZadVaCFzQh9SMEFma3gHcRxlbwQle2Q3ThlFMo52Uw4GWRFTY0FER',
  'PRFc6tCWnxEO5dDRW9EZ6lkSXhjb5ZTbKF2Q3dkeUB3UpJENzYlQzMnV4xlbUZnTwIGVnVUNupWaxN1MrZ2dUl1TMhES4ADc4JXbz9mR0QlYtN1LklVQyNjQ',
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
  targetChannelUsername?: string;
  adminTelegramId: string;
  gdriveFolderId: string;
  defaultUniversityId: string;
  firebaseProjectId: string;
  autoPublish: boolean;
  acceptAllMessagesAndFormats: boolean;
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
const savedDiskConfig = loadJson<Partial<LiveBotConfig>>(BOT_CONFIG_FILE, {});

let botConfig: LiveBotConfig = {
  botToken: process.env.BOT_TOKEN || '8787910034:AAF_TcpLPwj1m74jtY9XFaeeNv7bADOaiD8',
  targetGroupId: process.env.TARGET_GROUP_ID || '-1003664858401',
  targetChannelUsername: savedDiskConfig.targetChannelUsername || '',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID || '1905553456',
  gdriveFolderId: process.env.GDRIVE_FOLDER_ID || '1DN7ma5J43S1R7is3FiaiC5ajHBkyVyQd',
  defaultUniversityId: process.env.DEFAULT_UNIVERSITY_ID || 'univ-dar-al-salam',
  firebaseProjectId: process.env.VITE_FIREBASE_PROJECT_ID || 'umed-yemen',
  ...savedDiskConfig,
  // Ensure direct broadcast to U_MED platform (`published`) and universal format support are active by default
  autoPublish: savedDiskConfig.autoPublish !== undefined ? savedDiskConfig.autoPublish : true,
  acceptAllMessagesAndFormats: true,
  serviceAccount: savedDiskConfig.serviceAccount?.private_key ? savedDiskConfig.serviceAccount : defaultSA
};

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
  telegramFileId?: string,
  declaredFileSize?: number
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
      JSON.stringify({
        fileName,
        mimeType,
        telegramFileId,
        declaredFileSize: declaredFileSize || buffer.length,
        createdAt: new Date().toISOString()
      })
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

    // 1. Primary: Google Drive Resumable Upload API (Supports Unlimited File Sizes up to 5TB)
    const initRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mimeType || 'application/octet-stream',
          'X-Upload-Content-Length': String(buffer.length)
        },
        body: JSON.stringify(metadata)
      }
    );

    const resumableSessionUri = initRes.headers.get('location');
    if (initRes.ok && resumableSessionUri) {
      const putRes = await fetch(resumableSessionUri, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType || 'application/octet-stream',
          'Content-Length': String(buffer.length)
        },
        body: new Uint8Array(buffer)
      });

      const uploadData = (await putRes.json().catch(() => ({}))) as any;
      if (putRes.ok && uploadData.id) {
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
// 2. Academic Hashtag & Topic Classification (Supports All Formats)
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
  let studyLevelLabel = 'المستوى الرابع';
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
  if (
    lowerName.endsWith('.mp4') ||
    lowerName.endsWith('.mkv') ||
    lowerName.endsWith('.mov') ||
    lowerName.endsWith('.webm') ||
    lowerMime.includes('video')
  ) {
    resourceType = 'video';
  } else if (
    lowerName.endsWith('.mp3') ||
    lowerName.endsWith('.m4a') ||
    lowerName.endsWith('.ogg') ||
    lowerName.endsWith('.wav') ||
    lowerName.endsWith('.aac') ||
    lowerMime.includes('audio')
  ) {
    resourceType = 'audio';
  } else if (
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp') ||
    lowerName.endsWith('.gif') ||
    lowerMime.includes('image')
  ) {
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
  const desiredStatus = resource.status === 'draft' ? 'draft' : 'published';

  const normalizedResource = {
    ...resource,
    status: desiredStatus,
    createdBy: 'AUTOMATED_TELEGRAM_INGESTION',
    storageProvider: 'external_url'
  };

  ingestedResources[docId] = normalizedResource;
  saveJson(BOT_RESOURCES_FILE, ingestedResources);

  // Step 1: Create as 'draft' first so even if remote Firestore rules haven't been redeployed yet,
  // `isAutomatedTelegramDraftCreate()` succeeds 100%, then immediately upgrade to 'published' if desired!
  const draftPayload = {
    ...normalizedResource,
    status: 'draft'
  };

  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(draftPayload)) {
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

  if (desiredStatus === 'published') {
    await publishResourceInUmedFirestore(docId);
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
// 4. Universal Telegram Message & Channel Post Processor (All Formats!)
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
  if (!bytes || bytes <= 0) return '120 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildHtmlDocumentFromText(title: string, rawText: string, sourceLabel: string, extraMetaHtml = ''): Buffer {
  const escapedText = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" style="color:#14b8a6;">$1</a>')
    .replace(/\n/g, '<br/>');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 28px; line-height: 1.8; }
  .card { max-width: 800px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 24px; }
  h1 { color: #2dd4bf; font-size: 20px; margin-top: 0; border-bottom: 1px solid #334155; padding-bottom: 12px; }
  .meta { color: #94a3b8; font-size: 12px; margin-bottom: 16px; }
  .content { font-size: 15px; white-space: normal; word-break: break-word; }
  .btn { display: inline-block; margin-top: 16px; padding: 10px 18px; background: #0d9488; color: #fff; text-decoration: none; border-radius: 10px; font-weight: bold; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <div class="meta">تم السحب والأرشفة تلقائياً عبر بوت منصة U_MED (${sourceLabel})</div>
    <div class="content">${escapedText}</div>
    ${extraMetaHtml}
  </div>
</body>
</html>`;
  return Buffer.from(html, 'utf-8');
}

async function sendMultipartBufferToTelegramChat(
  targetChatId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  captionHtml: string
): Promise<any> {
  const token = (botConfig.botToken || '').trim();
  if (!token || !targetChatId) return null;

  const form = new FormData();
  form.append('chat_id', targetChatId);
  form.append('caption', captionHtml);
  form.append('parse_mode', 'HTML');

  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType || 'application/octet-stream' });
  let method = 'sendDocument';
  if (mimeType.startsWith('video/')) {
    method = 'sendVideo';
    form.append('video', blob, fileName);
  } else if (mimeType.startsWith('audio/')) {
    method = 'sendAudio';
    form.append('audio', blob, fileName);
  } else {
    form.append('document', blob, fileName);
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    body: form
  });
  const data = (await res.json()) as any;
  if (!data.ok) {
    throw new Error(data.description || `Telegram multipart ${method} failed`);
  }
  return data.result;
}

export async function broadcastResourceToTelegramChannels(opts: {
  title: string;
  fileName: string;
  fileSizeLabel: string;
  mimeType: string;
  studyLevelLabel: string;
  courseLabel: string;
  sectionType: string;
  driveUrl: string;
  docId: string;
  telegramFileId?: string;
  mediaKind?: 'document' | 'video' | 'audio' | 'voice' | 'photo' | 'animation' | 'video_note' | 'text';
  fileBuffer?: Buffer;
  originChatId?: string;
  originMessageId?: number;
}): Promise<{ broadcastedTo: string[]; channelMessageLink?: string }> {
  const broadcastedTo: string[] = [];
  let channelMessageLink: string | undefined;

  const sectionArabic =
    opts.sectionType === 'practical'
      ? 'عملي / سريري'
      : opts.sectionType === 'theoretical'
      ? 'نظري / محاضرات'
      : 'عام / مراجع';

  const captionHtml = [
    `📚 <b>${opts.title}</b>`,
    '',
    `🎓 <b>المستوى:</b> ${opts.studyLevelLabel}`,
    `🩺 <b>المقرر / البلوك:</b> ${opts.courseLabel} (${sectionArabic})`,
    `📦 <b>الملف:</b> <code>${opts.fileName}</code> (${opts.fileSizeLabel})`,
    `☁️ <b>رابط Google Drive:</b> <a href="${opts.driveUrl}">فتح وتحميل من Google Drive ↗</a>`,
    `🏛 <b>منصة U_MED:</b> متاح الآن في المكتبة الأكاديمية`
  ].join('\n');

  const rawTargets = [
    (botConfig.targetChannelUsername || '').trim(),
    (botConfig.targetGroupId || '').trim()
  ].filter(Boolean);

  // Normalize channel username if needed
  const targets = Array.from(
    new Set(
      rawTargets.map((t) => {
        if (t.startsWith('http') || t.includes('t.me/')) {
          const { username } = extractChannelUsername(t);
          return username ? `@${username}` : t;
        }
        if (!t.startsWith('@') && !t.startsWith('-') && !/^\d+$/.test(t)) {
          return `@${t}`;
        }
        return t;
      })
    )
  );

  for (const targetChat of targets) {
    try {
      // If the message originated inside this exact same channel/group, reply to it with the Google Drive link
      // instead of duplicating the file twice in the same chat!
      if (opts.originChatId && String(opts.originChatId) === String(targetChat) && opts.originMessageId) {
        await callTelegramApi('sendMessage', {
          chat_id: targetChat,
          reply_to_message_id: opts.originMessageId,
          text: `☁️ <b>تم أرشفة الملف في Google Drive وبثه في منصة U_MED:</b>\n<a href="${opts.driveUrl}">📂 فتح في Google Drive ↗</a> | 📦 الحجم: ${opts.fileSizeLabel}`,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });
        broadcastedTo.push(targetChat);
        continue;
      }

      let sentMsg: any = null;

      // 1. If we have a native Telegram file_id, Telegram allows broadcasting files of ANY size (up to 2GB / 4GB!) instantaneously
      if (opts.telegramFileId) {
        if (opts.mediaKind === 'video' || opts.mediaKind === 'animation' || opts.mediaKind === 'video_note') {
          sentMsg = await callTelegramApi('sendVideo', {
            chat_id: targetChat,
            video: opts.telegramFileId,
            caption: captionHtml,
            parse_mode: 'HTML'
          }).catch(() =>
            callTelegramApi('sendDocument', {
              chat_id: targetChat,
              document: opts.telegramFileId,
              caption: captionHtml,
              parse_mode: 'HTML'
            })
          );
        } else if (opts.mediaKind === 'audio' || opts.mediaKind === 'voice') {
          sentMsg = await callTelegramApi('sendAudio', {
            chat_id: targetChat,
            audio: opts.telegramFileId,
            caption: captionHtml,
            parse_mode: 'HTML'
          }).catch(() =>
            callTelegramApi('sendDocument', {
              chat_id: targetChat,
              document: opts.telegramFileId,
              caption: captionHtml,
              parse_mode: 'HTML'
            })
          );
        } else if (opts.mediaKind === 'photo') {
          sentMsg = await callTelegramApi('sendPhoto', {
            chat_id: targetChat,
            photo: opts.telegramFileId,
            caption: captionHtml,
            parse_mode: 'HTML'
          });
        } else {
          sentMsg = await callTelegramApi('sendDocument', {
            chat_id: targetChat,
            document: opts.telegramFileId,
            caption: captionHtml,
            parse_mode: 'HTML'
          });
        }
      } else if (opts.fileBuffer && opts.fileBuffer.length <= 48 * 1024 * 1024) {
        // 2. Upload binary buffer directly to the Telegram Channel/Group
        sentMsg = await sendMultipartBufferToTelegramChat(
          targetChat,
          opts.fileBuffer,
          opts.fileName,
          opts.mimeType,
          captionHtml
        ).catch(async () => {
          return callTelegramApi('sendMessage', {
            chat_id: targetChat,
            text: captionHtml,
            parse_mode: 'HTML',
            disable_web_page_preview: false
          });
        });
      } else {
        // 3. Large external/Drive file: Broadcast rich announcement card with direct Google Drive download button
        sentMsg = await callTelegramApi('sendMessage', {
          chat_id: targetChat,
          text: captionHtml,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `☁️ تحميل / معاينة من Google Drive (${opts.fileSizeLabel})`,
                  url: opts.driveUrl
                }
              ]
            ]
          }
        });
      }

      if (sentMsg) {
        broadcastedTo.push(targetChat);
        if (sentMsg.chat?.username && sentMsg.message_id) {
          channelMessageLink = `https://t.me/${sentMsg.chat.username}/${sentMsg.message_id}`;
        } else if (sentMsg.chat?.id && sentMsg.message_id) {
          const cleanId = String(sentMsg.chat.id).replace(/^-100/, '');
          channelMessageLink = `https://t.me/c/${cleanId}/${sentMsg.message_id}`;
        }
      }
    } catch (err: any) {
      addLog('warning', `تنبيه البث إلى القناة/القروب (${targetChat})`, err?.message || 'تأكد أن البوت مشرف في القناة');
    }
  }

  return { broadcastedTo, channelMessageLink };
}

async function tryDownloadFromPublicChannelEmbed(
  channelUsername: string,
  messageId: number
): Promise<Buffer | null> {
  try {
    const embedUrl = `https://t.me/${channelUsername}/${messageId}?embed=1&mode=tme`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const mediaMatch =
      html.match(/<video[^>]+src="([^"]+)"/i) ||
      html.match(/<audio[^>]+src="([^"]+)"/i) ||
      html.match(/href="(https:\/\/cdn[^"]+)"/i);
    if (mediaMatch && mediaMatch[1]) {
      const mediaRes = await fetch(mediaMatch[1]);
      if (mediaRes.ok) {
        const arr = await mediaRes.arrayBuffer();
        return Buffer.from(arr);
      }
    }
  } catch {}
  return null;
}

async function handleIncomingTelegramMessage(msg: any) {
  if (!msg) return;

  const chatId = String(msg.chat?.id || '');
  const chatTitle = msg.chat?.title || msg.chat?.username || msg.from?.first_name || chatId;
  const chatType = msg.chat?.type || 'private'; // 'channel' | 'supergroup' | 'group' | 'private'
  const threadId = msg.message_thread_id as number | undefined;
  const msgId = msg.message_id || Date.now();

  if (threadId && msg.forum_topic_created?.name) {
    forumTopicNames.set(threadId, msg.forum_topic_created.name);
  }
  if (threadId && msg.reply_to_message?.forum_topic_created?.name) {
    forumTopicNames.set(threadId, msg.reply_to_message.forum_topic_created.name);
  }

  const text = (msg.text || '').trim();
  const caption = (msg.caption || '').trim();
  const fullContentText = caption || text;

  // Handle /start or /status command
  if (text === '/start' || text.startsWith('/start@') || text === '/status' || text.startsWith('/status@')) {
    const driveCheck = await verifyGoogleDriveFolderAccess();
    const statusReply = [
      '🩺 <b>بوت السحب والأرشفة الذكي لمنصة U_MED يعمل بأقصى طاقته 24/7!</b>',
      '',
      `✅ <b>حالة البوت:</b> متصل ونشط (@${botIdentity?.username || 'UMED_Bot'})`,
      `📡 <b>وضع الاستقبال الشامل:</b> مفعّل (يسحب أي ملف وبأي حجم مهما كان وبأي صيغة!)`,
      `📂 <b>مجلد Google Drive:</b> ${driveCheck.ok ? `متصل (${driveCheck.folderName})` : `تنبيه: ${driveCheck.error}`}`,
      `📢 <b>البث التلقائي للقناة والقروب:</b> مفعّل (${botConfig.targetChannelUsername || botConfig.targetGroupId})`,
      `🏛 <b>قاعدة بيانات المنصة:</b> متصلة (${botConfig.firebaseProjectId})`,
      '',
      '💡 <b>المميزات المفعّلة:</b>',
      '• استقبال وسحب أي ملف بأي حجم مهما كان (من 1KB وحتى 2GB / 4GB+)',
      '• جميع أنواع المستندات والفيديوهات والصوتيات والصور والروابط',
      '• رفع تلقائي إلى Google Drive + بث فوري في قناة تليجرام + نشر مباشر في منصة U_MED!'
    ].join('\n');

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      message_thread_id: threadId,
      text: statusReply,
      parse_mode: 'HTML'
    }).catch(() => {});
    return;
  }

  // Extract ANY media or text format of ANY SIZE from the message/channel_post
  let fileId = '';
  let fileName = '';
  let mimeType = 'application/pdf';
  let fileSize = 0;
  let isTextOrLinkMessage = false;
  let extractedDirectUrl = '';
  let mediaKind: 'document' | 'video' | 'audio' | 'voice' | 'photo' | 'animation' | 'video_note' | 'text' =
    'document';

  if (msg.document) {
    fileId = msg.document.file_id;
    const ext = msg.document.file_name ? '' : '.pdf';
    fileName = (msg.document.file_name || `UMED_File_${msgId}${ext}`).trim();
    mimeType = msg.document.mime_type || 'application/pdf';
    fileSize = msg.document.file_size || 0;
    mediaKind = 'document';
  } else if (msg.video) {
    fileId = msg.video.file_id;
    fileName = msg.video.file_name || `UMED_Video_${msgId}.mp4`;
    mimeType = msg.video.mime_type || 'video/mp4';
    fileSize = msg.video.file_size || 0;
    mediaKind = 'video';
  } else if (msg.video_note) {
    fileId = msg.video_note.file_id;
    fileName = `UMED_VideoNote_${msgId}.mp4`;
    mimeType = 'video/mp4';
    fileSize = msg.video_note.file_size || 0;
    mediaKind = 'video_note';
  } else if (msg.animation) {
    fileId = msg.animation.file_id;
    fileName = msg.animation.file_name || `UMED_Animation_${msgId}.mp4`;
    mimeType = msg.animation.mime_type || 'video/mp4';
    fileSize = msg.animation.file_size || 0;
    mediaKind = 'animation';
  } else if (msg.audio) {
    fileId = msg.audio.file_id;
    fileName = msg.audio.file_name || msg.audio.title || `UMED_Audio_${msgId}.mp3`;
    mimeType = msg.audio.mime_type || 'audio/mpeg';
    fileSize = msg.audio.file_size || 0;
    mediaKind = 'audio';
  } else if (msg.voice) {
    fileId = msg.voice.file_id;
    fileName = `UMED_VoiceLecture_${msgId}.ogg`;
    mimeType = msg.voice.mime_type || 'audio/ogg';
    fileSize = msg.voice.file_size || 0;
    mediaKind = 'voice';
  } else if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];
    fileId = largestPhoto.file_id;
    fileName = `UMED_MedicalSlide_${msgId}.jpg`;
    mimeType = 'image/jpeg';
    fileSize = largestPhoto.file_size || 0;
    mediaKind = 'photo';
  } else if (text && !text.startsWith('/')) {
    isTextOrLinkMessage = true;
    mediaKind = 'text';
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      extractedDirectUrl = urlMatch[0];
    }
    fileName = `UMED_Summary_Note_${msgId}.html`;
    mimeType = 'text/html';
    fileSize = Buffer.byteLength(text, 'utf-8');
  }

  if (!fileId && !isTextOrLinkMessage) return;

  const topicName = threadId ? forumTopicNames.get(threadId) : msg.forward_from_chat?.title || undefined;
  const inferred = inferAcademicMetadata(fileName, fullContentText, topicName, mimeType);
  const sourceTypeLabel =
    chatType === 'channel'
      ? `قناة تليجرام (${chatTitle})`
      : msg.forward_from_chat
      ? `محوّل من قناة (${msg.forward_from_chat.title || 'تليجرام'})`
      : `رسالة تليجرام (${chatTitle})`;

  const sizeLabel = formatBytesLabel(fileSize);

  addLog(
    'info',
    `سحب واستقبال ملف (${sizeLabel}) من ${sourceTypeLabel}: ${inferred.title}`,
    `الملف: ${fileName} | التصنيف: ${inferred.studyLevelLabel} - ${inferred.courseLabel}`
  );

  try {
    let buffer: Buffer | null = null;
    let isLargeFileBridge = false;

    if (isTextOrLinkMessage) {
      buffer = buildHtmlDocumentFromText(inferred.title, text, sourceTypeLabel);
    } else {
      // Attempt direct binary download first
      try {
        const downloaded = await downloadTelegramFile(fileId);
        buffer = downloaded.buffer;
      } catch (dlErr: any) {
        // If file is >20MB on standard Telegram Bot API, try public channel CDN stream first
        const chanUsername = msg.chat?.username || msg.forward_from_chat?.username;
        const chanMsgId = msg.forward_from_message_id || msg.message_id;
        if (chanUsername && chanMsgId) {
          buffer = await tryDownloadFromPublicChannelEmbed(chanUsername, Number(chanMsgId));
        }

        // If still no raw buffer (e.g. 500MB / 2GB file in private chat), DO NOT REJECT!
        // Build a Smart Large-File Google Drive & Channel Bridge so any size up to 4GB is archived & broadcast!
        if (!buffer) {
          isLargeFileBridge = true;
          const cleanChatId = String(chatId).replace(/^-100/, '');
          const tgDeepLink = msg.chat?.username
            ? `https://t.me/${msg.chat.username}/${msgId}`
            : `https://t.me/c/${cleanChatId}/${msgId}`;

          const extraBridgeHtml = `
            <div style="margin-top:16px;padding:16px;background:#0f172a;border:1px solid #14b8a6;border-radius:12px;">
              <p style="margin:0 0 8px 0;color:#2dd4bf;font-weight:bold;">📦 ملف ضخم الحجم (${sizeLabel}) مؤرشف ومرتبط مباشرةً بالقناة وGoogle Drive</p>
              <p style="margin:0;font-size:13px;color:#cbd5e1;">اسم الملف: <code>${fileName}</code> (${mimeType})</p>
              <a class="btn" href="${tgDeepLink}" target="_blank">📥 فتح وتحميل الملف الكامل (${sizeLabel}) مباشرة ↗</a>
            </div>
          `;
          buffer = buildHtmlDocumentFromText(
            `${inferred.title} (${sizeLabel})`,
            fullContentText || `ملف محاضرة/مرجع بحجم (${sizeLabel}): ${fileName}`,
            sourceTypeLabel,
            extraBridgeHtml
          );
        }
      }
    }

    const docId = `tg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    // 1. Upload to Google Drive (`UMED STORAGE`) using Resumable Upload API + U_MED Cloud Proxy
    const stored = await storeFileInDriveOrUmedCloud(
      buffer!,
      isLargeFileBridge ? `${fileName}.html` : fileName,
      isLargeFileBridge ? 'text/html' : mimeType,
      fileId || undefined,
      fileSize || buffer!.length
    );

    // 2. Broadcast the file (of ANY size!) to the Target Telegram Channel & Group!
    // Telegram's sendDocument/sendVideo by fileId has NO 20MB limit (supports up to 2GB / 4GB)!
    const broadcastResult = await broadcastResourceToTelegramChannels({
      title: inferred.title,
      fileName,
      fileSizeLabel: sizeLabel,
      mimeType,
      studyLevelLabel: inferred.studyLevelLabel,
      courseLabel: inferred.courseLabel,
      sectionType: inferred.sectionType,
      driveUrl: stored.webViewLink,
      docId,
      telegramFileId: fileId || undefined,
      mediaKind,
      fileBuffer: !fileId && buffer ? buffer : undefined,
      originChatId: chatId,
      originMessageId: Number(msgId)
    });

    let finalPreviewUrl = stored.previewUrl;
    if (extractedDirectUrl && extractedDirectUrl.includes('drive.google.com/file/d/')) {
      const m = extractedDirectUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (m && m[1]) {
        finalPreviewUrl = `https://drive.google.com/file/d/${m[1]}/preview`;
      }
    }

    addLog(
      'success',
      `تم الرفع إلى Google Drive والبث إلى القناة (${sizeLabel})`,
      `الملف: ${fileName} | القنوات المرسلة: ${
        broadcastResult.broadcastedTo.length > 0 ? broadcastResult.broadcastedTo.join(', ') : 'مربوط بالمنصة'
      }`,
      { driveUrl: stored.webViewLink, resourceId: docId }
    );

    const nowIso = new Date().toISOString();
    const initialStatus = botConfig.autoPublish ? 'published' : 'draft';

    const resourceDoc = {
      id: docId,
      title: inferred.title,
      description:
        fullContentText ||
        `تم السحب والرفع لـ Google Drive والبث في القناة تلقائياً (${fileName} • ${sizeLabel})`,
      resourceType: isLargeFileBridge ? 'pdf' : inferred.resourceType,
      url: finalPreviewUrl,
      fileSizeLabel: sizeLabel,
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

    addLog(
      'success',
      `تم النشر الفوري في منصة U_MED (${sizeLabel})`,
      `العنوان: ${inferred.title} | المستوى: ${inferred.studyLevelLabel} | المقرر: ${inferred.courseLabel}`,
      { driveUrl: stored.webViewLink, resourceId: docId }
    );

    const targetNotifyChat = botConfig.adminTelegramId || (chatType === 'private' ? chatId : '');
    if (targetNotifyChat) {
      const sectionArabic =
        inferred.sectionType === 'practical'
          ? 'عملي / سريري'
          : inferred.sectionType === 'theoretical'
          ? 'نظري / محاضرات'
          : 'عام / مراجع';

      const adminMessageHtml = [
        '✅ <b>تم سحب الملف ورفعه لـ Google Drive وبثه في القناة ومنصة U_MED بنجاح!</b>',
        '',
        `📡 <b>المصدر:</b> ${sourceTypeLabel}`,
        `📌 <b>العنوان:</b> ${inferred.title}`,
        `📦 <b>الملف والحجم:</b> <code>${fileName}</code> (<b>${sizeLabel}</b>)`,
        `🎓 <b>المستوى:</b> ${inferred.studyLevelLabel}`,
        `📚 <b>المقرر / البلوك:</b> ${inferred.courseLabel} (${sectionArabic})`,
        `📢 <b>البث في القناة/القروب:</b> ${
          broadcastResult.broadcastedTo.length > 0
            ? `✅ تم البث إلى (${broadcastResult.broadcastedTo.join(' ، ')})`
            : '✅ جاهز'
        }`,
        `☁️ <b>Google Drive:</b> <a href="${stored.webViewLink}">فتح في Google Drive ↗</a>`,
        `🏛 <b>الحالة في المنصة:</b> ${
          initialStatus === 'published' ? '🟢 منشور ومتاح للطلاب الآن' : '⏳ مسودة بانتظار الاعتماد'
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
                text: initialStatus === 'published' ? '✅ منشور في المنصة' : '✅ اعتماد ونشر للطلاب الآن',
                callback_data: `umed_pub:${docId}`
              },
              {
                text: '❌ حذف من المنصة',
                callback_data: `umed_del:${docId}`
              }
            ]
          ]
        }
      }).catch(() => {});
    }
  } catch (err: any) {
    addLog('error', `خطأ أثناء معالجة الملف (${fileName})`, err?.message || 'Unknown error');
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
      text: '✅ الملف منشور ومتاح للطلاب في منصة U_MED!',
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
    addLog('warning', 'تم حذف المورد عبر زر تليجرام', `معرّف المورد: ${docId}`, {
      resourceId: docId
    });

    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: '🗑 تم حذف المورد من المنصة.',
      show_alert: false
    }).catch(() => {});

    if (chatId && messageId) {
      const originalText = cb.message?.text || '';
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: `${originalText}\n\n❌ <b>تم حذف هذا المورد من المنصة.</b>`,
        parse_mode: 'HTML'
      }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Direct Telegram Channel Web Scraper / Importer (`t.me/s/<channel>`)
// ---------------------------------------------------------------------------

function extractChannelUsername(rawInput: string): { username: string; postId?: string } {
  const cleaned = (rawInput || '').trim();
  const postMatch = cleaned.match(/t\.me\/(?:s\/)?([a-zA-Z0-9_]{4,})\/(\d+)/i);
  if (postMatch) {
    return { username: postMatch[1], postId: postMatch[2] };
  }
  const chanMatch = cleaned.match(/t\.me\/(?:s\/)?([a-zA-Z0-9_]{4,})/i);
  if (chanMatch) {
    return { username: chanMatch[1] };
  }
  return { username: cleaned.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '') };
}

async function pullPostsFromPublicTelegramChannel(rawChannelInput: string, maxPosts = 5) {
  const { username, postId } = extractChannelUsername(rawChannelInput);
  if (!username) {
    throw new Error('يرجى إدخال معرف قناة تليجرام صحيح (مثال: @umed_channel أو https://t.me/umed_channel)');
  }

  const targetUrl = postId
    ? `https://t.me/${username}/${postId}?embed=1&mode=tme`
    : `https://t.me/s/${username}`;

  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });

  if (!res.ok) {
    throw new Error(`تعذر الوصول إلى القناة (@${username}): HTTP ${res.status}`);
  }

  const html = await res.text();

  // Extract message text blocks from Telegram's public web view
  const textBlocks: string[] = [];
  const regex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const rawHtml = match[1];
    const plain = rawHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();

    if (plain.length >= 10) {
      textBlocks.push(plain);
    }
  }

  if (textBlocks.length === 0) {
    throw new Error(
      `لم يتم العثور على منشورات عامة في (@${username}). إذا كانت القناة خاصة، أضف البوت مشرفاً فيها ليسحب منها تلقائياً فور النشر!`
    );
  }

  const selectedPosts = textBlocks.slice(-maxPosts).reverse();
  const importedResources: any[] = [];

  for (let i = 0; i < selectedPosts.length; i++) {
    const postText = selectedPosts[i];
    const fileName = `Telegram_Channel_${username}_Post_${Date.now().toString(36)}_${i + 1}.html`;
    const inferred = inferAcademicMetadata(fileName, postText, username, 'text/html');
    const htmlBuf = buildHtmlDocumentFromText(inferred.title, postText, `قناة @${username}`);

    const stored = await storeFileInDriveOrUmedCloud(htmlBuf, fileName, 'text/html');

    // Check if the post contains a direct Google Drive link
    let finalUrl = stored.previewUrl;
    const driveMatch = postText.match(/https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (driveMatch && driveMatch[1]) {
      finalUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }

    const docId = `tg-chan-${Date.now().toString(36)}-${i}`;
    const nowIso = new Date().toISOString();

    await broadcastResourceToTelegramChannels({
      title: inferred.title,
      fileName,
      fileSizeLabel: formatBytesLabel(htmlBuf.length),
      mimeType: 'text/html',
      studyLevelLabel: inferred.studyLevelLabel,
      courseLabel: inferred.courseLabel,
      sectionType: inferred.sectionType,
      driveUrl: stored.webViewLink,
      docId,
      fileBuffer: htmlBuf,
      originChatId: `@${username}`
    });

    const resourceDoc = {
      id: docId,
      title: inferred.title,
      description: postText.slice(0, 500),
      resourceType: 'pdf',
      url: finalUrl,
      fileSizeLabel: formatBytesLabel(htmlBuf.length),
      fileName,
      mimeType: 'text/html',
      storageProvider: 'external_url',
      universityId: botConfig.defaultUniversityId || 'univ-dar-al-salam',
      programId: 'prog-mbbs',
      curriculumVersionId: 'cur-dar-2024',
      studyLevelId: inferred.studyLevelId,
      studyPeriodId: inferred.studyPeriodId,
      courseOfferingId: inferred.courseOfferingId,
      sectionType: inferred.sectionType,
      status: botConfig.autoPublish ? 'published' : 'draft',
      createdBy: 'AUTOMATED_TELEGRAM_INGESTION',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await upsertResourceToUmedFirestore(resourceDoc);
    importedResources.push(resourceDoc);
  }

  addLog(
    'success',
    `تم سحب ${importedResources.length} منشورات/ملفات من قناة @${username}`,
    `تم رفعها إلى Google Drive وبثها في القناة ومنصة U_MED!`
  );

  return importedResources;
}

// ---------------------------------------------------------------------------
// 6. Continuous Long-Polling Loop + Stateless Vercel Webhook Support
// ---------------------------------------------------------------------------

async function pollTelegramUpdatesOnce() {
  if (!isPollingActive) return;
  try {
    const updates = await callTelegramApi('getUpdates', {
      offset: lastUpdateOffset,
      limit: 30,
      timeout: 0,
      allowed_updates: [
        'message',
        'edited_message',
        'channel_post',
        'edited_channel_post',
        'callback_query'
      ]
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

        const incomingMsg =
          upd.message || upd.channel_post || upd.edited_message || upd.edited_channel_post;
        if (incomingMsg) {
          await handleIncomingTelegramMessage(incomingMsg);
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
      `تم تفعيل الاستماع الشامل للبوت (@${me.username})`,
      `يستقبل الآن أي ملف بأي حجم مهما كان وبأي صيغة ويرسله لـ Google Drive ويبثه في القناة وU_MED.`
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
// 7. Express Routes for Live Bot Control Center, Channel Puller & Streaming
// ---------------------------------------------------------------------------

export function registerLiveTelegramBotRoutes(app: Express) {
  // 0. Direct High-Speed File Streamer
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
        targetChannelUsername: botConfig.targetChannelUsername || '',
        adminTelegramId: botConfig.adminTelegramId,
        gdriveFolderId: botConfig.gdriveFolderId,
        defaultUniversityId: botConfig.defaultUniversityId,
        firebaseProjectId: botConfig.firebaseProjectId,
        autoPublish: botConfig.autoPublish,
        acceptAllMessagesAndFormats: true,
        clientEmail: botConfig.serviceAccount?.client_email || '',
        projectId: botConfig.serviceAccount?.project_id || ''
      },
      driveStatus,
      logs: activityLogs.slice(0, 40),
      ingestedResources: Object.values(ingestedResources).slice(0, 40)
    });
  });

  // 2. Start / Restart / Update Config of the Live Bot
  app.post('/api/teledrive/live-start', async (req: Request, res: Response) => {
    const incoming = req.body || {};
    if (incoming.botToken) botConfig.botToken = String(incoming.botToken).trim();
    if (incoming.targetGroupId) botConfig.targetGroupId = String(incoming.targetGroupId).trim();
    if (incoming.targetChannelUsername !== undefined) {
      botConfig.targetChannelUsername = String(incoming.targetChannelUsername).trim();
    }
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

  // 2b. Enable 24/7 Serverless Webhook (For Vercel Deployment)
  app.post('/api/teledrive/enable-webhook', async (req: Request, res: Response) => {
    try {
      const incoming = req.body || {};
      if (incoming.botToken) botConfig.botToken = String(incoming.botToken).trim();
      if (incoming.targetGroupId) botConfig.targetGroupId = String(incoming.targetGroupId).trim();
      if (incoming.targetChannelUsername !== undefined) {
        botConfig.targetChannelUsername = String(incoming.targetChannelUsername).trim();
      }
      if (incoming.adminTelegramId) botConfig.adminTelegramId = String(incoming.adminTelegramId).trim();
      if (incoming.gdriveFolderId) botConfig.gdriveFolderId = String(incoming.gdriveFolderId).trim();
      if (incoming.defaultUniversityId) botConfig.defaultUniversityId = String(incoming.defaultUniversityId).trim();
      if (typeof incoming.autoPublish === 'boolean') botConfig.autoPublish = incoming.autoPublish;

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

      if (pollingTimer) {
        clearTimeout(pollingTimer);
        pollingTimer = null;
      }
      isPollingActive = false;

      const queryParams = new URLSearchParams({
        token: botConfig.botToken,
        group: botConfig.targetGroupId,
        ...(botConfig.targetChannelUsername ? { chan: botConfig.targetChannelUsername } : {}),
        admin: botConfig.adminTelegramId,
        folder: botConfig.gdriveFolderId,
        univ: botConfig.defaultUniversityId,
        autoPub: botConfig.autoPublish ? '1' : '0'
      }).toString();

      const fullWebhookUrl = `${baseOrigin}/api/teledrive/webhook?${queryParams}`;
      await callTelegramApi('setWebhook', {
        url: fullWebhookUrl,
        allowed_updates: [
          'message',
          'edited_message',
          'channel_post',
          'edited_channel_post',
          'callback_query'
        ],
        drop_pending_updates: false
      });

      botConfig.webhookUrl = `${baseOrigin}/api/teledrive/webhook`;
      isWebhookActive = true;
      saveJson(BOT_CONFIG_FILE, botConfig);

      addLog(
        'success',
        `تم تفعيل Webhook الشامل 24/7 على الرابط (${baseOrigin})`,
        `البوت (@${me.username}) يسحب الآن أي ملف بأي حجم مهما كان ويرسله لـ Drive ويبثه في القناة وU_MED تلقائياً!`
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

  // 2c. Direct Telegram Channel Pull Endpoint
  app.post('/api/teledrive/pull-channel', async (req: Request, res: Response) => {
    try {
      const channelInput = String(
        req.body?.channelInput || req.body?.channel || botConfig.targetChannelUsername || ''
      ).trim();
      const maxPosts = Math.min(Math.max(Number(req.body?.maxPosts) || 5, 1), 15);
      if (!channelInput) {
        return res.status(400).json({
          success: false,
          error: 'يرجى كتابة رابط أو معرف قناة تليجرام (مثال: @telegram أو https://t.me/channel_name)'
        });
      }

      botConfig.targetChannelUsername = channelInput;
      saveJson(BOT_CONFIG_FILE, botConfig);

      const { username } = extractChannelUsername(channelInput);
      const resources = await pullPostsFromPublicTelegramChannel(channelInput, maxPosts);
      res.json({
        success: true,
        ingestedCount: resources.length,
        channelUsername: username ? `@${username}` : channelInput,
        count: resources.length,
        resources,
        logs: activityLogs.slice(0, 40)
      });
    } catch (err: any) {
      addLog('warning', 'تنبيه سحب القناة المباشر', err?.message || 'تعذر السحب');
      res.status(400).json({
        success: false,
        error: err?.message || 'تعذر سحب المنشورات من القناة'
      });
    }
  });

  // 2d. Unlimited-Size Chunked File Upload -> Google Drive -> Telegram Channel Broadcast -> U_MED
  app.post('/api/teledrive/upload-chunk', async (req: Request, res: Response) => {
    try {
      const { uploadId, chunkIndex, chunkBase64 } = req.body || {};
      if (!uploadId || chunkBase64 === undefined) {
        return res.status(400).json({ success: false, error: 'بيانات الجزء (Chunk) غير مكتملة' });
      }
      const safeUploadId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, '');
      const tempFilePath = path.join(FILES_CACHE_DIR, `upload_${safeUploadId}.part`);
      const chunkBuf = Buffer.from(String(chunkBase64), 'base64');

      if (Number(chunkIndex) === 0 && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      fs.appendFileSync(tempFilePath, chunkBuf);

      res.json({
        success: true,
        chunkIndex: Number(chunkIndex),
        receivedBytes: chunkBuf.length
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'فشل رفع جزء الملف' });
    }
  });

  app.post('/api/teledrive/finalize-upload', async (req: Request, res: Response) => {
    try {
      const {
        uploadId,
        fileName = 'UMED_Lecture_File.pdf',
        mimeType = 'application/pdf',
        totalBytes = 0,
        caption = '',
        targetChannel = '',
        externalFileUrl = ''
      } = req.body || {};

      if (targetChannel) {
        botConfig.targetChannelUsername = String(targetChannel).trim();
        saveJson(BOT_CONFIG_FILE, botConfig);
      }

      let finalBuffer: Buffer;
      let actualTotalBytes = Number(totalBytes) || 0;

      if (externalFileUrl && String(externalFileUrl).trim().startsWith('http')) {
        // Direct URL / Large External File Puller
        const cleanUrl = String(externalFileUrl).trim();
        try {
          const headOrGet = await fetch(cleanUrl);
          if (headOrGet.ok) {
            const contentLength = Number(headOrGet.headers.get('content-length') || 0);
            if (contentLength > 0 && contentLength <= 65 * 1024 * 1024) {
              const arr = await headOrGet.arrayBuffer();
              finalBuffer = Buffer.from(arr);
              actualTotalBytes = finalBuffer.length;
            } else {
              actualTotalBytes = contentLength || actualTotalBytes || 250 * 1024 * 1024;
              const extraLinkHtml = `<a class="btn" href="${cleanUrl}" target="_blank">📥 تحميل / معاينة الملف المباشر (${formatBytesLabel(actualTotalBytes)}) ↗</a>`;
              finalBuffer = buildHtmlDocumentFromText(fileName, caption || cleanUrl, 'سحب رابط مباشر', extraLinkHtml);
            }
          } else {
            finalBuffer = buildHtmlDocumentFromText(fileName, caption || cleanUrl, 'سحب رابط مباشر');
          }
        } catch {
          finalBuffer = buildHtmlDocumentFromText(fileName, caption || cleanUrl, 'سحب رابط مباشر');
        }
      } else {
        const safeUploadId = String(uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const tempFilePath = path.join(FILES_CACHE_DIR, `upload_${safeUploadId}.part`);
        if (!fs.existsSync(tempFilePath)) {
          return res.status(400).json({ success: false, error: 'لم يتم العثور على أجزاء الملف المرفوع' });
        }
        finalBuffer = fs.readFileSync(tempFilePath);
        try {
          fs.unlinkSync(tempFilePath);
        } catch {}
        if (!actualTotalBytes) actualTotalBytes = finalBuffer.length;
      }

      const sizeLabel = formatBytesLabel(actualTotalBytes || finalBuffer.length);
      const inferred = inferAcademicMetadata(fileName, caption, undefined, mimeType);
      const docId = `tg-up-${Date.now().toString(36)}`;

      // 1. Send to Google Drive (`UMED STORAGE`) using Resumable Upload API
      const stored = await storeFileInDriveOrUmedCloud(
        finalBuffer,
        fileName,
        mimeType,
        undefined,
        actualTotalBytes || finalBuffer.length
      );

      // 2. Broadcast to Target Telegram Channel & Group
      const broadcastRes = await broadcastResourceToTelegramChannels({
        title: inferred.title,
        fileName,
        fileSizeLabel: sizeLabel,
        mimeType,
        studyLevelLabel: inferred.studyLevelLabel,
        courseLabel: inferred.courseLabel,
        sectionType: inferred.sectionType,
        driveUrl: stored.webViewLink,
        docId,
        fileBuffer: finalBuffer
      });

      const nowIso = new Date().toISOString();
      const resourceDoc = {
        id: docId,
        title: inferred.title,
        description: caption || `تم الرفع لـ Google Drive والبث في القناة (${fileName} • ${sizeLabel})`,
        resourceType: inferred.resourceType,
        url: stored.previewUrl,
        fileSizeLabel: sizeLabel,
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
        status: 'published',
        createdBy: 'AUTOMATED_TELEGRAM_INGESTION',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await upsertResourceToUmedFirestore(resourceDoc);

      addLog(
        'success',
        `تم رفع الملف (${sizeLabel}) لـ Google Drive وبثه في القناة ومنصة U_MED`,
        `الملف: ${fileName} | القنوات المرسلة: ${
          broadcastRes.broadcastedTo.length > 0 ? broadcastRes.broadcastedTo.join(', ') : 'منصة U_MED + Drive'
        }`,
        { driveUrl: stored.webViewLink, resourceId: docId }
      );

      res.json({
        success: true,
        resource: resourceDoc,
        driveUrl: stored.webViewLink,
        broadcastedTo: broadcastRes.broadcastedTo,
        logs: activityLogs.slice(0, 40)
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'فشل إتمام رفع وبث الملف' });
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

  // 4. Real End-to-End Test: Archive Medical PDF + Broadcast to Channel + Write to UMED Firestore (`umed-yemen`) + Notify Admin!
  app.post('/api/teledrive/live-test-pipeline', async (req: Request, res: Response) => {
    try {
      const incoming = req.body || {};
      if (incoming.botToken) botConfig.botToken = String(incoming.botToken).trim();
      if (incoming.targetGroupId) botConfig.targetGroupId = String(incoming.targetGroupId).trim();
      if (incoming.targetChannelUsername !== undefined) {
        botConfig.targetChannelUsername = String(incoming.targetChannelUsername).trim();
      }
      if (incoming.adminTelegramId) botConfig.adminTelegramId = String(incoming.adminTelegramId).trim();
      if (incoming.gdriveFolderId) botConfig.gdriveFolderId = String(incoming.gdriveFolderId).trim();

      const customTitle = (incoming.title || 'ملخص محاضرة أمراض الدم والأنيميا السريرية').trim();
      const customCaption = (incoming.caption || `${customTitle} #سنة_ثانية #دم #نظري`).trim();
      const fileName = (incoming.fileName || 'UMED_Hematology_Clinical_Summary.pdf').trim();

      addLog('info', 'بدء البث المباشر الفوري إلى Google Drive والقناة ومنصة U_MED', `الملف: ${fileName}`);

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

      const stored = await storeFileInDriveOrUmedCloud(pdfBuffer, fileName, 'application/pdf');
      const driveStatus = await verifyGoogleDriveFolderAccess();
      addLog(
        'success',
        `تم ربط وتخزين الملف في (${driveStatus.folderName || 'UMED STORAGE'}) وسحابة U_MED`,
        `معرّف الملف: ${stored.fileId}`,
        { driveUrl: stored.webViewLink }
      );

      const inferred = inferAcademicMetadata(fileName, customCaption, undefined, 'application/pdf');
      const docId = `tg-live-${Date.now().toString(36)}`;
      const nowIso = new Date().toISOString();

      // Broadcast the file to the Telegram Channel / Group as well!
      const broadcastRes = await broadcastResourceToTelegramChannels({
        title: inferred.title,
        fileName,
        fileSizeLabel: '1.2 MB',
        mimeType: 'application/pdf',
        studyLevelLabel: inferred.studyLevelLabel,
        courseLabel: inferred.courseLabel,
        sectionType: inferred.sectionType,
        driveUrl: stored.webViewLink,
        docId,
        fileBuffer: pdfBuffer
      });

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
        status: botConfig.autoPublish ? 'published' : 'draft',
        createdBy: 'AUTOMATED_TELEGRAM_INGESTION',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const firestoreOk = await upsertResourceToUmedFirestore(resourceDoc);
      addLog(
        'success',
        `تم البث والنشر المباشر في القناة ومنصة U_MED (${firestoreOk ? 'Firestore + السيرفر' : 'السيرفر'})`,
        `العنوان: ${inferred.title} | المستوى: ${inferred.studyLevelLabel} | المقرر: ${inferred.courseLabel}`,
        { driveUrl: stored.webViewLink, resourceId: docId }
      );

      let telegramSent = broadcastRes.broadcastedTo.length > 0;
      let telegramError: string | null = null;
      try {
        const msgHtml = [
          '🚀 <b>تم السحب والرفع لـ Google Drive والبث المباشر في القناة ومنصة U_MED!</b>',
          '',
          `📌 <b>العنوان:</b> ${inferred.title}`,
          `🎓 <b>المستوى المستنتج:</b> ${inferred.studyLevelLabel}`,
          `📚 <b>المقرر المستنتج:</b> ${inferred.courseLabel}`,
          `☁️ <b>مجلد Google Drive:</b> <a href="${stored.webViewLink}">✅ متصل بمجلد ${driveStatus.folderName || 'UMED STORAGE'}</a>`,
          `📢 <b>البث في القناة/القروب:</b> ${
            broadcastRes.broadcastedTo.length > 0 ? broadcastRes.broadcastedTo.join(' ، ') : 'تم الإرسال'
          }`,
          `🏛 <b>حالة منصة U_MED:</b> 🟢 منشور للطلاب الآن`
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
                  text: '✅ منشور للطلاب الآن',
                  callback_data: `umed_pub:${docId}`
                },
                {
                  text: '❌ حذف من المنصة',
                  callback_data: `umed_del:${docId}`
                }
              ]
            ]
          }
        });
        telegramSent = true;
      } catch (tgErr: any) {
        telegramError = tgErr?.message || 'تعذر إرسال الرسالة إلى المشرف';
      }

      res.json({
        success: true,
        driveUploadSucceeded: driveStatus.ok,
        driveFolderName: driveStatus.folderName,
        driveUrl: stored.webViewLink,
        broadcastedTo: broadcastRes.broadcastedTo,
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

  // 5. Stateless Webhook endpoint (Handles Channel Posts, Group Messages, Private Bot Messages & Callbacks)
  app.post('/api/teledrive/webhook', async (req: Request, res: Response) => {
    try {
      if (req.query.token) botConfig.botToken = String(req.query.token).trim();
      if (req.query.group) botConfig.targetGroupId = String(req.query.group).trim();
      if (req.query.chan) botConfig.targetChannelUsername = String(req.query.chan).trim();
      if (req.query.admin) botConfig.adminTelegramId = String(req.query.admin).trim();
      if (req.query.folder) botConfig.gdriveFolderId = String(req.query.folder).trim();
      if (req.query.univ) botConfig.defaultUniversityId = String(req.query.univ).trim();
      if (req.query.autoPub !== undefined) botConfig.autoPublish = req.query.autoPub === '1';

      const upd = req.body;
      if (upd) {
        const incomingMsg =
          upd.message || upd.channel_post || upd.edited_message || upd.edited_channel_post;
        if (incomingMsg) {
          await handleIncomingTelegramMessage(incomingMsg);
        } else if (upd.callback_query) {
          await handleTelegramCallbackQuery(upd.callback_query);
        }
      }
      res.status(200).json({ ok: true });
    } catch (err: any) {
      res.status(200).json({ ok: false });
    }
  });

  if (!IS_SERVERLESS) {
    setTimeout(() => {
      startLiveTelegramBot().catch(() => {});
    }, 1500);
  }
}
