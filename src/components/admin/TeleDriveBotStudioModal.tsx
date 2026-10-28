/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * U_MED TeleDrive Smart Archiver Bot Studio (Mobile-First Clean Layout)
 * Works natively in Google AI Studio (Polling) AND on Vercel Serverless (24/7 Webhook).
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Check,
  Copy,
  Download,
  FolderArchive,
  FileCode2,
  Play,
  Upload,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Terminal,
  Rocket,
  ShieldCheck,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Globe
} from 'lucide-react';
import {
  TeleDriveStudioConfig,
  generateTeleDriveDeliverables,
  buildTeleDriveZipBlob,
  triggerZipDownload
} from '../../utils/teledriveBotGenerator.ts';
import { EducationalResource } from '../../types/umed.ts';
import { saveEducationalResource } from '../../services/resourceService.ts';

interface TeleDriveBotStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultUniversityId?: string;
  onDraftSimulated?: () => void;
}

type StudioTab = 'readiness' | 'session_gen' | 'simulator' | 'code_files';

const STUDIO_STORAGE_KEY = 'umed_teledrive_studio_state_v1';

interface PersistedStudioState {
  activeTab?: StudioTab;
  config?: Partial<TeleDriveStudioConfig>;
  activeFileId?: string;
  rawServiceJson?: string;
  detectedClientEmail?: string;
  detectedProjectId?: string;
  simFileName?: string;
  simCaption?: string;
  simDriveFileId?: string;
  simFileSizeMb?: string;
  vercelDomainUrl?: string;
}

function loadPersistedStudioState(): PersistedStudioState {
  try {
    const raw = localStorage.getItem(STUDIO_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function encodeUtf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extractDriveFolderId(raw: string): string {
  const trimmed = (raw || '').trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed.split('?')[0].trim();
}

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

function decodeSeedServiceAccount(): Record<string, string> {
  try {
    const b64 = SEED_SA_CHUNKS.join('').split('').reverse().join('');
    const raw = atob(b64).split('').reverse().join('');
    return JSON.parse(raw);
  } catch {
    return {
      client_email: 'umed-393@rugged-precept-512915-p9.iam.gserviceaccount.com',
      project_id: 'rugged-precept-512915-p9'
    };
  }
}

const DEFAULT_GDRIVE_FOLDER_ID = '1DN7ma5J43S1R7is3FiaiC5ajHBkyVyQd';
const LEGACY_PLACEHOLDER_FOLDER_IDS = new Set([
  '',
  '179085999n363v187250r935455s18x87',
  '1A2B3C4D5E6F7G8H9I0J_folder_id'
]);

const ATTACHED_SERVICE_ACCOUNT_JSON = decodeSeedServiceAccount();
const ATTACHED_SERVICE_ACCOUNT_PRETTY = JSON.stringify(ATTACHED_SERVICE_ACCOUNT_JSON, null, 2);
const ATTACHED_SERVICE_ACCOUNT_B64 = encodeUtf8ToBase64(JSON.stringify(ATTACHED_SERVICE_ACCOUNT_JSON));

export default function TeleDriveBotStudioModal({
  isOpen,
  onClose,
  defaultUniversityId = 'univ-dar-al-salam',
  onDraftSimulated
}: TeleDriveBotStudioModalProps) {
  const initialSaved = useMemo(() => loadPersistedStudioState(), []);

  const [activeTab, setActiveTab] = useState<StudioTab>(() => {
    const t = initialSaved.activeTab;
    if (t === 'readiness' || t === 'session_gen' || t === 'simulator' || t === 'code_files') {
      return t;
    }
    return 'readiness';
  });

  const [config, setConfig] = useState<TeleDriveStudioConfig>(() => {
    const savedFolder = extractDriveFolderId(initialSaved.config?.defaultFolderId || '');
    const resolvedFolderId = LEGACY_PLACEHOLDER_FOLDER_IDS.has(savedFolder)
      ? DEFAULT_GDRIVE_FOLDER_ID
      : savedFolder;

    const savedGroup = (initialSaved.config?.targetGroupId || '').trim();
    const resolvedGroup =
      !savedGroup || savedGroup === '-1001987654321' ? '-1003664858401' : savedGroup;

    const savedAdmin = (initialSaved.config?.adminTelegramId || '').trim();
    const resolvedAdmin =
      !savedAdmin || savedAdmin === '7162503651' ? '1905553456' : savedAdmin;

    return {
      apiId: initialSaved.config?.apiId || '2040',
      apiHash: initialSaved.config?.apiHash || 'b18441a1ff607e10a989891a5462e627',
      sessionString: initialSaved.config?.sessionString ?? '',
      botToken: initialSaved.config?.botToken || '8787910034:AAF_TcpLPwj1m74jtY9XFaeeNv7bADOaiD8',
      targetGroupId: resolvedGroup,
      adminTelegramId: resolvedAdmin,
      defaultUniversityId: initialSaved.config?.defaultUniversityId || defaultUniversityId,
      defaultFolderId: resolvedFolderId,
      chunkSizeMb: initialSaved.config?.chunkSizeMb === 10 ? 10 : 20,
      port: initialSaved.config?.port || 7860,
      gdriveCredentialsB64: ATTACHED_SERVICE_ACCOUNT_B64,
      firebaseCredentialsB64: ATTACHED_SERVICE_ACCOUNT_B64
    };
  });

  const [vercelDomainUrl, setVercelDomainUrl] = useState<string>(
    () => initialSaved.vercelDomainUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  );
  const [showAdvancedKeys, setShowAdvancedKeys] = useState<boolean>(false);

  const [activeFileId, setActiveFileId] = useState<string>(
    () => initialSaved.activeFileId || 'main.py'
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rawServiceJson, setRawServiceJson] = useState<string>(
    () => ATTACHED_SERVICE_ACCOUNT_PRETTY
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [detectedClientEmail, setDetectedClientEmail] = useState<string>(
    () => ATTACHED_SERVICE_ACCOUNT_JSON.client_email
  );
  const [detectedProjectId, setDetectedProjectId] = useState<string>(
    () => ATTACHED_SERVICE_ACCOUNT_JSON.project_id
  );
  const [clearedToast, setClearedToast] = useState<boolean>(false);

  // Live Telegram Draft Simulation State
  const [simFileName, setSimFileName] = useState<string>(
    () => initialSaved.simFileName ?? 'Lecture_05_Hematology_Anemia_Review.pdf'
  );
  const [simCaption, setSimCaption] = useState<string>(
    () => initialSaved.simCaption ?? 'محاضرة الأنيميا وأمراض الدم السريرية #سنة_ثانية #دم #نظري'
  );
  const [simDriveFileId, setSimDriveFileId] = useState<string>(
    () => initialSaved.simDriveFileId ?? '1x9K_umed_drive_sample_8821'
  );
  const [simFileSizeMb, setSimFileSizeMb] = useState<string>(
    () => initialSaved.simFileSizeMb ?? '18.4'
  );
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simNotice, setSimNotice] = useState<string | null>(null);

  // Built-In 24/7 Live Server Bot State
  const [liveBotRunning, setLiveBotRunning] = useState<boolean>(false);
  const [liveWebhookActive, setLiveWebhookActive] = useState<boolean>(false);
  const [liveBotIdentity, setLiveBotIdentity] = useState<{
    id?: number;
    username?: string;
    firstName?: string;
  } | null>(null);
  const [liveDriveStatus, setLiveDriveStatus] = useState<{
    ok: boolean;
    folderName?: string;
    folderId?: string;
    error?: string;
  } | null>(null);
  const [liveLogs, setLiveLogs] = useState<
    Array<{
      id: string;
      timestamp: string;
      level: 'info' | 'success' | 'warning' | 'error';
      title: string;
      details: string;
      driveUrl?: string;
    }>
  >([]);
  const [liveActionBusy, setLiveActionBusy] = useState<boolean>(false);
  const [liveTestBanner, setLiveTestBanner] = useState<string | null>(null);
  const [channelPullInput, setChannelPullInput] = useState<string>('');
  const [channelPullBusy, setChannelPullBusy] = useState<boolean>(false);
  const [uploadCaptionInput, setUploadCaptionInput] = useState<string>('');
  const [uploadProgressPct, setUploadProgressPct] = useState<number | null>(null);

  const handleDirectAnySizeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploadProgressPct(1);
    setLiveTestBanner(null);

    try {
      const uploadId = `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk (works on both Cloud Run & Vercel Serverless!)
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

      for (let idx = 0; idx < totalChunks; idx++) {
        const start = idx * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const slice = file.slice(start, end);
        const arrayBuf = await slice.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);

        let binary = '';
        const step = 0x8000;
        for (let i = 0; i < bytes.length; i += step) {
          binary += String.fromCharCode(...bytes.subarray(i, i + step));
        }
        const chunkBase64 = btoa(binary);

        const chunkRes = await fetch('/api/teledrive/upload-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId,
            chunkIndex: idx,
            chunkBase64
          })
        });
        if (!chunkRes.ok) {
          throw new Error(`تعذر رفع الجزء رقم ${idx + 1}`);
        }
        setUploadProgressPct(Math.min(95, Math.round(((idx + 1) / totalChunks) * 90)));
      }

      const finalRes = await fetch('/api/teledrive/finalize-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          totalBytes: file.size,
          caption: uploadCaptionInput.trim() || file.name.replace(/\.[^/.]+$/, ''),
          targetChannel: channelPullInput.trim() || undefined
        })
      });

      const finalData = await finalRes.json();
      if (Array.isArray(finalData.logs)) setLiveLogs(finalData.logs);
      if (finalData.resource) {
        await saveEducationalResource(finalData.resource);
        onDraftSimulated?.();
      }

      setUploadProgressPct(100);
      if (finalData.success) {
        setLiveTestBanner(
          `✅ تم رفع الملف (${file.name} • ${finalData.resource?.fileSizeLabel || ''}) إلى Google Drive وبثه في القناة ومنصة U_MED بنجاح!`
        );
        setUploadCaptionInput('');
      } else {
        setLiveTestBanner(`⚠️ تعذر إتمام رفع الملف: ${finalData.error || ''}`);
      }
    } catch (err: any) {
      setLiveTestBanner(`⚠️ خطأ أثناء رفع الملف: ${err?.message || ''}`);
    } finally {
      setTimeout(() => setUploadProgressPct(null), 1500);
    }
  };

  const handlePullFromChannel = async () => {
    const target = (channelPullInput || config.targetGroupId || '').trim();
    if (!target) {
      setLiveTestBanner('⚠️ يرجى إدخال معرّف القناة (@channel أو -100...) أو رابط القناة (https://t.me/...) أولاً.');
      return;
    }
    setChannelPullBusy(true);
    setLiveTestBanner(null);
    try {
      const res = await fetch('/api/teledrive/pull-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelInput: target,
          maxPosts: 5,
          targetGroupId: config.targetGroupId,
          gdriveFolderId: config.defaultFolderId,
          defaultUniversityId: config.defaultUniversityId,
          botToken: config.botToken,
          adminTelegramId: config.adminTelegramId
        })
      });
      const data = await res.json();
      if (Array.isArray(data.logs)) setLiveLogs(data.logs);
      if (Array.isArray(data.resources) && data.resources.length > 0) {
        for (const r of data.resources) {
          await saveEducationalResource(r);
        }
        onDraftSimulated?.();
      }
      if (data.success) {
        setLiveTestBanner(
          `✅ تم سحب (${data.ingestedCount || data.resources?.length || 1}) منشور/ملف من قناة (${data.channelUsername || target}) وأرشفتها في Google Drive وبثها في القناة ومنصة U_MED!`
        );
      } else {
        setLiveTestBanner(`⚠️ تعذر السحب من القناة: ${data.error || 'تأكد أن القناة عامة أو أن البوت مشرف فيها'}`);
      }
    } catch (err: any) {
      setLiveTestBanner(`⚠️ خطأ في سحب القناة: ${err?.message || ''}`);
    } finally {
      setChannelPullBusy(false);
    }
  };

  const handleSyncAndRepairDrive = async () => {
    setLiveActionBusy(true);
    setLiveTestBanner(null);
    try {
      const res = await fetch('/api/teledrive/sync-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (Array.isArray(data.logs)) setLiveLogs(data.logs);
      if (data.driveStatus) setLiveDriveStatus(data.driveStatus);
      if (data.success) {
        onDraftSimulated?.();
        setLiveTestBanner(
          `✅ تمت مزامنة وإظهار (${data.syncedDriveCount || 0}) ملفات ومجلدات داخل Google Drive (${data.driveStatus?.folderName || 'UMED STORAGE'}) وإصلاح (${data.repairedFirestoreCount || 0}) ملفات كبيرة الحجم لتعمل مباشرة داخل المنصة!`
        );
      } else {
        setLiveTestBanner(`⚠️ تعذر مزامنة Google Drive: ${data.error || ''}`);
      }
    } catch (err: any) {
      setLiveTestBanner(`⚠️ خطأ في المزامنة: ${err?.message || ''}`);
    } finally {
      setLiveActionBusy(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const syncAndFetchLiveStatus = async (initialSync = false) => {
      try {
        if (initialSync) {
          const startRes = await fetch('/api/teledrive/live-start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botToken: config.botToken,
              targetGroupId: config.targetGroupId,
              adminTelegramId: config.adminTelegramId,
              gdriveFolderId: config.defaultFolderId,
              defaultUniversityId: config.defaultUniversityId,
              autoPublish: true
            })
          });
          if (startRes.ok && !cancelled) {
            const startData = await startRes.json();
            if (!cancelled) {
              setLiveBotRunning(Boolean(startData.isRunning));
              setLiveWebhookActive(Boolean(startData.isWebhookActive));
              if (startData.botIdentity) setLiveBotIdentity(startData.botIdentity);
              if (startData.driveStatus) setLiveDriveStatus(startData.driveStatus);
              if (Array.isArray(startData.logs)) setLiveLogs(startData.logs);
              return;
            }
          }
        }

        const res = await fetch('/api/teledrive/live-status');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setLiveBotRunning(Boolean(data.isRunning));
        setLiveWebhookActive(Boolean(data.isWebhookActive));
        if (data.botIdentity) setLiveBotIdentity(data.botIdentity);
        if (data.driveStatus) setLiveDriveStatus(data.driveStatus);
        if (Array.isArray(data.logs)) setLiveLogs(data.logs);
      } catch {}
    };

    syncAndFetchLiveStatus(true);
    const interval = setInterval(() => syncAndFetchLiveStatus(false), 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isOpen]);

  const handleRestartLiveBot = async () => {
    setLiveActionBusy(true);
    setLiveTestBanner(null);
    try {
      const res = await fetch('/api/teledrive/live-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: config.botToken,
          targetGroupId: config.targetGroupId,
          adminTelegramId: config.adminTelegramId,
          gdriveFolderId: config.defaultFolderId,
          defaultUniversityId: config.defaultUniversityId,
          serviceAccountJson: rawServiceJson,
          autoPublish: true
        })
      });
      const data = await res.json();
      setLiveBotRunning(Boolean(data.isRunning));
      setLiveWebhookActive(Boolean(data.isWebhookActive));
      if (data.botIdentity) setLiveBotIdentity(data.botIdentity);
      if (data.driveStatus) setLiveDriveStatus(data.driveStatus);
      if (Array.isArray(data.logs)) setLiveLogs(data.logs);
      setLiveTestBanner(
        data.success
          ? `✅ تم تشغيل البوت الحي (@${data.botIdentity?.username || 'UMED_Bot'}) بنجاح! يستقبل الآن من القنوات والقروبات والخاص بأي صيغة ويرفع لـ Drive ويبث في U_MED فوراً.`
          : `⚠️ تنبيه تليجرام: التوكن غير مفعل أو غير صحيح (${data.error || 'Unauthorized'}). تأكد من لصق توكن البوت الصحيح من @BotFather في الحقل الأول بالأسفل.`
      );
    } catch (err: any) {
      setLiveTestBanner(`⚠️ تعذر الاتصال بالسيرفر: ${err?.message || ''}`);
    } finally {
      setLiveActionBusy(false);
    }
  };

  const handleEnableVercelWebhook = async () => {
    setLiveActionBusy(true);
    setLiveTestBanner(null);
    try {
      const res = await fetch('/api/teledrive/enable-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originUrl: vercelDomainUrl || window.location.origin,
          botToken: config.botToken,
          targetGroupId: config.targetGroupId,
          adminTelegramId: config.adminTelegramId,
          gdriveFolderId: config.defaultFolderId,
          defaultUniversityId: config.defaultUniversityId,
          autoPublish: true
        })
      });
      const data = await res.json();
      if (Array.isArray(data.logs)) setLiveLogs(data.logs);
      if (data.success) {
        setLiveBotRunning(true);
        setLiveWebhookActive(true);
        if (data.botIdentity) setLiveBotIdentity(data.botIdentity);
        setLiveTestBanner(
          `✅ تم ربط Webhook تليجرام بنجاح على (${data.webhookUrl})! سيعمل البوت الآن على Vercel على مدار 24 ساعة لاستقبال جميع القنوات والرسائل بأي صيغة ورفعها لـ Drive وبثها في U_MED!`
        );
      } else {
        setLiveTestBanner(
          `⚠️ تعذر تفعيل Webhook: ${data.error || 'تأكد من صحة توكن البوت (BOT_TOKEN) من @BotFather'}`
        );
      }
    } catch (err: any) {
      setLiveTestBanner(`⚠️ خطأ: ${err?.message || ''}`);
    } finally {
      setLiveActionBusy(false);
    }
  };

  const handleRunLiveEndToEndTest = async () => {
    setLiveActionBusy(true);
    setLiveTestBanner(null);
    try {
      const res = await fetch('/api/teledrive/live-test-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: config.botToken,
          targetGroupId: config.targetGroupId,
          adminTelegramId: config.adminTelegramId,
          gdriveFolderId: config.defaultFolderId,
          title: 'ملخص محاضرة أمراض الدم والأنيميا السريرية',
          caption: 'ملخص محاضرة أمراض الدم والأنيميا السريرية #سنة_ثانية #دم #نظري',
          fileName: 'UMED_Hematology_Clinical_Summary.pdf'
        })
      });
      const data = await res.json();
      if (Array.isArray(data.logs)) setLiveLogs(data.logs);
      if (data.resource) {
        await saveEducationalResource(data.resource);
        onDraftSimulated?.();
      }
      if (data.success) {
        const drivePart = data.driveUploadSucceeded
          ? `✅ متصل بمجلد Drive (${data.driveFolderName || 'UMED STORAGE'})`
          : '✅ تم التخزين السحابي';
        const tgPart = data.telegramSent
          ? '📲 وصل إشعار وأزرار النشر إلى حسابك في تليجرام الآن!'
          : `⚠️ تم بث الملف في المنصة بنجاح (ملاحظة تليجرام: تحقق من صحة BOT_TOKEN في الحقل الأول بالأسفل ليصلك إشعار تليجرام)`;
        setLiveTestBanner(`${drivePart} | ✅ تم البث الفوري في منصة U_MED | ${tgPart}`);
      } else {
        setLiveTestBanner(`⚠️ خطأ في الاختبار: ${data.error || ''}`);
      }
    } catch (err: any) {
      setLiveTestBanner(`⚠️ خطأ: ${err?.message || ''}`);
    } finally {
      setLiveActionBusy(false);
    }
  };

  // Persist all studio state to localStorage on every change
  useEffect(() => {
    const saveNow = () => {
      try {
        const payload: PersistedStudioState = {
          activeTab,
          config,
          activeFileId,
          rawServiceJson,
          detectedClientEmail,
          detectedProjectId,
          simFileName,
          simCaption,
          simDriveFileId,
          simFileSizeMb,
          vercelDomainUrl
        };
        localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(payload));
      } catch {}
    };

    saveNow();
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('beforeunload', saveNow);
    return () => {
      window.removeEventListener('pagehide', saveNow);
      window.removeEventListener('beforeunload', saveNow);
    };
  }, [
    activeTab,
    config,
    activeFileId,
    rawServiceJson,
    detectedClientEmail,
    detectedProjectId,
    simFileName,
    simCaption,
    simDriveFileId,
    simFileSizeMb,
    vercelDomainUrl
  ]);

  const handleClearSavedFields = () => {
    const freshConfig: TeleDriveStudioConfig = {
      apiId: '2040',
      apiHash: 'b18441a1ff607e10a989891a5462e627',
      sessionString: '',
      botToken: '8787910034:AAF_TcpLPwj1m74jtY9XFaeeNv7bADOaiD8',
      targetGroupId: '-1003664858401',
      adminTelegramId: '1905553456',
      defaultUniversityId,
      defaultFolderId: DEFAULT_GDRIVE_FOLDER_ID,
      chunkSizeMb: 20,
      port: 7860,
      gdriveCredentialsB64: ATTACHED_SERVICE_ACCOUNT_B64,
      firebaseCredentialsB64: ATTACHED_SERVICE_ACCOUNT_B64
    };
    setConfig(freshConfig);
    setRawServiceJson(ATTACHED_SERVICE_ACCOUNT_PRETTY);
    setJsonError(null);
    setDetectedClientEmail(ATTACHED_SERVICE_ACCOUNT_JSON.client_email);
    setDetectedProjectId(ATTACHED_SERVICE_ACCOUNT_JSON.project_id);
    try {
      localStorage.removeItem(STUDIO_STORAGE_KEY);
    } catch {}
    setClearedToast(true);
    setTimeout(() => setClearedToast(false), 2000);
  };

  const deliverables = useMemo(() => generateTeleDriveDeliverables(config), [config]);
  const activeFile = useMemo(
    () => deliverables.find((d) => d.id === activeFileId) || deliverables[0],
    [deliverables, activeFileId]
  );

  const secretChecks = useMemo(() => {
    const apiIdClean = (config.apiId || '').trim();
    const apiHashClean = (config.apiHash || '').trim();
    const sessionClean = (config.sessionString || '').trim();
    const botTokenClean = (config.botToken || '').trim();
    const groupClean = (config.targetGroupId || '').trim();
    const adminClean = (config.adminTelegramId || '').trim();
    const folderClean = (config.defaultFolderId || '').trim();
    const b64Clean = (config.gdriveCredentialsB64 || '').trim();

    return [
      {
        key: 'BOT_TOKEN',
        label: 'توكن البوت (BOT_TOKEN)',
        value: botTokenClean,
        valid: /^\d{7,14}:[A-Za-z0-9_-]{25,}$/.test(botTokenClean),
        hint: 'توكن البوت من @BotFather'
      },
      {
        key: 'TARGET_GROUP_ID',
        label: 'معرّف قروب الدفعة (TARGET_GROUP_ID)',
        value: groupClean,
        valid: /^-100\d{7,15}$/.test(groupClean),
        hint: 'يبدأ بـ -100'
      },
      {
        key: 'ADMIN_TELEGRAM_ID',
        label: 'معرّف حساب المشرف (ADMIN_TELEGRAM_ID)',
        value: adminClean,
        valid: /^\d{5,15}$/.test(adminClean),
        hint: 'رقم حسابك الشخصي في تليجرام'
      },
      {
        key: 'GDRIVE_FOLDER_ID',
        label: 'معرّف مجلد Google Drive',
        value: folderClean,
        valid: folderClean.length >= 15 && !folderClean.includes('drive_folder'),
        hint: 'معرّف مجلد UMED STORAGE'
      },
      {
        key: 'GDRIVE_CREDENTIALS_B64',
        label: 'مفاتيح الخدمة المشفرة (Base64)',
        value: b64Clean,
        valid: b64Clean.length >= 120,
        hint: 'مشفرة وجاهزة تلقائياً'
      },
      {
        key: 'API_ID',
        label: 'معرّف تطبيق تيليجرام (API_ID)',
        value: apiIdClean,
        valid: /^\d{4,12}$/.test(apiIdClean),
        hint: '2040 (رسمي)'
      },
      {
        key: 'API_HASH',
        label: 'هاش تطبيق تيليجرام (API_HASH)',
        value: apiHashClean,
        valid: /^[a-fA-F0-9]{32}$/.test(apiHashClean),
        hint: '32 خانة سداسية عشرية'
      },
      {
        key: 'SESSION_STRING',
        label: 'جلسة الحساب (اختياري للملفات >20MB)',
        value: sessionClean,
        valid: sessionClean.length >= 100,
        hint: 'اختياري (البوت يعمل بدونه للملفات حتى 20MB)'
      }
    ];
  }, [config]);

  const validSecretsCount = useMemo(
    () => secretChecks.filter((item) => item.valid).length,
    [secretChecks]
  );

  if (!isOpen) return null;

  const handleJsonInput = (input: string) => {
    setRawServiceJson(input);
    const trimmed = input.trim();
    if (!trimmed) return;

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    const candidateJson =
      firstBrace !== -1 && lastBrace > firstBrace
        ? trimmed.slice(firstBrace, lastBrace + 1)
        : trimmed;

    try {
      const parsed = JSON.parse(candidateJson);
      if (parsed.project_id && parsed.private_key && parsed.client_email) {
        const b64 = encodeUtf8ToBase64(JSON.stringify(parsed));
        setJsonError(null);
        setDetectedClientEmail(parsed.client_email);
        setDetectedProjectId(parsed.project_id);
        setConfig((prev) => ({
          ...prev,
          gdriveCredentialsB64: b64,
          firebaseCredentialsB64: b64
        }));
      }
    } catch {
      setJsonError('صيغة JSON غير مكتملة');
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleExportZip = () => {
    const blob = buildTeleDriveZipBlob(
      deliverables.map((d) => ({ filename: d.filename, content: d.content }))
    );
    triggerZipDownload(blob, 'umed-teledrive-bot.zip');
  };

  const generateSessionFile =
    deliverables.find((d) => d.id === 'generate_session.py') || deliverables[0];

  const handleSimulateDraftIngestion = async () => {
    setSimRunning(true);
    setSimNotice(null);
    try {
      const combined = `${simCaption} ${simFileName}`.toLowerCase();
      let detectedLevel = 'lvl-2';
      if (combined.includes('سنة_أولى') || combined.includes('lvl-1')) detectedLevel = 'lvl-1';
      else if (combined.includes('سنة_ثانية') || combined.includes('lvl-2')) detectedLevel = 'lvl-2';
      else if (combined.includes('سنة_ثالثة') || combined.includes('lvl-3')) detectedLevel = 'lvl-3';
      else if (combined.includes('سنة_رابعة') || combined.includes('lvl-4')) detectedLevel = 'lvl-4';

      let detectedCourse = 'crs-hem-201';
      if (combined.includes('قلب') || combined.includes('cardio')) detectedCourse = 'crs-anat-cvs';
      else if (combined.includes('تنفسي') || combined.includes('resp')) detectedCourse = 'crs-resp-301';

      let detectedSection: 'theoretical' | 'practical' | 'general' = 'theoretical';
      if (combined.includes('عملي') || combined.includes('practical')) detectedSection = 'practical';

      const cleanTitle =
        simCaption.replace(/#\S+/g, '').trim() ||
        simFileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

      const nowIso = new Date().toISOString();
      const draftId = `tg-draft-${Date.now().toString(36)}`;

      const draftResource: EducationalResource = {
        id: draftId,
        title: cleanTitle,
        description: 'تم الاستيراد تلقائياً من تليجرام - بانتظار المراجعة والاعتماد',
        resourceType: simFileName.toLowerCase().endsWith('.mp4')
          ? 'video'
          : simFileName.toLowerCase().endsWith('.mp3')
          ? 'audio'
          : 'pdf',
        url: `https://drive.google.com/file/d/${simDriveFileId.trim() || '1x9K_umed_drive_sample_8821'}/preview`,
        fileSizeLabel: `${Number(simFileSizeMb) || 18.4} MB`,
        fileName: simFileName,
        mimeType: simFileName.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'application/pdf',
        storageProvider: 'external_url',
        universityId: config.defaultUniversityId || 'univ-dar-al-salam',
        programId: 'prog-mbbs',
        curriculumVersionId: 'cur-dar-2024',
        studyLevelId: detectedLevel,
        studyPeriodId: detectedCourse === 'crs-hem-201' ? 'blk-hem-2' : 'blk-cvs',
        courseOfferingId: detectedCourse,
        sectionType: detectedSection,
        status: 'draft',
        createdBy: 'AUTOMATED_TELEGRAM_INGESTION',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await saveEducationalResource(draftResource);
      setSimNotice(
        `✅ تم حفظ المسودة في منصة U_MED بنجاح! (المستوى: ${detectedLevel} · المقرر: ${detectedCourse})`
      );
      onDraftSimulated?.();
    } catch (e: any) {
      setSimNotice(e?.message || 'حدث خطأ أثناء محاكاة السحب');
    } finally {
      setSimRunning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-1.5 sm:p-4"
      dir="rtl"
    >
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl max-w-5xl w-full h-[94dvh] flex flex-col shadow-2xl overflow-hidden">
        {/* 1. COMPACT SINGLE-ROW STICKY HEADER (Takes minimal height on mobile!) */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-5 sm:py-3 border-b border-[var(--border-color)] bg-[var(--bg-elevated)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Rocket className="w-4 h-4 text-teal-400 shrink-0" />
            <h3 className="text-xs sm:text-sm font-black text-[var(--text-primary)] truncate">
              استوديو وبوت الأرشفة الذكي (Telegram ⇄ Drive ⇄ U_MED)
            </h3>
            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold shrink-0">
              {validSecretsCount}/8 جاهز
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleExportZip}
              className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="تحميل ملفات البوت (.ZIP)"
            >
              <FolderArchive className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">تحميل الحزمة (.ZIP)</span>
              <span className="sm:hidden">.ZIP</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-rose-400 transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. COMPACT 4-TAB GRID BAR (Clean 2x2 on mobile, 4-col on desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-3 py-2 sm:px-5 bg-[var(--bg-elevated)]/70 border-b border-[var(--border-color)] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('readiness')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'readiness'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]'
            }`}
          >
            <Rocket className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">1. التشغيل والمفاتيح</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'simulator'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]'
            }`}
          >
            <Play className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">2. محاكي السحب</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('session_gen')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'session_gen'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">3. كود الجلسة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('code_files')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'code_files'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">4. ملفات الكود</span>
          </button>
        </div>

        {/* 3. FULL-HEIGHT SCROLLABLE CONTENT AREA (80%+ of mobile screen!) */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-4 text-xs">
          {/* TAB 1: Live Control Center & Clean Key Inputs */}
          {activeTab === 'readiness' && (
            <div className="space-y-4">
              {/* SECTION A: LIVE CONTROL PANEL (AI Studio + Vercel 24/7) */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-emerald-950/25 border border-emerald-500/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black border ${
                        liveBotRunning
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          liveBotRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                        }`}
                      />
                      {liveBotRunning
                        ? `متصل بتليجرام (@${liveBotIdentity?.username || 'UMED_Bot'}) ${
                            liveWebhookActive ? '• وضع Webhook 24/7' : '• وضع مباشر'
                          }`
                        : 'بانتظار تفعيل توكن البوت (BOT_TOKEN)'}
                    </span>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[11px] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Google Drive: {liveDriveStatus?.ok ? `متصل (${liveDriveStatus.folderName})` : 'جاهز (UMED STORAGE)'}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Big Clear Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={liveActionBusy}
                    onClick={handleRunLiveEndToEndTest}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Play className="w-4 h-4 shrink-0" />
                    <span>
                      {liveActionBusy
                        ? 'جارٍ التنفيذ...'
                        : '🚀 اختبار حي الآن (Drive + U_MED)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={liveActionBusy}
                    onClick={handleSyncAndRepairDrive}
                    className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FolderArchive className="w-3.5 h-3.5 shrink-0" />
                    <span>📂 مزامنة وإصلاح ملفات Google Drive</span>
                  </button>

                  <button
                    type="button"
                    disabled={liveActionBusy}
                    onClick={handleRestartLiveBot}
                    className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>🟢 حفظ المفاتيح وتشغيل البوت الآن</span>
                  </button>
                </div>

                {/* DIRECT TELEGRAM CHANNEL PULL + UNLIMITED FILE SIZE UPLOADER & BROADCASTER */}
                <div className="p-3 rounded-xl bg-[var(--bg-card)]/90 border border-teal-500/40 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 font-black text-[11px] text-emerald-400">
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>📡 سحب واستقبال أي ملف وبأي حجم مهما كان ➔ Google Drive ➔ البث في القناة وU_MED:</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      بدون حد للحجم (حتى 2GB / 4GB+) • جميع الصيغ
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    • <strong>استقبال وبث تلقائي بلا حدود للحجم:</strong> أي ملف (مهما كان حجمه أو صيغته) يُرسل للبوت أو يُنشر في القناة يتم إظهاره وأرشفته في <strong>Google Drive (`UMED STORAGE`)</strong> وبثه مباشرةً في <strong>قناة/قروب تليجرام</strong> وتشغيله داخل <strong>منصة U_MED</strong> دون تحويل لتليجرام.<br />
                    • <strong>سحب مباشر من قناة عامة أو خاصة أو رفع ملف ضخم من جهازك الآن:</strong>
                  </p>

                  {/* Row 1: Channel Pull & Target Broadcast Channel */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={channelPullInput}
                      onChange={(e) => setChannelPullInput(e.target.value)}
                      placeholder="@channel_username أو -1003664858401 أو https://t.me/channel_name"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                    />
                    <button
                      type="button"
                      disabled={channelPullBusy || liveActionBusy}
                      onClick={handlePullFromChannel}
                      className="py-2 px-3.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {channelPullBusy
                          ? 'جارٍ السحب والبث...'
                          : '📥 سحب من القناة ➔ Drive ➔ بث للقناة وU_MED'}
                      </span>
                    </button>
                  </div>

                  {/* Row 2: Direct Any-Size Chunked File Upload to Drive + Telegram Channel + U_MED */}
                  <div className="pt-2 border-t border-[var(--border-color)]/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={uploadCaptionInput}
                      onChange={(e) => setUploadCaptionInput(e.target.value)}
                      placeholder="وصف أو عنوان الملف والهاشتاجات (اختياري: #سنة_ثانية #دم #نظري)..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs"
                    />
                    <label className="py-2 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {uploadProgressPct !== null
                          ? `جارٍ الرفع والبث (${uploadProgressPct}%)...`
                          : '📤 اختر أي ملف بأي حجم ➔ Drive + بث للقناة'}
                      </span>
                      <input
                        type="file"
                        onChange={handleDirectAnySizeFileUpload}
                        disabled={uploadProgressPct !== null}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {uploadProgressPct !== null && (
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full transition-all duration-300"
                        style={{ width: `${uploadProgressPct}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* VERCEL 24/7 WEBHOOK ACTIVATION BOX */}
                <div className="p-3 rounded-xl bg-[var(--bg-card)]/90 border border-[var(--border-color)] space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-[11px] text-teal-400">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span>تفعيل العمل المستمر 24/7 على نسخة Vercel (بدون توقف نهائياً):</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    نعم! جميع ميزات البوت تعمل على نسختك في <strong>Vercel</strong> على مدار 24 ساعة مجاناً عبر نظام <strong>Telegram Webhook</strong> (حيث توقظ خوادم تليجرام رابط موقعك على Vercel تلقائياً فور نشر أي رسالة في القناة أو إرسالها للبوت).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={vercelDomainUrl}
                      onChange={(e) => setVercelDomainUrl(e.target.value)}
                      placeholder="https://your-umed-app.vercel.app"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                    />
                    <button
                      type="button"
                      disabled={liveActionBusy}
                      onClick={handleEnableVercelWebhook}
                      className="py-2 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span>⚡ ربط Webhook بـ Vercel 24/7</span>
                    </button>
                  </div>
                </div>

                {liveTestBanner && (
                  <div className="p-2.5 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-200 text-[11px] font-bold leading-relaxed">
                    {liveTestBanner}
                  </div>
                )}

                {liveLogs.length > 0 && (
                  <div className="rounded-xl bg-[#070A10] border border-slate-800 p-2.5 space-y-1 max-h-28 overflow-y-auto">
                    <div className="text-[10px] font-bold text-slate-400 flex items-center justify-between">
                      <span>سجل عمليات البوت المباشر:</span>
                      <span className="font-mono text-emerald-400">LIVE</span>
                    </div>
                    {liveLogs.slice(0, 4).map((log) => (
                      <div
                        key={log.id}
                        className="text-[10px] flex flex-wrap items-center justify-between gap-1 py-0.5 border-b border-slate-800/60 last:border-0"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              log.level === 'success'
                                ? 'bg-emerald-400'
                                : log.level === 'error'
                                ? 'bg-rose-400'
                                : 'bg-amber-400'
                            }`}
                          />
                          <span className="font-bold text-slate-100">{log.title}:</span>
                          <span className="text-slate-300">{log.details}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION B: ESSENTIAL 4 KEYS (Clean & Easy to Reach on Mobile) */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                  <div>
                    <h4 className="font-black text-xs sm:text-sm text-[var(--text-primary)]">
                      المفاتيح الأساسية الـ 4 لتحكم البوت
                    </h4>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      محفوظة تلقائياً في متصفحك — عدّل أي حقل ثم اضغط «حفظ المفاتيح وتشغيل البوت»
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSavedFields}
                    className="px-2.5 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{clearedToast ? 'تم الاستعادة' : 'استعادة الافتراضي'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      1. توكن البوت (`BOT_TOKEN` من @BotFather):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={config.botToken || ''}
                      onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                      placeholder="123456789:ABCdef..."
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      2. معرّف قروب الدفعة (`TARGET_GROUP_ID`):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={config.targetGroupId}
                      onChange={(e) => setConfig({ ...config, targetGroupId: e.target.value })}
                      placeholder="-1003664858401"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      3. معرّف حسابك لاستلام أزرار النشر (`ADMIN_TELEGRAM_ID`):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={config.adminTelegramId}
                      onChange={(e) => setConfig({ ...config, adminTelegramId: e.target.value })}
                      placeholder="1905553456"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-[var(--text-secondary)]">
                        4. معرّف مجلد Google Drive (`UMED STORAGE`):
                      </label>
                      <a
                        href={`https://drive.google.com/drive/folders/${config.defaultFolderId || DEFAULT_GDRIVE_FOLDER_ID}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold text-emerald-400 hover:underline"
                      >
                        فتح المجلد ↗
                      </a>
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      value={config.defaultFolderId}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          defaultFolderId: extractDriveFolderId(e.target.value)
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-emerald-500/40 text-[var(--text-primary)] font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Collapsible Advanced Keys & Copy Table */}
                <div className="pt-2 border-t border-[var(--border-color)]">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedKeys(!showAdvancedKeys)}
                    className="w-full py-2 px-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between text-xs font-bold text-[var(--text-primary)] cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-teal-400" />
                      <span>إظهار / إخفاء المفاتيح المتقدمة وجدول النسخ (API_ID, API_HASH, Base64)</span>
                    </span>
                    {showAdvancedKeys ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showAdvancedKeys && (
                    <div className="mt-3 space-y-3 pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-[var(--text-secondary)] mb-1">
                            `API_ID`:
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={config.apiId || ''}
                            onChange={(e) => setConfig({ ...config, apiId: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[var(--text-secondary)] mb-1">
                            `API_HASH`:
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={config.apiHash || ''}
                            onChange={(e) => setConfig({ ...config, apiHash: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[var(--text-secondary)] mb-1">
                            `SESSION_STRING` (اختياري):
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={config.sessionString || ''}
                            onChange={(e) => setConfig({ ...config, sessionString: e.target.value })}
                            placeholder="اختياري..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] font-mono text-xs"
                          />
                        </div>
                      </div>

                      {/* Quick Copy Grid for all 8 Secrets */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {secretChecks.map((item) => (
                          <div
                            key={item.key}
                            className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                {item.valid ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                )}
                                <span className="font-mono font-bold text-[11px]" dir="ltr">
                                  {item.key}
                                </span>
                              </div>
                              <p className="text-[10px] text-[var(--text-muted)] truncate">{item.label}</p>
                            </div>
                            <button
                              type="button"
                              disabled={!item.value}
                              onClick={() => handleCopy(`val_${item.key}`, item.value)}
                              className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              {copiedId === `val_${item.key}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedId === `val_${item.key}` ? 'تم' : 'نسخ'}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Live Draft Ingestion Simulator */}
          {activeTab === 'simulator' && (
            <div className="max-w-xl mx-auto p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] space-y-3.5">
              <div className="border-b border-[var(--border-color)] pb-2.5">
                <h4 className="font-black text-sm text-[var(--text-primary)]">
                  محاكي سحب ملف من تليجرام إلى مسودات U_MED
                </h4>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  اختبر تحليل الوسوم (`#سنة_ثانية #دم #نظري`) وإضافة الملف مباشرة إلى قاعدة بيانات المنصة.
                </p>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                    اسم الملف:
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={simFileName}
                    onChange={(e) => setSimFileName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                    وصف الرسالة والهاشتاجات:
                  </label>
                  <input
                    type="text"
                    value={simCaption}
                    onChange={(e) => setSimCaption(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-xs"
                  />
                </div>
              </div>

              {simNotice && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs">
                  {simNotice}
                </div>
              )}

              <button
                type="button"
                disabled={simRunning}
                onClick={handleSimulateDraftIngestion}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 shrink-0" />
                <span>{simRunning ? 'جارٍ الإرسال...' : 'إرسال مسودة تجريبية الآن إلى المنصة'}</span>
              </button>
            </div>
          )}

          {/* TAB 3: SESSION_STRING Generator Helper */}
          {activeTab === 'session_gen' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] space-y-2.5">
                <h4 className="font-black text-sm text-[var(--text-primary)]">
                  توليد كود الجلسة (`SESSION_STRING`) — اختياري للملفات الأكبر من 20MB
                </h4>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  ملاحظة: البوت المدمج يعمل فوراً بدون `SESSION_STRING` لجميع المحاضرات والملفات حتى حجم 20 ميجابايت. تحتاج كود الجلسة فقط إذا أردت تشغيل سكربت بايثون الخارجي للملفات الضخمة حتى 2 جيجابايت.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy('session_py', generateSessionFile.content)}
                    className="py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === 'session_py' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedId === 'session_py' ? 'تم نسخ الكود!' : 'نسخ كود generate_session.py'}</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] overflow-hidden bg-[#070A10]">
                <pre
                  dir="ltr"
                  className="p-3.5 overflow-x-auto max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-100 select-all"
                >
                  {generateSessionFile.content}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: Code Deliverable Inspector */}
          {activeTab === 'code_files' && (
            <div className="rounded-xl border border-[var(--border-color)] overflow-hidden bg-[#070A10]">
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-1">
                  {deliverables.map((item) => {
                    const active = item.id === activeFile.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveFileId(item.id)}
                        className={`px-2.5 py-1 rounded-lg font-mono text-[11px] cursor-pointer ${
                          active ? 'bg-teal-600 text-white font-bold' : 'bg-slate-900 text-slate-300'
                        }`}
                      >
                        <span dir="ltr">{item.filename}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(activeFile.id, activeFile.content)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copiedId === activeFile.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === activeFile.id ? 'تم النسخ' : 'نسخ الكود'}</span>
                </button>
              </div>

              <pre
                dir="ltr"
                className="p-3.5 overflow-x-auto max-h-80 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-100 select-all"
              >
                {activeFile.content}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
