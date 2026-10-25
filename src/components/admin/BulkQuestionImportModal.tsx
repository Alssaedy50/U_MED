/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Offline-First Bulk MCQ Import, Validation, Review & Direct Single-Mode Publishing Modal
 * Yemen-First Medical Education Platform (UMED)
 * Optimized for Mobile (360px–412px) and Desktop with maximum viewport visibility
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
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Trophy,
  BookOpen
} from 'lucide-react';
import {
  QuestionBank,
  QuestionItemFull,
  ParsedQuestionDraft,
  BulkImportDraftSession,
  Assessment,
  StudyLevel,
  DAR_AL_SALAM_SEED
} from '../../types/umed.ts';
import {
  parseBulkQuestionsInput,
  validateAndAnnotateDrafts,
  SAMPLE_BULK_TEXT_TEMPLATE,
  SAMPLE_BULK_CSV_TEMPLATE,
  UMED_AI_UNIVERSAL_PROMPT_ARABIC
} from '../../services/mcqBulkParser.ts';
import {
  saveBulkImportDraftSession,
  loadBulkImportDraftSession,
  clearBulkImportDraftSession,
  requestOptionalAiExplanations
} from '../../services/questionImportSyncService.ts';
import { bulkSaveQuestions, createAssessment } from '../../services/assessmentService.ts';

export type ApprovalPublishMode = 'bank_only' | 'exam_only' | 'competition_only';

interface BulkQuestionImportModalProps {
  bank: QuestionBank;
  existingQuestions: QuestionItemFull[];
  userRole: string;
  studyLevels?: StudyLevel[];
  defaultStudyLevelId?: string;
  onClose: () => void;
  onSaved: (result: {
    savedQuestions: QuestionItemFull[];
    createdCount: number;
    updatedCount: number;
    skippedDuplicatesCount: number;
    syncedImmediately: boolean;
    publishedAssessment?: Assessment;
    publishMode?: ApprovalPublishMode;
  }) => void;
}

type ReviewFilter = 'all' | 'valid' | 'errors' | 'duplicates';

export default function BulkQuestionImportModal({
  bank,
  existingQuestions,
  userRole,
  studyLevels = DAR_AL_SALAM_SEED.studyLevels,
  defaultStudyLevelId = 'lvl-4',
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
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [showFormatOptions, setShowFormatOptions] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Direct Approval & Single-Mode Publishing State (Strictly Bank Only OR Exam Only OR Competition Only)
  const [publishMode, setPublishMode] = useState<ApprovalPublishMode>('bank_only');
  const [publishTitle, setPublishTitle] = useState<string>(`اختبار ${bank.titleArabic}`);
  const [publishStudyLevelId, setPublishStudyLevelId] = useState<string>(
    bank.studyLevelId || defaultStudyLevelId || 'lvl-4'
  );
  const [publishDurationMinutes, setPublishDurationMinutes] = useState<number>(30);
  const [publishQuestionSeconds, setPublishQuestionSeconds] = useState<number>(0);
  const [publishAvailabilityHours, setPublishAvailabilityHours] = useState<number>(168);

  // Saving & Optional AI states
  const [saving, setSaving] = useState<boolean>(false);
  const [aiLoadingIds, setAiLoadingIds] = useState<Record<string, boolean>>({});
  const [bulkAiLoading, setBulkAiLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Update default title & duration when switching between Exam Only and Competition Only
  const handleSelectPublishMode = (mode: ApprovalPublishMode) => {
    setPublishMode(mode);
    if (mode === 'exam_only') {
      setPublishTitle((prev) =>
        !prev.trim() || prev.startsWith('مسابقة ')
          ? `اختبار ${bank.titleArabic}`
          : prev
      );
      setPublishDurationMinutes(30);
    } else if (mode === 'competition_only') {
      setPublishTitle((prev) =>
        !prev.trim() || prev.startsWith('اختبار ')
          ? `مسابقة ${bank.titleArabic}`
          : prev
      );
      setPublishDurationMinutes(15);
    }
  };

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
    saveBulkImportDraftSession(session).catch(() => {});
  }, [bank.id, bank.universityId, rawInput, sourceFormat, defaultPoints, drafts]);

  const toggleExpandCard = (tempId: string) => {
    setExpandedCards((prev) => ({ ...prev, [tempId]: !prev[tempId] }));
  };

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
        text: 'لم يتم العثور على أسئلة صالحة في النص. تأكد من كتابة السؤال متبوعاً بالخيارات (أ، ب، ج، د أو A, B, C, D).'
      });
      return;
    }

    setDrafts(parsed);
    setStep('review');
    setFilter('all');
    setFeedback({
      type: 'success',
      text: `تم تنظيم ${parsed.length} سؤال بنجاح. راجع الإجابات أو اعتمد الحفظ مباشرة.`
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
          text: `تم استخراج ${parsed.length} سؤال من الملف "${file.name}".`
        });
      } else {
        setFeedback({
          type: 'info',
          text: `تم تحميل الملف "${file.name}". اضغط على "تحليل وعرض الأسئلة" للمتابعة.`
        });
      }
    } catch {
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
    setFeedback({ type: 'info', text: 'تم مسح المسودة وبدء جلسة جديدة.' });
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
    const tempId = `draft-manual-${Date.now()}`;
    const newDraft: ParsedQuestionDraft = {
      tempId,
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

  // Optional AI / Smart Medical explanation for a single draft (never changes correctOptionId)
  const handleGenerateSingleAiExplanation = async (draft: ParsedQuestionDraft) => {
    if (!draft.stemArabic.trim() || !draft.correctOptionId) {
      setFeedback({
        type: 'error',
        text: 'يرجى كتابة نص السؤال وتحديد الإجابة الصحيحة أولاً قبل توليد التعليل.'
      });
      return;
    }

    setAiLoadingIds((prev) => ({ ...prev, [draft.tempId]: true }));
    setExpandedCards((prev) => ({ ...prev, [draft.tempId]: true }));
    setFeedback(null);

    try {
      const results = await requestOptionalAiExplanations([draft]);
      const match = results.find((r) => r.tempId === draft.tempId) || results[0];
      if (!match || !match.explanationArabic) {
        throw new Error('تعذر توليد التعليل الطبي.');
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
        text: 'تم توليد التعليل الطبي بنجاح دون تغيير الإجابة الصحيحة.'
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'تعذر توليد التعليل الطبي حالياً.'
      });
    } finally {
      setAiLoadingIds((prev) => ({ ...prev, [draft.tempId]: false }));
    }
  };

  // Optional AI / Smart Medical explanations in bulk for selected valid questions
  const handleGenerateBulkAiExplanations = async () => {
    const targets = drafts.filter((d) => d.selectedForImport && d.isValid && d.correctOptionId);
    if (targets.length === 0) {
      setFeedback({
        type: 'error',
        text: 'لا توجد أسئلة محددة ومكتملة لتوليد تعليلات لها.'
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
        text: `تم توليد التعليلات الطبية لـ ${results.length} سؤال بنجاح دون تغيير أي إجابة.`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'تعذر توليد التعليلات الدفعية.'
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
    return { total, valid, withErrors, duplicates, selectedValid };
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
        text: 'يرجى تحديد سؤال واحد صالح على الأقل (مكتمل الخيارات والإجابة الصحيحة) للحفظ.'
      });
      return;
    }

    if (publishMode !== 'bank_only' && !publishTitle.trim()) {
      setFeedback({
        type: 'error',
        text: publishMode === 'competition_only' ? 'يرجى كتابة عنوان المسابقة الطبية.' : 'يرجى كتابة عنوان الاختبار الأكاديمي.'
      });
      return;
    }

    setSaving(true);
    try {
      // 1. Save imported questions into the Question Bank (Offline-First + Auto Sync)
      const result = await bulkSaveQuestions(bank.id, toSave, userRole);

      // 2. If user chose to publish strictly as Exam ONLY or Competition ONLY, create that single assessment
      let publishedAssessment: Assessment | undefined = undefined;
      if (publishMode === 'exam_only' || publishMode === 'competition_only') {
        const strictAssessmentType = publishMode === 'competition_only' ? 'competition' : 'exam';
        const activeQuestions = result.savedQuestions.length > 0 ? result.savedQuestions : [];
        const qIds = activeQuestions.map((q) => q.id);
        const totalPoints = activeQuestions.reduce((sum, q) => sum + (Number(q.points) || 5), 0);

        const durationVal = Number(publishDurationMinutes) || 0;
        const availHours = Number(publishAvailabilityHours) || 168;

        publishedAssessment = await createAssessment(
          {
            assessmentType: strictAssessmentType,
            titleArabic: publishTitle.trim(),
            descriptionArabic:
              strictAssessmentType === 'competition'
                ? `مسابقة طبية تنافسية مرتبطة ببنك ${bank.titleArabic}`
                : `اختبار أكاديمي مرتبط ببنك ${bank.titleArabic}`,
            universityId: bank.universityId || 'univ-dar-al-salam',
            programId: bank.programId || 'prog-mbbs',
            studyLevelId: publishStudyLevelId || bank.studyLevelId || defaultStudyLevelId || 'lvl-4',
            durationMinutes: durationVal,
            enableExamTimer: durationVal > 0,
            questionDurationSeconds: Number(publishQuestionSeconds) || 0,
            availabilityDurationHours: availHours,
            allowTrialSharing: true,
            showLeaderboard: true,
            maxAttempts: strictAssessmentType === 'competition' ? 1 : 2,
            opensAt: new Date(Date.now() - 60000).toISOString(),
            closesAt: new Date(Date.now() + availHours * 3600000).toISOString(),
            resultReleasePolicy: 'immediate',
            status: 'published',
            questionIds: qIds,
            totalPoints: totalPoints || toSave.length * 5,
            createdBy: userRole
          },
          activeQuestions
        );
      }

      await clearBulkImportDraftSession(bank.id);
      onSaved({
        ...result,
        publishedAssessment,
        publishMode
      });
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
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-0 sm:p-3 overflow-hidden"
      dir="rtl"
    >
      <div className="bg-slate-900 border-0 sm:border sm:border-slate-800 sm:rounded-2xl w-full max-w-5xl h-[100dvh] sm:h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Ultra-Compact Single-Row Top Header (Saves >150px on mobile) */}
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-white truncate">
              استيراد وإعداد الأسئلة — {bank.titleArabic}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border shrink-0 ${
                isOnline
                  ? 'bg-emerald-950/80 border-emerald-700/70 text-emerald-300'
                  : 'bg-amber-950/80 border-amber-700/70 text-amber-300'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'متصل' : 'أوفلاين'}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Compact Step Toggle */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setStep('input')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  step === 'input'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                1. النص
              </button>
              <button
                type="button"
                onClick={() => {
                  if (drafts.length > 0) setStep('review');
                  else handleParseInput();
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  step === 'review'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                2. المراجعة ({drafts.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Single-line dismissible feedback alert (only when active) */}
        {feedback && (
          <div
            className={`px-3 py-2 text-[11px] font-semibold flex items-center justify-between gap-2 border-b shrink-0 ${
              feedback.type === 'error'
                ? 'bg-rose-950/90 border-rose-800 text-rose-200'
                : feedback.type === 'info'
                ? 'bg-sky-950/90 border-sky-800 text-sky-200'
                : 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {feedback.type === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              )}
              <span className="truncate">{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-white p-0.5 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* MAIN SCROLLABLE VIEWPORT (Takes >80% of mobile screen height) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 overscroll-contain">
          {step === 'input' ? (
            <div className="space-y-3">
              {/* Compact Action Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <div className="flex flex-wrap items-center gap-1.5">
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
                    className="px-3 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع ملف (TXT / CSV / JSON)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRawInput(SAMPLE_BULK_TEXT_TEMPLATE);
                      setSourceFormat('text');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>إدراج نموذج جاهز</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(UMED_AI_UNIVERSAL_PROMPT_ARABIC);
                        setFeedback({
                          type: 'success',
                          text: 'تم نسخ تعليمات الذكاء الاصطناعي الدائمة (AI Prompt) — الصقها في ChatGPT أو Gemini أو Claude مع ملف أسئلتك ✓'
                        });
                      } catch {}
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-200 text-[11px] font-bold flex items-center gap-1 transition-colors"
                    title="انسخ هذه التعليمات وأرسلها لأي برنامج ذكاء اصطناعي لتجهيز الأسئلة بصيغة UMED القياسية"
                  >
                    <Copy className="w-3.5 h-3.5 text-indigo-400" />
                    <span>نسخ تعليمات الذكاء الاصطناعي (AI Prompt)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFormatOptions(!showFormatOptions)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] flex items-center gap-1"
                  >
                    <span>خيارات التنسيق والقوالب</span>
                    {showFormatOptions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {(rawInput.trim() || drafts.length > 0) && (
                  <button
                    type="button"
                    onClick={handleClearSession}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/70 text-rose-300 text-[11px] font-semibold flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>مسح</span>
                  </button>
                )}
              </div>

              {/* Collapsible Format & Template Options (Hidden by default to keep screen clean) */}
              {showFormatOptions && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">تنسيق القراءة:</label>
                    <select
                      value={sourceFormat}
                      onChange={(e) => setSourceFormat(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                    >
                      <option value="auto">اكتشاف تلقائي ذكي</option>
                      <option value="text">نص مرقم (TXT)</option>
                      <option value="csv">جدول (CSV / TSV)</option>
                      <option value="json">ملف (JSON)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">النقاط الافتراضية لكل سؤال:</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={defaultPoints}
                      onChange={(e) => setDefaultPoints(Number(e.target.value) || 5)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-teal-300 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">تحميل قالب فارغ:</label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDownloadTemplate('txt')}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-[11px] flex items-center justify-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>قالب TXT</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadTemplate('csv')}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-[11px] flex items-center justify-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>قالب CSV</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Spacious Textarea Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-semibold">
                    الصق الأسئلة مع خياراتها (ضع علامة <code className="text-teal-300">*</code> بجوار الإجابة الصحيحة أو سطر <code className="text-teal-300">الإجابة: ب</code>):
                  </span>
                  <span className="text-slate-500 font-mono">{rawInput.length} حرف</span>
                </div>
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={`مثال:\n1. ما هو الصمام القلبي الفاصل بين البطين الأيسر والشريان الأبهر؟\nأ) الصمام التاجي\nب) الصمام الأبهري *\nج) الصمام ثلاثي الشرف\nد) الصمام الرئوي`}
                  className="w-full min-h-[260px] sm:min-h-[340px] p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white leading-relaxed focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
          ) : (
            /* STEP 2: STREAMLINED, HIGH-VISIBILITY REVIEW & EDIT SCREEN */
            <div className="space-y-3">
              {/* Compact Single-Row Filter & Quick Actions Bar */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border ${
                      filter === 'all'
                        ? 'bg-teal-600 text-white border-teal-500'
                        : 'bg-slate-900 text-slate-300 border-slate-800'
                    }`}
                  >
                    الكل ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter('valid')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border ${
                      filter === 'valid'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-900 text-emerald-400 border-slate-800'
                    }`}
                  >
                    جاهزة ({stats.valid})
                  </button>
                  {stats.withErrors > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter('errors')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border ${
                        filter === 'errors'
                          ? 'bg-rose-600 text-white border-rose-500'
                          : 'bg-slate-900 text-rose-400 border-slate-800'
                      }`}
                    >
                      تحتاج مراجعة ({stats.withErrors})
                    </button>
                  )}
                  {stats.duplicates > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilter('duplicates')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border ${
                        filter === 'duplicates'
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-slate-900 text-amber-400 border-slate-800'
                      }`}
                    >
                      مكررة ({stats.duplicates})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="relative flex-1 sm:w-44">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="بحث في الأسئلة..."
                      className="w-full pr-7 pl-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddBlankDraft}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-teal-300 font-bold flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ سؤال</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateBulkAiExplanations}
                    disabled={bulkAiLoading || stats.selectedValid === 0}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/70 disabled:opacity-40 text-indigo-200 text-[11px] font-bold flex items-center gap-1 shrink-0"
                    title="توليد تعليل طبي للأسئلة المحددة دون المساس بالإجابة الصحيحة"
                  >
                    {bulkAiLoading ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-indigo-300" />
                    )}
                    <span>تعليل تلقائي للكل</span>
                  </button>
                </div>
              </div>

              {/* Clean, Compact Question Cards */}
              <div className="space-y-3">
                {filteredDrafts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-xl">
                    لا توجد أسئلة مطابقة للفلتر المحدد.
                  </div>
                ) : (
                  filteredDrafts.map((draft, idx) => {
                    const isAiBusy = Boolean(aiLoadingIds[draft.tempId]);
                    const hasErrors = draft.issues.some((i) => i.severity === 'error');
                    const isExpanded = Boolean(expandedCards[draft.tempId]);
                    const correctLetter = draft.correctOptionId
                      ? ['أ', 'ب', 'ج', 'د'][
                          ['opt-a', 'opt-b', 'opt-c', 'opt-d'].indexOf(draft.correctOptionId)
                        ] || draft.correctOptionId
                      : null;

                    return (
                      <div
                        key={draft.tempId}
                        className={`p-3 rounded-xl border transition-all space-y-2.5 ${
                          hasErrors
                            ? 'bg-rose-950/20 border-rose-800/80'
                            : draft.isDuplicateInBank || draft.isDuplicateInBatch
                            ? 'bg-amber-950/15 border-amber-800/70'
                            : draft.selectedForImport
                            ? 'bg-slate-950 border-slate-800'
                            : 'bg-slate-950/40 border-slate-800/50 opacity-70'
                        }`}
                      >
                        {/* Compact Card Header Row */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
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
                              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[10px] font-bold">
                                جاهز ✓ (الإجابة: {correctLetter})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-700 text-rose-200 text-[10px] font-bold">
                                {!draft.correctOptionId ? 'اختر الإجابة الصحيحة بالضغط على الحرف' : 'أكمل نص السؤال والخيارات'}
                              </span>
                            )}

                            {(draft.isDuplicateInBank || draft.isDuplicateInBatch) && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700 text-amber-300 text-[10px] flex items-center gap-1">
                                <Copy className="w-2.5 h-2.5" />
                                <span>{draft.isDuplicateInBank ? 'سيُحدّث بالبنك' : 'مكرر'}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleExpandCard(draft.tempId)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 border transition-colors ${
                                isExpanded || draft.explanationArabic
                                  ? 'bg-indigo-950/70 border-indigo-700/60 text-indigo-200'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              <span>{draft.explanationArabic ? 'التعليل ✓' : 'التعليل / النقاط'}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(draft.tempId)}
                              className="p-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/70 text-rose-400 transition-colors"
                              title="حذف السؤال"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Validation Errors (only if any) */}
                        {draft.issues.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {draft.issues.map((issue, iIdx) => (
                              <span
                                key={iIdx}
                                className={`px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${
                                  issue.severity === 'error'
                                    ? 'bg-rose-950/80 text-rose-200 border border-rose-800'
                                    : 'bg-amber-950/70 text-amber-200 border border-amber-800'
                                }`}
                              >
                                <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                <span>{issue.messageArabic}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Question Stem Input */}
                        <textarea
                          value={draft.stemArabic}
                          onChange={(e) =>
                            updateDraftItem(draft.tempId, (d) => ({
                              ...d,
                              stemArabic: e.target.value
                            }))
                          }
                          rows={2}
                          placeholder="نص السؤال الطبي..."
                          className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-semibold focus:outline-none focus:border-teal-500"
                        />

                        {/* 4 Options in Clean Compact Grid (Tap letter button to mark correct) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {draft.options.map((opt, oIdx) => {
                            const isCorrect = draft.correctOptionId === opt.id;
                            const letterArabic = ['أ', 'ب', 'ج', 'د'][oIdx] || opt.id;
                            return (
                              <div
                                key={opt.id}
                                className={`flex items-center gap-1.5 p-1.5 rounded-lg border transition-all ${
                                  isCorrect
                                    ? 'bg-teal-950/60 border-teal-500'
                                    : 'bg-slate-900/90 border-slate-800'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateDraftItem(draft.tempId, (d) => ({
                                      ...d,
                                      correctOptionId: opt.id
                                    }))
                                  }
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold shrink-0 transition-colors ${
                                    isCorrect
                                      ? 'bg-teal-600 text-white shadow'
                                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                  }`}
                                  title="اضغط لاعتماد هذا الخيار كإجابة صحيحة"
                                >
                                  {isCorrect ? `✓ ${letterArabic}` : letterArabic}
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
                                  placeholder={`الخيار (${letterArabic})...`}
                                  className="flex-1 min-w-0 bg-transparent text-xs text-white focus:outline-none px-1"
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* Collapsible Secondary Settings Drawer (Explanation, AI helper, Points, English stem) */}
                        {isExpanded && (
                          <div className="pt-2 mt-2 border-t border-slate-800/90 space-y-2.5 bg-slate-900/40 p-2.5 rounded-lg">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-300 font-semibold">
                                التعليل العلمي للإجابة (اختياري):
                              </span>
                              <div className="flex items-center gap-1.5">
                                {Boolean(draft.aiGeneratedExplanation) && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevertAiExplanation(draft.tempId)}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-semibold flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>استعادة الأصلي</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleGenerateSingleAiExplanation(draft)}
                                  disabled={isAiBusy || !draft.correctOptionId}
                                  className="px-2.5 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/70 disabled:opacity-40 text-indigo-200 text-[10px] font-bold flex items-center gap-1"
                                >
                                  {isAiBusy ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-3 h-3 text-indigo-300" />
                                  )}
                                  <span>{isAiBusy ? 'جاري التوليد...' : 'توليد تعليل طبي تلقائي'}</span>
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
                              placeholder="شرح سبب صحة الإجابة المختارة..."
                              className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500"
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="sm:col-span-2">
                                <label className="text-[10px] text-slate-400 block mb-0.5">
                                  النص الإنجليزي المرافق (اختياري):
                                </label>
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={draft.stemEnglish || ''}
                                  onChange={(e) =>
                                    updateDraftItem(draft.tempId, (d) => ({
                                      ...d,
                                      stemEnglish: e.target.value
                                    }))
                                  }
                                  placeholder="Optional English stem..."
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-400 block mb-0.5">
                                  درجة السؤال:
                                </label>
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
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-teal-300 font-mono font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* COMPACT BOTTOM FOOTER WITH STRICT SINGLE-MODE PUBLISH SELECTOR */}
        <div className="p-2.5 sm:p-3.5 bg-slate-950 border-t border-slate-800 space-y-2 shrink-0">
          {step === 'input' ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={handleParseInput}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تحليل وعرض الأسئلة للمراجعة</span>
              </button>
            </div>
          ) : (
            <>
              {/* Strict Single-Mode Approval Choice: Bank Only vs Exam Only vs Competition Only */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleSelectPublishMode('bank_only')}
                    className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      publishMode === 'bank_only'
                        ? 'bg-slate-700 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">بنك الأسئلة فقط</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPublishMode('exam_only')}
                    className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      publishMode === 'exam_only'
                        ? 'bg-teal-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">نشر كاختبار فقط</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPublishMode('competition_only')}
                    className={`py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1 transition-all ${
                      publishMode === 'competition_only'
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Trophy className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">نشر كمسابقة فقط</span>
                  </button>
                </div>

                {/* Inline Settings when publishing strictly as Exam Only or Competition Only */}
                {publishMode !== 'bank_only' && (
                  <div className="flex flex-wrap items-center gap-1.5 flex-1">
                    <input
                      type="text"
                      value={publishTitle}
                      onChange={(e) => setPublishTitle(e.target.value)}
                      placeholder={publishMode === 'competition_only' ? 'عنوان المسابقة الطبية...' : 'عنوان الاختبار الأكاديمي...'}
                      className="flex-1 min-w-[130px] px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-teal-500"
                    />
                    <select
                      value={publishStudyLevelId}
                      onChange={(e) => setPublishStudyLevelId(e.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-teal-300 font-bold"
                    >
                      {studyLevels.map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.titleArabic}
                        </option>
                      ))}
                    </select>
                    <select
                      value={publishDurationMinutes}
                      onChange={(e) => setPublishDurationMinutes(Number(e.target.value))}
                      className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-amber-300 font-bold"
                      title="مؤقت الاختبار كاملاً"
                    >
                      <option value={0}>مؤقت كلي: مفتوح</option>
                      <option value={10}>مؤقت: 10 دقائق</option>
                      <option value={15}>مؤقت: 15 دقيقة</option>
                      <option value={30}>مؤقت: 30 دقيقة</option>
                      <option value={45}>مؤقت: 45 دقيقة</option>
                      <option value={60}>مؤقت: 60 دقيقة</option>
                    </select>
                    <select
                      value={publishQuestionSeconds}
                      onChange={(e) => setPublishQuestionSeconds(Number(e.target.value))}
                      className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-indigo-300 font-bold"
                      title="مؤقت اختياري لكل سؤال"
                    >
                      <option value={0}>سؤال: بدون مؤقت</option>
                      <option value={30}>30ث / سؤال</option>
                      <option value={45}>45ث / سؤال</option>
                      <option value={60}>60ث / سؤال</option>
                      <option value={90}>90ث / سؤال</option>
                    </select>
                    <select
                      value={publishAvailabilityHours}
                      onChange={(e) => setPublishAvailabilityHours(Number(e.target.value))}
                      className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-emerald-300 font-bold"
                      title="مدة توفر الاختبار قبل الإغلاق"
                    >
                      <option value={24}>متاح: 24 ساعة</option>
                      <option value={72}>متاح: 3 أيام</option>
                      <option value={168}>متاح: 7 أيام</option>
                      <option value={720}>متاح: 30 يوماً</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Final Action Row */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold shrink-0"
                >
                  رجوع للنص
                </button>

                <button
                  type="button"
                  onClick={handleSaveSelected}
                  disabled={saving || stats.selectedValid === 0}
                  className={`flex-1 py-2.5 px-4 rounded-xl disabled:opacity-40 text-white text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-colors ${
                    publishMode === 'competition_only'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-teal-600 hover:bg-teal-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {saving
                      ? 'جاري الاعتماد والحفظ...'
                      : publishMode === 'exam_only'
                      ? `موافقة ونشر كاختبار أكاديمي فقط (${stats.selectedValid} سؤال)`
                      : publishMode === 'competition_only'
                      ? `موافقة ونشر كمسابقة طبية فقط (${stats.selectedValid} سؤال)`
                      : `اعتماد وحفظ في بنك الأسئلة فقط (${stats.selectedValid} سؤال)`}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
