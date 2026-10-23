/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Mobile-First Student Dashboard
 * Optimized for common Android phone viewports (360px–412px) with Arabic RTL
 * Strictly isolated by student's University & Study Level (Batch)
 */

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Clock, 
  AlertCircle, 
  FileText, 
  ChevronRight, 
  Sparkles,
  RefreshCw,
  Stethoscope,
  Trophy,
  Bell,
  UserCheck,
  ExternalLink,
  Download
} from 'lucide-react';
import { 
  StudentEnrollment, 
  StudyPeriod, 
  CourseOffering,
  CourseInstructor,
  BatchNotification,
  University
} from '../../types/umed.ts';
import { 
  fetchStudentEnrollment
} from '../../services/enrollmentService.ts';
import { 
  fetchStudyPeriods, 
  fetchCourseOfferings,
  fetchUniversities
} from '../../services/academicService.ts';
import {
  fetchCourseInstructors,
  fetchBatchNotifications,
  subscribeToBatchNotifications
} from '../../services/batchGovernanceService.ts';
import { resolveResourceFileUrl } from '../../services/resourceService.ts';
import RegisterEnrollment from './RegisterEnrollment.tsx';
import StudentMedicalLibrary from '../library/StudentMedicalLibrary.tsx';
import StudentAssessmentList from '../assessment/StudentAssessmentList.tsx';

interface StudentDashboardProps {
  uid: string;
  userEmail: string;
  displayNameArabic: string;
  activeSection?: 'study' | 'library' | 'assessments';
  onSelectSection?: (section: 'study' | 'library' | 'assessments' | 'profile') => void;
  onEnrollmentStatusChange?: (enr: StudentEnrollment | null) => void;
}

export default function StudentDashboard({
  uid,
  displayNameArabic,
  activeSection = 'study',
  onSelectSection,
  onEnrollmentStatusChange
}: StudentDashboardProps) {
  const [enrollment, setEnrollment] = useState<StudentEnrollment | null>(() => {
    try {
      const cached = localStorage.getItem(`umed_enrollment_${uid}`);
      if (cached) return JSON.parse(cached) as StudentEnrollment;
    } catch (e) {}
    return null;
  });
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [internalTab, setInternalTab] = useState<'study' | 'library' | 'assessments'>(activeSection);

  // Academic Content & Batch Governance State (Strictly scoped to Student's University & Batch)
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<StudyPeriod | null>(null);
  const [courses, setCourses] = useState<CourseOffering[]>([]);
  const [instructors, setInstructors] = useState<CourseInstructor[]>([]);
  const [batchNotifications, setBatchNotifications] = useState<BatchNotification[]>([]);
  const [downloadingNotifId, setDownloadingNotifId] = useState<string | null>(null);

  useEffect(() => {
    setInternalTab(activeSection);
  }, [activeSection]);

  const switchSection = (sec: 'study' | 'library' | 'assessments' | 'profile') => {
    if (onSelectSection) {
      onSelectSection(sec);
    } else if (sec !== 'profile') {
      setInternalTab(sec);
    }
  };

  const loadStudentData = async () => {
    setLoading(true);
    try {
      const [enr, univList] = await Promise.all([
        fetchStudentEnrollment(uid),
        fetchUniversities('YE')
      ]);
      setUniversities(univList);
      setEnrollment(enr);
      if (onEnrollmentStatusChange) {
        onEnrollmentStatusChange(enr);
      }

      if (enr && enr.status === 'approved') {
        const [periods, instList, notifList] = await Promise.all([
          fetchStudyPeriods(enr.currentStudyLevelId, enr.universityId),
          fetchCourseInstructors({ universityId: enr.universityId, studyLevelId: enr.currentStudyLevelId }),
          fetchBatchNotifications({ universityId: enr.universityId, studyLevelId: enr.currentStudyLevelId })
        ]);
        setStudyPeriods(periods);
        setInstructors(instList);
        setBatchNotifications(notifList);
        if (periods.length > 0) {
          setSelectedPeriod(periods[0]);
        } else {
          setSelectedPeriod(null);
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

  // Subscribe in real-time to Batch Notifications for this student's exact University & Study Level
  useEffect(() => {
    if (!enrollment || enrollment.status !== 'approved') return;
    const unsub = subscribeToBatchNotifications(
      enrollment.universityId,
      enrollment.currentStudyLevelId,
      (notifs) => setBatchNotifications(notifs)
    );
    return () => unsub();
  }, [enrollment?.universityId, enrollment?.currentStudyLevelId, enrollment?.status]);

  useEffect(() => {
    if (selectedPeriod && enrollment) {
      fetchCourseOfferings(selectedPeriod.id, enrollment.universityId).then((crs) => {
        setCourses(crs);
      });
    } else {
      setCourses([]);
    }
  }, [selectedPeriod, enrollment?.universityId]);

  const getUniversityName = (univId: string): string => {
    const found = universities.find(u => u.id === univId);
    if (found) return found.nameArabic;
    return univId === 'univ-dar-al-salam' ? 'جامعة دار السلام الدولية للعلوم والتكنولوجيا' : univId;
  };

  const handleOpenNotificationAttachment = async (notif: BatchNotification) => {
    if (!notif.attachmentUrl) return;
    setDownloadingNotifId(notif.id);
    try {
      const resolved = await resolveResourceFileUrl({
        id: notif.id,
        title: notif.title,
        resourceType: notif.attachmentType || 'link',
        url: notif.attachmentUrl,
        universityId: notif.universityId,
        programId: 'prog-mbbs',
        curriculumVersionId: 'cur-dar-2024',
        studyLevelId: notif.studyLevelId,
        sectionType: 'general',
        status: 'published',
        createdBy: notif.authorUid,
        createdAt: notif.createdAt,
        updatedAt: notif.createdAt
      });
      if (resolved.isCloudFile) {
        const a = document.createElement('a');
        a.href = resolved.downloadUrl;
        a.download = notif.attachmentLabel || `${notif.title}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const a = document.createElement('a');
        a.href = resolved.viewUrl || notif.attachmentUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) {
      console.warn('Failed to open notification attachment:', e);
    } finally {
      setDownloadingNotifId(null);
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
            <span>مرحباً بك د. {displayNameArabic}! يرجى إتمام تسجيل بيانات القيد الأكاديمي لمرة واحدة لتخصيص مقرراتك الدراسية حسب جامعتك ودفعتك.</span>
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
            تم استلام طلب قيدك الأكاديمي برقم <code className="text-teal-300 font-mono" dir="ltr">{enrollment.academicStudentNumber}</code> في {getUniversityName(enrollment.universityId)}، وسيتم تفعيل وصولك للمقررات والاختبارات الخاصة بدفعتك فور مراجعة واعتماد الطلب من قبل إدارة الجامعة.
          </p>
        </div>

        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-right space-y-2">
          <div className="flex justify-between border-b border-slate-800 pb-1.5">
            <span className="text-slate-400">الجامعة المستقلة:</span>
            <span className="text-slate-200 font-semibold">{getUniversityName(enrollment.universityId)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-800 pb-1.5">
            <span className="text-slate-400">الدفعة / المستوى المطلوب:</span>
            <span className="text-teal-300 font-semibold">
              {enrollment.currentStudyLevelId === 'lvl-internship' ? 'سنة الامتياز (سريري)' : `المستوى ${enrollment.currentStudyLevelId.replace('lvl-', '')}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">تاريخ الإرسال:</span>
            <span className="text-slate-400 font-mono">{new Date(enrollment.enrolledAt || enrollment.requestedAt || Date.now()).toLocaleDateString('ar-YE')}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={loadStudentData}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث حالة القيد الآن</span>
          </button>
          <button
            onClick={() => setEnrollment(null)}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-700"
          >
            <span>تعديل بيانات طلب القيد</span>
          </button>
        </div>
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
  const currentUniversityName = getUniversityName(enrollment.universityId);

  return (
    <div className="space-y-5">
      
      {/* 1. Academic Summary Banner (Strictly scoped to Student's University & Batch) */}
      <div className="bg-gradient-to-r from-teal-950/80 via-slate-900 to-indigo-950/80 border border-teal-500/30 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/20 font-black text-xl flex-shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-sm sm:text-base text-white">
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
                  {isInternship ? 'سنة الامتياز السريرية' : `دفعة المستوى ${enrollment.currentStudyLevelId.replace('lvl-', '')}`}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {currentUniversityName} • كلية الطب البشري • نظام البلوكات (MBBS)
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
      </div>

      {/* SECTION: MEDICAL LIBRARY */}
      {internalTab === 'library' && (
        <StudentMedicalLibrary
          universityId={enrollment.universityId}
          programId={enrollment.programId}
          studyLevelId={enrollment.currentStudyLevelId}
          studentNameArabic={displayNameArabic}
        />
      )}

      {/* SECTION: ASSESSMENTS & COMPETITIONS */}
      {internalTab === 'assessments' && (
        <StudentAssessmentList
          universityId={enrollment.universityId}
          studyLevelId={enrollment.currentStudyLevelId}
          uid={uid}
          studentNameArabic={displayNameArabic}
        />
      )}

      {/* SECTION: STUDY DASHBOARD (Batch Notifications, Blocks, Courses & Doctors) */}
      {internalTab === 'study' && (
        <div className="space-y-5">

          {/* BATCH NOTIFICATIONS & SHARED DATA FROM BATCH REP / ADMIN */}
          {batchNotifications.length > 0 && (
            <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs sm:text-sm font-bold text-white">
                    إشعارات الدفعة والبيانات المشتركة ({batchNotifications.length})
                  </h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                  مخصص لدفعتك فقط
                </span>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {batchNotifications.slice(0, 6).map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                      notif.category === 'urgent'
                        ? 'bg-rose-950/30 border-rose-800/70'
                        : notif.category === 'exam'
                        ? 'bg-amber-950/25 border-amber-800/60'
                        : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            notif.category === 'urgent'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : notif.category === 'exam'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                          }`}
                        >
                          {notif.category === 'urgent'
                            ? 'عاجل'
                            : notif.category === 'exam'
                            ? 'اختبار / مسابقة'
                            : notif.category === 'data_shared'
                            ? 'داتا مشتركة'
                            : 'إشعار الدفعة'}
                        </span>
                        <h4 className="font-bold text-white text-xs sm:text-sm">{notif.title}</h4>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(notif.createdAt).toLocaleString('ar-YE')}
                      </span>
                    </div>

                    <p className="text-slate-300 leading-relaxed whitespace-pre-line">{notif.message}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80 text-[11px]">
                      <span className="text-slate-400">
                        المرسل: <strong className="text-teal-300">{notif.authorNameArabic}</strong>
                      </span>

                      {notif.attachmentUrl && (
                        <button
                          type="button"
                          disabled={downloadingNotifId === notif.id}
                          onClick={() => handleOpenNotificationAttachment(notif)}
                          className="px-3 py-1 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/40 font-bold flex items-center gap-1.5 transition-colors"
                        >
                          {notif.attachmentType === 'link' ? (
                            <ExternalLink className="w-3.5 h-3.5" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {downloadingNotifId === notif.id
                              ? 'جارٍ الفتح...'
                              : notif.attachmentLabel
                              ? `فتح المرفق: ${notif.attachmentLabel}`
                              : 'فتح المرفق / الرابط المرسل'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {studyPeriods.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  البلوكات الدراسية المتاحة لدفعتك:
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

          {/* Courses & Assigned Theoretical / Practical Doctors Grid */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-400" />
                  <span>المقررات ودكاترة المواد (النظري والعملي)</span>
                  {selectedPeriod && <span className="text-xs text-teal-300 font-mono">({selectedPeriod.titleArabic})</span>}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  استعراض المحاضرات النظرية والتدريب العملي ودكاترة كل مادة في دفعتك
                </p>
              </div>
              <button
                onClick={() => switchSection('library')}
                className="px-3 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 text-xs font-bold transition-colors"
              >
                فتح المكتبة الرقمية
              </button>
            </div>

            {courses.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs">
                <p>لم تتم إضافة مقررات مخصصة لهذا البلوك بعد. يمكنك الوصول إلى محاضرات وشرائح وفيديوهات البلوك عبر زر «فتح المكتبة الرقمية» أعلاه.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {courses.map((course) => {
                  const courseDoctors = instructors.filter(i => i.courseOfferingId === course.id);
                  return (
                    <div
                      key={course.id}
                      onClick={() => switchSection('library')}
                      className="cursor-pointer p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-2.5 hover:border-teal-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-teal-300 font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                          {course.code}
                        </span>
                        <span className="text-slate-500 text-[11px] font-mono">{course.creditHours ?? 3} ساعات</span>
                      </div>

                      <div>
                        <div className="font-bold text-white text-sm">{course.titleArabic}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5" dir="ltr">{course.titleEnglish}</div>
                      </div>

                      {/* Assigned Theoretical & Practical Doctors for this Course */}
                      {courseDoctors.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90 space-y-1.5">
                          <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                            <UserCheck className="w-3 h-3 text-teal-400" />
                            <span>دكاترة المادة المعتمدون:</span>
                          </div>
                          {courseDoctors.map(docItem => (
                            <div key={docItem.id} className="flex items-center justify-between text-[11px]">
                              <span className="text-white font-semibold">
                                {docItem.academicTitle || 'د.'} {docItem.instructorNameArabic}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                docItem.teachingType === 'theoretical'
                                  ? 'bg-teal-950 text-teal-300 border border-teal-800'
                                  : docItem.teachingType === 'practical'
                                  ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}>
                                {docItem.teachingType === 'theoretical'
                                  ? 'مادة نظرية'
                                  : docItem.teachingType === 'practical'
                                  ? 'مادة عملية / سريرية'
                                  : 'نظري + عملي'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

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
                          <span>فتح المحاضرات والداتا</span>
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
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
                شارك في اختبارات البلوكات والمسابقات السريرية المخصصة لدفعتك في {currentUniversityName} مع التصحيح الفوري.
              </p>
            </div>
            <button
              onClick={() => switchSection('assessments')}
              className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition-colors shadow-lg"
            >
              الدخول لمركز الاختبارات
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
