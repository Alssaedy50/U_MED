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
  Wand2,
  ShieldCheck,
  FileJson,
  Printer,
  Eye,
  Check
} from 'lucide-react';
import {
  QuestionBank,
  QuestionItemFull,
  ParsedQuestionDraft,
  BulkImportDraftSession,
  Assessment,
  University,
  StudyLevel,
  StudyPeriod,
  CourseOffering,
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
  synchronizeExamTimers,
  evaluateQuizVerificationReport,
  formatQuizVerificationText,
  downloadQuizVerificationFile,
  getOptionIdByIndex,
  sanitizeOptionTextForDisplay,
  extractOptionAndExplanation
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
  fetchActiveStudyPeriods,
  fetchUniversities,
  fetchCourseOfferings
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

  const [step, setStep] = useState<'input' | 'review' | 'categorize'>('input');
  const [inputSource, setInputSource] = useState<'manual' | 'ai'>('manual');
  const [showAiSettingsModal, setShowAiSettingsModal] = useState<boolean>(false);
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [universities, setUniversities] = useState<University[]>([DAR_AL_SALAM_SEED.university]);
  const [publishUniversityId, setPublishUniversityId] = useState<string>(
    bank.universityId || initialAcademicResolution.userCtx.universityId || 'univ-dar-al-salam'
  );
  const [liveBlocks, setLiveBlocks] = useState<StudyPeriod[]>([]);
  const [publishPeriodId, setPublishPeriodId] = useState<string>(
    bank.studyPeriodId || initialAcademicResolution.userCtx.studyPeriodId || ''
  );
  const [coursesForBlock, setCoursesForBlock] = useState<CourseOffering[]>([]);
  const [publishCourseId, setPublishCourseId] = useState<string>(
    bank.courseOfferingId || initialAcademicResolution.userCtx.courseOfferingId || ''
  );
  const [examLanguage, setExamLanguage] = useState<AssessmentLanguage>(bank.language || 'ar');
  const [questionTypeMode, setQuestionTypeMode] = useState<BankQuestionTypeMode>(
    bank.questionTypeMode || 'hybrid'
  );

  // Sync language and questionTypeMode dynamically whenever the active bank changes
  useEffect(() => {
    if (bank.language) setExamLanguage(bank.language);
    if (bank.questionTypeMode) setQuestionTypeMode(bank.questionTypeMode);
  }, [bank.id, bank.language, bank.questionTypeMode]);
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
  const [showPrePublishVerifyModal, setShowPrePublishVerifyModal] = useState<boolean>(false);
  const [verifyViewTab, setVerifyViewTab] = useState<'summary' | 'text'>('summary');
  const [copiedVerifyText, setCopiedVerifyText] = useState<boolean>(false);
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

  // Load universities on mount
  useEffect(() => {
    let active = true;
    fetchUniversities().then((univs) => {
      if (active && univs.length > 0) setUniversities(univs);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Dynamic Live Blocks: Fetch only active, non-archived, non-deleted blocks for current level
  useEffect(() => {
    let isCurrent = true;
    fetchActiveStudyPeriods(publishStudyLevelId).then((periods) => {
      if (isCurrent) {
        setLiveBlocks(periods);
        if (periods.length > 0) {
          const match = periods.find(p => p.id === publishPeriodId || p.titleArabic === publishBlockName || p.id === bank.studyPeriodId);
          if (match) {
            setPublishPeriodId(match.id);
            setPublishBlockName(match.titleArabic);
            setAiTopic(match.titleArabic);
          } else {
            setPublishPeriodId(periods[0].id);
            if (!publishBlockName) {
              setPublishBlockName(periods[0].titleArabic);
              setAiTopic(periods[0].titleArabic);
            }
          }
        } else {
          setPublishPeriodId('');
          setCoursesForBlock([]);
        }
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [publishStudyLevelId, bank.studyPeriodId]);

  // Fetch courses when selected Study Period / Block changes
  useEffect(() => {
    let isCurrent = true;
    if (!publishPeriodId) {
      setCoursesForBlock([]);
      return;
    }
    fetchCourseOfferings(publishPeriodId).then((courses) => {
      if (isCurrent) {
        setCoursesForBlock(courses);
        if (courses.length > 0 && !courses.some(c => c.id === publishCourseId)) {
          setPublishCourseId(courses[0].id);
        }
      }
    }).catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [publishPeriodId]);

  // AI Smart Exam Prompt Studio Configuration
  const [aiMode, setAiMode] = useState<'generate_new' | 'format_existing'>('generate_new');
  const [aiTopic, setAiTopic] = useState<string>(
    initialAcademicResolution.blockName || bank.titleArabic || 'بلوك الدم والجهاز اللمفاوي (Hematology)'
  );
  const [aiAssessmentType, setAiAssessmentType] = useState<'exam' | 'competition'>('exam');
  // Dynamic question count by default (unbounded unless user explicitly chooses custom count)
  const [isDynamicQuestionCount, setIsDynamicQuestionCount] = useState<boolean>(true);
  const [aiMcqCount, setAiMcqCount] = useState<number>(10);
  const [aiOptionsCount, setAiOptionsCount] = useState<number>(4);
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

  const ARABIC_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
  const ENGLISH_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

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
      const detectedQSec = detectedMetadata.questionTimerSeconds || detectedMetadata.questionDurationSeconds || 0;
      const detectedMin = detectedMetadata.durationMinutes || 0;
      if (detectedQSec > 0 && detectedMin > 0) {
        setTimerDriverMode('questionSeconds');
        setPublishQuestionSeconds(detectedQSec);
        setPublishDurationMinutes(detectedMin);
      } else if (detectedQSec > 0) {
        setTimerDriverMode('questionSeconds');
        setPublishQuestionSeconds(detectedQSec);
        const synced = synchronizeExamTimers({
          questionsCount: validCount,
          durationMinutes: publishDurationMinutes,
          questionDurationSeconds: detectedQSec,
          changedField: 'questionSeconds'
        });
        setPublishDurationMinutes(synced.durationMinutes);
      } else if (detectedMin > 0) {
        setTimerDriverMode('totalMinutes');
        setPublishDurationMinutes(detectedMin);
        const synced = synchronizeExamTimers({
          questionsCount: validCount,
          durationMinutes: detectedMin,
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
      const lower = file.name.toLowerCase();
      let text = '';

      if (lower.endsWith('.docx') || lower.endsWith('.pdf') || lower.endsWith('.xlsx')) {
        // Attempt lightweight UTF-8 / XML text extraction from binary containers without external heavy deps
        const rawBytes = new Uint8Array(await file.arrayBuffer());
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
        // Extract XML text nodes if DOCX/XLSX or readable Arabic/English lines
        const xmlMatches = Array.from(decoded.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>|<t[^>]*>([^<]+)<\/t>/g))
          .map(m => m[1] || m[2] || '')
          .join(' ');
        if (xmlMatches.trim().length > 20) {
          text = xmlMatches;
        } else {
          const cleanLines = decoded
            .replace(/[^\u0600-\u06FF\u0020-\u007E\n\r\t]/g, ' ')
            .split(/\r?\n/)
            .map(l => l.replace(/\s+/g, ' ').trim())
            .filter(l => l.length > 3);
          text = cleanLines.join('\n');
        }
      } else {
        text = await file.text();
      }

      setRawInput(text);

      let detectedFormat: 'auto' | 'text' | 'csv' | 'json' = 'auto';
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
          const validCount = parsed.filter((d) => d.isValid).length || parsed.length;
          const detectedQSec = detectedMetadata.questionTimerSeconds || detectedMetadata.questionDurationSeconds || 0;
          const detectedMin = detectedMetadata.durationMinutes || 0;
          if (detectedQSec > 0 && detectedMin > 0) {
            setTimerDriverMode('questionSeconds');
            setPublishQuestionSeconds(detectedQSec);
            setPublishDurationMinutes(detectedMin);
          } else if (detectedQSec > 0) {
            setTimerDriverMode('questionSeconds');
            setPublishQuestionSeconds(detectedQSec);
            const synced = synchronizeExamTimers({
              questionsCount: validCount,
              durationMinutes: publishDurationMinutes,
              questionDurationSeconds: detectedQSec,
              changedField: 'questionSeconds'
            });
            setPublishDurationMinutes(synced.durationMinutes);
          } else if (detectedMin > 0) {
            setTimerDriverMode('totalMinutes');
            setPublishDurationMinutes(detectedMin);
            const synced = synchronizeExamTimers({
              questionsCount: validCount,
              durationMinutes: detectedMin,
              questionDurationSeconds: publishQuestionSeconds,
              changedField: 'totalMinutes'
            });
            setPublishQuestionSeconds(synced.questionDurationSeconds);
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
          text: `تم قراءة الملف "${file.name}". يمكنك مراجعة النص بالأسفل أو لصق النص مباشرة ثم الضغط على "تحليل ومعاينة الأسئلة".`
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'تعذر قراءة الملف المرفوع. يفضل استخدام ملف نصي (.TXT / .CSV / .JSON) بترميز UTF-8 أو نسخ النص ولصقه مباشرة.'
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
      if (d.options.length >= 10) return d;
      const reindexed = d.options.map((opt, idx) => ({
        ...opt,
        id: getOptionIdByIndex(idx)
      }));
      const oldCorrectIdx = d.options.findIndex((o) => o.id === d.correctOptionId);
      const nextIdx = reindexed.length;
      const optId = getOptionIdByIndex(nextIdx);
      return {
        ...d,
        options: [
          ...reindexed,
          { id: optId, textArabic: '', explanationArabic: '' }
        ],
        correctOptionId: oldCorrectIdx >= 0 ? getOptionIdByIndex(oldCorrectIdx) : (reindexed[0]?.id || 'opt-a')
      };
    });
  };

  const handleRemoveOption = (tempId: string, optId: string) => {
    updateDraftItem(tempId, (d) => {
      if (d.options.length <= 2) return d;
      const filteredRaw = d.options.filter((o) => o.id !== optId);
      const oldCorrectWasRemoved = d.correctOptionId === optId;
      const oldCorrectRemainingIdx = filteredRaw.findIndex((o) => o.id === d.correctOptionId);
      const reindexed = filteredRaw.map((opt, idx) => ({
        ...opt,
        id: getOptionIdByIndex(idx)
      }));
      const correctId =
        oldCorrectWasRemoved || oldCorrectRemainingIdx < 0
          ? (reindexed[0]?.id || 'opt-a')
          : getOptionIdByIndex(oldCorrectRemainingIdx);
      return {
        ...d,
        options: reindexed,
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

  // Verification input & automated pre-publish report
  const verificationInput = useMemo(() => {
    const selectedDrafts = drafts.filter((d) => d.selectedForImport);
    const itemsToVerify = selectedDrafts.length > 0 ? selectedDrafts : drafts;
    return {
      titleArabic: publishMode === 'bank_only' ? bank.titleArabic : (publishTitle || bank.titleArabic),
      assessmentType: publishMode === 'competition_only' ? ('competition' as const) : publishMode === 'exam_only' ? ('exam' as const) : ('bank' as const),
      language: examLanguage,
      studyLevelName: currentStudyLevelTitle,
      blockName: publishBlockName || bank.blockName || bank.titleArabic,
      durationMinutes: publishDurationMinutes,
      questionDurationSeconds: publishQuestionSeconds,
      questions: itemsToVerify
    };
  }, [drafts, publishMode, publishTitle, bank.titleArabic, bank.blockName, examLanguage, currentStudyLevelTitle, publishBlockName, publishDurationMinutes, publishQuestionSeconds]);

  const verificationReport = useMemo(
    () => evaluateQuizVerificationReport(verificationInput),
    [verificationInput]
  );

  const verificationFormattedText = useMemo(
    () => formatQuizVerificationText(verificationInput),
    [verificationInput]
  );

  const handleCopyQuizAsText = async () => {
    try {
      await navigator.clipboard.writeText(verificationFormattedText);
      setCopiedVerifyText(true);
      setFeedback({
        type: 'success',
        text: 'تم نسخ الاختبار بالكامل كنص منسق (مع مفتاح الإجابات والتعليلات) إلى الحافظة للمراجعة.'
      });
      setTimeout(() => setCopiedVerifyText(false), 3000);
    } catch {
      setFeedback({
        type: 'error',
        text: 'تعذر النسخ التلقائي، يمكنك فتح نافذة الفحص ونسخ النص يدوياً.'
      });
    }
  };

  const handleDownloadVerificationSheet = (format: 'txt' | 'html' | 'json') => {
    downloadQuizVerificationFile(verificationInput, format);
    setFeedback({
      type: 'success',
      text:
        format === 'txt'
          ? 'تم تحميل ملف فحص الاختبار النصي (.TXT) بنجاح.'
          : format === 'html'
          ? 'تم تحميل وثيقة المراجعة والطباعة (.HTML) بنجاح.'
          : 'تم تحميل نسخة احتياطية من الاختبار (.JSON) بنجاح.'
    });
  };

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
      // 1. Update bank metadata (universityId, language, questionTypeMode, studyLevelId, studyPeriodId, courseOfferingId, blockName) if changed, and save imported questions
      if (
        bank.universityId !== publishUniversityId ||
        bank.language !== examLanguage ||
        bank.questionTypeMode !== questionTypeMode ||
        bank.studyLevelId !== publishStudyLevelId ||
        bank.studyPeriodId !== publishPeriodId ||
        bank.courseOfferingId !== publishCourseId ||
        bank.blockName !== publishBlockName
      ) {
        updateQuestionBank(bank.id, {
          universityId: publishUniversityId,
          language: examLanguage,
          questionTypeMode,
          studyLevelId: publishStudyLevelId,
          ...(publishPeriodId ? { studyPeriodId: publishPeriodId } : {}),
          ...(publishCourseId ? { courseOfferingId: publishCourseId } : {}),
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
            universityId: publishUniversityId || bank.universityId || 'univ-dar-al-salam',
            programId: bank.programId || 'prog-mbbs',
            studyLevelId: publishStudyLevelId || bank.studyLevelId || defaultStudyLevelId || 'lvl-2',
            ...(publishPeriodId ? { studyPeriodId: publishPeriodId } : {}),
            ...(publishCourseId ? { courseOfferingId: publishCourseId } : {}),
            blockName: publishBlockName || bank.titleArabic,
            durationMinutes: durationVal,
            enableExamTimer: durationVal > 0,
            questionDurationSeconds: Number(publishQuestionSeconds) || 0,
            perQuestionSeconds: Number(publishQuestionSeconds) || 0,
            questionTimerSeconds: Number(publishQuestionSeconds) || 0,
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

  const accuracyPercent = stats.total > 0 ? Math.round((stats.valid / stats.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-0 sm:p-3 overflow-hidden"
      dir="rtl"
    >
      <div className="bg-slate-900 border-0 sm:border sm:border-slate-800 sm:rounded-2xl w-full max-w-5xl h-[100dvh] sm:h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Responsive Top Header & 3-Step Guided Wizard with Progress Bar */}
        <div className="px-3 py-2.5 sm:px-5 sm:py-3.5 bg-slate-950 border-b border-slate-800 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-white truncate">
                معالج الاستيراد الجماعي للأسئلة — {bank.titleArabic}
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border shrink-0 ${
                  isOnline
                    ? 'bg-emerald-950/80 border-emerald-700/70 text-emerald-300'
                    : 'bg-amber-950/80 border-amber-700/70 text-amber-300'
                }`}
              >
                {isOnline ? <Wifi className="w-3 h-3 shrink-0" /> : <WifiOff className="w-3 h-3 shrink-0" />}
                <span>{isOnline ? 'متصل' : 'أوفلاين'}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3-Step Wizard Buttons + Top Visual Progress Bar */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setStep('input')}
                className={`px-2 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 truncate ${
                  step === 'input'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-black/25 text-[10px] font-mono flex items-center justify-center shrink-0">
                  1
                </span>
                <span className="truncate">إدخال الأسئلة</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (drafts.length > 0) setStep('review');
                  else if (rawInput.trim()) handleParseInput();
                }}
                className={`px-2 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 truncate ${
                  step === 'review'
                    ? 'bg-teal-600 text-white shadow'
                    : drafts.length > 0
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    : 'text-slate-500'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-black/25 text-[10px] font-mono flex items-center justify-center shrink-0">
                  2
                </span>
                <span className="truncate">المعاينة والتدقيق الذكي ({drafts.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (drafts.length > 0) setStep('categorize');
                  else if (rawInput.trim()) {
                    handleParseInput();
                  }
                }}
                className={`px-2 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 truncate ${
                  step === 'categorize'
                    ? 'bg-teal-600 text-white shadow'
                    : drafts.length > 0
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    : 'text-slate-500'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-black/25 text-[10px] font-mono flex items-center justify-center shrink-0">
                  3
                </span>
                <span className="truncate">التصنيف والاعتماد الأكاديمي</span>
              </button>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-l from-teal-500 to-emerald-400 transition-all duration-300"
                style={{ width: step === 'input' ? '33.33%' : step === 'review' ? '66.66%' : '100%' }}
              />
            </div>
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
          {/* STEP 1: QUESTION INPUT (PASTE TEXT, UPLOAD .DOCX/.PDF/.XLSX/.TXT/.CSV, DOWNLOAD TEMPLATES, OR AI STUDIO) */}
          {step === 'input' && (
            <div className="space-y-4">
              {/* Row 1: Input Mode Toggle (Paste/File vs AI Studio) + Language & Question Type Mode */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-6 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    طريقة إدخال الأسئلة (الخطوة 1):
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInputSource('manual')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                        inputSource === 'manual'
                          ? 'bg-teal-600 text-white border-teal-500 shadow-md'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
                      }`}
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>لصق نص / رفع ملف</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInputSource('ai')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                        inputSource === 'ai'
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white'
                      }`}
                    >
                      <Wand2 className="w-4 h-4 shrink-0" />
                      <span>التوليد الذكي (AI)</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    لغة الأسئلة:
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setExamLanguage('ar')}
                      className={`py-2 px-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                        examLanguage === 'ar'
                          ? 'bg-teal-600 text-white border-teal-500'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      عربي
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamLanguage('en')}
                      className={`py-2 px-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                        examLanguage === 'en'
                          ? 'bg-teal-600 text-white border-teal-500'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      onClick={() => setExamLanguage('bilingual')}
                      className={`py-2 px-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                        examLanguage === 'bilingual'
                          ? 'bg-teal-600 text-white border-teal-500'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      ثنائي
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <label className="text-xs font-bold text-slate-300 block">
                    نمط الأسئلة المستهدفة:
                  </label>
                  <select
                    value={questionTypeMode}
                    onChange={(e) => setQuestionTypeMode(e.target.value as BankQuestionTypeMode)}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-indigo-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="hybrid">هجين شامل (كل الأنماط)</option>
                    <option value="mcq">اختيارات من متعدد (MCQ)</option>
                    <option value="true_false">صح وخطأ (True/False)</option>
                    <option value="fill_blank">إكمال الفراغ (Fill Blank)</option>
                    <option value="essay">أسئلة مقالية (Essay)</option>
                  </select>
                </div>
              </div>

              {/* Row 2: File Upload (.docx, .pdf, .xlsx, .txt, .csv, .json) & Sample Template Downloads */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.pdf,.xlsx,.txt,.md,.csv,.tsv,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع ملف أسئلة (.DOCX / .PDF / .XLSX / .TXT / .CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('txt')}
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل قالب نصي (.TXT)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('csv')}
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل قالب جدول (.CSV / Excel)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTemplateModal(true)}
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>استعراض القوالب الإرشادية</span>
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

              {/* Optional AI Studio Prompt & Direct Generation Panel (When AI mode is selected) */}
              {inputSource === 'ai' && (
                <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-800/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <span>استوديو التوليد الطبي الذكي (Medical AI Prompt Studio):</span>
                      </h4>
                      <p className="text-[11px] text-indigo-300/80 mt-0.5">
                        انسخ البرومبت الطبي لـ ChatGPT أو Gemini أو ولّد الأسئلة مباشرة بنقرة واحدة
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAiSettingsModal(true)}
                        className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-indigo-500/40 text-indigo-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <span>⚙️ إعدادات الذكاء والعدد</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(generatedAiPrompt);
                            setFeedback({
                              type: 'success',
                              text: 'تم نسخ موجه الأمر الطبي المخصص بنجاح! الصقه في ChatGPT أو Gemini ثم الصق الأسئلة بالأسفل ✓'
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
                        className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors"
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
                    dir="auto"
                    value={generatedAiPrompt}
                    rows={3}
                    className="w-full p-3 rounded-xl bg-slate-950/90 border border-indigo-900/80 text-[11px] text-slate-300 font-mono leading-relaxed focus:outline-none"
                  />
                </div>
              )}

              {/* Spacious Textarea for Pasting or Editing Questions */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <span>
                    الصق نص الأسئلة هنا (يدعم النسخ المباشر من Word أو PDF أو Excel أو مخرجات الذكاء الاصطناعي):
                  </span>
                  <span className="text-slate-500 font-mono text-[11px] tabular-nums">{rawInput.length} حرف</span>
                </div>
                <textarea
                  dir="auto"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={
                    examLanguage === 'en'
                      ? `Example:\nLanguage: English\nTitle: Second Year Hematology Exam\n\n1. Which heart valve lies between the left ventricle and the aorta?\nA) Mitral Valve\nB) Aortic Valve * (Rationale: Correct, separates LV from aorta)\nC) Tricuspid Valve\nD) Pulmonary Valve\nAnswer: B\nRationale: The aortic valve prevents regurgitation from the aorta into the left ventricle.`
                      : `مثال:\nاللغة: ${examLanguage === 'bilingual' ? 'ثنائي اللغة' : 'عربي'}\n1. ما هو الصمام القلبي الفاصل بين البطين الأيسر والشريان الأبهر؟\nأ) الصمام التاجي\nب) الصمام الأبهري *\nج) الصمام ثلاثي الشرف\nد) الصمام الرئوي\nالإجابة: ب`
                  }
                  className="w-full min-h-[260px] sm:min-h-[320px] p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-white leading-relaxed focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
          )}

          {/* STEP 2: SMART PREVIEW, ACCURACY STATS & INLINE EDITING */}
          {step === 'review' && (
            <div className="space-y-3">
              {/* Smart Extraction Accuracy & Validation Statistics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-teal-500/40 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block">نسبة الدقة والجاهزية</span>
                    <span className="text-base font-black text-teal-300 font-mono tabular-nums mt-0.5 block">
                      {accuracyPercent}%
                    </span>
                  </div>
                  <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0" />
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">إجمالي الأسئلة المستخرجة</span>
                  <span className="text-base font-black text-white font-mono tabular-nums mt-0.5 block">
                    {stats.total}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-emerald-800/50">
                  <span className="text-[10px] text-slate-400 block">أسئلة صالحة وجاهزة</span>
                  <span className="text-base font-black text-emerald-400 font-mono tabular-nums mt-0.5 block">
                    {stats.valid}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-rose-800/50">
                  <span className="text-[10px] text-slate-400 block">تحتاج مراجعة وتصحيح</span>
                  <span className="text-base font-black text-rose-400 font-mono tabular-nums mt-0.5 block">
                    {stats.withErrors}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-amber-800/50 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-400 block">أسئلة مكررة</span>
                  <span className="text-base font-black text-amber-400 font-mono tabular-nums mt-0.5 block">
                    {stats.duplicates}
                  </span>
                </div>
              </div>

              {/* Auto-Detected Assessment Header Banner */}
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
                    onClick={() => setFilter('errors')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border ${
                      filter === 'errors'
                        ? 'bg-rose-600 text-white border-rose-500'
                        : 'bg-slate-900 text-rose-400 border-slate-800'
                    }`}
                  >
                    تحتاج مراجعة ({stats.withErrors})
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

              {/* PRE-PUBLISH VERIFICATION, COPY AS TEXT & FILE EXPORT BAR */}
              <div className="p-2.5 rounded-xl bg-gradient-to-r from-teal-950/50 via-slate-900 to-indigo-950/40 border border-teal-500/30 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-white">أدوات التأكد وفحص الاختبار قبل النشر</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          verificationReport.isReadyToPublish && verificationReport.warningChecksCount === 0
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                            : verificationReport.isReadyToPublish
                            ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                            : 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                        }`}
                      >
                        {verificationReport.isReadyToPublish && verificationReport.warningChecksCount === 0
                          ? 'مفحوص بالكامل وجاهز للنشر'
                          : verificationReport.isReadyToPublish
                          ? `جاهز للنشر (${verificationReport.warningChecksCount} تنبيه مراجعة)`
                          : `يوجد ${verificationReport.errorChecksCount} خطأ يحتاج تصحيح`}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      انسخ الاختبار كنص أو حمّله كملف للتأكد من صحة إدخال جميع الأسئلة والخيارات ومفتاح الإجابات قبل النشر
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyQuizAsText}
                    disabled={drafts.length === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-teal-300 flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    title="نسخ الاختبار بالكامل مع الخيارات والإجابات الصحيحة كنص للمراجعة"
                  >
                    {copiedVerifyText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedVerifyText ? 'تم نسخ النص!' : 'نسخ الاختبار كنص'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadVerificationSheet('txt')}
                    disabled={drafts.length === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-sky-300 flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    title="تحميل ملف نصي (.TXT) يحتوي على كافة الأسئلة ومفتاح الحل"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل نص (.TXT)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadVerificationSheet('html')}
                    disabled={drafts.length === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-amber-300 flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    title="تحميل وثيقة مراجعة وطباعة منسقة (.HTML / PDF)"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>تحميل وثيقة مراجعة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVerifyViewTab('summary');
                      setShowPrePublishVerifyModal(true);
                    }}
                    disabled={drafts.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-teal-600/25 hover:bg-teal-600/40 border border-teal-500/50 text-[11px] font-black text-teal-200 flex items-center gap-1.5 transition-colors disabled:opacity-40"
                  >
                    <Eye className="w-3.5 h-3.5 text-teal-300" />
                    <span>فحص وتأكيد القيم ({stats.selectedValid})</span>
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

                        {/* Question Stem Input (Multi-line spacious textarea with dir="auto") */}
                        <textarea
                          dir="auto"
                          value={draft.stemArabic}
                          onChange={(e) =>
                            updateDraftItem(draft.tempId, (d) => ({
                              ...d,
                              stemArabic: e.target.value,
                              ...(isEnQuestion ? { stemEnglish: e.target.value } : {})
                            }))
                          }
                          rows={3}
                          placeholder={isEnQuestion ? 'Medical question stem in English...' : 'نص السؤال الطبي...'}
                          className="w-full min-h-[5.5rem] p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm text-white font-semibold leading-relaxed focus:outline-none focus:border-teal-500 resize-y"
                        />

                        {/* Bilingual Secondary English Stem (Multi-line textarea) */}
                        {(qLang === 'bilingual' || (draft.stemEnglish && draft.stemEnglish !== draft.stemArabic)) && (
                          <textarea
                            rows={2}
                            dir="auto"
                            value={draft.stemEnglish || ''}
                            onChange={(e) =>
                              updateDraftItem(draft.tempId, (d) => ({
                                ...d,
                                stemEnglish: e.target.value
                              }))
                            }
                            placeholder="English question stem (for bilingual mode)..."
                            className="w-full min-h-[3.25rem] p-2.5 rounded-xl bg-slate-900/70 border border-indigo-900/60 text-xs text-indigo-200 leading-relaxed focus:outline-none focus:border-indigo-400 resize-y"
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
                              dir="auto"
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
                              dir="auto"
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
                              className="w-full p-2.5 rounded-lg bg-slate-950 border border-purple-900 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400 leading-relaxed resize-y"
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
                                    <div className="flex items-start gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateDraftItem(draft.tempId, (d) => ({
                                            ...d,
                                            correctOptionId: opt.id
                                          }))
                                        }
                                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-colors mt-0.5 ${
                                          isCorrect
                                            ? 'bg-teal-600 text-white shadow'
                                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                        }`}
                                        title="اضغط لاعتماد هذا الخيار كإجابة صحيحة"
                                      >
                                        {isCorrect ? `✓ ${letterDisplay}` : letterDisplay}
                                      </button>

                                      <textarea
                                        rows={2}
                                        dir="auto"
                                        value={sanitizeOptionTextForDisplay(opt.textArabic)}
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
                                        className="flex-1 min-w-0 w-full min-h-[3.25rem] p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-white leading-relaxed focus:outline-none focus:border-teal-500 resize-y"
                                      />

                                      {draft.options.length > 2 && (
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveOption(draft.tempId, opt.id)}
                                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors shrink-0 mt-0.5"
                                          title="حذف هذا الخيار"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>

                                    {/* Option-Specific Explanation / Rationale */}
                                    <input
                                      type="text"
                                      dir="auto"
                                      value={opt.explanationArabic || opt.explanation || extractOptionAndExplanation(opt.textArabic).explanation || ''}
                                      onChange={(e) =>
                                        updateDraftItem(draft.tempId, (d) => ({
                                          ...d,
                                          options: d.options.map((o) =>
                                            o.id === opt.id ? { ...o, explanationArabic: e.target.value, explanation: e.target.value } : o
                                          )
                                        }))
                                      }
                                      placeholder={
                                        isEnQuestion
                                          ? `Rationale for Option (${letterDisplay}) (optional)...`
                                          : `تعليل الخيار (${letterDisplay}): سبب صحته أو خطئه (اختياري)...`
                                      }
                                      className="w-full px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
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
                              dir="auto"
                              value={draft.explanationArabic || ''}
                              onChange={(e) =>
                                updateDraftItem(draft.tempId, (d) => ({
                                  ...d,
                                  explanationArabic: e.target.value
                                }))
                              }
                              rows={2}
                              placeholder="شرح سبب صحة الإجابة المختارة..."
                              className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white leading-relaxed focus:outline-none focus:border-teal-500 resize-y"
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

          {/* STEP 3: ACADEMIC CATEGORIZATION & FINAL APPROVAL (الخطوة 3: التصنيف والاعتماد الأكاديمي) */}
          {step === 'categorize' && (
            <div className="space-y-4">
              {/* 1. Academic Categorization Selectors (University -> Level -> Study Period/Block -> Course) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">1. التصنيف والارتباط بالهيكل الأكاديمي</h4>
                      <p className="text-[11px] text-slate-400">
                        حدد الجامعة، المستوى الدراسي، الفترة الدراسية (البلوك)، والمقرر لحفظ الأسئلة وتوجيهها للطلاب بدقة
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">الجامعة:</label>
                    <select
                      value={publishUniversityId}
                      onChange={(e) => setPublishUniversityId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-bold focus:outline-none focus:border-teal-500"
                    >
                      {universities.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nameArabic}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">المستوى الدراسي:</label>
                    <select
                      value={publishStudyLevelId}
                      onChange={(e) => {
                        const newLvl = e.target.value;
                        setPublishStudyLevelId(newLvl);
                        const matched = (studyLevels || []).find((l) => l.id === newLvl);
                        saveUserAcademicContext({
                          studyLevelId: newLvl,
                          studyLevelName: matched?.titleArabic
                        });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-teal-300 font-bold focus:outline-none focus:border-teal-500"
                    >
                      {(studyLevels || []).map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.stageType === 'internship' ? 'سنة الامتياز الطبي' : `السنة ${lvl.order} - ${lvl.titleArabic}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">الفترة الدراسية / البلوك الطبي:</label>
                    <select
                      value={publishPeriodId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setPublishPeriodId(pid);
                        const matchedBlock = liveBlocks.find((b) => b.id === pid);
                        if (matchedBlock) {
                          setPublishBlockName(matchedBlock.titleArabic);
                          setAiTopic(matchedBlock.titleArabic);
                          saveUserAcademicContext({
                            studyPeriodId: matchedBlock.id,
                            studyPeriodName: matchedBlock.titleArabic
                          });
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 font-bold focus:outline-none focus:border-teal-500"
                    >
                      <option value="">-- اختر الفترة الدراسية / البلوك --</option>
                      {liveBlocks.map((blk) => (
                        <option key={blk.id} value={blk.id}>
                          {blk.titleArabic} {blk.code ? `(${blk.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">المقرر الدراسي:</label>
                    <select
                      value={publishCourseId}
                      onChange={(e) => setPublishCourseId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-indigo-300 font-bold focus:outline-none focus:border-teal-500"
                    >
                      <option value="">-- عام لجميع مقررات البلوك --</option>
                      {coursesForBlock.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.titleArabic} {c.code ? `(${c.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] font-bold mb-1">
                    اسم البلوك أو التصنيف الظاهر للطلاب:
                  </label>
                  <input
                    type="text"
                    value={publishBlockName}
                    onChange={(e) => {
                      setPublishBlockName(e.target.value);
                      setAiTopic(e.target.value);
                    }}
                    placeholder="مثال: بلوك القلب والجهاز الدوري (Cardiovascular)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:border-teal-500 focus:outline-none text-xs"
                  />
                </div>
              </div>

              {/* 2. Approval & Publishing Mode Selection */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">2. طريقة الاعتماد والنشر للطلاب</h4>
                      <p className="text-[11px] text-slate-400">
                        اختر ما إذا كنت تريد حفظ الأسئلة في البنك فقط أو إطلاقها فوراً كاختبار أكاديمي أو مسابقة تنافسية
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSelectPublishMode('bank_only')}
                    className={`p-3.5 rounded-xl border text-right transition-all space-y-1 ${
                      publishMode === 'bank_only'
                        ? 'bg-teal-950/60 border-teal-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-black text-xs flex items-center justify-between">
                      <span>حفظ في بنك الأسئلة فقط</span>
                      {publishMode === 'bank_only' && <CheckCircle2 className="w-4 h-4 text-teal-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      إضافة الأسئلة إلى ({bank.titleArabic}) لاستخدامها لاحقاً
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPublishMode('exam_only')}
                    className={`p-3.5 rounded-xl border text-right transition-all space-y-1 ${
                      publishMode === 'exam_only'
                        ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-black text-xs flex items-center justify-between">
                      <span>نشر كاختبار أكاديمي</span>
                      {publishMode === 'exam_only' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      حفظ الأسئلة وإطلاق اختبار رسمي للدفعة فوراً
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPublishMode('competition_only')}
                    className={`p-3.5 rounded-xl border text-right transition-all space-y-1 ${
                      publishMode === 'competition_only'
                        ? 'bg-amber-950/60 border-amber-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-black text-xs flex items-center justify-between">
                      <span>نشر كمسابقة طبية تنافسية</span>
                      {publishMode === 'competition_only' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      إطلاق مسابقة سريعة مع لوحة صدارة وتوقيت لكل سؤال
                    </p>
                  </button>
                </div>

                {publishMode !== 'bank_only' && (
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3 pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-slate-300 font-bold mb-1">
                          {publishMode === 'competition_only' ? 'عنوان المسابقة الطبية:' : 'عنوان الاختبار الأكاديمي:'}
                        </label>
                        <input
                          type="text"
                          value={publishTitle}
                          onChange={(e) => setPublishTitle(e.target.value)}
                          placeholder={publishMode === 'competition_only' ? 'عنوان المسابقة الطبية...' : 'عنوان الاختبار الأكاديمي...'}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-bold mb-1">مدة توفر التقييم للطلاب:</label>
                        <select
                          value={publishAvailabilityHours}
                          onChange={(e) => setPublishAvailabilityHours(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-emerald-300 font-bold"
                        >
                          <option value={24}>متاح لمدة 24 ساعة</option>
                          <option value={72}>متاح لمدة 3 أيام</option>
                          <option value={168}>متاح لمدة 7 أيام</option>
                          <option value={720}>متاح لمدة 30 يوماً</option>
                        </select>
                      </div>
                    </div>

                    {/* Bidirectional Question Timer <-> Total Exam Timer Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-3 rounded-xl border border-indigo-800/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-indigo-300 font-bold">وقت السؤال (ثانية):</span>
                          <input
                            type="number"
                            min={0}
                            max={600}
                            value={publishQuestionSeconds}
                            onChange={(e) => handleQuestionSecondsChange(Number(e.target.value))}
                            className="w-16 px-2 py-1 rounded-lg bg-slate-900 border border-indigo-700 text-xs text-indigo-200 font-mono font-bold text-center"
                          />
                        </div>

                        <span className="text-slate-500 font-bold">⇄</span>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-amber-300 font-bold">الوقت الكلي (دقيقة):</span>
                          <input
                            type="number"
                            min={0}
                            max={600}
                            value={publishDurationMinutes}
                            onChange={(e) => handleDurationMinutesChange(Number(e.target.value))}
                            className="w-16 px-2 py-1 rounded-lg bg-slate-900 border border-amber-700 text-xs text-amber-200 font-mono font-bold text-center"
                          />
                        </div>
                      </div>

                      <span className="text-[11px] text-teal-300 font-bold bg-teal-950/60 border border-teal-800/50 px-2.5 py-1 rounded-lg tabular-nums">
                        {stats.selectedValid} سؤال × {publishQuestionSeconds}ث ≈ {publishDurationMinutes} دقيقة
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Final Summary & Pre-Publish Diagnostic Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-950/50 via-slate-900 to-indigo-950/40 border border-teal-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                    <span className="font-black text-white">
                      ملخص الدفعة الجاهزة للاعتماد والحفظ: {stats.selectedValid} سؤال صالح (بنسبة دقة {accuracyPercent}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    المسار الأكاديمي: {universities.find(u => u.id === publishUniversityId)?.nameArabic || 'الجامعة'} · {currentStudyLevelTitle} · {publishBlockName || bank.titleArabic}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setVerifyViewTab('summary');
                    setShowPrePublishVerifyModal(true);
                  }}
                  disabled={drafts.length === 0}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-teal-500/40 text-teal-300 font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>معاينة التقرير النهائي ومفتاح الحل</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* COMPACT BOTTOM FOOTER WITH STEP WIZARD NAVIGATION */}
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
                onClick={() => handleParseInput()}
                disabled={!rawInput.trim()}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تحليل الأسئلة والانتقال للمعاينة والتدقيق (الخطوة 2)</span>
                <span className="font-mono">←</span>
              </button>
            </div>
          ) : step === 'review' ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep('input')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                → الرجوع لإدخال الأسئلة (الخطوة 1)
              </button>

              <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
                <button
                  type="button"
                  onClick={handleCopyQuizAsText}
                  disabled={drafts.length === 0}
                  className="hidden sm:flex px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-300 text-xs font-bold items-center gap-1.5 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ كنص</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('categorize')}
                  disabled={stats.selectedValid === 0}
                  className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <span>التالي: التصنيف والاعتماد الأكاديمي (الخطوة 3)</span>
                  <span className="font-mono">←</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep('review')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold shrink-0"
              >
                → الرجوع للمعاينة والتدقيق (الخطوة 2)
              </button>

              <div className="flex items-center gap-2 flex-1 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setVerifyViewTab('summary');
                    setShowPrePublishVerifyModal(true);
                  }}
                  disabled={drafts.length === 0}
                  className="hidden sm:flex px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-teal-300 text-xs font-bold items-center gap-1.5 shrink-0"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>فحص القيم</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveSelected}
                  disabled={saving || stats.selectedValid === 0}
                  className={`flex-1 sm:flex-initial sm:min-w-[260px] py-2.5 px-6 rounded-xl disabled:opacity-40 text-white text-xs font-black shadow-lg flex items-center justify-center gap-2 transition-colors ${
                    publishMode === 'competition_only'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-teal-600 hover:bg-teal-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {saving
                      ? 'جاري الحفظ والاعتماد...'
                      : publishMode === 'exam_only'
                      ? `حفظ ونشر الاختبار دفعة واحدة (${stats.selectedValid} سؤال)`
                      : publishMode === 'competition_only'
                      ? `حفظ ونشر المسابقة دفعة واحدة (${stats.selectedValid} سؤال)`
                      : `حفظ ونشر الأسئلة في البنك (${stats.selectedValid} سؤال)`}
                  </span>
                </button>
              </div>
            </div>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-white text-xs">طريقة تحديد عدد الأسئلة</div>
                    <div className="text-[11px] text-slate-400">
                      {isDynamicQuestionCount
                        ? 'توليد تلقائي ديناميكي غير محدود حسب كثافة المحتوى الطبي'
                        : 'تحديد حر ومفتوح لعدد الأسئلة في كل نمط (حتى 500 سؤال)'}
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
                    {isDynamicQuestionCount ? 'ديناميكي تلقائي ✓' : 'تخصيص عدد محدد'}
                  </button>
                </div>

                {/* Quick Presets for Question Count */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 ml-1">اختيار سريع للعدد:</span>
                  <button
                    type="button"
                    onClick={() => setIsDynamicQuestionCount(true)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                      isDynamicQuestionCount
                        ? 'bg-teal-600/25 border-teal-500 text-teal-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    شامل تلقائي
                  </button>
                  {[5, 10, 15, 20, 30, 50, 100].map((preset) => {
                    const isPresetActive =
                      !isDynamicQuestionCount &&
                      ((questionTypeMode === 'true_false' && aiTfCount === preset) ||
                        (questionTypeMode === 'fill_blank' && aiFillBlankCount === preset) ||
                        (questionTypeMode === 'essay' && aiEssayCount === preset) ||
                        ((questionTypeMode === 'mcq' || questionTypeMode === 'hybrid') && aiMcqCount === preset));
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setIsDynamicQuestionCount(false);
                          if (questionTypeMode === 'true_false') {
                            setAiTfCount(preset);
                          } else if (questionTypeMode === 'fill_blank') {
                            setAiFillBlankCount(preset);
                          } else if (questionTypeMode === 'essay') {
                            setAiEssayCount(preset);
                          } else {
                            setAiMcqCount(preset);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all ${
                          isPresetActive
                            ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>

                {!isDynamicQuestionCount && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="block text-slate-300 text-[10px] mb-1 font-semibold">MCQ (اختيارات):</label>
                      <input
                        type="number"
                        min={0}
                        max={500}
                        value={aiMcqCount}
                        onChange={(e) => setAiMcqCount(Math.min(500, Math.max(0, Number(e.target.value) || 0)))}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 text-[10px] mb-1 font-semibold">صح / خطأ:</label>
                      <input
                        type="number"
                        min={0}
                        max={500}
                        value={aiTfCount}
                        onChange={(e) => setAiTfCount(Math.min(500, Math.max(0, Number(e.target.value) || 0)))}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 text-[10px] mb-1 font-semibold">إكمال الفراغ:</label>
                      <input
                        type="number"
                        min={0}
                        max={500}
                        value={aiFillBlankCount}
                        onChange={(e) => setAiFillBlankCount(Math.min(500, Math.max(0, Number(e.target.value) || 0)))}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 text-[10px] mb-1 font-semibold">مقالي / سريري:</label>
                      <input
                        type="number"
                        min={0}
                        max={500}
                        value={aiEssayCount}
                        onChange={(e) => setAiEssayCount(Math.min(500, Math.max(0, Number(e.target.value) || 0)))}
                        className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Options Count (Dynamic 2 to 10 options) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-slate-200 font-bold">
                    عدد خيارات سؤال الاختيار من متعدد (2 إلى 10 خيارات):
                  </label>
                  <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-[11px] font-bold">
                    {aiOptionsCount} خيارات ({ENGLISH_LETTERS.slice(0, aiOptionsCount).join(', ')})
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {[2, 3, 4, 5, 6, 7, 8].map((optCnt) => (
                    <button
                      key={optCnt}
                      type="button"
                      onClick={() => setAiOptionsCount(optCnt)}
                      className={`py-1.5 px-3 rounded-xl border text-center font-bold transition-all ${
                        aiOptionsCount === optCnt
                          ? 'bg-indigo-600/25 border-indigo-500 text-indigo-200 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {optCnt} خيارات
                    </button>
                  ))}

                  <div className="flex items-center gap-1.5 mr-auto">
                    <span className="text-[11px] text-slate-400">عدد مخصص:</span>
                    <input
                      type="number"
                      min={2}
                      max={10}
                      value={aiOptionsCount}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) {
                          setAiOptionsCount(Math.min(10, Math.max(2, Math.floor(val))));
                        }
                      }}
                      className="w-16 px-2 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-center font-mono font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
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
                        setStep('input');
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
                        setStep('input');
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

      {/* 4. Pre-Publish Verification, Export & Confirmation Modal (نافذة التأكد الشامل قبل النشر) */}
      {showPrePublishVerifyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" dir="rtl">
          <div className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-4xl w-full max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-4 py-3.5 sm:px-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    التأكد النهائي وفحص القيم قبل النشر
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    مراجعة شاملة لصحة الأسئلة ومفتاح الإجابات مع إمكانية نسخ الاختبار كنص أو تحميله كملف
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrePublishVerifyModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-header Toolbar: Tabs + Copy/Download Buttons */}
            <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setVerifyViewTab('summary')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    verifyViewTab === 'summary'
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  تقرير الفحص ومفتاح الإجابات
                </button>
                <button
                  type="button"
                  onClick={() => setVerifyViewTab('text')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    verifyViewTab === 'text'
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  معاينة النص الكامل للاختبار
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyQuizAsText}
                  className="px-3 py-1.5 rounded-xl bg-teal-950/80 hover:bg-teal-900 border border-teal-600/50 text-teal-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  {copiedVerifyText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedVerifyText ? 'تم النسخ للحافظة!' : 'نسخ الاختبار كنص'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadVerificationSheet('txt')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ملف نصي (.TXT)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadVerificationSheet('html')}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>وثيقة مراجعة (.HTML)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadVerificationSheet('json')}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-purple-300 text-xs font-bold flex items-center gap-1 transition-colors"
                  title="تحميل نسخة احتياطية بصيغة JSON"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Summary Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">وجهة النشر</span>
                  <span className="text-xs font-black text-teal-300 mt-0.5 block">
                    {publishMode === 'competition_only'
                      ? 'مسابقة طبية تنافسية'
                      : publishMode === 'exam_only'
                      ? 'اختبار أكاديمي'
                      : 'بنك الأسئلة فقط'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">الأسئلة الجاهزة للنشر</span>
                  <span className="text-sm font-black text-emerald-400 font-mono mt-0.5 block">
                    {stats.selectedValid} / {verificationReport.totalQuestions}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">إجمالي الدرجات</span>
                  <span className="text-sm font-black text-amber-300 font-mono mt-0.5 block">
                    {verificationReport.totalPoints} درجة
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">تغطية التعليل العلمي</span>
                  <span className="text-sm font-black text-indigo-300 font-mono mt-0.5 block">
                    {verificationReport.withExplanationCount} / {verificationReport.totalQuestions}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-400 block">توزيع أنماط الأسئلة</span>
                  <span className="text-[11px] font-bold text-slate-200 mt-0.5 block">
                    MCQ: {verificationReport.byType.mcq} | صح/خطأ: {verificationReport.byType.true_false} | مقالي/فراغ: {verificationReport.byType.fill_blank + verificationReport.byType.essay}
                  </span>
                </div>
              </div>

              {verifyViewTab === 'summary' ? (
                <>
                  {/* Automated Diagnostic Checklist */}
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2.5">
                    <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-400" />
                      <span>نتائج الفحص الآلي لسلامة القيم والبرمجة ({verificationReport.checks.length} فحوصات):</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {verificationReport.checks.map((chk) => (
                        <div
                          key={chk.id}
                          className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                            chk.status === 'pass'
                              ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                              : chk.status === 'warning'
                              ? 'bg-amber-950/25 border-amber-700/50 text-amber-200'
                              : 'bg-rose-950/30 border-rose-700/60 text-rose-200'
                          }`}
                        >
                          {chk.status === 'pass' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : chk.status === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-[11px]">{chk.titleArabic}</div>
                            <div className="text-[10px] opacity-85 leading-relaxed mt-0.5">{chk.detailArabic}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Answer Key Verification Table */}
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-teal-300">
                        جدول التحقق السريع من مفتاح الإجابات الصحيحة ({verificationReport.answerKeyRows.length} سؤال):
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        تأكد من مطابقة الإجابة المعتمدة لكل سؤال قبل النشر للطلاب
                      </span>
                    </div>

                    <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800/70">
                      {verificationReport.answerKeyRows.map((row) => (
                        <div
                          key={row.questionNumber}
                          className={`px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] ${
                            row.isValid ? 'bg-slate-900/60 hover:bg-slate-900' : 'bg-rose-950/30'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-teal-300 font-mono font-bold shrink-0">
                              س{row.questionNumber}
                            </span>
                            <span className="text-slate-200 truncate font-medium" title={row.stemPreview}>
                              {row.stemPreview}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-950/90 border border-emerald-700/60 text-emerald-300 font-bold">
                              الإجابة: [{row.correctLabel}] {row.correctTextPreview}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              ({row.points} د)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-300">
                      النص الكامل للاختبار ومفتاح الإجابات (جاهز للنسخ أو الطباعة):
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyQuizAsText}
                      className="px-3 py-1 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-200 text-[11px] font-bold flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>نسخ النص بالكامل</span>
                    </button>
                  </div>
                  <pre
                    dir={examLanguage === 'en' ? 'ltr' : 'rtl'}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs leading-relaxed overflow-x-auto max-h-[50dvh] whitespace-pre-wrap select-all"
                  >
                    {verificationFormattedText}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer with Final Confirmation */}
            <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowPrePublishVerifyModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                العودة لمراجعة وتعديل الأسئلة
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowPrePublishVerifyModal(false);
                  handleSaveSelected();
                }}
                disabled={saving || stats.selectedValid === 0}
                className={`px-6 py-2.5 rounded-xl disabled:opacity-40 text-white text-xs font-black shadow-lg flex items-center gap-2 transition-colors ${
                  publishMode === 'competition_only'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-teal-600 hover:bg-teal-500'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {saving
                    ? 'جاري الاعتماد والنشر...'
                    : publishMode === 'exam_only'
                    ? `تأكيد نهائي ونشر الاختبار (${stats.selectedValid} سؤال)`
                    : publishMode === 'competition_only'
                    ? `تأكيد نهائي ونشر المسابقة (${stats.selectedValid} سؤال)`
                    : `تأكيد نهائي وحفظ في البنك (${stats.selectedValid} سؤال)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
