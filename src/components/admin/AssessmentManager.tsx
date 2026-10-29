/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Admin Assessment & Competition Management Console
 * Full Dynamic CRUD for Question Banks, MCQs, Assessments, Status Toggles, and CSV/JSON Result Exports
 */

import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Plus, 
  Trash2, 
  Edit2,
  Unlock, 
  Eye, 
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileJson,
  Download,
  BookOpen,
  X,
  Upload,
  Wifi,
  WifiOff,
  RefreshCw,
  Share2,
  Check,
  Timer,
  Clock,
  Play,
  Sparkles,
  Copy,
  ShieldCheck,
  Printer,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { 
  QuestionBank, 
  QuestionItemFull, 
  QuestionType,
  QuestionOption,
  Assessment, 
  AssessmentQuestionPublic,
  AssessmentType, 
  AssessmentStatus,
  AssessmentLanguage,
  BankQuestionTypeMode,
  ResultReleasePolicy, 
  AssessmentResult,
  StudyLevel,
  University,
  UserRole,
  UserAcademicContext,
  DAR_AL_SALAM_SEED
} from '../../types/umed.ts';
import { 
  getQuestionBanks, 
  createQuestionBank, 
  updateQuestionBank,
  deleteQuestionBank,
  getBankQuestions, 
  subscribeToBankQuestions,
  createQuestion, 
  updateQuestion,
  deleteQuestion, 
  getAssessments, 
  createAssessment, 
  updateAssessment,
  deleteAssessment,
  updateAssessmentStatus,
  getAssessmentResultsForAdmin, 
  releaseAssessmentResults,
  flushQuestionOutbox,
  flushOfflineAssessmentOutbox,
  subscribeToQuestionSyncState,
  buildShareableAssessmentUrl,
  resolveResultPublicDisplayName,
  getQuestionsForAssessmentPreview,
  sanitizeExistingQuestionsRationales
} from '../../services/assessmentService.ts';
import {
  fetchStudyLevels,
  fetchPrograms,
  fetchColleges,
  fetchUniversities,
  getUserAcademicContext,
  saveUserAcademicContext,
  subscribeToUserAcademicContext,
  inferAcademicContextFromText
} from '../../services/academicService.ts';
import { getRoleLabelArabic } from '../../services/batchGovernanceService.ts';
import {
  synchronizeExamTimers,
  evaluateQuizVerificationReport,
  formatQuizVerificationText,
  downloadQuizVerificationFile,
  QuizVerificationInput,
  sanitizeOptionTextForDisplay,
  extractOptionAndExplanation
} from '../../services/mcqBulkParser.ts';
import ExamTakingModal from '../assessment/ExamTakingModal.tsx';
import { renderBiDiRoleLabel } from '../../utils/roleHelpers.tsx';

const BulkQuestionImportModal = React.lazy(() => import('./BulkQuestionImportModal.tsx'));

interface AssessmentManagerProps {
  universityId: string;
  userRole?: UserRole;
  assignedStudyLevelId?: string;
  assignedCourseId?: string;
}

export default function AssessmentManager({
  universityId: initialUniversityId,
  userRole = 'university_admin',
  assignedStudyLevelId,
  assignedCourseId
}: AssessmentManagerProps) {
  const isOwner = userRole === 'platform_owner';
  const isBatchScoped = (userRole === 'batch_rep' || userRole === 'department_head') && Boolean(assignedStudyLevelId);

  const [academicCtx, setAcademicCtx] = useState<UserAcademicContext>(() => getUserAcademicContext());
  const [universities, setUniversities] = useState<University[]>([DAR_AL_SALAM_SEED.university]);
  const [universityId, setUniversityId] = useState<string>(
    initialUniversityId || academicCtx.universityId || 'univ-dar-al-salam'
  );
  const [activeTab, setActiveTab] = useState<'banks' | 'assessments' | 'results'>('banks');

  // Dynamic Study Levels
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>(DAR_AL_SALAM_SEED.studyLevels);

  // Question Banks State + Standalone Popup Selector Modal
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [bankQuestions, setBankQuestions] = useState<QuestionItemFull[]>([]);
  const [showBankSelectorModal, setShowBankSelectorModal] = useState<boolean>(false);
  
  // New Bank Form State
  const [showNewBankForm, setShowNewBankForm] = useState<boolean>(false);
  const [newBankTitle, setNewBankTitle] = useState<string>('');
  const [newBankDesc, setNewBankDesc] = useState<string>('');
  const [newBankLanguage, setNewBankLanguage] = useState<AssessmentLanguage>('ar');
  const [newBankTypeMode, setNewBankTypeMode] = useState<BankQuestionTypeMode>('hybrid');

  // Edit Bank Modal State
  const [editingBank, setEditingBank] = useState<QuestionBank | null>(null);
  const [confirmDeleteBankId, setConfirmDeleteBankId] = useState<string | null>(null);

  // New Question Form State
  const [showNewQuestionForm, setShowNewQuestionForm] = useState<boolean>(false);
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>('mcq');
  const [stemArabic, setStemArabic] = useState<string>('');
  const [stemEnglish, setStemEnglish] = useState<string>('');
  const [optA, setOptA] = useState<string>('');
  const [optB, setOptB] = useState<string>('');
  const [optC, setOptC] = useState<string>('');
  const [optD, setOptD] = useState<string>('');
  const [correctOpt, setCorrectOpt] = useState<string>('opt-a');
  const [newModelAnswer, setNewModelAnswer] = useState<string>('');
  const [points, setPoints] = useState<number>(5);
  const [explanation, setExplanation] = useState<string>('');

  // Edit Question Modal State
  const [editingQuestion, setEditingQuestion] = useState<QuestionItemFull | null>(null);
  const [editOptA, setEditOptA] = useState<string>('');
  const [editOptB, setEditOptB] = useState<string>('');
  const [editOptC, setEditOptC] = useState<string>('');
  const [editOptD, setEditOptD] = useState<string>('');

  // Pre-Publish Quiz Verification & Export Modal State
  const [verifyModalData, setVerifyModalData] = useState<{
    input: QuizVerificationInput;
    pendingAction?: {
      label: string;
      onConfirm: () => void;
    };
  } | null>(null);
  const [verifyModalTab, setVerifyModalTab] = useState<'summary' | 'text'>('summary');
  const [copiedVerifyModalText, setCopiedVerifyModalText] = useState<boolean>(false);

  // Assessments State + Standalone Popup Selector Modal
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentFilterType, setAssessmentFilterType] = useState<'all' | 'exam' | 'competition'>('all');
  const [showAssessmentSelectorModal, setShowAssessmentSelectorModal] = useState<boolean>(false);
  const [showNewAssessmentForm, setShowNewAssessmentForm] = useState<boolean>(false);
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('exam');
  const [assessmentLanguage, setAssessmentLanguage] = useState<AssessmentLanguage>('ar');
  const [titleArabic, setTitleArabic] = useState<string>('');
  const [descArabic, setDescArabic] = useState<string>('');
  const [studyLevelId, setStudyLevelId] = useState<string>(
    assignedStudyLevelId || academicCtx.studyLevelId || 'lvl-2'
  );
  const [selectedBankForAssessment, setSelectedBankForAssessment] = useState<string>('');
  const [createBankQuestionCount, setCreateBankQuestionCount] = useState<number>(10);
  const [createTimerDriver, setCreateTimerDriver] = useState<'questionSeconds' | 'totalMinutes'>('questionSeconds');
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [enableExamTimer, setEnableExamTimer] = useState<boolean>(true);
  const [questionDurationSeconds, setQuestionDurationSeconds] = useState<number>(45);
  const [availabilityDurationHours, setAvailabilityDurationHours] = useState<number>(336);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [releasePolicy, setReleasePolicy] = useState<ResultReleasePolicy>('immediate');
  const [opensAt, setOpensAt] = useState<string>(new Date().toISOString().slice(0, 16));
  const [closesAt, setClosesAt] = useState<string>(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16));
  const [initialAssessmentStatus, setInitialAssessmentStatus] = useState<AssessmentStatus>('published');
  const [copiedAssessmentShareId, setCopiedAssessmentShareId] = useState<string | null>(null);
  const [previewAssessmentModal, setPreviewAssessmentModal] = useState<{
    assessment: Assessment;
    questions: AssessmentQuestionPublic[];
  } | null>(null);

  // Edit Assessment Modal State
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [editAssessmentBankId, setEditAssessmentBankId] = useState<string>('');
  const [editBankQuestionCount, setEditBankQuestionCount] = useState<number>(10);
  const [confirmDeleteAssessmentId, setConfirmDeleteAssessmentId] = useState<string | null>(null);

  // Results State
  const [selectedAssessmentForResults, setSelectedAssessmentForResults] = useState<Assessment | null>(null);
  const [results, setResults] = useState<AssessmentResult[]>([]);

  // Feedback & Bulk Import / Offline Outbox Sync State
  const [loading, setLoading] = useState<boolean>(false);
  const [sanitizingDb, setSanitizingDb] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState<boolean>(false);
  const [syncState, setSyncState] = useState<{
    pendingCount: number;
    syncing: boolean;
    lastSyncedAt: string | null;
    isOnline: boolean;
  }>({
    pendingCount: 0,
    syncing: false,
    lastSyncedAt: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true
  });

  useEffect(() => {
    const unsub = subscribeToQuestionSyncState((state) => {
      setSyncState({
        pendingCount: state.pendingCount,
        syncing: state.isSyncing,
        lastSyncedAt: state.lastSyncedAt,
        isOnline: state.isOnline
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedBank?.id) return;
    const unsub = subscribeToBankQuestions(selectedBank.id, (updatedQuestions) => {
      setBankQuestions(updatedQuestions);
    });
    return unsub;
  }, [selectedBank?.id]);

  useEffect(() => {
    if (!isOwner && initialUniversityId) {
      setUniversityId(initialUniversityId);
    }
  }, [initialUniversityId, isOwner]);

  // Subscribe to persistent user academic context changes across the platform
  useEffect(() => {
    const unsub = subscribeToUserAcademicContext((ctx) => {
      setAcademicCtx(ctx);
      if (ctx.universityId && isOwner) {
        setUniversityId(ctx.universityId);
      }
      if (!isBatchScoped && ctx.studyLevelId) {
        setStudyLevelId(ctx.studyLevelId);
      }
    });
    return unsub;
  }, [isOwner, isBatchScoped]);

  const loadData = async () => {
    setLoading(true);
    try {
      const univList = await fetchUniversities('YE');
      if (univList.length > 0) setUniversities(univList);

      // Load dynamic study levels for this university
      let programId = academicCtx.programId || 'prog-mbbs';
      try {
        const cols = await fetchColleges(universityId);
        if (cols.length > 0) {
          const progs = await fetchPrograms(cols[0].id);
          if (progs.length > 0) programId = progs[0].id;
        }
      } catch (e) {}

      const [bankList, asmntList, lvlList] = await Promise.all([
        getQuestionBanks(universityId),
        getAssessments(universityId),
        fetchStudyLevels(programId)
      ]);
      const scopedLevels = isBatchScoped && assignedStudyLevelId
        ? lvlList.filter(l => l.id === assignedStudyLevelId)
        : lvlList;
      if (scopedLevels && scopedLevels.length > 0) {
        setStudyLevels(scopedLevels);
        if (isBatchScoped && assignedStudyLevelId) {
          setStudyLevelId(assignedStudyLevelId);
        }
      }

      const activeLevelFilter = isBatchScoped && assignedStudyLevelId
        ? assignedStudyLevelId
        : studyLevelId || '';

      const scopedAssessments = activeLevelFilter
        ? asmntList.filter(a => !a.studyLevelId || a.studyLevelId === activeLevelFilter)
        : asmntList;

      const scopedBanks = activeLevelFilter
        ? bankList.filter(b => {
            const inferred = inferAcademicContextFromText(`${b.titleArabic || ''} ${b.blockName || ''}`);
            const effectiveBankLevel = b.studyLevelId || inferred.studyLevelId;
            return !effectiveBankLevel || effectiveBankLevel === activeLevelFilter;
          })
        : bankList;

      const finalBanks = scopedBanks.length > 0 ? scopedBanks : bankList;
      setBanks(finalBanks);
      setAssessments(scopedAssessments);

      if (finalBanks.length > 0) {
        const activeBank = selectedBank
          ? finalBanks.find(b => b.id === selectedBank.id) || finalBanks[0]
          : finalBanks[0];
        setSelectedBank(activeBank);
        if (!selectedBankForAssessment) setSelectedBankForAssessment(activeBank.id);
        const qList = await getBankQuestions(activeBank.id);
        setBankQuestions(qList);
      } else {
        setSelectedBank(null);
        setBankQuestions([]);
      }
    } catch (err: any) {
      console.error('Failed to load assessment data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [universityId, assignedStudyLevelId, studyLevelId, academicCtx.strictScope]);

  const handleSelectBank = async (bank: QuestionBank) => {
    setSelectedBank(bank);
    const inferred = inferAcademicContextFromText(`${bank.titleArabic || ''} ${bank.blockName || ''}`);
    const bankLevel = bank.studyLevelId || inferred.studyLevelId;
    if (bankLevel && !isBatchScoped) {
      setStudyLevelId(bankLevel);
      saveUserAcademicContext({
        studyLevelId: bankLevel,
        ...(inferred.blockName ? { studyPeriodName: inferred.blockName } : {})
      });
    }
    setLoading(true);
    try {
      const qList = await getBankQuestions(bank.id);
      setBankQuestions(qList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankTitle.trim()) return;
    setStatusMsg(null);

    try {
      const inferred = inferAcademicContextFromText(newBankTitle.trim());
      const resolvedLevelId = isBatchScoped
        ? assignedStudyLevelId
        : inferred.studyLevelId || studyLevelId || academicCtx.studyLevelId || 'lvl-2';
      const created = await createQuestionBank({
        titleArabic: newBankTitle.trim(),
        descriptionArabic: newBankDesc.trim(),
        language: newBankLanguage,
        questionTypeMode: newBankTypeMode,
        universityId,
        studyLevelId: resolvedLevelId,
        blockName: inferred.blockName || academicCtx.studyPeriodName || newBankTitle.trim(),
        createdBy: userRole
      });
      setBanks(prev => [created, ...prev]);
      setSelectedBank(created);
      setSelectedBankForAssessment(created.id);
      setBankQuestions([]);
      setNewBankTitle('');
      setNewBankDesc('');
      setNewBankLanguage('ar');
      setNewBankTypeMode('hybrid');
      setShowNewBankForm(false);
      setShowBankSelectorModal(false);
      setStatusMsg({ type: 'success', text: 'تم إنشاء بنك الأسئلة وربطه بمستواك الدراسي بنجاح ✓' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل إنشاء البنك' });
    }
  };

  const handleUpdateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBank || !editingBank.titleArabic.trim()) return;
    setStatusMsg(null);

    try {
      const updated = await updateQuestionBank(
        editingBank.id,
        {
          titleArabic: editingBank.titleArabic.trim(),
          titleEnglish: editingBank.titleEnglish?.trim() || '',
          descriptionArabic: editingBank.descriptionArabic?.trim() || '',
          language: editingBank.language || 'ar',
          questionTypeMode: editingBank.questionTypeMode || 'hybrid',
          studyLevelId: editingBank.studyLevelId || studyLevelId,
          blockName: editingBank.blockName
        },
        universityId
      );
      setBanks(prev => prev.map(b => b.id === updated.id ? updated : b));
      if (selectedBank?.id === updated.id) {
        setSelectedBank(updated);
      }
      setEditingBank(null);
      setStatusMsg({ type: 'success', text: 'تم تحديث بيانات بنك الأسئلة بنجاح' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل تحديث البنك' });
    }
  };

  const handleDeleteBank = async (bankId: string) => {
    setStatusMsg(null);
    try {
      await deleteQuestionBank(bankId, universityId);
      const remaining = banks.filter(b => b.id !== bankId);
      setBanks(remaining);
      setConfirmDeleteBankId(null);
      if (selectedBank?.id === bankId) {
        const nextBank = remaining[0] || null;
        setSelectedBank(nextBank);
        if (nextBank) {
          const qList = await getBankQuestions(nextBank.id);
          setBankQuestions(qList);
        } else {
          setBankQuestions([]);
        }
      }
      setStatusMsg({ type: 'success', text: 'تم حذف بنك الأسئلة وجميع أسئلته المرتبطة بنجاح' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل حذف البنك' });
    }
  };

  const handleSanitizeExistingQuestions = async () => {
    setSanitizingDb(true);
    setStatusMsg(null);
    try {
      const res = await sanitizeExistingQuestionsRationales();
      if (selectedBank) {
        const refreshed = await getBankQuestions(selectedBank.id);
        setBankQuestions(refreshed);
      }
      setStatusMsg({
        type: 'success',
        text:
          res.sanitizedQuestionsCount > 0
            ? `تم تطهير وإصلاح ${res.sanitizedQuestionsCount} سؤال (${res.sanitizedOptionsCount} خيار) من أصل ${res.totalScanned} سؤال وحفظ التعليلات بنجاح ✓`
            : `تم فحص جميع الأسئلة المحفوظة (${res.totalScanned} سؤال) — جميع الخيارات والتعليلات نظيفة ومطابقة للمعايير ✓`
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء تطهير وإصلاح الخيارات والتعليلات'
      });
    } finally {
      setSanitizingDb(false);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBank || !stemArabic.trim()) return;

    const qType: QuestionType = newQuestionType || 'mcq';
    let finalOptions: QuestionOption[] = [];
    let finalCorrectId = correctOpt;
    let finalModelAnswer: string | undefined = undefined;

    if (qType === 'fill_blank' || qType === 'essay') {
      if (!newModelAnswer.trim()) {
        setStatusMsg({ type: 'error', text: 'يرجى إدخال الإجابة النموذجية المعتمدة للسؤال' });
        return;
      }
      finalOptions = [];
      finalCorrectId = qType === 'essay' ? 'essay-answer' : 'fill-blank-answer';
      finalModelAnswer = newModelAnswer.trim();
    } else if (qType === 'true_false') {
      const isEn = selectedBank.language === 'en';
      finalOptions = [
        { id: 'opt-a', textArabic: optA.trim() || (isEn ? 'True' : 'صح') },
        { id: 'opt-b', textArabic: optB.trim() || (isEn ? 'False' : 'خطأ') }
      ];
      finalCorrectId = correctOpt === 'opt-b' ? 'opt-b' : 'opt-a';
    } else {
      if (!optA.trim() || !optB.trim()) {
        setStatusMsg({ type: 'error', text: 'يرجى إدخال الخيارين (أ) و (ب) على الأقل' });
        return;
      }
      const rawOpts = [
        { id: 'opt-a', textArabic: optA.trim() },
        { id: 'opt-b', textArabic: optB.trim() },
        ...(optC.trim() ? [{ id: 'opt-c', textArabic: optC.trim() }] : []),
        ...(optD.trim() ? [{ id: 'opt-d', textArabic: optD.trim() }] : [])
      ];
      finalOptions = rawOpts;
      if (!finalOptions.some((o) => o.id === finalCorrectId)) {
        finalCorrectId = finalOptions[0].id;
      }
    }

    setStatusMsg(null);
    try {
      const created = await createQuestion({
        bankId: selectedBank.id,
        questionType: qType,
        language: selectedBank.language || 'ar',
        stemArabic: stemArabic.trim(),
        stemEnglish: stemEnglish.trim(),
        options: finalOptions,
        correctOptionId: finalCorrectId,
        modelAnswerArabic: finalModelAnswer,
        explanationArabic: explanation.trim(),
        points: Number(points) || 5,
        createdBy: 'ADMIN'
      });

      setBankQuestions(prev => [...prev, created]);
      setStemArabic('');
      setStemEnglish('');
      setOptA('');
      setOptB('');
      setOptC('');
      setOptD('');
      setNewModelAnswer('');
      setExplanation('');
      setShowNewQuestionForm(false);
      setStatusMsg({ type: 'success', text: 'تمت إضافة السؤال وحفظ مفتاح الإجابة المحمي بنجاح' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل إضافة السؤال' });
    }
  };

  const openEditQuestionModal = (q: QuestionItemFull) => {
    setEditingQuestion(q);
    setEditOptA(q.options.find(o => o.id === 'opt-a')?.textArabic || q.options[0]?.textArabic || '');
    setEditOptB(q.options.find(o => o.id === 'opt-b')?.textArabic || q.options[1]?.textArabic || '');
    setEditOptC(q.options.find(o => o.id === 'opt-c')?.textArabic || q.options[2]?.textArabic || '');
    setEditOptD(q.options.find(o => o.id === 'opt-d')?.textArabic || q.options[3]?.textArabic || '');
  };

  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !editingQuestion.stemArabic.trim()) return;
    setStatusMsg(null);

    const qType: QuestionType = editingQuestion.questionType || 'mcq';
    let updatedOptions: QuestionOption[] = [];
    let updatedCorrectId = editingQuestion.correctOptionId;

    if (qType === 'fill_blank' || qType === 'essay') {
      updatedOptions = [];
      updatedCorrectId = qType === 'essay' ? 'essay-answer' : 'fill-blank-answer';
    } else if (qType === 'true_false') {
      updatedOptions = [
        { id: 'opt-a', textArabic: editOptA.trim() || 'صح' },
        { id: 'opt-b', textArabic: editOptB.trim() || 'خطأ' }
      ];
      updatedCorrectId = updatedCorrectId === 'opt-b' ? 'opt-b' : 'opt-a';
    } else {
      const extraOptions = (editingQuestion.options || []).slice(4);
      const baseOptions: QuestionOption[] = [
        { id: 'opt-a', textArabic: editOptA.trim() || 'خيار أ' },
        { id: 'opt-b', textArabic: editOptB.trim() || 'خيار ب' },
        ...(editOptC.trim() ? [{ id: 'opt-c', textArabic: editOptC.trim() }] : []),
        ...(editOptD.trim() ? [{ id: 'opt-d', textArabic: editOptD.trim() }] : []),
        ...extraOptions
      ];
      updatedOptions = baseOptions;
      if (!updatedOptions.some((o) => o.id === updatedCorrectId)) {
        updatedCorrectId = updatedOptions[0]?.id || 'opt-a';
      }
    }

    try {
      const updated = await updateQuestion(editingQuestion.id, {
        bankId: editingQuestion.bankId,
        questionType: qType,
        language: editingQuestion.language,
        stemArabic: editingQuestion.stemArabic.trim(),
        stemEnglish: editingQuestion.stemEnglish?.trim() || '',
        options: updatedOptions,
        correctOptionId: updatedCorrectId,
        modelAnswerArabic: editingQuestion.modelAnswerArabic?.trim(),
        explanationArabic: editingQuestion.explanationArabic?.trim() || '',
        points: Number(editingQuestion.points) || 5
      });

      setBankQuestions(prev => prev.map(q => q.id === updated.id ? updated : q));
      setEditingQuestion(null);
      setStatusMsg({ type: 'success', text: 'تم تعديل السؤال وتحديث مفتاح الإجابة المحمي خادمياً بنجاح' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل تعديل السؤال' });
    }
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleArabic.trim()) return;

    setStatusMsg(null);
    try {
      const targetBankId = selectedBankForAssessment || selectedBank?.id || 'qbank-cvs-default';
      const questionsForBank = await getBankQuestions(targetBankId);
      const qIds = questionsForBank.length > 0 ? questionsForBank.map(q => q.id) : ['q-cvs-1', 'q-cvs-2', 'q-cvs-3'];
      const totalPts = questionsForBank.length > 0
        ? questionsForBank.reduce((acc, q) => acc + (Number(q.points) || 5), 0)
        : 15;

      const created = await createAssessment(
        {
          assessmentType,
          language: assessmentLanguage,
          titleArabic: titleArabic.trim(),
          descriptionArabic: descArabic.trim(),
          universityId,
          programId: 'prog-mbbs',
          studyLevelId,
          durationMinutes: enableExamTimer ? Number(durationMinutes) : 0,
          enableExamTimer,
          questionDurationSeconds: Number(questionDurationSeconds) || 0,
          perQuestionSeconds: Number(questionDurationSeconds) || 0,
          questionTimerSeconds: Number(questionDurationSeconds) || 0,
          availabilityDurationHours: Number(availabilityDurationHours) || 336,
          allowTrialSharing: true,
          showLeaderboard: true,
          maxAttempts: Number(maxAttempts),
          opensAt: new Date(opensAt).toISOString(),
          closesAt: new Date(closesAt).toISOString(),
          resultReleasePolicy: releasePolicy,
          status: initialAssessmentStatus,
          questionIds: qIds,
          totalPoints: totalPts,
          createdBy: 'ADMIN'
        },
        questionsForBank
      );

      setAssessments(prev => [created, ...prev]);
      setTitleArabic('');
      setDescArabic('');
      setShowNewAssessmentForm(false);
      const isCurrentlyOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      setStatusMsg({
        type: 'success',
        text: isCurrentlyOffline
          ? `تم إنشاء وتجهيز "${created.titleArabic}" محلياً بدون إنترنت (${initialAssessmentStatus === 'draft' ? 'مسودة للفحص' : 'جاهز'}) مع إمكانية فحصه وإنشاء رابط مشاركته فوراً ✓`
          : assessmentType === 'competition'
          ? `تم حفظ المسابقة الطبية ("${created.titleArabic}") وربط الأسئلة بنجاح ✓`
          : `تم حفظ الاختبار الأكاديمي ("${created.titleArabic}") وربط الأسئلة بنجاح ✓`
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل الحفظ' });
    }
  };

  const handlePreviewAndTestAssessment = async (asmnt: Assessment) => {
    setStatusMsg(null);
    try {
      const previewQuestions = await getQuestionsForAssessmentPreview(asmnt);
      setPreviewAssessmentModal({
        assessment: asmnt,
        questions: previewQuestions
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'تعذر تحميل أسئلة الاختبار للمعاينة' });
    }
  };

  // Load question count for selected bank in Create Assessment form and synchronize timers
  useEffect(() => {
    const targetBankId = selectedBankForAssessment || selectedBank?.id;
    if (!targetBankId) return;
    let cancelled = false;
    getBankQuestions(targetBankId).then((qs) => {
      if (cancelled) return;
      const count = Math.max(1, qs.length || 1);
      setCreateBankQuestionCount(count);
      const synced = synchronizeExamTimers({
        questionsCount: count,
        durationMinutes,
        questionDurationSeconds,
        changedField: 'questionsCount',
        preferredDriver: createTimerDriver
      });
      if (enableExamTimer && synced.durationMinutes > 0) {
        setDurationMinutes(synced.durationMinutes);
      }
      if (synced.questionDurationSeconds > 0) {
        setQuestionDurationSeconds(synced.questionDurationSeconds);
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedBankForAssessment, selectedBank?.id, bankQuestions.length]);

  const handleCreateDurationChange = (newMin: number) => {
    const cleanMin = Math.max(1, Math.round(Number(newMin) || 1));
    setCreateTimerDriver('totalMinutes');
    setDurationMinutes(cleanMin);
    const synced = synchronizeExamTimers({
      questionsCount: createBankQuestionCount,
      durationMinutes: cleanMin,
      questionDurationSeconds,
      changedField: 'totalMinutes'
    });
    setQuestionDurationSeconds(synced.questionDurationSeconds);
  };

  const handleCreateQuestionSecondsChange = (newSec: number) => {
    const cleanSec = Math.max(0, Math.round(Number(newSec) || 0));
    setCreateTimerDriver('questionSeconds');
    setQuestionDurationSeconds(cleanSec);
    if (cleanSec > 0) {
      setEnableExamTimer(true);
      const synced = synchronizeExamTimers({
        questionsCount: createBankQuestionCount,
        durationMinutes,
        questionDurationSeconds: cleanSec,
        changedField: 'questionSeconds'
      });
      setDurationMinutes(synced.durationMinutes);
    }
  };

  const openEditAssessmentModal = (asmnt: Assessment) => {
    const count = Math.max(1, asmnt.questionIds?.length || 10);
    setEditBankQuestionCount(count);
    let initDuration = Number(asmnt.durationMinutes) || 0;
    let initQSec = Number(asmnt.questionDurationSeconds) || 0;
    if (initQSec > 0 && initDuration <= 0) {
      initDuration = Math.max(1, Math.ceil((initQSec * count) / 60));
    } else if (initDuration > 0 && initQSec <= 0) {
      initQSec = Math.max(5, Math.round((initDuration * 60) / count));
    }
    setEditingAssessment({
      ...asmnt,
      durationMinutes: initDuration,
      questionDurationSeconds: initQSec
    });
    setEditAssessmentBankId('');
  };

  const handleEditBankSelectionChange = async (newBankId: string) => {
    setEditAssessmentBankId(newBankId);
    if (!editingAssessment) return;
    if (!newBankId) {
      const origCount = Math.max(1, editingAssessment.questionIds?.length || 10);
      setEditBankQuestionCount(origCount);
      return;
    }
    try {
      const qs = await getBankQuestions(newBankId);
      const count = Math.max(1, qs.length || 1);
      setEditBankQuestionCount(count);
      const synced = synchronizeExamTimers({
        questionsCount: count,
        durationMinutes: editingAssessment.durationMinutes || 30,
        questionDurationSeconds: editingAssessment.questionDurationSeconds || 45,
        changedField: 'questionsCount',
        preferredDriver: (editingAssessment.questionDurationSeconds || 0) > 0 ? 'questionSeconds' : 'totalMinutes'
      });
      setEditingAssessment((prev) =>
        prev
          ? {
              ...prev,
              durationMinutes: synced.durationMinutes,
              questionDurationSeconds: synced.questionDurationSeconds
            }
          : null
      );
    } catch {}
  };

  const handleEditDurationChange = (newMin: number) => {
    if (!editingAssessment) return;
    const cleanMin = Math.max(1, Math.round(Number(newMin) || 1));
    const synced = synchronizeExamTimers({
      questionsCount: editBankQuestionCount,
      durationMinutes: cleanMin,
      questionDurationSeconds: editingAssessment.questionDurationSeconds || 0,
      changedField: 'totalMinutes'
    });
    setEditingAssessment({
      ...editingAssessment,
      enableExamTimer: true,
      durationMinutes: cleanMin,
      questionDurationSeconds: synced.questionDurationSeconds
    });
  };

  const handleEditQuestionSecondsChange = (newSec: number) => {
    if (!editingAssessment) return;
    const cleanSec = Math.max(0, Math.round(Number(newSec) || 0));
    if (cleanSec > 0) {
      const synced = synchronizeExamTimers({
        questionsCount: editBankQuestionCount,
        durationMinutes: editingAssessment.durationMinutes || 30,
        questionDurationSeconds: cleanSec,
        changedField: 'questionSeconds'
      });
      setEditingAssessment({
        ...editingAssessment,
        enableExamTimer: true,
        questionDurationSeconds: cleanSec,
        durationMinutes: synced.durationMinutes
      });
    } else {
      setEditingAssessment({
        ...editingAssessment,
        questionDurationSeconds: 0
      });
    }
  };

  const handleUpdateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssessment || !editingAssessment.titleArabic.trim()) return;
    setStatusMsg(null);

    try {
      let updatedQuestionIds = editingAssessment.questionIds;
      let updatedTotalPoints = editingAssessment.totalPoints;
      let questionsForBank: QuestionItemFull[] | undefined = undefined;

      if (editAssessmentBankId) {
        const fetchedQuestions = await getBankQuestions(editAssessmentBankId);
        if (fetchedQuestions.length > 0) {
          questionsForBank = fetchedQuestions;
          updatedQuestionIds = fetchedQuestions.map(q => q.id);
          updatedTotalPoints = fetchedQuestions.reduce((acc, q) => acc + (Number(q.points) || 5), 0);
        }
      }

      const updated = await updateAssessment(
        editingAssessment.id,
        {
          ...editingAssessment,
          titleArabic: editingAssessment.titleArabic.trim(),
          descriptionArabic: editingAssessment.descriptionArabic?.trim() || '',
          enableExamTimer: editingAssessment.enableExamTimer !== false,
          durationMinutes: editingAssessment.enableExamTimer === false ? 0 : (Number(editingAssessment.durationMinutes) || 30),
          questionDurationSeconds: Number(editingAssessment.questionDurationSeconds) || 0,
          perQuestionSeconds: Number(editingAssessment.questionDurationSeconds) || 0,
          questionTimerSeconds: Number(editingAssessment.questionDurationSeconds) || 0,
          availabilityDurationHours: Number(editingAssessment.availabilityDurationHours) || 336,
          maxAttempts: Number(editingAssessment.maxAttempts) || 1,
          questionIds: updatedQuestionIds,
          totalPoints: updatedTotalPoints,
          universityId
        },
        questionsForBank
      );

      setAssessments(prev => prev.map(a => a.id === updated.id ? updated : a));
      setEditingAssessment(null);
      setStatusMsg({ type: 'success', text: 'تم تحديث إعدادات الاختبار / المسابقة بنجاح' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل تحديث الاختبار' });
    }
  };

  const handleToggleAssessmentStatus = async (asmnt: Assessment, newStatus: AssessmentStatus) => {
    setStatusMsg(null);
    try {
      await updateAssessmentStatus(asmnt.id, newStatus, universityId);
      setAssessments(prev => prev.map(a => a.id === asmnt.id ? { ...a, status: newStatus } : a));
      setStatusMsg({
        type: 'success',
        text: `تم تغيير حالة "${asmnt.titleArabic}" إلى ${newStatus === 'published' ? 'منشور' : newStatus === 'draft' ? 'مسودة' : 'مغلق'}`
      });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل تحديث حالة الاختبار' });
    }
  };

  const handleDeleteAssessment = async (assessmentId: string) => {
    setStatusMsg(null);
    try {
      await deleteAssessment(assessmentId, universityId);
      setAssessments(prev => prev.filter(a => a.id !== assessmentId));
      setConfirmDeleteAssessmentId(null);
      if (selectedAssessmentForResults?.id === assessmentId) {
        setSelectedAssessmentForResults(null);
        setResults([]);
      }
      setStatusMsg({ type: 'success', text: 'تم حذف الاختبار / المسابقة نهائياً بنجاح' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل حذف الاختبار' });
    }
  };

  const handleReleaseResults = async (asmntId: string) => {
    setStatusMsg(null);
    try {
      const count = await releaseAssessmentResults(asmntId);
      setStatusMsg({ type: 'success', text: `تم الإفراج عن نتائج التقييم (${count} محاولة) بنجاح` });
      if (selectedAssessmentForResults) {
        const updatedResults = await getAssessmentResultsForAdmin(asmntId);
        setResults(updatedResults);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل الإفراج عن النتائج' });
    }
  };

  const handleExportResultsCSV = () => {
    if (!selectedAssessmentForResults || results.length === 0) return;
    const headers = ['اسم الطالب', 'معرف الطالب (UID)', 'الدرجة', 'الدرجة الكلية', 'النسبة المئوية %', 'تاريخ التسليم', 'حالة الإفراج'];
    const rows = results.map(r => [
      `"${(r.studentNameArabic || '').replace(/"/g, '""')}"`,
      `"${r.uid}"`,
      r.score,
      r.totalPoints,
      `${r.percentage}%`,
      `"${new Date(r.submittedAt).toLocaleString('ar-YE')}"`,
      r.isReleased ? 'مفرج عنها' : 'معلقة'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `umed_results_${selectedAssessmentForResults.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportResultsJSON = () => {
    if (!selectedAssessmentForResults || results.length === 0) return;
    const payload = {
      assessmentId: selectedAssessmentForResults.id,
      assessmentTitle: selectedAssessmentForResults.titleArabic,
      exportedAt: new Date().toISOString(),
      totalAttempts: results.length,
      results
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `umed_results_${selectedAssessmentForResults.id}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getLevelLabel = (lvlId: string) => {
    const found = studyLevels.find(l => l.id === lvlId);
    if (found) return found.titleArabic;
    return lvlId === 'lvl-internship' ? 'سنة الامتياز' : `المستوى ${lvlId.replace('lvl-', '')}`;
  };

  const buildBankVerificationInput = (
    bank: QuestionBank,
    questions: QuestionItemFull[],
    targetType: 'bank' | 'exam' | 'competition' = 'bank'
  ): QuizVerificationInput => ({
    titleArabic: bank.titleArabic,
    assessmentType: targetType,
    language: bank.language || 'ar',
    studyLevelName: bank.studyLevelId ? getLevelLabel(bank.studyLevelId) : undefined,
    blockName: bank.blockName || bank.titleArabic,
    durationMinutes: targetType === 'competition' ? 15 : 30,
    questionDurationSeconds: 45,
    questions
  });

  const handleCopyBankAsText = async (bank: QuestionBank, questions: QuestionItemFull[]) => {
    if (questions.length === 0) {
      setStatusMsg({ type: 'error', text: 'لا توجد أسئلة في هذا البنك لنسخها.' });
      return;
    }
    const text = formatQuizVerificationText(buildBankVerificationInput(bank, questions));
    try {
      await navigator.clipboard.writeText(text);
      setStatusMsg({
        type: 'success',
        text: `تم نسخ جميع أسئلة "${bank.titleArabic}" (${questions.length} سؤال) مع الخيارات ومفتاح الإجابات كنص منسق إلى الحافظة ✓`
      });
    } catch {
      setStatusMsg({ type: 'error', text: 'تعذر النسخ التلقائي، افتح نافذة الفحص وانسخ النص يدوياً.' });
    }
  };

  const handleDownloadBankFile = (bank: QuestionBank, questions: QuestionItemFull[], format: 'txt' | 'html' | 'json') => {
    if (questions.length === 0) {
      setStatusMsg({ type: 'error', text: 'لا توجد أسئلة في هذا البنك لتحميلها.' });
      return;
    }
    downloadQuizVerificationFile(buildBankVerificationInput(bank, questions), format);
    setStatusMsg({
      type: 'success',
      text: `تم تحميل ملف فحص البنك "${bank.titleArabic}" (${questions.length} سؤال) بصيغة .${format.toUpperCase()} بنجاح ✓`
    });
  };

  const handleOpenBankVerificationModal = (
    bank: QuestionBank,
    questions: QuestionItemFull[],
    targetType: 'bank' | 'exam' | 'competition' = 'bank',
    pendingAction?: { label: string; onConfirm: () => void }
  ) => {
    setVerifyModalTab('summary');
    setVerifyModalData({
      input: buildBankVerificationInput(bank, questions, targetType),
      pendingAction
    });
  };

  const handleVerifyAssessmentQuestions = async (asmnt: Assessment) => {
    setStatusMsg(null);
    try {
      let fullQuestions: QuestionItemFull[] = [];
      for (const b of banks) {
        const bQs = b.id === selectedBank?.id ? bankQuestions : await getBankQuestions(b.id);
        const matched = bQs.filter((q) => (asmnt.questionIds || []).includes(q.id));
        if (matched.length > 0) {
          fullQuestions = [...fullQuestions, ...matched];
        }
      }
      if (fullQuestions.length === 0) {
        const pubQs = await getQuestionsForAssessmentPreview(asmnt);
        fullQuestions = pubQs.map((pq) => ({
          id: pq.id,
          bankId: asmnt.id,
          questionType: pq.questionType || 'mcq',
          language: pq.language || asmnt.language || 'ar',
          stemArabic: pq.stemArabic,
          stemEnglish: pq.stemEnglish,
          options: pq.options || [],
          correctOptionId: pq.options?.[0]?.id || 'opt-a',
          points: pq.points || 5,
          createdBy: 'ADMIN',
          createdAt: asmnt.createdAt
        }));
      }
      setVerifyModalTab('summary');
      setVerifyModalData({
        input: {
          titleArabic: asmnt.titleArabic,
          assessmentType: asmnt.assessmentType,
          language: asmnt.language || 'ar',
          studyLevelName: getLevelLabel(asmnt.studyLevelId),
          blockName: asmnt.blockName || asmnt.titleArabic,
          durationMinutes: asmnt.durationMinutes,
          questionDurationSeconds: asmnt.questionDurationSeconds,
          questions: fullQuestions
        }
      });
    } catch {
      setStatusMsg({ type: 'error', text: 'تعذر تحميل أسئلة الاختبار للفحص.' });
    }
  };

  const handleConvertBankToAssessment = (bank: QuestionBank, targetType: AssessmentType) => {
    setSelectedBankForAssessment(bank.id);
    setAssessmentType(targetType);
    setAssessmentLanguage(bank.language || 'ar');
    const cleanTitle = bank.titleArabic.replace(/^بنك\s+أسئلة\s*/i, '').trim() || bank.titleArabic;
    setTitleArabic(targetType === 'competition' ? `مسابقة: ${cleanTitle}` : `اختبار: ${cleanTitle}`);
    setDescArabic(
      bank.descriptionArabic ||
        (targetType === 'competition'
          ? `مسابقة طبية تنافسية مستخرجة من ${bank.titleArabic}`
          : `اختبار أكاديمي شامل مستخرج من ${bank.titleArabic}`)
    );
    if (bank.studyLevelId && !isBatchScoped) {
      setStudyLevelId(bank.studyLevelId);
    }
    const qCount = Math.max(bankQuestions.length, bank.questionCount || 10, 1);
    setCreateBankQuestionCount(qCount);
    const defaultQSec = targetType === 'competition' ? 30 : 45;
    setQuestionDurationSeconds(defaultQSec);
    setDurationMinutes(Math.max(1, Math.ceil((qCount * defaultQSec) / 60)));
    setMaxAttempts(targetType === 'competition' ? 1 : 2);
    setActiveTab('assessments');
    setShowNewAssessmentForm(true);
    setStatusMsg({
      type: 'success',
      text: `تم تجهيز ${targetType === 'competition' ? 'المسابقة الطبية' : 'الاختبار الأكاديمي'} من "${bank.titleArabic}" (${qCount} سؤال) — راجع الإعدادات واضغط حفظ ونشر!`
    });
  };

  return (
    <div className="space-y-5" dir="rtl">
      
      {/* Unified Header, Scope Filter & Cloud Sync Bar (Replaces 3 duplicate stacked banners) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        {/* Top Row: Title + Role Context + Live Sync Status */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="text-amber-300 font-bold">
                {renderBiDiRoleLabel(userRole)}
              </span>
              {isBatchScoped && assignedStudyLevelId && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-teal-300 font-semibold">
                    دفعة: {getLevelLabel(assignedStudyLevelId)}
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                البنوك: <strong className="text-white">{banks.length}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                التقييمات: <strong className="text-white">{assessments.length}</strong>
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-white">
              إدارة بنوك الأسئلة والامتحانات والمسابقات الطبية
            </h2>
          </div>

          {/* Compact Cloud Synchronization Indicator */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 border ${
                syncState.isOnline
                  ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                  : 'bg-amber-950/80 border-amber-700/70 text-amber-300'
              }`}
            >
              {syncState.isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{syncState.isOnline ? 'متزامن سحابياً' : 'وضع عدم الاتصال'}</span>
              {syncState.pendingCount > 0 && (
                <span className="font-mono tabular-nums text-amber-300">({syncState.pendingCount} بالانتظار)</span>
              )}
            </span>

            {syncState.pendingCount > 0 && (
              <button
                type="button"
                onClick={() => flushQuestionOutbox()}
                disabled={syncState.syncing || !syncState.isOnline}
                className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncState.syncing ? 'animate-spin' : ''}`} />
                <span>{syncState.syncing ? 'جاري المزامنة...' : 'مزامنة الآن'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom Row: Single University & Level Filter + Section Tabs */}
        <div className="pt-3.5 border-t border-slate-800 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
          {/* Academic Scope Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-bold shrink-0">الجامعة:</span>
              <select
                value={universityId}
                disabled={!isOwner}
                onChange={(e) => {
                  const nextUnivId = e.target.value;
                  setUniversityId(nextUnivId);
                  const foundUniv = universities.find(u => u.id === nextUnivId);
                  saveUserAcademicContext({
                    universityId: nextUnivId,
                    universityName: foundUniv?.nameArabic || ''
                  });
                }}
                className="w-full sm:w-auto px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-teal-300 font-bold text-xs focus:outline-none focus:border-teal-500"
              >
                {universities.map(u => (
                  <option key={u.id} value={u.id}>{u.nameArabic}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-bold shrink-0">المستوى الدراسي:</span>
              <select
                value={studyLevelId}
                disabled={isBatchScoped}
                onChange={(e) => {
                  const nextLvlId = e.target.value;
                  setStudyLevelId(nextLvlId);
                  const foundLvl = studyLevels.find(l => l.id === nextLvlId);
                  if (nextLvlId) {
                    saveUserAcademicContext({
                      studyLevelId: nextLvlId,
                      studyLevelName: foundLvl?.titleArabic || ''
                    });
                  }
                }}
                className="w-full sm:w-auto px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs focus:outline-none focus:border-teal-500"
              >
                {!isBatchScoped && <option value="">جميع المستويات الدراسية</option>}
                {studyLevels.map(lvl => (
                  <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Primary Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('banks')}
              className={`flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
                activeTab === 'banks' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>بنوك الأسئلة ({banks.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('assessments')}
              className={`flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
                activeTab === 'assessments' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-4 h-4 shrink-0" />
              <span>الاختبارات والمسابقات ({assessments.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeTab === 'results' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>النتائج والتصدير</span>
            </button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border ${
          statusMsg.type === 'error' ? 'bg-rose-950/60 border-rose-800 text-rose-300' : 'bg-teal-950/60 border-teal-800 text-teal-300'
        }`}>
          <div className="flex items-center gap-2">
            {statusMsg.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: QUESTION BANKS */}
      {activeTab === 'banks' && (
        <div className="space-y-4">
          {/* Active Question Bank Main Header Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span>بنك الأسئلة المفتوح حالياً</span>
                    {selectedBank && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-teal-300 font-bold">
                          {selectedBank.language === 'en' ? 'English' : selectedBank.language === 'bilingual' ? 'ثنائي اللغة (Ar+En)' : 'العربية'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-300 font-bold">
                          {selectedBank.questionTypeMode === 'mcq' ? 'اختيارات MCQ' : selectedBank.questionTypeMode === 'true_false' ? 'صح وخطأ' : selectedBank.questionTypeMode === 'fill_blank' ? 'إكمال الفراغ' : selectedBank.questionTypeMode === 'essay' ? 'مقالي' : 'بنك هجين شامل'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">عدد الأسئلة: <strong className="text-white">{bankQuestions.length}</strong></span>
                        {selectedBank.studyLevelId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-indigo-300 font-semibold">{getLevelLabel(selectedBank.studyLevelId)}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {selectedBank ? selectedBank.titleArabic : 'لم يتم اختيار بنك أسئلة'}
                  </h3>
                </div>
              </div>

              {/* Bank Management & Question Addition Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBankSelectorModal(true)}
                  className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 tabular-nums"
                >
                  <BookOpen className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span>تبديل البنك ({banks.length}) ▾</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowNewBankForm(true)}
                  className="py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>بنك جديد</span>
                </button>

                {selectedBank && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingBank(selectedBank)}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBulkImportModal(true)}
                      className="py-2 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>استيراد دفعة أسئلة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewQuestionForm(true)}
                      className="py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>سؤال يدوي</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 1-Click Direct Bank Conversion & Pre-Publish Verification Bar */}
            {selectedBank && (
              <div className="pt-3 border-t border-slate-800/90 flex flex-col xl:flex-row xl:items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-300 font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>التأكد من الأسئلة والقيم قبل النشر ({bankQuestions.length} سؤال):</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleCopyBankAsText(selectedBank, bankQuestions)}
                    disabled={bankQuestions.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-teal-300 border border-slate-700 font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap"
                    title="نسخ جميع الأسئلة والخيارات ومفتاح الإجابات كنص للمراجعة"
                  >
                    <Copy className="w-3.5 h-3.5 shrink-0" />
                    <span>نسخ الاختبار كنص</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadBankFile(selectedBank, bankQuestions, 'txt')}
                    disabled={bankQuestions.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-sky-300 border border-slate-700 font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap"
                    title="تحميل ملف نصي (.TXT) يحتوي على الأسئلة ومفتاح الإجابات"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>تحميل كملف (.TXT)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadBankFile(selectedBank, bankQuestions, 'html')}
                    disabled={bankQuestions.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-amber-300 border border-slate-700 font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap"
                    title="تحميل وثيقة مراجعة وطباعة (.HTML / PDF)"
                  >
                    <Printer className="w-3.5 h-3.5 shrink-0" />
                    <span>وثيقة مراجعة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenBankVerificationModal(selectedBank, bankQuestions, 'bank')}
                    disabled={bankQuestions.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-teal-950/80 hover:bg-teal-900 text-teal-200 border border-teal-500/40 font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5 shrink-0" />
                    <span>فحص وتأكيد القيم</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSanitizeExistingQuestions}
                    disabled={sanitizingDb}
                    className="px-3 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-500/40 font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap"
                    title="تنظيف جميع الأسئلة المحفوظة من علامات * ونصوص (Rationale: ...) المتسربة وحفظها في حقل التعليل"
                  >
                    {sanitizingDb ? (
                      <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin text-indigo-300" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 shrink-0 text-indigo-300" />
                    )}
                    <span>{sanitizingDb ? 'جاري التطهير...' : 'تطهير وإصلاح الخيارات والتعليلات'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={bankQuestions.length === 0}
                    onClick={() =>
                      handleOpenBankVerificationModal(selectedBank, bankQuestions, 'exam', {
                        label: `تأكيد ونشر كاختبار أكاديمي (${bankQuestions.length} سؤال)`,
                        onConfirm: () => handleConvertBankToAssessment(selectedBank, 'exam')
                      })
                    }
                    className="px-3.5 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-600 disabled:opacity-40 text-teal-300 hover:text-white border border-teal-500/30 font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    <span>تحويل البنك إلى اختبار أكاديمي</span>
                  </button>
                  <button
                    type="button"
                    disabled={bankQuestions.length === 0}
                    onClick={() =>
                      handleOpenBankVerificationModal(selectedBank, bankQuestions, 'competition', {
                        label: `تأكيد ونشر كمسابقة تنافسية (${bankQuestions.length} سؤال)`,
                        onConfirm: () => handleConvertBankToAssessment(selectedBank, 'competition')
                      })
                    }
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-600 disabled:opacity-40 text-amber-300 hover:text-white border border-amber-500/30 font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Trophy className="w-3.5 h-3.5 shrink-0" />
                    <span>تحويل البنك إلى مسابقة تنافسية</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Selected Bank Questions Area */}
          <div>
            {selectedBank ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">

                {bankQuestions.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                    <p className="text-xs text-slate-400">
                      لا توجد أسئلة مضافة في هذا البنك حتى الآن. يمكنك استيراد أو توليد دفعة أسئلة كاملة أو إضافة سؤال يدوياً.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowBulkImportModal(true)}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>فتح واضع الاختبار الذكي / استيراد أسئلة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewQuestionForm(true)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة سؤال يدوي</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bankQuestions.map((q, idx) => (
                      <div key={q.id} className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3.5 hover:border-slate-700 transition-all">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 tabular-nums">
                                سؤال #{idx + 1} ({q.points} نقاط)
                              </span>
                              {q.syncStatus === 'pending_sync' ? (
                                <span className="text-amber-300 text-xs font-semibold">
                                  · محفوظ محلياً — بانتظار المزامنة
                                </span>
                              ) : (
                                <span className="text-emerald-400 text-xs font-semibold">
                                  · متزامن سحابياً
                                </span>
                              )}
                            </div>
                            <p dir="auto" className="text-sm sm:text-base font-bold text-white leading-relaxed break-words">
                              {q.stemArabic}
                            </p>
                            {q.stemEnglish && q.stemEnglish !== q.stemArabic && (
                              <p className="text-xs text-slate-400 font-mono leading-relaxed break-words" dir="ltr">
                                {q.stemEnglish}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => openEditQuestionModal(q)}
                              className="px-3.5 py-2 min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-teal-400" />
                              <span>تعديل</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteQuestion(q.id, selectedBank.id).then(() => setBankQuestions(prev => prev.filter(item => item.id !== q.id)))}
                              className="px-3.5 py-2 min-h-[38px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف</span>
                            </button>
                          </div>
                        </div>

                        {q.questionType === 'fill_blank' || q.questionType === 'essay' ? (
                          <div className="p-3 rounded-xl bg-teal-950/50 border border-teal-500/40 text-xs text-teal-200">
                            <span className="font-bold text-teal-400 block mb-1">
                              {q.questionType === 'essay' ? 'الإجابة النموذجية للسؤال المقالي:' : 'إجابة إكمال الفراغ المعتمدة:'}
                            </span>
                            <span dir="auto" className="leading-relaxed break-words">{q.modelAnswerArabic || 'غير محدد'}</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                            {q.options.map((o, optIdx) => {
                              const optionLetters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
                              const isCorrect = o.id === q.correctOptionId;
                              const cleanOptText = sanitizeOptionTextForDisplay(o.textArabic);
                              const optRationale =
                                o.explanation ||
                                o.explanationArabic ||
                                q.optionExplanations?.[o.id] ||
                                extractOptionAndExplanation(o.textArabic).explanation;
                              return (
                                <div
                                  key={o.id}
                                  className={`p-3 rounded-xl border transition-all ${
                                    isCorrect 
                                      ? 'bg-teal-950/70 border-teal-500/80 text-teal-200 font-bold shadow-sm'
                                      : 'bg-slate-900/60 border-slate-800 text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 min-w-0 flex-1">
                                      <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                                        isCorrect ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                                      }`}>
                                        {optionLetters[optIdx] || optIdx + 1}
                                      </span>
                                      <span dir="auto" className="leading-relaxed break-words flex-1">{cleanOptText}</span>
                                    </div>
                                    {isCorrect && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 shrink-0">
                                        الإجابة الصحيحة ✓
                                      </span>
                                    )}
                                  </div>
                                  {optRationale && (
                                    <div dir="auto" className="text-[11px] font-normal text-slate-400 mt-2 pt-1.5 border-t border-slate-800 leading-relaxed">
                                      <strong className="text-teal-400/90">التعليل:</strong> {optRationale}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {q.explanationArabic && (
                          <div dir="auto" className="text-xs text-slate-300 bg-slate-900/70 p-3 rounded-xl border border-slate-800 leading-relaxed">
                            <strong className="text-teal-400">التعليل الطبي المعتمد:</strong> {q.explanationArabic}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              </div>
            ) : (
              <div className="p-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
                حدد بنك أسئلة لعرض وتعديل محتواه
              </div>
            )}
          </div>

        </div>
      )}

      {/* MODAL OVERLAY: New Question Bank Creation */}
      {showNewBankForm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <div className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80">
              <div>
                <h3 className="text-sm font-black text-white">إنشاء بنك أسئلة طبي جديد</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">يرتبط تلقائياً بالجامعة والمستوى الدراسي المختار</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewBankForm(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBank} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1 font-bold">لغة البنك الافتراضية:</label>
                  <select
                    value={newBankLanguage}
                    onChange={(e) => setNewBankLanguage(e.target.value as AssessmentLanguage)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-teal-300 font-bold focus:outline-none focus:border-teal-500"
                  >
                    <option value="ar">العربية (مع مصطلحات طبية)</option>
                    <option value="en">English (Pure Medical English)</option>
                    <option value="bilingual">ثنائي اللغة (Ar + En)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-300 block mb-1 font-bold">المستوى الدراسي للبنك:</label>
                  <select
                    value={studyLevelId}
                    onChange={(e) => setStudyLevelId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-bold focus:outline-none focus:border-teal-500"
                  >
                    {studyLevels.map(lvl => (
                      <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-300 block mb-1 font-bold">نوع أسئلة البنك:</label>
                <select
                  value={newBankTypeMode}
                  onChange={(e) => setNewBankTypeMode(e.target.value as BankQuestionTypeMode)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-amber-300 font-bold focus:outline-none focus:border-teal-500"
                >
                  <option value="hybrid">بنك هجين شامل (اختيارات + صح وخطأ + إكمال + مقالي)</option>
                  <option value="mcq">اختيارات من متعدد فقط (MCQ)</option>
                  <option value="true_false">صح وخطأ فقط (True / False)</option>
                  <option value="fill_blank">إكمال الفراغ فقط (Fill in the Blank)</option>
                  <option value="essay">أسئلة مقالية وسريرية فقط (Essay)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-300 block mb-1 font-bold">عنوان بنك الأسئلة:</label>
                <input
                  type="text"
                  placeholder={newBankLanguage === 'en' ? 'Question Bank Title (e.g., Year 2 Hematology Block Bank)' : 'مثال: بنك أسئلة بلوك الدم والمناعة سنة ثانية'}
                  value={newBankTitle}
                  onChange={(e) => setNewBankTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-300 block mb-1 font-bold">وصف مختصر للبنك أو المقرر (اختياري):</label>
                <input
                  type="text"
                  placeholder="وصف مختصر لمحتويات البنك..."
                  value={newBankDesc}
                  onChange={(e) => setNewBankDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewBankForm(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md"
                >
                  حفظ البنك وفتحه
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL OVERLAY: New Manual Question Form */}
      {showNewQuestionForm && selectedBank && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-start sm:items-center justify-center p-2.5 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-2xl w-full max-h-[90dvh] flex flex-col shadow-2xl my-auto overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
              <div>
                <h3 className="text-sm font-black text-white">إضافة سؤال يدوي جديد</h3>
                <p className="text-[11px] text-teal-300 mt-0.5">البنك الهدف: {selectedBank.titleArabic}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewQuestionForm(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateQuestion} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs overscroll-contain">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-300 font-bold block mb-1">نمط السؤال:</label>
                  <select
                    value={newQuestionType}
                    onChange={(e) => {
                      const nextType = e.target.value as QuestionType;
                      setNewQuestionType(nextType);
                      if (nextType === 'true_false') {
                        setOptA(selectedBank.language === 'en' ? 'True' : 'صح');
                        setOptB(selectedBank.language === 'en' ? 'False' : 'خطأ');
                        setCorrectOpt('opt-a');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-amber-300 font-bold"
                  >
                    <option value="mcq">اختيارات من متعدد (MCQ)</option>
                    <option value="true_false">صح وخطأ (True / False)</option>
                    <option value="fill_blank">إكمال الفراغ (Fill in the Blank)</option>
                    <option value="essay">سؤال مقالي / سريري (Essay)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-300 font-semibold block mb-1">درجة / نقاط السؤال</label>
                  <input
                    type="number"
                    value={points}
                    onChange={(e) => setPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    min={1}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-300 font-bold block">نص السؤال (بالعربية أو الإنجليزية):</label>
                <textarea
                  value={stemArabic}
                  onChange={(e) => setStemArabic(e.target.value)}
                  placeholder="أدخل نص السؤال السريري..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 focus:outline-none"
                  rows={3}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 block">النص الإنجليزي المصاحب (اختياري - للمصطلحات الطبية):</label>
                <input
                  type="text"
                  value={stemEnglish}
                  onChange={(e) => setStemEnglish(e.target.value)}
                  placeholder="Optional English medical stem..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                  dir="ltr"
                />
              </div>

              {newQuestionType === 'fill_blank' || newQuestionType === 'essay' ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] text-teal-300 font-bold block">
                    {newQuestionType === 'essay' ? 'الإجابة النموذجية للسؤال المقالي *:' : 'الكلمة أو العبارة الصحيحة لإكمال الفراغ *:'}
                  </label>
                  <textarea
                    value={newModelAnswer}
                    onChange={(e) => setNewModelAnswer(e.target.value)}
                    placeholder="اكتب الإجابة النموذجية المعتمدة هنا..."
                    className="w-full p-3 rounded-xl bg-slate-950 border border-teal-700/60 text-xs text-white focus:border-teal-500 focus:outline-none"
                    rows={2}
                    required
                  />
                </div>
              ) : newQuestionType === 'true_false' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold block mb-1">الخيار الأول (صح)</label>
                      <input
                        type="text"
                        value={optA || 'صح'}
                        onChange={(e) => setOptA(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold block mb-1">الخيار الثاني (خطأ)</label>
                      <input
                        type="text"
                        value={optB || 'خطأ'}
                        onChange={(e) => setOptB(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">الإجابة الصحيحة المعتمدة:</label>
                    <select
                      value={correctOpt === 'opt-b' ? 'opt-b' : 'opt-a'}
                      onChange={(e) => setCorrectOpt(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-teal-400 font-bold"
                    >
                      <option value="opt-a">صح ({optA || 'صح'})</option>
                      <option value="opt-b">خطأ ({optB || 'خطأ'})</option>
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold block mb-1">خيار (أ) *</label>
                      <input
                        type="text"
                        value={optA}
                        onChange={(e) => setOptA(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold block mb-1">خيار (ب) *</label>
                      <input
                        type="text"
                        value={optB}
                        onChange={(e) => setOptB(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold block mb-1">خيار (ج) (اختياري)</label>
                      <input
                        type="text"
                        value={optC}
                        onChange={(e) => setOptC(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-300 font-semibold block mb-1">خيار (د) (اختياري)</label>
                      <input
                        type="text"
                        value={optD}
                        onChange={(e) => setOptD(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">الإجابة الصحيحة المعتمدة (محمية خادمياً)</label>
                    <select
                      value={correctOpt}
                      onChange={(e) => setCorrectOpt(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-teal-400 font-bold"
                    >
                      <option value="opt-a">خيار (أ)</option>
                      <option value="opt-b">خيار (ب)</option>
                      {optC.trim() && <option value="opt-c">خيار (ج)</option>}
                      {optD.trim() && <option value="opt-d">خيار (د)</option>}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="text-[11px] text-slate-300 font-semibold block mb-1">التفسير العلمي للإجابة (اختياري)</label>
                <input
                  type="text"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="شرح سبب اختيار الإجابة الصحيحة..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 sticky bottom-0 bg-slate-900">
                <button
                  type="button"
                  onClick={() => setShowNewQuestionForm(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md"
                >
                  حفظ السؤال في البنك
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: ASSESSMENTS CREATOR & MANAGER */}
      {activeTab === 'assessments' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl">
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAssessmentFilterType('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors tabular-nums ${
                  assessmentFilterType === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل ({assessments.length})
              </button>
              <button
                type="button"
                onClick={() => setAssessmentFilterType('exam')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors tabular-nums ${
                  assessmentFilterType === 'exam' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                الاختبارات الأكاديمية ({assessments.filter(a => a.assessmentType === 'exam').length})
              </button>
              <button
                type="button"
                onClick={() => setAssessmentFilterType('competition')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors tabular-nums ${
                  assessmentFilterType === 'competition' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                المسابقات التنافسية ({assessments.filter(a => a.assessmentType === 'competition').length})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAssessmentType('exam');
                  setDurationMinutes(30);
                  setMaxAttempts(2);
                  setShowNewAssessmentForm(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء اختبار أكاديمي</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssessmentType('competition');
                  setDurationMinutes(15);
                  setMaxAttempts(1);
                  setShowNewAssessmentForm(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء مسابقة طبية</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assessments
              .filter(a => assessmentFilterType === 'all' || a.assessmentType === assessmentFilterType)
              .map(a => (
              <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between">
                <div className="space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                        a.assessmentType === 'competition' 
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' 
                          : 'bg-teal-500/15 border-teal-500/30 text-teal-300'
                      }`}>
                        {a.assessmentType === 'competition' ? '🏆 مسابقة' : '📝 امتحان مادة'}
                      </span>
                      <select
                        value={a.status}
                        onChange={(e) => handleToggleAssessmentStatus(a, e.target.value as AssessmentStatus)}
                        className={`px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-bold border focus:outline-none transition-colors ${
                          a.status === 'published'
                            ? 'bg-emerald-950/70 border-emerald-700 text-emerald-300'
                            : a.status === 'draft'
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-rose-950/70 border-rose-800 text-rose-300'
                        }`}
                      >
                        <option value="published">منشور (Published)</option>
                        <option value="draft">مسودة (Draft)</option>
                        <option value="closed">مغلق (Closed)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditAssessmentModal(a)}
                        className="px-3 py-1.5 min-h-[36px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                        title="تعديل التقييم"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-teal-400" />
                        <span>تعديل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAssessmentId(a.id)}
                        className="px-3 py-1.5 min-h-[36px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                        title="حذف التقييم"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>

                  <h4 className="text-base sm:text-lg font-black text-white leading-snug">{a.titleArabic}</h4>
                  {a.descriptionArabic && <p className="text-xs text-slate-400 line-clamp-2">{a.descriptionArabic}</p>}

                  <div className="text-xs text-slate-300 grid grid-cols-2 gap-2.5 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
                    <div>المستوى: <span className="text-teal-300 font-bold">{getLevelLabel(a.studyLevelId)}</span></div>
                    <div>
                      المدة: <span className="text-white font-mono font-bold">{a.enableExamTimer === false || !a.durationMinutes ? 'وقت مفتوح' : `${a.durationMinutes} دقيقة`}</span>
                      {a.questionDurationSeconds ? <span className="text-amber-300 font-mono text-[11px]"> ({a.questionDurationSeconds}ث/س)</span> : null}
                    </div>
                    <div>الأسئلة: <span className="text-white font-mono font-bold">{a.questionIds?.length || 0} سؤال</span></div>
                    <div>المحاولات: <span className="text-white font-mono font-bold">{a.maxAttempts} لكل طالب</span></div>
                    <div className="col-span-2 pt-1.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                      <span>سياسة النتائج: <strong className="text-slate-200">{a.resultReleasePolicy === 'immediate' ? 'إعلان فوري مع الترتيب' : a.resultReleasePolicy === 'manual' ? 'يدوي بعد المراجعة' : 'بعد إغلاق الاختبار'}</strong></span>
                      <span className="text-slate-500 font-mono text-[10px]">{a.language === 'en' ? 'English' : a.language === 'bilingual' ? 'Ar+En' : 'عربي'}</span>
                    </div>
                  </div>

                  {confirmDeleteAssessmentId === a.id && (
                    <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-700 space-y-2">
                      <div className="text-xs text-rose-200 font-bold flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>هل أنت متأكد من حذف هذا التقييم وجميع محاولاته نهائياً؟</span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteAssessment(a.id)}
                          className="flex-1 py-2 min-h-[38px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors"
                        >
                          نعم، تأكيد الحذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAssessmentId(null)}
                          className="px-4 py-2 min-h-[38px] rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Two-Tier Spacious Action Toolbar */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  {/* Primary Action Row: Test & Preview + Verify/Export Text */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handlePreviewAndTestAssessment(a)}
                      className="w-full py-2.5 px-3 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-all shadow-md shadow-teal-900/20"
                      title="فحص وتجربة حل الاختبار الآن (يعمل أونلاين وأوفلاين)"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span>تجربة حل الاختبار</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleVerifyAssessmentQuestions(a)}
                      className="w-full py-2.5 px-3 min-h-[42px] rounded-xl bg-slate-800 hover:bg-teal-950 border border-teal-500/40 text-teal-300 hover:text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-all"
                      title="فحص القيم ونسخ الاختبار كنص أو تحميله كملف للمراجعة"
                    >
                      <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                      <span>فحص القيم / نسخ وتحميل</span>
                    </button>
                  </div>

                  {/* Secondary 3-Column Equal Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAssessmentForResults(a);
                        setActiveTab('results');
                        getAssessmentResultsForAdmin(a.id).then(setResults);
                      }}
                      className="py-2 px-2.5 min-h-[40px] rounded-xl bg-slate-800 hover:bg-blue-600/30 border border-slate-700 text-blue-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      title="عرض النتائج ولوحة الترتيب"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">النتائج والترتيب</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const url = buildShareableAssessmentUrl(a);
                        try {
                          await navigator.clipboard.writeText(url);
                        } catch {}
                        setCopiedAssessmentShareId(a.id);
                        setStatusMsg({
                          type: 'success',
                          text: `تم إنشاء ونسخ رابط الاختبار المشترك ("${a.titleArabic}") بنجاح — يحتوي الرابط على حزمة الأسئلة المشفرة ويعمل فوراً حتى إن تم إنشاؤه أوفلاين ✓`
                        });
                        setTimeout(() => setCopiedAssessmentShareId(null), 2500);
                      }}
                      className="py-2 px-2.5 min-h-[40px] rounded-xl bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 text-indigo-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      title="إنشاء ونسخ رابط مشاركة الاختبار التجريبي"
                    >
                      {copiedAssessmentShareId === a.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate text-emerald-300">تم النسخ ✓</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">نسخ الرابط</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleReleaseResults(a.id)}
                      className="py-2 px-2.5 min-h-[40px] rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                      title="الإفراج عن النتائج للطلاب"
                    >
                      <Unlock className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">إفراج النتائج</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* MODAL OVERLAY: CREATE NEW EXAM OR COMPETITION */}
      {showNewAssessmentForm && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={() => setShowNewAssessmentForm(false)}
        >
          <form
            onSubmit={handleCreateAssessment}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl bg-slate-900 border border-indigo-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 my-auto max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-sm sm:text-base font-black text-indigo-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>إعداد اختبار أكاديمي أو مسابقة طبية جديدة</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  اربط الاختبار أو المسابقة ببنك أسئلة وحدد المؤقت ونظام الإفراج عن النتائج
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewAssessmentForm(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">نوع التقييم</label>
                <select
                  value={assessmentType}
                  onChange={(e) => setAssessmentType(e.target.value as AssessmentType)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="exam">اختبار أكاديمي (Exam / Quiz)</option>
                  <option value="competition">مسابقة طبية تنافسية (Competition)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">لغة التقييم</label>
                <select
                  value={assessmentLanguage}
                  onChange={(e) => setAssessmentLanguage(e.target.value as AssessmentLanguage)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="ar">العربية (RTL)</option>
                  <option value="en">الإنجليزية الطبية (English LTR)</option>
                  <option value="bilingual">ثنائي اللغة (عربي / English)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">عنوان الاختبار / المسابقة *</label>
                <input
                  type="text"
                  required
                  value={titleArabic}
                  onChange={(e) => setTitleArabic(e.target.value)}
                  placeholder="مثال: الاختبار النصفي لبلوك القلب والأوعية الدموية"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">المستوى الدراسي المستهدف</label>
                <select
                  value={studyLevelId}
                  onChange={(e) => setStudyLevelId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  {studyLevels.map(lvl => (
                    <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">بنك الأسئلة المرتبط *</label>
                <select
                  required
                  value={selectedBankForAssessment}
                  onChange={(e) => setSelectedBankForAssessment(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="">-- اختر بنك الأسئلة --</option>
                  {banks.map(b => {
                    const qCount = b.id === selectedBank?.id ? bankQuestions.length : b.questionCount;
                    return (
                      <option key={b.id} value={b.id}>
                        {b.titleArabic}{typeof qCount === 'number' ? ` (${qCount} سؤال)` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">حالة النشر عند الإنشاء</label>
                <select
                  value={initialAssessmentStatus}
                  onChange={(e) => setInitialAssessmentStatus(e.target.value as 'published' | 'draft')}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-bold"
                >
                  <option value="published">نشر فوري للطلاب (معتمد)</option>
                  <option value="draft">حفظ كمسودة خاصة</option>
                </select>
              </div>

              {/* Timer Configuration Box */}
              <div className="sm:col-span-2 lg:col-span-3 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableExamTimer}
                      onChange={(e) => setEnableExamTimer(e.target.checked)}
                      className="w-4 h-4 accent-teal-500 rounded"
                    />
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-teal-400" />
                      تفعيل المؤقت الزمني للاختبار (مرتبط تلقائياً بزمن كل سؤال)
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    عدد أسئلة البنك المختار: <strong className="text-teal-400 font-mono">{createBankQuestionCount}</strong> سؤال
                  </span>
                </div>

                {enableExamTimer ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">إجمالي مدة الاختبار (بالدقائق)</label>
                      <input
                        type="number"
                        min={1}
                        step="any"
                        value={durationMinutes}
                        onChange={(e) => handleCreateDurationChange(Math.max(1, Number(e.target.value)))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">الوقت المخصص لكل سؤال (بالثواني)</label>
                      <input
                        type="number"
                        min={5}
                        value={questionDurationSeconds}
                        onChange={(e) => handleCreateQuestionSecondsChange(Math.max(5, Number(e.target.value)))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-amber-400 bg-amber-950/20 border border-amber-500/20 px-3 py-2 rounded-xl">
                    تم إيقاف المؤقت الزمني — سيظهر الاختبار للطلاب كاختبار مفتوح الوقت.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">الحد الأقصى للمحاولات</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">سياسة الإفراج عن الدرجات والتصحيح</label>
                <select
                  value={releasePolicy}
                  onChange={(e) => setReleasePolicy(e.target.value as ResultReleasePolicy)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="immediate">فوري بعد تسليم الطالب</option>
                  <option value="after_close">تلقائي بعد إغلاق فترة الاختبار</option>
                  <option value="manual">يدوي بقرار من المشرف أو الدكتور</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">مدة بقاء الاختبار متاحاً للدخول</label>
                <select
                  value={availabilityDurationHours}
                  onChange={(e) => {
                    const hrs = Number(e.target.value);
                    setAvailabilityDurationHours(hrs);
                    if (hrs > 0) {
                      const startMs = opensAt ? new Date(opensAt).getTime() : Date.now();
                      const closeDate = new Date(startMs + hrs * 3600000);
                      setClosesAt(closeDate.toISOString().slice(0, 16));
                    } else {
                      setClosesAt('');
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value={0}>مفتوح دائماً (بدون وقت إغلاق)</option>
                  <option value={1}>لمدة ساعة واحدة (1 Hour)</option>
                  <option value={3}>لمدة 3 ساعات</option>
                  <option value={6}>لمدة 6 ساعات</option>
                  <option value={12}>لمدة 12 ساعة</option>
                  <option value={24}>لمدة يوم كامل (24 ساعة)</option>
                  <option value={48}>لمدة يومين (48 ساعة)</option>
                  <option value={72}>لمدة 3 أيام (72 ساعة)</option>
                  <option value={168}>لمدة أسبوع (7 أيام)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">تاريخ ووقت الفتح (اختياري)</label>
                <input
                  type="datetime-local"
                  value={opensAt}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOpensAt(val);
                    if (availabilityDurationHours > 0 && val) {
                      const closeDate = new Date(new Date(val).getTime() + availabilityDurationHours * 3600000);
                      setClosesAt(closeDate.toISOString().slice(0, 16));
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">تاريخ ووقت الإغلاق النهائي (اختياري)</label>
                <input
                  type="datetime-local"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs text-slate-400 mb-1">تعليمات الاختبار / المسابقة</label>
                <input
                  type="text"
                  value={descArabic}
                  onChange={(e) => setDescArabic(e.target.value)}
                  placeholder="تعليمات تظهر للطالب قبل بدء التقييم..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowNewAssessmentForm(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg"
              >
                {initialAssessmentStatus === 'published' ? 'إنشاء ونشر التقييم للطلاب الآن' : 'حفظ كمسودة خاصة'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: RESULTS, RELEASES & EXPORT */}
      {activeTab === 'results' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-white">تدقيق وإفراج وتصدير نتائج الطلاب</h3>
              <select
                value={selectedAssessmentForResults?.id || ''}
                onChange={(e) => {
                  const found = assessments.find(a => a.id === e.target.value) || null;
                  setSelectedAssessmentForResults(found);
                  if (found) getAssessmentResultsForAdmin(found.id).then(setResults);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
              >
                <option value="">-- اختر التقييم لعرض نتائجه --</option>
                {assessments.map(a => (
                  <option key={a.id} value={a.id}>{a.titleArabic}</option>
                ))}
              </select>
            </div>
            {selectedAssessmentForResults && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportResultsCSV}
                  disabled={results.length === 0}
                  className="px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير النتائج CSV</span>
                </button>
                <button
                  onClick={handleExportResultsJSON}
                  disabled={results.length === 0}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>تصدير JSON</span>
                </button>
                <button
                  onClick={() => handleReleaseResults(selectedAssessmentForResults.id)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-lg"
                >
                  <Unlock className="w-4 h-4" />
                  <span>إفراج عن جميع نتائج هذا التقييم</span>
                </button>
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            {results.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                لا توجد نتائج مسجلة لهذا التقييم حتى الآن
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">الترتيب</th>
                      <th className="p-3">اسم الطالب (الرسمي)</th>
                      <th className="p-3">الاسم الظاهر للطلاب</th>
                      <th className="p-3">الدرجة</th>
                      <th className="p-3">النسبة %</th>
                      <th className="p-3">تاريخ التسليم</th>
                      <th className="p-3">حالة الإفراج</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {[...results]
                      .sort((a, b) => {
                        const pctDiff = (Number(b.percentage) || 0) - (Number(a.percentage) || 0);
                        if (pctDiff !== 0) return pctDiff;
                        const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
                        if (scoreDiff !== 0) return scoreDiff;
                        return (Number(a.durationSeconds) || 999999) - (Number(b.durationSeconds) || 999999);
                      })
                      .map((r, idx) => (
                        <tr key={r.id} className="hover:bg-slate-800/40">
                          <td className="p-3 font-mono font-extrabold text-amber-400">#{idx + 1}</td>
                          <td className="p-3 font-bold">{r.studentNameArabic}</td>
                          <td className="p-3 text-teal-300 font-semibold">{resolveResultPublicDisplayName(r)}</td>
                          <td className="p-3 font-mono text-teal-400">{r.score} / {r.totalPoints}</td>
                          <td className="p-3 font-mono font-bold">{r.percentage}%</td>
                          <td className="p-3 font-mono text-slate-400">{new Date(r.submittedAt).toLocaleString('ar-YE')}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              r.isReleased ? 'bg-teal-500/20 text-teal-300' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {r.isReleased ? 'تم الإفراج ✓' : 'معلق'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: STANDALONE QUESTION BANK SELECTOR & MANAGER POPUP */}
      {showBankSelectorModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <div className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-2xl w-full max-h-[88dvh] flex flex-col shadow-2xl my-auto overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/90">
              <div>
                <h3 className="text-sm sm:text-base font-black text-white">نافذة اختيار وإدارة بنوك الأسئلة ({banks.length})</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  اختر البنك المطلوب لتحرير أسئلته أو تشغيل واضع الاختبار الذكي عليه
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowBankSelectorModal(false);
                    setShowNewBankForm(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>بنك جديد</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBankSelectorModal(false)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {banks.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  لا توجد بنوك أسئلة مطابقة للمستوى الدراسي الحالي. اضغط "بنك جديد" لإنشاء بنك.
                </div>
              ) : (
                banks.map((b) => (
                  <div
                    key={b.id}
                    onClick={async () => {
                      await handleSelectBank(b);
                      setShowBankSelectorModal(false);
                    }}
                    className={`w-full text-right p-4 rounded-2xl border text-xs transition-all cursor-pointer flex flex-col gap-3 ${
                      selectedBank?.id === b.id
                        ? 'bg-teal-950/70 border-teal-500 text-teal-200 shadow-lg'
                        : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {/* Row 1: Active Status Badge (Right) + Action Buttons (Left) */}
                    <div className="flex items-center justify-between gap-2 flex-wrap w-full">
                      <div>
                        {selectedBank?.id === b.id ? (
                          <span className="px-2.5 py-1 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 text-[11px] font-bold inline-flex items-center gap-1">
                            <span>البنك النشط حالياً ✓</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-semibold">
                            اضغط لاختيار البنك
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={async () => {
                            await handleSelectBank(b);
                            setShowBankSelectorModal(false);
                            setShowBulkImportModal(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5 shrink-0" />
                          <span>واضع الاختبار الذكي</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowBankSelectorModal(false);
                            setEditingBank(b);
                          }}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                          title="تعديل البنك"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBankId(b.id)}
                          className="p-2 rounded-xl bg-rose-950/50 hover:bg-rose-900/70 text-rose-400 border border-rose-900/50 transition-colors"
                          title="حذف البنك"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Full-Width Bank Title & Description (Never Squeezed) */}
                    <div className="w-full space-y-1">
                      <div dir="auto" className="font-bold text-base sm:text-lg text-white leading-relaxed break-words w-full">
                        {b.titleArabic}
                      </div>
                      {b.descriptionArabic && (
                        <div dir="auto" className="text-xs text-slate-400 leading-relaxed break-words w-full">
                          {b.descriptionArabic}
                        </div>
                      )}
                    </div>

                    {/* Row 3: Metadata Badges Footer */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/70 w-full">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-bold text-teal-300">
                        اللغة: {b.language === 'en' ? 'English' : b.language === 'bilingual' ? 'ثنائي اللغة' : 'العربية'}
                      </span>
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-bold text-amber-300">
                        النمط: {b.questionTypeMode === 'mcq' ? 'اختيارات فقط' : b.questionTypeMode === 'true_false' ? 'صح وخطأ فقط' : b.questionTypeMode === 'fill_blank' ? 'إكمال الفراغ فقط' : b.questionTypeMode === 'essay' ? 'مقالي فقط' : 'بنك هجين شامل'}
                      </span>
                      {b.studyLevelId && (
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-semibold text-indigo-300">
                          {getLevelLabel(b.studyLevelId)}
                        </span>
                      )}
                    </div>

                    {confirmDeleteBankId === b.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 p-3 rounded-xl bg-rose-950/70 border border-rose-800 flex items-center justify-between gap-2"
                      >
                        <span className="text-xs text-rose-200 font-bold">تأكيد حذف البنك وأسئلته؟</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteBank(b.id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                          >
                            نعم، احذف
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteBankId(null)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT QUESTION BANK */}
      {editingBank && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2.5 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <form onSubmit={handleUpdateBank} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 max-w-md w-full max-h-[calc(100dvh-1.25rem)] sm:max-h-[90dvh] overflow-y-auto my-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">تعديل بنك الأسئلة</h3>
              <button type="button" onClick={() => setEditingBank(null)} className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">لغة البنك الافتراضية</label>
                  <select
                    value={editingBank.language || 'ar'}
                    onChange={(e) => setEditingBank({ ...editingBank, language: e.target.value as AssessmentLanguage })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-teal-300 font-bold"
                  >
                    <option value="ar">العربية</option>
                    <option value="en">English</option>
                    <option value="bilingual">ثنائي اللغة (عربي + إنجليزي)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">نوع أسئلة البنك</label>
                  <select
                    value={editingBank.questionTypeMode || 'hybrid'}
                    onChange={(e) => setEditingBank({ ...editingBank, questionTypeMode: e.target.value as BankQuestionTypeMode })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-bold"
                  >
                    <option value="hybrid">بنك هجين شامل</option>
                    <option value="mcq">اختيارات فقط (MCQ)</option>
                    <option value="true_false">صح وخطأ فقط (T/F)</option>
                    <option value="fill_blank">إكمال الفراغ فقط</option>
                    <option value="essay">مقالي فقط (Essay)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">عنوان البنك</label>
                <input
                  type="text"
                  value={editingBank.titleArabic}
                  onChange={(e) => setEditingBank({ ...editingBank, titleArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">الوصف</label>
                <textarea
                  value={editingBank.descriptionArabic || ''}
                  onChange={(e) => setEditingBank({ ...editingBank, descriptionArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingBank(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
              >
                حفظ التعديلات
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EDIT QUESTION */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2.5 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <form onSubmit={handleUpdateQuestion} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 max-w-2xl w-full max-h-[calc(100dvh-1.25rem)] sm:max-h-[90dvh] overflow-y-auto my-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 sticky top-0 bg-slate-900 z-10">
              <h3 className="text-sm font-bold text-white">تعديل السؤال ومفتاح الإجابة المحمي</h3>
              <button type="button" onClick={() => setEditingQuestion(null)} className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">نص السؤال (بالعربية)</label>
                <textarea
                  value={editingQuestion.stemArabic}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, stemArabic: e.target.value })}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  rows={2}
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">النص الإنجليزي المصاحب (اختياري)</label>
                <input
                  type="text"
                  value={editingQuestion.stemEnglish || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, stemEnglish: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  dir="ltr"
                />
              </div>

              {editingQuestion.questionType === 'fill_blank' || editingQuestion.questionType === 'essay' ? (
                <div>
                  <label className="text-teal-300 font-bold block mb-1">
                    {editingQuestion.questionType === 'essay' ? 'الإجابة النموذجية للسؤال المقالي:' : 'الإجابة الصحيحة لإكمال الفراغ:'}
                  </label>
                  <textarea
                    value={editingQuestion.modelAnswerArabic || ''}
                    onChange={(e) => setEditingQuestion({ ...editingQuestion, modelAnswerArabic: e.target.value })}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-teal-700/60 text-white"
                    rows={2}
                    required
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">خيار (أ)</label>
                      <input
                        type="text"
                        value={editOptA}
                        onChange={(e) => setEditOptA(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">خيار (ب)</label>
                      <input
                        type="text"
                        value={editOptB}
                        onChange={(e) => setEditOptB(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                        required
                      />
                    </div>
                    {editingQuestion.questionType !== 'true_false' && (
                      <>
                        <div>
                          <label className="text-slate-400 block mb-1">خيار (ج) (اختياري)</label>
                          <input
                            type="text"
                            value={editOptC}
                            onChange={(e) => setEditOptC(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-1">خيار (د) (اختياري)</label>
                          <input
                            type="text"
                            value={editOptD}
                            onChange={(e) => setEditOptD(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1">الإجابة الصحيحة المعتمدة</label>
                      <select
                        value={editingQuestion.correctOptionId}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, correctOptionId: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-teal-400 font-bold"
                      >
                        <option value="opt-a">خيار (أ)</option>
                        <option value="opt-b">خيار (ب)</option>
                        {editingQuestion.questionType !== 'true_false' && editOptC.trim() && (
                          <option value="opt-c">خيار (ج)</option>
                        )}
                        {editingQuestion.questionType !== 'true_false' && editOptD.trim() && (
                          <option value="opt-d">خيار (د)</option>
                        )}
                        {(editingQuestion.options || []).slice(4).map((extraOpt, idx) => (
                          <option key={extraOpt.id} value={extraOpt.id}>
                            خيار إضافي ({idx + 5})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">درجة السؤال</label>
                      <input
                        type="number"
                        value={editingQuestion.points}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, points: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                        min={1}
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="text-slate-400 block mb-1">التعليل العلمي للإجابة الصحيحة</label>
                <input
                  type="text"
                  value={editingQuestion.explanationArabic || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, explanationArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 sticky bottom-0 bg-slate-900 pb-1">
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
              >
                حفظ تعديلات السؤال
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EDIT ASSESSMENT */}
      {editingAssessment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2.5 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <form onSubmit={handleUpdateAssessment} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 max-w-2xl w-full max-h-[calc(100dvh-1.25rem)] sm:max-h-[90dvh] overflow-y-auto my-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 sticky top-0 bg-slate-900 z-10">
              <h3 className="text-sm font-bold text-white">تعديل إعدادات الاختبار / المسابقة</h3>
              <button type="button" onClick={() => setEditingAssessment(null)} className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 block mb-1">نوع التقييم</label>
                  <select
                    value={editingAssessment.assessmentType}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, assessmentType: e.target.value as AssessmentType })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold"
                  >
                    <option value="exam">امتحان مادة أسبوعي / نهائي</option>
                    <option value="competition">مسابقة طبية تنافسية</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">حالة التقييم</label>
                  <select
                    value={editingAssessment.status}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, status: e.target.value as AssessmentStatus })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-teal-300 font-bold"
                  >
                    <option value="published">منشور (Published)</option>
                    <option value="draft">مسودة (Draft)</option>
                    <option value="closed">مغلق (Closed)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">عنوان التقييم</label>
                <input
                  type="text"
                  value={editingAssessment.titleArabic}
                  onChange={(e) => setEditingAssessment({ ...editingAssessment, titleArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">الوصف</label>
                <input
                  type="text"
                  value={editingAssessment.descriptionArabic || ''}
                  onChange={(e) => setEditingAssessment({ ...editingAssessment, descriptionArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 block mb-1">المستوى الدراسي المستهدف</label>
                  <select
                    value={editingAssessment.studyLevelId}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, studyLevelId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    {studyLevels.map(lvl => (
                      <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">تحديث الأسئلة من بنك أسئلة (اختياري)</label>
                  <select
                    value={editAssessmentBankId}
                    onChange={(e) => handleEditBankSelectionChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="">-- الإبقاء على الأسئلة الحالية ({editingAssessment.questionIds?.length || 3}) --</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.titleArabic}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400">
                      مؤقت الاختبار الكلي (دقيقة)
                      <span className="text-[10px] text-teal-400 mr-1">({editBankQuestionCount} سؤال)</span>
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-teal-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingAssessment.enableExamTimer !== false}
                        onChange={(e) => setEditingAssessment({ ...editingAssessment, enableExamTimer: e.target.checked })}
                        className="rounded accent-teal-500"
                      />
                      <span>{editingAssessment.enableExamTimer !== false ? 'مفعل' : 'وقت مفتوح'}</span>
                    </label>
                  </div>
                  {editingAssessment.enableExamTimer !== false ? (
                    <div className="space-y-1">
                      <input
                        type="number"
                        value={editingAssessment.durationMinutes}
                        onChange={(e) => handleEditDurationChange(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                        min={1}
                      />
                      <p className="text-[10px] text-amber-300/90">
                        يقسم تلقائياً على {editBankQuestionCount} سؤال = {editingAssessment.questionDurationSeconds || 0} ثانية/سؤال
                      </p>
                    </div>
                  ) : (
                    <div className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 font-bold">
                      بدون مؤقت كلي (مفتوح)
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">وقت السؤال (ثانية) ⇄ الوقت الكلي</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={editingAssessment.questionDurationSeconds || 0}
                      onChange={(e) => handleEditQuestionSecondsChange(Number(e.target.value))}
                      className="w-20 px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono font-bold text-center"
                    />
                    <select
                      value={[0, 20, 30, 45, 60, 90, 120].includes(editingAssessment.questionDurationSeconds || 0) ? (editingAssessment.questionDurationSeconds || 0) : 'custom'}
                      onChange={(e) => {
                        if (e.target.value !== 'custom') handleEditQuestionSecondsChange(Number(e.target.value));
                      }}
                      className="flex-1 px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-bold"
                    >
                      <option value={0}>بدون مؤقت لكل سؤال</option>
                      <option value={20}>20 ثانية / سؤال</option>
                      <option value={30}>30 ثانية / سؤال</option>
                      <option value={45}>45 ثانية / سؤال</option>
                      <option value={60}>60 ثانية / سؤال</option>
                      <option value={90}>90 ثانية / سؤال</option>
                      <option value={120}>120 ثانية / سؤال</option>
                      {![0, 20, 30, 45, 60, 90, 120].includes(editingAssessment.questionDurationSeconds || 0) && (
                        <option value="custom">{editingAssessment.questionDurationSeconds} ثانية / سؤال (تلقائي)</option>
                      )}
                    </select>
                  </div>
                  {(editingAssessment.questionDurationSeconds || 0) > 0 && (
                    <p className="text-[10px] text-teal-300/90 mt-1">
                      الوقت الكلي لـ {editBankQuestionCount} سؤال = {editingAssessment.durationMinutes} دقيقة
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">أقصى عدد محاولات</label>
                  <input
                    type="number"
                    value={editingAssessment.maxAttempts}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, maxAttempts: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    min={1}
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">سياسة إعلان النتائج</label>
                  <select
                    value={editingAssessment.resultReleasePolicy}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, resultReleasePolicy: e.target.value as ResultReleasePolicy })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="immediate">إعلان فوري</option>
                    <option value="after_close">بعد إغلاق الاختبار</option>
                    <option value="manual">إعلان يدوي</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-300 font-bold">تمديد مدة توفر الاختبار قبل الإغلاق:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { hours: 24, label: '+24 ساعة' },
                      { hours: 72, label: '+3 أيام' },
                      { hours: 168, label: '+7 أيام' },
                      { hours: 336, label: '+14 يوماً' }
                    ].map((p) => (
                      <button
                        key={p.hours}
                        type="button"
                        onClick={() => {
                          const nextClose = new Date(Date.now() + p.hours * 3600000).toISOString();
                          setEditingAssessment({
                            ...editingAssessment,
                            availabilityDurationHours: p.hours,
                            closesAt: nextClose
                          });
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-teal-950 border border-slate-800 text-teal-300 text-[11px] font-bold"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">
                  تاريخ الإغلاق المحدد: <strong className="text-white font-mono">{new Date(editingAssessment.closesAt).toLocaleString('ar-YE')}</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 sticky bottom-0 bg-slate-900 pb-1">
              <button
                type="button"
                onClick={() => setEditingAssessment(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
              >
                حفظ تعديلات التقييم
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: BULK QUESTION IMPORT (LAZY LOADED ON DEMAND + OFFLINE-FIRST + DIRECT SINGLE-MODE PUBLISHING) */}
      {showBulkImportModal && selectedBank && (
        <React.Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-3 shadow-2xl">
                <RefreshCw className="w-7 h-7 text-teal-400 animate-spin mx-auto" />
                <div className="text-sm font-bold text-white">جاري فتح معالج الاستيراد الجماعي للأسئلة...</div>
                <div className="text-xs text-slate-400">تحميل المحلل الذكي وقوالب الأسئلة</div>
              </div>
            </div>
          }
        >
          <BulkQuestionImportModal
            bank={selectedBank}
            existingQuestions={bankQuestions}
            userRole={userRole}
            studyLevels={studyLevels}
            defaultStudyLevelId={studyLevelId}
            onClose={() => setShowBulkImportModal(false)}
            onSaved={(result) => {
              setBankQuestions(result.savedQuestions);
              if (result.publishedAssessment) {
                setAssessments((prev) => [
                  result.publishedAssessment!,
                  ...prev.filter((a) => a.id !== result.publishedAssessment!.id)
                ]);
              }

              const modeSummary =
                result.publishMode === 'exam_only' && result.publishedAssessment
                  ? `وتم نشره كـ "اختبار أكاديمي فقط" بعنوان (${result.publishedAssessment.titleArabic})`
                  : result.publishMode === 'competition_only' && result.publishedAssessment
                  ? `وتم نشره كـ "مسابقة طبية فقط" بعنوان (${result.publishedAssessment.titleArabic})`
                  : 'في بنك الأسئلة فقط';

              setStatusMsg({
                type: 'success',
                text: `تم اعتماد الدفعة بنجاح (${result.createdCount} جديد، ${result.updatedCount} محدّث) ${modeSummary} — ${
                  result.syncedImmediately
                    ? 'تمت المزامنة السحابية فوراً ✓'
                    : 'محفوظ محلياً وسيتم مزامنته تلقائياً فور توفر الإنترنت'
                }`
              });
            }}
          />
        </React.Suspense>
      )}

      {/* MODAL: OFFLINE/ONLINE LIVE EXAM TESTING & PREVIEW FOR ADMIN/OWNER */}
      {previewAssessmentModal && (
        <ExamTakingModal
          assessment={previewAssessmentModal.assessment}
          attempt={{
            id: `att-admin-preview-${previewAssessmentModal.assessment.id}-${Date.now()}`,
            assessmentId: previewAssessmentModal.assessment.id,
            uid: 'admin-preview',
            attemptNumber: 1,
            startedAt: new Date().toISOString(),
            expiresAt: new Date(
              Date.now() + (Number(previewAssessmentModal.assessment.durationMinutes) || 30) * 60000
            ).toISOString(),
            answers: {},
            lastSavedAt: new Date().toISOString(),
            status: 'in_progress'
          }}
          questions={previewAssessmentModal.questions}
          studentNameArabic="معاينة وفحص المسؤول"
          uid="admin-preview"
          isGuestMode={false}
          onClose={() => setPreviewAssessmentModal(null)}
          onSubmitted={(res) => {
            setStatusMsg({
              type: 'success',
              text: `اكتمل فحص الاختبار ("${previewAssessmentModal.assessment.titleArabic}") بنجاح — النتيجة التجريبية: ${res.score}/${res.totalPoints} (${res.percentage}%) ✓`
            });
          }}
        />
      )}

      {/* MODAL: PRE-PUBLISH VERIFICATION, COPY AS TEXT & FILE DOWNLOAD */}
      {verifyModalData && (() => {
        const report = evaluateQuizVerificationReport(verifyModalData.input);
        const formattedText = formatQuizVerificationText(verifyModalData.input);
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" dir="rtl">
            <div className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-4xl w-full max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-3.5 sm:px-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-teal-400" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      فحص القيم والتأكد من الاختبار: {verifyModalData.input.titleArabic}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      تحقق من صحة جميع الأسئلة والخيارات ومفتاح الإجابات، أو انسخ الاختبار كنص وحمّله كملف
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVerifyModalData(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setVerifyModalTab('summary')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      verifyModalTab === 'summary' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    تقرير الفحص ومفتاح الإجابات
                  </button>
                  <button
                    type="button"
                    onClick={() => setVerifyModalTab('text')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      verifyModalTab === 'text' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    معاينة النص الكامل للاختبار
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(formattedText);
                        setCopiedVerifyModalText(true);
                        setStatusMsg({ type: 'success', text: 'تم نسخ النص الكامل للاختبار ومفتاح الإجابات إلى الحافظة ✓' });
                        setTimeout(() => setCopiedVerifyModalText(false), 3000);
                      } catch {}
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-950/80 hover:bg-teal-900 border border-teal-600/50 text-teal-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    {copiedVerifyModalText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedVerifyModalText ? 'تم النسخ!' : 'نسخ الاختبار كنص'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadQuizVerificationFile(verifyModalData.input, 'txt')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ملف نصي (.TXT)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadQuizVerificationFile(verifyModalData.input, 'html')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>وثيقة مراجعة (.HTML)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadQuizVerificationFile(verifyModalData.input, 'json')}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-purple-300 text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">إجمالي الأسئلة</span>
                    <span className="text-sm font-black text-emerald-400 font-mono mt-0.5 block">
                      {report.validQuestions} / {report.totalQuestions} صالح
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">إجمالي الدرجات</span>
                    <span className="text-sm font-black text-amber-300 font-mono mt-0.5 block">
                      {report.totalPoints} درجة
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">الأسئلة المعللة علمياً</span>
                    <span className="text-sm font-black text-indigo-300 font-mono mt-0.5 block">
                      {report.withExplanationCount} / {report.totalQuestions}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">حالة الفحص الآلي</span>
                    <span className={`text-xs font-black mt-0.5 block ${report.isReadyToPublish ? 'text-teal-300' : 'text-rose-400'}`}>
                      {report.isReadyToPublish ? 'جاهز ومكتمل القيم ✓' : `يوجد ${report.errorChecksCount} خطأ`}
                    </span>
                  </div>
                </div>

                {verifyModalTab === 'summary' ? (
                  <>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2.5">
                      <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-teal-400" />
                        <span>نتائج الفحص الآلي لسلامة القيم ({report.checks.length} فحوصات):</span>
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {report.checks.map((chk) => (
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

                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 space-y-2.5">
                      <h4 className="text-xs font-black text-teal-300">
                        جدول التحقق السريع من مفتاح الإجابات الصحيحة ({report.answerKeyRows.length} سؤال):
                      </h4>
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800/70">
                        {report.answerKeyRows.map((row) => (
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
                  <pre
                    dir={verifyModalData.input.language === 'en' ? 'ltr' : 'rtl'}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs leading-relaxed overflow-x-auto max-h-[52dvh] whitespace-pre-wrap select-all"
                  >
                    {formattedText}
                  </pre>
                )}
              </div>

              <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setVerifyModalData(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  إغلاق نافذة الفحص
                </button>

                {verifyModalData.pendingAction && (
                  <button
                    type="button"
                    disabled={!report.isReadyToPublish}
                    onClick={() => {
                      const act = verifyModalData.pendingAction;
                      setVerifyModalData(null);
                      if (act) act.onConfirm();
                    }}
                    className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-black shadow-lg flex items-center gap-2 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{verifyModalData.pendingAction.label}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
