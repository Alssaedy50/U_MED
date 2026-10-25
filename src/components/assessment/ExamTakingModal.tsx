/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Exam & Competition Taking Modal (Mobile-First RTL Interface)
 * Features Server Countdown, Auto-save with Cloud Sync Status, and Server-side Scoring
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  CloudCheck, 
  CloudOff, 
  ChevronRight, 
  ChevronLeft, 
  Send, 
  Award, 
  X,
  RefreshCw,
  Lock,
  BookOpen,
  HelpCircle
} from 'lucide-react';
import { 
  Assessment, 
  AssessmentAttempt, 
  AssessmentQuestionPublic, 
  AssessmentResult 
} from '../../types/umed.ts';
import { saveProgressServer, submitAttemptServer } from '../../services/assessmentService.ts';

interface ExamTakingModalProps {
  assessment: Assessment;
  attempt: AssessmentAttempt;
  questions: AssessmentQuestionPublic[];
  studentNameArabic?: string;
  onClose: () => void;
  onSubmitted: (result: AssessmentResult) => void;
}

export default function ExamTakingModal({
  assessment,
  attempt,
  questions,
  studentNameArabic,
  onClose,
  onSubmitted
}: ExamTakingModalProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>(attempt.answers || {});
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const [showConfirmSubmit, setShowConfirmSubmit] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(() => {
    const expireTime = new Date(attempt.expiresAt).getTime();
    const nowTime = Date.now();
    return Math.max(0, Math.floor((expireTime - nowTime) / 1000));
  });

  const [result, setResult] = useState<AssessmentResult | null>(null);
  const saveTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (result) return;

    const timer = setInterval(() => {
      const expireTime = new Date(attempt.expiresAt).getTime();
      const nowTime = Date.now();
      const remaining = Math.max(0, Math.floor((expireTime - nowTime) / 1000));
      setTimeLeftSeconds(remaining);

      if (remaining === 0 && !submitting && !result) {
        clearInterval(timer);
        handleFinalSubmit();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt.expiresAt, result, submitting, answers]);

  const handleSelectOption = (questionId: string, optionId: string) => {
    if (result || submitting) return;

    const newAnswers = { ...answers, [questionId]: optionId };
    setAnswers(newAnswers);
    setSyncStatus('saving');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveProgressServer(attempt.id, newAnswers);
        setSyncStatus('saved');
      } catch (err) {
        console.warn('Auto-save error:', err);
        setSyncStatus('error');
      }
    }, 600);
  };

  const handleFinalSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await submitAttemptServer(attempt.id, answers, assessment, studentNameArabic);
      setResult(res.result);
      onSubmitted(res.result);
    } catch (err: any) {
      console.error('Submission failed:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء تسليم الاختبار. يرجى المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
      setShowConfirmSubmit(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const isTimerCritical = timeLeftSeconds <= 300;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col justify-between overflow-hidden text-slate-100 font-sans" dir="rtl">
      
      {/* 1. Header Bar */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
            assessment.assessmentType === 'competition' 
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
              : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
          }`}>
            {assessment.assessmentType === 'competition' ? 'مسابقة أكاديمية' : 'اختبار مادة'}
          </span>
          <h2 className="text-sm md:text-base font-bold text-white line-clamp-1">
            {assessment.titleArabic}
          </h2>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {/* Cloud Sync Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
            {syncStatus === 'saving' && (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-amber-300">جاري الحفظ...</span>
              </>
            )}
            {syncStatus === 'saved' && (
              <>
                <CloudCheck className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-teal-300">تم الحفظ سحابياً ✓</span>
              </>
            )}
            {syncStatus === 'error' && (
              <>
                <CloudOff className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-300">إعادة المحاولة...</span>
              </>
            )}
          </div>

          {!result && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm font-bold border transition-colors ${
              isTimerCritical 
                ? 'bg-rose-950/80 border-rose-600 text-rose-300 animate-pulse' 
                : 'bg-slate-800 border-slate-700 text-teal-300'
            }`}>
              <Clock className="w-4 h-4" />
              <span>{formatTimer(timeLeftSeconds)}</span>
            </div>
          )}

          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl w-full mx-auto space-y-6">
        
        {result ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-teal-500/20 text-teal-400 mx-auto flex items-center justify-center border border-teal-500/30">
                <Award className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">
                  {assessment.assessmentType === 'competition' ? 'تمت المشاركة في المسابقة بنجاح!' : 'تم تسليم الاختبار بنجاح!'}
                </h3>
                <p className="text-slate-400 text-xs sm:text-sm">
                  تم حفظ وتصحيح محاولتك سحابياً على خوادم المنصة الموثوقة.
                </p>
              </div>

              {result.isReleased ? (
                <div className="p-4 sm:p-6 rounded-xl bg-slate-950 border border-slate-800 max-w-sm mx-auto space-y-2">
                  <div className="text-slate-400 text-xs">النتيجة النهائية المعتمدة</div>
                  <div className="text-3xl sm:text-4xl font-extrabold text-teal-400 font-mono">
                    {result.score} / {result.totalPoints}
                  </div>
                  <div className="inline-block px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 font-mono text-xs sm:text-sm font-bold">
                    النسبة المئوية: {result.percentage}%
                  </div>
                </div>
              ) : (
                <div className="p-4 sm:p-5 rounded-xl bg-amber-950/40 border border-amber-800/50 max-w-md mx-auto space-y-2 text-amber-300 text-xs">
                  <Lock className="w-6 h-6 mx-auto text-amber-400" />
                  <div className="font-bold text-sm">النتيجة محفوظة وبانتظار الإعلان الرسمي</div>
                  <p className="text-slate-300 leading-relaxed">
                    وفقاً لسياسة هذا التقييم، سيتم إظهار الدرجات التفصيلية فور اعتماد وإفراج النتائج من قبل إدارة الكلية.
                  </p>
                </div>
              )}
            </div>

            {/* Comprehensive Question Review & Explanations when Released */}
            {result.isReleased && result.questionReviews && result.questionReviews.length > 0 && (
              <div className="pt-4 border-t border-slate-800 space-y-4 text-right">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-teal-400" />
                    <span>مراجعة الأسئلة والتعليلات العلمية المفصلة:</span>
                  </h4>
                  <span className="text-xs text-slate-400 font-mono">
                    {result.questionReviews.length} سؤال
                  </span>
                </div>

                <div className="space-y-4">
                  {result.questionReviews.map((rev, rIdx) => {
                    const isEssay = rev.questionType === 'essay';
                    const isTF = rev.questionType === 'true_false';

                    return (
                      <div
                        key={rev.questionId || rIdx}
                        className={`p-4 rounded-xl border space-y-3 ${
                          rev.isCorrect
                            ? 'bg-emerald-950/20 border-emerald-800/50'
                            : 'bg-rose-950/20 border-rose-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              سؤال #{rIdx + 1}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rev.isCorrect
                                ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                                : 'bg-rose-900/60 text-rose-300 border border-rose-700'
                            }`}>
                              {rev.isCorrect ? 'إجابة صحيحة ✓' : 'إجابة غير صحيحة ✗'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                              {isEssay ? 'سؤال مقالي' : isTF ? 'صح وخطأ' : 'اختيار من متعدد'}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-slate-400">
                            {rev.points} درجات
                          </span>
                        </div>

                        <p className="text-sm font-semibold text-slate-100 leading-relaxed">
                          {rev.stemArabic}
                        </p>
                        {rev.stemEnglish && (
                          <p className="text-xs text-slate-400 font-mono" dir="ltr">
                            {rev.stemEnglish}
                          </p>
                        )}

                        {/* Essay Question Review */}
                        {isEssay && (
                          <div className="space-y-2 pt-1">
                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                              <span className="text-[11px] text-slate-400 font-semibold block">إجابتك المسجلة:</span>
                              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                                {rev.studentAnswer?.trim() || '(لم تتم كتابة إجابة)'}
                              </p>
                            </div>
                            {rev.modelAnswerArabic && (
                              <div className="p-3 rounded-lg bg-purple-950/30 border border-purple-800/60 space-y-1">
                                <span className="text-[11px] text-purple-300 font-bold block flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                                  <span>الإجابة النموذجية ومعايير التصحيح:</span>
                                </span>
                                <p className="text-xs text-purple-100 leading-relaxed whitespace-pre-wrap">
                                  {rev.modelAnswerArabic}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* MCQ / True-False Options with Individual Rationales */}
                        {!isEssay && rev.options && rev.options.length > 0 && (
                          <div className="space-y-2 pt-1">
                            {rev.options.map((opt, oIdx) => {
                              const isSelected = rev.studentAnswer === opt.id;
                              const isCorrectOpt = opt.isCorrect ?? (rev.correctOptionId === opt.id);
                              const letter = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'][oIdx] || opt.id;

                              return (
                                <div
                                  key={opt.id}
                                  className={`p-3 rounded-lg border text-xs space-y-1.5 transition-all ${
                                    isCorrectOpt
                                      ? 'bg-emerald-950/60 border-emerald-600/80 text-emerald-100'
                                      : isSelected
                                      ? 'bg-rose-950/60 border-rose-600/80 text-rose-100'
                                      : 'bg-slate-950/40 border-slate-800/60 text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                        isCorrectOpt
                                          ? 'bg-emerald-600 text-white'
                                          : isSelected
                                          ? 'bg-rose-600 text-white'
                                          : 'bg-slate-800 text-slate-400'
                                      }`}>
                                        {letter}
                                      </span>
                                      <span className="font-medium">{opt.textArabic}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 text-[10px] font-bold">
                                      {isCorrectOpt && (
                                        <span className="text-emerald-300 flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" />
                                          <span>الإجابة الصحيحة</span>
                                        </span>
                                      )}
                                      {isSelected && !isCorrectOpt && (
                                        <span className="text-rose-300 flex items-center gap-1">
                                          <X className="w-3 h-3" />
                                          <span>إجابتك المختارة</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Individual Option Rationale */}
                                  {opt.explanationArabic && (
                                    <div className={`text-[11px] pr-6 pt-1 border-t ${
                                      isCorrectOpt ? 'border-emerald-800/40 text-emerald-200' : 'border-slate-800/60 text-slate-400'
                                    }`}>
                                      <span className="font-semibold text-slate-400 ml-1">التعليل:</span>
                                      <span>{opt.explanationArabic}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Overall Question Explanation */}
                        {rev.explanationArabic && (
                          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                            <span className="font-bold text-teal-400 flex items-center gap-1.5 text-[11px]">
                              <HelpCircle className="w-3.5 h-3.5" />
                              <span>التعليل العلمي العام:</span>
                            </span>
                            <p className="leading-relaxed text-slate-200">
                              {rev.explanationArabic}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold transition-colors shadow-lg shadow-teal-900/30"
            >
              العودة إلى قائمة التقييمات
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Question Quick Navigation Bar */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-md flex items-center gap-2 overflow-x-auto scrollbar-thin">
              <span className="text-xs text-slate-400 whitespace-nowrap pl-2 border-l border-slate-800">
                الأسئلة ({answeredCount}/{questions.length}):
              </span>
              <div className="flex items-center gap-1.5">
                {questions.map((q, idx) => {
                  const isAnswered = Boolean(answers[q.id] && answers[q.id].trim().length > 0);
                  const isCurrent = idx === currentQuestionIndex;

                  let btnClass = 'bg-slate-800 text-slate-400 hover:bg-slate-700';
                  if (isCurrent) {
                    btnClass = 'bg-teal-500 text-slate-950 font-bold ring-2 ring-teal-400';
                  } else if (isAnswered) {
                    btnClass = 'bg-teal-950 border border-teal-800/60 text-teal-300';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`w-8 h-8 rounded-lg text-xs font-mono transition-all flex items-center justify-center shrink-0 ${btnClass}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {errorMsg && (
              <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-sm flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {currentQuestion && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-6">
                
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-teal-400 bg-teal-950/80 px-2.5 py-1 rounded-lg border border-teal-800/50">
                      السؤال {currentQuestionIndex + 1} من {questions.length}
                    </span>
                    <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
                      {currentQuestion.questionType === 'essay'
                        ? 'سؤال مقالي'
                        : currentQuestion.questionType === 'true_false'
                        ? 'صح وخطأ'
                        : 'اختيار من متعدد'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    النقاط: {currentQuestion.points}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-base md:text-lg font-bold text-slate-100 leading-relaxed">
                    {currentQuestion.stemArabic}
                  </p>
                  {currentQuestion.stemEnglish && (
                    <p className="text-xs md:text-sm font-medium text-slate-400 font-mono" dir="ltr">
                      {currentQuestion.stemEnglish}
                    </p>
                  )}
                  {currentQuestion.imageUrl && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-slate-800 max-h-64">
                      <img src={currentQuestion.imageUrl} alt="Medical Slide" className="w-full object-contain bg-slate-950" />
                    </div>
                  )}
                </div>

                {/* Question Type: Essay Answer Area */}
                {currentQuestion.questionType === 'essay' && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>اكتب إجابتك المقالية الطبية بالتفصيل:</span>
                      <span className="font-mono">{(answers[currentQuestion.id] || '').length} حرف</span>
                    </div>
                    <textarea
                      value={answers[currentQuestion.id] || ''}
                      onChange={(e) => handleSelectOption(currentQuestion.id, e.target.value)}
                      rows={6}
                      placeholder="اكتب الإجابة المقالية هنا بالتفصيل (يتم الحفظ التلقائي فور الكتابة)..."
                      className="w-full p-4 rounded-xl bg-slate-950/80 border border-slate-700 text-sm text-white focus:outline-none focus:border-teal-500 leading-relaxed"
                    />
                  </div>
                )}

                {/* Question Type: True / False Choice Cards */}
                {currentQuestion.questionType === 'true_false' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {currentQuestion.options.map((opt) => {
                      const isSelected = answers[currentQuestion.id] === opt.id;
                      const isTrue = opt.id === 'opt-a' || opt.textArabic.includes('صح');
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectOption(currentQuestion.id, opt.id)}
                          className={`p-5 rounded-2xl border text-base font-bold transition-all flex items-center justify-center gap-3 ${
                            isSelected
                              ? isTrue
                                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-100 ring-2 ring-emerald-500/50 shadow-lg'
                                : 'bg-rose-950/80 border-rose-500 text-rose-100 ring-2 ring-rose-500/50 shadow-lg'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                          }`}
                        >
                          {isTrue ? (
                            <CheckCircle2 className={`w-6 h-6 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
                          ) : (
                            <X className={`w-6 h-6 ${isSelected ? 'text-rose-400' : 'text-slate-500'}`} />
                          )}
                          <span>{opt.textArabic}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Question Type: MCQ with Dynamic Options */}
                {(!currentQuestion.questionType || currentQuestion.questionType === 'mcq') && (
                  <div className="space-y-3 pt-2">
                    {currentQuestion.options.map((opt, oIdx) => {
                      const isSelected = answers[currentQuestion.id] === opt.id;
                      const letter = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'][oIdx] || opt.id;

                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleSelectOption(currentQuestion.id, opt.id)}
                          className={`w-full text-right p-4 rounded-xl border text-sm font-medium transition-all flex items-start gap-3 ${
                            isSelected
                              ? 'bg-teal-950/70 border-teal-500 text-teal-100 shadow-lg shadow-teal-950/50 ring-1 ring-teal-500/50'
                              : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg border text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            isSelected ? 'bg-teal-500 border-teal-400 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-400'
                          }`}>
                            {isSelected ? `✓ ${letter}` : letter}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div>{opt.textArabic}</div>
                            {opt.textEnglish && (
                              <div className="text-xs text-slate-500 font-mono" dir="ltr">{opt.textEnglish}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </main>

      {/* 3. Footer Bar Navigation */}
      {!result && (
        <footer className="bg-slate-900 border-t border-slate-800 p-4 flex items-center justify-between gap-3 shadow-xl">
          <button
            onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
            disabled={currentQuestionIndex === 0}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
            <span>السؤال السابق</span>
          </button>

          <button
            onClick={() => setShowConfirmSubmit(true)}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-lg shadow-teal-900/40"
          >
            <Send className="w-4 h-4" />
            <span>تسليم الاختبار النهائي</span>
          </button>

          <button
            onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
            disabled={currentQuestionIndex === questions.length - 1}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <span>السؤال التالي</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </footer>
      )}

      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">تأكيد التسليم النهائي للاختبار</h3>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">
              <p>
                لقد أجبت على <strong className="text-teal-400 font-mono text-sm">{answeredCount}</strong> من أصل <strong className="text-slate-100 font-mono text-sm">{questions.length}</strong> أسئلة.
              </p>
              {answeredCount < questions.length && (
                <p className="text-amber-300 font-semibold">
                  تنبيه: هناك أسئلة لم تقم بالإجابة عليها بعد. هل أنت متأكد من الرغبة في التسليم الآن؟
                </p>
              )}
              <p className="text-slate-400 pt-1">
                بمجرد التسليم، سيتم تصحيح الإجابات سحابياً ولن تتمكن من تعديل هذه المحاولة.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                متابعة الحل
              </button>
              <button
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors shadow-lg flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري التسليم والتصحيح...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>تأكيد وتسليم الآن</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
