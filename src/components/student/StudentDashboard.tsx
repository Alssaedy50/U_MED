/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Mobile-First Student Dashboard & Academic Profile
 * Optimized for common Android phone viewports (360px–412px) with Arabic RTL
 */

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  ChevronRight, 
  Sparkles,
  RefreshCw,
  User,
  Stethoscope,
  Send,
  Trophy
} from 'lucide-react';
import { 
  StudentEnrollment, 
  StudyPeriod, 
  CourseOffering, 
  StudyLevel 
} from '../../types/umed.ts';
import { 
  fetchStudentEnrollment, 
  submitAcademicChangeRequest 
} from '../../services/enrollmentService.ts';
import { 
  fetchStudyPeriods, 
  fetchCourseOfferings, 
  fetchStudyLevels
} from '../../services/academicService.ts';
import RegisterEnrollment from './RegisterEnrollment.tsx';
import StudentMedicalLibrary from '../library/StudentMedicalLibrary.tsx';
import StudentAssessmentList from '../assessment/StudentAssessmentList.tsx';
import StudentProfile from './StudentProfile.tsx';

interface StudentDashboardProps {
  uid: string;
  userEmail: string;
  displayNameArabic: string;
}

export default function StudentDashboard({
  uid,
  userEmail,
  displayNameArabic
}: StudentDashboardProps) {
  const [enrollment, setEnrollment] = useState<StudentEnrollment | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'study' | 'library' | 'assessments' | 'profile'>('study');

  // Academic Content State
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<StudyPeriod | null>(null);
  const [courses, setCourses] = useState<CourseOffering[]>([]);
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>([]);

  // Academic Change Request Form State
  const [showChangeModal, setShowChangeModal] = useState<boolean>(false);
  const [requestedLevelId, setRequestedLevelId] = useState<string>('');
  const [requestedNumber, setRequestedNumber] = useState<string>('');
  const [changeReason, setChangeReason] = useState<string>('');
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);
  const [changeLoading, setChangeLoading] = useState<boolean>(false);

  const loadStudentData = async () => {
    setLoading(true);
    try {
      const enr = await fetchStudentEnrollment(uid);
      setEnrollment(enr);

      if (enr && enr.status === 'approved') {
        const lvls = await fetchStudyLevels(enr.programId);
        setStudyLevels(lvls);

        const periods = await fetchStudyPeriods(enr.currentStudyLevelId);
        setStudyPeriods(periods);
        if (periods.length > 0) {
          setSelectedPeriod(periods[0]);
        }
      }
    } catch (err) {
      console.warn('Failed to load student dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData();
  }, [uid]);

  useEffect(() => {
    if (selectedPeriod) {
      fetchCourseOfferings(selectedPeriod.id).then((crs) => {
        setCourses(crs);
      });
    } else {
      setCourses([]);
    }
  }, [selectedPeriod]);

  const handleAcademicChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    setChangeLoading(true);
    setChangeSuccess(null);
    try {
      await submitAcademicChangeRequest({
        uid,
        enrollmentId: enrollment.id,
        universityId: enrollment.universityId,
        requestedLevelId: requestedLevelId || undefined,
        requestedAcademicNumber: requestedNumber || undefined,
        reason: changeReason
      });
      setChangeSuccess('تم إرسال طلب التعديل بنجاح لإدارة الكلية.');
      setShowChangeModal(false);
      setChangeReason('');
    } catch (err: any) {
      console.warn('Change request failed:', err);
    } finally {
      setChangeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-xs text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-teal-400 mb-2" />
        <span>جارٍ تحميل بيانات الطالب ولوحة الدراسة...</span>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-teal-950/30 border border-teal-800/50 rounded-2xl text-xs text-teal-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300 flex-shrink-0" />
            <span>مرحباً بك د. {displayNameArabic}! يرجى إتمام تسجيل بيانات القيد الأكاديمي لمرة واحدة لتخصيص مقرراتك الدراسية.</span>
          </div>
        </div>
        <RegisterEnrollment
          uid={uid}
          studentNameArabic={displayNameArabic}
          onEnrollmentComplete={(newEnr) => {
            setEnrollment(newEnr);
            loadStudentData();
          }}
        />
      </div>
    );
  }

  if (enrollment.status === 'pending') {
    return (
      <div className="max-w-xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center">
          <Clock className="w-8 h-8" />
        </div>
        <div>
          <span className="text-xs px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold inline-block mb-2">
            طلب القيد قيد المراجعة والاعتماد
          </span>
          <h2 className="text-lg font-bold text-white">
            مرحباً د. {displayNameArabic}
          </h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            تم استلام طلب قيدك الأكاديمي برقم <code className="text-teal-300 font-mono" dir="ltr">{enrollment.academicStudentNumber}</code> في كلية الطب البشري، وسيتم تفعيل وصولك للمقررات والاختبارات فور مراجعة واعتماد الطلب من قبل إدارة الجامعة.
          </p>
        </div>

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-right space-y-2">
          <div className="flex justify-between border-b border-slate-800 pb-1.5">
            <span className="text-slate-400">الجامعة:</span>
            <span className="text-slate-200 font-semibold">{enrollment.universityId === 'univ-dar-al-salam' ? 'جامعة دار السلام الدولية' : enrollment.universityId}</span>
          </div>
          <div className="flex justify-between border-b border-slate-800 pb-1.5">
            <span className="text-slate-400">المستوى المطلوب:</span>
            <span className="text-teal-300 font-semibold">
              {enrollment.currentStudyLevelId === 'lvl-internship' ? 'سنة الامتياز (سريري)' : `المستوى ${enrollment.currentStudyLevelId.replace('lvl-', '')}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">تاريخ الإرسال:</span>
            <span className="text-slate-400 font-mono">{new Date(enrollment.enrolledAt || enrollment.requestedAt || Date.now()).toLocaleDateString('ar-YE')}</span>
          </div>
        </div>

        <button
          onClick={loadStudentData}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>تحديث حالة القيد الآن</span>
        </button>
      </div>
    );
  }

  if (enrollment.status === 'rejected') {
    return (
      <div className="max-w-xl mx-auto bg-slate-900/90 border border-rose-800/50 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-white">لم يتم قبول طلب القيد الأكاديمي</h2>
        {enrollment.rejectionReason && (
          <div className="p-3 bg-rose-950/40 rounded-xl border border-rose-800/60 text-xs text-rose-300">
            <strong>سبب عدم القبول:</strong> {enrollment.rejectionReason}
          </div>
        )}
        <p className="text-xs text-slate-400">
          يمكنك إعادة إدخال بيانات القيد الصحيحة وإرسالها مجدداً.
        </p>
        <button
          onClick={() => setEnrollment(null)}
          className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors"
        >
          إعادة تسجيل القيد ببيانات مصححة
        </button>
      </div>
    );
  }

  const isInternship = enrollment.currentStudyLevelId === 'lvl-internship';

  return (
    <div className="space-y-5">
      
      {/* 1. Academic Header Badge */}
      <div className="bg-gradient-to-r from-teal-950/80 via-slate-900 to-indigo-950/80 border border-teal-500/30 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20 font-black text-xl flex-shrink-0">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-base sm:text-lg text-white">
                  د. {displayNameArabic}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                  قيد معتمد ✓
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isInternship 
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                    : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                }`}>
                  {isInternship ? 'سنة الامتياز السريرية' : `المستوى ${enrollment.currentStudyLevelId.replace('lvl-', '')}`}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                جامعة دار السلام الدولية • كلية الطب البشري • نظام البلوكات (MBBS)
              </p>
            </div>
          </div>

          <div className="text-right sm:text-left flex items-center gap-2">
            <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-500 block text-[10px]">الرقم الأكاديمي:</span>
              <span className="font-mono text-teal-300 font-bold" dir="ltr">{enrollment.academicStudentNumber}</span>
            </div>
          </div>
        </div>

        {/* Student Navigation Pill Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('study')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'study' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white bg-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>المقررات والبلوكات</span>
          </button>

          <button
            onClick={() => setActiveTab('library')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'library' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white bg-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>المكتبة الطبية والشرائح</span>
          </button>

          <button
            onClick={() => setActiveTab('assessments')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'assessments' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white bg-slate-900'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>الاختبارات والمسابقات</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'profile' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white bg-slate-900'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>الملف الأكاديمي وطلب التعديل</span>
          </button>
        </div>
      </div>

      {changeSuccess && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{changeSuccess}</span>
        </div>
      )}

      {/* TAB: MEDICAL LIBRARY */}
      {activeTab === 'library' && (
        <StudentMedicalLibrary
          universityId={enrollment.universityId}
          programId={enrollment.programId}
          studyLevelId={enrollment.currentStudyLevelId}
          studentNameArabic={displayNameArabic}
        />
      )}

      {/* TAB: ASSESSMENTS & COMPETITIONS */}
      {activeTab === 'assessments' && (
        <StudentAssessmentList
          universityId={enrollment.universityId}
          studyLevelId={enrollment.currentStudyLevelId}
          uid={uid}
          studentNameArabic={displayNameArabic}
        />
      )}

      {/* TAB: STUDY DASHBOARD (Blocks & Courses) */}
      {activeTab === 'study' && (
        <div className="space-y-5">
          
          {studyPeriods.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  البلوكات الدراسية المتاحة لمستواك:
                </span>
                <span className="text-xs text-teal-400 font-mono">
                  {studyPeriods.length} بلوكات
                </span>
              </div>

              <div className="flex space-x-reverse space-x-2 overflow-x-auto no-scrollbar pb-1">
                {studyPeriods.map((period) => {
                  const isSelected = selectedPeriod?.id === period.id;
                  return (
                    <button
                      key={period.id}
                      onClick={() => setSelectedPeriod(period)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-2 ${
                        isSelected
                          ? 'bg-teal-500/20 border-teal-500 text-white shadow-lg shadow-teal-500/10'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-teal-300">
                        {period.code}
                      </span>
                      <span>{period.titleArabic}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Courses & Sections Grid */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-400" />
                  <span>المقررات والمحاضرات الدراسية</span>
                  {selectedPeriod && <span className="text-xs text-teal-300 font-mono">({selectedPeriod.titleArabic})</span>}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  استعراض المحاضرات النظرية والتدريب المخبري المخصص لمستواك
                </p>
              </div>
              <button
                onClick={() => setActiveTab('library')}
                className="px-3 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 text-xs font-bold transition-colors"
              >
                فتح المكتبة الرقمية
              </button>
            </div>

            {courses.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs space-y-3">
                <p>يمكنك الوصول مباشرة إلى جميع محاضرات وشرائح هذا البلوك عبر المكتبة الطبية الرقمية.</p>
                <button
                  onClick={() => setActiveTab('library')}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold inline-flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>استعراض المحاضرات والملفات</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {courses.map((course) => (
                  <div
                    key={course.id}
                    onClick={() => setActiveTab('library')}
                    className="cursor-pointer p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2 hover:border-teal-500/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-teal-300 font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {course.code}
                      </span>
                      <span className="text-slate-500 text-[11px] font-mono">{course.creditHours} ساعات</span>
                    </div>

                    <div>
                      <div className="font-bold text-white text-sm">{course.titleArabic}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5" dir="ltr">{course.titleEnglish}</div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-teal-950 border border-teal-800 text-teal-300 text-[10px]">
                          نظري
                        </span>
                        <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 text-[10px]">
                          عملي / مختبر
                        </span>
                      </div>

                      <span className="text-teal-400 font-semibold flex items-center gap-1 text-[10px]">
                        <span>فتح المحاضرات</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Access to Exams & Competitions */}
          <div className="p-5 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-teal-950/40 border border-indigo-500/30 rounded-2xl text-xs flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="font-bold text-white text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>الاختبارات الدورية والمسابقات الطبية التفاعلية</span>
              </span>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                شارك في اختبارات البلوكات والمسابقات السريرية مع الحفظ السحابي التلقائي للإجابات والتصحيح الفوري.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('assessments')}
              className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition-colors shadow-lg"
            >
              الدخول لمركز الاختبارات
            </button>
          </div>

        </div>
      )}

      {/* TAB: STUDENT PROFILE & ACADEMIC CHANGE REQUEST */}
      {activeTab === 'profile' && (
        <StudentProfile
          uid={uid}
          userEmail={userEmail}
          displayNameArabic={displayNameArabic}
          initialEnrollment={enrollment}
          onNavigateTab={(tab) => setActiveTab(tab)}
        />
      )}

    </div>
  );
}
