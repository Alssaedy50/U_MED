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
  BookOpen,
  Globe,
  Wand2
} from 'lucide-react';
import {
  QuestionBank,
  QuestionItemFull,
  ParsedQuestionDraft,
  BulkImportDraftSession,
  Assessment,
  StudyLevel,
  StudyPeriod,
  DAR_AL_SALAM_SEED,
  QuestionOption,
  QuestionType,
  BankQuestionTypeMode,
  AssessmentLanguage,
  DetectedAssessmentMetadata
} from '../../types/umed.ts';
import {
  parseBulkQuestionsInput,
  validateAndAnnotateDrafts,
  getSampleTemplateByLanguage,
  SAMPLE_BULK_CSV_TEMPLATE,
  buildProfessionalAiPrompt,
  synchronizeExamTimers
} from '../../services/mcqBulkParser.ts';
import {
  saveBulkImportDraftSession,
  loadBulkImportDraftSession,
  clearBulkImportDraftSession,
  requestOptionalAiExplanations,
  requestDirectAiSmartExamGeneration
} from '../../services/questionImportSyncService.ts';
import { bulkSaveQuestions, createAssessment, updateQuestionBank } from '../../services/assessmentService.ts';
import {
  getUserAcademicContext,
  saveUserAcademicContext,
  inferAcademicContextFromText,
  fetchActiveStudyPeriods
} from '../../services/academicService.ts';

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
  defaultStudyLevelId,
  onClose,
  onSaved
}: BulkQuestionImportModalProps) {
  // Resolve initial academic context from user's saved context + bank metadata + text inference
  const initialAcademicResolution = useMemo(() => {
    const userCtx = getUserAcademicContext();
    const inferredFromBank = inferAcademicContextFromText(
      `${bank.titleArabic || ''} ${bank.titleEnglish || ''} ${bank.blockName || ''}`
    );
    const resolvedLevelId =
      inferredFromBank.studyLevelId ||
      (bank.studyLevelId && bank.studyLevelId !== 'lvl-4' ? bank.studyLevelId : undefined) ||
      defaultStudyLevelId ||
      userCtx.studyLevelId ||
      bank.studyLevelId ||
      'lvl-2';
    const resolvedBlockName =
      bank.blockName ||
      inferredFromBank.blockName ||
      userCtx.studyPeriodName ||
      bank.titleArabic ||
      '';
    return {
      userCtx,
      studyLevelId: resolvedLevelId,
      blockName: resolvedBlockName
    };
  }, [bank, defaultStudyLevelId]);

  const [step, setStep] = useState<'setup' | 'content' | 'review'>('setup');
  const [inputSource, setInputSource] = useState<'ai' | 'manual'>('ai');
  const [showAiSettingsModal, setShowAiSettingsModal] = useState<boolean>(false);
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [liveBlocks, setLiveBlocks] = useState<StudyPeriod[]>([]);
  const [examLanguage, setExamLanguage] = useState<AssessmentLanguage>(bank.language || 'ar');
  const [questionTypeMode, setQuestionTypeMode] = useState<BankQuestionTypeMode>(
    bank.questionTypeMode || 'hybrid'
  );
  const [rawInput, setRawInput] = useState<string>('');
  const [sourceFormat, setSourceFormat] = useState<'auto' | 'text' | 'csv' | 'json'>('auto');
  const [defaultPoints, setDefaultPoints] = useState<number>(5);
  const [drafts, setDrafts] = useState<ParsedQuestionDraft[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [showFormatOptions, setShowFormatOptions] = useState<boolean>(false);
  const [showAiPromptStudio, setShowAiPromptStudio] = useState<boolean>(false);
  const [showAcademicPopup, setShowAcademicPopup] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Direct Approval & Single-Mode Publishing State (Strictly Bank Only OR Exam Only OR Competition Only)
  const [publishMode, setPublishMode] = useState<ApprovalPublishMode>('bank_only');
  const [publishTitle, setPublishTitle] = useState<string>(
    bank.language === 'en' ? `Exam: ${bank.titleEnglish || bank.titleArabic}` : `اختبار ${bank.titleArabic}`
  );
  const [publishStudyLevelId, setPublishStudyLevelId] = useState<string>(
    initialAcademicResolution.studyLevelId
  );
  const [publishBlockName, setPublishBlockName] = useState<string>(
    initialAcademicResolution.blockName
  );
  const [publishDurationMinutes, setPublishDurationMinutes] = useState<number>(30);
  const [publishQuestionSeconds, setPublishQuestionSeconds] = useState<number>(45);
  const [timerDriverMode, setTimerDriverMode] = useState<'questionSeconds' | 'totalMinutes'>('questionSeconds');
  const [publishAvailabilityHours, setPublishAvailabilityHours] = useState<number>(168);
  const [detectedMeta, setDetectedMeta] = useState<DetectedAssessmentMetadata | null>(null);

  // Dynamic Live Blocks: Fetch only active, non-archived, non-deleted blocks for current level
  useEffect(() => {
    let isCurrent = true;
    fetchActiveStudyPeriods(publishStudyLevelId).then((periods) => {
      if (isCurrent) {
        setLiveBlocks(periods);
        if (periods.length > 0) {
          const match = periods.find(p => p.titleArabic === publishBlockName || p.id === bank.studyPeriodId);
          if (match) {
            setPublishBlockName(match.titleArabic);
            setAiTopic(match.titleArabic);
          } else if (!publishBlockName) {
            setPublishBlockName(periods[0].titleArabic);
            setAiTopic(periods[0].titleArabic);
          }
        }
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [publishStudyLevelId, bank.studyPeriodId]);

  // AI Smart Exam Prompt Studio Configuration
  const [aiMode, setAiMode] = useState<'generate_new' | 'format_existing'>('generate_new');
  const [aiTopic, setAiTopic] = useState<string>(
    initialAcademicResolution.blockName || bank.titleArabic || 'بلوك الدم والجهاز اللمفاوي (Hematology)'
  );
  const [aiAssessmentType, setAiAssessmentType] = useState<'exam' | 'competition'>('exam');
  // Dynamic question count by default (unbounded unless user explicitly chooses custom count)
  const [isDynamicQuestionCount, setIsDynamicQuestionCount] = useState<boolean>(true);
  const [aiMcqCount, setAiMcqCount] = useState<number>(10);
  const [aiOptionsCount, setAiOptionsCount] = useState<4 | 5>(4);
  const [aiTfCount, setAiTfCount] = useState<number>(2);
  const [aiEssayCount, setAiEssayCount] = useState<number>(1);
  const [aiFillBlankCount, setAiFillBlankCount] = useState<number>(2);
  const [aiDifficultyMix, setAiDifficultyMix] = useState<'clinical_usmle' | 'balanced' | 'foundational'>('clinical_usmle');
  const [aiIncludeOptionRationales, setAiIncludeOptionRationales] = useState<boolean>(true);
  const [directAiGenerating, setDirectAiGenerating] = useState<boolean>(false);

  // Saving & Optional AI states
  const [saving, setSaving] = useState<boolean>(false);
  const [aiLoadingIds, setAiLoadingIds] = useState<Record<string, boolean>>({});
  const [bulkAiLoading, setBulkAiLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ARABIC_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];
  const ENGLISH_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // Automatically infer study level & block if user types e.g. "بلوك دم سنة ثانية" in aiTopic or publishTitle
  useEffect(() => {
    const combinedText = `${aiTopic} ${publishTitle}`;
    const inferred = inferAcademicContextFromText(combinedText);
    if (inferred.studyLevelId && inferred.studyLevelId !== publishStudyLevelId) {
      setPublishStudyLevelId(inferred.studyLevelId);
      const matchedLvl = studyLevels.find((l) => l.id === inferred.studyLevelId);
      saveUserAcademicContext({
        studyLevelId: inferred.studyLevelId,
        studyLevelName: matchedLvl?.titleArabic,
        ...(inferred.blockId ? { studyPeriodId: inferred.blockId, studyPeriodName: inferred.blockName } : {})
      });
    }
    if (inferred.blockName && inferred.blockName !== publishBlockName) {
      setPublishBlockName(inferred.blockName);
    }
  }, [aiTopic, publishTitle]);

  const currentStudyLevelTitle = useMemo(() => {
    const found = studyLevels.find((l) => l.id === publishStudyLevelId);
    if (!found) return examLanguage === 'en' ? 'Level 2 (Second Year)' : 'المستوى الثاني (السنة الثانية)';
    return examLanguage === 'en' ? (found.titleEnglish || found.titleArabic) : found.titleArabic;
  }, [studyLevels, publishStudyLevelId, examLanguage]);

  const blocksForCurrentLevel = useMemo(() => {
    return liveBlocks;
  }, [liveBlocks]);

  const generatedAiPrompt = useMemo(() => {
    const ctx = getUserAcademicContext();
    return buildProfessionalAiPrompt({
      mode: aiMode,
      language: examLanguage,
      assessmentType: aiAssessmentType,
      questionTypeMode,
      isDynamicQuestionCount,
      title: publishTitle,
      topic: aiTopic || publishBlockName || bank.titleArabic,
      universityName: ctx.universityName || DAR_AL_SALAM_SEED.university.nameArabic,
      collegeName: ctx.collegeName || DAR_AL_SALAM_SEED.college.nameArabic,
      programName: ctx.programName || DAR_AL_SALAM_SEED.program.nameArabic,
      studyLevelName: currentStudyLevelTitle,
      blockName: publishBlockName || aiTopic || bank.titleArabic,
      durationMinutes: publishDurationMinutes || 30,
      questionDurationSeconds: publishQuestionSeconds || 45,
      mcqCount: aiMcqCount,
      optionsCount: aiOptionsCount,
      trueFalseCount: aiTfCount,
      essayCount: aiEssayCount,
      fillBlankCount: aiFillBlankCount,
      difficultyMix: aiDifficultyMix,
      includeOptionRationales: aiIncludeOptionRationales
    });
  }, [
    aiMode,
    examLanguage,
    aiAssessmentType,
    questionTypeMode,
    isDynamicQuestionCount,
    publishTitle,
    aiTopic,
    publishBlockName,
    bank.titleArabic,
    currentStudyLevelTitle,
    publishDurationMinutes,
    publishQuestionSeconds,
    aiMcqCount,
    aiOptionsCount,
    aiTfCount,
    aiEssayCount,
    aiFillBlankCount,
    aiDifficultyMix,
    aiIncludeOptionRationales
  ]);

  // Effective question count for bidirectional timer math
  const effectiveQuestionsCountForTimer = useMemo(() => {
    const selectedValidCount = drafts.filter((d) => d.selectedForImport && d.isValid).length;
    if (selectedValidCount > 0) return selectedValidCount;
    if (drafts.length > 0) return drafts.length;
    if (!isDynamicQuestionCount) {
      const manualSum =
        (questionTypeMode === 'mcq' ? aiMcqCount : 0) +
        (questionTypeMode === 'true_false' ? aiTfCount : 0) +
        (questionTypeMode === 'essay' ? aiEssayCount : 0) +
        (questionTypeMode === 'fill_blank' ? aiFillBlankCount : 0) +
        (questionTypeMode === 'hybrid' ? aiMcqCount + aiTfCount + aiEssayCount + aiFillBlankCount : 0);
      if (manualSum > 0) return manualSum;
    }
    return 20;
  }, [drafts, isDynamicQuestionCount, questionTypeMode, aiMcqCount, aiTfCount, aiEssayCount, aiFillBlankCount]);

  // Bidirectional handler: when user sets per-question time (seconds) -> auto-calculate total exam time (minutes)
  const handleQuestionSecondsChange = (newSeconds: number) => {
    const cleanSec = Math.max(0, Math.round(Number(newSeconds) || 0));
    setTimerDriverMode('questionSeconds');
    setPublishQuestionSeconds(cleanSec);
    if (cleanSec > 0) {
      const synced = synchronizeExamTimers({
        questionsCount: effectiveQuestionsCountForTimer,
        durationMinutes: publishDurationMinutes,
        questionDurationSeconds: cleanSec,
        changedField: 'questionSeconds'
      });
      setPublishDurationMinutes(synced.durationMinutes);
    }
  };

  // Bidirectional handler: when user sets total exam time (minutes) -> auto-divide by question count to get per-question time (seconds)
  const handleDurationMinutesChange = (newMinutes: number) => {
    const cleanMin = Math.max(0, Math.round(Number(newMinutes) || 0));
    setTimerDriverMode('totalMinutes');
    setPublishDurationMinutes(cleanMin);
    if (cleanMin > 0) {
      const synced = synchronizeExamTimers({
        questionsCount: effectiveQuestionsCountForTimer,
        durationMinutes: cleanMin,
        questionDurationSeconds: publishQuestionSeconds,
        changedField: 'totalMinutes'
      });
      setPublishQuestionSeconds(synced.questionDurationSeconds);
    } else {
      setPublishQuestionSeconds(0);
    }
  };

  // Keep timers synchronized whenever the parsed/selected question count changes (e.g. 111 questions imported)
  useEffect(() => {
    if (effectiveQuestionsCountForTimer <= 0) return;
    const synced = synchronizeExamTimers({
      questionsCount: effectiveQuestionsCountForTimer,
      durationMinutes: publishDurationMinutes,
      questionDurationSeconds: publishQuestionSeconds,
      changedField: 'questionsCount',
      preferredDriver: timerDriverMode
    });
    if (synced.durationMinutes !== publishDurationMinutes) {
      setPublishDurationMinutes(synced.durationMinutes);
    }
    if (synced.questionDurationSeconds !== publishQuestionSeconds) {
      setPublishQuestionSeconds(synced.questionDurationSeconds);
    }
  }, [effectiveQuestionsCountForTimer]);

  // Update default title & duration when switching between Exam Only and Competition Only
  const handleSelectPublishMode = (mode: ApprovalPublishMode) => {
    setPublishMode(mode);
    if (mode === 'exam_only') {
      setPublishTitle((prev) =>
        !prev.trim() || prev.startsWith('مسابقة ') || prev.startsWith('Competition:')
          ? examLanguage === 'en'
            ? `Exam: ${bank.titleEnglish || bank.titleArabic}`
            : `اختبار ${bank.titleArabic}`
          : prev
      );
      const sec = publishQuestionSeconds > 0 ? publishQuestionSeconds : 45;
      const synced = synchronizeExamTimers({
        questionsCount: effectiveQuestionsCountForTimer,
        durationMinutes: 30,
        questionDurationSeconds: sec,
        changedField: 'questionSeconds'
      });
      setPublishQuestionSeconds(synced.questionDurationSeconds);
      setPublishDurationMinutes(synced.durationMinutes);
    } else if (mode === 'competition_only') {
      setPublishTitle((prev) =>
        !prev.trim() || prev.startsWith('اختبار ') || prev.startsWith('Exam:')
          ? examLanguage === 'en'
            ? `Competition: ${bank.titleEnglish || bank.titleArabic}`
            : `مسابقة ${bank.titleArabic}`
          : prev
      );
      const sec = publishQuestionSeconds > 0 ? publishQuestionSeconds : 30;
      const synced = synchronizeExamTimers({
        questionsCount: effectiveQuestionsCountForTimer,
        durationMinutes: 15,
        questionDurationSeconds: sec,
        changedField: 'questionSeconds'
      });
      setPublishQuestionSeconds(synced.questionDurationSeconds);
      setPublishDurationMinutes(synced.durationMinutes);
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
        if (saved.language) setExamLanguage(saved.language);
        setRawInput(saved.rawInputText || saved.rawInput || '');
        setSourceFormat((saved.sourceFormat as any) || 'auto');
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
      language: examLanguage,
      rawInputText: rawInput,
      sourceFormat: sourceFormat === 'auto' ? 'text' : sourceFormat,
      defaultPoints,
      draftQuestions: drafts,
      updatedAt: nowIso
    };
    saveBulkImportDraftSession(session).catch(() => {});
  }, [bank.id, bank.universityId, examLanguage, rawInput, sourceFormat, defaultPoints, drafts]);

  const toggleExpandCard = (tempId: string) => {
    setExpandedCards((prev) => ({ ...prev, [tempId]: !prev[tempId] }));
  };

  const handleParseInput = (overrideRawText?: string) => {
    setFeedback(null);
    const inputToParse = overrideRawText !== undefined ? overrideRawText : rawInput;
    if (!inputToParse.trim()) {
      setFeedback({
        type: 'error',
        text: 'يرجى لصق نص الأسئلة أو رفع ملف (TXT / CSV / JSON) أو استخدام التوليد الذكي أولاً.'
      });
      return;
    }

    const { drafts: parsed, detectedMetadata } = parseBulkQuestionsInput({
      rawInput: inputToParse,
      formatHint: sourceFormat,
      languageHint: examLanguage,
      bankId: bank.id,
      defaultPoints,
      existingBankQuestions: existingQuestions
    });

    if (parsed.length === 0) {
      setFeedback({
        type: 'error',
        text: 'لم يتم العثور على أسئلة صالحة في النص. تأكد من إدخال الأسئلة بأي نوع (خيارات متعددة، صح وخطأ، أو أسئلة مقالية).'
      });
      return;
    }

    setDrafts(parsed);
    setDetectedMeta(detectedMetadata || null);
    if (detectedMetadata) {
      if (detectedMetadata.language) {
        setExamLanguage(detectedMetadata.language);
      }
      if (detectedMetadata.titleArabic) {
        setPublishTitle(detectedMetadata.titleArabic);
      }
      if (detectedMetadata.assessmentType) {
        setPublishMode(detectedMetadata.assessmentType === 'competition' ? 'competition_only' : 'exam_only');
      }
      if (detectedMetadata.studyLevelId) {
        setPublishStudyLevelId(detectedMetadata.studyLevelId);
      }
      const validCount = parsed.filter((d) => d.isValid).length || parsed.length;
      if (detectedMetadata.questionDurationSeconds && detectedMetadata.questionDurationSeconds > 0) {
        setTimerDriverMode('questionSeconds');
        setPublishQuestionSeconds(detectedMetadata.questionDurationSeconds);
        const synced = synchronizeExamTimers({
          questionsCount: validCount,
          durationMinutes: detectedMetadata.durationMinutes || publishDurationMinutes,
          questionDurationSeconds: detectedMetadata.questionDurationSeconds,
          changedField: 'questionSeconds'
        });
        setPublishDurationMinutes(synced.durationMinutes);
      } else if (detectedMetadata.durationMinutes && detectedMetadata.durationMinutes > 0) {
        setTimerDriverMode('totalMinutes');
        setPublishDurationMinutes(detectedMetadata.durationMinutes);
        const synced = synchronizeExamTimers({
          questionsCount: validCount,
          durationMinutes: detectedMetadata.durationMinutes,
          questionDurationSeconds: publishQuestionSeconds,
          changedField: 'totalMinutes'
        });
        setPublishQuestionSeconds(synced.questionDurationSeconds);
      } else {
        // Synchronize current timer state with the newly parsed question count (e.g. 111 questions)
        const synced = synchronizeExamTimers({
          questionsCount: validCount,
          durationMinutes: publishDurationMinutes,
          questionDurationSeconds: publishQuestionSeconds,
          changedField: 'questionsCount',
          preferredDriver: timerDriverMode
        });
        setPublishDurationMinutes(synced.durationMinutes);
        setPublishQuestionSeconds(synced.questionDurationSeconds);
      }
    }

    setStep('review');
    setFilter('all');
    const langBadge =
      (detectedMetadata?.language || examLanguage) === 'en'
        ? ' [English]'
        : (detectedMetadata?.language || examLanguage) === 'bilingual'
        ? ' [ثنائي اللغة]'
        : ' [عربي]';
    const extraInfo = detectedMetadata?.titleArabic ? ` (الترويسة: "${detectedMetadata.titleArabic}")` : '';
    setFeedback({
      type: 'success',
      text: `تم استخراج وتنظيم ${parsed.length} سؤال بنجاح${langBadge}${extraInfo}. راجع الإجابات واعتمد الحفظ.`
    });
  };

  const handleDirectAiGenerateExam = async () => {
    setDirectAiGenerating(true);
    setFeedback(null);
    try {
      const ctx = getUserAcademicContext();
      const res = await requestDirectAiSmartExamGeneration({
        mode: aiMode,
        language: examLanguage,
        assessmentType: aiAssessmentType,
        questionTypeMode,
        isDynamicQuestionCount,
        title: publishTitle,
        topic: aiTopic || publishBlockName || bank.titleArabic,
        universityName: ctx.universityName || DAR_AL_SALAM_SEED.university.nameArabic,
        collegeName: ctx.collegeName || DAR_AL_SALAM_SEED.college.nameArabic,
        programName: ctx.programName || DAR_AL_SALAM_SEED.program.nameArabic,
        studyLevelName: currentStudyLevelTitle,
        blockName: publishBlockName || aiTopic || bank.titleArabic,
        durationMinutes: publishDurationMinutes || 30,
        questionDurationSeconds: publishQuestionSeconds || 45,
        mcqCount: aiMcqCount,
        optionsCount: aiOptionsCount,
        trueFalseCount: aiTfCount,
        essayCount: aiEssayCount,
        fillBlankCount: aiFillBlankCount,
        difficultyMix: aiDifficultyMix,
        includeOptionRationales: aiIncludeOptionRationales,
        rawContentToConvert: aiMode === 'format_existing' ? rawInput : undefined
      });
      setRawInput(res.formattedText);
      setSourceFormat('text');
      setShowAiPromptStudio(false);
      handleParseInput(res.formattedText);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.message || 'تعذر التوليد المباشر حالياً، يمكنك نسخ طلب التوليد ولصقه في ChatGPT أو Gemini.'
      });
    } finally {
      setDirectAiGenerating(false);
    }
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

      const { drafts: parsed, detectedMetadata } = parseBulkQuestionsInput({
        rawInput: text,
        formatHint: detectedFormat,
        languageHint: examLanguage,
        fileName: file.name,
        bankId: bank.id,
        defaultPoints,
        existingBankQuestions: existingQuestions
      });
      if (parsed.length > 0) {
        setDrafts(parsed);
        setDetectedMeta(detectedMetadata || null);
        if (detectedMetadata) {
          if (detectedMetadata.language) {
            setExamLanguage(detectedMetadata.language);
          }
          if (detectedMetadata.titleArabic) {
            setPublishTitle(detectedMetadata.titleArabic);
          }
          if (detectedMetadata.assessmentType) {
            setPublishMode(detectedMetadata.assessmentType === 'competition' ? 'competition_only' : 'exam_only');
          }
          if (detectedMetadata.studyLevelId) {
            setPublishStudyLevelId(detectedMetadata.studyLevelId);
          }
          if (detectedMetadata.durationMinutes && detectedMetadata.durationMinutes > 0) {
            setPublishDurationMinutes(detectedMetadata.durationMinutes);
          }
          if (detectedMetadata.questionDurationSeconds && detectedMetadata.questionDurationSeconds > 0) {
            setPublishQuestionSeconds(detectedMetadata.questionDurationSeconds);
          }
        }
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
    const content = kind === 'csv' ? '\uFEFF' + SAMPLE_BULK_CSV_TEMPLATE : getSampleTemplateByLanguage(examLanguage);
    const mime = kind === 'csv' ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'csv' ? 'umed_mcq_bulk_template.csv' : `umed_exam_template_${examLanguage}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearSession = async () => {
    await clearBulkImportDraftSession(bank.id);
    setRawInput('');
    setDrafts([]);
    setDetectedMeta(null);
    setStep('setup');
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

  const handleChangeQuestionType = (tempId: string, newType: QuestionType) => {
    updateDraftItem(tempId, (d) => {
      const qLang = d.language || examLanguage;
      if (newType === 'true_false') {
        const tfOpts = [
          {
            id: 'opt-a',
            textArabic: qLang === 'en' ? 'True' : qLang === 'bilingual' ? 'صح / True' : 'صح (صواب)',
            textEnglish: 'True',
            explanationArabic: ''
          },
          {
            id: 'opt-b',
            textArabic: qLang === 'en' ? 'False' : qLang === 'bilingual' ? 'خطأ / False' : 'خطأ',
            textEnglish: 'False',
            explanationArabic: ''
          }
        ];
        return {
          ...d,
          questionType: 'true_false',
          options: tfOpts,
          correctOptionId: d.correctOptionId === 'opt-b' ? 'opt-b' : 'opt-a'
        };
      }
      if (newType === 'essay') {
        return {
          ...d,
          questionType: 'essay',
          options: [],
          correctOptionId: 'essay-answer',
          modelAnswerArabic: d.modelAnswerArabic || ''
        };
      }
      if (newType === 'fill_blank') {
        return {
          ...d,
          questionType: 'fill_blank',
          options: [],
          correctOptionId: 'fill-blank-answer',
          modelAnswerArabic: d.modelAnswerArabic || ''
        };
      }
      // mcq
      const currentOpts = d.options && d.options.length >= 2 ? d.options : [
        { id: 'opt-a', textArabic: '', explanationArabic: '' },
        { id: 'opt-b', textArabic: '', explanationArabic: '' },
        { id: 'opt-c', textArabic: '', explanationArabic: '' },
        { id: 'opt-d', textArabic: '', explanationArabic: '' }
      ];
      return {
        ...d,
        questionType: 'mcq',
        options: currentOpts,
        correctOptionId:
          d.correctOptionId && d.correctOptionId !== 'essay-answer' && d.correctOptionId !== 'fill-blank-answer'
            ? d.correctOptionId
            : (currentOpts[0]?.id || 'opt-a')
      };
    });
  };

  const handleAddOption = (tempId: string) => {
    updateDraftItem(tempId, (d) => {
      if (d.options.length >= 8) return d;
      const nextIdx = d.options.length;
      const optId = `opt-${String.fromCharCode(97 + nextIdx)}`;
      return {
        ...d,
        options: [
          ...d.options,
          { id: optId, textArabic: '', explanationArabic: '' }
        ]
      };
    });
  };

  const handleRemoveOption = (tempId: string, optId: string) => {
    updateDraftItem(tempId, (d) => {
      if (d.options.length <= 2) return d;
      const filtered = d.options.filter((o) => o.id !== optId);
      const correctId = d.correctOptionId === optId ? (filtered[0]?.id || 'opt-a') : d.correctOptionId;
      return {
        ...d,
        options: filtered,
        correctOptionId: correctId
      };
    });
  };

  const handleAddBlankDraft = () => {
    const tempId = `draft-manual-${Date.now()}`;
    const newDraft: ParsedQuestionDraft = {
      tempId,
      deterministicId: `q-${bank.id}-manual-${Date.now()}`,
      sourceIndex: drafts.length + 1,
      questionType: 'mcq',
      language: examLanguage,
      stemArabic: '',
      stemEnglish: '',
      options: [
        { id: 'opt-a', textArabic: '', explanationArabic: '' },
        { id: 'opt-b', textArabic: '', explanationArabic: '' },
        { id: 'opt-c', textArabic: '', explanationArabic: '' },
        { id: 'opt-d', textArabic: '', explanationArabic: '' }
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
        const inOpts = (d.options || []).some((o: QuestionOption) => o.textArabic.toLowerCase().includes(q));
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
      // 1. Update bank metadata (language, questionTypeMode, studyLevelId, blockName) if changed, and save imported questions
      if (
        bank.language !== examLanguage ||
        bank.questionTypeMode !== questionTypeMode ||
        bank.studyLevelId !== publishStudyLevelId ||
        bank.blockName !== publishBlockName
      ) {
        updateQuestionBank(bank.id, {
          language: examLanguage,
          questionTypeMode,
          studyLevelId: publishStudyLevelId,
          blockName: publishBlockName
        }).catch(() => {});
      }
      const draftsWithLang = toSave.map((d) => ({ ...d, language: d.language || examLanguage }));
      const result = await bulkSaveQuestions(bank.id, draftsWithLang, userRole);

      // 2. If user chose to publish strictly as Exam ONLY or Competition ONLY, create that single assessment
      let publishedAssessment: Assessment | undefined = undefined;
      if (publishMode === 'exam_only' || publishMode === 'competition_only') {
        const strictAssessmentType = publishMode === 'competition_only' ? 'competition' : 'exam';
        const activeQuestions = result.savedQuestions.length > 0 ? result.savedQuestions : [];
        const qIds = activeQuestions.map((q: QuestionItemFull) => q.id);
        const totalPoints = activeQuestions.reduce((sum: number, q: QuestionItemFull) => sum + (Number(q.points) || 5), 0);

        const durationVal = Number(publishDurationMinutes) || 0;
        const availHours = Number(publishAvailabilityHours) || 168;

        publishedAssessment = await createAssessment(
          {
            assessmentType: strictAssessmentType,
            questionTypeMode,
            language: examLanguage,
            titleArabic: publishTitle.trim(),
            ...(examLanguage === 'en' ? { titleEnglish: publishTitle.trim() } : {}),
            descriptionArabic:
              strictAssessmentType === 'competition'
                ? `مسابقة طبية تنافسية مرتبطة ببنك ${bank.titleArabic}`
                : `اختبار أكاديمي مرتبط ببنك ${bank.titleArabic}`,
            universityId: bank.universityId || 'univ-dar-al-salam',
            programId: bank.programId || 'prog-mbbs',
            studyLevelId: publishStudyLevelId || bank.studyLevelId || defaultStudyLevelId || 'lvl-2',
            blockName: publishBlockName || bank.titleArabic,
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
            {/* 3-Step Guided Wizard Toggle */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setStep('setup')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  step === 'setup'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                1. الإعداد والمصدر
              </button>
              <button
                type="button"
                onClick={() => setStep('content')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  step === 'content'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                2. إدخال الأسئلة
              </button>
              <button
                type="button"
                onClick={() => {
                  if (drafts.length > 0) setStep('review');
                  else if (rawInput.trim()) handleParseInput();
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  step === 'review'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                3. التدقيق ({drafts.length})
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
          {/* STEP 1: SETUP & MODALITY */}
          {step === 'setup' && (
            <div className="space-y-4">
              {/* 1. Academic Target Banner with Popup Trigger */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">النطاق الأكاديمي للتقييم:</div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="text-teal-300">{currentStudyLevelTitle}</span>
                      <span>·</span>
                      <span className="text-amber-300">{publishBlockName || bank.titleArabic}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAcademicPopup(true)}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-teal-500/40 text-xs font-bold text-teal-300 flex items-center gap-1.5 transition-colors"
                >
                  <span>تغيير المستوى أو البلوك الطبي</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 2. Source Selection (AI vs Manual) */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">
                  طريقة إعداد وبناء الأسئلة:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInputSource('ai')}
                    className={`p-4 rounded-2xl border text-right transition-all flex items-start gap-3 ${
                      inputSource === 'ai'
                        ? 'bg-indigo-950/60 border-indigo-500 shadow-lg shadow-indigo-950/50'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      inputSource === 'ai' ? 'bg-indigo-500 text-white' : 'bg-slate-900 text-slate-400'
                    }`}>
                      <Wand2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white flex items-center justify-between">
                        <span>✨ التوليد بالذكاء الاصطناعي (AI Studio)</span>
                        {inputSource === 'ai' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        إنشاء موجه أمر طبي دقيق (USMLE) متوافق مع معايير الكلية ونسخه أو التوليد الفوري بنقرة واحدة.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInputSource('manual')}
                    className={`p-4 rounded-2xl border text-right transition-all flex items-start gap-3 ${
                      inputSource === 'manual'
                        ? 'bg-teal-950/60 border-teal-500 shadow-lg shadow-teal-950/50'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      inputSource === 'manual' ? 'bg-teal-500 text-white' : 'bg-slate-900 text-slate-400'
                    }`}>
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white flex items-center justify-between">
                        <span>✍️ إدخال يدوي أو رفع ملف نصي</span>
                        {inputSource === 'manual' && <CheckCircle2 className="w-4 h-4 text-teal-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        لصق نص الأسئلة الجاهزة أو استيراد ملفات CSV و Text بترميز UTF-8 مع تدقيق فوري للأخطاء.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* 3. Language & Question Bank Modality */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <label className="text-xs font-bold text-slate-300 block mb-2">
                    لغة الاختبار / بنك الأسئلة:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setExamLanguage('ar')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors ${
                        examLanguage === 'ar'
                          ? 'bg-teal-600 text-white border-teal-500'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      العربية (Ar)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamLanguage('en')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors ${
                        examLanguage === 'en'
                          ? 'bg-teal-600 text-white border-teal-500'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      English (En)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamLanguage('bilingual')}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-colors ${
                        examLanguage === 'bilingual'
                          ? 'bg-teal-600 text-white border-teal-500'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      ثنائي (Ar+En)
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <label className="text-xs font-bold text-slate-300 block mb-2">
                    نوع الأسئلة المستهدفة:
                  </label>
                  <select
                    value={questionTypeMode}
                    onChange={(e) => setQuestionTypeMode(e.target.value as BankQuestionTypeMode)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-indigo-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="hybrid">بنك هجين شامل (اختيارات + صح/خطأ + إكمال + مقالي)</option>
                    <option value="mcq">اختيارات من متعدد فقط (MCQ Only)</option>
                    <option value="true_false">صح وخطأ فقط (True/False Only)</option>
                    <option value="fill_blank">إكمال الفراغ فقط (Fill in the Blank)</option>
                    <option value="essay">أسئلة مقالية فقط (Essay Only)</option>
                  </select>
                </div>
              </div>

              {/* 4. AI Studio Settings Summary & Modal Trigger (Only if source is AI) */}
              {inputSource === 'ai' && (
                <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-800/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <span>مواصفات وإعدادات التوليد الذكي:</span>
                      </h4>
                      <p className="text-[11px] text-indigo-300/80 mt-0.5">
                        اضبط مواصفات وعمق الأسئلة السريرية بدقة عبر النافذة المنبثقة المخصصة
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAiSettingsModal(true)}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors"
                    >
                      <span>⚙️ تخصيص إعدادات الذكاء المتقدمة</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-indigo-900/60">
                      <span className="text-[10px] text-slate-400 block">الموضوع / البلوك الطبي:</span>
                      <span className="font-bold text-indigo-200 truncate block mt-0.5">
                        {aiTopic || publishBlockName || bank.titleArabic}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-indigo-900/60">
                      <span className="text-[10px] text-slate-400 block">نظام عدد الأسئلة:</span>
                      <span className="font-bold text-teal-300 block mt-0.5">
                        {isDynamicQuestionCount ? 'ديناميكي مفتوح (شامل للموضوع)' : `${aiMcqCount} MCQ / مخصص`}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-indigo-900/60">
                      <span className="text-[10px] text-slate-400 block">العمق العلمي والخيارات:</span>
                      <span className="font-bold text-amber-300 block mt-0.5">
                        {aiDifficultyMix === 'clinical_usmle' ? 'حالات USMLE سريرية' : 'متوازن'} · {aiOptionsCount} خيارات
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1 Footer CTA */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep('content')}
                  className="py-3 px-6 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-900/40 flex items-center gap-2 transition-colors"
                >
                  <span>متابعة لإدخال وتوليد الأسئلة</span>
                  <span>←</span>
                </button>
              </div>
            </div>
          )}



          {/* STEP 2: CONTENT INPUT & AI GENERATION */}
          {step === 'content' && (
            <div className="space-y-4">
              {inputSource === 'ai' ? (
                /* AI Prompt Generation Card & Fast Actions */
                <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-800/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <span>طلب التوليد الاحترافي (Medical AI Prompt)</span>
                      </h4>
                      <p className="text-[10px] text-indigo-300/80 mt-0.5">
                        انسخ هذا الموجه الاحترافي لـ ChatGPT أو Gemini أو Claude، أو اضغط توليد مباشر لتعبئة الأسئلة فورياً.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(generatedAiPrompt);
                            setFeedback({
                              type: 'success',
                              text: 'تم نسخ موجه الأمر الطبي المخصص بنجاح! الصقه في ChatGPT أو Gemini أو Claude ثم الصق الأسئلة بالأسفل ✓'
                            });
                          } catch {}
                        }}
                        className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ البرومبت الطبي</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDirectAiGenerateExam}
                        disabled={directAiGenerating}
                        className="py-2 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors"
                      >
                        {directAiGenerating ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="w-3.5 h-3.5" />
                        )}
                        <span>{directAiGenerating ? 'جاري التوليد والتحليل...' : 'توليد ذكي فوري مباشر'}</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    readOnly
                    dir={examLanguage === 'en' ? 'ltr' : 'rtl'}
                    value={generatedAiPrompt}
                    rows={4}
                    className="w-full p-3 rounded-xl bg-slate-950/90 border border-indigo-900/80 text-[11px] text-slate-300 font-mono leading-relaxed focus:outline-none"
                  />
                </div>
              ) : (
                /* Manual Input / File Upload Tools */
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
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
                      className="py-2 px-3.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>رفع ملف (TXT / CSV / JSON)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowTemplateModal(true)}
                      className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>عرض قوالب التنسيق الجاهزة</span>
                    </button>
                  </div>

                  {(rawInput.trim() || drafts.length > 0) && (
                    <button
                      type="button"
                      onClick={handleClearSession}
                      className="py-2 px-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/70 text-rose-300 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>مسح النص</span>
                    </button>
                  )}
                </div>
              )}

              {/* Spacious Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <span>
                    {inputSource === 'ai'
                      ? 'الصق مخرجات الذكاء الاصطناعي هنا (أو ستظهر تلقائياً بعد التوليد المباشر):'
                      : 'الصق نص الأسئلة أو عدلها هنا:'}
                  </span>
                  <span className="text-slate-500 font-mono text-[11px]">{rawInput.length} حرف</span>
                </div>
                <textarea
                  dir={examLanguage === 'en' ? 'ltr' : 'rtl'}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={
                    examLanguage === 'en'
                      ? `Example:\nLanguage: English\nTitle: Second Year Hematology Exam\n\n1. Which heart valve lies between the left ventricle and the aorta?\nA) Mitral Valve\nB) Aortic Valve * (Rationale: Correct, separates LV from aorta)\nC) Tricuspid Valve\nD) Pulmonary Valve\nAnswer: B\nRationale: The aortic valve prevents regurgitation from the aorta into the left ventricle.`
                      : `مثال:\nاللغة: ${examLanguage === 'bilingual' ? 'ثنائي اللغة' : 'عربي'}\n1. ما هو الصمام القلبي الفاصل بين البطين الأيسر والشريان الأبهر؟\nأ) الصمام التاجي\nب) الصمام الأبهري *\nج) الصمام ثلاثي الشرف\nد) الصمام الرئوي\nالإجابة: ب`
                  }
                  className="w-full min-h-[260px] sm:min-h-[340px] p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-white leading-relaxed focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Step 2 Bottom Navigation */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('setup')}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-800 transition-colors"
                >
                  <span>← رجوع لخطوة الإعداد</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleParseInput(rawInput)}
                  disabled={!rawInput.trim()}
                  className="py-3 px-6 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-teal-900/40 flex items-center gap-2 transition-colors"
                >
                  <span>فحص وتحليل الأسئلة والانتقال للتدقيق والتوقيت</span>
                  <span>←</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW, TIMERS & PUBLISHING */}
          {step === 'review' && (
            /* STEP 2: STREAMLINED, HIGH-VISIBILITY REVIEW & EDIT SCREEN */
            <div className="space-y-3">
              {/* Auto-Detected Assessment Header Banner (Language, Title, Type, Level, Batch, Course, Timers) */}
              {detectedMeta && (detectedMeta.titleArabic || detectedMeta.language || detectedMeta.batchName || detectedMeta.courseName || detectedMeta.studyLevelName) && (
                <div className="p-3 rounded-xl bg-teal-950/40 border border-teal-800/60 text-xs text-teal-200 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                    <span className="font-bold">بيانات التقييم المستخرجة تلقائياً:</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-300">
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-sky-300 font-bold">
                      اللغة: {examLanguage === 'en' ? 'English (إنجليزي)' : examLanguage === 'bilingual' ? 'ثنائي اللغة (Ar+En)' : 'العربية'}
                    </span>
                    {detectedMeta.titleArabic && (
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-teal-300 font-semibold">
                        العنوان: {detectedMeta.titleArabic}
                      </span>
                    )}
                    {detectedMeta.assessmentType && (
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-amber-300 font-semibold">
                        {detectedMeta.assessmentType === 'competition' ? 'مسابقة طبية تنافسية' : 'اختبار أكاديمي'}
                      </span>
                    )}
                    {detectedMeta.studyLevelName && (
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-indigo-300">
                        {detectedMeta.studyLevelName}
                      </span>
                    )}
                    {detectedMeta.batchName && (
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-purple-300">
                        {detectedMeta.batchName}
                      </span>
                    )}
                    {detectedMeta.courseName && (
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-sky-300">
                        {detectedMeta.courseName}
                      </span>
                    )}
                    {Boolean(detectedMeta.durationMinutes) && (
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-emerald-300 font-mono">
                        {detectedMeta.durationMinutes} دقيقة
                      </span>
                    )}
                    {Boolean(detectedMeta.questionDurationSeconds) && (
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-emerald-300 font-mono">
                        {detectedMeta.questionDurationSeconds} ث/سؤال
                      </span>
                    )}
                  </div>
                </div>
              )}

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
                    const hasErrors = (draft.issues || []).some((i) => i.severity === 'error');
                    const isExpanded = Boolean(expandedCards[draft.tempId]);
                    const qType: QuestionType = draft.questionType || 'mcq';
                    const qLang: AssessmentLanguage = draft.language || examLanguage;
                    const isEnQuestion = qLang === 'en';
                    const LETTERS = isEnQuestion ? ENGLISH_LETTERS : ARABIC_LETTERS;
                    
                    const optIndex = (draft.options || []).findIndex((o) => o.id === draft.correctOptionId);
                    const correctLetter = optIndex >= 0 ? LETTERS[optIndex] || draft.correctOptionId : null;

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
                        <div className="flex items-center justify-between gap-2 flex-wrap">
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

                            {/* Compact Question Type Dropdown */}
                            <select
                              value={qType}
                              onChange={(e) => handleChangeQuestionType(draft.tempId, e.target.value as QuestionType)}
                              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[10px] font-bold text-teal-300 focus:outline-none focus:border-teal-500"
                            >
                              <option value="mcq">خيارات متعددة ({draft.options?.length || 0})</option>
                              <option value="true_false">صح وخطأ (True/False)</option>
                              <option value="fill_blank">إكمال الفراغ (Fill Blank)</option>
                              <option value="essay">سؤال مقالي (Essay)</option>
                            </select>

                            {/* Status Badge */}
                            {draft.isValid ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[10px] font-bold">
                                {qType === 'essay'
                                  ? 'جاهز ✓ (مقالي)'
                                  : qType === 'fill_blank'
                                  ? `جاهز ✓ (الفراغ: ${draft.modelAnswerArabic})`
                                  : qType === 'true_false'
                                  ? `جاهز ✓ (${draft.correctOptionId === 'opt-a' ? (isEnQuestion ? 'True' : 'صح') : (isEnQuestion ? 'False' : 'خطأ')})`
                                  : `جاهز ✓ (الإجابة: ${correctLetter})`}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-700 text-rose-200 text-[10px] font-bold">
                                {qType === 'essay'
                                  ? 'أدخل الإجابة النموذجية'
                                  : qType === 'fill_blank'
                                  ? 'أدخل الكلمة الصحيحة للفراغ'
                                  : !draft.correctOptionId
                                  ? 'حدد الإجابة الصحيحة'
                                  : 'أكمل نص السؤال والخيارات'}
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
                              <span>{draft.explanationArabic ? 'التعليل العام ✓' : 'التعليل العام / النقاط'}</span>
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
                        {(draft.issues || []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(draft.issues || []).map((issue, iIdx) => (
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
                          dir={isEnQuestion ? 'ltr' : 'rtl'}
                          value={draft.stemArabic}
                          onChange={(e) =>
                            updateDraftItem(draft.tempId, (d) => ({
                              ...d,
                              stemArabic: e.target.value,
                              ...(isEnQuestion ? { stemEnglish: e.target.value } : {})
                            }))
                          }
                          rows={2}
                          placeholder={isEnQuestion ? 'Medical question stem in English...' : 'نص السؤال الطبي...'}
                          className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-semibold focus:outline-none focus:border-teal-500"
                        />

                        {/* Bilingual Secondary English Stem (Shown directly on card if bilingual or if stemEnglish differs from stemArabic) */}
                        {(qLang === 'bilingual' || (draft.stemEnglish && draft.stemEnglish !== draft.stemArabic)) && (
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
                            placeholder="English question stem (for bilingual mode)..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-indigo-900/60 text-xs text-indigo-200 focus:outline-none focus:border-indigo-400"
                          />
                        )}

                        {/* 1A. Fill-in-the-Blank Question View */}
                        {qType === 'fill_blank' && (
                          <div className="space-y-1.5 p-3 rounded-xl bg-sky-950/25 border border-sky-800/60">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-sky-200 flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-sky-400" />
                                <span>الكلمة أو المصطلح الطبي الصحيح لإكمال الفراغ:</span>
                              </span>
                              <span className="text-[10px] text-sky-400 font-mono">Fill in the Blank</span>
                            </div>
                            <input
                              type="text"
                              dir={isEnQuestion ? 'ltr' : 'rtl'}
                              value={draft.modelAnswerArabic || ''}
                              onChange={(e) =>
                                updateDraftItem(draft.tempId, (d) => ({
                                  ...d,
                                  modelAnswerArabic: e.target.value,
                                  correctOptionId: 'fill-blank-answer'
                                }))
                              }
                              placeholder={
                                isEnQuestion
                                  ? 'Enter exact medical term (separate synonyms with /)...'
                                  : 'اكتب الكلمة أو المصطلح الطبي الدقيق (يمكن فصل المرادفات بعلامة /)...'
                              }
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-sky-900 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                            />
                          </div>
                        )}

                        {/* 1B. Essay Question View: Model Answer Input */}
                        {qType === 'essay' && (
                          <div className="space-y-1.5 p-3 rounded-xl bg-purple-950/25 border border-purple-800/60">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                                <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                                <span>الإجابة النموذجية ومعايير التقييم:</span>
                              </span>
                              <span className="text-[10px] text-purple-400 font-mono">Model Answer</span>
                            </div>
                            <textarea
                              dir={isEnQuestion ? 'ltr' : 'rtl'}
                              value={draft.modelAnswerArabic || ''}
                              onChange={(e) =>
                                updateDraftItem(draft.tempId, (d) => ({
                                  ...d,
                                  modelAnswerArabic: e.target.value,
                                  correctOptionId: 'essay-answer'
                                }))
                              }
                              rows={3}
                              placeholder={
                                isEnQuestion
                                  ? 'Enter the complete model answer / clinical grading rubric...'
                                  : 'اكتب الإجابة النموذجية الكاملة أو النقاط الطبية الأساسية التي سيتم على أساسها تقييم إجابة الطالب المقالية...'
                              }
                              className="w-full p-2.5 rounded-lg bg-slate-950 border border-purple-900 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400 leading-relaxed"
                            />
                          </div>
                        )}

                        {/* 2. True / False Question View */}
                        {qType === 'true_false' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {draft.options.map((opt) => {
                              const isCorrect = draft.correctOptionId === opt.id;
                              const isTrue = opt.id === 'opt-a';
                              return (
                                <div
                                  key={opt.id}
                                  className={`p-2 rounded-xl border transition-all space-y-1.5 ${
                                    isCorrect
                                      ? isTrue
                                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-100'
                                        : 'bg-rose-950/60 border-rose-500 text-rose-100'
                                      : 'bg-slate-900/90 border-slate-800 text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateDraftItem(draft.tempId, (d) => ({
                                          ...d,
                                          correctOptionId: opt.id
                                        }))
                                      }
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        isCorrect
                                          ? isTrue
                                            ? 'bg-emerald-600 text-white shadow'
                                            : 'bg-rose-600 text-white shadow'
                                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                      }`}
                                    >
                                      {isTrue ? <CheckCircle2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                                      <span>{isCorrect ? `✓ ${opt.textArabic}` : opt.textArabic}</span>
                                    </button>
                                    <span className="text-[10px] text-slate-400">
                                      {isCorrect ? 'الإجابة المعتمدة' : 'اضغط للاختيار'}
                                    </span>
                                  </div>
                                  <input
                                    type="text"
                                    dir={isEnQuestion ? 'ltr' : 'rtl'}
                                    value={opt.explanationArabic || ''}
                                    onChange={(e) =>
                                      updateDraftItem(draft.tempId, (d) => ({
                                        ...d,
                                        options: d.options.map((o) =>
                                          o.id === opt.id ? { ...o, explanationArabic: e.target.value } : o
                                        )
                                      }))
                                    }
                                    placeholder={
                                      isEnQuestion
                                        ? `Scientific rationale for ${isTrue ? 'True' : 'False'} (optional)...`
                                        : `تعليل ${isTrue ? 'الصواب' : 'الخطأ'} العلمي لهذا الخيار (اختياري)...`
                                    }
                                    className="w-full px-2 py-1 rounded bg-slate-950/80 border border-slate-800 text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 3. MCQ Question View with Dynamic Options (3, 4, 5, etc.) and Option Rationales */}
                        {qType === 'mcq' && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {draft.options.map((opt, oIdx) => {
                                const isCorrect = draft.correctOptionId === opt.id;
                                const letterDisplay = LETTERS[oIdx] || opt.id;
                                return (
                                  <div
                                    key={opt.id}
                                    className={`p-2 rounded-lg border transition-all space-y-1.5 ${
                                      isCorrect
                                        ? 'bg-teal-950/60 border-teal-500'
                                        : 'bg-slate-900/90 border-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
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
                                        {isCorrect ? `✓ ${letterDisplay}` : letterDisplay}
                                      </button>

                                      <input
                                        type="text"
                                        dir={isEnQuestion ? 'ltr' : 'rtl'}
                                        value={opt.textArabic}
                                        onChange={(e) =>
                                          updateDraftItem(draft.tempId, (d) => ({
                                            ...d,
                                            options: d.options.map((o) =>
                                              o.id === opt.id
                                                ? {
                                                    ...o,
                                                    textArabic: e.target.value,
                                                    ...(isEnQuestion ? { textEnglish: e.target.value } : {})
                                                  }
                                                : o
                                            )
                                          }))
                                        }
                                        placeholder={isEnQuestion ? `Option (${letterDisplay})...` : `الخيار (${letterDisplay})...`}
                                        className="flex-1 min-w-0 bg-transparent text-xs text-white focus:outline-none px-1"
                                      />

                                      {draft.options.length > 2 && (
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveOption(draft.tempId, opt.id)}
                                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                                          title="حذف هذا الخيار"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>

                                    {/* Option-Specific Explanation / Rationale */}
                                    <input
                                      type="text"
                                      dir={isEnQuestion ? 'ltr' : 'rtl'}
                                      value={opt.explanationArabic || ''}
                                      onChange={(e) =>
                                        updateDraftItem(draft.tempId, (d) => ({
                                          ...d,
                                          options: d.options.map((o) =>
                                            o.id === opt.id ? { ...o, explanationArabic: e.target.value } : o
                                          )
                                        }))
                                      }
                                      placeholder={
                                        isEnQuestion
                                          ? `Rationale for Option (${letterDisplay}) (optional)...`
                                          : `تعليل الخيار (${letterDisplay}): سبب صحته أو خطئه (اختياري)...`
                                      }
                                      className="w-full px-2 py-0.5 rounded bg-slate-950/70 border border-slate-800/80 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                                    />
                                  </div>
                                );
                              })}
                            </div>

                            {/* Add Option Button if less than 8 options */}
                            {draft.options.length < 8 && (
                              <button
                                type="button"
                                onClick={() => handleAddOption(draft.tempId)}
                                className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 border border-dashed border-slate-700 text-teal-400 text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                <span>إضافة خيار إضافي ({LETTERS[draft.options.length] || ''})</span>
                              </button>
                            )}
                          </div>
                        )}

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
          {step === 'setup' ? (
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
                onClick={() => setStep('content')}
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-colors"
              >
                <span>المتابعة إلى إدخال المحتوى والتوليد</span>
                <span className="font-mono">←</span>
              </button>
            </div>
          ) : step === 'content' ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep('setup')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                رجوع للإعدادات
              </button>
              <button
                type="button"
                onClick={() => handleParseInput()}
                disabled={!rawInput.trim()}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تحليل وعرض الأسئلة للمراجعة (الخطوة 3)</span>
              </button>
            </div>
          ) : (
            <>
              {/* Compact Dropdown Approval Choice: Bank Only vs Exam Only vs Competition Only */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-300 whitespace-nowrap">
                    وجهة الاعتماد:
                  </label>
                  <select
                    value={publishMode}
                    onChange={(e) => handleSelectPublishMode(e.target.value as ApprovalPublishMode)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-teal-300 focus:outline-none focus:border-teal-500"
                  >
                    <option value="bank_only">حفظ في بنك الأسئلة فقط</option>
                    <option value="exam_only">نشر كاختبار أكاديمي فقط</option>
                    <option value="competition_only">نشر كمسابقة طبية فقط</option>
                  </select>
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
                      value={examLanguage}
                      onChange={(e) => setExamLanguage(e.target.value as AssessmentLanguage)}
                      className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-sky-300 font-bold"
                      title="لغة الاختبار"
                    >
                      <option value="ar">اللغة: عربي</option>
                      <option value="en">اللغة: English</option>
                      <option value="bilingual">ثنائي اللغة</option>
                    </select>
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
                    {/* Bidirectional Question Timer <-> Total Exam Timer Controls */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/90 px-2.5 py-1 rounded-xl border border-indigo-800/60">
                      <div className="flex items-center gap-1" title="عند تحديد وقت السؤال يتم حساب الوقت الكلي تلقائياً بناءً على عدد الأسئلة">
                        <span className="text-[10px] text-indigo-300 font-bold whitespace-nowrap">وقت السؤال (ث):</span>
                        <input
                          type="number"
                          min={0}
                          max={600}
                          value={publishQuestionSeconds}
                          onChange={(e) => handleQuestionSecondsChange(Number(e.target.value))}
                          className="w-14 px-1.5 py-1 rounded bg-slate-900 border border-indigo-700/80 text-[11px] text-indigo-200 font-bold text-center focus:outline-none focus:border-indigo-400"
                        />
                        <select
                          value={[0, 20, 30, 45, 60, 90, 120].includes(publishQuestionSeconds) ? publishQuestionSeconds : 'custom'}
                          onChange={(e) => {
                            if (e.target.value !== 'custom') handleQuestionSecondsChange(Number(e.target.value));
                          }}
                          className="px-1.5 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-indigo-300"
                        >
                          <option value={0}>بدون</option>
                          <option value={20}>20ث</option>
                          <option value={30}>30ث</option>
                          <option value={45}>45ث</option>
                          <option value={60}>60ث</option>
                          <option value={90}>90ث</option>
                          <option value={120}>120ث</option>
                          {![0, 20, 30, 45, 60, 90, 120].includes(publishQuestionSeconds) && (
                            <option value="custom">{publishQuestionSeconds}ث (تلقائي)</option>
                          )}
                        </select>
                      </div>

                      <span className="text-slate-500 text-xs font-bold">⇄</span>

                      <div className="flex items-center gap-1" title="عند تحديد الوقت الكلي يتم تقسيمه تلقائياً على عدد الأسئلة لمعرفة وقت كل سؤال">
                        <span className="text-[10px] text-amber-300 font-bold whitespace-nowrap">الوقت الكلي (د):</span>
                        <input
                          type="number"
                          min={0}
                          max={600}
                          value={publishDurationMinutes}
                          onChange={(e) => handleDurationMinutesChange(Number(e.target.value))}
                          className="w-14 px-1.5 py-1 rounded bg-slate-900 border border-amber-700/80 text-[11px] text-amber-200 font-bold text-center focus:outline-none focus:border-amber-400"
                        />
                        <select
                          value={[0, 10, 15, 30, 45, 60, 90, 120].includes(publishDurationMinutes) ? publishDurationMinutes : 'custom'}
                          onChange={(e) => {
                            if (e.target.value !== 'custom') handleDurationMinutesChange(Number(e.target.value));
                          }}
                          className="px-1.5 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-amber-300"
                        >
                          <option value={0}>مفتوح</option>
                          <option value={10}>10د</option>
                          <option value={15}>15د</option>
                          <option value={30}>30د</option>
                          <option value={45}>45د</option>
                          <option value={60}>60د</option>
                          <option value={90}>90د</option>
                          <option value={120}>120د</option>
                          {![0, 10, 15, 30, 45, 60, 90, 120].includes(publishDurationMinutes) && (
                            <option value="custom">{publishDurationMinutes}د (تلقائي)</option>
                          )}
                        </select>
                      </div>

                      <span className="text-[10px] text-teal-300 font-semibold bg-teal-950/60 border border-teal-800/50 px-2 py-0.5 rounded-md whitespace-nowrap">
                        {stats.selectedValid} سؤال × {publishQuestionSeconds}ث ≈ {publishDurationMinutes} دقيقة
                      </span>
                    </div>

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
                  onClick={() => setStep('content')}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold shrink-0"
                >
                  رجوع لتعديل المحتوى
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

      {/* 1. Academic Scope Selection Popup Modal */}
      {showAcademicPopup && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" dir="rtl">
          <div className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-lg w-full max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-black text-white">تحديد النطاق الأكاديمي للاختبار</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAcademicPopup(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1.5">المستوى / السنة الدراسية:</label>
                <select
                  value={publishStudyLevelId}
                  onChange={(e) => {
                    const newLvl = e.target.value;
                    setPublishStudyLevelId(newLvl);
                    const matched = (studyLevels || []).find(l => l.id === newLvl);
                    saveUserAcademicContext({
                      studyLevelId: newLvl,
                      studyLevelName: matched?.titleArabic
                    });
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-medium focus:border-teal-500 focus:outline-none"
                >
                  {(studyLevels || []).map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.stageType === 'internship' ? 'سنة الامتياز الطبي' : `السنة ${lvl.order} - ${lvl.titleArabic}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1.5">البلوك الدراسي المتاح (النشط فقط):</label>
                {blocksForCurrentLevel.length === 0 ? (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 text-center">
                    لا توجد بلوكات نشطة مسجلة لهذا المستوى. يمكنك إدخال اسم البلوك يدوياً أدناه.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-1">
                    {blocksForCurrentLevel.map((blk) => (
                      <button
                        key={blk.id}
                        type="button"
                        onClick={() => {
                          setPublishBlockName(blk.titleArabic);
                          setAiTopic(blk.titleArabic);
                          saveUserAcademicContext({
                            studyPeriodId: blk.id,
                            studyPeriodName: blk.titleArabic
                          });
                        }}
                        className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
                          publishBlockName === blk.titleArabic
                            ? 'bg-teal-500/20 border-teal-400 text-white shadow-sm font-bold'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span className="truncate">{blk.titleArabic}</span>
                        {blk.code && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-teal-300 font-mono">
                            {blk.code}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] font-bold mb-1">اسم البلوك المخصص أو تعديل الاسم:</label>
                <input
                  type="text"
                  value={publishBlockName}
                  onChange={(e) => {
                    setPublishBlockName(e.target.value);
                    setAiTopic(e.target.value);
                  }}
                  placeholder="مثال: بلوك القلب والجهاز الدوري (Cardiovascular)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-teal-500 focus:outline-none text-xs"
                />
              </div>

              <div className="p-3 rounded-xl bg-teal-950/30 border border-teal-800/40 text-[11px] text-teal-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>تم استبعاد جميع البلوكات المحذوفة والمؤرشفة تلقائياً لضمان سلامة الربط.</span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAcademicPopup(false)}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition-colors"
              >
                تطبيق وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. AI Prompt & Generation Settings Modal */}
      {showAiSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" dir="rtl">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-xl w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black text-white">إعدادات الذكاء الاصطناعي وصياغة الأسئلة المتقدمة</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiSettingsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Question Count Calibration */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-xs">طريقة تحديد عدد الأسئلة</div>
                    <div className="text-[11px] text-slate-400">
                      {isDynamicQuestionCount ? 'توليد تلقائي ديناميكي غير محدود حسب كثافة المحتوى الطبي' : 'تحديد يدوي دقيق لكل نمط'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDynamicQuestionCount(!isDynamicQuestionCount)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isDynamicQuestionCount
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {isDynamicQuestionCount ? 'ديناميكي تلقائي' : 'تخصيص يدوي'}
                  </button>
                </div>

                {!isDynamicQuestionCount && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">MCQ (خيارات):</label>
                      <input
                        type="number"
                        min={1}
                        max={150}
                        value={aiMcqCount}
                        onChange={(e) => setAiMcqCount(Math.max(1, Number(e.target.value)))}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">صح / خطأ:</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={aiTfCount}
                        onChange={(e) => setAiTfCount(Math.max(0, Number(e.target.value)))}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">إكمال الفراغ:</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={aiFillBlankCount}
                        onChange={(e) => setAiFillBlankCount(Math.max(0, Number(e.target.value)))}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">مقالي / سريري:</label>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={aiEssayCount}
                        onChange={(e) => setAiEssayCount(Math.max(0, Number(e.target.value)))}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-center font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Options Count */}
              <div>
                <label className="block text-slate-300 font-bold mb-1.5">عدد خيارات الأسئلة متعددة الخيارات:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAiOptionsCount(4)}
                    className={`py-2 px-3 rounded-xl border text-center transition-all ${
                      aiOptionsCount === 4
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    4 خيارات (A, B, C, D)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiOptionsCount(5)}
                    className={`py-2 px-3 rounded-xl border text-center transition-all ${
                      aiOptionsCount === 5
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    5 خيارات (A, B, C, D, E)
                  </button>
                </div>
              </div>

              {/* Difficulty and Clinical Depth */}
              <div>
                <label className="block text-slate-300 font-bold mb-1.5">عمق ونمط الأسئلة الطبية:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAiDifficultyMix('clinical_usmle')}
                    className={`p-2.5 rounded-xl border text-right transition-all ${
                      aiDifficultyMix === 'clinical_usmle'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs">سيناريوهات USMLE</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">حالات مرضية وسيناريوهات سريرية</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiDifficultyMix('balanced')}
                    className={`p-2.5 rounded-xl border text-right transition-all ${
                      aiDifficultyMix === 'balanced'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs">توازن سريري ونظري</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">شامل للمفاهيم والتطبيقات</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiDifficultyMix('foundational')}
                    className={`p-2.5 rounded-xl border text-right transition-all ${
                      aiDifficultyMix === 'foundational'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs">مفاهيم أساسية</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">تعاريف وحقائق طبية مباشرة</div>
                  </button>
                </div>
              </div>

              {/* Rationales Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="font-bold text-white text-xs">تضمين التفسير الطبي للخيارات (Rationales)</div>
                  <div className="text-[11px] text-slate-400">شرح سبب صحة الخيار الصحيح وأسباب خطأ الخيارات الأخرى</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAiIncludeOptionRationales(!aiIncludeOptionRationales)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    aiIncludeOptionRationales
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {aiIncludeOptionRationales ? 'مفعّل' : 'معطّل'}
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAiSettingsModal(false)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-colors"
              >
                حفظ وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Sample Templates Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" dir="rtl">
          <div className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-2xl w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-black text-white">نماذج وقوالب إدخال الأسئلة المعتمدة</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              <p className="text-slate-300 leading-relaxed">
                يدعم المحلل الذكي أشكالاً متعددة من النصوص سواء كانت منسوخة من نماذج الذكاء الاصطناعي أو ملفات Word أو جداول Excel. يمكنك نسخ أي نموذج أو إدراجه فوراً:
              </p>

              {/* Template 1: MCQ */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-teal-300">1. نموذج أسئلة متعددة الخيارات (MCQ عربي / إنجليزي)</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const sample = getSampleTemplateByLanguage(examLanguage);
                        navigator.clipboard.writeText(sample);
                        setFeedback({ type: 'success', text: 'تم نسخ نموذج MCQ إلى الحافظة' });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>نسخ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const sample = getSampleTemplateByLanguage(examLanguage);
                        setRawInput(sample);
                        setShowTemplateModal(false);
                        setStep('content');
                        setFeedback({ type: 'success', text: 'تم إدراج نموذج MCQ في المحتوى' });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-teal-600/30 hover:bg-teal-600/50 text-teal-300 text-[11px] font-bold flex items-center gap-1"
                    >
                      <span>إدراج في المحتوى</span>
                    </button>
                  </div>
                </div>
                <pre className="p-3 bg-slate-900 rounded-lg text-slate-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                  {getSampleTemplateByLanguage(examLanguage)}
                </pre>
              </div>

              {/* Template 2: CSV Template */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">2. نموذج جدول CSV (Excel)</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(SAMPLE_BULK_CSV_TEMPLATE);
                        setFeedback({ type: 'success', text: 'تم نسخ نموذج CSV إلى الحافظة' });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>نسخ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRawInput(SAMPLE_BULK_CSV_TEMPLATE);
                        setSourceFormat('csv');
                        setShowTemplateModal(false);
                        setStep('content');
                        setFeedback({ type: 'success', text: 'تم إدراج جدول CSV في المحتوى' });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 text-[11px] font-bold flex items-center gap-1"
                    >
                      <span>إدراج في المحتوى</span>
                    </button>
                  </div>
                </div>
                <pre className="p-3 bg-slate-900 rounded-lg text-slate-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                  {SAMPLE_BULK_CSV_TEMPLATE}
                </pre>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
