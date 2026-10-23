/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Academic Structure Management Console
 * Full Dynamic Hierarchical CRUD for Universities, Colleges, Programs, Levels, Blocks, and Courses
 */

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  GraduationCap, 
  BookOpen, 
  Layers, 
  Plus, 
  Minus,
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw, 
  X,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  BarChart3
} from 'lucide-react';
import AcademicAnalyticsDashboard from './AcademicAnalyticsDashboard.tsx';
import { 
  University, 
  College, 
  AcademicProgram, 
  StudyLevel, 
  StudyPeriod, 
  CourseOffering,
  StageType,
  UserRole
} from '../../types/umed.ts';
import { 
  fetchUniversities, 
  subscribeToUniversities,
  saveUniversity, 
  toggleUniversityActive,
  deleteUniversity,
  fetchColleges, 
  saveCollege, 
  toggleCollegeActive,
  deleteCollege,
  fetchPrograms, 
  saveProgram, 
  toggleProgramActive,
  deleteProgram,
  fetchStudyLevels, 
  saveStudyLevel, 
  toggleStudyLevelActive,
  deleteStudyLevel,
  fetchStudyPeriods, 
  saveStudyPeriod, 
  toggleStudyPeriodActive,
  deleteStudyPeriod,
  fetchCourseOfferings, 
  saveCourseOffering,
  toggleCourseOfferingActive,
  deleteCourseOffering,
  checkEntityDependencies,
  seedDarAlSalamToFirestore
} from '../../services/academicService.ts';

type EntityType = 'university' | 'college' | 'program' | 'level' | 'period' | 'course';

interface DeleteConfirmTarget {
  type: EntityType;
  id: string;
  name: string;
  currentIsActive: boolean;
  dependentCount: number;
  reason: string;
}

interface AcademicStructureManagerProps {
  userRole?: UserRole;
  assignedUniversityId?: string;
  assignedStudyLevelId?: string;
}

export default function AcademicStructureManager({
  userRole = 'platform_owner',
  assignedUniversityId,
  assignedStudyLevelId
}: AcademicStructureManagerProps = {}) {
  const isUnivScoped = userRole !== 'platform_owner';
  const isBatchScoped = userRole === 'batch_rep' || userRole === 'department_head';

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
  const [activeViewMode, setActiveViewMode] = useState<'hierarchy' | 'analytics'>('hierarchy');
  const [loading, setLoading] = useState<boolean>(true);
  const [seedLoading, setSeedLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Add Modals State
  const [showAddUnivModal, setShowAddUnivModal] = useState<boolean>(false);
  const [showAddCollegeModal, setShowAddCollegeModal] = useState<boolean>(false);
  const [showAddProgramModal, setShowAddProgramModal] = useState<boolean>(false);
  const [showAddLevelModal, setShowAddLevelModal] = useState<boolean>(false);
  const [showAddPeriodModal, setShowAddPeriodModal] = useState<boolean>(false);
  const [showAddCourseModal, setShowAddCourseModal] = useState<boolean>(false);

  // Edit Modals State
  const [editingUniv, setEditingUniv] = useState<University | null>(null);
  const [editingCollege, setEditingCollege] = useState<College | null>(null);
  const [editingProgram, setEditingProgram] = useState<AcademicProgram | null>(null);
  const [editingLevel, setEditingLevel] = useState<StudyLevel | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<StudyPeriod | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseOffering | null>(null);

  // Conditional / Cascade Delete Modal State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<DeleteConfirmTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

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

  const [levelForm, setLevelForm] = useState({
    titleArabic: '',
    titleEnglish: '',
    order: 1,
    stageType: 'regular' as StageType,
    durationMonths: 9
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

  // Load universities on mount (Strictly scoped for University Owner & Batch Rep)
  const loadUniversities = async () => {
    setLoading(true);
    try {
      const allUnivs = await fetchUniversities();
      const univs =
        isUnivScoped && assignedUniversityId
          ? allUnivs.filter(u => u.id === assignedUniversityId)
          : allUnivs;
      const finalUnivs = univs.length > 0 ? univs : allUnivs;
      setUniversities(finalUnivs);
      if (finalUnivs.length > 0) {
        setSelectedUniversity(prev => (prev && finalUnivs.find(u => u.id === prev.id)) || finalUnivs[0]);
      } else {
        setSelectedUniversity(null);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل تحميل الجامعات' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUniversities();
    const unsub = subscribeToUniversities((allUnivs) => {
      const univs =
        isUnivScoped && assignedUniversityId
          ? allUnivs.filter(u => u.id === assignedUniversityId)
          : allUnivs;
      const finalUnivs = univs.length > 0 ? univs : allUnivs;
      setUniversities(finalUnivs);
      if (finalUnivs.length > 0) {
        setSelectedUniversity(prev => (prev && finalUnivs.find(u => u.id === prev.id)) || finalUnivs[0]);
      }
    });
    return () => unsub();
  }, [userRole, assignedUniversityId]);

  // Cascading Load: Colleges when University changes
  useEffect(() => {
    if (selectedUniversity) {
      fetchColleges(selectedUniversity.id).then((cols) => {
        setColleges(cols);
        setSelectedCollege(prev => (prev && cols.find(c => c.id === prev.id)) || (cols.length > 0 ? cols[0] : null));
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
        setSelectedProgram(prev => (prev && progs.find(p => p.id === prev.id)) || (progs.length > 0 ? progs[0] : null));
      });
    } else {
      setPrograms([]);
      setSelectedProgram(null);
    }
  }, [selectedCollege]);

  // Cascading Load: Study Levels when Program changes (Strictly locked to batch level for Batch Rep)
  useEffect(() => {
    if (selectedProgram) {
      fetchStudyLevels(selectedProgram.id).then((lvls) => {
        const scopedLvls =
          isBatchScoped && assignedStudyLevelId
            ? lvls.filter(l => l.id === assignedStudyLevelId)
            : lvls;
        const finalLvls = scopedLvls.length > 0 ? scopedLvls : lvls;
        setStudyLevels(finalLvls);
        setSelectedLevel(prev => (prev && finalLvls.find(l => l.id === prev.id)) || (finalLvls.length > 0 ? finalLvls[0] : null));
      });
    } else {
      setStudyLevels([]);
      setSelectedLevel(null);
    }
  }, [selectedProgram, isBatchScoped, assignedStudyLevelId]);

  // Cascading Load: Study Periods / Blocks when Level changes
  useEffect(() => {
    if (selectedLevel) {
      fetchStudyPeriods(selectedLevel.id).then((periods) => {
        setStudyPeriods(periods);
        setSelectedPeriod(prev => (prev && periods.find(p => p.id === prev.id)) || (periods.length > 0 ? periods[0] : null));
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
      if (selectedUniversity) {
        const cols = await fetchColleges(selectedUniversity.id);
        setColleges(cols);
        if (cols[0]) {
          setSelectedCollege(cols[0]);
          const progs = await fetchPrograms(cols[0].id);
          setPrograms(progs);
          if (progs[0]) {
            setSelectedProgram(progs[0]);
            const lvls = await fetchStudyLevels(progs[0].id);
            setStudyLevels(lvls);
          }
        }
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل تثبيت بيانات الجامعة' });
    } finally {
      setSeedLoading(false);
    }
  };

  // Execute Actual Deletion (Single or Cascade)
  const executeConfirmedDelete = async (type: EntityType, id: string, name: string, forceCascade: boolean = false) => {
    setDeleteLoading(true);
    try {
      if (type === 'university') {
        await deleteUniversity(id, forceCascade);
        const remaining = universities.filter(u => u.id !== id);
        setUniversities(remaining);
        if (selectedUniversity?.id === id) {
          setSelectedUniversity(remaining.length > 0 ? remaining[0] : null);
        }
      } else if (type === 'college') {
        await deleteCollege(id, forceCascade);
        const remaining = colleges.filter(c => c.id !== id);
        setColleges(remaining);
        if (selectedCollege?.id === id) {
          setSelectedCollege(remaining.length > 0 ? remaining[0] : null);
        }
      } else if (type === 'program') {
        await deleteProgram(id, forceCascade);
        const remaining = programs.filter(p => p.id !== id);
        setPrograms(remaining);
        if (selectedProgram?.id === id) {
          setSelectedProgram(remaining.length > 0 ? remaining[0] : null);
        }
      } else if (type === 'level') {
        await deleteStudyLevel(id, forceCascade);
        const remaining = studyLevels.filter(l => l.id !== id);
        setStudyLevels(remaining);
        if (selectedLevel?.id === id) {
          setSelectedLevel(remaining.length > 0 ? remaining[0] : null);
        }
      } else if (type === 'period') {
        await deleteStudyPeriod(id, forceCascade);
        const remaining = studyPeriods.filter(p => p.id !== id);
        setStudyPeriods(remaining);
        if (selectedPeriod?.id === id) {
          setSelectedPeriod(remaining.length > 0 ? remaining[0] : null);
        }
      } else if (type === 'course') {
        await deleteCourseOffering(id);
        setCourses(courses.filter(c => c.id !== id));
      }

      setDeleteConfirmTarget(null);
      setStatusMessage({
        type: 'success',
        text: forceCascade
          ? `تم الحذف النهائي لـ "${name}" مع جميع العناصر التابعة له بنجاح.`
          : `تم حذف "${name}" بنجاح.`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشلت عملية الحذف' });
    } finally {
      setDeleteLoading(false);
    }
  };

  // Safe Deactivation from Confirmation Modal
  const handleSafeDeactivateFromModal = async () => {
    if (!deleteConfirmTarget) return;
    const { type, id, name } = deleteConfirmTarget;
    setDeleteLoading(true);
    try {
      if (type === 'university') {
        await toggleUniversityActive(id, true);
        setUniversities(universities.map(u => u.id === id ? { ...u, isActive: false } : u));
      } else if (type === 'college') {
        await toggleCollegeActive(id, true);
        setColleges(colleges.map(c => c.id === id ? { ...c, isActive: false } : c));
      } else if (type === 'program') {
        await toggleProgramActive(id, true);
        setPrograms(programs.map(p => p.id === id ? { ...p, isActive: false } : p));
      } else if (type === 'level') {
        await toggleStudyLevelActive(id, true);
        setStudyLevels(studyLevels.map(l => l.id === id ? { ...l, isActive: false } : l));
      } else if (type === 'period') {
        await toggleStudyPeriodActive(id, true);
        setStudyPeriods(studyPeriods.map(p => p.id === id ? { ...p, isActive: false } : p));
      } else if (type === 'course') {
        await toggleCourseOfferingActive(id, true);
        setCourses(courses.map(c => c.id === id ? { ...c, isActive: false } : c));
      }

      setDeleteConfirmTarget(null);
      setStatusMessage({
        type: 'success',
        text: `تم تعطيل "${name}" بأمان (isActive: false) مع الحفاظ على السجلات التابعة.`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل التعطيل الآمن' });
    } finally {
      setDeleteLoading(false);
    }
  };

  // Dependency-Aware Deletion Handler
  const handleAttemptDelete = async (type: EntityType, id: string, name: string, currentIsActive: boolean = true) => {
    const check = await checkEntityDependencies(type, id);
    if (check.canDelete) {
      await executeConfirmedDelete(type, id, name, false);
    } else {
      setDeleteConfirmTarget({
        type,
        id,
        name,
        currentIsActive,
        dependentCount: check.dependentCount,
        reason: check.reason || `يوجد ${check.dependentCount} عنصر تابع مرتبط بـ "${name}".`
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
      const updatedList = studyLevels
        .map(l => l.id === editingLevel.id ? editingLevel : l)
        .sort((a, b) => a.order - b.order);
      setStudyLevels(updatedList);
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
      const updatedList = studyPeriods
        .map(p => p.id === editingPeriod.id ? editingPeriod : p)
        .sort((a, b) => a.order - b.order);
      setStudyPeriods(updatedList);
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
      const rawHours = Number(editingCourse.creditHours);
      const creditHours = !isNaN(rawHours) && rawHours >= 1 ? Math.min(Math.floor(rawHours), 20) : 3;
      const updatedCourse: CourseOffering = {
        ...editingCourse,
        creditHours
      };
      await saveCourseOffering(updatedCourse);
      setCourses(courses.map(c => c.id === updatedCourse.id ? updatedCourse : c));
      setEditingCourse(null);
      setStatusMessage({ type: 'success', text: `تم تحديث بيانات مقرر ${updatedCourse.titleArabic} بنجاح (${creditHours} ساعات معتمدة)` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Form Submissions (Create)
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
      setUnivForm({
        nameArabic: '',
        nameEnglish: '',
        type: 'private',
        cityArabic: 'صنعاء',
        enrollmentPolicy: 'approval_required'
      });
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
        code: collegeForm.code || 'MED',
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await saveCollege(newCol);
      setColleges([...colleges, newCol]);
      setSelectedCollege(newCol);
      setShowAddCollegeModal(false);
      setCollegeForm({ nameArabic: '', nameEnglish: '', code: '' });
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
      setProgramForm({
        nameArabic: '',
        nameEnglish: '',
        degree: 'bachelor',
        studySystem: 'block',
        totalRegularLevels: 7,
        hasInternship: true,
        internshipDurationMonths: 12
      });
      setStatusMessage({ type: 'success', text: `تمت إضافة برنامج ${newProg.nameArabic} بنجاح` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleCreateLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProgram || !selectedUniversity) return;
    try {
      const id = `lvl-${Date.now().toString(36)}`;
      const newLevel: StudyLevel = {
        id,
        curriculumVersionId: 'cur-dar-2024',
        programId: selectedProgram.id,
        universityId: selectedUniversity.id,
        order: Number(levelForm.order) || studyLevels.length + 1,
        stageType: levelForm.stageType,
        titleArabic: levelForm.titleArabic,
        titleEnglish: levelForm.titleEnglish,
        durationMonths: Number(levelForm.durationMonths) || (levelForm.stageType === 'internship' ? 12 : undefined),
        isActive: true
      };
      await saveStudyLevel(newLevel);
      const updated = [...studyLevels, newLevel].sort((a, b) => a.order - b.order);
      setStudyLevels(updated);
      setSelectedLevel(newLevel);
      setShowAddLevelModal(false);
      setLevelForm({
        titleArabic: '',
        titleEnglish: '',
        order: updated.length + 1,
        stageType: 'regular',
        durationMonths: 9
      });
      setStatusMessage({ type: 'success', text: `تمت إضافة المستوى الدراسي (${newLevel.titleArabic}) بنجاح` });
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
        periodType: selectedLevel.stageType === 'internship' ? 'rotation' : 'block',
        titleArabic: periodForm.titleArabic,
        titleEnglish: periodForm.titleEnglish,
        code: periodForm.code,
        order: Number(periodForm.order) || studyPeriods.length + 1,
        isActive: true
      };
      await saveStudyPeriod(newPeriod);
      const updated = [...studyPeriods, newPeriod].sort((a, b) => a.order - b.order);
      setStudyPeriods(updated);
      setSelectedPeriod(newPeriod);
      setShowAddPeriodModal(false);
      setPeriodForm({ titleArabic: '', titleEnglish: '', code: '', order: updated.length + 1 });
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
      const rawHours = Number(courseForm.creditHours);
      const creditHours = !isNaN(rawHours) && rawHours >= 1 ? Math.min(Math.floor(rawHours), 20) : 3;
      const newCourse: CourseOffering = {
        id,
        studyPeriodId: selectedPeriod.id,
        studyLevelId: selectedLevel.id,
        curriculumVersionId: 'cur-dar-2024',
        universityId: selectedUniversity.id,
        titleArabic: courseForm.titleArabic,
        titleEnglish: courseForm.titleEnglish,
        code: courseForm.code,
        creditHours,
        isActive: true
      };
      await saveCourseOffering(newCourse);
      setCourses([...courses, newCourse]);
      setShowAddCourseModal(false);
      setCourseForm({ titleArabic: '', titleEnglish: '', code: '', creditHours: 3 });
      setStatusMessage({ type: 'success', text: `تمت إضافة مقرر ${newCourse.titleArabic} بنجاح (${creditHours} ساعات معتمدة)` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner & One-Click Seed Loader Button */}
      <div className="bg-gradient-to-r from-teal-950/60 via-slate-900 to-indigo-950/60 border border-teal-500/30 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-2 text-xs text-teal-300 font-semibold">
            <span>إدارة الهيكل الأكاديمي الشامل</span>
            <span>·</span>
            <span className="font-mono text-slate-400">Dynamic CRUD & Hybrid Sync</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            المؤسسات والبرامج الطبية ونظام البلوكات
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            إنشاء وتعديل وتفعيل وحذف الجامعات والكليات والبرامج والمستويات الدراسية وسنة الامتياز والبلوكات والمقررات بشكل ديناميكي كامل.
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

      {/* View Switcher: Hierarchy Manager vs Data Visualizations (Recharts) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-2.5 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveViewMode('hierarchy')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeViewMode === 'hierarchy'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>إدارة الهيكل الأكاديمي والبلوكات</span>
          </button>
          
          <button
            onClick={() => setActiveViewMode('analytics')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeViewMode === 'analytics'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-teal-300" />
            <span>مؤشرات نمو القيد ونتائج التقييمات الأكاديمية</span>
            <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[10px] font-mono">
              Recharts Data Viz
            </span>
          </button>
        </div>

        {selectedUniversity && (
          <div className="text-xs text-slate-400 flex items-center gap-2 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800">
            <Building2 className="w-3.5 h-3.5 text-teal-400" />
            <span>المؤسسة: <strong className="text-white">{selectedUniversity.nameArabic}</strong></span>
          </div>
        )}
      </div>

      {activeViewMode === 'analytics' ? (
        <AcademicAnalyticsDashboard
          selectedUniversity={selectedUniversity}
          studyLevels={studyLevels}
        />
      ) : (
        <>
          {/* 2. Interactive Cascading Academic Hierarchy Explorer */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        
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
                className="px-2 py-1 rounded bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 text-[11px] font-semibold flex items-center gap-0.5"
                title="إضافة جامعة جديدة"
              >
                <Plus className="w-3 h-3" />
                <span>إضافة</span>
              </button>
            </div>

            {universities.length === 0 ? (
              <div className="text-slate-500 text-xs text-center py-6">
                لا توجد جامعات مسجلة. اضغط "إضافة" أو ثبت البذور الافتراضية.
              </div>
            ) : (
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
                            toggleUniversityActive(u.id, u.isActive).then(() => {
                              setUniversities(universities.map(item => item.id === u.id ? { ...item, isActive: !item.isActive } : item));
                            });
                          }}
                          className="text-slate-400 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                          title="تبديل حالة التنشيط"
                        >
                          {u.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                          <span>{u.isActive ? 'تعطيل' : 'تفعيل'}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAttemptDelete('university', u.id, u.nameArabic, u.isActive);
                          }}
                          className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-950/30"
                          title="حذف الجامعة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                  className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[11px] font-semibold flex items-center gap-0.5"
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
                          className="text-slate-400 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                          title="تبديل حالة التنشيط"
                        >
                          {c.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                          <span>{c.isActive ? 'تعطيل' : 'تفعيل'}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAttemptDelete('college', c.id, c.nameArabic, c.isActive);
                          }}
                          className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-950/30"
                          title="حذف الكلية"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
                  className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[11px] font-semibold flex items-center gap-0.5"
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
                          {p.studySystem === 'block' ? 'نظام البلوكات (Block)' : p.studySystem === 'semester' ? 'نظام الفصول' : 'نظام سنوي'}
                        </span>
                        <span className={`text-[10px] ${p.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {p.isActive ? '● نشط' : '○ معطل'}
                        </span>
                      </div>
                      <div className="font-bold">{p.nameArabic}</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5" dir="ltr">{p.nameEnglish}</div>
                      
                      <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-2">
                        <span>{p.totalRegularLevels} مستويات دراسية</span>
                        {p.hasInternship && (
                          <>
                            <span>•</span>
                            <span className="text-amber-300 font-semibold">+ سنة امتياز ({p.internshipDurationMonths || 12} شهر)</span>
                          </>
                        )}
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
                          className="text-slate-400 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                          title="تبديل حالة التنشيط"
                        >
                          {p.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                          <span>{p.isActive ? 'تعطيل' : 'تفعيل'}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAttemptDelete('program', p.id, p.nameArabic, p.isActive);
                          }}
                          className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-950/30"
                          title="حذف البرنامج"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
              {selectedProgram && (
                <button
                  onClick={() => {
                    setLevelForm({
                      titleArabic: '',
                      titleEnglish: '',
                      order: studyLevels.length + 1,
                      stageType: 'regular',
                      durationMonths: 9
                    });
                    setShowAddLevelModal(true);
                  }}
                  className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[11px] font-semibold flex items-center gap-0.5"
                  title="إضافة مستوى دراسي أو سنة امتياز جديدة"
                >
                  <Plus className="w-3 h-3" />
                  <span>إضافة مستوى</span>
                </button>
              )}
            </div>

            {studyLevels.length === 0 ? (
              <div className="text-slate-500 text-xs text-center py-6">
                لا توجد مستويات دراسية مسجلة لهذا البرنامج. اضغط "+ إضافة مستوى".
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pl-1">
                {studyLevels.map((lvl) => {
                  const isSelected = selectedLevel?.id === lvl.id;
                  const isIntern = lvl.stageType === 'internship';
                  return (
                    <div
                      key={lvl.id}
                      onClick={() => setSelectedLevel(lvl)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all text-xs space-y-2 ${
                        isSelected
                          ? isIntern 
                            ? 'bg-amber-500/25 border-amber-400 text-white'
                            : 'bg-teal-500/25 border-teal-400 text-white'
                          : isIntern
                          ? 'bg-amber-950/20 border-amber-700/40 text-amber-200 hover:border-amber-500'
                          : 'bg-slate-950/70 border-slate-800/80 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                              isIntern ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {isIntern ? 'امتياز' : `م ${lvl.order}`}
                            </span>
                            <span className="font-bold truncate">{lvl.titleArabic}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate" dir="ltr">
                            {lvl.titleEnglish}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {lvl.durationMonths && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 border border-slate-700 font-mono">
                              {lvl.durationMonths}M
                            </span>
                          )}
                          <span className={`text-[10px] ${lvl.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {lvl.isActive ? '●' : '○'}
                          </span>
                        </div>
                      </div>

                      {/* 3 Action Buttons: Edit, Toggle Active, Delete */}
                      <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingLevel(lvl);
                          }}
                          className="text-slate-400 hover:text-amber-300 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                          title="تعديل المستوى الدراسي"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>تعديل</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStudyLevelActive(lvl.id, lvl.isActive).then(() => {
                              setStudyLevels(studyLevels.map(item => item.id === lvl.id ? { ...item, isActive: !item.isActive } : item));
                            });
                          }}
                          className="text-slate-400 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                          title="تفعيل أو تعطيل المستوى"
                        >
                          {lvl.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                          <span>{lvl.isActive ? 'تعطيل' : 'تفعيل'}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAttemptDelete('level', lvl.id, lvl.titleArabic, lvl.isActive);
                          }}
                          className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-950/30"
                          title="حذف المستوى الدراسي"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. Deep Dive Explorer: Blocks & Courses within Selected Level */}
      {selectedLevel && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-6">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2.5 py-1 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold">
                  {selectedLevel.titleArabic}
                </span>
                <span className="text-xs text-slate-400" dir="ltr">({selectedLevel.titleEnglish})</span>
                {selectedLevel.stageType === 'internship' && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                    مرحلة سريرية مستقلة ({selectedLevel.durationMonths || 12} شهراً مناوبات في المستشفيات)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                استعراض وإدارة البلوكات والروتيشنات والمقررات التابعة للمستوى في {selectedUniversity?.nameArabic}
              </p>
            </div>

            <button
              onClick={() => {
                setPeriodForm({
                  titleArabic: '',
                  titleEnglish: '',
                  code: '',
                  order: studyPeriods.length + 1
                });
                setShowAddPeriodModal(true);
              }}
              className="py-1.5 px-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{selectedLevel.stageType === 'internship' ? 'إضافة روتيشن سريري / فترة' : 'إضافة بلوك دراسي (Block)'}</span>
            </button>
          </div>

          {/* Blocks & Courses Subgrid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Left Column: Blocks List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>البلوكات والفترات الدراسية (System Blocks)</span>
                <span className="text-teal-400 font-mono text-[11px]">{studyPeriods.length} بلوك</span>
              </h4>

              {studyPeriods.length === 0 ? (
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs text-center">
                  لم يتم تسجيل بلوكات لهذا المستوى بعد. اضغط "إضافة بلوك دراسي" لتسجيل بلوك جديد.
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
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">الترتيب: {period.order}</span>
                          <span className={`text-[10px] ${period.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {period.isActive ? '● نشط' : '○ معطل'}
                          </span>
                        </div>
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
                          className="text-slate-400 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800"
                          title="تبديل حالة التنشيط"
                        >
                          {period.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                          <span>{period.isActive ? 'تعطيل' : 'تفعيل'}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAttemptDelete('period', period.id, period.titleArabic, period.isActive);
                          }}
                          className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-950/30"
                          title="حذف البلوك الدراسي"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-2">
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
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-teal-300 font-mono font-bold">
                            {course.code}
                          </span>
                          <span className="font-bold text-white text-sm">{course.titleArabic}</span>
                          {course.titleEnglish && (
                            <span className="text-slate-400 text-xs" dir="ltr">({course.titleEnglish})</span>
                          )}
                          <span className={`text-[10px] ${course.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {course.isActive ? '● نشط' : '○ معطل'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono">{course.creditHours ?? 3} ساعات معتمدة</span>
                          <button
                            onClick={() => setEditingCourse(course)}
                            className="text-slate-400 hover:text-indigo-300 px-2 py-1 rounded hover:bg-slate-900 flex items-center gap-1"
                            title="تعديل المقرر"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>

                          <button
                            onClick={() => {
                              toggleCourseOfferingActive(course.id, course.isActive).then(() => {
                                setCourses(courses.map(c => c.id === course.id ? { ...c, isActive: !c.isActive } : c));
                              });
                            }}
                            className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-900 flex items-center gap-1"
                            title="تبديل التنشيط"
                          >
                            {course.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                            <span>{course.isActive ? 'تعطيل' : 'تفعيل'}</span>
                          </button>

                          <button
                            onClick={() => handleAttemptDelete('course', course.id, course.titleArabic, course.isActive)}
                            className="text-slate-400 hover:text-rose-400 p-1.5 rounded hover:bg-rose-950/30"
                            title="حذف المقرر الدراسي"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Sections: Theoretical & Practical */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>الأقسام المعتمدة:</span>
                        <span className="text-teal-300">القسم النظري (Lectures)</span>
                        <span>·</span>
                        <span className="text-indigo-300">القسم العملي والمختبر (Practical / Lab)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
        </>
      )}

      {/* 4. MODALS */}

      {/* Conditional / Cascade Deletion Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-lg w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-amber-400">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="font-bold text-white text-sm">خيارات التعامل مع السجلات التابعة لـ "{deleteConfirmTarget.name}"</h3>
              </div>
              <button onClick={() => setDeleteConfirmTarget(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
              <p className="text-amber-300 font-semibold">{deleteConfirmTarget.reason}</p>
              <p className="text-slate-400">
                اختر الإجراء الإداري المناسب: يمكنك تعطيل العنصر بشكل آمن مع الإبقاء على بياناته التابعة، أو تنفيذ الحذف النهائي المتسلسل (Cascade Delete) مع كافة العناصر المرتبطة به.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 text-xs">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleSafeDeactivateFromModal}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold flex items-center gap-1.5"
              >
                <ToggleLeft className="w-4 h-4" />
                <span>التعطيل الآمن (isActive: false)</span>
              </button>

              <button
                type="button"
                onClick={() => executeConfirmedDelete(deleteConfirmTarget.type, deleteConfirmTarget.id, deleteConfirmTarget.name, true)}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>الحذف النهائي مع العناصر التابعة (Cascade Delete)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add University */}
      {showAddUnivModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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

      {/* Modal: Add Academic Program */}
      {showAddProgramModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">إضافة برنامج أكاديمي إلى {selectedCollege?.nameArabic}</h3>
              <button onClick={() => setShowAddProgramModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProgram} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم البرنامج بالعربية:</label>
                <input
                  type="text"
                  required
                  value={programForm.nameArabic}
                  onChange={(e) => setProgramForm({ ...programForm, nameArabic: e.target.value })}
                  placeholder="مثال: بكالوريوس الطب والجراحة العامة"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">اسم البرنامج بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={programForm.nameEnglish}
                  onChange={(e) => setProgramForm({ ...programForm, nameEnglish: e.target.value })}
                  placeholder="Bachelor of Medicine and Surgery (MBBS)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">النظام الدراسي:</label>
                  <select
                    value={programForm.studySystem}
                    onChange={(e) => setProgramForm({ ...programForm, studySystem: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="block">نظام البلوكات (Block)</option>
                    <option value="semester">نظام الفصول (Semester)</option>
                    <option value="traditional">نظام سنوي تقليدي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">عدد المستويات الاعتيادية:</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={programForm.totalRegularLevels}
                    onChange={(e) => setProgramForm({ ...programForm, totalRegularLevels: parseInt(e.target.value) || 7 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="addHasInternship"
                  checked={programForm.hasInternship}
                  onChange={(e) => setProgramForm({ ...programForm, hasInternship: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 bg-slate-950 border-slate-800"
                />
                <label htmlFor="addHasInternship" className="text-slate-300 font-semibold cursor-pointer">
                  يتضمن سنة امتياز سريرية
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddProgramModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500"
                >
                  حفظ البرنامج
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Study Level / Internship Stage */}
      {showAddLevelModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">إضافة مستوى دراسي أو سنة امتياز جديدة</h3>
              <button onClick={() => setShowAddLevelModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLevel} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان المستوى بالعربية:</label>
                <input
                  type="text"
                  required
                  value={levelForm.titleArabic}
                  onChange={(e) => setLevelForm({ ...levelForm, titleArabic: e.target.value })}
                  placeholder="مثال: المستوى الثامن أو سنة الامتياز السريرية"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان المستوى بالإنجليزية:</label>
                <input
                  type="text"
                  required
                  value={levelForm.titleEnglish}
                  onChange={(e) => setLevelForm({ ...levelForm, titleEnglish: e.target.value })}
                  placeholder="Level 8 / Clinical Internship"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">نوع المرحلة (stageType):</label>
                  <select
                    value={levelForm.stageType}
                    onChange={(e) => setLevelForm({ ...levelForm, stageType: e.target.value as StageType })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="regular">مستوى دراسي اعتيادي (Regular Level)</option>
                    <option value="internship">سنة الامتياز السريرية (Internship)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الترتيب (order):</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={levelForm.order}
                    onChange={(e) => setLevelForm({ ...levelForm, order: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">المدة بالأشهر (durationMonths):</label>
                <input
                  type="number"
                  min="1"
                  max="36"
                  value={levelForm.durationMonths}
                  onChange={(e) => setLevelForm({ ...levelForm, durationMonths: parseInt(e.target.value) || 9 })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddLevelModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-500"
                >
                  حفظ المستوى الدراسي
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Block */}
      {showAddPeriodModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="block text-slate-300 mb-1 font-semibold flex items-center justify-between">
                    <span>الساعات المعتمدة:</span>
                    <span className="text-[11px] text-teal-400 font-mono font-bold">
                      {Number(courseForm.creditHours) || 3} ساعات
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = Number(courseForm.creditHours) || 3;
                        setCourseForm({ ...courseForm, creditHours: Math.max(1, cur - 1) });
                      }}
                      className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center border border-slate-700 shrink-0 transition-colors"
                      title="تقليل الساعات"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={courseForm.creditHours !== undefined && courseForm.creditHours !== null ? courseForm.creditHours : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setCourseForm({ ...courseForm, creditHours: '' as any });
                        } else {
                          const parsed = parseInt(val, 10);
                          setCourseForm({
                            ...courseForm,
                            creditHours: isNaN(parsed) ? ('' as any) : parsed
                          });
                        }
                      }}
                      onBlur={() => {
                        const parsed = Number(courseForm.creditHours);
                        const safe = !isNaN(parsed) && parsed >= 1 ? Math.min(20, Math.floor(parsed)) : 3;
                        setCourseForm({ ...courseForm, creditHours: safe });
                      }}
                      className="w-full text-center px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold focus:outline-none focus:border-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = Number(courseForm.creditHours) || 3;
                        setCourseForm({ ...courseForm, creditHours: Math.min(20, cur + 1) });
                      }}
                      className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center border border-slate-700 shrink-0 transition-colors"
                      title="زيادة الساعات"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Quick Selectors */}
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {[1, 2, 3, 4, 5, 6].map((hrs) => {
                      const isSelected = Number(courseForm.creditHours) === hrs;
                      return (
                        <button
                          key={hrs}
                          type="button"
                          onClick={() => setCourseForm({ ...courseForm, creditHours: hrs })}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all ${
                            isSelected
                              ? 'bg-teal-600 text-white font-bold shadow-sm'
                              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          {hrs} س
                        </button>
                      );
                    })}
                  </div>
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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
                  value={editingCollege.code || ''}
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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
                  <label className="block text-slate-300 mb-1 font-semibold">المرحلة الأكاديمية (stageType):</label>
                  <select
                    value={editingLevel.stageType}
                    onChange={(e) => setEditingLevel({ ...editingLevel, stageType: e.target.value as StageType })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="regular">مستوى دراسي اعتيادي (Regular Level)</option>
                    <option value="internship">سنة الامتياز السريرية (Internship)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الترتيب:</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={editingLevel.order}
                    onChange={(e) => setEditingLevel({ ...editingLevel, order: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">المدة بالأشهر (durationMonths):</label>
                <input
                  type="number"
                  min="1"
                  max="36"
                  value={editingLevel.durationMonths || (editingLevel.stageType === 'internship' ? 12 : 9)}
                  onChange={(e) => setEditingLevel({ ...editingLevel, durationMonths: parseInt(e.target.value) || 9 })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 font-mono"
                />
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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
                  value={editingPeriod.titleEnglish || ''}
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
                    value={editingPeriod.code || ''}
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
        <div className="fixed inset-0 z-50 bg-black/75 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 space-y-4 shadow-2xl">
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
                  value={editingCourse.titleEnglish || ''}
                  onChange={(e) => setEditingCourse({ ...editingCourse, titleEnglish: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500 font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="block text-slate-300 mb-1 font-semibold flex items-center justify-between">
                    <span>الساعات المعتمدة:</span>
                    <span className="text-[11px] text-indigo-400 font-mono font-bold">
                      {Number(editingCourse.creditHours) || 3} ساعات
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = Number(editingCourse.creditHours) || 3;
                        setEditingCourse({ ...editingCourse, creditHours: Math.max(1, cur - 1) });
                      }}
                      className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center border border-slate-700 shrink-0 transition-colors"
                      title="تقليل الساعات"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={editingCourse.creditHours !== undefined && editingCourse.creditHours !== null ? editingCourse.creditHours : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setEditingCourse({ ...editingCourse, creditHours: '' as any });
                        } else {
                          const parsed = parseInt(val, 10);
                          setEditingCourse({
                            ...editingCourse,
                            creditHours: isNaN(parsed) ? ('' as any) : parsed
                          });
                        }
                      }}
                      onBlur={() => {
                        const parsed = Number(editingCourse.creditHours);
                        const safe = !isNaN(parsed) && parsed >= 1 ? Math.min(20, Math.floor(parsed)) : 3;
                        setEditingCourse({ ...editingCourse, creditHours: safe });
                      }}
                      className="w-full text-center px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = Number(editingCourse.creditHours) || 3;
                        setEditingCourse({ ...editingCourse, creditHours: Math.min(20, cur + 1) });
                      }}
                      className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 flex items-center justify-center border border-slate-700 shrink-0 transition-colors"
                      title="زيادة الساعات"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {/* Quick Selectors */}
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {[1, 2, 3, 4, 5, 6].map((hrs) => {
                      const isSelected = Number(editingCourse.creditHours) === hrs;
                      return (
                        <button
                          key={hrs}
                          type="button"
                          onClick={() => setEditingCourse({ ...editingCourse, creditHours: hrs })}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all ${
                            isSelected
                              ? 'bg-indigo-600 text-white font-bold shadow-sm'
                              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          {hrs} س
                        </button>
                      );
                    })}
                  </div>
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
