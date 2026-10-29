/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Academic Structure Manager (Two-Column Master-Detail Console)
 * - Right Column (Master): Hierarchical Tree (University -> College -> Program -> Study Level) with Breadcrumbs
 * - Left Column (Detail): Study Periods/Blocks, Courses, and Course Instructors Management
 * - Integrated University Creation: Automatically provisions University + College of Human Medicine
 *   + MBBS General Program + Curriculum Version + 8 Study Levels (lvl-1 to lvl-internship).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  GraduationCap,
  Layers,
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  FolderTree,
  Archive,
  Stethoscope,
  Sparkles,
  X
} from 'lucide-react';
import {
  University,
  College,
  AcademicProgram,
  CurriculumVersion,
  StudyLevel,
  StudyPeriod,
  CourseOffering,
  CourseInstructor,
  TeachingType,
  DAR_AL_SALAM_SEED,
  UserRole
} from '../../types/umed.ts';
import {
  fetchUniversities,
  saveUniversity,
  toggleUniversityActive,
  deleteUniversity,
  fetchColleges,
  saveCollege,
  fetchPrograms,
  saveProgram,
  fetchCurriculumVersions,
  saveCurriculumVersion,
  fetchStudyLevels,
  saveStudyLevel,
  toggleStudyLevelActive,
  fetchActiveStudyPeriods,
  fetchArchivedStudyPeriods,
  saveStudyPeriod,
  archiveStudyPeriod,
  deleteStudyPeriod,
  fetchCourseOfferings,
  saveCourseOffering,
  toggleCourseOfferingActive,
  deleteCourseOffering,
  checkEntityDependencies,
  seedDarAlSalamToFirestore
} from '../../services/academicService.ts';
import {
  fetchCourseInstructors,
  saveCourseInstructor,
  deleteCourseInstructor
} from '../../services/batchGovernanceService.ts';

interface AcademicStructureManagerProps {
  userRole?: UserRole;
  assignedUniversityId?: string;
}

export default function AcademicStructureManager({
  userRole = 'platform_owner',
  assignedUniversityId
}: AcademicStructureManagerProps) {
  const isOwner = userRole === 'platform_owner';
  const performedByLabel = isOwner ? 'platform_owner' : userRole || 'university_admin';

  // Master Hierarchy State
  const [universities, setUniversities] = useState<University[]>([DAR_AL_SALAM_SEED.university]);
  const [selectedUnivId, setSelectedUnivId] = useState<string>(
    assignedUniversityId || 'univ-dar-al-salam'
  );
  const [colleges, setColleges] = useState<College[]>([DAR_AL_SALAM_SEED.college]);
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('col-medicine-dar');
  const [programs, setPrograms] = useState<AcademicProgram[]>([DAR_AL_SALAM_SEED.program]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('prog-mbbs');
  const [curriculumVersions, setCurriculumVersions] = useState<CurriculumVersion[]>([
    DAR_AL_SALAM_SEED.curriculumVersion
  ]);
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>(DAR_AL_SALAM_SEED.studyLevels);
  const [selectedLevelId, setSelectedLevelId] = useState<string>('lvl-1');

  // Detail State (Periods, Courses, Instructors)
  const [activeDetailTab, setActiveDetailTab] = useState<'periods' | 'courses' | 'instructors'>('periods');
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>([]);
  const [archivedPeriods, setArchivedPeriods] = useState<StudyPeriod[]>([]);
  const [showArchivedPeriods, setShowArchivedPeriods] = useState<boolean>(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [courses, setCourses] = useState<CourseOffering[]>([]);
  const [instructors, setInstructors] = useState<CourseInstructor[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Integrated University Creation Modal State
  const [showNewUnivModal, setShowNewUnivModal] = useState<boolean>(false);
  const [newUnivNameAr, setNewUnivNameAr] = useState<string>('');
  const [newUnivNameEn, setNewUnivNameEn] = useState<string>('');
  const [newUnivCityAr, setNewUnivCityAr] = useState<string>('صنعاء');
  const [newUnivType, setNewUnivType] = useState<'public' | 'private'>('private');
  const [newUnivPolicy, setNewUnivPolicy] = useState<'immediate' | 'approval_required'>('immediate');
  const [creatingUniv, setCreatingUniv] = useState<boolean>(false);

  // Study Period Form State
  const [editingPeriod, setEditingPeriod] = useState<StudyPeriod | null>(null);
  const [periodTitleAr, setPeriodTitleAr] = useState<string>('');
  const [periodTitleEn, setPeriodTitleEn] = useState<string>('');
  const [periodType, setPeriodType] = useState<'block' | 'semester' | 'rotation' | 'module'>('block');
  const [periodOrder, setPeriodOrder] = useState<number>(1);

  // Course Form State
  const [editingCourse, setEditingCourse] = useState<CourseOffering | null>(null);
  const [courseTitleAr, setCourseTitleAr] = useState<string>('');
  const [courseTitleEn, setCourseTitleEn] = useState<string>('');
  const [courseCode, setCourseCode] = useState<string>('');
  const [courseCreditHours, setCourseCreditHours] = useState<number>(3);
  const [coursePeriodId, setCoursePeriodId] = useState<string>('');

  // Instructor Form State
  const [editingInstructor, setEditingInstructor] = useState<CourseInstructor | null>(null);
  const [instructorNameAr, setInstructorNameAr] = useState<string>('');
  const [instructorTitle, setInstructorTitle] = useState<string>('أستاذ مساعد (Asst. Prof.)');
  const [instructorCourseId, setInstructorCourseId] = useState<string>('');
  const [instructorTeachingType, setInstructorTeachingType] = useState<TeachingType>('both');
  const [instructorSpecialization, setInstructorSpecialization] = useState<string>('');

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 4500);
  };

  const loadMasterHierarchy = useCallback(async (targetUnivId?: string) => {
    setLoading(true);
    try {
      const univList = await fetchUniversities();
      const effectiveUnivs = univList.length > 0 ? univList : [DAR_AL_SALAM_SEED.university];
      const scopedUnivs = assignedUniversityId
        ? effectiveUnivs.filter((u) => u.id === assignedUniversityId)
        : effectiveUnivs;
      setUniversities(scopedUnivs.length > 0 ? scopedUnivs : effectiveUnivs);

      const activeUnivId =
        targetUnivId ||
        assignedUniversityId ||
        selectedUnivId ||
        scopedUnivs[0]?.id ||
        'univ-dar-al-salam';
      setSelectedUnivId(activeUnivId);

      const cols = await fetchColleges(activeUnivId);
      setColleges(cols);
      const activeColId = cols[0]?.id || '';
      setSelectedCollegeId(activeColId);

      const progs = activeColId ? await fetchPrograms(activeColId) : [];
      setPrograms(progs);
      const activeProgId = progs[0]?.id || '';
      setSelectedProgramId(activeProgId);

      const curVers = activeProgId ? await fetchCurriculumVersions(activeProgId) : [];
      setCurriculumVersions(curVers);

      const lvls = await fetchStudyLevels(activeProgId || undefined);
      const sortedLvls = [...lvls].sort((a, b) => a.order - b.order);
      setStudyLevels(sortedLvls);
      if (sortedLvls.length > 0 && !sortedLvls.some((l) => l.id === selectedLevelId)) {
        setSelectedLevelId(sortedLvls[0].id);
      }
    } catch (err) {
      console.error('Error loading master hierarchy:', err);
    } finally {
      setLoading(false);
    }
  }, [assignedUniversityId, selectedUnivId, selectedLevelId]);

  const loadLevelDetails = useCallback(async (univId: string, levelId: string) => {
    if (!univId || !levelId) return;
    try {
      const [activeP, archP, allUnivCourses, insts] = await Promise.all([
        fetchActiveStudyPeriods(levelId, univId),
        fetchArchivedStudyPeriods(levelId, univId),
        fetchCourseOfferings(undefined, univId),
        fetchCourseInstructors({ universityId: univId, studyLevelId: levelId })
      ]);
      const sortedPeriods = [...activeP].sort((a, b) => a.order - b.order);
      setStudyPeriods(sortedPeriods);
      setArchivedPeriods(archP);

      const defaultPeriodId = sortedPeriods[0]?.id || '';
      setSelectedPeriodId((prev) =>
        sortedPeriods.some((p) => p.id === prev) ? prev : defaultPeriodId
      );
      setCoursePeriodId((prev) =>
        sortedPeriods.some((p) => p.id === prev) ? prev : defaultPeriodId
      );

      const levelCourses = allUnivCourses.filter(
        (c) => c.studyLevelId === levelId && !c.isArchived
      );
      setCourses(levelCourses);
      setInstructors(insts);
      if (levelCourses.length > 0) {
        setInstructorCourseId((prev) =>
          levelCourses.some((c) => c.id === prev) ? prev : levelCourses[0].id
        );
      }
    } catch (err) {
      console.error('Error loading level details:', err);
    }
  }, []);

  useEffect(() => {
    loadMasterHierarchy();
  }, [loadMasterHierarchy]);

  useEffect(() => {
    if (selectedUnivId && selectedLevelId) {
      loadLevelDetails(selectedUnivId, selectedLevelId);
    }
  }, [selectedUnivId, selectedLevelId, loadLevelDetails]);

  // 1. Integrated University Auto-Provisioning (University + College + MBBS Program + Curriculum + 8 Study Levels)
  const handleCreateIntegratedUniversity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnivNameAr.trim()) return;
    setCreatingUniv(true);
    try {
      const nowIso = new Date().toISOString();
      const slug =
        newUnivNameEn
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || `univ-${Date.now().toString(36)}`;
      const univId = slug.startsWith('univ-') ? slug : `univ-${slug}`;
      const colId = `col-medicine-${univId}`;
      const progId = `prog-mbbs-${univId}`;
      const curVerId = `cur-${univId}-2025`;

      const newUniv: University = {
        id: univId,
        countryId: 'YE',
        nameArabic: newUnivNameAr.trim(),
        nameEnglish: newUnivNameEn.trim() || newUnivNameAr.trim(),
        type: newUnivType,
        cityArabic: newUnivCityAr.trim() || 'صنعاء',
        enrollmentPolicy: newUnivPolicy,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const newCol: College = {
        id: colId,
        universityId: univId,
        nameArabic: 'كلية الطب البشري',
        nameEnglish: 'College of Human Medicine',
        code: 'MED',
        isActive: true,
        createdAt: nowIso
      };

      const newProg: AcademicProgram = {
        id: progId,
        collegeId: colId,
        universityId: univId,
        nameArabic: 'بكالوريوس الطب والجراحة العامة (MBBS)',
        nameEnglish: 'Bachelor of Medicine, Bachelor of Surgery (MBBS)',
        degree: 'bachelor',
        studySystem: 'block',
        totalRegularLevels: 7,
        hasInternship: true,
        internshipDurationMonths: 12,
        isActive: true,
        createdAt: nowIso
      };

      const newCurVer: CurriculumVersion = {
        id: curVerId,
        programId: progId,
        universityId: univId,
        versionName: 'الخطة الدراسية المعتمدة للطب البشري',
        isCurrent: true,
        effectiveFrom: nowIso.slice(0, 10),
        createdAt: nowIso
      };

      await saveUniversity(newUniv);
      await saveCollege(newCol);
      await saveProgram(newProg);
      await saveCurriculumVersion(newCurVer);

      // Provision the 8 standard study levels (lvl-1 to lvl-internship)
      for (const seedLvl of DAR_AL_SALAM_SEED.studyLevels) {
        const levelRecord: StudyLevel = {
          ...seedLvl,
          id: seedLvl.id,
          universityId: univId,
          programId: progId,
          curriculumVersionId: curVerId,
          isActive: true
        };
        await saveStudyLevel(levelRecord);
      }

      setShowNewUnivModal(false);
      setNewUnivNameAr('');
      setNewUnivNameEn('');
      showToast(
        'success',
        `تم إنشاء "${newUniv.nameArabic}" وتوليد كلية الطب البشري والبرنامج العام والمستويات الثمانية (lvl-1 إلى الامتياز) تلقائياً.`
      );
      await loadMasterHierarchy(univId);
    } catch (err: any) {
      showToast('error', err?.message || 'حدث خطأ أثناء إنشاء الجامعة المتكاملة.');
    } finally {
      setCreatingUniv(false);
    }
  };

  const handleDeleteUniversity = async (univ: University) => {
    const deps = await checkEntityDependencies('university', univ.id);
    if (!deps.canDelete) {
      showToast('error', deps.reason || 'لا يمكن حذف الجامعة لوجود سجلات مرتبطة بها.');
      return;
    }
    await deleteUniversity(univ.id, false);
    showToast('success', `تم حذف الجامعة "${univ.nameArabic}" بنجاح.`);
    await loadMasterHierarchy('univ-dar-al-salam');
  };

  // 2. Study Period Handlers
  const handleSaveStudyPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodTitleAr.trim() || !selectedUnivId || !selectedLevelId) return;
    try {
      const periodId = editingPeriod?.id || `prd-${selectedLevelId}-${Date.now().toString(36)}`;
      const curVerId = curriculumVersions[0]?.id || 'cur-dar-2024';
      const periodObj: StudyPeriod = {
        id: periodId,
        studyLevelId: selectedLevelId,
        curriculumVersionId: curVerId,
        universityId: selectedUnivId,
        periodType,
        titleArabic: periodTitleAr.trim(),
        titleEnglish: periodTitleEn.trim() || periodTitleAr.trim(),
        order: Number(periodOrder) || 1,
        isActive: editingPeriod ? editingPeriod.isActive : true
      };
      await saveStudyPeriod(periodObj);
      setEditingPeriod(null);
      setPeriodTitleAr('');
      setPeriodTitleEn('');
      setPeriodOrder(studyPeriods.length + 2);
      showToast('success', 'تم حفظ الفترة الدراسية / البلوك بنجاح.');
      await loadLevelDetails(selectedUnivId, selectedLevelId);
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر حفظ الفترة الدراسية.');
    }
  };

  // 3. Course Offering Handlers
  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseTitleAr.trim() || !selectedUnivId || !selectedLevelId) return;
    try {
      const courseId = editingCourse?.id || `crs-${selectedLevelId}-${Date.now().toString(36)}`;
      const courseObj: CourseOffering = {
        id: courseId,
        studyPeriodId: coursePeriodId || studyPeriods[0]?.id || undefined,
        studyLevelId: selectedLevelId,
        programId: selectedProgramId || 'prog-mbbs',
        universityId: selectedUnivId,
        curriculumVersionId: curriculumVersions[0]?.id || 'cur-dar-2024',
        code: courseCode.trim().toUpperCase() || `MED-${Math.floor(100 + Math.random() * 899)}`,
        titleArabic: courseTitleAr.trim(),
        titleEnglish: courseTitleEn.trim() || courseTitleAr.trim(),
        creditHours: Number(courseCreditHours) || 3,
        isActive: editingCourse ? editingCourse.isActive : true
      };
      await saveCourseOffering(courseObj);
      setEditingCourse(null);
      setCourseTitleAr('');
      setCourseTitleEn('');
      setCourseCode('');
      showToast('success', 'تم حفظ المقرر الدراسي بنجاح.');
      await loadLevelDetails(selectedUnivId, selectedLevelId);
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر حفظ المقرر الدراسي.');
    }
  };

  // 4. Course Instructor Handlers
  const handleSaveInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructorNameAr.trim() || !instructorCourseId) return;
    try {
      const nowIso = new Date().toISOString();
      const targetCourse = courses.find((c) => c.id === instructorCourseId);
      const instObj: CourseInstructor = {
        id: editingInstructor?.id || `inst-${Date.now().toString(36)}`,
        universityId: selectedUnivId,
        studyLevelId: selectedLevelId,
        studyPeriodId: targetCourse?.studyPeriodId,
        courseOfferingId: instructorCourseId,
        courseTitleArabic: targetCourse?.titleArabic || '',
        instructorNameArabic: instructorNameAr.trim(),
        academicTitle: instructorTitle,
        teachingType: instructorTeachingType,
        specialization: instructorSpecialization.trim() || undefined,
        createdBy: performedByLabel,
        createdAt: editingInstructor?.createdAt || nowIso,
        updatedAt: nowIso
      };
      await saveCourseInstructor(instObj, performedByLabel);
      setEditingInstructor(null);
      setInstructorNameAr('');
      setInstructorSpecialization('');
      showToast('success', 'تم حفظ بيانات دكتور المقرر بنجاح.');
      await loadLevelDetails(selectedUnivId, selectedLevelId);
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر حفظ بيانات دكتور المقرر.');
    }
  };

  const currentUniversity = universities.find((u) => u.id === selectedUnivId) || universities[0];
  const currentCollege = colleges.find((c) => c.id === selectedCollegeId) || colleges[0];
  const currentProgram = programs.find((p) => p.id === selectedProgramId) || programs[0];
  const currentLevel = studyLevels.find((l) => l.id === selectedLevelId) || studyLevels[0];

  const displayedCourses = selectedPeriodId
    ? courses.filter((c) => !c.studyPeriodId || c.studyPeriodId === selectedPeriodId)
    : courses;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Action & Breadcrumb Header */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                إدارة الهيكل الأكاديمي المتكامل (Master-Detail)
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                اختر الجامعة والمستوى من الشجرة الهرمية اليمنى لإدارة الفترات الدراسية والمقررات ودكاترة المقررات
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOwner && (
              <button
                type="button"
                onClick={() => setShowNewUnivModal(true)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء جامعة جديدة (تجهيز تلقائي متكامل)</span>
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                await seedDarAlSalamToFirestore(performedByLabel);
                await loadMasterHierarchy();
                showToast('success', 'تمت مزامنة البيانات التأسيسية للهيكل الأكاديمي بنجاح.');
              }}
              className="px-3 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-bold flex items-center gap-1.5"
              title="مزامنة وتحديث الهيكل الأكاديمي"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
              <span>مزامنة السحابة</span>
            </button>
          </div>
        </div>

        {/* Hierarchical Breadcrumb Bar */}
        <div className="mt-4 pt-3 border-t border-[var(--border-color)] flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[var(--text-muted)] font-semibold">مسار التنقل:</span>
          <span className="px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 font-bold flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            <span>{currentUniversity?.nameArabic || 'الجامعة'}</span>
          </span>
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] font-semibold">
            {currentCollege?.nameArabic || 'كلية الطب البشري'}
          </span>
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-secondary)] font-semibold">
            {currentProgram?.nameArabic || 'برنامج الطب والجراحة (MBBS)'}
          </span>
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 font-bold flex items-center gap-1">
            <GraduationCap className="w-3.5 h-3.5" />
            <span>{currentLevel?.titleArabic || 'المستوى الأول'}</span>
          </span>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="opacity-75 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Two-Column Master-Detail Layout on Large Screens */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Right Column (Master Tree): 4 cols on lg */}
        <div className="lg:col-span-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2.5">
            <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-400" />
              <span>الشجرة الهرمية الأكاديمية</span>
            </h3>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {universities.length} جامعة
            </span>
          </div>

          {/* 1. University Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[var(--text-secondary)]">
              1. الجامعة المعتمدة:
            </label>
            <select
              value={selectedUnivId}
              onChange={(e) => loadMasterHierarchy(e.target.value)}
              disabled={Boolean(assignedUniversityId)}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-primary)] focus:border-teal-500 focus:outline-none"
            >
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nameArabic} ({u.cityArabic}) {u.isActive ? '' : '[معطلة]'}
                </option>
              ))}
            </select>

            {currentUniversity && isOwner && (
              <div className="flex items-center justify-between pt-1 text-[11px]">
                <button
                  type="button"
                  onClick={async () => {
                    await toggleUniversityActive(
                      currentUniversity.id,
                      currentUniversity.isActive
                    );
                    await loadMasterHierarchy(currentUniversity.id);
                  }}
                  className="text-teal-400 hover:underline font-semibold"
                >
                  {currentUniversity.isActive ? 'تعطيل الجامعة مؤقتاً' : 'تفعيل الجامعة'}
                </button>
                {currentUniversity.id !== 'univ-dar-al-salam' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteUniversity(currentUniversity)}
                    className="text-rose-400 hover:underline font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>حذف الجامعة</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2. College & Program Info */}
          <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">الكلية:</span>
              <span className="font-bold text-[var(--text-primary)]">
                {currentCollege?.nameArabic || 'كلية الطب البشري'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">البرنامج الأكاديمي:</span>
              <span className="font-bold text-teal-400">
                {currentProgram?.nameArabic || 'بكالوريوس الطب والجراحة العامة'}
              </span>
            </div>
          </div>

          {/* 3. Study Levels Tree List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--text-secondary)]">
                2. المستويات الدراسية والدفعات ({studyLevels.length}):
              </label>
            </div>
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-0.5">
              {studyLevels.map((lvl) => {
                const isSelected = lvl.id === selectedLevelId;
                return (
                  <div
                    key={lvl.id}
                    onClick={() => setSelectedLevelId(lvl.id)}
                    className={`w-full p-2.5 rounded-xl border text-right cursor-pointer transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-teal-600 text-white border-teal-500 shadow-md'
                        : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border-[var(--border-color)] text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg text-[11px] font-mono font-bold flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-teal-500/15 text-teal-400'
                        }`}
                      >
                        {lvl.order}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{lvl.titleArabic}</div>
                        <div
                          className={`text-[10px] truncate ${
                            isSelected ? 'text-teal-100' : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {lvl.stageType === 'internship'
                            ? 'سنة الامتياز السريري'
                            : lvl.order <= 3
                            ? 'المرحلة الأساسية'
                            : 'المرحلة السريرية'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async (ev) => {
                        ev.stopPropagation();
                        await toggleStudyLevelActive(lvl.id, lvl.isActive);
                        await loadMasterHierarchy(selectedUnivId);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        lvl.isActive
                          ? isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {lvl.isActive ? 'مفعل' : 'معطل'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Left Column (Detail Workspace): 8 cols on lg */}
        <div className="lg:col-span-8 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
          {/* Sub-Navigation Tabs for Detail Column */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveDetailTab('periods')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  activeDetailTab === 'periods'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>الفترات الدراسية والبلوكات ({studyPeriods.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('courses')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  activeDetailTab === 'courses'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>المقررات الدراسية ({courses.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('instructors')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  activeDetailTab === 'instructors'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>دكاترة المقررات ({instructors.length})</span>
              </button>
            </div>

            <span className="text-xs font-bold text-teal-400">
              {currentLevel?.titleArabic} — {currentUniversity?.nameArabic}
            </span>
          </div>

          {/* TAB 1: STUDY PERIODS / BLOCKS */}
          {activeDetailTab === 'periods' && (
            <div className="space-y-4">
              <form
                onSubmit={handleSaveStudyPeriod}
                className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-3"
              >
                <div className="text-xs font-bold text-[var(--text-primary)] flex items-center justify-between">
                  <span>
                    {editingPeriod
                      ? `تعديل الفترة الدراسية: ${editingPeriod.titleArabic}`
                      : `إضافة فترة دراسية / بلوك جديد في ${currentLevel?.titleArabic}`}
                  </span>
                  {editingPeriod && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPeriod(null);
                        setPeriodTitleAr('');
                        setPeriodTitleEn('');
                      }}
                      className="text-rose-400 text-[11px] hover:underline"
                    >
                      إلغاء التعديل
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <input
                    type="text"
                    required
                    value={periodTitleAr}
                    onChange={(e) => setPeriodTitleAr(e.target.value)}
                    placeholder="اسم الفترة / البلوك بالعربية"
                    className="sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  />
                  <select
                    value={periodType}
                    onChange={(e) => setPeriodType(e.target.value as any)}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="block">بلوك طبي (Block)</option>
                    <option value="semester">فصل دراسي (Semester)</option>
                    <option value="rotation">دورة سريرية (Rotation)</option>
                    <option value="module">وحدة دراسية (Module)</option>
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{editingPeriod ? 'حفظ التعديل' : 'إضافة الفترة'}</span>
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {studyPeriods.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]">
                    لا توجد فترات دراسية مضافة لهذا المستوى بعد.
                  </div>
                ) : (
                  studyPeriods.map((prd) => (
                    <div
                      key={prd.id}
                      className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          {prd.titleArabic}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          النوع: {prd.periodType} • الترتيب: {prd.order}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPeriodId(prd.id);
                            setCoursePeriodId(prd.id);
                            setActiveDetailTab('courses');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-teal-500/15 text-teal-400 text-[11px] font-bold"
                        >
                          عرض المقررات
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPeriod(prd);
                            setPeriodTitleAr(prd.titleArabic);
                            setPeriodTitleEn(prd.titleEnglish || '');
                            setPeriodType(prd.periodType);
                            setPeriodOrder(prd.order);
                          }}
                          className="p-1.5 rounded-lg bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-teal-400"
                          title="تعديل"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await archiveStudyPeriod(prd.id, true);
                            await loadLevelDetails(selectedUnivId, selectedLevelId);
                          }}
                          className="p-1.5 rounded-lg bg-[var(--bg-card)] text-amber-400 hover:bg-amber-500/15"
                          title="أرشفة الفترة"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteStudyPeriod(prd.id, true);
                            await loadLevelDetails(selectedUnivId, selectedLevelId);
                          }}
                          className="p-1.5 rounded-lg bg-[var(--bg-card)] text-rose-400 hover:bg-rose-500/15"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {archivedPeriods.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowArchivedPeriods(!showArchivedPeriods)}
                    className="text-[11px] text-amber-400 hover:underline font-bold"
                  >
                    {showArchivedPeriods
                      ? 'إخفاء الفترات المؤرشفة'
                      : `عرض الفترات المؤرشفة (${archivedPeriods.length})`}
                  </button>
                  {showArchivedPeriods && (
                    <div className="mt-2 space-y-1.5">
                      {archivedPeriods.map((ap) => (
                        <div
                          key={ap.id}
                          className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs"
                        >
                          <span className="font-bold text-amber-300">{ap.titleArabic}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await archiveStudyPeriod(ap.id, false);
                              await loadLevelDetails(selectedUnivId, selectedLevelId);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-bold"
                          >
                            استعادة
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COURSES */}
          {activeDetailTab === 'courses' && (
            <div className="space-y-4">
              <form
                onSubmit={handleSaveCourse}
                className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-3"
              >
                <div className="text-xs font-bold text-[var(--text-primary)] flex items-center justify-between">
                  <span>
                    {editingCourse
                      ? `تعديل المقرر: ${editingCourse.titleArabic}`
                      : `إضافة مقرر دراسي جديد في ${currentLevel?.titleArabic}`}
                  </span>
                  {editingCourse && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCourse(null);
                        setCourseTitleAr('');
                        setCourseTitleEn('');
                        setCourseCode('');
                      }}
                      className="text-rose-400 text-[11px] hover:underline"
                    >
                      إلغاء التعديل
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <input
                    type="text"
                    required
                    value={courseTitleAr}
                    onChange={(e) => setCourseTitleAr(e.target.value)}
                    placeholder="اسم المقرر بالعربية (مثال: علم التشريح)"
                    className="sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  />
                  <input
                    type="text"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    placeholder="كود المقرر (ANAT-101)"
                    className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] font-mono"
                    dir="ltr"
                  />
                  <select
                    value={coursePeriodId}
                    onChange={(e) => setCoursePeriodId(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="">جميع الفترات / عام للمستوى</option>
                    {studyPeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.titleArabic}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{editingCourse ? 'حفظ تعديلات المقرر' : 'إضافة المقرر الدراسي'}</span>
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {displayedCourses.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]">
                    لا توجد مقررات دراسية مسجلة في هذا المستوى حالياً.
                  </div>
                ) : (
                  displayedCourses.map((crs) => (
                    <div
                      key={crs.id}
                      className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                          <span>{crs.titleArabic}</span>
                          <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-400 font-mono text-[10px]">
                            {crs.code}
                          </span>
                        </div>
                        {crs.instructorNameArabic && (
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            مدرس المقرر: {crs.instructorNameArabic}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            await toggleCourseOfferingActive(crs.id, crs.isActive);
                            await loadLevelDetails(selectedUnivId, selectedLevelId);
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                            crs.isActive
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {crs.isActive ? 'مفعل' : 'معطل'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCourse(crs);
                            setCourseTitleAr(crs.titleArabic);
                            setCourseTitleEn(crs.titleEnglish || '');
                            setCourseCode(crs.code);
                            setCourseCreditHours(crs.creditHours || 3);
                            setCoursePeriodId(crs.studyPeriodId || '');
                          }}
                          className="p-1.5 rounded-lg bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-teal-400"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteCourseOffering(crs.id);
                            await loadLevelDetails(selectedUnivId, selectedLevelId);
                          }}
                          className="p-1.5 rounded-lg bg-[var(--bg-card)] text-rose-400 hover:bg-rose-500/15"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COURSE INSTRUCTORS */}
          {activeDetailTab === 'instructors' && (
            <div className="space-y-4">
              <form
                onSubmit={handleSaveInstructor}
                className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-3"
              >
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  {editingInstructor
                    ? `تعديل بيانات الدكتور: ${editingInstructor.instructorNameArabic}`
                    : `ربط دكتور / أستاذ مقرر في ${currentLevel?.titleArabic}`}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={instructorNameAr}
                    onChange={(e) => setInstructorNameAr(e.target.value)}
                    placeholder="اسم الدكتور رباعياً بالعربية"
                    className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  />
                  <select
                    value={instructorCourseId}
                    onChange={(e) => setInstructorCourseId(e.target.value)}
                    required
                    className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="">اختر المقرر الدراسي...</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.titleArabic} ({c.code})
                      </option>
                    ))}
                  </select>
                  <select
                    value={instructorTitle}
                    onChange={(e) => setInstructorTitle(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="أستاذ دكتور (Prof.)">أستاذ دكتور (Prof.)</option>
                    <option value="أستاذ مشارك (Assoc. Prof.)">أستاذ مشارك (Assoc. Prof.)</option>
                    <option value="أستاذ مساعد (Asst. Prof.)">أستاذ مساعد (Asst. Prof.)</option>
                    <option value="مدرس / محاضر (Lecturer)">مدرس / محاضر (Lecturer)</option>
                    <option value="معيد / مشرف سريري (Clinical Tutor)">
                      معيد / مشرف سريري (Clinical Tutor)
                    </option>
                  </select>
                  <select
                    value={instructorTeachingType}
                    onChange={(e) => setInstructorTeachingType(e.target.value as TeachingType)}
                    className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                  >
                    <option value="both">نظري وعملي / سريري</option>
                    <option value="theoretical">محاضرات نظرية فقط</option>
                    <option value="practical">معامل وتدريب عملي</option>
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{editingInstructor ? 'حفظ التعديلات' : 'حفظ وربط دكتور المقرر'}</span>
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {instructors.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]">
                    لا يوجد دكاترة مقررات مسجلون في هذا المستوى حالياً.
                  </div>
                ) : (
                  instructors.map((inst) => (
                    <div
                      key={inst.id}
                      className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          {inst.academicTitle} / {inst.instructorNameArabic}
                        </div>
                        <div className="text-[11px] text-teal-400">
                          المقرر: {inst.courseTitleArabic || inst.courseOfferingId}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteCourseInstructor(
                            inst.id,
                            performedByLabel,
                            selectedUnivId
                          );
                          await loadLevelDetails(selectedUnivId, selectedLevelId);
                        }}
                        className="p-1.5 rounded-lg bg-[var(--bg-card)] text-rose-400 hover:bg-rose-500/15"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Integrated University Creation Modal */}
      {showNewUnivModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
        >
          <form
            onSubmit={handleCreateIntegratedUniversity}
            className="bg-[var(--bg-card)] border border-teal-500/40 rounded-2xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                    إنشاء جامعة جديدة بالتجهيز التلقائي المتكامل
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    ينشئ سجل الجامعة + كلية الطب البشري + البرنامج العام + المستويات الثمانية تلقائياً
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewUnivModal(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[var(--text-secondary)] mb-1">
                  اسم الجامعة بالعربية *
                </label>
                <input
                  type="text"
                  required
                  value={newUnivNameAr}
                  onChange={(e) => setNewUnivNameAr(e.target.value)}
                  placeholder="مثال: جامعة صنعاء / جامعة العلوم والتكنولوجيا"
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">
                    الاسم بالإنجليزية (اختياري)
                  </label>
                  <input
                    type="text"
                    value={newUnivNameEn}
                    onChange={(e) => setNewUnivNameEn(e.target.value)}
                    placeholder="Sana'a University"
                    dir="ltr"
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">
                    المدينة / المحافظة
                  </label>
                  <input
                    type="text"
                    value={newUnivCityAr}
                    onChange={(e) => setNewUnivCityAr(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">
                    نوع الجامعة
                  </label>
                  <select
                    value={newUnivType}
                    onChange={(e) => setNewUnivType(e.target.value as 'public' | 'private')}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  >
                    <option value="public">حكومية (Public)</option>
                    <option value="private">أهلية / خاصة (Private)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[var(--text-secondary)] mb-1">
                    سياسة القبول بالدفعة
                  </label>
                  <select
                    value={newUnivPolicy}
                    onChange={(e) =>
                      setNewUnivPolicy(e.target.value as 'immediate' | 'approval_required')
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                  >
                    <option value="immediate">تفعيل فوري للطالب</option>
                    <option value="approval_required">يتطلب مراجعة واعتماد المشرف</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewUnivModal(false)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-input)] text-[var(--text-secondary)] text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={creatingUniv}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                {creatingUniv ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>إنشاء الجامعة وتجهيز المستويات الثمانية</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
