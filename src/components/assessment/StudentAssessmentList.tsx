/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Student Assessment & Academic Competition List
 * Displays available exams and competitions with status badges and attempt launchers
 */

import React, { useState, useEffect } from 'react';
import { 
  Award, 
  FileText, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  RefreshCw, 
  Trophy,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { 
  Assessment, 
  AssessmentAttempt, 
  AssessmentQuestionPublic, 
  AssessmentResult, 
  AssessmentType 
} from '../../types/umed';
import { 
  getPublishedAssessmentsForStudent, 
  startAttemptServer, 
  getStudentAttempts, 
  getStudentResults 
} from '../../services/assessmentService';
import ExamTakingModal from './ExamTakingModal';

interface StudentAssessmentListProps {
  universityId: string;
  studyLevelId: string;
  uid: string;
  studentNameArabic?: string;
}

export default function StudentAssessmentList({
  universityId,
  studyLevelId,
  uid,
  studentNameArabic
}: StudentAssessmentListProps) {
  const [activeTab, setActiveTab] = useState<AssessmentType>('exam');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Active Exam Session Modal States
  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<AssessmentAttempt | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<AssessmentQuestionPublic[]>([]);
  const [startingAttempt, setStartingAttempt] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const [list, userAttempts, userResults] = await Promise.all([
        getPublishedAssessmentsForStudent(universityId, studyLevelId),
        getStudentAttempts(uid),
        getStudentResults(uid)
      ]);
      setAssessments(list);
      setAttempts(userAttempts);
      setResults(userResults);
    } catch (err: any) {
      console.error('Failed to load assessments:', err);
      setStatusMsg({ type: 'error', text: 'حدث خطأ أثناء تحميل التقييمات' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [universityId, studyLevelId, uid]);

  const handleStartAttempt = async (assessment: Assessment) => {
    setStartingAttempt(assessment.id);
    setStatusMsg(null);

    try {
      const res = await startAttemptServer(assessment.id, assessment);
      setActiveAssessment(assessment);
      setActiveAttempt(res.attempt);
      setActiveQuestions(res.questions);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'فشل بدء الاختبار' });
    } finally {
      setStartingAttempt(null);
    }
  };

  const filteredAssessments = assessments.filter(a => a.assessmentType === activeTab);

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Top Banner & Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <span>مركز الاختبارات والمسابقات الأكاديمية</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            اختبارات المواد المعتمدة والمسابقات الطبية التنافسية مع الحفظ السحابي التلقائي
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('exam')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'exam'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>امتحانات المواد ({assessments.filter(a => a.assessmentType === 'exam').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('competition')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'competition'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>المسابقات الطبية ({assessments.filter(a => a.assessmentType === 'competition').length})</span>
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

      {loading ? (
        <div className="p-12 text-center text-slate-400 space-y-3 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-teal-400" />
          <p className="text-xs">جاري تحميل الاختبارات والمسابقات المتاحة...</p>
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div className="p-12 text-center text-slate-400 space-y-3 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <FileText className="w-12 h-12 mx-auto text-slate-600" />
          <h3 className="text-sm font-bold text-slate-300">لا توجد تقييمات منشورة حالياً لهذا المستوى</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            لم يقم مسؤولو الكلية بنشر {activeTab === 'exam' ? 'امتحانات' : 'مسابقات'} جديدة لمستواك الأكاديمي الحالي بعد.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAssessments.map((assessment) => {
            const now = new Date();
            const opensAt = new Date(assessment.opensAt);
            const closesAt = new Date(assessment.closesAt);

            const isOpen = now >= opensAt && now <= closesAt;
            const isUpcoming = now < opensAt;

            const userAttemptList = attempts.filter(a => a.assessmentId === assessment.id && a.status === 'scored');
            const userResult = results.find(r => r.assessmentId === assessment.id);
            const attemptCount = userAttemptList.length;
            const hasMaxAttempts = attemptCount >= assessment.maxAttempts;

            return (
              <div 
                key={assessment.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl hover:border-slate-700 transition-all space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      isOpen 
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                        : isUpcoming 
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {isOpen ? 'متاح الآن' : isUpcoming ? 'قادم قريباً' : 'مغلق / منتهي'}
                    </span>

                    <span className="text-[11px] text-slate-400 font-mono">
                      المحاولات المكتملة: {attemptCount}/{assessment.maxAttempts}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white leading-snug">
                    {assessment.titleArabic}
                  </h3>

                  {assessment.descriptionArabic && (
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {assessment.descriptionArabic}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-teal-400" />
                      <span>المدة: {assessment.durationMinutes} دقيقة</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                      <span>الدرجة الكلية: {assessment.totalPoints} نقطة</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>متاح حتى: {closesAt.toLocaleDateString('ar-YE')}</span>
                    </div>
                  </div>
                </div>

                {/* Score Banner if completed */}
                {userResult && (
                  userResult.isReleased ? (
                    <div className="p-3 rounded-xl bg-teal-950/60 border border-teal-800/60 flex items-center justify-between text-xs text-teal-200">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-teal-400" />
                        <span>درجتك المعتمدة: <strong className="font-mono text-sm">{userResult.score}/{userResult.totalPoints}</strong></span>
                      </div>
                      <span className="font-mono font-bold bg-teal-500/20 px-2 py-0.5 rounded text-teal-300">
                        {userResult.percentage}%
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 flex items-center gap-2 text-xs text-amber-300">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>تم تسليم المحاولة بنجاح — ستظهر الدرجة فور إعلان النتائج رسمياً من الكلية.</span>
                    </div>
                  )
                )}

                <div>
                  <button
                    onClick={() => handleStartAttempt(assessment)}
                    disabled={!isOpen || hasMaxAttempts || startingAttempt === assessment.id}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      isOpen && !hasMaxAttempts
                        ? activeTab === 'competition'
                          ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/30'
                          : 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/30'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {startingAttempt === assessment.id ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري بدء الجلسة الموثوقة...</span>
                      </>
                    ) : hasMaxAttempts ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تم استيفاء المحاولات المسموحة</span>
                      </>
                    ) : isOpen ? (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>{activeTab === 'competition' ? 'بدء المشاركة في المسابقة' : 'بدء الاختبار الآن'}</span>
                      </>
                    ) : (
                      <span>الاختبار غير متاح حالياً</span>
                    )}
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {activeAssessment && activeAttempt && (
        <ExamTakingModal
          assessment={activeAssessment}
          attempt={activeAttempt}
          questions={activeQuestions}
          studentNameArabic={studentNameArabic}
          onClose={() => {
            setActiveAssessment(null);
            setActiveAttempt(null);
            loadData();
          }}
          onSubmitted={(res) => {
            setResults(prev => [...prev.filter(r => r.id !== res.id), res]);
            loadData();
          }}
        />
      )}

    </div>
  );
}
