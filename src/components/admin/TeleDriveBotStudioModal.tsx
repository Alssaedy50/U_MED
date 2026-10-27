/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * U_MED TeleDrive MTProto Ingestion Studio & Hugging Face Spaces Deployment Wizard
 * Interactive workbench inside the U_MED Admin Console to:
 * 1. Validate all 8 required deployment secrets in real-time (Client-Side Zero-Trust).
 * 2. Generate Pyrogram `SESSION_STRING` via a pre-filled script or 1-line Google Colab command.
 * 3. Encode `service_account.json` to Base64 (`GDRIVE_CREDENTIALS_B64` & `FIREBASE_CREDENTIALS_B64`).
 * 4. Simulate live Telegram draft ingestion into Firestore (`status: 'draft'`).
 * 5. Export the complete Hugging Face Spaces Docker bundle (`umed-teledrive-ingestion-bot.zip`).
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
  RotateCcw
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

  const [config, setConfig] = useState<TeleDriveStudioConfig>(() => ({
    apiId: initialSaved.config?.apiId ?? '',
    apiHash: initialSaved.config?.apiHash ?? '',
    sessionString: initialSaved.config?.sessionString ?? '',
    botToken: initialSaved.config?.botToken ?? '',
    targetGroupId: initialSaved.config?.targetGroupId ?? '-1001987654321',
    adminTelegramId: initialSaved.config?.adminTelegramId ?? '',
    defaultUniversityId: initialSaved.config?.defaultUniversityId || defaultUniversityId,
    defaultFolderId: initialSaved.config?.defaultFolderId ?? '',
    chunkSizeMb: initialSaved.config?.chunkSizeMb === 10 ? 10 : 20,
    port: initialSaved.config?.port || 7860,
    gdriveCredentialsB64: initialSaved.config?.gdriveCredentialsB64 ?? '',
    firebaseCredentialsB64: initialSaved.config?.firebaseCredentialsB64 ?? ''
  }));

  const [activeFileId, setActiveFileId] = useState<string>(
    () => initialSaved.activeFileId || 'main.py'
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rawServiceJson, setRawServiceJson] = useState<string>(
    () => initialSaved.rawServiceJson ?? ''
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [detectedClientEmail, setDetectedClientEmail] = useState<string>(
    () => initialSaved.detectedClientEmail ?? ''
  );
  const [detectedProjectId, setDetectedProjectId] = useState<string>(
    () => initialSaved.detectedProjectId ?? ''
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

  // Persist all studio state to localStorage on every change and when switching apps/tabs
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
          simFileSizeMb
        };
        localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(payload));
      } catch {}
    };

    saveNow();

    const handleVisibilityOrHide = () => {
      saveNow();
    };

    window.addEventListener('pagehide', handleVisibilityOrHide);
    window.addEventListener('beforeunload', handleVisibilityOrHide);
    document.addEventListener('visibilitychange', handleVisibilityOrHide);

    return () => {
      window.removeEventListener('pagehide', handleVisibilityOrHide);
      window.removeEventListener('beforeunload', handleVisibilityOrHide);
      document.removeEventListener('visibilitychange', handleVisibilityOrHide);
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
    simFileSizeMb
  ]);

  const handleClearSavedFields = () => {
    const freshConfig: TeleDriveStudioConfig = {
      apiId: '',
      apiHash: '',
      sessionString: '',
      botToken: '',
      targetGroupId: '-1001987654321',
      adminTelegramId: '',
      defaultUniversityId,
      defaultFolderId: '',
      chunkSizeMb: 20,
      port: 7860,
      gdriveCredentialsB64: '',
      firebaseCredentialsB64: ''
    };
    setConfig(freshConfig);
    setRawServiceJson('');
    setJsonError(null);
    setDetectedClientEmail('');
    setDetectedProjectId('');
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

  // Real-time validation for the 8 Hugging Face Spaces Secrets
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
        key: 'API_ID',
        label: 'معرّف تطبيق تيليجرام (API_ID)',
        value: apiIdClean,
        valid: /^\d{5,12}$/.test(apiIdClean),
        hint: 'رقم صحيح من 5 إلى 12 خانة من موقع my.telegram.org'
      },
      {
        key: 'API_HASH',
        label: 'هاش تطبيق تيليجرام (API_HASH)',
        value: apiHashClean,
        valid: /^[a-fA-F0-9]{32}$/.test(apiHashClean),
        hint: 'نص سداسي عشري مكون من 32 خانة من موقع my.telegram.org'
      },
      {
        key: 'SESSION_STRING',
        label: 'جلسة حساب العضو (SESSION_STRING)',
        value: sessionClean,
        valid: sessionClean.length >= 100,
        hint: 'كود جلسة Pyrogram الطويل (استخرجه من تبويب أداة توليد الجلسة)'
      },
      {
        key: 'BOT_TOKEN',
        label: 'توكن بوت الإشعارات (BOT_TOKEN)',
        value: botTokenClean,
        valid: /^\d{7,14}:[A-Za-z0-9_-]{25,}$/.test(botTokenClean),
        hint: 'توكن من @BotFather بصيغة 123456789:ABCdef...'
      },
      {
        key: 'TARGET_GROUP_ID',
        label: 'معرّف قروب الدفعة (TARGET_GROUP_ID)',
        value: groupClean,
        valid: /^-100\d{7,15}$/.test(groupClean),
        hint: 'يجب أن يبدأ بـ -100 متبوعاً بأرقام معرّف القروب'
      },
      {
        key: 'ADMIN_TELEGRAM_ID',
        label: 'معرّف حساب المشرف (ADMIN_TELEGRAM_ID)',
        value: adminClean,
        valid: /^\d{5,15}$/.test(adminClean),
        hint: 'رقم حسابك الشخصي في تيليجرام لاستلام تنبيهات المسودات'
      },
      {
        key: 'GDRIVE_FOLDER_ID',
        label: 'معرّف مجلد Google Drive (GDRIVE_FOLDER_ID)',
        value: folderClean,
        valid: folderClean.length >= 15 && !folderClean.includes('drive_folder'),
        hint: 'انسخ المعرّف من رابط المجلد المشترك مع بريد حساب الخدمة'
      },
      {
        key: 'GDRIVE_CREDENTIALS_B64',
        label: 'مفاتيح الخدمة المشفرة (GDRIVE & FIREBASE B64)',
        value: b64Clean,
        valid: b64Clean.length >= 120,
        hint: 'ارفع أو الصق ملف service_account.json بالأسفل لتوليده تلقائياً'
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
    if (!input.trim()) {
      setJsonError(null);
      setDetectedClientEmail('');
      setDetectedProjectId('');
      setConfig((prev) => ({
        ...prev,
        gdriveCredentialsB64: '',
        firebaseCredentialsB64: ''
      }));
      return;
    }
    try {
      const parsed = JSON.parse(input);
      if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
        setJsonError('ملف JSON يفتقد الحقول الأساسية: project_id أو private_key أو client_email');
        return;
      }
      const b64 = encodeUtf8ToBase64(JSON.stringify(parsed));
      setJsonError(null);
      setDetectedClientEmail(parsed.client_email);
      setDetectedProjectId(parsed.project_id);
      setConfig((prev) => ({
        ...prev,
        gdriveCredentialsB64: b64,
        firebaseCredentialsB64: b64
      }));
    } catch {
      setJsonError('صيغة JSON غير صالحة. الصق محتوى ملف service_account.json كاملاً.');
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
    triggerZipDownload(blob, 'umed-teledrive-huggingface-docker.zip');
  };

  const colabOneLiner = `!pip install -q pyrogram==2.0.106 tgcrypto==1.2.5 && python3 -c "import asyncio; from pyrogram import Client; asyncio.run((lambda: (async def run():\n  async with Client('umed_gen', api_id=${Number(config.apiId) || 12345678}, api_hash='${config.apiHash || 'YOUR_API_HASH'}', in_memory=True) as app:\n    s = await app.export_session_string()\n    me = await app.get_me()\n    await app.send_message('me', f'SESSION_STRING:\\n\`{s}\`\\nADMIN_TELEGRAM_ID: \`{me.id}\`')\n    print('\\nSESSION_STRING=\\n' + s + f'\\nADMIN_TELEGRAM_ID={me.id}')\n)())())"`;

  const generateSessionFile =
    deliverables.find((d) => d.id === 'generate_session.py') || deliverables[0];

  const handleSimulateDraftIngestion = async () => {
    setSimRunning(true);
    setSimNotice(null);
    try {
      const combined = `${simCaption} ${simFileName}`.toLowerCase();
      let detectedLevel = 'pending_review';
      if (combined.includes('سنة_أولى') || combined.includes('lvl-1')) detectedLevel = 'lvl-1';
      else if (combined.includes('سنة_ثانية') || combined.includes('lvl-2')) detectedLevel = 'lvl-2';
      else if (combined.includes('سنة_ثالثة') || combined.includes('lvl-3')) detectedLevel = 'lvl-3';
      else if (combined.includes('سنة_رابعة') || combined.includes('lvl-4')) detectedLevel = 'lvl-4';
      else if (combined.includes('سنة_خامسة') || combined.includes('lvl-5')) detectedLevel = 'lvl-5';
      else if (combined.includes('سنة_سادسة') || combined.includes('lvl-6')) detectedLevel = 'lvl-6';

      let detectedCourse = 'pending_review';
      if (combined.includes('دم') || combined.includes('hema')) detectedCourse = 'crs-hem-201';
      else if (combined.includes('قلب') || combined.includes('cardio')) detectedCourse = 'crs-cvs-202';
      else if (combined.includes('تنفسي') || combined.includes('resp')) detectedCourse = 'crs-resp-301';
      else if (combined.includes('هضمي') || combined.includes('git')) detectedCourse = 'crs-git-302';

      let detectedSection: 'theoretical' | 'practical' | 'general' = 'general';
      if (combined.includes('عملي') || combined.includes('practical')) detectedSection = 'practical';
      else if (combined.includes('نظري') || combined.includes('lecture')) detectedSection = 'theoretical';

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
        programId: 'medicine',
        curriculumVersionId: 'v2026',
        studyLevelId: detectedLevel,
        studyPeriodId: detectedCourse === 'crs-hem-201' ? 'blk-hem-2' : undefined,
        courseOfferingId: detectedCourse,
        sectionType: detectedSection,
        status: 'draft',
        createdBy: 'AUTOMATED_TELEGRAM_INGESTION',
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await saveEducationalResource(draftResource);
      setSimNotice(
        `تم سحب الملف وحفظه كمسودة (status: "draft") في Firestore بنجاح! (المستوى المستنتج: ${detectedLevel} · المادة: ${detectedCourse})`
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
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl max-w-6xl w-full max-h-[92dvh] flex flex-col shadow-2xl my-auto overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4 border-b border-[var(--border-color)] bg-[var(--bg-elevated)] shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-[var(--text-primary)]">
                مركز الإطلاق النهائي لبوت U_MED على Hugging Face Spaces (Docker)
              </h3>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>محفوظ تلقائياً (لن تختفي المفاتيح عند الخروج أو تحديث الصفحة)</span>
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              فاحص المفاتيح الـ 8 + مولّد جلسة `SESSION_STRING` + مشفر `Base64` + حزمة النشر الجاهزة مجاناً 24/7 على المنفذ `7860`
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] font-mono text-xs font-bold text-[var(--text-primary)]">
              جاهزية المفاتيح: {validSecretsCount} / 8
            </span>

            <button
              type="button"
              onClick={handleClearSavedFields}
              className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-rose-400 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="مسح كافة الحقول المحفوظة والبدء من جديد"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>{clearedToast ? 'تم المسح' : 'مسح الحقول'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportZip}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <FolderArchive className="w-4 h-4 shrink-0" />
              <span>تحميل حزمة Hugging Face (.ZIP)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 sm:px-6 bg-[var(--bg-elevated)] border-b border-[var(--border-color)] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('readiness')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'readiness'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'
            }`}
          >
            <Rocket className="w-3.5 h-3.5 shrink-0" />
            <span>1. فاحص المفاتيح الـ 8 ومعالج Hugging Face</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('session_gen')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'session_gen'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span>2. أداة توليد كود الجلسة (SESSION_STRING)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'simulator'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'
            }`}
          >
            <Play className="w-3.5 h-3.5 shrink-0" />
            <span>3. محاكي سحب المسودات إلى Firestore</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('code_files')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'code_files'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5 shrink-0" />
            <span>4. ملفات المشروع الكاملة (9 ملفات)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs">
          {/* TAB 1: Interactive 8-Secret Validator & Hugging Face Spaces Wizard */}
          {activeTab === 'readiness' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left Column: 8 Required Inputs */}
                <div className="lg:col-span-7 p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2.5">
                    <div>
                      <h4 className="font-black text-sm text-[var(--text-primary)]">
                        المفاتيح الثمانية المطلوبة لتشغيل البوت فعلياً
                      </h4>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        أدخل مفاتيحك هنا لفحص صيغتها وتجهيز جدول النسخ المباشر إلى خزنة أسرار Hugging Face Spaces
                      </p>
                    </div>
                  </div>

                  {/* Row 1: API_ID & API_HASH */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                        1. `API_ID` (من my.telegram.org):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="مثال: 24819204"
                        value={config.apiId || ''}
                        onChange={(e) => setConfig({ ...config, apiId: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                        2. `API_HASH` (من my.telegram.org):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="32 حرفاً ورقماً (Hex)"
                        value={config.apiHash || ''}
                        onChange={(e) => setConfig({ ...config, apiHash: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Row 2: SESSION_STRING & BOT_TOKEN */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-[var(--text-secondary)]">
                          3. `SESSION_STRING` (جلسة العضو):
                        </label>
                        <button
                          type="button"
                          onClick={() => setActiveTab('session_gen')}
                          className="text-[10px] font-bold text-teal-500 hover:underline cursor-pointer"
                        >
                          كيف أستخرجه؟
                        </button>
                      </div>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="BQAA... كود الجلسة الطويل"
                        value={config.sessionString || ''}
                        onChange={(e) => setConfig({ ...config, sessionString: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                        4. `BOT_TOKEN` (من @BotFather):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="123456789:ABCdefGHI..."
                        value={config.botToken || ''}
                        onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Row 3: TARGET_GROUP_ID & ADMIN_TELEGRAM_ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                        5. `TARGET_GROUP_ID` (معرّف قروب الدفعة):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="-1001987654321"
                        value={config.targetGroupId}
                        onChange={(e) => setConfig({ ...config, targetGroupId: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                        6. `ADMIN_TELEGRAM_ID` (معرّف حسابك):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="مثال: 591827364"
                        value={config.adminTelegramId}
                        onChange={(e) => setConfig({ ...config, adminTelegramId: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Row 4: GDRIVE_FOLDER_ID & DEFAULT_UNIVERSITY_ID */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                        7. `GDRIVE_FOLDER_ID` (معرّف مجلد Drive):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="1A2B3C4D5E6F7G8H9I0J..."
                        value={config.defaultFolderId}
                        onChange={(e) => setConfig({ ...config, defaultFolderId: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                        معرّف الجامعة (`DEFAULT_UNIVERSITY_ID`):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={config.defaultUniversityId}
                        onChange={(e) => setConfig({ ...config, defaultUniversityId: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Row 5: Service Account JSON -> Base64 */}
                  <div className="pt-2 border-t border-[var(--border-color)] space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[11px] font-bold text-[var(--text-secondary)]">
                        8. ملف مفاتيح الخدمة `service_account.json` (يولّد `GDRIVE_CREDENTIALS_B64` و `FIREBASE_CREDENTIALS_B64`):
                      </label>
                      <label className="px-2.5 py-1 rounded-lg bg-teal-600/20 text-teal-500 border border-teal-500/30 font-bold text-[11px] cursor-pointer flex items-center gap-1">
                        <Upload className="w-3 h-3" />
                        <span>رفع ملف service_account.json</span>
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const reader = new FileReader();
                            reader.onload = (ev) =>
                              handleJsonInput(typeof ev.target?.result === 'string' ? ev.target.result : '');
                            reader.readAsText(f);
                          }}
                        />
                      </label>
                    </div>

                    <textarea
                      rows={3}
                      dir="ltr"
                      value={rawServiceJson}
                      onChange={(e) => handleJsonInput(e.target.value)}
                      placeholder='الصق محتوى ملف service_account.json هنا أو اضغط "رفع ملف" ليتم تشفيره محلياً إلى Base64...'
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-[11px]"
                    />

                    {jsonError && (
                      <div className="text-[11px] text-rose-500 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{jsonError}</span>
                      </div>
                    )}

                    {detectedClientEmail && (
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-bold text-emerald-500">
                            ✓ تم التحقق من المشروع ({detectedProjectId}) وتوليد كود Base64 بنجاح
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            شارك مجلد Google Drive كـ <strong>محرر (Editor)</strong> مع هذا البريد:
                          </div>
                          <div className="font-mono text-[11px] text-[var(--text-primary)] select-all" dir="ltr">
                            {detectedClientEmail}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy('client_email', detectedClientEmail)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === 'client_email' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedId === 'client_email' ? 'تم نسخ البريد' : 'نسخ بريد الخدمة'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Live Validation Checklist & One-Click Hugging Face Copy Table */}
                <div className="lg:col-span-5 p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2.5">
                      <div>
                        <h4 className="font-black text-sm text-[var(--text-primary)]">
                          فحص الجاهزية والنسخ السريع لـ Hugging Face
                        </h4>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          انسخ كل متغير وضعه في `Settings ➔ Variables and secrets`
                        </p>
                      </div>
                      <ShieldCheck className="w-5 h-5 text-teal-500 shrink-0" />
                    </div>

                    <div className="space-y-2">
                      {secretChecks.map((item) => (
                        <div
                          key={item.key}
                          className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {item.valid ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              )}
                              <span className="font-mono font-bold text-[11px] text-[var(--text-primary)]" dir="ltr">
                                {item.key}
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                              {item.valid ? item.label : item.hint}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopy(`key_${item.key}`, item.key)}
                              className="px-2 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                              title="نسخ اسم المتغير"
                            >
                              {copiedId === `key_${item.key}` ? 'تم!' : 'الاسم'}
                            </button>
                            <button
                              type="button"
                              disabled={!item.value}
                              onClick={() => handleCopy(`val_${item.key}`, item.value)}
                              className={`px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                                item.value
                                  ? 'bg-teal-600 hover:bg-teal-500 text-white'
                                  : 'bg-slate-700/30 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              {copiedId === `val_${item.key}` ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  <span>تم النسخ</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>نسخ القيمة</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step-by-Step Hugging Face Launch Summary */}
                  <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-2">
                    <div className="font-bold text-xs text-[var(--text-primary)]">
                      خطوات الإطلاق في 3 دقائق على Hugging Face Spaces:
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      <li>
                        أنشئ Space جديداً على <strong>huggingface.co/new-space</strong> واختر <strong>Docker (Blank)</strong>.
                      </li>
                      <li>
                        افتح <strong>Settings ➔ Variables and secrets</strong> وأضف الأسرار الثمانية أعلاه عبر زر <strong>New secret</strong>.
                      </li>
                      <li>
                        اضغط <strong>تحميل حزمة Hugging Face (.ZIP)</strong> بالأعلى، وفك الضغط وارفع الملفات في تبويب <strong>Files ➔ Upload files</strong>.
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SESSION_STRING Generator Helper */}
          {activeTab === 'session_gen' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] space-y-3.5">
                <div className="border-b border-[var(--border-color)] pb-2.5">
                  <h4 className="font-black text-sm text-[var(--text-primary)]">
                    توليد كود الجلسة (`SESSION_STRING`) ومعرّف الحساب
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    يسمح كود الجلسة لحسابك بقراءة ملفات قروب الدفعة تلقائياً دون الحاجة لأن يكون البوت مشرفاً في القروب.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      أدخل `API_ID` لتضمينه تلقائياً في السكربت:
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="مثال: 24819204"
                      value={config.apiId || ''}
                      onChange={(e) => setConfig({ ...config, apiId: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      أدخل `API_HASH` لتضمينه تلقائياً في السكربت:
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="32-char API_HASH"
                      value={config.apiHash || ''}
                      onChange={(e) => setConfig({ ...config, apiHash: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-2">
                  <div className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-teal-500 shrink-0" />
                    <span>الطريقة الأسرع (بدون تثبيت بايثون على جهازك):</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    1. افتح صفحة جديدة في <strong>Google Colab</strong> (عبر الرابط `colab.research.google.com`).
                    <br />
                    2. انسخ الكود المقابل والصقه في الخلية واضغط <strong>Run</strong>.
                    <br />
                    3. أدخل رقم هاتفك وكود التفعيل، وسيصل `SESSION_STRING` و `ADMIN_TELEGRAM_ID` فوراً إلى <strong>الرسائل المحفوظة (Saved Messages)</strong> في تيليجرام!
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopy('session_py', generateSessionFile.content)}
                    className="flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === 'session_py' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedId === 'session_py' ? 'تم نسخ سكربت generate_session.py' : 'نسخ كود generate_session.py'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([generateSessionFile.content], {
                        type: 'text/plain;charset=utf-8'
                      });
                      triggerZipDownload(blob, 'generate_session.py');
                    }}
                    className="py-2 px-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>تحميل الملف</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-7 rounded-xl border border-[var(--border-color)] overflow-hidden bg-[#070A10] flex flex-col">
                <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-teal-400" dir="ltr">
                    python-bot/generate_session.py
                  </span>
                  <span className="text-[11px] text-slate-400">
                    مجهز ببيانات API_ID و API_HASH الخاصة بك
                  </span>
                </div>
                <pre
                  dir="ltr"
                  className="p-4 overflow-x-auto max-h-[380px] overflow-y-auto font-mono text-xs leading-relaxed text-slate-100 select-all"
                >
                  {generateSessionFile.content}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: Live Draft Ingestion Simulator */}
          {activeTab === 'simulator' && (
            <div className="max-w-2xl mx-auto p-5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] space-y-4">
              <div className="border-b border-[var(--border-color)] pb-3">
                <h4 className="font-black text-sm text-[var(--text-primary)]">
                  محاكاة حية لسحب ملف من قروب تيليجرام إلى مسودات U_MED
                </h4>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  يختبر هذا المحاكي نفس منطق `firebase_service.py` في تحليل الوسوم (`#سنة_ثانية #دم #نظري`) وإدراج الملف كمسودة (`status: "draft"`) في قاعدة بيانات Firestore الحية للمنصة.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                    اسم الملف المرسل في قروب الدفعة:
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={simFileName}
                    onChange={(e) => setSimFileName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                    معرّف ملف Google Drive التجريبي (`file_id`):
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={simDriveFileId}
                    onChange={(e) => setSimDriveFileId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                  وصف الرسالة والوسوم في تيليجرام (`Caption & Hashtags`):
                </label>
                <input
                  type="text"
                  value={simCaption}
                  onChange={(e) => setSimCaption(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs"
                />
              </div>

              {simNotice && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{simNotice}</span>
                </div>
              )}

              <button
                type="button"
                disabled={simRunning}
                onClick={handleSimulateDraftIngestion}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 shrink-0" />
                <span>{simRunning ? 'جارٍ إنشاء المسودة في Firestore...' : 'إرسال مسودة تجريبية الآن إلى لوحة تحكم U_MED'}</span>
              </button>
            </div>
          )}

          {/* TAB 4: Code Deliverable Inspector */}
          {activeTab === 'code_files' && (
            <div className="rounded-xl border border-[var(--border-color)] overflow-hidden bg-[#070A10]">
              {/* File Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-1.5">
                  {deliverables.map((item) => {
                    const active = item.id === activeFile.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveFileId(item.id)}
                        className={`px-3 py-1.5 rounded-lg font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                          active
                            ? 'bg-teal-600 text-white font-bold'
                            : 'bg-slate-900 text-slate-300 hover:text-white'
                        }`}
                      >
                        <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                        <span dir="ltr">{item.filename}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(activeFile.id, activeFile.content)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedId === activeFile.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ الكود</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
                      triggerZipDownload(blob, activeFile.filename);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span dir="ltr">تحميل {activeFile.filename}</span>
                  </button>
                </div>
              </div>

              {/* File Description Bar */}
              <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                <span>{activeFile.summaryArabic}</span>
                <span className="font-mono text-slate-400" dir="ltr">
                  python-bot/{activeFile.filename} · {activeFile.content.split('\n').length} lines
                </span>
              </div>

              {/* Source Code Viewer */}
              <pre
                dir="ltr"
                className="p-4 overflow-x-auto max-h-[420px] overflow-y-auto font-mono text-xs leading-relaxed text-slate-100 select-all"
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
