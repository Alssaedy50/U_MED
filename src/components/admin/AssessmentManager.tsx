/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Admin Assessment & Competition Management Console
 * Manage Question Banks, Question Answer Keys, Exam Scheduling, and Result Releases
 */

import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Plus, 
  Trash2, 
  Unlock, 
  Eye, 
  AlertCircle,
  FileSpreadsheet,
  BookOpen
} from 'lucide-react';
import { 
  QuestionBank, 
  QuestionItemFull, 
  Assessment, 
  AssessmentType, 
  ResultReleasePolicy, 
  AssessmentResult,
  DAR_AL_SALAM_SEED
} from '../../types/umed.ts';
import { 
  getQuestionBanks, 
  createQuestionBank, 
  getBankQuestions, 
  createQuestion, 
  deleteQuestion, 
  getAssessments, 
  createAssessment, 
  getAssessmentResultsForAdmin, 
  releaseAssessmentResults 
} from '../../services/assessmentService.ts';

interface AssessmentManagerProps {
  universityId: string;
}

export default function AssessmentManager({ universityId }: AssessmentManagerProps) {
  const [activeTab, setActiveTab] = useState<'banks' | 'assessments' | 'results'>('banks');

  // Question Banks State
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [bankQuestions, setBankQuestions] = useState<QuestionItemFull[]>([]);
  
  // New Bank Form State
  const [showNewBankForm, setShowNewBankForm] = useState<boolean>(false);
  const [newBankTitle, setNewBankTitle] = useState<string>('');
  const [newBankDesc, setNewBankDesc] = useState<string>('');

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

  // Assessments State
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [showNewAssessmentForm, setShowNewAssessmentForm] = useState<boolean>(false);
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('exam');
  const [titleArabic, setTitleArabic] = useState<string>('');
  const [descArabic, setDescArabic] = useState<string>('');
  const [studyLevelId, setStudyLevelId] = useState<string>('lvl-4');
  const [selectedBankForAssessment, setSelectedBankForAssessment] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [releasePolicy, setReleasePolicy] = useState<ResultReleasePolicy>('immediate');
  const [opensAt, setOpensAt] = useState<string>(new Date().toISOString().slice(0, 16));
  const [closesAt, setClosesAt] = useState<string>(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16));

  // Results State
  const [selectedAssessmentForResults, setSelectedAssessmentForResults] = useState<Assessment | null>(null);
  const [results, setResults] = useState<AssessmentResult[]>([]);

  // Feedback State
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [bankList, asmntList] = await Promise.all([
        getQuestionBanks(universityId),
        getAssessments(universityId)
      ]);
      setBanks(bankList);
      setAssessments(asmntList);

      if (bankList.length > 0 && !selectedBank) {
        setSelectedBank(bankList[0]);
        setSelectedBankForAssessment(bankList[0].id);
        const qList = await getBankQuestions(bankList[0].id);
        setBankQuestions(qList);
      }
    } catch (err: any) {
      console.error('Failed to load assessment data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [universityId]);

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
        titleArabic: newBankTitle,
        descriptionArabic: newBankDesc,
        universityId,
        createdBy: 'ADMIN'
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

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBank || !stemArabic.trim() || !optA.trim() || !optB.trim()) return;

    setStatusMsg(null);
    try {
      const created = await createQuestion({
        bankId: selectedBank.id,
        stemArabic,
        stemEnglish,
        options: [
          { id: 'opt-a', textArabic: optA },
          { id: 'opt-b', textArabic: optB },
          { id: 'opt-c', textArabic: optC || 'غير محدد' },
          { id: 'opt-d', textArabic: optD || 'غير محدد' }
        ],
        correctOptionId: correctOpt,
        explanationArabic: explanation,
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
          titleArabic,
          descriptionArabic: descArabic,
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

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
              إدارة بنوك الأسئلة والاختبارات
            </span>
          </div>
          <h2 className="text-xl font-bold text-white">منصة إدارة الامتحانات والمسابقات الطبية</h2>
          <p className="text-xs text-slate-400 mt-1">
            بناء الأسئلة، ضبط مفاتيح الإجابات المحمية، جدولة المواعيد، وتدقيق وإفراج النتائج
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('banks')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'banks' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>بنوك الأسئلة</span>
          </button>
          <button
            onClick={() => setActiveTab('assessments')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'assessments' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>الاختبارات والمسابقات</span>
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'results' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>النتائج والإفراج</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
          statusMsg.type === 'error' ? 'bg-rose-950/60 border-rose-800 text-rose-300' : 'bg-teal-950/60 border-teal-800 text-teal-300'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
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
                <button
                  key={b.id}
                  onClick={() => handleSelectBank(b)}
                  className={`w-full text-right p-3.5 rounded-xl border text-xs transition-all ${
                    selectedBank?.id === b.id
                      ? 'bg-teal-950/70 border-teal-500 text-teal-200'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold text-sm text-white">{b.titleArabic}</div>
                  {b.descriptionArabic && <div className="text-[11px] text-slate-400 mt-1">{b.descriptionArabic}</div>}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            {selectedBank ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white">{selectedBank.titleArabic}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">عدد الأسئلة المسجلة: {bankQuestions.length}</p>
                  </div>
                  <button
                    onClick={() => setShowNewQuestionForm(true)}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة سؤال MCQ جديد</span>
                  </button>
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
                        <button
                          onClick={() => deleteQuestion(q.id, selectedBank.id).then(() => setBankQuestions(prev => prev.filter(item => item.id !== q.id)))}
                          className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 transition-colors"
                          title="حذف السؤال"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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

      {/* TAB 2: ASSESSMENTS CREATOR */}
      {activeTab === 'assessments' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">الامتحانات والمسابقات المنشورة ({assessments.length})</h3>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">المستوى الدراسي المستهدف</label>
                  <select
                    value={studyLevelId}
                    onChange={(e) => setStudyLevelId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  >
                    {DAR_AL_SALAM_SEED.studyLevels.map(lvl => (
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
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    a.assessmentType === 'competition' ? 'bg-amber-500/20 text-amber-300' : 'bg-teal-500/20 text-teal-300'
                  }`}>
                    {a.assessmentType === 'competition' ? 'مسابقة' : 'امتحان مادة'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    المدة: {a.durationMinutes} دقيقة • الأسئلة: {a.questionIds?.length || 3}
                  </span>
                </div>

                <h4 className="text-base font-bold text-white">{a.titleArabic}</h4>

                <div className="text-xs text-slate-400 space-y-1">
                  <div>المستوى: <span className="text-teal-300 font-semibold">{a.studyLevelId === 'lvl-internship' ? 'سنة الامتياز' : `المستوى ${a.studyLevelId.replace('lvl-', '')}`}</span></div>
                  <div>سياسة النتائج: <span className="text-slate-200 font-semibold">{a.resultReleasePolicy === 'immediate' ? 'فوري' : a.resultReleasePolicy === 'manual' ? 'يدوي' : 'بعد الإغلاق'}</span></div>
                </div>

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

      {/* TAB 3: RESULTS & RELEASES */}
      {activeTab === 'results' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-white">تدقيق وإفراج نتائج الطلاب</h3>
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
              <button
                onClick={() => handleReleaseResults(selectedAssessmentForResults.id)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-lg"
              >
                <Unlock className="w-4 h-4" />
                <span>إفراج عن جميع نتائج هذا التقييم</span>
              </button>
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

    </div>
  );
}
