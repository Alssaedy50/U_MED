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
  X
} from 'lucide-react';
import { 
  QuestionBank, 
  QuestionItemFull, 
  Assessment, 
  AssessmentType, 
  AssessmentStatus,
  ResultReleasePolicy, 
  AssessmentResult,
  StudyLevel,
  University,
  UserRole,
  DAR_AL_SALAM_SEED
} from '../../types/umed.ts';
import { 
  getQuestionBanks, 
  createQuestionBank, 
  updateQuestionBank,
  deleteQuestionBank,
  getBankQuestions, 
  createQuestion, 
  updateQuestion,
  deleteQuestion, 
  getAssessments, 
  createAssessment, 
  updateAssessment,
  deleteAssessment,
  updateAssessmentStatus,
  getAssessmentResultsForAdmin, 
  releaseAssessmentResults 
} from '../../services/assessmentService.ts';
import { fetchStudyLevels, fetchPrograms, fetchColleges, fetchUniversities } from '../../services/academicService.ts';
import { getRoleLabelArabic } from '../../services/batchGovernanceService.ts';

interface AssessmentManagerProps {
  universityId: string;
  userRole?: UserRole;
  assignedStudyLevelId?: string;
}

export default function AssessmentManager({
  universityId: initialUniversityId,
  userRole = 'university_admin',
  assignedStudyLevelId
}: AssessmentManagerProps) {
  const isOwner = userRole === 'platform_owner';
  const isBatchScoped = (userRole === 'batch_rep' || userRole === 'department_head') && Boolean(assignedStudyLevelId);

  const [universities, setUniversities] = useState<University[]>([DAR_AL_SALAM_SEED.university]);
  const [universityId, setUniversityId] = useState<string>(initialUniversityId || 'univ-dar-al-salam');
  const [activeTab, setActiveTab] = useState<'banks' | 'assessments' | 'results'>('banks');

  // Dynamic Study Levels
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>(DAR_AL_SALAM_SEED.studyLevels);

  // Question Banks State
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [bankQuestions, setBankQuestions] = useState<QuestionItemFull[]>([]);
  
  // New Bank Form State
  const [showNewBankForm, setShowNewBankForm] = useState<boolean>(false);
  const [newBankTitle, setNewBankTitle] = useState<string>('');
  const [newBankDesc, setNewBankDesc] = useState<string>('');

  // Edit Bank Modal State
  const [editingBank, setEditingBank] = useState<QuestionBank | null>(null);
  const [confirmDeleteBankId, setConfirmDeleteBankId] = useState<string | null>(null);

  // New Question Form State
  const [showNewQuestionForm, setShowNewQuestionForm] = useState<boolean>(false);
  const [stemArabic, setStemArabic] = useState<string>('');
  const [stemEnglish, setStemEnglish] = useState<string>('');
  const [optA, setOptA] = useState<string>('');
  const [optB, setOptB] = useState<string>('');
  const [optC, setOptC] = useState<string>('');
  const [optD, setOptD] = useState<string>('');
  const [correctOpt, setCorrectOpt] = useState<string>('opt-a');
  const [points, setPoints] = useState<number>(5);
  const [explanation, setExplanation] = useState<string>('');

  // Edit Question Modal State
  const [editingQuestion, setEditingQuestion] = useState<QuestionItemFull | null>(null);
  const [editOptA, setEditOptA] = useState<string>('');
  const [editOptB, setEditOptB] = useState<string>('');
  const [editOptC, setEditOptC] = useState<string>('');
  const [editOptD, setEditOptD] = useState<string>('');

  // Assessments State
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [showNewAssessmentForm, setShowNewAssessmentForm] = useState<boolean>(false);
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('exam');
  const [titleArabic, setTitleArabic] = useState<string>('');
  const [descArabic, setDescArabic] = useState<string>('');
  const [studyLevelId, setStudyLevelId] = useState<string>(assignedStudyLevelId || 'lvl-4');
  const [selectedBankForAssessment, setSelectedBankForAssessment] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [releasePolicy, setReleasePolicy] = useState<ResultReleasePolicy>('immediate');
  const [opensAt, setOpensAt] = useState<string>(new Date().toISOString().slice(0, 16));
  const [closesAt, setClosesAt] = useState<string>(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16));

  // Edit Assessment Modal State
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [editAssessmentBankId, setEditAssessmentBankId] = useState<string>('');
  const [confirmDeleteAssessmentId, setConfirmDeleteAssessmentId] = useState<string | null>(null);

  // Results State
  const [selectedAssessmentForResults, setSelectedAssessmentForResults] = useState<Assessment | null>(null);
  const [results, setResults] = useState<AssessmentResult[]>([]);

  // Feedback State
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!isOwner && initialUniversityId) {
      setUniversityId(initialUniversityId);
    }
  }, [initialUniversityId, isOwner]);

  const loadData = async () => {
    setLoading(true);
    try {
      const univList = await fetchUniversities('YE');
      if (univList.length > 0) setUniversities(univList);

      // Load dynamic study levels for this university
      let programId = 'prog-mbbs';
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

      const scopedAssessments = isBatchScoped && assignedStudyLevelId
        ? asmntList.filter(a => a.studyLevelId === assignedStudyLevelId)
        : asmntList;
      const scopedBanks = isBatchScoped && assignedStudyLevelId
        ? bankList.filter(b => !b.studyLevelId || b.studyLevelId === assignedStudyLevelId)
        : bankList;

      setBanks(scopedBanks);
      setAssessments(scopedAssessments);

      if (scopedBanks.length > 0) {
        const activeBank = selectedBank
          ? scopedBanks.find(b => b.id === selectedBank.id) || scopedBanks[0]
          : scopedBanks[0];
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
  }, [universityId, assignedStudyLevelId]);

  const handleSelectBank = async (bank: QuestionBank) => {
    setSelectedBank(bank);
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
      const created = await createQuestionBank({
        titleArabic: newBankTitle.trim(),
        descriptionArabic: newBankDesc.trim(),
        universityId,
        studyLevelId: isBatchScoped ? assignedStudyLevelId : undefined,
        createdBy: userRole
      });
      setBanks(prev => [...prev, created]);
      setSelectedBank(created);
      setSelectedBankForAssessment(created.id);
      setBankQuestions([]);
      setNewBankTitle('');
      setNewBankDesc('');
      setShowNewBankForm(false);
      setStatusMsg({ type: 'success', text: 'تم إنشاء بنك الأسئلة بنجاح' });
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
          studyLevelId: editingBank.studyLevelId
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

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBank || !stemArabic.trim() || !optA.trim() || !optB.trim()) return;

    setStatusMsg(null);
    try {
      const created = await createQuestion({
        bankId: selectedBank.id,
        stemArabic: stemArabic.trim(),
        stemEnglish: stemEnglish.trim(),
        options: [
          { id: 'opt-a', textArabic: optA.trim() },
          { id: 'opt-b', textArabic: optB.trim() },
          { id: 'opt-c', textArabic: optC.trim() || 'غير محدد' },
          { id: 'opt-d', textArabic: optD.trim() || 'غير محدد' }
        ],
        correctOptionId: correctOpt,
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

    try {
      const updated = await updateQuestion(editingQuestion.id, {
        bankId: editingQuestion.bankId,
        stemArabic: editingQuestion.stemArabic.trim(),
        stemEnglish: editingQuestion.stemEnglish?.trim() || '',
        options: [
          { id: 'opt-a', textArabic: editOptA.trim() || 'خيار أ' },
          { id: 'opt-b', textArabic: editOptB.trim() || 'خيار ب' },
          { id: 'opt-c', textArabic: editOptC.trim() || 'غير محدد' },
          { id: 'opt-d', textArabic: editOptD.trim() || 'غير محدد' }
        ],
        correctOptionId: editingQuestion.correctOptionId,
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
          titleArabic: titleArabic.trim(),
          descriptionArabic: descArabic.trim(),
          universityId,
          programId: 'prog-mbbs',
          studyLevelId,
          durationMinutes: Number(durationMinutes),
          maxAttempts: Number(maxAttempts),
          opensAt: new Date(opensAt).toISOString(),
          closesAt: new Date(closesAt).toISOString(),
          resultReleasePolicy: releasePolicy,
          status: 'published',
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
      setStatusMsg({ type: 'success', text: 'تم نشر الاختبار / المسابقة وربط الأسئلة بنجاح' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل النشر' });
    }
  };

  const openEditAssessmentModal = (asmnt: Assessment) => {
    setEditingAssessment(asmnt);
    setEditAssessmentBankId(selectedBank?.id || banks[0]?.id || '');
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
          durationMinutes: Number(editingAssessment.durationMinutes) || 30,
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

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
              إدارة بنوك الأسئلة والاختبارات ({getRoleLabelArabic(userRole)})
            </span>
            {isBatchScoped && assignedStudyLevelId && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-semibold">
                مخصص للدفعة: {getLevelLabel(assignedStudyLevelId)}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-white">منصة إدارة الامتحانات والمسابقات الطبية</h2>
          <p className="text-xs text-slate-400 mt-1">
            بناء وتعديل وحذف بنوك الأسئلة، ضبط مفاتيح الإجابات المحمية خادمياً، جدولة المواعيد، وتصدير النتائج
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {isOwner && (
            <select
              value={universityId}
              onChange={(e) => setUniversityId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-teal-300 font-bold"
            >
              {universities.map(u => (
                <option key={u.id} value={u.id}>{u.nameArabic}</option>
              ))}
            </select>
          )}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 w-full lg:w-auto">
          <button
            onClick={() => setActiveTab('banks')}
            className={`flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'banks' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>بنوك الأسئلة ({banks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('assessments')}
            className={`flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'assessments' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4 shrink-0" />
            <span>الاختبارات والمسابقات ({assessments.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'results' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>النتائج والتصدير</span>
          </button>
        </div>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
          statusMsg.type === 'error' ? 'bg-rose-950/60 border-rose-800 text-rose-300' : 'bg-teal-950/60 border-teal-800 text-teal-300'
        }`}>
          {statusMsg.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* TAB 1: QUESTION BANKS */}
      {activeTab === 'banks' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200">بنوك الأسئلة ({banks.length})</h3>
              <button
                onClick={() => setShowNewBankForm(true)}
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>بنك جديد</span>
              </button>
            </div>

            {showNewBankForm && (
              <form onSubmit={handleCreateBank} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <input
                  type="text"
                  placeholder="عنوان بنك الأسئلة (مثال: بنك أسئلة الجهاز التنفسي)"
                  value={newBankTitle}
                  onChange={(e) => setNewBankTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500"
                  required
                />
                <textarea
                  placeholder="وصف مختصر..."
                  value={newBankDesc}
                  onChange={(e) => setNewBankDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500"
                  rows={2}
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowNewBankForm(false)}
                    className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-teal-600 text-white text-xs font-bold"
                  >
                    حفظ
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {banks.map((b) => (
                <div
                  key={b.id}
                  onClick={() => handleSelectBank(b)}
                  className={`w-full text-right p-3.5 rounded-xl border text-xs transition-all cursor-pointer ${
                    selectedBank?.id === b.id
                      ? 'bg-teal-950/70 border-teal-500 text-teal-200'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm text-white">{b.titleArabic}</div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setEditingBank(b)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="تعديل البنك"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteBankId(b.id)}
                        className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 text-rose-400 transition-colors"
                        title="حذف البنك"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {b.descriptionArabic && <div className="text-[11px] text-slate-400 mt-1">{b.descriptionArabic}</div>}

                  {confirmDeleteBankId === b.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-3 p-2.5 rounded-lg bg-rose-950/70 border border-rose-800 flex items-center justify-between gap-2"
                    >
                      <span className="text-[11px] text-rose-200 font-bold">تأكيد حذف البنك وأسئلته؟</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteBank(b.id)}
                          className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
                        >
                          نعم، احذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBankId(null)}
                          className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px]"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            {selectedBank ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white">{selectedBank.titleArabic}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">عدد الأسئلة المسجلة: {bankQuestions.length}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingBank(selectedBank)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>تعديل البنك</span>
                    </button>
                    <button
                      onClick={() => setShowNewQuestionForm(true)}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة سؤال MCQ جديد</span>
                    </button>
                  </div>
                </div>

                {showNewQuestionForm && (
                  <form onSubmit={handleCreateQuestion} className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                    <h4 className="text-xs font-bold text-teal-400 border-b border-slate-800 pb-2">
                      إضافة سؤال جديد لبنك {selectedBank.titleArabic}
                    </h4>

                    <div className="space-y-2">
                      <label className="text-[11px] text-slate-400 block">نص السؤال (بالعربية)</label>
                      <textarea
                        value={stemArabic}
                        onChange={(e) => setStemArabic(e.target.value)}
                        placeholder="أدخل نص السؤال السريري..."
                        className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:border-teal-500 focus:outline-none"
                        rows={2}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] text-slate-400 block">النص الإنجليزي المصاحب (اختياري - للمصطلحات الطبية)</label>
                      <input
                        type="text"
                        value={stemEnglish}
                        onChange={(e) => setStemEnglish(e.target.value)}
                        placeholder="Optional English medical stem..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-mono"
                        dir="ltr"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 block">خيار (أ)</label>
                        <input
                          type="text"
                          value={optA}
                          onChange={(e) => setOptA(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block">خيار (ب)</label>
                        <input
                          type="text"
                          value={optB}
                          onChange={(e) => setOptB(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block">خيار (ج)</label>
                        <input
                          type="text"
                          value={optC}
                          onChange={(e) => setOptC(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block">خيار (د)</label>
                        <input
                          type="text"
                          value={optD}
                          onChange={(e) => setOptD(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block">الإجابة الصحيحة المعتمدة (محمية خادمياً)</label>
                        <select
                          value={correctOpt}
                          onChange={(e) => setCorrectOpt(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-teal-400 font-bold"
                        >
                          <option value="opt-a">خيار (أ)</option>
                          <option value="opt-b">خيار (ب)</option>
                          <option value="opt-c">خيار (ج)</option>
                          <option value="opt-d">خيار (د)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block">درجة / نقاط السؤال</label>
                        <input
                          type="number"
                          value={points}
                          onChange={(e) => setPoints(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-mono"
                          min={1}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 block">التفسير العلمي للإجابة (اختياري)</label>
                      <input
                        type="text"
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        placeholder="شرح سبب اختيار الإجابة الصحيحة..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowNewQuestionForm(false)}
                        className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-semibold"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold"
                      >
                        حفظ السؤال في البنك
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {bankQuestions.map((q, idx) => (
                    <div key={q.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-teal-400">سؤال {idx + 1} ({q.points} نقاط)</span>
                          <p className="text-sm font-bold text-white">{q.stemArabic}</p>
                          {q.stemEnglish && <p className="text-xs text-slate-400 font-mono" dir="ltr">{q.stemEnglish}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => openEditQuestionModal(q)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="تعديل السؤال"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteQuestion(q.id, selectedBank.id).then(() => setBankQuestions(prev => prev.filter(item => item.id !== q.id)))}
                            className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 transition-colors"
                            title="حذف السؤال"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {q.options.map(o => (
                          <div
                            key={o.id}
                            className={`p-2 rounded-lg border ${
                              o.id === q.correctOptionId 
                                ? 'bg-teal-950/80 border-teal-500/80 text-teal-200 font-bold'
                                : 'bg-slate-900/50 border-slate-800 text-slate-400'
                            }`}
                          >
                            {o.textArabic} {o.id === q.correctOptionId && '✓ (الإجابة الصحيحة)'}
                          </div>
                        ))}
                      </div>

                      {q.explanationArabic && (
                        <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                          <strong className="text-teal-400">التعليل الطبي:</strong> {q.explanationArabic}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

              </div>
            ) : (
              <div className="p-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
                حدد بنك أسئلة لعرض وتعديل محتواه
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: ASSESSMENTS CREATOR & MANAGER */}
      {activeTab === 'assessments' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">الامتحانات والمسابقات ({assessments.length})</h3>
            <button
              onClick={() => setShowNewAssessmentForm(true)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء اختبار / مسابقة جديدة</span>
            </button>
          </div>

          {showNewAssessmentForm && (
            <form onSubmit={handleCreateAssessment} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-2xl">
              <h4 className="text-sm font-bold text-amber-400 border-b border-slate-800 pb-2">
                إعداد ونشر تقييم أكاديمي جديد
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">نوع التقييم</label>
                  <select
                    value={assessmentType}
                    onChange={(e) => setAssessmentType(e.target.value as AssessmentType)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-bold"
                  >
                    <option value="exam">امتحان مادة أسبوعي / نهائي</option>
                    <option value="competition">مسابقة طبية تنافسية</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">عنوان التقييم</label>
                  <input
                    type="text"
                    value={titleArabic}
                    onChange={(e) => setTitleArabic(e.target.value)}
                    placeholder="مثال: اختبار بلوك الجهاز القلبي الوعائي الدوري"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">وصف التقييم أو التعليمات</label>
                <input
                  type="text"
                  value={descArabic}
                  onChange={(e) => setDescArabic(e.target.value)}
                  placeholder="وصف مختصر للاختبار أو المسابقة..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">المستوى الدراسي المستهدف</label>
                  <select
                    value={studyLevelId}
                    onChange={(e) => setStudyLevelId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  >
                    {studyLevels.map(lvl => (
                      <option key={lvl.id} value={lvl.id}>
                        {lvl.titleArabic}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">بنك الأسئلة المرتبط</label>
                  <select
                    value={selectedBankForAssessment}
                    onChange={(e) => setSelectedBankForAssessment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  >
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.titleArabic}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">مدة الاختبار (بالدقائق)</label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    min={5}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">أقصى عدد محاولات لكل طالب</label>
                  <input
                    type="number"
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    min={1}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">سياسة إعلان النتائج</label>
                  <select
                    value={releasePolicy}
                    onChange={(e) => setReleasePolicy(e.target.value as ResultReleasePolicy)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  >
                    <option value="immediate">إعلان فوري عند تسليم الطالب</option>
                    <option value="after_close">إعلان تلقائي بعد إغلاق نافذة الاختبار</option>
                    <option value="manual">إعلان يدوي بموافقة المسؤول</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">تاريخ ووقت الفتح</label>
                  <input
                    type="datetime-local"
                    value={opensAt}
                    onChange={(e) => setOpensAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">تاريخ ووقت الإغلاق</label>
                  <input
                    type="datetime-local"
                    value={closesAt}
                    onChange={(e) => setClosesAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewAssessmentForm(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors shadow-lg"
                >
                  حفظ ونشر التقييم
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assessments.map(a => (
              <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      a.assessmentType === 'competition' ? 'bg-amber-500/20 text-amber-300' : 'bg-teal-500/20 text-teal-300'
                    }`}>
                      {a.assessmentType === 'competition' ? 'مسابقة' : 'امتحان مادة'}
                    </span>
                    <select
                      value={a.status}
                      onChange={(e) => handleToggleAssessmentStatus(a, e.target.value as AssessmentStatus)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border focus:outline-none ${
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

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditAssessmentModal(a)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="تعديل التقييم"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteAssessmentId(a.id)}
                      className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 text-rose-400 transition-colors"
                      title="حذف التقييم"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h4 className="text-base font-bold text-white">{a.titleArabic}</h4>
                {a.descriptionArabic && <p className="text-xs text-slate-400">{a.descriptionArabic}</p>}

                <div className="text-xs text-slate-400 grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
                  <div>المستوى: <span className="text-teal-300 font-semibold">{getLevelLabel(a.studyLevelId)}</span></div>
                  <div>المدة: <span className="text-slate-200 font-mono">{a.durationMinutes} د</span> • الأسئلة: <span className="text-slate-200 font-mono">{a.questionIds?.length || 3}</span></div>
                  <div>المحاولات: <span className="text-slate-200 font-mono">{a.maxAttempts}</span></div>
                  <div>النتائج: <span className="text-slate-200 font-semibold">{a.resultReleasePolicy === 'immediate' ? 'فوري' : a.resultReleasePolicy === 'manual' ? 'يدوي' : 'بعد الإغلاق'}</span></div>
                </div>

                {confirmDeleteAssessmentId === a.id && (
                  <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 flex items-center justify-between gap-2">
                    <span className="text-xs text-rose-200 font-bold">هل أنت متأكد من حذف هذا التقييم نهائياً؟</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteAssessment(a.id)}
                        className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                      >
                        تأكيد الحذف
                      </button>
                      <button
                        onClick={() => setConfirmDeleteAssessmentId(null)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSelectedAssessmentForResults(a);
                      setActiveTab('results');
                      getAssessmentResultsForAdmin(a.id).then(setResults);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>عرض النتائج</span>
                  </button>

                  <button
                    onClick={() => handleReleaseResults(a.id)}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>إفراج عن النتائج</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

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
                      <th className="p-3">اسم الطالب</th>
                      <th className="p-3">الدرجة</th>
                      <th className="p-3">النسبة %</th>
                      <th className="p-3">تاريخ التسليم</th>
                      <th className="p-3">حالة الإفراج</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {results.map(r => (
                      <tr key={r.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold">{r.studentNameArabic}</td>
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

      {/* MODAL: EDIT QUESTION BANK */}
      {editingBank && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <form onSubmit={handleUpdateBank} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">تعديل بنك الأسئلة</h3>
              <button type="button" onClick={() => setEditingBank(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">عنوان البنك (بالعربية)</label>
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <form onSubmit={handleUpdateQuestion} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">تعديل السؤال ومفتاح الإجابة المحمي</h3>
              <button type="button" onClick={() => setEditingQuestion(null)} className="text-slate-400 hover:text-white">
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
                <div>
                  <label className="text-slate-400 block mb-1">خيار (ج)</label>
                  <input
                    type="text"
                    value={editOptC}
                    onChange={(e) => setEditOptC(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">خيار (د)</label>
                  <input
                    type="text"
                    value={editOptD}
                    onChange={(e) => setEditOptD(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
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
                    <option value="opt-c">خيار (ج)</option>
                    <option value="opt-d">خيار (د)</option>
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

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <form onSubmit={handleUpdateAssessment} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">تعديل إعدادات الاختبار / المسابقة</h3>
              <button type="button" onClick={() => setEditingAssessment(null)} className="text-slate-400 hover:text-white">
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
                    onChange={(e) => setEditAssessmentBankId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="">-- الإبقاء على الأسئلة الحالية ({editingAssessment.questionIds?.length || 3}) --</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.titleArabic}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-slate-400 block mb-1">المدة (دقائق)</label>
                  <input
                    type="number"
                    value={editingAssessment.durationMinutes}
                    onChange={(e) => setEditingAssessment({ ...editingAssessment, durationMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    min={5}
                  />
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
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
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

    </div>
  );
}
