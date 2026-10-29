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
  Archive,
  ArchiveRestore,
  UserCheck
} from 'lucide-react';
import { 
  University, 
  College, 
  AcademicProgram, 
  StudyLevel, 
  StudyPeriod, 
  CourseOffering,
  CourseInstructor,
  StageType,
  UserRole
} from '../../types/umed.ts';
import {
  fetchCourseInstructors,
  saveCourseInstructor
} from '../../services/batchGovernanceService.ts';
import { 
  fetchUniversities, 
  subscribeToUniversities,
  subscribeToAcademicHierarchy,
  getCachedCollection,
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
  archiveStudyPeriod,
  fetchArchivedStudyPeriods,
  fetchCourseOfferings, 
  saveCourseOffering,
  toggleCourseOfferingActive,
  deleteCourseOffering,
  checkEntityDependencies,
  seedDarAlSalamToFirestore,
  getUserAcademicContext,
  saveUserAcademicContext
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
  const [batchInstructors, setBatchInstructors] = useState<CourseInstructor[]>([]);

  // UI State
  const [activeViewMode, setActiveViewMode] = useState<'hierarchy' | 'archive'>('hierarchy');
  const [archivedPeriods, setArchivedPeriods] = useState<StudyPeriod[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [seedLoading, setSeedLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Standalone Popup Selector Modal State (Replaces inline crowded lists)
  const [activePopupList, setActivePopupList] = useState<'university' | 'college' | 'program' | 'level' | 'period' | null>(null);

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
    creditHours: 3,
    instructorId: '',
    instructorNameArabic: ''
  });

  // Inline Quick Course Add Form State
  const [quickCourseForm, setQuickCourseForm] = useState({
    titleArabic: '',
    code: '',
    creditHours: 3,
    instructorNameArabic: ''
  });
  const [quickCourseSaving, setQuickCourseSaving] = useState(false);

  // Load universities on mount (Strictly scoped for University Owner & Batch Rep + Saved User Context)
  const loadUniversities = async () => {
    setLoading(true);
    try {
      const savedCtx = getUserAcademicContext();
      const allUnivs = await fetchUniversities();
      const univs =
        isUnivScoped && assignedUniversityId
          ? allUnivs.filter(u => u.id === assignedUniversityId)
          : allUnivs;
      const finalUnivs = univs.length > 0 ? univs : allUnivs;
      setUniversities(finalUnivs);
      if (finalUnivs.length > 0) {
        setSelectedUniversity(prev =>
          (prev && finalUnivs.find(u => u.id === prev.id)) ||
          finalUnivs.find(u => u.id === savedCtx.universityId) ||
          finalUnivs[0]
        );
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
      const savedCtx = getUserAcademicContext();
      const univs =
        isUnivScoped && assignedUniversityId
          ? allUnivs.filter(u => u.id === assignedUniversityId)
          : allUnivs;
      const finalUnivs = univs.length > 0 ? univs : allUnivs;
      setUniversities(finalUnivs);
      if (finalUnivs.length > 0) {
        setSelectedUniversity(prev =>
          (prev && finalUnivs.find(u => u.id === prev.id)) ||
          finalUnivs.find(u => u.id === savedCtx.universityId) ||
          finalUnivs[0]
        );
      }
    });
    return () => unsub();
  }, [userRole, assignedUniversityId]);

  // Cascading Load: Colleges when University changes
  useEffect(() => {
    if (selectedUniversity) {
      const savedCtx = getUserAcademicContext();
      saveUserAcademicContext({
        universityId: selectedUniversity.id,
        universityName: selectedUniversity.nameArabic
      });
      fetchColleges(selectedUniversity.id).then((cols) => {
        setColleges(cols);
        setSelectedCollege(prev =>
          (prev && cols.find(c => c.id === prev.id)) ||
          cols.find(c => c.id === savedCtx.collegeId) ||
          (cols.length > 0 ? cols[0] : null)
        );
      });
    } else {
      setColleges([]);
      setSelectedCollege(null);
    }
  }, [selectedUniversity]);

  // Cascading Load: Programs when College changes
  useEffect(() => {
    if (selectedCollege) {
      const savedCtx = getUserAcademicContext();
      saveUserAcademicContext({
        collegeId: selectedCollege.id,
        collegeName: selectedCollege.nameArabic
      });
      fetchPrograms(selectedCollege.id).then((progs) => {
        setPrograms(progs);
        setSelectedProgram(prev =>
          (prev && progs.find(p => p.id === prev.id)) ||
          progs.find(p => p.id === savedCtx.programId) ||
          (progs.length > 0 ? progs[0] : null)
        );
      });
    } else {
      setPrograms([]);
      setSelectedProgram(null);
    }
  }, [selectedCollege]);

  // Cascading Load: Study Levels when Program changes (Strictly locked to batch level for Batch Rep + Saved User Context)
  useEffect(() => {
    if (selectedProgram) {
      const savedCtx = getUserAcademicContext();
      saveUserAcademicContext({
        programId: selectedProgram.id,
        programName: selectedProgram.nameArabic
      });
      fetchStudyLevels(selectedProgram.id).then((lvls) => {
        const scopedLvls =
          isBatchScoped && assignedStudyLevelId
            ? lvls.filter(l => l.id === assignedStudyLevelId)
            : lvls;
        const finalLvls = scopedLvls.length > 0 ? scopedLvls : lvls;
        setStudyLevels(finalLvls);
        setSelectedLevel(prev =>
          (prev && finalLvls.find(l => l.id === prev.id)) ||
          finalLvls.find(l => l.id === savedCtx.studyLevelId) ||
          (finalLvls.length > 0 ? finalLvls[0] : null)
        );
      });
    } else {
      setStudyLevels([]);
      setSelectedLevel(null);
    }
  }, [selectedProgram, isBatchScoped, assignedStudyLevelId]);

  // Cascading Load: Study Periods / Blocks when Level changes
  useEffect(() => {
    if (selectedLevel) {
      const savedCtx = getUserAcademicContext();
      saveUserAcademicContext({
        studyLevelId: selectedLevel.id,
        studyLevelName: selectedLevel.titleArabic
      });
      fetchStudyPeriods(selectedLevel.id).then((periods) => {
        const activeOnly = periods.filter(p => !p.isArchived);
        setStudyPeriods(activeOnly);
        setSelectedPeriod(prev =>
          (prev && activeOnly.find(p => p.id === prev.id)) ||
          activeOnly.find(p => p.id === savedCtx.studyPeriodId) ||
          (activeOnly.length > 0 ? activeOnly[0] : null)
        );
      });
      fetchArchivedStudyPeriods(selectedLevel.id).then((archived) => {
        setArchivedPeriods(archived);
      });
      if (selectedUniversity) {
        fetchCourseInstructors({
          universityId: selectedUniversity.id,
          studyLevelId: selectedLevel.id
        }).then(setBatchInstructors).catch(() => setBatchInstructors([]));
      }
    } else {
      setStudyPeriods([]);
      setSelectedPeriod(null);
      setArchivedPeriods([]);
      setBatchInstructors([]);
    }
  }, [selectedLevel, selectedUniversity]);

  // Cascading Load: Courses when Period changes
  useEffect(() => {
    if (selectedPeriod) {
      saveUserAcademicContext({
        studyPeriodId: selectedPeriod.id,
        studyPeriodName: selectedPeriod.titleArabic
      });
      fetchCourseOfferings(selectedPeriod.id).then((crs) => {
        setCourses(crs);
      });
    } else {
      setCourses([]);
    }
  }, [selectedPeriod]);

  // Real-Time Synchronization for Blocks (studyPeriods) and Courses (courseOfferings)
  useEffect(() => {
    const unsub = subscribeToAcademicHierarchy(() => {
      if (selectedLevel) {
        const allPeriods = getCachedCollection<StudyPeriod>('studyPeriods').filter(
          (p) => p.studyLevelId === selectedLevel.id
        );
        const activeOnly = allPeriods.filter((p) => !p.isArchived).sort((a, b) => (a.order || 0) - (b.order || 0));
        const archivedOnly = allPeriods.filter((p) => !!p.isArchived).sort((a, b) => (a.order || 0) - (b.order || 0));
        setStudyPeriods(activeOnly);
        setArchivedPeriods(archivedOnly);
        setSelectedPeriod((prev) => {
          if (prev) {
            const match = activeOnly.find((p) => p.id === prev.id);
            if (match) return match;
          }
          return activeOnly.length > 0 ? activeOnly[0] : null;
        });
      }
      if (selectedPeriod) {
        const liveCourses = getCachedCollection<CourseOffering>('courseOfferings').filter(
          (c) => c.studyPeriodId === selectedPeriod.id
        );
        setCourses(liveCourses);
      }
    });
    return () => unsub();
  }, [selectedLevel?.id, selectedPeriod?.id]);

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
        setArchivedPeriods(prev => prev.filter(p => p.id !== id));
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

  // Archive / Restore Study Period Handler
  const handleArchivePeriod = async (periodId: string, archive: boolean) => {
    try {
      await archiveStudyPeriod(periodId, archive);
      if (archive) {
        const remaining = studyPeriods.filter(p => p.id !== periodId);
        setStudyPeriods(remaining);
        if (selectedPeriod?.id === periodId) {
          setSelectedPeriod(remaining.length > 0 ? remaining[0] : null);
        }
        if (selectedLevel) {
          const updatedArchived = await fetchArchivedStudyPeriods(selectedLevel.id, selectedUniversity?.id);
          setArchivedPeriods(updatedArchived);
        }
        setStatusMessage({
          type: 'success',
          text: 'تم نقل البلوك إلى الأرشيف الأكاديمي بنجاح، واختفى من قوائم العمل النشطة مع بقاء سجلاته في الأرشيف.'
        });
      } else {
        setArchivedPeriods(prev => prev.filter(p => p.id !== periodId));
        if (selectedLevel) {
          const periods = await fetchStudyPeriods(selectedLevel.id, selectedUniversity?.id);
          const activeOnly = periods.filter(p => !p.isArchived);
          setStudyPeriods(activeOnly);
        }
        setStatusMessage({
          type: 'success',
          text: 'تمت استعادة البلوك من الأرشيف بنجاح وإعادته إلى البلوكات الدراسية النشطة.'
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشلت معالجة الأرشفة' });
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
      const trimmedInstructorName = (editingCourse.instructorNameArabic || '').trim();
      let resolvedInstructorId = editingCourse.instructorId || '';

      if (trimmedInstructorName && selectedUniversity && selectedLevel) {
        const existingInst = batchInstructors.find(
          (inst) =>
            inst.id === resolvedInstructorId ||
            inst.instructorNameArabic.trim() === trimmedInstructorName ||
            `${inst.academicTitle} ${inst.instructorNameArabic}`.trim() === trimmedInstructorName
        );
        if (existingInst) {
          resolvedInstructorId = existingInst.id;
        } else {
          const newInstId = `inst-${Date.now().toString(36)}`;
          const newInst: CourseInstructor = {
            id: newInstId,
            universityId: selectedUniversity.id,
            studyLevelId: selectedLevel.id,
            studyPeriodId: editingCourse.studyPeriodId || selectedPeriod?.id,
            courseOfferingId: editingCourse.id,
            courseTitleArabic: editingCourse.titleArabic,
            instructorNameArabic: trimmedInstructorName.replace(/^(أ\.د\.|أ\.م\.د\.|د\.)\s*/, ''),
            academicTitle: trimmedInstructorName.startsWith('أ.د.')
              ? 'أ.د.'
              : trimmedInstructorName.startsWith('أ.م.د.')
              ? 'أ.م.د.'
              : 'د.',
            teachingType: 'both',
            createdBy: userRole,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          const savedInst = await saveCourseInstructor(newInst, userRole);
          setBatchInstructors((prev) => [...prev.filter((i) => i.id !== savedInst.id), savedInst]);
          resolvedInstructorId = savedInst.id;
        }
      }

      const updatedCourse: CourseOffering = {
        ...editingCourse,
        creditHours,
        instructorId: resolvedInstructorId || undefined,
        instructorNameArabic: trimmedInstructorName || undefined
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
      const trimmedInstructorName = (courseForm.instructorNameArabic || '').trim();
      let resolvedInstructorId = courseForm.instructorId || '';

      if (trimmedInstructorName) {
        const existingInst = batchInstructors.find(
          (inst) =>
            inst.id === resolvedInstructorId ||
            inst.instructorNameArabic.trim() === trimmedInstructorName ||
            `${inst.academicTitle} ${inst.instructorNameArabic}`.trim() === trimmedInstructorName
        );
        if (existingInst) {
          resolvedInstructorId = existingInst.id;
        } else {
          const newInstId = `inst-${Date.now().toString(36)}`;
          const newInst: CourseInstructor = {
            id: newInstId,
            universityId: selectedUniversity.id,
            studyLevelId: selectedLevel.id,
            studyPeriodId: selectedPeriod.id,
            courseOfferingId: id,
            courseTitleArabic: courseForm.titleArabic,
            instructorNameArabic: trimmedInstructorName.replace(/^(أ\.د\.|أ\.م\.د\.|د\.)\s*/, ''),
            academicTitle: trimmedInstructorName.startsWith('أ.د.')
              ? 'أ.د.'
              : trimmedInstructorName.startsWith('أ.م.د.')
              ? 'أ.م.د.'
              : 'د.',
            teachingType: 'both',
            createdBy: userRole,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          const savedInst = await saveCourseInstructor(newInst, userRole);
          setBatchInstructors((prev) => [...prev.filter((i) => i.id !== savedInst.id), savedInst]);
          resolvedInstructorId = savedInst.id;
        }
      }

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
        instructorId: resolvedInstructorId || undefined,
        instructorNameArabic: trimmedInstructorName || undefined,
        isActive: true
      };
      await saveCourseOffering(newCourse);
      setCourses([...courses, newCourse]);
      setShowAddCourseModal(false);
      setCourseForm({
        titleArabic: '',
        titleEnglish: '',
        code: '',
        creditHours: 3,
        instructorId: '',
        instructorNameArabic: ''
      });
      setStatusMessage({ type: 'success', text: `تمت إضافة مقرر ${newCourse.titleArabic} بنجاح (${creditHours} ساعات معتمدة)` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleQuickCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod || !selectedLevel || !selectedUniversity) return;
    const trimmedTitle = quickCourseForm.titleArabic.trim();
    if (!trimmedTitle) return;

    setQuickCourseSaving(true);
    try {
      const id = `crs-${Date.now().toString(36)}`;
      const rawHours = Number(quickCourseForm.creditHours);
      const creditHours = !isNaN(rawHours) && rawHours >= 1 ? Math.min(Math.floor(rawHours), 20) : 3;
      const autoCode =
        quickCourseForm.code.trim().toUpperCase() ||
        `MED-${courses.length + 101}`;
      const trimmedInstructorName = quickCourseForm.instructorNameArabic.trim();
      let resolvedInstructorId = '';

      if (trimmedInstructorName) {
        const existingInst = batchInstructors.find(
          (inst) =>
            inst.instructorNameArabic.trim() === trimmedInstructorName ||
            `${inst.academicTitle} ${inst.instructorNameArabic}`.trim() === trimmedInstructorName
        );
        if (existingInst) {
          resolvedInstructorId = existingInst.id;
        } else {
          const newInstId = `inst-${Date.now().toString(36)}`;
          const newInst: CourseInstructor = {
            id: newInstId,
            universityId: selectedUniversity.id,
            studyLevelId: selectedLevel.id,
            studyPeriodId: selectedPeriod.id,
            courseOfferingId: id,
            courseTitleArabic: trimmedTitle,
            instructorNameArabic: trimmedInstructorName.replace(/^(أ\.د\.|أ\.م\.د\.|د\.)\s*/, ''),
            academicTitle: trimmedInstructorName.startsWith('أ.د.')
              ? 'أ.د.'
              : trimmedInstructorName.startsWith('أ.م.د.')
              ? 'أ.م.د.'
              : 'د.',
            teachingType: 'both',
            createdBy: userRole,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          const savedInst = await saveCourseInstructor(newInst, userRole);
          setBatchInstructors((prev) => [...prev.filter((i) => i.id !== savedInst.id), savedInst]);
          resolvedInstructorId = savedInst.id;
        }
      }

      const newCourse: CourseOffering = {
        id,
        studyPeriodId: selectedPeriod.id,
        studyLevelId: selectedLevel.id,
        curriculumVersionId: 'cur-dar-2024',
        universityId: selectedUniversity.id,
        titleArabic: trimmedTitle,
        titleEnglish: '',
        code: autoCode,
        creditHours,
        instructorId: resolvedInstructorId || undefined,
        instructorNameArabic: trimmedInstructorName || undefined,
        isActive: true
      };

      await saveCourseOffering(newCourse);
      setCourses((prev) => [...prev, newCourse]);
      setQuickCourseForm({
        titleArabic: '',
        code: '',
        creditHours: 3,
        instructorNameArabic: ''
      });
      setStatusMessage({
        type: 'success',
        text: `تمت الإضافة السريعة للمقرر "${newCourse.titleArabic}" (${autoCode}) بنجاح`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'تعذر إضافة المقرر السريع' });
    } finally {
      setQuickCourseSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Compact Header Bar & Archive Toggle (No duplicate hierarchy tab or seed banner) */}
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-3 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black text-[var(--text-primary)]">
              إدارة الهيكل الأكاديمي، البلوكات، والمقررات الدراسية
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              إدارة الجامعات، المستويات الدراسية، البلوكات، المقررات، ودكاترة المواد النظري والعملي
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedUniversity && (
            <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-color)]">
              <Building2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>المؤسسة: <strong className="text-[var(--text-primary)]">{selectedUniversity.nameArabic}</strong></span>
            </div>
          )}

          <button
            onClick={() => {
              if (activeViewMode === 'archive') {
                setActiveViewMode('hierarchy');
              } else {
                setActiveViewMode('archive');
                if (selectedLevel) {
                  fetchArchivedStudyPeriods(selectedLevel.id, selectedUniversity?.id).then(setArchivedPeriods);
                }
              }
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
              activeViewMode === 'archive'
                ? 'bg-teal-600 text-white border-teal-500 shadow-md'
                : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-amber-500/50'
            }`}
          >
            {activeViewMode === 'archive' ? (
              <>
                <Layers className="w-4 h-4 shrink-0" />
                <span>العودة للهيكل الأكاديمي</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4 text-amber-400 shrink-0" />
                <span>الأرشيف الأكاديمي</span>
                {archivedPeriods.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                    {archivedPeriods.length}
                  </span>
                )}
              </>
            )}
          </button>
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

      {activeViewMode === 'archive' ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                <Archive className="w-4 h-4" />
                <span>الأرشيف الأكاديمي الرقمي</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white mt-1">
                سجلات البلوكات والمقررات المؤرشفة
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                البلوكات المؤرشفة معزولة تماماً عن مولد الاختبارات والمصادر النشطة ولكنها تظل محفوظة للطلاب كمرجع دراسي عند الحاجة. يمكنك استعادتها للخدمة أو تنفيذ حذف نهائي شامل مع كافة التبعات.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedLevel) {
                    fetchArchivedStudyPeriods(selectedLevel.id, selectedUniversity?.id).then(setArchivedPeriods);
                  }
                }}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحديث الأرشيف</span>
              </button>
            </div>
          </div>

          {archivedPeriods.length === 0 ? (
            <div className="p-12 text-center bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
              <Archive className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-slate-300">لا توجد بلوكات دراسية مؤرشفة حالياً</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                عند أرشفة أي بلوك غير مستمر من واجهة البلوكات، سيتم إخراجه فوراً من العمليات النشطة والاحتفاظ به هنا كأرشيف مع إمكانية استعادته بنقرة واحدة.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {archivedPeriods.map((period) => (
                <div
                  key={period.id}
                  className="p-4 bg-slate-950 border border-amber-900/30 hover:border-amber-500/40 rounded-xl flex flex-col justify-between gap-4 transition-all"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300 font-mono text-[11px] font-bold">
                        {period.code || 'BLOCK'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60 text-[10px] font-bold flex items-center gap-1">
                        <Archive className="w-3 h-3" />
                        <span>مؤرشف</span>
                      </span>
                    </div>

                    <div className="font-bold text-white text-sm">
                      {period.titleArabic}
                    </div>
                    {period.titleEnglish && (
                      <div className="text-xs text-slate-400 font-mono" dir="ltr">
                        {period.titleEnglish}
                      </div>
                    )}
                    {period.archivedAt && (
                      <div className="text-[10px] text-slate-500">
                        تاريخ الأرشفة: {new Date(period.archivedAt).toLocaleDateString('ar-YE', { dateStyle: 'medium' })}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-900 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleArchivePeriod(period.id, false)}
                      className="flex-1 py-2 px-3 rounded-xl bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" />
                      <span>استعادة للخدمة النشطة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAttemptDelete('period', period.id, period.titleArabic, period.isActive)}
                      className="py-2 px-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-200 text-xs font-bold flex items-center gap-1.5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف نهائي</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 1.5 Unified Interactive Breadcrumb Bar for Instant Context Switching */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
              <span className="text-[11px] font-bold text-slate-400 ml-1">المسار الأكاديمي النشط:</span>

              <button
                type="button"
                onClick={() => setActivePopupList('university')}
                className="px-2.5 py-1.5 rounded-xl bg-teal-950/50 hover:bg-teal-900/60 border border-teal-500/40 text-teal-300 font-bold flex items-center gap-1.5 transition-colors"
                title="تغيير الجامعة"
              >
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span>{selectedUniversity?.nameArabic || 'اختر الجامعة'}</span>
                <span className="text-[10px] opacity-75">▾</span>
              </button>

              <span className="text-slate-600 font-bold">←</span>

              <button
                type="button"
                onClick={() => setActivePopupList('college')}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-500/40 text-indigo-300 font-bold flex items-center gap-1.5 transition-colors"
                title="تغيير الكلية"
              >
                <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                <span>{selectedCollege?.nameArabic || 'اختر الكلية'}</span>
                <span className="text-[10px] opacity-75">▾</span>
              </button>

              <span className="text-slate-600 font-bold">←</span>

              <button
                type="button"
                onClick={() => setActivePopupList('program')}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-1.5 transition-colors"
                title="تغيير التخصص / البرنامج"
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>{selectedProgram?.nameArabic || 'اختر التخصص'}</span>
                <span className="text-[10px] opacity-75">▾</span>
              </button>

              <span className="text-slate-600 font-bold">←</span>

              <button
                type="button"
                onClick={() => setActivePopupList('level')}
                className="px-2.5 py-1.5 rounded-xl bg-amber-950/50 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 font-bold flex items-center gap-1.5 transition-colors"
                title="تغيير المستوى الدراسي"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>{selectedLevel?.titleArabic || 'اختر المستوى'}</span>
                <span className="text-[10px] opacity-75">▾</span>
              </button>

              {selectedLevel && (
                <>
                  <span className="text-slate-600 font-bold">←</span>
                  <button
                    type="button"
                    onClick={() => setActivePopupList('period')}
                    className="px-2.5 py-1.5 rounded-xl bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 font-bold flex items-center gap-1.5 transition-colors"
                    title="تغيير البلوك أو الفصل الدراسي"
                  >
                    <span>{selectedPeriod ? `${selectedPeriod.titleArabic} (${selectedPeriod.code})` : 'اختر البلوك الدراسي'}</span>
                    <span className="text-[10px] opacity-75">▾</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-bold">
                المقررات في البلوك الحالي: <strong className="text-teal-400 font-mono">{courses.length}</strong>
              </span>
            </div>
          </div>

          {/* 2. Main Title Cards for Academic Hierarchy (Click any card to open its Standalone Popup Selector/Manager) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Main Card 1: Active University */}
            <div className="bg-slate-900/90 border border-slate-800 hover:border-teal-500/50 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg transition-all">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-400">
                    <Building2 className="w-4 h-4 shrink-0" />
                    <span>الجامعة النشطة ({universities.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddUnivModal(true)}
                    className="px-3 py-1.5 min-h-[36px] rounded-xl bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة جامعة</span>
                  </button>
                </div>

                {selectedUniversity ? (
                  <div
                    onClick={() => setActivePopupList('university')}
                    className="p-4 rounded-xl bg-teal-950/30 border border-teal-500/50 cursor-pointer hover:bg-teal-950/50 hover:border-teal-400 transition-all space-y-2 group"
                    title="اضغط لفتح نافذة جميع الجامعات"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-900 text-teal-300 font-bold border border-teal-500/30">
                        {selectedUniversity.type === 'private' ? 'جامعة خاصة' : 'جامعة حكومية'}
                      </span>
                      <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        نشط
                      </span>
                    </div>
                    <div className="text-base font-black text-white group-hover:text-teal-200 transition-colors">{selectedUniversity.nameArabic}</div>
                    <div className="text-xs text-slate-400 truncate" dir="ltr">{selectedUniversity.nameEnglish}</div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs text-center py-6">لا توجد جامعة محددة</div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActivePopupList('university')}
                  className="flex-1 py-2.5 px-3 min-h-[42px] rounded-xl bg-slate-800 hover:bg-teal-600 text-teal-300 hover:text-white text-xs font-bold transition-colors text-center flex items-center justify-center gap-1.5"
                >
                  <span>تبديل / إدارة الجامعات ({universities.length})</span>
                  <span>▾</span>
                </button>
                {selectedUniversity && (
                  <button
                    type="button"
                    onClick={() => setEditingUniv(selectedUniversity)}
                    className="p-2.5 min-h-[42px] min-w-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                    title="تعديل الجامعة الحالية"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Main Card 2: Active College */}
            <div className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg transition-all">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
                    <GraduationCap className="w-4 h-4 shrink-0" />
                    <span>الكلية النشطة ({colleges.length})</span>
                  </div>
                  {selectedUniversity && (
                    <button
                      type="button"
                      onClick={() => setShowAddCollegeModal(true)}
                      className="px-3 py-1.5 min-h-[36px] rounded-xl bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة كلية</span>
                    </button>
                  )}
                </div>

                {selectedCollege ? (
                  <div
                    onClick={() => setActivePopupList('college')}
                    className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/50 cursor-pointer hover:bg-indigo-950/50 hover:border-indigo-400 transition-all space-y-2 group"
                    title="اضغط لفتح نافذة الكليات"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-900 text-indigo-300 font-mono font-bold border border-indigo-500/30">
                        {selectedCollege.code || 'MED'}
                      </span>
                      <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        نشط
                      </span>
                    </div>
                    <div className="text-base font-black text-white group-hover:text-indigo-200 transition-colors">{selectedCollege.nameArabic}</div>
                    <div className="text-xs text-slate-400 truncate" dir="ltr">{selectedCollege.nameEnglish}</div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs text-center py-6">لا توجد كلية مسجلة</div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActivePopupList('college')}
                  className="flex-1 py-2.5 px-3 min-h-[42px] rounded-xl bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-bold transition-colors text-center flex items-center justify-center gap-1.5"
                >
                  <span>تبديل / إدارة الكليات ({colleges.length})</span>
                  <span>▾</span>
                </button>
                {selectedCollege && (
                  <button
                    type="button"
                    onClick={() => setEditingCollege(selectedCollege)}
                    className="p-2.5 min-h-[42px] min-w-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                    title="تعديل الكلية الحالية"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Main Card 3: Active Program / Specialty */}
            <div className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg transition-all">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <BookOpen className="w-4 h-4 shrink-0" />
                    <span>التخصص / البرنامج ({programs.length})</span>
                  </div>
                  {selectedCollege && (
                    <button
                      type="button"
                      onClick={() => setShowAddProgramModal(true)}
                      className="px-3 py-1.5 min-h-[36px] rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة برنامج</span>
                    </button>
                  )}
                </div>

                {selectedProgram ? (
                  <div
                    onClick={() => setActivePopupList('program')}
                    className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/50 cursor-pointer hover:bg-emerald-950/50 hover:border-emerald-400 transition-all space-y-2 group"
                    title="اضغط لفتح نافذة البرامج والتخصصات"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-900 text-emerald-300 font-bold border border-emerald-500/30">
                        {selectedProgram.studySystem === 'block' ? 'نظام البلوكات' : 'نظام الفصول'}
                      </span>
                      <span className="text-[11px] text-amber-300 font-bold">{selectedProgram.totalRegularLevels} سنوات</span>
                    </div>
                    <div className="text-base font-black text-white group-hover:text-emerald-200 transition-colors">{selectedProgram.nameArabic}</div>
                    <div className="text-xs text-slate-400 truncate" dir="ltr">{selectedProgram.nameEnglish}</div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs text-center py-6">لا يوجد تخصص محدد</div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActivePopupList('program')}
                  className="flex-1 py-2.5 px-3 min-h-[42px] rounded-xl bg-slate-800 hover:bg-emerald-600 text-emerald-300 hover:text-white text-xs font-bold transition-colors text-center flex items-center justify-center gap-1.5"
                >
                  <span>تبديل / إدارة التخصصات ({programs.length})</span>
                  <span>▾</span>
                </button>
                {selectedProgram && (
                  <button
                    type="button"
                    onClick={() => setEditingProgram(selectedProgram)}
                    className="p-2.5 min-h-[42px] min-w-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                    title="تعديل البرنامج الحالي"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Main Card 4: Active Study Level / Year */}
            <div className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-lg transition-all">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <Layers className="w-4 h-4 shrink-0" />
                    <span>المستوى الدراسي النشط ({studyLevels.length})</span>
                  </div>
                  {selectedProgram && (
                    <button
                      type="button"
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
                      className="px-3 py-1.5 min-h-[36px] rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة مستوى</span>
                    </button>
                  )}
                </div>

                {selectedLevel ? (
                  <div
                    onClick={() => setActivePopupList('level')}
                    className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/50 cursor-pointer hover:bg-amber-950/50 hover:border-amber-400 transition-all space-y-2 group"
                    title="اضغط لفتح نافذة جميع المستويات والسنوات الدراسية"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-900 text-amber-300 font-bold border border-amber-500/30">
                        {selectedLevel.stageType === 'internship' ? 'سنة الامتياز السريري' : `المستوى ${selectedLevel.order}`}
                      </span>
                      <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        نشط
                      </span>
                    </div>
                    <div className="text-base font-black text-white group-hover:text-amber-200 transition-colors">{selectedLevel.titleArabic}</div>
                    <div className="text-xs text-slate-400 truncate" dir="ltr">{selectedLevel.titleEnglish}</div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs text-center py-6">لا يوجد مستوى محدد</div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActivePopupList('level')}
                  className="flex-1 py-2.5 px-3 min-h-[42px] rounded-xl bg-slate-800 hover:bg-amber-600 text-amber-300 hover:text-white text-xs font-bold transition-colors text-center flex items-center justify-center gap-1.5"
                >
                  <span>تبديل / إدارة المستويات ({studyLevels.length})</span>
                  <span>▾</span>
                </button>
                {selectedLevel && (
                  <button
                    type="button"
                    onClick={() => setEditingLevel(selectedLevel)}
                    className="p-2.5 min-h-[42px] min-w-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                    title="تعديل المستوى الحالي"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 3. Selected Level Block Header & Courses Explorer */}
          {selectedLevel && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
              {/* Active Block Main Header Bar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      {selectedLevel.titleArabic}
                    </span>
                    <span className="text-slate-500 font-bold">←</span>
                    <button
                      type="button"
                      onClick={() => setActivePopupList('period')}
                      className="text-sm sm:text-base font-black text-white hover:text-teal-300 flex items-center gap-2 transition-colors flex-wrap"
                    >
                      <span>{selectedPeriod ? `البلوك النشط: ${selectedPeriod.titleArabic} (${selectedPeriod.code})` : 'اختر البلوك الدراسي من النافذة المنبثقة'}</span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-teal-600 text-teal-300 hover:text-white text-xs font-bold transition-colors">
                        تبديل البلوك ({studyPeriods.length}) ▾
                      </span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    يتم عرض المقررات الخاصة بالبلوك والمستوى المختارين فقط لمنع تداخل مواد السنوات الأخرى.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActivePopupList('period')}
                    className="py-2.5 px-3.5 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-bold border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>قائمة البلوكات ({studyPeriods.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodForm({
                        titleArabic: '',
                        titleEnglish: '',
                        code: '',
                        order: studyPeriods.length + 1
                      });
                      setShowAddPeriodModal(true);
                    }}
                    className="py-2.5 px-3.5 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-colors"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>{selectedLevel.stageType === 'internship' ? 'إضافة روتيشن' : 'إضافة بلوك'}</span>
                  </button>
                  {selectedPeriod && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowAddCourseModal(true)}
                        className="py-2.5 px-3.5 min-h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-colors"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <span>إضافة مقرر</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleArchivePeriod(selectedPeriod.id, true)}
                        className="py-2.5 px-3.5 min-h-[42px] rounded-xl bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 border border-amber-800/50 transition-colors"
                        title="أرشفة البلوك وإخفاؤه من العمليات النشطة"
                      >
                        <Archive className="w-4 h-4 shrink-0" />
                        <span>أرشفة البلوك</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline Quick Course Add Bar */}
              {selectedPeriod && (
                <form
                  onSubmit={handleQuickCreateCourse}
                  className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/90 border border-indigo-500/30 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-indigo-400" />
                      <span>إضافة سريعة لمقرر داخل ({selectedPeriod.titleArabic}) بضغطة واحدة</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddCourseModal(true)}
                      className="text-[11px] text-slate-400 hover:text-indigo-300 underline"
                    >
                      فتح النموذج التفصيلي المتقدم
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        required
                        value={quickCourseForm.titleArabic}
                        onChange={(e) => setQuickCourseForm({ ...quickCourseForm, titleArabic: e.target.value })}
                        placeholder="اسم المقرر بالعربية (مثال: علم وظائف الأعضاء) *"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-indigo-500 text-xs text-white outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={quickCourseForm.code}
                        onChange={(e) => setQuickCourseForm({ ...quickCourseForm, code: e.target.value })}
                        placeholder="رمز المقرر (اختياري)"
                        dir="ltr"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-indigo-500 text-xs text-white font-mono outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2">
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={quickCourseForm.creditHours}
                          onChange={(e) => setQuickCourseForm({ ...quickCourseForm, creditHours: Number(e.target.value) })}
                          className="w-full bg-transparent text-xs text-white font-mono outline-none"
                        />
                        <span className="text-[10px] text-slate-400 shrink-0 mr-1">ساعات</span>
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        value={quickCourseForm.instructorNameArabic}
                        onChange={(e) => setQuickCourseForm({ ...quickCourseForm, instructorNameArabic: e.target.value })}
                        placeholder="اسم الدكتور (اختياري)"
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 focus:border-indigo-500 text-xs text-white outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={quickCourseSaving || !quickCourseForm.titleArabic.trim()}
                        className="w-full h-full min-h-[36px] px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span>{quickCourseSaving ? 'جاري الإضافة...' : 'إضافة فورية'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Courses of the Active Block */}
              {!selectedPeriod ? (
                <div className="p-8 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-400 text-xs">
                  اضغط على "تبديل البلوك" أو "إضافة بلوك دراسي" لعرض وإدارة المقررات.
                </div>
              ) : courses.length === 0 ? (
                <div className="p-8 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-400 text-xs">
                  لا توجد مقررات مضافة في ({selectedPeriod.titleArabic}) حتى الآن. استخدم شريط الإضافة السريعة أعلاه أو اضغط "+ إضافة مقرر".
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {courses.map((course) => {
                    const matchedInst = batchInstructors.find(
                      (i) => i.id === course.instructorId || i.courseOfferingId === course.id
                    );
                    const displayInstructorName =
                      course.instructorNameArabic ||
                      (matchedInst ? `${matchedInst.academicTitle} ${matchedInst.instructorNameArabic}` : '');

                    return (
                      <div key={course.id} className="p-4 sm:p-5 bg-slate-950 rounded-2xl border border-slate-800 text-xs flex flex-col justify-between gap-3.5 hover:border-slate-700 transition-all overflow-hidden">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-teal-300 font-mono font-bold text-xs">
                                {course.code}
                              </span>
                              <span className="font-bold text-white text-sm sm:text-base break-words">{course.titleArabic}</span>
                              {course.titleEnglish && (
                                <span className="text-slate-400 text-xs break-all" dir="ltr">({course.titleEnglish})</span>
                              )}
                            </div>
                            <span className="text-slate-400 font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 shrink-0">{course.creditHours ?? 3} ساعات</span>
                          </div>

                          {displayInstructorName && (
                            <div className="flex items-center gap-1.5 text-[11px] text-teal-300 bg-teal-950/30 border border-teal-500/30 px-2.5 py-1 rounded-lg w-fit max-w-full">
                              <UserCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                              <span className="truncate">دكتور المقرر: <strong>{displayInstructorName}</strong></span>
                            </div>
                          )}
                        </div>

                        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
                          <span className={`text-xs font-bold flex items-center gap-1.5 ${course.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${course.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                            {course.isActive ? 'مقرر نشط' : 'مقرر معطل'}
                          </span>
                          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
                            <button
                              type="button"
                              onClick={() => setEditingCourse(course)}
                              className="text-slate-200 hover:text-white px-3 py-1.5 min-h-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 font-bold flex items-center justify-center gap-1.5 transition-colors flex-1 sm:flex-initial"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span>تعديل</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                toggleCourseOfferingActive(course.id, course.isActive).then(() => {
                                  setCourses(courses.map(c => c.id === course.id ? { ...c, isActive: !c.isActive } : c));
                                });
                              }}
                              className="text-slate-200 hover:text-white px-3 py-1.5 min-h-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 font-bold flex items-center justify-center gap-1.5 transition-colors flex-1 sm:flex-initial"
                            >
                              {course.isActive ? <ToggleRight className="w-4 h-4 text-emerald-400 shrink-0" /> : <ToggleLeft className="w-4 h-4 text-slate-500 shrink-0" />}
                              <span>{course.isActive ? 'تعطيل' : 'تفعيل'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAttemptDelete('course', course.id, course.titleArabic, course.isActive)}
                              className="text-rose-400 hover:text-rose-200 px-3 py-1.5 min-h-[38px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 font-bold flex items-center justify-center gap-1.5 transition-colors flex-1 sm:flex-initial"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span>حذف</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STANDALONE POPUP MODAL FOR UNIVERSITIES / COLLEGES / PROGRAMS / STUDY LEVELS / BLOCKS */}
          {activePopupList && (
            <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
              <div className="bg-slate-900 border border-teal-500/40 rounded-2xl max-w-2xl w-full max-h-[88dvh] flex flex-col shadow-2xl my-auto overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/90">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white">
                      {activePopupList === 'university' && `نافذة اختيار وإدارة الجامعات (${universities.length})`}
                      {activePopupList === 'college' && `نافذة اختيار وإدارة الكليات (${colleges.length})`}
                      {activePopupList === 'program' && `نافذة اختيار وإدارة البرامج والتخصصات (${programs.length})`}
                      {activePopupList === 'level' && `نافذة اختيار وإدارة المستويات والسنوات الدراسية (${studyLevels.length})`}
                      {activePopupList === 'period' && `نافذة اختيار وإدارة البلوكات والفترات الدراسية (${studyPeriods.length})`}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      انقر على أي عنصر لاعتماده كعنوان رئيسي نشط وحفظه في إعداداتك تلقائياً
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const target = activePopupList;
                        setActivePopupList(null);
                        if (target === 'university') setShowAddUnivModal(true);
                        if (target === 'college') setShowAddCollegeModal(true);
                        if (target === 'program') setShowAddProgramModal(true);
                        if (target === 'level') setShowAddLevelModal(true);
                        if (target === 'period') setShowAddPeriodModal(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة جديد</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePopupList(null)}
                      className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
                  {activePopupList === 'university' && universities.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => {
                        setSelectedUniversity(u);
                        setActivePopupList(null);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all text-xs flex flex-wrap items-center justify-between gap-3 ${
                        selectedUniversity?.id === u.id
                          ? 'bg-teal-500/20 border-teal-500 text-white shadow-md'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm sm:text-base">{u.nameArabic}</div>
                        <div className="text-xs text-slate-400 mt-0.5" dir="ltr">{u.nameEnglish}</div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { setActivePopupList(null); setEditingUniv(u); }}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-teal-400" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAttemptDelete('university', u.id, u.nameArabic, u.isActive)}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 text-rose-300 font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {activePopupList === 'college' && colleges.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCollege(c);
                        setActivePopupList(null);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all text-xs flex flex-wrap items-center justify-between gap-3 ${
                        selectedCollege?.id === c.id
                          ? 'bg-indigo-500/20 border-indigo-500 text-white shadow-md'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm sm:text-base">{c.nameArabic} ({c.code})</div>
                        <div className="text-xs text-slate-400 mt-0.5" dir="ltr">{c.nameEnglish}</div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { setActivePopupList(null); setEditingCollege(c); }}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAttemptDelete('college', c.id, c.nameArabic, c.isActive)}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 text-rose-300 font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {activePopupList === 'program' && programs.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProgram(p);
                        setActivePopupList(null);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all text-xs flex flex-wrap items-center justify-between gap-3 ${
                        selectedProgram?.id === p.id
                          ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-md'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm sm:text-base">{p.nameArabic}</div>
                        <div className="text-xs text-slate-400 mt-0.5" dir="ltr">{p.nameEnglish}</div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { setActivePopupList(null); setEditingProgram(p); }}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAttemptDelete('program', p.id, p.nameArabic, p.isActive)}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 text-rose-300 font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {activePopupList === 'level' && studyLevels.map((lvl) => (
                    <div
                      key={lvl.id}
                      onClick={() => {
                        setSelectedLevel(lvl);
                        setActivePopupList(null);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all text-xs flex flex-wrap items-center justify-between gap-3 ${
                        selectedLevel?.id === lvl.id
                          ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm sm:text-base flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-amber-300 text-xs font-bold border border-amber-500/30">
                            {lvl.stageType === 'internship' ? 'امتياز' : `م ${lvl.order}`}
                          </span>
                          <span>{lvl.titleArabic}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1" dir="ltr">{lvl.titleEnglish}</div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { setActivePopupList(null); setEditingLevel(lvl); }}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAttemptDelete('level', lvl.id, lvl.titleArabic, lvl.isActive)}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 text-rose-300 font-bold flex items-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {activePopupList === 'period' && studyPeriods.map((period) => (
                    <div
                      key={period.id}
                      onClick={() => {
                        setSelectedPeriod(period);
                        setActivePopupList(null);
                      }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all text-xs flex flex-wrap items-center justify-between gap-3 overflow-hidden ${
                        selectedPeriod?.id === period.id
                          ? 'bg-teal-500/20 border-teal-400 text-white shadow-md'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm sm:text-base flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-teal-300 font-mono text-xs font-bold border border-teal-500/30">{period.code}</span>
                          <span className="break-words">{period.titleArabic}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 break-all" dir="ltr">{period.titleEnglish}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => { setActivePopupList(null); setEditingPeriod(period); }}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center gap-1.5 transition-colors flex-1 sm:flex-initial"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          title="نقل البلوك إلى الأرشيف الأكاديمي"
                          onClick={() => {
                            setActivePopupList(null);
                            handleArchivePeriod(period.id, true);
                          }}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-amber-950/40 hover:bg-amber-900/60 border border-amber-900/50 text-amber-300 font-bold flex items-center justify-center gap-1.5 transition-colors flex-1 sm:flex-initial"
                        >
                          <Archive className="w-3.5 h-3.5 shrink-0" />
                          <span>أرشفة</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAttemptDelete('period', period.id, period.titleArabic, period.isActive)}
                          className="px-3 py-2 min-h-[38px] rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 text-rose-300 font-bold flex items-center justify-center gap-1.5 transition-colors flex-1 sm:flex-initial"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  ))}
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

              {/* Course Instructor Selection & Auto-Save Field */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <label className="block text-slate-200 font-bold flex items-center justify-between gap-2">
                  <span>دكتور المادة / مدرس المقرر (اختياري):</span>
                  <span className="text-[10px] text-teal-400 font-normal">يُحفظ تلقائياً في قائمة دكاترة الدفعة</span>
                </label>

                {batchInstructors.length > 0 && (
                  <select
                    value={courseForm.instructorId || ''}
                    onChange={(e) => {
                      const instId = e.target.value;
                      if (!instId) {
                        setCourseForm({ ...courseForm, instructorId: '' });
                        return;
                      }
                      const found = batchInstructors.find((i) => i.id === instId);
                      if (found) {
                        setCourseForm({
                          ...courseForm,
                          instructorId: found.id,
                          instructorNameArabic: `${found.academicTitle} ${found.instructorNameArabic}`.trim()
                        });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-teal-500"
                  >
                    <option value="">-- اختر من دكاترة الدفعة المسجلين أو اكتب اسماً جديداً بالأسفل --</option>
                    {batchInstructors.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.academicTitle} {inst.instructorNameArabic}
                        {inst.specialization ? ` (${inst.specialization})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="text"
                  value={courseForm.instructorNameArabic || ''}
                  onChange={(e) =>
                    setCourseForm({
                      ...courseForm,
                      instructorNameArabic: e.target.value,
                      instructorId: ''
                    })
                  }
                  placeholder="أو اكتب اسم دكتور المادة يدوياً (مثال: أ.د. يحيى الريوي)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
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

              {/* Edit Course Instructor Selection & Auto-Save Field */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <label className="block text-slate-200 font-bold flex items-center justify-between gap-2">
                  <span>دكتور المادة / مدرس المقرر:</span>
                  <span className="text-[10px] text-indigo-400 font-normal">يُحفظ تلقائياً في دكاترة الدفعة</span>
                </label>

                {batchInstructors.length > 0 && (
                  <select
                    value={editingCourse.instructorId || ''}
                    onChange={(e) => {
                      const instId = e.target.value;
                      if (!instId) {
                        setEditingCourse({ ...editingCourse, instructorId: '' });
                        return;
                      }
                      const found = batchInstructors.find((i) => i.id === instId);
                      if (found) {
                        setEditingCourse({
                          ...editingCourse,
                          instructorId: found.id,
                          instructorNameArabic: `${found.academicTitle} ${found.instructorNameArabic}`.trim()
                        });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- اختر من دكاترة الدفعة المسجلين أو اكتب اسماً جديداً بالأسفل --</option>
                    {batchInstructors.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.academicTitle} {inst.instructorNameArabic}
                        {inst.specialization ? ` (${inst.specialization})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="text"
                  value={editingCourse.instructorNameArabic || ''}
                  onChange={(e) =>
                    setEditingCourse({
                      ...editingCourse,
                      instructorNameArabic: e.target.value,
                      instructorId: ''
                    })
                  }
                  placeholder="أو اكتب اسم دكتور المادة يدوياً (مثال: أ.د. يحيى الريوي)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                />
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
