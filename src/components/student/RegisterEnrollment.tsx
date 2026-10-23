/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Cascading Student Enrollment Registration
 * Mobile-First Android 360px+ compliant with strict cascading reset logic
 */

import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, 
  Building2, 
  BookOpen, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ChevronRight, 
  ArrowRight,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { 
  Country, 
  University, 
  College, 
  AcademicProgram, 
  StudyLevel, 
  StudentEnrollment 
} from '../../types/umed.ts';
import { 
  fetchCountries, 
  fetchUniversities, 
  fetchColleges, 
  fetchPrograms, 
  fetchStudyLevels 
} from '../../services/academicService.ts';
import { submitEnrollmentRequest } from '../../services/enrollmentService.ts';

interface RegisterEnrollmentProps {
  uid: string;
  studentNameArabic: string;
  onEnrollmentComplete: (enrollment: StudentEnrollment) => void;
}

export default function RegisterEnrollment({ 
  uid, 
  studentNameArabic, 
  onEnrollmentComplete 
}: RegisterEnrollmentProps) {
  // Cascading Selection State
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<string>('YE');

  const [universities, setUniversities] = useState<University[]>([]);
  const [selectedUniversityId, setSelectedUniversityId] = useState<string>('');

  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('');

  const [programs, setPrograms] = useState<AcademicProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');

  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<string>('');

  const [academicNumber, setAcademicNumber] = useState<string>('');
  const [academicYear, setAcademicYear] = useState<string>('2025/2026');

  // UI State
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Initial Load: Countries and Universities
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const cList = await fetchCountries();
        setCountries(cList);
        const uList = await fetchUniversities('YE');
        setUniversities(uList);
        if (uList.length > 0) {
          setSelectedUniversityId(uList[0].id);
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'فشل تحميل بيانات الجامعات');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // 2. Cascading Rule: University changes -> Reset College, Program, Level
  useEffect(() => {
    if (!selectedUniversityId) {
      setColleges([]);
      setSelectedCollegeId('');
      setPrograms([]);
      setSelectedProgramId('');
      setStudyLevels([]);
      setSelectedLevelId('');
      return;
    }

    // Reset dependent child selections
    setSelectedCollegeId('');
    setPrograms([]);
    setSelectedProgramId('');
    setStudyLevels([]);
    setSelectedLevelId('');

    fetchColleges(selectedUniversityId).then((cols) => {
      setColleges(cols);
      if (cols.length > 0) {
        setSelectedCollegeId(cols[0].id);
      }
    });
  }, [selectedUniversityId]);

  // 3. Cascading Rule: College changes -> Reset Program, Level
  useEffect(() => {
    if (!selectedCollegeId) {
      setPrograms([]);
      setSelectedProgramId('');
      setStudyLevels([]);
      setSelectedLevelId('');
      return;
    }

    // Reset dependent child selections
    setSelectedProgramId('');
    setStudyLevels([]);
    setSelectedLevelId('');

    fetchPrograms(selectedCollegeId).then((progs) => {
      setPrograms(progs);
      if (progs.length > 0) {
        setSelectedProgramId(progs[0].id);
      }
    });
  }, [selectedCollegeId]);

  // 4. Cascading Rule: Program changes -> Reset Level
  useEffect(() => {
    if (!selectedProgramId) {
      setStudyLevels([]);
      setSelectedLevelId('');
      return;
    }

    // Reset level selection
    setSelectedLevelId('');

    fetchStudyLevels(selectedProgramId).then((lvls) => {
      setStudyLevels(lvls);
      if (lvls.length > 0) {
        setSelectedLevelId(lvls[0].id);
      }
    });
  }, [selectedProgramId]);

  const selectedUniversity = universities.find(u => u.id === selectedUniversityId);
  const selectedLevel = studyLevels.find(l => l.id === selectedLevelId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedUniversityId || !selectedCollegeId || !selectedProgramId || !selectedLevelId) {
      setErrorMessage('يرجى اختيار كافة الحقول الأكاديمية المطلوبة');
      return;
    }

    if (!academicNumber.trim()) {
      setErrorMessage('يرجى إدخال الرقم الأكاديمي أو الجامعي للطالب');
      return;
    }

    setSubmitting(true);
    try {
      const policy = selectedUniversity?.enrollmentPolicy || 'approval_required';
      const enrollment = await submitEnrollmentRequest({
        uid,
        studentNameArabic,
        universityId: selectedUniversityId,
        collegeId: selectedCollegeId,
        programId: selectedProgramId,
        curriculumVersionId: 'cur-dar-2024',
        currentStudyLevelId: selectedLevelId,
        academicStudentNumber: academicNumber,
        academicYear,
        policy
      });

      onEnrollmentComplete(enrollment);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل إرسال طلب القيد الأكاديمي');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-7 shadow-2xl">
      <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-800">
        <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white">
            تسجيل وتوثيق القيد الأكاديمي للطالب
          </h2>
          <p className="text-xs text-slate-400">
            حدد بيانات جامعتك وكلية الطب البشري ومستواك الدراسي لبدء الوصول للمقررات
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        
        {/* Student Name Preview */}
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400">اسم الطالب المسجل:</span>
          <strong className="text-teal-300">{studentNameArabic}</strong>
        </div>

        {/* 1. Country Selection */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">الدولة:</label>
          <select
            value={selectedCountryId}
            onChange={(e) => setSelectedCountryId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
          >
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameArabic} ({c.nameEnglish})
              </option>
            ))}
          </select>
        </div>

        {/* 2. University Selection (Cascading Step 1) */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">الجامعة اليمنية:</label>
          <select
            value={selectedUniversityId}
            onChange={(e) => setSelectedUniversityId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-medium"
          >
            <option value="">-- اختر الجامعة --</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nameArabic} — ({u.type === 'private' ? 'خاصة' : 'حكومية'})
              </option>
            ))}
          </select>
        </div>

        {/* 3. College Selection (Cascading Step 2) */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">الكلية:</label>
          <select
            value={selectedCollegeId}
            disabled={!selectedUniversityId || colleges.length === 0}
            onChange={(e) => setSelectedCollegeId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 disabled:opacity-50"
          >
            <option value="">-- اختر الكلية --</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameArabic} ({c.code})
              </option>
            ))}
          </select>
        </div>

        {/* 4. Academic Program Selection (Cascading Step 3) */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">البرنامج والتخصص الطبي:</label>
          <select
            value={selectedProgramId}
            disabled={!selectedCollegeId || programs.length === 0}
            onChange={(e) => setSelectedProgramId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 disabled:opacity-50"
          >
            <option value="">-- اختر البرنامج الأكاديمي --</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameArabic} — نظام البلوكات (MBBS)
              </option>
            ))}
          </select>
        </div>

        {/* 5. Study Level Selection (Regular Levels 1..7 vs Internship) */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">المستوى الدراسي المقيد به حالياً:</label>
          <select
            value={selectedLevelId}
            disabled={!selectedProgramId || studyLevels.length === 0}
            onChange={(e) => setSelectedLevelId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 disabled:opacity-50 font-medium"
          >
            <option value="">-- اختر المستوى الدراسي --</option>
            {studyLevels.map((lvl) => (
              <option key={lvl.id} value={lvl.id}>
                {lvl.stageType === 'internship' 
                  ? `⭐ ${lvl.titleArabic} (12 شهراً تدريب سريري)`
                  : `${lvl.titleArabic} (${lvl.titleEnglish})`}
              </option>
            ))}
          </select>
        </div>

        {/* 6. Academic Number & Year */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">الرقم الجامعي / الأكاديمي للطالب:</label>
            <input
              type="text"
              required
              value={academicNumber}
              onChange={(e) => setAcademicNumber(e.target.value)}
              placeholder="مثال: MED-2023-0182"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono text-left"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">العام الأكاديمي الحالي:</label>
            <input
              type="text"
              required
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono text-left"
              dir="ltr"
            />
          </div>
        </div>

        {/* Policy Notice Box */}
        {selectedUniversity && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <span className="text-slate-400 font-semibold block mb-1">سياسة القبول المعتمدة في {selectedUniversity.nameArabic}:</span>
            {selectedUniversity.enrollmentPolicy === 'approval_required' ? (
              <div className="flex items-center gap-2 text-amber-300">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>تتطلب اعتماد المشرف:</strong> سيتم تسجيل طلبك بحالة (معلق / Pending) وتفعيل صلاحيات المواد والاختبارات بعد مراجعة إدارة الكلية.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>تسجيل فوري مباشر:</strong> سيتم تفعيل حسابك الأكاديمي فوراً للوصول إلى مقررات المستوى.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Submit Action Button */}
        <button
          type="submit"
          disabled={submitting || !selectedUniversityId}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <UserCheck className="w-4 h-4" />
          <span>{submitting ? 'جارٍ إرسال طلب القيد...' : 'تأكيد التسجيل ورفع طلب القيد الأكاديمي'}</span>
        </button>

      </form>
    </div>
  );
}
