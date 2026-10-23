/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Offline-First Bulk MCQ Import, Validation, Review & Optional AI Explanation Modal
 * Yemen-First Medical Education Platform (UMED)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Trash2,
  Plus,
  Download,
  Wifi,
  WifiOff,
  Copy,
  CheckSquare,
  Square,
  Search,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import {
  QuestionBank,
  QuestionItemFull,
  ParsedQuestionDraft,
  BulkImportDraftSession
} from '../../types/umed.ts';
import {
  parseBulkQuestionsInput,
  validateAndAnnotateDrafts,
  SAMPLE_BULK_TEXT_TEMPLATE,
  SAMPLE_BULK_CSV_TEMPLATE
} from '../../services/mcqBulkParser.ts';
import {
  saveBulkImportDraftSession,
  loadBulkImportDraftSession,
  clearBulkImportDraftSession,
  requestOptionalAiExplanations
} from '../../services/questionImportSyncService.ts';
import { bulkSaveQuestions } from '../../services/assessmentService.ts';

interface BulkQuestionImportModalProps {
  bank: QuestionBank;
  existingQuestions: QuestionItemFull[];
  userRole: string;
  onClose: () => void;
  onSaved: (result: {
    savedQuestions: QuestionItemFull[];
    createdCount: number;
    updatedCount: number;
    skippedDuplicatesCount: number;
    syncedImmediately: boolean;
  }) => void;
}

type ReviewFilter = 'all' | 'valid' | 'errors' | 'duplicates';

export default function BulkQuestionImportModal({
  bank,
  existingQuestions,
  userRole,
  onClose,
  onSaved
}: BulkQuestionImportModalProps) {
  const [step, setStep] = useState<'input' | 'review'>('input');
  const [rawInput, setRawInput] = useState<string>('');
  const [sourceFormat, setSourceFormat] = useState<'auto' | 'text' | 'csv' | 'json'>('auto');
  const [defaultPoints, setDefaultPoints] = useState<number>(5);
  const [drafts, setDrafts] = useState<ParsedQuestionDraft[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [restoredSessionBanner, setRestoredSessionBanner] = useState<boolean>(false);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Saving & Optional AI states
  const [saving, setSaving] = useState<boolean>(false);
  const [aiLoadingIds, setAiLoadingIds] = useState<Record<string, boolean>>({});
  const [bulkAiLoading, setBulkAiLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Track online/offline status live
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Restore saved offline draft session on mount if available
  useEffect(() => {
    let active = true;
    loadBulkImportDraftSession(bank.id).then((saved) => {
      if (!active || !saved) return;
      if ((saved.rawInputText && saved.rawInputText.trim()) || (saved.draftQuestions && saved.draftQuestions.length > 0)) {
        setRawInput(saved.rawInputText || '');
        setSourceFormat(saved.sourceFormat || 'auto');
        if (saved.defaultPoints) setDefaultPoints(saved.defaultPoints);
        if (Array.isArray(saved.draftQuestions) && saved.draftQuestions.length > 0) {
          const revalidated = validateAndAnnotateDrafts(saved.draftQuestions, bank.id, existingQuestions);
          setDrafts(revalidated);
          setStep('review');
        }
        setRestoredSessionBanner(true);
        setLastAutoSavedAt(saved.updatedAt);
      }
    });
    return () => {
      active = false;
    };
  }, [bank.id]);

  // Persist draft session to IndexedDB + localStorage on every change so offline work survives refreshes/restarts
  useEffect(() => {
    if (!rawInput.trim() && drafts.length === 0) return;
    const nowIso = new Date().toISOString();
    const session: BulkImportDraftSession = {
      id: `draft_${bank.id}`,
      bankId: bank.id,
      universityId: bank.universityId,
      rawInputText: rawInput,
      sourceFormat: sourceFormat === 'auto' ? 'text' : sourceFormat,
      defaultPoints,
      draftQuestions: drafts,
      updatedAt: nowIso
    };
    saveBulkImportDraftSession(session).then(() => {
      setLastAutoSavedAt(nowIso);
    });
  }, [bank.id, bank.universityId, rawInput, sourceFormat, defaultPoints, drafts]);

  const handleParseInput = () => {
    setFeedback(null);
    if (!rawInput.trim()) {
      setFeedback({
        type: 'error',
        text: 'يرجى لصق نص الأسئلة أو رفع ملف (TXT / CSV / JSON) أولاً.'
      });
      return;
    }

    const { drafts: parsed } = parseBulkQuestionsInput({
      rawInput,
      formatHint: sourceFormat,
      bankId: bank.id,
      defaultPoints,
      existingBankQuestions: existingQuestions
    });

    if (parsed.length === 0) {
      setFeedback({
        type: 'error',
        text: 'لم يتم العثور على أسئلة صالحة في النص المدخل. تأكد من وجود نص السؤال متبوعاً بالخيارات (أ، ب، ج، د أو A, B, C, D).'
      });
      return;
    }

    setDrafts(parsed);
    setStep('review');
    setFilter('all');
    setFeedback({
      type: 'success',
      text: `تم تحليل واستخراج ${parsed.length} سؤال بنجاح بدون ذكاء اصطناعي. يمكنك الآن مراجعتها وتعديلها قبل الحفظ.`
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);

    try {
      const text = await file.text();
      setRawInput(text);

      let detectedFormat: 'auto' | 'text' | 'csv' | 'json' = 'auto';
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
        detectedFormat = 'csv';
      } else if (lower.endsWith('.json')) {
        detectedFormat = 'json';
      } else {
        detectedFormat = 'text';
      }
      setSourceFormat(detectedFormat);

      const { drafts: parsed } = parseBulkQuestionsInput({
        rawInput: text,
        formatHint: detectedFormat,
        fileName: file.name,
        bankId: bank.id,
        defaultPoints,
        existingBankQuestions: existingQuestions
      });
      if (parsed.length > 0) {
        setDrafts(parsed);
        setStep('review');
        setFeedback({
          type: 'success',
          text: `تم قراءة الملف "${file.name}" واستخراج ${parsed.length} سؤال بنجاح (محفوظ محلياً على جهازك).`
        });
      } else {
        setFeedback({
          type: 'info',
          text: `تم تحميل محتوى الملف "${file.name}". اضغط على "تحليل وتنظيم الأسئلة" للمراجعة.`
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: 'تعذر قراءة الملف المرفوع. تأكد من أن الملف نصي بترميز UTF-8.'
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadTemplate = (kind: 'txt' | 'csv') => {
    const content = kind === 'csv' ? '\uFEFF' + SAMPLE_BULK_CSV_TEMPLATE : SAMPLE_BULK_TEXT_TEMPLATE;
    const mime = kind === 'csv' ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'csv' ? 'umed_mcq_bulk_template.csv' : 'umed_mcq_bulk_template.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearSession = async () => {
    await clearBulkImportDraftSession(bank.id);
    setRawInput('');
    setDrafts([]);
    setStep('input');
    setRestoredSessionBanner(false);
    setLastAutoSavedAt(null);
    setFeedback({ type: 'info', text: 'تم مسح مسودة الاستيراد المحلية وبدء جلسة جديدة.' });
  };

  const updateDraftItem = (tempId: string, updater: (draft: ParsedQuestionDraft) => ParsedQuestionDraft) => {
    setDrafts((prev) => {
      const updated = prev.map((d) => (d.tempId === tempId ? updater(d) : d));
      return validateAndAnnotateDrafts(updated, bank.id, existingQuestions);
    });
  };

  const handleDeleteDraft = (tempId: string) => {
    setDrafts((prev) => {
      const remaining = prev.filter((d) => d.tempId !== tempId);
      return validateAndAnnotateDrafts(remaining, bank.id, existingQuestions);
    });
  };

  const handleAddBlankDraft = () => {
    const newDraft: ParsedQuestionDraft = {
      tempId: `draft-manual-${Date.now()}`,
      deterministicId: `q-${bank.id}-manual-${Date.now()}`,
      sourceIndex: drafts.length + 1,
      stemArabic: '',
      stemEnglish: '',
      options: [
        { id: 'opt-a', textArabic: '' },
        { id: 'opt-b', textArabic: '' },
        { id: 'opt-c', textArabic: '' },
        { id: 'opt-d', textArabic: '' }
      ],
      correctOptionId: 'opt-a',
      explanationArabic: '',
      points: defaultPoints,
      contentHash: '',
      isValid: false,
      isDuplicateInBatch: false,
      isDuplicateInBank: false,
      issues: [],
      selectedForImport: true
    };
    setDrafts((prev) => validateAndAnnotateDrafts([newDraft, ...prev], bank.id, existingQuestions));
  };

  // Optional AI explanation for a single draft (never changes correctOptionId)
  const handleGenerateSingleAiExplanation = async (draft: ParsedQuestionDraft) => {
    if (!isOnline) {
      setFeedback({
        type: 'error',
        text: 'توليد التعليلات بالذكاء الاصطناعي (الأداة الاختيارية) يتطلب اتصالاً بالإنترنت. يمكنك حفظ الأسئلة الآن بدون إنترنت أو بدون ذكاء اصطناعي.'
      });
      return;
    }

    if (!draft.stemArabic.trim() || !draft.correctOptionId) {
      setFeedback({
        type: 'error',
        text: 'يرجى التأكد من كتابة نص السؤال وتحديد الإجابة الصحيحة أولاً قبل طلب التعليل الطبي.'
      });
      return;
    }

    setAiLoadingIds((prev) => ({ ...prev, [draft.tempId]: true }));
    setFeedback(null);

    try {
      const results = await requestOptionalAiExplanations([draft]);
      const match = results.find((r) => r.tempId === draft.tempId) || results[0];
      if (!match || !match.explanationArabic) {
        throw new Error('لم يتم استلام تعليل صالح من الخادم.');
      }

      updateDraftItem(draft.tempId, (current) => ({
        ...current,
        // STRICT GUARANTEE: Never alter current.correctOptionId
        correctOptionId: current.correctOptionId,
        originalExplanationBeforeAi:
          current.originalExplanationBeforeAi !== undefined
            ? current.originalExplanationBeforeAi
            : (current.explanationArabic || ''),
        explanationArabic: match.explanationArabic,
        aiGeneratedExplanation: match.explanationArabic,
        optionExplanations: match.optionExplanations
      }));

      setFeedback({
        type: 'success',
        text: 'تم توليد التعليل الطبي الاختياري بنجاح دون المساس بالإجابة الصحيحة المعتمدة. يمكنك مراجعته أو تعديله أو استعادة النص الأصلي.'
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'تعذر توليد التعليل الطبي حالياً. يمكنك المتابعة وحفظ الأسئلة بدون ذكاء اصطناعي.'
      });
    } finally {
      setAiLoadingIds((prev) => ({ ...prev, [draft.tempId]: false }));
    }
  };

  // Optional AI explanations in bulk for selected valid questions
  const handleGenerateBulkAiExplanations = async () => {
    if (!isOnline) {
      setFeedback({
        type: 'error',
        text: 'أداة التعليل الطبي بالذكاء الاصطناعي تتطلب اتصالاً بالإنترنت. عملية الاستيراد والحفظ تعمل بالكامل بدونها.'
      });
      return;
    }

    const targets = drafts.filter((d) => d.selectedForImport && d.isValid && d.correctOptionId);
    if (targets.length === 0) {
      setFeedback({
        type: 'error',
        text: 'لا توجد أسئلة محددة وجاهزة لتوليد تعليلات لها.'
      });
      return;
    }

    setBulkAiLoading(true);
    setFeedback(null);

    try {
      const batchSlice = targets.slice(0, 15);
      const results = await requestOptionalAiExplanations(batchSlice);
      const resultMap = new Map(results.map((r) => [r.tempId, r]));

      setDrafts((prev) =>
        validateAndAnnotateDrafts(
          prev.map((d) => {
            const gen = resultMap.get(d.tempId);
            if (!gen || !gen.explanationArabic) return d;
            return {
              ...d,
              // STRICT GUARANTEE: Never alter d.correctOptionId
              correctOptionId: d.correctOptionId,
              originalExplanationBeforeAi:
                d.originalExplanationBeforeAi !== undefined
                  ? d.originalExplanationBeforeAi
                  : (d.explanationArabic || ''),
              explanationArabic: gen.explanationArabic,
              aiGeneratedExplanation: gen.explanationArabic,
              optionExplanations: gen.optionExplanations
            };
          }),
          bank.id,
          existingQuestions
        )
      );

      setFeedback({
        type: 'success',
        text: `تم توليد التعليلات الطبية الاختيارية لـ ${results.length} سؤال بنجاح مع الحفاظ التام على جميع الإجابات الصحيحة المعتمدة.`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'تعذر توليد التعليلات الدفعية. يمكنك حفظ الأسئلة مباشرة بدون ذكاء اصطناعي.'
      });
    } finally {
      setBulkAiLoading(false);
    }
  };

  const handleRevertAiExplanation = (tempId: string) => {
    updateDraftItem(tempId, (current) => ({
      ...current,
      explanationArabic: current.originalExplanationBeforeAi || '',
      aiGeneratedExplanation: undefined,
      optionExplanations: undefined
    }));
  };

  // Summary metrics
  const stats = useMemo(() => {
    const total = drafts.length;
    const valid = drafts.filter((d) => d.isValid).length;
    const withErrors = drafts.filter((d) => !d.isValid).length;
    const duplicates = drafts.filter((d) => d.isDuplicateInBatch || d.isDuplicateInBank).length;
    const selectedValid = drafts.filter((d) => d.selectedForImport && d.isValid).length;
    const selectedInvalid = drafts.filter((d) => d.selectedForImport && !d.isValid).length;
    return { total, valid, withErrors, duplicates, selectedValid, selectedInvalid };
  }, [drafts]);

  const filteredDrafts = useMemo(() => {
    return drafts.filter((d) => {
      if (filter === 'valid' && !d.isValid) return false;
      if (filter === 'errors' && d.isValid) return false;
      if (filter === 'duplicates' && !d.isDuplicateInBatch && !d.isDuplicateInBank) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const inStem = d.stemArabic.toLowerCase().includes(q) || (d.stemEnglish || '').toLowerCase().includes(q);
        const inOpts = d.options.some((o) => o.textArabic.toLowerCase().includes(q));
        return inStem || inOpts;
      }
      return true;
    });
  }, [drafts, filter, searchQuery]);

  const handleSaveSelected = async () => {
    setFeedback(null);
    const toSave = drafts.filter((d) => d.selectedForImport && d.isValid);
    if (toSave.length === 0) {
      setFeedback({
        type: 'error',
        text: 'يرجى تحديد سؤال واحد صالح على الأقل (مكتمل الخيارات والإجابة الصحيحة) لحفظه في البنك.'
      });
      return;
    }

    setSaving(true);
    try {
      const result = await bulkSaveQuestions(bank.id, toSave, userRole);
      await clearBulkImportDraftSession(bank.id);
      onSaved(result);
      onClose();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء حفظ دفعة الأسئلة.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto overscroll-contain"
      dir="rtl"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden my-auto">
        
        {/* Top Modal Header */}
        <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-white">
                الاستيراد الدفعي للأسئلة (Bulk MCQ Import) — {bank.titleArabic}
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 border ${
                  isOnline
                    ? 'bg-emerald-950/80 border-emerald-700/70 text-emerald-300'
                    : 'bg-amber-950/80 border-amber-700/70 text-amber-300'
                }`}
              >
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span>{isOnline ? 'متصل — مزامنة سحابية تلقائية' : 'وضع عدم الاتصال (Offline) — حفظ محلي آمن'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              استيراد وتنظيم ومراجعة عشرات الأسئلة دفعة واحدة بدون ذكاء اصطناعي وبدون الحاجة لاتصال بالإنترنت، مع مزامنة تلقائية فور عودة الشبكة.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {lastAutoSavedAt && (
              <span className="text-[11px] text-teal-400 bg-teal-950/50 border border-teal-800/60 px-2.5 py-1 rounded-lg">
                محفوظ تلقائياً على الجهاز ({new Date(lastAutoSavedAt).toLocaleTimeString('ar-YE')})
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="إغلاق (تبقى المسودة محفوظة على جهازك)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step Navigation Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep('input')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                step === 'input'
                  ? 'bg-teal-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              1. لصق النص أو رفع ملف (TXT / CSV / JSON)
            </button>
            <button
              type="button"
              onClick={() => {
                if (drafts.length > 0) setStep('review');
                else handleParseInput();
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                step === 'review'
                  ? 'bg-teal-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              2. شاشة المراجعة والتدقيق والتعديل ({drafts.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {(rawInput.trim() || drafts.length > 0) && (
              <button
                type="button"
                onClick={handleClearSession}
                className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/70 text-rose-300 text-[11px] font-semibold flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>مسح المسودة وبدء جلسة جديدة</span>
              </button>
            )}
          </div>
        </div>

        {/* Restored Offline Session Banner */}
        {restoredSessionBanner && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-teal-950/60 border border-teal-700/70 flex flex-wrap items-center justify-between gap-2 text-xs text-teal-200 shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
              <span>
                تمت استعادة مسودة الاستيراد غير المكتملة المحفوظة محلياً على جهازك ({drafts.length} سؤال). يمكنك متابعة المراجعة أو الحفظ.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setRestoredSessionBanner(false)}
              className="text-[11px] text-teal-300 underline hover:text-white"
            >
              إخفاء التنبيه
            </button>
          </div>
        )}

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mx-4 sm:mx-6 mt-3 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border shrink-0 ${
              feedback.type === 'error'
                ? 'bg-rose-950/70 border-rose-800 text-rose-200'
                : feedback.type === 'info'
                ? 'bg-blue-950/70 border-blue-800 text-blue-200'
                : 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
            }`}
          >
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Main Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {step === 'input' ? (
            <div className="space-y-5">
              {/* Format & Templates Toolbar */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-950 border border-slate-800 rounded-2xl p-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    رفع ملف أسئلة من جهازك (يعمل بدون إنترنت)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.tsv,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 px-4 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>اختيار ملف (.TXT, .CSV, .JSON)</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    تنسيق البيانات والدرجة الافتراضية
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={sourceFormat}
                      onChange={(e) => setSourceFormat(e.target.value as any)}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-semibold"
                    >
                      <option value="auto">اكتشاف تلقائي ذكي (Auto-Detect)</option>
                      <option value="text">نص منظم / Aiken / مرقم (TXT)</option>
                      <option value="csv">جدول بيانات (CSV / TSV)</option>
                      <option value="json">ملف مهيكل (JSON)</option>
                    </select>
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5">
                      <span className="text-[11px] text-slate-400">النقاط:</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={defaultPoints}
                        onChange={(e) => setDefaultPoints(Number(e.target.value) || 5)}
                        className="w-12 bg-transparent text-xs text-teal-300 font-mono font-bold text-center focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    قوالب جاهزة للتجربة أو التحميل
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRawInput(SAMPLE_BULK_TEXT_TEMPLATE);
                        setSourceFormat('text');
                      }}
                      className="flex-1 px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>إدراج نموذج نصي تجريبي</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('txt')}
                      className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] flex items-center gap-1"
                      title="تحميل قالب نصي TXT"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>TXT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate('csv')}
                      className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] flex items-center gap-1"
                      title="تحميل قالب جدول CSV"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Supported Syntax Quick Guide */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
                <div className="font-bold text-slate-200">
                  الصيغ المدعومة للاستيراد الفوري (بدون ذكاء اصطناعي):
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>
                    <strong className="text-teal-300">النص الحر أو المرقم (العربي والإنجليزي):</strong> اكتب كل سؤال متبوعاً بالخيارات <code className="text-slate-200">أ) ... ب) ... ج) ... د) ...</code> أو <code className="text-slate-200">A) ... B) ... C) ... D) ...</code>.
                  </li>
                  <li>
                    <strong className="text-teal-300">تحديد الإجابة الصحيحة:</strong> عبر سطر <code className="text-slate-200">الإجابة: ب</code> أو <code className="text-slate-200">ANSWER: B</code>، أو وضع نجمة <code className="text-slate-200">*</code> أو علامة <code className="text-slate-200">✓</code> أو <code className="text-slate-200">(صحيح)</code> بجوار الخيار الصحيح، أو جدول مفاتيح إجابات في نهاية النص.
                  </li>
                  <li>
                    <strong className="text-teal-300">جداول CSV / TSV وملفات JSON:</strong> أعمدة السؤال، الخيارات الأربعة، رمز أو نص الإجابة الصحيحة، والتعليل الاختياري.
                  </li>
                </ul>
              </div>

              {/* Raw Textarea Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white">
                    الصق مجموعة الأسئلة هنا (أو ارفع ملفاً من الأعلى):
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {rawInput.length} حرف
                  </span>
                </div>
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={`مثال:\n1. ما هو الصمام القلبي الفاصل بين البطين الأيسر والشريان الأبهر؟\nأ) الصمام التاجي\nب) الصمام الأبهري *\nج) الصمام ثلاثي الشرف\nد) الصمام الرئوي\nالتعليل: الصمام الأبهري يفصل البطين الأيسر عن الشريان الأبهر.`}
                  className="w-full h-72 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-white leading-relaxed focus:outline-none focus:border-teal-500 font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={handleParseInput}
                  className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg flex items-center gap-2 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تحليل وتنظيم الأسئلة للمراجعة</span>
                </button>
              </div>
            </div>
          ) : (
            /* STEP 2: REVIEW, VALIDATE, EDIT & OPTIONAL AI EXPLANATIONS */
            <div className="space-y-4">
              {/* Summary Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`p-3 rounded-xl border text-right transition-all ${
                    filter === 'all'
                      ? 'bg-slate-800 border-teal-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <div className="text-[11px] text-slate-400">إجمالي الأسئلة</div>
                  <div className="text-lg font-bold font-mono text-white mt-0.5">{stats.total}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('valid')}
                  className={`p-3 rounded-xl border text-right transition-all ${
                    filter === 'valid'
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                      : 'bg-slate-950 border-slate-800 text-emerald-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="text-[11px] text-emerald-300/80">جاهزة للحفظ ✓</div>
                  <div className="text-lg font-bold font-mono mt-0.5">{stats.valid}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('errors')}
                  className={`p-3 rounded-xl border text-right transition-all ${
                    filter === 'errors'
                      ? 'bg-rose-950/80 border-rose-500 text-rose-200'
                      : 'bg-slate-950 border-slate-800 text-rose-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="text-[11px] text-rose-300/80">تحتاج مراجعة / ناقصة</div>
                  <div className="text-lg font-bold font-mono mt-0.5">{stats.withErrors}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter('duplicates')}
                  className={`p-3 rounded-xl border text-right transition-all ${
                    filter === 'duplicates'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-amber-400 hover:bg-slate-900'
                  }`}
                >
                  <div className="text-[11px] text-amber-300/80">مكررة (بالبنك أو الدفعة)</div>
                  <div className="text-lg font-bold font-mono mt-0.5">{stats.duplicates}</div>
                </button>

                <div className="p-3 rounded-xl bg-teal-950/40 border border-teal-800/60 text-right">
                  <div className="text-[11px] text-teal-300">المحددة للحفظ النهائي</div>
                  <div className="text-lg font-bold font-mono text-teal-200 mt-0.5">
                    {stats.selectedValid} <span className="text-xs font-normal text-slate-400">/ {stats.total}</span>
                  </div>
                </div>
              </div>

              {/* Action & Optional AI Toolbar */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="بحث في الأسئلة المستخرجة..."
                      className="w-full pr-8 pl-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((prev) =>
                        prev.map((d) => ({ ...d, selectedForImport: d.isValid && !d.isDuplicateInBatch }))
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300"
                  >
                    تحديد الصالحة غير المكررة
                  </button>

                  <button
                    type="button"
                    onClick={handleAddBlankDraft}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-teal-300 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة سؤال يدوياً للدفعة</span>
                  </button>
                </div>

                {/* Optional AI Explanations Bulk Button */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateBulkAiExplanations}
                    disabled={bulkAiLoading || !isOnline || stats.selectedValid === 0}
                    className="px-3.5 py-2 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/70 disabled:opacity-40 text-indigo-200 text-xs font-bold flex items-center gap-1.5 transition-all"
                    title="أداة اختيارية: توليد تعليلات طبية للأسئلة المحددة دون تغيير الإجابة الصحيحة"
                  >
                    {bulkAiLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-300" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                    )}
                    <span>
                      {bulkAiLoading
                        ? 'جاري توليد التعليلات الطبية...'
                        : 'توليد تعليل طبي بالذكاء الاصطناعي (اختياري)'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Draft Questions List */}
              <div className="space-y-4">
                {filteredDrafts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-2xl">
                    لا توجد أسئلة مطابقة لفلتر العرض الحالي.
                  </div>
                ) : (
                  filteredDrafts.map((draft, idx) => {
                    const isAiBusy = Boolean(aiLoadingIds[draft.tempId]);
                    const hasErrors = draft.issues.some((i) => i.severity === 'error');
                    return (
                      <div
                        key={draft.tempId}
                        className={`p-4 rounded-2xl border transition-all space-y-3 ${
                          hasErrors
                            ? 'bg-rose-950/20 border-rose-800/80'
                            : draft.isDuplicateInBank || draft.isDuplicateInBatch
                            ? 'bg-amber-950/20 border-amber-800/80'
                            : draft.selectedForImport
                            ? 'bg-slate-950 border-slate-800'
                            : 'bg-slate-950/50 border-slate-800/50 opacity-75'
                        }`}
                      >
                        {/* Card Top Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftItem(draft.tempId, (d) => ({
                                  ...d,
                                  selectedForImport: !d.selectedForImport
                                }))
                              }
                              className="flex items-center gap-1.5 text-xs font-bold text-white"
                            >
                              {draft.selectedForImport ? (
                                <CheckSquare className="w-4 h-4 text-teal-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500" />
                              )}
                              <span>سؤال #{idx + 1}</span>
                            </button>

                            {draft.isValid ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[11px] font-semibold">
                                مكتمل وجاهز للحفظ ✓
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-700/60 text-rose-300 text-[11px] font-semibold">
                                يحتاج استكمال البيانات
                              </span>
                            )}

                            {draft.correctOptionId ? (
                              <span className="px-2 py-0.5 rounded-md bg-teal-950/70 border border-teal-800 text-teal-300 text-[10px]">
                                إجابة محددة ({draft.correctOptionId.replace('opt-', '').toUpperCase()})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-700 text-rose-200 text-[10px] font-bold">
                                لم يتم رصد إجابة — اختر الإجابة الصحيحة أدناه
                              </span>
                            )}

                            {draft.isDuplicateInBank && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-700 text-amber-300 text-[10px] flex items-center gap-1">
                                <Copy className="w-3 h-3" />
                                <span>موجود مسبقاً في البنك (سيتم تحديثه دون تكرار)</span>
                              </span>
                            )}

                            {draft.isDuplicateInBatch && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-700 text-amber-300 text-[10px] flex items-center gap-1">
                                <Copy className="w-3 h-3" />
                                <span>مكرر داخل نفس الدفعة</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
                              <span className="text-[10px] text-slate-400">النقاط:</span>
                              <input
                                type="number"
                                min={1}
                                value={draft.points}
                                onChange={(e) =>
                                  updateDraftItem(draft.tempId, (d) => ({
                                    ...d,
                                    points: Number(e.target.value) || 5
                                  }))
                                }
                                className="w-10 bg-transparent text-xs text-teal-300 font-mono font-bold text-center focus:outline-none"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(draft.tempId)}
                              className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 text-rose-400 transition-colors"
                              title="استبعاد وحذف هذا السؤال من الدفعة"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Validation Issues Banner */}
                        {draft.issues.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {draft.issues.map((issue, iIdx) => (
                              <span
                                key={iIdx}
                                className={`px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 border ${
                                  issue.severity === 'error'
                                    ? 'bg-rose-950/70 border-rose-800 text-rose-200 font-semibold'
                                    : 'bg-amber-950/60 border-amber-800/80 text-amber-200'
                                }`}
                              >
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>{issue.messageArabic}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Editable Question Stem */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          <div className="md:col-span-2">
                            <label className="text-[11px] text-slate-400 block mb-1">
                              نص السؤال الطبي (قابلة للتعديل المباشر)
                            </label>
                            <textarea
                              value={draft.stemArabic}
                              onChange={(e) =>
                                updateDraftItem(draft.tempId, (d) => ({
                                  ...d,
                                  stemArabic: e.target.value
                                }))
                              }
                              rows={2}
                              placeholder="أدخل نص السؤال..."
                              className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-400 block mb-1">
                              المصطلح / النص الإنجليزي المرافق (اختياري)
                            </label>
                            <textarea
                              value={draft.stemEnglish || ''}
                              onChange={(e) =>
                                updateDraftItem(draft.tempId, (d) => ({
                                  ...d,
                                  stemEnglish: e.target.value
                                }))
                              }
                              rows={2}
                              dir="ltr"
                              placeholder="Optional English stem..."
                              className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                            />
                          </div>
                        </div>

                        {/* Options Grid with Click-to-Select Correct Answer */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] text-slate-400">
                              الخيارات (انقر على زر &quot;الإجابة الصحيحة&quot; بجانب الخيار لاعتماده كمفتاح إجابة محمي):
                            </label>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {draft.options.map((opt, oIdx) => {
                              const isCorrect = draft.correctOptionId === opt.id;
                              const letterArabic = ['أ', 'ب', 'ج', 'د'][oIdx] || opt.id;
                              const optExplanation = draft.optionExplanations?.[opt.id];
                              return (
                                <div
                                  key={opt.id}
                                  className={`p-2.5 rounded-xl border transition-all space-y-1.5 ${
                                    isCorrect
                                      ? 'bg-teal-950/50 border-teal-500/80'
                                      : 'bg-slate-900/80 border-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateDraftItem(draft.tempId, (d) => ({
                                          ...d,
                                          correctOptionId: opt.id
                                        }))
                                      }
                                      className={`px-2 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-colors ${
                                        isCorrect
                                          ? 'bg-teal-600 text-white shadow'
                                          : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                                      }`}
                                      title="اعتماد هذا الخيار كإجابة صحيحة"
                                    >
                                      {isCorrect ? `✓ صحيح (${letterArabic})` : `خيار (${letterArabic})`}
                                    </button>

                                    <input
                                      type="text"
                                      value={opt.textArabic}
                                      onChange={(e) =>
                                        updateDraftItem(draft.tempId, (d) => ({
                                          ...d,
                                          options: d.options.map((o) =>
                                            o.id === opt.id ? { ...o, textArabic: e.target.value } : o
                                          )
                                        }))
                                      }
                                      placeholder={`نص الخيار (${letterArabic})...`}
                                      className="flex-1 bg-transparent text-xs text-white focus:outline-none border-b border-transparent focus:border-teal-500 pb-0.5"
                                    />
                                  </div>

                                  {optExplanation && (
                                    <div className="text-[10px] text-slate-300 bg-slate-950/70 px-2 py-1 rounded border border-slate-800/80">
                                      <span className={isCorrect ? 'text-teal-400 font-semibold' : 'text-amber-400 font-semibold'}>
                                        {isCorrect ? 'لماذا صحيح: ' : 'لماذا خاطئ: '}
                                      </span>
                                      {optExplanation}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Explanation & Optional AI Helper Row */}
                        <div className="pt-1 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] text-slate-400 font-semibold">
                                التعليل العلمي للإجابة (اختياري — يُحفظ في مفتاح الإجابة المحمي):
                              </label>
                              {Boolean(draft.aiGeneratedExplanation) && (
                                <span className="px-2 py-0.5 rounded bg-indigo-950/90 border border-indigo-700 text-indigo-300 text-[10px] font-semibold">
                                  تم اقتراحه بالذكاء الاصطناعي (قابل للمراجعة والتعديل)
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {Boolean(draft.aiGeneratedExplanation) && (
                                <button
                                  type="button"
                                  onClick={() => handleRevertAiExplanation(draft.tempId)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>استعادة النص الأصلي</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleGenerateSingleAiExplanation(draft)}
                                disabled={isAiBusy || !isOnline || !draft.correctOptionId}
                                className="px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 disabled:opacity-40 text-indigo-200 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                                title="توليد شرح طبي موجز لسبب صحة الإجابة المختارة وخطأ البدائل (دون تغيير إجابتك)"
                              >
                                {isAiBusy ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3 h-3 text-indigo-300" />
                                )}
                                <span>{isAiBusy ? 'جاري التوليد...' : 'توليد تعليل بالذكاء الاصطناعي (اختياري)'}</span>
                              </button>
                            </div>
                          </div>

                          <textarea
                            value={draft.explanationArabic || ''}
                            onChange={(e) =>
                              updateDraftItem(draft.tempId, (d) => ({
                                ...d,
                                explanationArabic: e.target.value
                              }))
                            }
                            rows={2}
                            placeholder="اكتب التعليل الطبي يدوياً أو اتركه فارغاً (أو استخدم زر التوليد الاختياري أعلاه)..."
                            className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Sticky Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
            <span>
              مفاتيح الإجابات والتعليلات تُحفظ بمعزل تام عن واجهة اختبارات الطلاب، وتُزامن تلقائياً فور توفر الإنترنت.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {step === 'review' && (
              <button
                type="button"
                onClick={() => setStep('input')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                العودة للنص المصدر
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              إغلاق
            </button>

            {step === 'review' && (
              <button
                type="button"
                onClick={handleSaveSelected}
                disabled={saving || stats.selectedValid === 0}
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg flex items-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {saving
                    ? 'جاري الحفظ...'
                    : `حفظ الأسئلة المعتمدة (${stats.selectedValid}) ${isOnline ? 'ومزامنتها' : 'محلياً (أوفلاين)'}`}
                </span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
