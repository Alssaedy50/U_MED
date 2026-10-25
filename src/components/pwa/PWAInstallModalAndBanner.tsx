/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED In-App PWA Install UI & Offline Synchronization Status Components
 * Provides:
 * 1. Header Install Button & Live Offline/Sync Indicator
 * 2. Sidebar Install Card
 * 3. Settings Page PWA & Offline Synchronization Control Panel
 * 4. Step-by-Step Guided Install Modal for Android, iOS Safari, and Desktop
 */

import React, { useEffect, useState } from 'react';
import {
  Download,
  Smartphone,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  CloudCheck,
  Share,
  PlusSquare,
  X,
  HardDrive
} from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../../hooks/usePWAInstall.ts';
import {
  subscribeToExamOfflineSync,
  flushOfflineExamSubmissions,
  subscribeToQuestionSyncState,
  flushQuestionOutbox
} from '../../services/assessmentService.ts';
import { dispatchAppNotification } from '../../services/notificationService.ts';

function useUnifiedOfflineSyncState() {
  const isOnline = useOnlineStatus();
  const [pendingExams, setPendingExams] = useState<number>(0);
  const [syncingExams, setSyncingExams] = useState<boolean>(false);
  const [pendingQuestions, setPendingQuestions] = useState<number>(0);
  const [syncingQuestions, setSyncingQuestions] = useState<boolean>(false);

  useEffect(() => {
    const unsubExams = subscribeToExamOfflineSync((count, syncing) => {
      setPendingExams(count);
      setSyncingExams(syncing);
    });
    const unsubQuestions = subscribeToQuestionSyncState((state) => {
      setPendingQuestions(state.pendingCount);
      setSyncingQuestions(state.isSyncing);
    });
    return () => {
      unsubExams();
      unsubQuestions();
    };
  }, []);

  const totalPending = pendingExams + pendingQuestions;
  const isSyncing = syncingExams || syncingQuestions;

  const triggerManualSync = async () => {
    if (!navigator.onLine) return;
    const [syncedExams] = await Promise.all([
      flushOfflineExamSubmissions().catch(() => 0),
      flushQuestionOutbox().catch(() => ({ syncedCount: 0, remainingCount: 0 }))
    ]);
    if (syncedExams > 0) {
      dispatchAppNotification({
        title: '☁️ تمت مزامنة وتصحيح اختباراتك السحابية!',
        body: `تم إرسال وتصحيح (${syncedExams}) محاولة محفوظة أوفلاين بنجاح وتحديث سجل درجاتك.`,
        category: 'update',
        actionTab: 'student_assessments',
        authorName: 'محرك المزامنة السحابي UMED'
      });
    }
  };

  return {
    isOnline,
    pendingExams,
    pendingQuestions,
    totalPending,
    isSyncing,
    triggerManualSync
  };
}

export const PWAInstallGuideModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
  isAndroid: boolean;
}> = ({ isOpen, onClose, isIOS, isAndroid }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="max-w-md w-full bg-slate-900 border border-teal-500/40 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">تثبيت تطبيق UMED على هاتفك</h3>
              <p className="text-[11px] text-slate-400">يعمل كتطبيق مستقل أونلاين وأوفلاين بدون متجر</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="space-y-3 text-xs text-slate-200 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="font-bold text-teal-300">خطوات التثبيت على iPhone / iPad (متصفح Safari):</div>
            <ol className="space-y-2.5 list-decimal list-inside text-slate-300">
              <li>
                اضغط على زر <strong className="text-white">المشاركة (Share)</strong>{' '}
                <Share className="w-3.5 h-3.5 inline text-sky-400 mx-0.5" /> في الشريط السفلي لمتصفح Safari.
              </li>
              <li>
                مرّر للأسفل واختر{' '}
                <strong className="text-teal-300">إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>{' '}
                <PlusSquare className="w-3.5 h-3.5 inline text-teal-400 mx-0.5" />.
              </li>
              <li>
                اضغط على <strong className="text-white">إضافة (Add)</strong> في أعلى الشاشة ليظهر تطبيق{' '}
                <strong className="text-teal-300">UMED</strong> مباشرة بين تطبيقات هاتفك.
              </li>
            </ol>
          </div>
        ) : (
          <div className="space-y-3 text-xs text-slate-200 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="font-bold text-teal-300">
              {isAndroid
                ? 'خطوات التثبيت السريع على أجهزة Android (متصفح Chrome):'
                : 'خطوات تثبيت التطبيق على الهاتف أو الكمبيوتر:'}
            </div>
            <ol className="space-y-2.5 list-decimal list-inside text-slate-300">
              <li>
                افتح قائمة المتصفح العلوية <strong className="text-white">(⋮ ثلاث نقاط)</strong> في أعلى يسار أو يمين الشاشة.
              </li>
              <li>
                اضغط على <strong className="text-teal-300">«تثبيت التطبيق» (Install App)</strong> أو{' '}
                <strong className="text-teal-300">«الإضافة إلى الشاشة الرئيسية»</strong>.
              </li>
              <li>
                أكد التثبيت ليتم إنشاء أيقونة تطبيق <strong className="text-white">UMED</strong> وتفعيل العمل بدون إنترنت تلقائياً.
              </li>
            </ol>
          </div>
        )}

        <div className="p-3 rounded-xl bg-teal-950/30 border border-teal-800/50 text-[11px] text-teal-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          <span>
            ميزة التطبيق المثبت: يفتح بملء الشاشة، يحفظ المحاضرات وأسئلة الاختبارات وإجاباتك على جهازك عند انقطاع الشبكة، ويزامنها فور عودة الإنترنت.
          </span>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors"
        >
          حسناً، فهمت
        </button>
      </div>
    </div>
  );
};

export const PWAHeaderControls: React.FC = () => {
  const { isInstalled, isIOS, isAndroid, install, showInstallGuideModal, setShowInstallGuideModal } = usePWAInstall();
  const { isOnline, totalPending, isSyncing, triggerManualSync } = useUnifiedOfflineSyncState();

  return (
    <>
      {/* Live Offline / Pending Sync Badge */}
      {!isOnline ? (
        <div
          className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center gap-1.5"
          title="أنت تعمل الآن في وضع عدم الاتصال (Offline Mode) — جميع إجاباتك وتعديلاتك تُحفظ محلياً بأمان"
        >
          <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
          <span className="hidden sm:inline">وضع أوفلاين</span>
          {totalPending > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-mono text-[10px]">
              {totalPending}
            </span>
          )}
        </div>
      ) : totalPending > 0 ? (
        <button
          onClick={triggerManualSync}
          disabled={isSyncing}
          className="px-2.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
          title="اضغط لمزامنة البيانات المحفوظة أوفلاين مع السحابة الآن"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-sky-400 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">{isSyncing ? 'جارٍ المزامنة...' : `مزامنة (${totalPending})`}</span>
        </button>
      ) : null}

      {/* Install App Button (hidden when already installed in standalone mode) */}
      {!isInstalled && (
        <button
          onClick={install}
          className="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors"
          title="تثبيت تطبيق UMED على الهاتف أو الجهاز للعمل أونلاين وأوفلاين"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="hidden sm:inline">تثبيت التطبيق</span>
        </button>
      )}

      <PWAInstallGuideModal
        isOpen={showInstallGuideModal}
        onClose={() => setShowInstallGuideModal(false)}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </>
  );
};

export const PWASidebarInstallCard: React.FC = () => {
  const { isInstalled, isIOS, isAndroid, install, showInstallGuideModal, setShowInstallGuideModal } = usePWAInstall();
  const { isOnline, totalPending, isSyncing, triggerManualSync } = useUnifiedOfflineSyncState();

  return (
    <div className="px-3 pt-1">
      <div className="p-3 rounded-xl bg-gradient-to-br from-slate-950 to-slate-900 border border-teal-500/30 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-300">
            <Smartphone className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>{isInstalled ? 'تطبيق UMED مثبت ✓' : 'تطبيق الهاتف (أونلاين/أوفلاين)'}</span>
          </div>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
              isOnline
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            {isOnline ? 'متصل' : 'أوفلاين'}
          </span>
        </div>

        {!isInstalled ? (
          <button
            onClick={install}
            className="w-full py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>تثبيت تطبيق UMED على الهاتف</span>
          </button>
        ) : (
          <div className="text-[10px] text-slate-400 leading-relaxed">
            التطبيق يعمل بوضع مستقل مع حفظ تلقائي للاختبارات والأسئلة عند انقطاع الشبكة.
          </div>
        )}

        {totalPending > 0 && (
          <button
            onClick={triggerManualSync}
            disabled={!isOnline || isSyncing}
            className="w-full py-1.5 px-2.5 rounded-lg bg-sky-950/60 hover:bg-sky-900/60 border border-sky-700/50 text-sky-300 text-[10px] font-bold flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {isOnline
                ? `مزامنة ${totalPending} عنصر محفوظ أوفلاين`
                : `${totalPending} عنصر بانتظار عودة الإنترنت`}
            </span>
          </button>
        )}
      </div>

      <PWAInstallGuideModal
        isOpen={showInstallGuideModal}
        onClose={() => setShowInstallGuideModal(false)}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </div>
  );
};

export const PWASettingsCard: React.FC = () => {
  const { isInstalled, isIOS, isAndroid, install, showInstallGuideModal, setShowInstallGuideModal } = usePWAInstall();
  const { isOnline, pendingExams, pendingQuestions, totalPending, isSyncing, triggerManualSync } =
    useUnifiedOfflineSyncState();

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-teal-400" />
            <span>تطبيق الهاتف والعمل دون اتصال (PWA & Offline Sync)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تثبيت المنصة كتطبيق مستقل على الهاتف مع التخزين المحلي الذكي والمزامنة السحابية التلقائية
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
            isOnline
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
          }`}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{isOnline ? 'متصل بالسحابة (أونلاين)' : 'وضع عدم الاتصال (أوفلاين)'}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-semibold">حالة تثبيت التطبيق:</span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                isInstalled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
              }`}
            >
              {isInstalled ? 'مثبت على الجهاز ✓' : 'متاح للتثبيت المباشر'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {isInstalled
              ? 'أنت تستخدم الآن النسخة المثبتة من تطبيق UMED مع تفعيل كامل لذاكرة التخزين دون اتصال.'
              : 'ثبّت تطبيق UMED على شاشتك الرئيسية ليفتح بسرعة فائقة ويعمل حتى عند انقطاع الإنترنت.'}
          </p>
          {!isInstalled && (
            <button
              onClick={install}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
            >
              <Download className="w-4 h-4" />
              <span>تثبيت تطبيق UMED على الهاتف الآن</span>
            </button>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-semibold flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-sky-400" />
              <span>حالة حفظ ومزامنة الإجابات والبيانات:</span>
            </span>
            <span className="font-mono font-bold text-white">
              {totalPending === 0 ? 'مزامن 100% ✓' : `${totalPending} بانتظار المزامنة`}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 space-y-1">
            <div>• محاولات اختبارات محفوظة أوفلاين: <strong className="text-slate-200 font-mono">{pendingExams}</strong></div>
            <div>• أسئلة مستوردة محفوظة أوفلاين: <strong className="text-slate-200 font-mono">{pendingQuestions}</strong></div>
          </div>
          <button
            onClick={triggerManualSync}
            disabled={!isOnline || isSyncing || totalPending === 0}
            className="w-full mt-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            {isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" />
            ) : (
              <CloudCheck className="w-3.5 h-3.5 text-teal-400" />
            )}
            <span>
              {totalPending === 0
                ? 'جميع البيانات متزامنة مع السحابة ✓'
                : isOnline
                ? 'مزامنة البيانات المحفوظة مع السحابة الآن'
                : 'ستتم المزامنة تلقائياً فور عودة الإنترنت'}
            </span>
          </button>
        </div>
      </div>

      <PWAInstallGuideModal
        isOpen={showInstallGuideModal}
        onClose={() => setShowInstallGuideModal(false)}
        isIOS={isIOS}
        isAndroid={isAndroid}
      />
    </div>
  );
};
