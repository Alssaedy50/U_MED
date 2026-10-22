/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Academic Structure Management Console
 * Hierarchical CRUD for Universities, Colleges, Programs, Curricula, Levels, Blocks, and Courses
 */

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  GraduationCap, 
  BookOpen, 
  Layers, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw, 
  ChevronRight, 
  Clock, 
  Check, 
  X,
  Stethoscope,
  Eye,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { 
  University, 
  College, 
  AcademicProgram, 
  CurriculumVersion, 
  StudyLevel, 
  StudyPeriod, 
  CourseOffering,
  StageType
} from '../../types/umed.ts';
import { 
  fetchUniversities, 
  saveUniversity, 
  toggleUniversityActive,
  fetchColleges, 
  saveCollege, 
  toggleCollegeActive,
  fetchPrograms, 
  saveProgram, 
  toggleProgramActive,
  fetchCurriculumVersions, 
  fetchStudyLevels, 
  saveStudyLevel, 
  toggleStudyLevelActive,
  fetchStudyPeriods, 
  saveStudyPeriod, 
  toggleStudyPeriodActive,
  fetchCourseOfferings, 
  saveCourseOffering,
  toggleCourseOfferingActive,
  checkEntityDependencies,
  seedDarAlSalamToFirestore
} from '../../services/academicService.ts';

export default function AcademicStructureManager() {
  // Navigation Selection State
  const [universities, setUniversities] = useState<University[]>([]);
  const [selectedUniversity, setSelectedUniversity] = useState<University | null>(null);

  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);

  const [programs, setPrograms] = useState<AcademicProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<AcademicProgram | null>(null);

  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<StudyLevel | null>(null);

  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<StudyPeriod | null>(null);

  const [courses, setCourses] = useState<CourseOffering[]>([]);

  // UI State
  const [loading, setLoading] = useState<boolean>(true);
  const [seedLoading, setSeedLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Modals / Form toggles
  const [showAddUnivModal, setShowAddUnivModal] = useState<boolean>(false);
  const [showAddCollegeModal, setShowAddCollegeModal] = useState<boolean>(false);
  const [showAddProgramModal, setShowAddProgramModal] = useState<boolean>(false);
  const [showAddPeriodModal, setShowAddPeriodModal] = useState<boolean>(false);
  const [showAddCourseModal, setShowAddCourseModal] = useState<boolean>(false);

  // Edit Modals State
  const [editingUniv, setEditingUniv] = useState<University | null>(null);
  const [editingCollege, setEditingCollege] = useState<College | null>(null);
  const [editingProgram, setEditingProgram] = useState<AcademicProgram | null>(null);
  const [editingLevel, setEditingLevel] = useState<StudyLevel | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<StudyPeriod | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseOffering | null>(null);

  // Form State
  const [univForm, setUnivForm] = useState({
    nameArabic: '',
    nameEnglish: '',
    type: 'private' as 'public' | 'private',
    cityArabic: 'صنعاء',
    enrollmentPolicy: 'approval_required' as 'immediate' | 'approval_required'
  });

  const [collegeForm, setCollegeForm] = useState({
    nameArabic: '',
    nameEnglish: '',
    code: ''
  });

  const [programForm, setProgramForm] = useState({
    nameArabic: '',
    nameEnglish: '',
    degree: 'bachelor' as 'bachelor' | 'diploma' | 'postgraduate',
    studySystem: 'block' as 'block' | 'semester' | 'traditional',
    totalRegularLevels: 7,
    hasInternship: true,
    internshipDurationMonths: 12
  });

  const [periodForm, setPeriodForm] = useState({
    titleArabic: '',
    titleEnglish: '',
    code: '',
    order: 1
  });

  const [courseForm, setCourseForm] = useState({
    titleArabic: '',
    titleEnglish: '',
    code: '',
    creditHours: 3
  });

  // Load universities on mount
  const loadUniversities = async () => {
    setLoading(true);
    try {
      const univs = await fetchUniversities();
      setUniversities(univs);
      if (univs.length > 0) {
        setSelectedUniversity(univs[0]);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل تحميل الجامعات' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUniversities();
  }, []);

  // Cascading Load: Colleges when University changes
  useEffect(() => {
    if (selectedUniversity) {
      fetchColleges(selectedUniversity.id).then((cols) => {
        setColleges(cols);
        setSelectedCollege(cols.length > 0 ? cols[0] : null);
      });
    } else {
      setColleges([]);
      setSelectedCollege(null);
    }
  }, [selectedUniversity]);

  // Cascading Load: Programs when College changes
  useEffect(() => {
    if (selectedCollege) {
      fetchPrograms(selectedCollege.id).then((progs) => {
        setPrograms(progs);
        setSelectedProgram(progs.length > 0 ? progs[0] : null);
      });
    } else {
      setPrograms([]);
      setSelectedProgram(null);
    }
  }, [selectedCollege]);

  // Cascading Load: Study Levels when Program changes
  useEffect(() => {
    if (selectedProgram) {
      fetchStudyLevels(selectedProgram.id).then((lvls) => {
        setStudyLevels(lvls);
        setSelectedLevel(lvls.length > 0 ? lvls[0] : null);
      });
    } else {
      setStudyLevels([]);
      setSelectedLevel(null);
    }
  }, [selectedProgram]);

  // Cascading Load: Study Periods / Blocks when Level changes
  useEffect(() => {
    if (selectedLevel) {
      fetchStudyPeriods(selectedLevel.id).then((periods) => {
        setStudyPeriods(periods);
        setSelectedPeriod(periods.length > 0 ? periods[0] : null);
      });
    } else {
      setStudyPeriods([]);
      setSelectedPeriod(null);
    }
  }, [selectedLevel]);

  // Cascading Load: Courses when Period changes
  useEffect(() => {
    if (selectedPeriod) {
      fetchCourseOfferings(selectedPeriod.id).then((crs) => {
        setCourses(crs);
      });
    } else {
      setCourses([]);
    }
  }, [selectedPeriod]);

  // Seed Handler: Seed Dar Al Salam University
  const handleSeedDarAlSalam = async () => {
    setSeedLoading(true);
    setStatusMessage(null);
    try {
      const result = await seedDarAlSalamToFirestore('PLATFORM_OWNER');
      setStatusMessage({ type: 'success', text: result.message });
      await loadUniversities();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل تثبيت بيانات الجامعة' });
    } finally {
      setSeedLoading(false);
    }
  };

  // Safe Deletion Checker
  const handleAttemptDelete = async (type: 'university' | 'college' | 'level', id: string, name: string) => {
    const check = await checkEntityDependencies(type, id);
    if (!check.canDelete) {
      setStatusMessage({
        type: 'warning',
        text: `حماية العلاقات الأكاديمية: ${check.reason}`
      });
    } else {
      setStatusMessage({
        type: 'warning',
        text: `تم تفعيل الحماية الأكاديمية الصارمة: يرجى استخدام "التعطيل الآمن" (isActive: false) للحفاظ على سلامة القيود التاريخية.`
      });
    }
  };

  // Update Handlers for Existing Academic Entities
  const handleUpdateUniversity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUniv) return;
    try {
      const updated: University = {
        ...editingUniv,
        updatedAt: new Date().toISOString()
      };
      await saveUniversity(updated);
      setUniversities(universities.map(u => u.id === updated.id ? updated : u));
      if (selectedUniversity?.id === updated.id) setSelectedUniversity(updated);
      setEditingUniv(null);
      setStatusMessage({ type: 'success', text: `تم تحديث بيانات جامعة ${updated.nameArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCollege) return;
    try {
      await saveCollege(editingCollege);
      setColleges(colleges.map(c => c.id === editingCollege.id ? editingCollege : c));
      if (selectedCollege?.id === editingCollege.id) setSelectedCollege(editingCollege);
      setEditingCollege(null);
      setStatusMessage({ type: 'success', text: `تم تحديث بيانات كلية ${editingCollege.nameArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProgram) return;
    try {
      await saveProgram(editingProgram);
      setPrograms(programs.map(p => p.id === editingProgram.id ? editingProgram : p));
      if (selectedProgram?.id === editingProgram.id) setSelectedProgram(editingProgram);
      setEditingProgram(null);
      setStatusMessage({ type: 'success', text: `تم تحديث بيانات برنامج ${editingProgram.nameArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdateLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLevel) return;
    try {
      await saveStudyLevel(editingLevel);
      setStudyLevels(studyLevels.map(l => l.id === editingLevel.id ? editingLevel : l));
      if (selectedLevel?.id === editingLevel.id) setSelectedLevel(editingLevel);
      setEditingLevel(null);
      setStatusMessage({ type: 'success', text: `تم تحديث بيانات ${editingLevel.titleArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPeriod) return;
    try {
      await saveStudyPeriod(editingPeriod);
      setStudyPeriods(studyPeriods.map(p => p.id === editingPeriod.id ? editingPeriod : p));
      if (selectedPeriod?.id === editingPeriod.id) setSelectedPeriod(editingPeriod);
      setEditingPeriod(null);
      setStatusMessage({ type: 'success', text: `تم تحديث بيانات ${editingPeriod.titleArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleUpdateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    try {
      await saveCourseOffering(editingCourse);
      setCourses(courses.map(c => c.id === editingCourse.id ? editingCourse : c));
      setEditingCourse(null);
      setStatusMessage({ type: 'success', text: `تم تحديث بيانات مقرر ${editingCourse.titleArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Form Submissions
  const handleCreateUniversity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = `univ-${Date.now().toString(36)}`;
      const newUniv: University = {
        id,
        countryId: 'YE',
        nameArabic: univForm.nameArabic,
        nameEnglish: univForm.nameEnglish,
        type: univForm.type,
        cityArabic: univForm.cityArabic,
        enrollmentPolicy: univForm.enrollmentPolicy,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await saveUniversity(newUniv);
      setUniversities([...universities, newUniv]);
      setSelectedUniversity(newUniv);
      setShowAddUnivModal(false);
      setStatusMessage({ type: 'success', text: `تمت إضافة جامعة ${newUniv.nameArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUniversity) return;
    try {
      const id = `col-${Date.now().toString(36)}`;
      const newCol: College = {
        id,
        universityId: selectedUniversity.id,
        nameArabic: collegeForm.nameArabic,
        nameEnglish: collegeForm.nameEnglish,
        code: collegeForm.code,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await saveCollege(newCol);
      setColleges([...colleges, newCol]);
      setSelectedCollege(newCol);
      setShowAddCollegeModal(false);
      setStatusMessage({ type: 'success', text: `تمت إضافة كلية ${newCol.nameArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollege || !selectedUniversity) return;
    try {
      const id = `prog-${Date.now().toString(36)}`;
      const newProg: AcademicProgram = {
        id,
        collegeId: selectedCollege.id,
        universityId: selectedUniversity.id,
        nameArabic: programForm.nameArabic,
        nameEnglish: programForm.nameEnglish,
        degree: programForm.degree,
        studySystem: programForm.studySystem,
        totalRegularLevels: programForm.totalRegularLevels,
        hasInternship: programForm.hasInternship,
        internshipDurationMonths: programForm.internshipDurationMonths,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await saveProgram(newProg);
      setPrograms([...programs, newProg]);
      setSelectedProgram(newProg);
      setShowAddProgramModal(false);
      setStatusMessage({ type: 'success', text: `تمت إضافة برنامج ${newProg.nameArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLevel || !selectedUniversity) return;
    try {
      const id = `blk-${Date.now().toString(36)}`;
      const newPeriod: StudyPeriod = {
        id,
        studyLevelId: selectedLevel.id,
        curriculumVersionId: 'cur-dar-2024',
        universityId: selectedUniversity.id,
        periodType: 'block',
        titleArabic: periodForm.titleArabic,
        titleEnglish: periodForm.titleEnglish,
        code: periodForm.code,
        order: periodForm.order,
        isActive: true
      };
      await saveStudyPeriod(newPeriod);
      setStudyPeriods([...studyPeriods, newPeriod]);
      setSelectedPeriod(newPeriod);
      setShowAddPeriodModal(false);
      setStatusMessage({ type: 'success', text: `تمت إضافة ${newPeriod.titleArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod || !selectedLevel || !selectedUniversity) return;
    try {
      const id = `crs-${Date.now().toString(36)}`;
      const newCourse: CourseOffering = {
        id,
        studyPeriodId: selectedPeriod.id,
        studyLevelId: selectedLevel.id,
        curriculumVersionId: 'cur-dar-2024',
        universityId: selectedUniversity.id,
        titleArabic: courseForm.titleArabic,
        titleEnglish: courseForm.titleEnglish,
        code: courseForm.code,
        creditHours: courseForm.creditHours,
        isActive: true
      };
      await saveCourseOffering(newCourse);
      setCourses([...courses, newCourse]);
      setShowAddCourseModal(false);
      setStatusMessage({ type: 'success', text: `تمت إضافة مقرر ${newCourse.titleArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner & One-Click Seed Loader Button */}
      <div className="bg-gradient-to-r from-teal-950/60 via-slate-900 to-indigo-950/60 border border-teal-500/30 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-semibold">
              إدارة الهيكل الأكاديمي الشامل
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              Idempotent Persistence
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            المؤسسات والبرامج الطبية ونظام البلوكات
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            بناء وإدارة الجامعات والكليات والمستويات السبعة وسنة الامتياز والبلوكات والمقررات مع حماية الكيانات من الحذف العشوائي وتفعيل التعطيل الآمن.
          </p>
        </div>

        {/* Idempotent Seed Loader Button */}
        <div>
          <button
            onClick={handleSeedDarAlSalam}
            disabled={seedLoading}
            className="py-3 px-5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-teal-500/25 flex items-center gap-2"
          >
            {seedLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-300" />
            )}
            <span>
              {seedLoading ? 'جارٍ تثبيت بذور جامعة دار السلام...' : 'تثبيت بذور جامعة دار السلام في Firestore'}
            </span>
          </button>
          <span className="block text-[10px] text-slate-400 text-center mt-1 font-mono">
            * عملية آمنة وغير مكررة (Idempotent Seed)
          </span>
        </div>
      </div>

      {/* Status Feedback Notification */}
      {statusMessage && (
        <div className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
          statusMessage.type === 'success' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' :
          statusMessage.type === 'error' ? 'bg-rose-950/40 border-rose-800/60 text-rose-300' :
          'bg-amber-950/40 border-amber-800/60 text-amber-300'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
            {statusMessage.type === 'error' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            {statusMessage.type === 'warning' && <ShieldAlert className="w-4 h-4 flex-shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="p-1 hover:bg-slate-800/60 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Interactive Cascading Academic Hierarchy Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Column 1: Universities */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Building2 className="w-4 h-4 text-teal-400" />
                <span>الجامعات ({universities.length})</span>
              </div>
              <button 
                onClick={() => setShowAddUnivModal(true)}
                className="p-1 rounded bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 text-[11px] font-semibold flex items-center gap-0.5"
                title="إضافة جامعة جديدة"
              >
                <Plus className="w-3 h-3" />
                <span>إضافة</span>
              </button>
            </div>

            <div className="space-y-2">
              {universities.map((u) => {
                const isSelected = selectedUniversity?.id === u.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUniversity(u)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all text-xs ${
                      isSelected
                        ? 'bg-teal-500/20 border-teal-500/60 text-white shadow-md'
                        : 'bg-slate-950/70 border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${u.type === 'private' ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>
                        {u.type === 'private' ? 'خاصة' : 'حكومية'}
                      </span>
                      <span className={`text-[10px] ${u.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {u.isActive ? '● نشط' : '○ معطل'}
                      </span>
                    </div>
                    <div className="font-bold">{u.nameArabic}</div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5" dir="ltr">{u.nameEnglish}</div>
                    
                    <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleUniversityActive(u.id, u.isActive).then(() => {
                            setUniversities(universities.map(item => item.id === u.id ? { ...item, isActive: !item.isActive } : item));
                          });
                        }}
                        className="text-slate-400 hover:text-white flex items-center gap-1"
                        title="تبديل حالة التنشيط"
                      >
                        {u.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                        <span>{u.isActive ? 'تعطيل' : 'تفعيل'}</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingUniv(u);
                        }}
                        className="text-slate-400 hover:text-teal-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                        title="تعديل بيانات الجامعة"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>تعديل</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAttemptDelete('university', u.id, u.nameArabic);
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="فحص إمكانية الحذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Column 2: Colleges */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <GraduationCap className="w-4 h-4 text-indigo-400" />
                <span>الكليات ({colleges.length})</span>
              </div>
              {selectedUniversity && (
                <button 
                  onClick={() => setShowAddCollegeModal(true)}
                  className="p-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[11px] font-semibold flex items-center gap-0.5"
                  title="إضافة كلية جديدة"
                >
                  <Plus className="w-3 h-3" />
                  <span>إضافة</span>
                </button>
              )}
            </div>

            {colleges.length === 0 ? (
              <div className="text-slate-500 text-xs text-center py-6">
                لا توجد كليات مسجلة لهذه الجامعة
              </div>
            ) : (
              <div className="space-y-2">
                {colleges.map((c) => {
                  const isSelected = selectedCollege?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCollege(c)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all text-xs ${
                        isSelected
                          ? 'bg-indigo-500/20 border-indigo-500/60 text-white shadow-md'
                          : 'bg-slate-950/70 border-slate-800/80 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono">
                          {c.code || 'MED'}
                        </span>
                        <span className={`text-[10px] ${c.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {c.isActive ? '● نشط' : '○ معطل'}
                        </span>
                      </div>
                      <div className="font-bold">{c.nameArabic}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5" dir="ltr">{c.nameEnglish}</div>
                      
                      <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCollege(c);
                          }}
                          className="text-slate-400 hover:text-indigo-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                          title="تعديل بيانات الكلية"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>تعديل</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCollegeActive(c.id, c.isActive).then(() => {
                              setColleges(colleges.map(item => item.id === c.id ? { ...item, isActive: !item.isActive } : item));
                            });
                          }}
                          className="text-slate-400 hover:text-white flex items-center gap-1"
                          title="تبديل حالة التنشيط"
                        >
                          {c.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-400" /> : <ToggleLeft className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Academic Programs */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>البرامج والمناهج ({programs.length})</span>
              </div>
              {selectedCollege && (
                <button 
                  onClick={() => setShowAddProgramModal(true)}
                  className="p-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[11px] font-semibold flex items-center gap-0.5"
                  title="إضافة برنامج أكاديمي"
                >
                  <Plus className="w-3 h-3" />
                  <span>إضافة</span>
                </button>
              )}
            </div>

            {programs.length === 0 ? (
              <div className="text-slate-500 text-xs text-center py-6">
                لا توجد برامج مسجلة لهذه الكلية
              </div>
            ) : (
              <div className="space-y-2">
                {programs.map((p) => {
                  const isSelected = selectedProgram?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProgram(p)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all text-xs ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-white shadow-md'
                          : 'bg-slate-950/70 border-slate-800/80 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300">
                          نظام البلوكات (Block)
                        </span>
                        <span className={`text-[10px] ${p.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {p.isActive ? '● نشط' : '○ معطل'}
                        </span>
                      </div>
                      <div className="font-bold">{p.nameArabic}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5" dir="ltr">{p.nameEnglish}</div>
                      
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-2">
                        <span>7 مستويات دراسية</span>
                        <span>•</span>
                        <span className="text-amber-300 font-semibold">+ سنة امتياز (12 شهر)</span>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProgram(p);
                          }}
                          className="text-slate-400 hover:text-emerald-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                          title="تعديل بيانات البرنامج"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>تعديل</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleProgramActive(p.id, p.isActive).then(() => {
                              setPrograms(programs.map(item => item.id === p.id ? { ...item, isActive: !item.isActive } : item));
                            });
                          }}
                          className="text-slate-400 hover:text-white flex items-center gap-1"
                          title="تبديل حالة التنشيط"
                        >
                          {p.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-400" /> : <ToggleLeft className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Column 4: Study Levels & Internship Stage */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>المستويات وسنة الامتياز ({studyLevels.length})</span>
              </div>
            </div>

            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pl-1">
              {studyLevels.map((lvl) => {
                const isSelected = selectedLevel?.id === lvl.id;
                const isIntern = lvl.stageType === 'internship';
                return (
                  <div
                    key={lvl.id}
                    onClick={() => setSelectedLevel(lvl)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all text-xs flex items-center justify-between ${
                      isSelected
                        ? isIntern 
                          ? 'bg-amber-500/25 border-amber-400 text-white font-bold'
                          : 'bg-teal-500/25 border-teal-400 text-white font-bold'
                        : isIntern
                        ? 'bg-amber-950/20 border-amber-700/40 text-amber-200 hover:border-amber-500'
                        : 'bg-slate-950/70 border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                          isIntern ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {isIntern ? 'سريري' : `م ${lvl.order}`}
                        </span>
                        <span className="truncate">{lvl.titleArabic}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate" dir="ltr">
                        {lvl.titleEnglish}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {isIntern && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                          12M
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingLevel(lvl);
                        }}
                        className="text-slate-400 hover:text-amber-300 p-1 rounded hover:bg-slate-800"
                        title="تعديل المستوى الدراسي"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* 3. Deep Dive Explorer: Blocks & Courses within Selected Level */}
      {selectedLevel && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold">
                  {selectedLevel.titleArabic}
                </span>
                <span className="text-xs text-slate-400" dir="ltr">({selectedLevel.titleEnglish})</span>
                {selectedLevel.stageType === 'internship' && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                    مرحلة سريرية مستقلة (12 شهراً مناوبات في المستشفيات)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                استعراض البلوكات والمقررات التابعة للمستوى في {selectedUniversity?.nameArabic}
              </p>
            </div>

            {selectedLevel.stageType !== 'internship' && (
              <button
                onClick={() => setShowAddPeriodModal(true)}
                className="py-1.5 px-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة بلوك دراسي (Block)</span>
              </button>
            )}
          </div>

          {/* Blocks & Courses Subgrid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Column: Blocks List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>البلوكات الدراسية (System Blocks)</span>
                <span className="text-teal-400 font-mono text-[11px]">{studyPeriods.length} بلوك</span>
              </h4>

              {studyPeriods.length === 0 ? (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs text-center">
                  {selectedLevel.stageType === 'internship' 
                    ? 'سنة الامتياز تعتمد على روتيشن المستشفيات (جراحة، باطنة، أطفال، نساء وتوليد).'
                    : 'لم يتم تسجيل بلوكات لهذا المستوى بعد. اضغط "إضافة بلوك دراسي" لتسجيل بلوك جديد.'}
                </div>
              ) : (
                studyPeriods.map((period) => {
                  const isSelected = selectedPeriod?.id === period.id;
                  return (
                    <div
                      key={period.id}
                      onClick={() => setSelectedPeriod(period)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all text-xs ${
                        isSelected
                          ? 'bg-teal-500/20 border-teal-500 text-white shadow-md'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-teal-300 font-bold">{period.code}</span>
                        <span className="text-[10px] text-slate-400">الترتيب: {period.order}</span>
                      </div>
                      <div className="font-bold text-sm">{period.titleArabic}</div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5" dir="ltr">{period.titleEnglish}</div>

                      <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPeriod(period);
                          }}
                          className="text-slate-400 hover:text-teal-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                          title="تعديل بيانات البلوك"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>تعديل</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStudyPeriodActive(period.id, period.isActive).then(() => {
                              setStudyPeriods(studyPeriods.map(item => item.id === period.id ? { ...item, isActive: !item.isActive } : item));
                            });
                          }}
                          className="text-slate-400 hover:text-white flex items-center gap-1"
                          title="تبديل حالة التنشيط"
                        >
                          {period.isActive ? <ToggleRight className="w-3.5 h-3.5 text-emerald-400" /> : <ToggleLeft className="w-3.5 h-3.5 text-slate-500" />}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right Column: Courses & Sections in Selected Block */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span>المقررات والأقسام (Courses & Sections)</span>
                  {selectedPeriod && <span className="text-teal-300 font-mono">في {selectedPeriod.titleArabic}</span>}
                </h4>

                {selectedPeriod && (
                  <button
                    onClick={() => setShowAddCourseModal(true)}
                    className="py-1 px-2.5 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة مقرر</span>
                  </button>
                )}
              </div>

              {!selectedPeriod ? (
                <div className="p-8 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500 text-xs">
                  اختر بلوكاً دراسياً من القائمة لاستعراض المقررات والأقسام
                </div>
              ) : courses.length === 0 ? (
                <div className="p-8 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500 text-xs">
                  لا توجد مقررات مضافة في هذا البلوك حتى الآن.
                </div>
              ) : (
                <div className="space-y-3">
                  {courses.map((course) => (
                    <div key={course.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-teal-300 font-mono font-bold">
                            {course.code}
                          </span>
                          <span className="font-bold text-white text-sm">{course.titleArabic}</span>
                          <span className="text-slate-400 text-xs" dir="ltr">({course.titleEnglish})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono">{course.creditHours} ساعات معتمدة</span>
                          <button
                            onClick={() => setEditingCourse(course)}
                            className="text-slate-400 hover:text-indigo-300 p-1 rounded hover:bg-slate-900"
                            title="تعديل المقرر"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              toggleCourseOfferingActive(course.id, course.isActive).then(() => {
                                setCourses(courses.map(c => c.id === course.id ? { ...c, isActive: !c.isActive } : c));
                              });
                            }}
                            className="text-slate-400 hover:text-white p-1"
                            title="تبديل التنشيط"
                          >
                            {course.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                          </button>
                        </div>
                      </div>

                      {/* Sections: Theoretical & Practical */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                        <span className="text-slate-400 text-[11px]">الأقسام المعتمدة:</span>
                        <span className="px-2 py-0.5 rounded bg-teal-950/40 border border-teal-800 text-teal-300 text-[10px]">
                          القسم النظري (Lectures)
                        </span>
                        <span className="px-2 py-0.5 rounded bg-indigo-950/40 border border-indigo-800 text-indigo-300 text-[10px]">
                          القسم العملي والمختبر (Practical / Lab)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 4. MODALS */}

      {/* Modal: Add University */}
      {showAddUnivModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">إضافة جامعة يمنية جديدة</h3>
              <button onClick={() => setShowAddUnivModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUniversity} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الجامعة باللغة العربية:</label>
                <input
                  type="text"
                  required
                  value={univForm.nameArabic}
                  onChange={(e) => setUnivForm({ ...univForm, nameArabic: e.target.value })}
                  placeholder="مثال: جامعة صنعاء"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الجامعة باللغة الإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={univForm.nameEnglish}
                  onChange={(e) => setUnivForm({ ...univForm, nameEnglish: e.target.value })}
                  placeholder="Sana'a University"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">نوع الجامعة:</label>
                  <select
                    value={univForm.type}
                    onChange={(e) => setUnivForm({ ...univForm, type: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="private">جامعة خاصة</option>
                    <option value="public">جامعة حكومية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المدينة:</label>
                  <input
                    type="text"
                    value={univForm.cityArabic}
                    onChange={(e) => setUnivForm({ ...univForm, cityArabic: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">سياسة تسجيل الطلاب:</label>
                <select
                  value={univForm.enrollmentPolicy}
                  onChange={(e) => setUnivForm({ ...univForm, enrollmentPolicy: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="approval_required">تتطلب اعتماد المشرف (Approval Required)</option>
                  <option value="immediate">تسجيل فوري مباشر (Immediate)</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddUnivModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500"
                >
                  حفظ الجامعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add College */}
      {showAddCollegeModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">إضافة كلية إلى {selectedUniversity?.nameArabic}</h3>
              <button onClick={() => setShowAddCollegeModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCollege} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الكلية بالعربية:</label>
                <input
                  type="text"
                  required
                  value={collegeForm.nameArabic}
                  onChange={(e) => setCollegeForm({ ...collegeForm, nameArabic: e.target.value })}
                  placeholder="مثال: كلية طب الأسنان"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الكلية بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={collegeForm.nameEnglish}
                  onChange={(e) => setCollegeForm({ ...collegeForm, nameEnglish: e.target.value })}
                  placeholder="Faculty of Dentistry"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">رمز الكلية:</label>
                <input
                  type="text"
                  value={collegeForm.code}
                  onChange={(e) => setCollegeForm({ ...collegeForm, code: e.target.value })}
                  placeholder="DENT"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCollegeModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500"
                >
                  حفظ الكلية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Block */}
      {showAddPeriodModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">إضافة بلوك دراسي (Block)</h3>
              <button onClick={() => setShowAddPeriodModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePeriod} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان البلوك بالعربية:</label>
                <input
                  type="text"
                  required
                  value={periodForm.titleArabic}
                  onChange={(e) => setPeriodForm({ ...periodForm, titleArabic: e.target.value })}
                  placeholder="مثال: بلوك الجهاز الهضمي والتغذية"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان البلوك بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={periodForm.titleEnglish}
                  onChange={(e) => setPeriodForm({ ...periodForm, titleEnglish: e.target.value })}
                  placeholder="Gastrointestinal System Block"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">رمز البلوك:</label>
                  <input
                    type="text"
                    required
                    value={periodForm.code}
                    onChange={(e) => setPeriodForm({ ...periodForm, code: e.target.value })}
                    placeholder="GIT-403"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">ترتيب البلوك:</label>
                  <input
                    type="number"
                    min="1"
                    value={periodForm.order}
                    onChange={(e) => setPeriodForm({ ...periodForm, order: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPeriodModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500"
                >
                  حفظ البلوك
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Course */}
      {showAddCourseModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">إضافة مقرر دراسي داخل البلوك</h3>
              <button onClick={() => setShowAddCourseModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم المقرر بالعربية:</label>
                <input
                  type="text"
                  required
                  value={courseForm.titleArabic}
                  onChange={(e) => setCourseForm({ ...courseForm, titleArabic: e.target.value })}
                  placeholder="مثال: علم وظائف أعضاء الجهاز الهضمي"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم المقرر بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={courseForm.titleEnglish}
                  onChange={(e) => setCourseForm({ ...courseForm, titleEnglish: e.target.value })}
                  placeholder="Physiology of GI System"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">رمز المقرر:</label>
                  <input
                    type="text"
                    required
                    value={courseForm.code}
                    onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                    placeholder="PHYS-403"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الساعات المعتمدة:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={courseForm.creditHours}
                    onChange={(e) => setCourseForm({ ...courseForm, creditHours: parseInt(e.target.value) || 3 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCourseModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500"
                >
                  حفظ المقرر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODALS FOR ALL ACADEMIC ENTITIES */}

      {/* 1. Modal: Edit University */}
      {editingUniv && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">تعديل بيانات الجامعة</h3>
              <button onClick={() => setEditingUniv(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUniversity} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الجامعة بالعربية:</label>
                <input
                  type="text"
                  required
                  value={editingUniv.nameArabic}
                  onChange={(e) => setEditingUniv({ ...editingUniv, nameArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الجامعة بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={editingUniv.nameEnglish}
                  onChange={(e) => setEditingUniv({ ...editingUniv, nameEnglish: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">النوع:</label>
                  <select
                    value={editingUniv.type}
                    onChange={(e) => setEditingUniv({ ...editingUniv, type: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="private">جامعة خاصة</option>
                    <option value="public">جامعة حكومية</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المدينة:</label>
                  <input
                    type="text"
                    value={editingUniv.cityArabic}
                    onChange={(e) => setEditingUniv({ ...editingUniv, cityArabic: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">سياسة تسجيل الطلاب:</label>
                <select
                  value={editingUniv.enrollmentPolicy}
                  onChange={(e) => setEditingUniv({ ...editingUniv, enrollmentPolicy: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="approval_required">يتطلب مراجعة واعتماد عمادة الكلية (موصى به)</option>
                  <option value="immediate">تفعيل مباشر وفوري للوصول</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUniv(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Edit College */}
      {editingCollege && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">تعديل بيانات الكلية</h3>
              <button onClick={() => setEditingCollege(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateCollege} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الكلية بالعربية:</label>
                <input
                  type="text"
                  required
                  value={editingCollege.nameArabic}
                  onChange={(e) => setEditingCollege({ ...editingCollege, nameArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم الكلية بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={editingCollege.nameEnglish}
                  onChange={(e) => setEditingCollege({ ...editingCollege, nameEnglish: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">رمز الكلية:</label>
                <input
                  type="text"
                  required
                  value={editingCollege.code}
                  onChange={(e) => setEditingCollege({ ...editingCollege, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCollege(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Edit Program */}
      {editingProgram && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">تعديل البرنامج الأكاديمي والمنهج</h3>
              <button onClick={() => setEditingProgram(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateProgram} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم البرنامج بالعربية:</label>
                <input
                  type="text"
                  required
                  value={editingProgram.nameArabic}
                  onChange={(e) => setEditingProgram({ ...editingProgram, nameArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم البرنامج بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={editingProgram.nameEnglish}
                  onChange={(e) => setEditingProgram({ ...editingProgram, nameEnglish: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">النظام الدراسي:</label>
                  <select
                    value={editingProgram.studySystem}
                    onChange={(e) => setEditingProgram({ ...editingProgram, studySystem: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="block">نظام البلوكات (Modular/Block)</option>
                    <option value="semester">نظام الفصول الدراسية (Semesters)</option>
                    <option value="traditional">النظام السنوي التقليدي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">عدد المستويات:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editingProgram.totalRegularLevels}
                    onChange={(e) => setEditingProgram({ ...editingProgram, totalRegularLevels: parseInt(e.target.value) || 6 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="editHasInternship"
                  checked={editingProgram.hasInternship}
                  onChange={(e) => setEditingProgram({ ...editingProgram, hasInternship: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 bg-slate-950 border-slate-800"
                />
                <label htmlFor="editHasInternship" className="text-slate-300 font-semibold cursor-pointer">
                  يتضمن سنة امتياز تدريبية سريرية
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProgram(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal: Edit Study Level */}
      {editingLevel && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">تعديل المستوى الدراسي</h3>
              <button onClick={() => setEditingLevel(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateLevel} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان المستوى بالعربية:</label>
                <input
                  type="text"
                  required
                  value={editingLevel.titleArabic}
                  onChange={(e) => setEditingLevel({ ...editingLevel, titleArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان المستوى بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={editingLevel.titleEnglish}
                  onChange={(e) => setEditingLevel({ ...editingLevel, titleEnglish: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المرحلة الأكاديمية:</label>
                  <select
                    value={editingLevel.stageType}
                    onChange={(e) => setEditingLevel({ ...editingLevel, stageType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="preclinical">ما قبل السريري (Preclinical)</option>
                    <option value="clinical">سريري بالمستشفى (Clinical)</option>
                    <option value="internship">سنة الامتياز (Internship)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الترتيب:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editingLevel.order}
                    onChange={(e) => setEditingLevel({ ...editingLevel, order: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingLevel(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-500"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: Edit Study Period / Block */}
      {editingPeriod && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">تعديل بيانات البلوك الدراسي</h3>
              <button onClick={() => setEditingPeriod(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdatePeriod} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان البلوك بالعربية:</label>
                <input
                  type="text"
                  required
                  value={editingPeriod.titleArabic}
                  onChange={(e) => setEditingPeriod({ ...editingPeriod, titleArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان البلوك بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={editingPeriod.titleEnglish}
                  onChange={(e) => setEditingPeriod({ ...editingPeriod, titleEnglish: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">رمز البلوك:</label>
                  <input
                    type="text"
                    required
                    value={editingPeriod.code}
                    onChange={(e) => setEditingPeriod({ ...editingPeriod, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500 font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">ترتيب البلوك:</label>
                  <input
                    type="number"
                    min="1"
                    value={editingPeriod.order}
                    onChange={(e) => setEditingPeriod({ ...editingPeriod, order: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPeriod(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal: Edit Course Offering */}
      {editingCourse && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">تعديل بيانات المقرر الدراسي</h3>
              <button onClick={() => setEditingCourse(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateCourse} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم المقرر بالعربية:</label>
                <input
                  type="text"
                  required
                  value={editingCourse.titleArabic}
                  onChange={(e) => setEditingCourse({ ...editingCourse, titleArabic: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم المقرر بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={editingCourse.titleEnglish}
                  onChange={(e) => setEditingCourse({ ...editingCourse, titleEnglish: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">رمز المقرر:</label>
                  <input
                    type="text"
                    required
                    value={editingCourse.code}
                    onChange={(e) => setEditingCourse({ ...editingCourse, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500 font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الساعات المعتمدة:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={editingCourse.creditHours}
                    onChange={(e) => setEditingCourse({ ...editingCourse, creditHours: parseInt(e.target.value) || 3 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCourse(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
