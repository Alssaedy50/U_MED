/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Educational Content Management Console
 * Enables Administrators to Upload, Edit, Categorize, and Publish Medical Materials
 * Dynamically linked to Universities, Study Levels, Blocks, and Courses
 */

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { 
  Plus, 
  FileText, 
  Image as ImageIcon, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  Edit2,
  Trash2, 
  RefreshCw, 
  X,
  Upload,
  Mic,
  Square,
  Volume2,
  Cloud,
  Search,
  CheckSquare,
  FolderInput,
  Filter
} from 'lucide-react';
import { 
  EducationalResource, 
  ResourceType, 
  University, 
  StudyLevel, 
  StudyPeriod, 
  CourseOffering,
  UserRole
} from '../../types/umed.ts';
import { 
  fetchEducationalResources, 
  getCachedEducationalResources,
  subscribeToEducationalResources,
  saveEducationalResource, 
  toggleResourceStatus, 
  deleteEducationalResource,
  uploadFileToCloudFirestore
} from '../../services/resourceService.ts';
import {
  fetchUniversities,
  fetchStudyLevels,
  fetchStudyPeriods,
  fetchCourseOfferings,
  getUserAcademicContext,
  subscribeToUserAcademicContext
} from '../../services/academicService.ts';
import ResourcePreviewModal from '../library/ResourcePreviewModal.tsx';

const TeleDriveBotStudioModal = React.lazy(() => import('./TeleDriveBotStudioModal.tsx'));

interface EducationalContentManagerProps {
  adminUid: string;
  userRole?: UserRole;
  assignedUniversityId?: string;
  assignedStudyLevelId?: string;
  assignedCourseId?: string;
}

export default function EducationalContentManager({
  adminUid,
  userRole = 'platform_owner',
  assignedUniversityId = 'univ-dar-al-salam',
  assignedStudyLevelId,
  assignedCourseId
}: EducationalContentManagerProps) {
  const isBatchScoped = userRole === 'batch_rep' || userRole === 'department_head';
  const isUnivScoped = userRole !== 'platform_owner';

  const [resources, setResources] = useState<EducationalResource[]>(() =>
    getCachedEducationalResources({
      universityId: isUnivScoped ? assignedUniversityId : undefined,
      studyLevelId: isBatchScoped && assignedStudyLevelId ? assignedStudyLevelId : undefined,
      courseOfferingId: userRole === 'department_head' && assignedCourseId ? assignedCourseId : undefined
    })
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'telegram_draft' | 'archived'>('all');
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showBotStudioModal, setShowBotStudioModalState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('umed_teledrive_studio_open') === 'true';
    } catch {
      return false;
    }
  });
  const setShowBotStudioModal = (open: boolean) => {
    setShowBotStudioModalState(open);
    try {
      if (open) {
        localStorage.setItem('umed_teledrive_studio_open', 'true');
      } else {
        localStorage.removeItem('umed_teledrive_studio_open');
      }
    } catch {}
  };
  const [editingResource, setEditingResource] = useState<EducationalResource | null>(null);
  const [previewResource, setPreviewResource] = useState<EducationalResource | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dynamic Academic Hierarchy State
  const [universities, setUniversities] = useState<University[]>([]);
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>([]);
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>([]);
  const [courses, setCourses] = useState<CourseOffering[]>([]);

  // Complete Lookup Dictionaries for Arabic Titles across all Levels/Blocks
  const [allPeriodsCatalog, setAllPeriodsCatalog] = useState<StudyPeriod[]>([]);
  const [allCoursesCatalog, setAllCoursesCatalog] = useState<CourseOffering[]>([]);

  // Bulk Selection & Bulk Categorization State
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [showBulkCategorizeModal, setShowBulkCategorizeModal] = useState<boolean>(false);
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [bulkForm, setBulkForm] = useState({
    studyLevelId: '',
    studyPeriodId: '',
    courseOfferingId: '',
    sectionType: 'theoretical' as 'theoretical' | 'practical' | 'general',
    publishImmediately: true
  });
  const [bulkPeriods, setBulkPeriods] = useState<StudyPeriod[]>([]);
  const [bulkCourses, setBulkCourses] = useState<CourseOffering[]>([]);

  // Edit Modal Cascading Academic Options
  const [editPeriods, setEditPeriods] = useState<StudyPeriod[]>([]);
  const [editCourses, setEditCourses] = useState<CourseOffering[]>([]);

  // Persistent User Academic Context & Inline Filter State
  const [userContext, setUserContext] = useState(() => getUserAcademicContext());
  const [filterLevelId, setFilterLevelId] = useState<string>(() => {
    const ctx = getUserAcademicContext();
    return isBatchScoped && assignedStudyLevelId ? assignedStudyLevelId : (ctx.studyLevelId || 'all');
  });
  const [filterPeriodId, setFilterPeriodId] = useState<string>('all');
  const [filterCourseId, setFilterCourseId] = useState<string>('all');
  const [filterPeriodsList, setFilterPeriodsList] = useState<StudyPeriod[]>([]);
  const [filterCoursesList, setFilterCoursesList] = useState<CourseOffering[]>([]);

  // Form State for Add Resource
  const [form, setForm] = useState(() => {
    const ctx = getUserAcademicContext();
    return {
      title: '',
      description: '',
      resourceType: 'pdf' as ResourceType,
      url: '',
      fileSizeLabel: '1.5 MB',
      fileName: '',
      mimeType: '',
      chunkCount: 0,
      storageProvider: 'firestore_cloud' as 'firestore_cloud' | 'external_url',
      universityId: isUnivScoped ? assignedUniversityId : (ctx.universityId || assignedUniversityId),
      studyLevelId: isBatchScoped && assignedStudyLevelId ? assignedStudyLevelId : (ctx.studyLevelId || 'lvl-2'),
      studyPeriodId: ctx.studyPeriodId || 'blk-hem-2',
      courseOfferingId: 'crs-hem-201',
      sectionType: 'theoretical' as 'theoretical' | 'practical' | 'general',
      status: 'published' as 'published' | 'draft' | 'archived'
    };
  });

  // Direct File Upload & Voice Recording State
  const [uploadSourceMode, setUploadSourceMode] = useState<'device_file' | 'voice_record' | 'external_link'>('device_file');

  // Automatic subscription to global academic context saved in the University Hierarchy page
  useEffect(() => {
    const unsub = subscribeToUserAcademicContext((ctx) => {
      setUserContext(ctx);
      setForm(prev => ({
        ...prev,
        universityId: isUnivScoped ? assignedUniversityId : (ctx.universityId || prev.universityId),
        studyLevelId: isBatchScoped && assignedStudyLevelId ? assignedStudyLevelId : (ctx.studyLevelId || prev.studyLevelId),
        studyPeriodId: ctx.studyPeriodId || prev.studyPeriodId
      }));
    });
    return () => unsub();
  }, [isUnivScoped, assignedUniversityId, isBatchScoped, assignedStudyLevelId]);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Microphone Audio Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  const loadAcademicHierarchy = async () => {
    try {
      const [allUnivs, allLvls] = await Promise.all([
        fetchUniversities(),
        fetchStudyLevels()
      ]);

      const scopedUnivs = isUnivScoped
        ? allUnivs.filter(u => u.id === assignedUniversityId)
        : allUnivs;
      const finalUnivs = scopedUnivs.length > 0 ? scopedUnivs : allUnivs;
      setUniversities(finalUnivs);

      const univIdToUse = isUnivScoped
        ? assignedUniversityId
        : form.universityId || finalUnivs[0]?.id || assignedUniversityId;

      const univLvls = allLvls.filter(l => !l.universityId || l.universityId === univIdToUse);
      const scopedLvls = isBatchScoped && assignedStudyLevelId
        ? univLvls.filter(l => l.id === assignedStudyLevelId)
        : univLvls;
      const finalLvls = scopedLvls.length > 0 ? scopedLvls : allLvls;
      setStudyLevels(finalLvls);

      // Load complete catalog of periods and courses across all levels so Arabic names are always resolved
      const periodArrays = await Promise.all(finalLvls.map(lvl => fetchStudyPeriods(lvl.id)));
      const flatPeriods = periodArrays.flat();
      setAllPeriodsCatalog(flatPeriods);

      const courseArrays = await Promise.all(flatPeriods.map(p => fetchCourseOfferings(p.id)));
      const flatCourses = courseArrays.flat();
      setAllCoursesCatalog(flatCourses);

      const savedCtx = getUserAcademicContext();
      const defaultLvlId = isBatchScoped && assignedStudyLevelId
        ? assignedStudyLevelId
        : finalLvls.find(l => l.id === (savedCtx.studyLevelId || form.studyLevelId))?.id || finalLvls[0]?.id || 'lvl-2';

      const periods = flatPeriods.filter(p => p.studyLevelId === defaultLvlId);
      setStudyPeriods(periods);

      const defaultPeriodId = periods.find(p => p.id === (savedCtx.studyPeriodId || form.studyPeriodId))?.id || periods[0]?.id || '';
      const rawCrs = defaultPeriodId ? flatCourses.filter(c => c.studyPeriodId === defaultPeriodId) : [];
      const crs = userRole === 'department_head' && assignedCourseId
        ? rawCrs.filter(c => c.id === assignedCourseId)
        : rawCrs;
      const finalCrs = crs.length > 0 ? crs : rawCrs;
      setCourses(finalCrs);
      setFilterPeriodsList(periods);
      setFilterCoursesList(finalCrs);

      setForm(prev => ({
        ...prev,
        universityId: univIdToUse,
        studyLevelId: defaultLvlId,
        studyPeriodId: defaultPeriodId,
        courseOfferingId: (userRole === 'department_head' && assignedCourseId) ? assignedCourseId : (finalCrs[0]?.id || '')
      }));
    } catch (e) {
      console.warn('Failed to load academic hierarchy for content manager:', e);
    }
  };

  const loadResources = async () => {
    setLoading(true);
    try {
      const list = await fetchEducationalResources({
        universityId: isUnivScoped ? assignedUniversityId : undefined,
        studyLevelId: isBatchScoped && assignedStudyLevelId ? assignedStudyLevelId : undefined,
        courseOfferingId: userRole === 'department_head' && assignedCourseId ? assignedCourseId : undefined
      });
      setResources(list);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل جلب المواد التعليمية' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAcademicHierarchy();
    loadResources();
    const unsub = subscribeToEducationalResources(
      {
        universityId: isUnivScoped ? assignedUniversityId : undefined,
        studyLevelId: isBatchScoped && assignedStudyLevelId ? assignedStudyLevelId : undefined,
        courseOfferingId: userRole === 'department_head' && assignedCourseId ? assignedCourseId : undefined
      },
      (liveList) => {
        setResources(liveList);
        setLoading(false);
      }
    );
    const unsubCtx = subscribeToUserAcademicContext((ctx) => {
      setUserContext(ctx);
      setForm(prev => ({
        ...prev,
        universityId: isUnivScoped ? assignedUniversityId : (ctx.universityId || prev.universityId),
        studyLevelId: isBatchScoped && assignedStudyLevelId ? assignedStudyLevelId : (ctx.studyLevelId || prev.studyLevelId),
        studyPeriodId: ctx.studyPeriodId || prev.studyPeriodId
      }));
    });
    return () => {
      unsub();
      unsubCtx();
    };
  }, [assignedUniversityId, assignedStudyLevelId, assignedCourseId, userRole]);

  // Cascade Periods when Add Form StudyLevel changes
  useEffect(() => {
    if (form.studyLevelId) {
      fetchStudyPeriods(form.studyLevelId).then(periods => {
        setStudyPeriods(periods);
        const firstPeriodId = periods[0]?.id || '';
        setForm(prev => ({
          ...prev,
          studyPeriodId: periods.some(p => p.id === prev.studyPeriodId) ? prev.studyPeriodId : firstPeriodId
        }));
      });
    } else {
      setStudyPeriods([]);
    }
  }, [form.studyLevelId]);

  // Cascade Courses when Add Form StudyPeriod changes
  useEffect(() => {
    if (form.studyPeriodId) {
      fetchCourseOfferings(form.studyPeriodId).then(crs => {
        setCourses(crs);
        setForm(prev => ({
          ...prev,
          courseOfferingId: crs.some(c => c.id === prev.courseOfferingId) ? prev.courseOfferingId : (crs[0]?.id || '')
        }));
      });
    } else {
      setCourses([]);
    }
  }, [form.studyPeriodId]);

  // Cascade Periods & Courses when Edit Resource Modal is opened or its level/period changes
  useEffect(() => {
    if (editingResource?.studyLevelId) {
      fetchStudyPeriods(editingResource.studyLevelId).then(periods => {
        setEditPeriods(periods);
      });
    } else {
      setEditPeriods([]);
    }
  }, [editingResource?.studyLevelId]);

  useEffect(() => {
    if (editingResource?.studyPeriodId) {
      fetchCourseOfferings(editingResource.studyPeriodId).then(crs => {
        setEditCourses(crs);
      });
    } else {
      setEditCourses([]);
    }
  }, [editingResource?.studyPeriodId]);

  // Cascade Periods & Courses for Bulk Categorization Modal
  useEffect(() => {
    if (bulkForm.studyLevelId) {
      fetchStudyPeriods(bulkForm.studyLevelId).then(periods => {
        setBulkPeriods(periods);
        const firstPeriod = periods[0]?.id || '';
        setBulkForm(prev => ({
          ...prev,
          studyPeriodId: periods.some(p => p.id === prev.studyPeriodId) ? prev.studyPeriodId : firstPeriod
        }));
      });
    } else {
      setBulkPeriods([]);
    }
  }, [bulkForm.studyLevelId]);

  useEffect(() => {
    if (bulkForm.studyPeriodId) {
      fetchCourseOfferings(bulkForm.studyPeriodId).then(crs => {
        setBulkCourses(crs);
        setBulkForm(prev => ({
          ...prev,
          courseOfferingId: crs.some(c => c.id === prev.courseOfferingId) ? prev.courseOfferingId : (crs[0]?.id || '')
        }));
      });
    } else {
      setBulkCourses([]);
    }
  }, [bulkForm.studyPeriodId]);

  // Fast In-Memory Arabic Lookup Dictionaries
  const periodTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of [...allPeriodsCatalog, ...studyPeriods, ...filterPeriodsList, ...editPeriods]) {
      if (p?.id && p?.titleArabic) map[p.id] = p.titleArabic;
    }
    return map;
  }, [allPeriodsCatalog, studyPeriods, filterPeriodsList, editPeriods]);

  const courseTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of [...allCoursesCatalog, ...courses, ...filterCoursesList, ...editCourses]) {
      if (c?.id && c?.titleArabic) map[c.id] = c.titleArabic;
    }
    return map;
  }, [allCoursesCatalog, courses, filterCoursesList, editCourses]);

  const getLevelLabel = (lvlId?: string) => {
    if (!lvlId || lvlId === 'pending_review') return 'قيد المراجعة';
    const found = studyLevels.find(l => l.id === lvlId);
    return found ? found.titleArabic : lvlId;
  };

  const getPeriodLabel = (periodId?: string) => {
    if (!periodId || periodId === 'pending_review') return 'عام للمستوى';
    return periodTitleMap[periodId] || periodId;
  };

  const getCourseLabel = (courseId?: string) => {
    if (!courseId || courseId === 'pending_review') return 'قيد تحديد المادة';
    return courseTitleMap[courseId] || courseId;
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>, isEditMode: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingFile(true);
    setUploadProgress(5);

    // Auto-detect resourceType from MIME type or extension
    let detectedType: ResourceType = 'pdf';
    const lowerName = file.name.toLowerCase();
    if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/.test(lowerName)) {
      detectedType = 'image';
    } else if (file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/.test(lowerName)) {
      detectedType = 'video';
    } else if (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|webm)$/.test(lowerName)) {
      detectedType = 'audio';
    } else if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
      detectedType = 'pdf';
    }

    try {
      const uploaded = await uploadFileToCloudFirestore(file, file.name, (pct) => {
        setUploadProgress(pct);
      });

      if (isEditMode && editingResource) {
        setEditingResource({
          ...editingResource,
          resourceType: detectedType,
          url: uploaded.url,
          fileSizeLabel: uploaded.fileSizeLabel,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          chunkCount: uploaded.chunkCount,
          storageProvider: 'firestore_cloud'
        });
      } else {
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
        setForm(prev => ({
          ...prev,
          title: prev.title.trim() ? prev.title : cleanTitle,
          resourceType: detectedType,
          url: uploaded.url,
          fileSizeLabel: uploaded.fileSizeLabel,
          fileName: uploaded.fileName,
          mimeType: uploaded.mimeType,
          chunkCount: uploaded.chunkCount,
          storageProvider: 'firestore_cloud'
        }));
      }
    } catch (err: any) {
      setUploadError(err.message || 'تعذر رفع الملف إلى السحابة');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startVoiceRecording = async () => {
    setUploadError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setIsRecording(false);

        const audioBlob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size === 0) return;

        setUploadingFile(true);
        setUploadProgress(10);
        try {
          const recFileName = `lecture-audio-${new Date().toISOString().slice(0, 10)}.webm`;
          const uploaded = await uploadFileToCloudFirestore(audioBlob, recFileName, (pct) => {
            setUploadProgress(pct);
          });
          setForm(prev => ({
            ...prev,
            title: prev.title.trim() ? prev.title : `تسجيل صوتي لمحاضرة (${new Date().toLocaleDateString('ar-YE')})`,
            resourceType: 'audio',
            url: uploaded.url,
            fileSizeLabel: uploaded.fileSizeLabel,
            fileName: uploaded.fileName,
            mimeType: uploaded.mimeType,
            chunkCount: uploaded.chunkCount,
            storageProvider: 'firestore_cloud'
          }));
        } catch (err: any) {
          setUploadError(err.message || 'فشل حفظ التسجيل الصوتي في السحابة');
        } finally {
          setUploadingFile(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (err: any) {
      setUploadError('تعذر الوصول إلى الميكروفون. يرجى السماح للمتصفح بصلاحية الميكروفون أو اختيار ملف صوتي جاهز من جهازك.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.trim()) {
      setUploadError('يرجى رفع ملف من جهازك (PDF / صورة / صوت) أو إدخال رابط الملف أولاً.');
      return;
    }
    try {
      const id = `res-${Date.now().toString(36)}`;
      const newResource: EducationalResource = {
        id,
        title: form.title,
        description: form.description || undefined,
        resourceType: form.resourceType,
        url: form.url,
        fileSizeLabel: form.fileSizeLabel,
        fileName: form.fileName || undefined,
        mimeType: form.mimeType || undefined,
        chunkCount: form.chunkCount || undefined,
        storageProvider: form.url.startsWith('umed-cloud://') ? 'firestore_cloud' : 'external_url',
        universityId: form.universityId || assignedUniversityId,
        programId: 'prog-mbbs',
        curriculumVersionId: 'cur-dar-2024',
        studyLevelId: form.studyLevelId,
        studyPeriodId: form.studyPeriodId || undefined,
        courseOfferingId: form.courseOfferingId || undefined,
        sectionType: form.sectionType,
        status: form.status,
        createdBy: adminUid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await saveEducationalResource(newResource);
      setResources([newResource, ...resources]);
      setShowAddModal(false);
      setForm(prev => ({
        ...prev,
        title: '',
        description: '',
        resourceType: 'pdf',
        url: '',
        fileSizeLabel: '1.5 MB',
        fileName: '',
        mimeType: '',
        chunkCount: 0,
        storageProvider: 'firestore_cloud',
        sectionType: 'theoretical',
        status: 'published'
      }));
      setStatusMessage({ type: 'success', text: 'تم رفع وحفظ ونشر المورد التعليمي في قاعدة بيانات السحابة (Firestore) بنجاح!' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشلت إضافة المورد' });
    }
  };

  const handleUpdateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResource) return;
    try {
      const updated: EducationalResource = {
        ...editingResource,
        updatedAt: new Date().toISOString()
      };
      await saveEducationalResource(updated);
      setResources(resources.map(r => r.id === updated.id ? updated : r));
      setEditingResource(null);
      setStatusMessage({ type: 'success', text: `تم تحديث بيانات المورد "${updated.title}" بنجاح!` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل تعديل المورد التعليمي' });
    }
  };

  const handleToggleStatus = async (resourceId: string, current: string) => {
    const nextStatus = current === 'published' ? 'draft' : 'published';
    const target = resources.find(r => r.id === resourceId);
    if (
      nextStatus === 'published' &&
      target &&
      (!target.studyLevelId || target.studyLevelId === 'pending_review')
    ) {
      setEditingResource({
        ...target,
        studyLevelId: studyLevels[0]?.id || 'lvl-2',
        status: 'published'
      });
      setStatusMessage({
        type: 'error',
        text: 'يرجى تحديد المستوى الدراسي والمقرر لهذه المسودة المسحوبة من تيليجرام ثم الضغط على «حفظ التعديلات» لنشرها للطلاب.'
      });
      return;
    }
    await toggleResourceStatus(resourceId, nextStatus);
    setResources(resources.map(r => r.id === resourceId ? { ...r, status: nextStatus } : r));
    setStatusMessage({ type: 'success', text: `تم تحديث حالة المورد إلى (${nextStatus === 'published' ? 'منشور' : 'مسودة'}).` });
  };

  const handleDelete = async (resourceId: string) => {
    await deleteEducationalResource(resourceId);
    setResources(resources.filter(r => r.id !== resourceId));
    setSelectedResourceIds(prev => prev.filter(id => id !== resourceId));
    setStatusMessage({ type: 'success', text: 'تم حذف المورد التعليمي من المنصة والسحابة نهائياً.' });
  };

  // Bulk Action Handlers
  const toggleSelectResource = (id: string) => {
    setSelectedResourceIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkStatusChange = async (nextStatus: 'published' | 'draft') => {
    if (selectedResourceIds.length === 0) return;
    setBulkBusy(true);
    try {
      const fallbackLevelId = studyLevels[0]?.id || 'lvl-2';
      const updatedList: EducationalResource[] = [];

      for (const res of resources) {
        if (!selectedResourceIds.includes(res.id)) {
          updatedList.push(res);
          continue;
        }
        const resolvedLevel = (!res.studyLevelId || res.studyLevelId === 'pending_review')
          ? fallbackLevelId
          : res.studyLevelId;
        const patched: EducationalResource = {
          ...res,
          studyLevelId: resolvedLevel,
          status: nextStatus,
          updatedAt: new Date().toISOString()
        };
        await saveEducationalResource(patched);
        updatedList.push(patched);
      }

      setResources(updatedList);
      const count = selectedResourceIds.length;
      setSelectedResourceIds([]);
      setStatusMessage({
        type: 'success',
        text: nextStatus === 'published'
          ? `تم اعتماد ونشر (${count}) ملفات محددة للطلاب في السحابة بنجاح!`
          : `تم تحويل (${count}) ملفات محددة إلى مسودة.`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'حدث خطأ أثناء تنفيذ العملية الجماعية' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkCategorizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedResourceIds.length === 0) return;
    setBulkBusy(true);
    try {
      const updatedList: EducationalResource[] = [];
      for (const res of resources) {
        if (!selectedResourceIds.includes(res.id)) {
          updatedList.push(res);
          continue;
        }
        const patched: EducationalResource = {
          ...res,
          studyLevelId: bulkForm.studyLevelId || res.studyLevelId,
          studyPeriodId: bulkForm.studyPeriodId || undefined,
          courseOfferingId: bulkForm.courseOfferingId || undefined,
          sectionType: bulkForm.sectionType,
          status: bulkForm.publishImmediately ? 'published' : res.status,
          updatedAt: new Date().toISOString()
        };
        await saveEducationalResource(patched);
        updatedList.push(patched);
      }
      setResources(updatedList);
      const count = selectedResourceIds.length;
      setSelectedResourceIds([]);
      setShowBulkCategorizeModal(false);
      setStatusMessage({
        type: 'success',
        text: `تم تصنيف وتحديث (${count}) ملفات دفعة واحدة في السحابة بنجاح!`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'تعذر تصنيف الملفات المحددة' });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedResourceIds.length === 0) return;
    setBulkBusy(true);
    try {
      for (const id of selectedResourceIds) {
        await deleteEducationalResource(id);
      }
      const count = selectedResourceIds.length;
      setResources(prev => prev.filter(r => !selectedResourceIds.includes(r.id)));
      setSelectedResourceIds([]);
      setStatusMessage({
        type: 'success',
        text: `تم حذف (${count}) ملفات محددة نهائياً من المنصة وقاعدة البيانات السحابية.`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'تعذر حذف الملفات المحددة' });
    } finally {
      setBulkBusy(false);
    }
  };

  const telegramDraftCount = resources.filter(
    r => r.status === 'draft' && r.createdBy === 'AUTOMATED_TELEGRAM_INGESTION'
  ).length;

  const handleFilterLevelChange = async (lvlId: string) => {
    setFilterLevelId(lvlId);
    setFilterPeriodId('all');
    setFilterCourseId('all');
    if (lvlId && lvlId !== 'all') {
      const periods = await fetchStudyPeriods(lvlId);
      setFilterPeriodsList(periods);
      const allCrs: CourseOffering[] = [];
      for (const p of periods) {
        const crs = await fetchCourseOfferings(p.id);
        allCrs.push(...crs);
      }
      setFilterCoursesList(allCrs);
    } else {
      setFilterPeriodsList(allPeriodsCatalog);
      setFilterCoursesList(allCoursesCatalog);
    }
  };

  const handleFilterPeriodChange = async (periodId: string) => {
    setFilterPeriodId(periodId);
    setFilterCourseId('all');
    if (periodId && periodId !== 'all') {
      const crs = await fetchCourseOfferings(periodId);
      setFilterCoursesList(crs);
    } else if (filterLevelId && filterLevelId !== 'all') {
      const allCrs: CourseOffering[] = [];
      for (const p of filterPeriodsList) {
        const crs = await fetchCourseOfferings(p.id);
        allCrs.push(...crs);
      }
      setFilterCoursesList(allCrs);
    } else {
      setFilterCoursesList(allCoursesCatalog);
    }
  };

  const filtered = resources.filter(r => {
    const matchStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'telegram_draft'
        ? r.status === 'draft' && r.createdBy === 'AUTOMATED_TELEGRAM_INGESTION'
        : r.status === statusFilter;
    const matchType = typeFilter === 'all' || r.resourceType === typeFilter;
    const matchUniv = !userContext.universityId || !r.universityId || r.universityId === userContext.universityId;
    const matchLevel = filterLevelId === 'all' || !r.studyLevelId || r.studyLevelId === 'pending_review' || r.studyLevelId === filterLevelId;
    const matchPeriod = filterPeriodId === 'all' || r.studyPeriodId === filterPeriodId;
    const matchCourse = filterCourseId === 'all' || r.courseOfferingId === filterCourseId;

    const q = searchQuery.trim().toLowerCase();
    const matchSearch = !q || [
      r.title,
      r.description || '',
      r.fileName || '',
      getLevelLabel(r.studyLevelId),
      getPeriodLabel(r.studyPeriodId),
      getCourseLabel(r.courseOfferingId)
    ].some(text => text.toLowerCase().includes(q));

    return matchStatus && matchType && matchUniv && matchLevel && matchPeriod && matchCourse && matchSearch;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selectedResourceIds.includes(r.id));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filtered.map(r => r.id));
      setSelectedResourceIds(prev => prev.filter(id => !filteredSet.has(id)));
    } else {
      const merged = new Set([...selectedResourceIds, ...filtered.map(r => r.id)]);
      setSelectedResourceIds(Array.from(merged));
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    if (!isBatchScoped) setFilterLevelId('all');
    setFilterPeriodId('all');
    setFilterCourseId('all');
  };

  const publishedCount = useMemo(() => resources.filter(r => r.status === 'published').length, [resources]);
  const draftCount = useMemo(() => resources.filter(r => r.status === 'draft').length, [resources]);
  const pdfCount = useMemo(() => resources.filter(r => r.resourceType === 'pdf').length, [resources]);
  const mediaAndSlidesCount = useMemo(() => resources.filter(r => r.resourceType !== 'pdf').length, [resources]);

  return (
    <div className="space-y-4">
      
      {/* Unified Header & Primary Actions + Top Statistics Strip */}
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-teal-400 font-bold">
              <span>إدارة المحتوى والمكتبة الرقمية</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[var(--text-muted)]">إجمالي الملفات: {resources.length}</span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-[var(--text-primary)]">
              تنظيم ونشر المحاضرات والشرائح والمراجع الطبية
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              تصفح وإدارة المحاضرات مباشرة، مع نافذة منبثقة مخصصة لإضافة أو تعديل أي مورد تعليمي.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                loadAcademicHierarchy();
                setUploadSourceMode('device_file');
                setUploadError(null);
                setShowAddModal(true);
              }}
              className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-teal-600/20 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>+ إضافة مورد تعليمي جديد</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBotStudioModal(true)}
              className="py-2.5 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Cloud className="w-4 h-4 shrink-0" />
              <span>استوديو السحب التلقائي (TeleDrive)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                loadAcademicHierarchy();
                loadResources();
              }}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors shrink-0"
              title="تحديث المكتبة"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Top Statistics Strip (شريط الإحصائيات السريع) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-[var(--border-color)] text-xs">
          <button
            type="button"
            onClick={() => { setStatusFilter('all'); setTypeFilter('all'); }}
            className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
              statusFilter === 'all' && typeFilter === 'all'
                ? 'bg-teal-500/10 border-teal-500/40'
                : 'bg-[var(--bg-input)] border-[var(--border-color)] hover:border-teal-500/30'
            }`}
          >
            <div>
              <span className="text-[11px] text-[var(--text-muted)] font-semibold block">إجمالي الموارد</span>
              <span className="text-base sm:text-lg font-black text-[var(--text-primary)] font-mono tabular-nums mt-0.5 block">
                {resources.length}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('published')}
            className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
              statusFilter === 'published'
                ? 'bg-emerald-500/10 border-emerald-500/40'
                : 'bg-[var(--bg-input)] border-[var(--border-color)] hover:border-emerald-500/30'
            }`}
          >
            <div>
              <span className="text-[11px] text-[var(--text-muted)] font-semibold block">منشور للطلاب</span>
              <span className="text-base sm:text-lg font-black text-emerald-400 font-mono tabular-nums mt-0.5 block">
                {publishedCount}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('draft')}
            className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
              statusFilter === 'draft' || statusFilter === 'telegram_draft'
                ? 'bg-amber-500/10 border-amber-500/40'
                : 'bg-[var(--bg-input)] border-[var(--border-color)] hover:border-amber-500/30'
            }`}
          >
            <div>
              <span className="text-[11px] text-[var(--text-muted)] font-semibold block">مسودات وقيد المراجعة</span>
              <span className="text-base sm:text-lg font-black text-amber-400 font-mono tabular-nums mt-0.5 block">
                {draftCount}
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTypeFilter(typeFilter === 'pdf' ? 'all' : 'pdf')}
            className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
              typeFilter === 'pdf'
                ? 'bg-indigo-500/10 border-indigo-500/40'
                : 'bg-[var(--bg-input)] border-[var(--border-color)] hover:border-indigo-500/30'
            }`}
          >
            <div>
              <span className="text-[11px] text-[var(--text-muted)] font-semibold block">ملفات PDF / وسائط</span>
              <span className="text-sm sm:text-base font-black text-indigo-400 font-mono tabular-nums mt-0.5 block">
                {pdfCount} PDF · {mediaAndSlidesCount} وسائط
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
              <ImageIcon className="w-4 h-4" />
            </div>
          </button>
        </div>
      </div>

      {/* Automated Telegram Draft Ingestion Alert Banner */}
      {telegramDraftCount > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-xs tabular-nums">
              {telegramDraftCount} مسودة من تيليجرام
            </span>
            <span className="text-[var(--text-primary)] font-semibold">
              ملفات مسحوبة تلقائياً عبر البوت تنتظر تحديد المادة أو الاعتماد الجماعي للنشر.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('telegram_draft');
                if (!isBatchScoped) setFilterLevelId('all');
                setFilterPeriodId('all');
                setFilterCourseId('all');
              }}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              عرض مسودات البوت ({telegramDraftCount})
            </button>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
          statusMessage.type === 'success' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unified Search, Quick Tabs & Academic Filters Workspace Bar */}
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-4 space-y-3.5 text-xs">
        {/* Row 1: Instant Search + Segmented Status Filter Tabs */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم المحاضرة، اسم المادة، البلوك، أو نوع الملف..."
              className="w-full pr-10 pl-8 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-teal-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Interactive Status Segmented Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-950/80 border border-slate-800">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                statusFilter === 'all' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل ({resources.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('published')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                statusFilter === 'published' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              منشور ({resources.filter(r => r.status === 'published').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('draft')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                statusFilter === 'draft' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              مسودات ({resources.filter(r => r.status === 'draft').length})
            </button>
            {telegramDraftCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('telegram_draft')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  statusFilter === 'telegram_draft' ? 'bg-sky-600 text-white' : 'text-sky-400 hover:text-white'
                }`}
              >
                مسودات تيليجرام ({telegramDraftCount})
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Cascading Academic Hierarchy Dropdowns + Select All */}
        <div className="pt-3 border-t border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)] font-bold shrink-0">المستوى:</span>
              <select
                value={filterLevelId}
                disabled={isBatchScoped}
                onChange={(e) => handleFilterLevelChange(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
              >
                {!isBatchScoped && <option value="all">جميع المستويات</option>}
                {studyLevels.map(lvl => (
                  <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)] font-bold shrink-0">البلوك:</span>
              <select
                value={filterPeriodId}
                onChange={(e) => handleFilterPeriodChange(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
              >
                <option value="all">جميع البلوكات</option>
                {(filterPeriodsList.length > 0 ? filterPeriodsList : allPeriodsCatalog).map(p => (
                  <option key={p.id} value={p.id}>{p.titleArabic}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)] font-bold shrink-0">المادة:</span>
              <select
                value={filterCourseId}
                onChange={(e) => setFilterCourseId(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
              >
                <option value="all">جميع المقررات</option>
                {(filterCoursesList.length > 0 ? filterCoursesList : allCoursesCatalog).map(c => (
                  <option key={c.id} value={c.id}>{c.titleArabic}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)] font-bold shrink-0">النوع:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
              >
                <option value="all">جميع الأنواع</option>
                <option value="pdf">ملفات PDF</option>
                <option value="image">شرائح وصور طبية</option>
                <option value="video">ملفات فيديو</option>
                <option value="audio">تسجيلات صوتية</option>
                <option value="link">روابط ومراجع</option>
              </select>
            </div>

            {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || filterPeriodId !== 'all' || filterCourseId !== 'all') && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>إعادة ضبط</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <CheckSquare className="w-3.5 h-3.5 text-teal-400" />
                <span>{allFilteredSelected ? 'إلغاء تحديد الكل' : `تحديد الكل (${filtered.length})`}</span>
              </button>
            )}
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              المعروض: <strong className="text-[var(--text-primary)]">{filtered.length}</strong> من {resources.length}
            </span>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar (Appears when 1 or more resources are selected) */}
      {selectedResourceIds.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-indigo-950/80 border border-indigo-500/50 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500 text-white font-black tabular-nums">
              {selectedResourceIds.length} ملفات محددة
            </span>
            <span className="text-indigo-200 font-semibold">
              اختر الإجراء الجماعي لتطبيقه فوراً ومزامنته مع السحابة:
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkStatusChange('published')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>نشر المحدد للطلاب</span>
            </button>

            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => {
                const defaultLvl = filterLevelId !== 'all' ? filterLevelId : (studyLevels[0]?.id || 'lvl-2');
                setBulkForm({
                  studyLevelId: defaultLvl,
                  studyPeriodId: filterPeriodId !== 'all' ? filterPeriodId : '',
                  courseOfferingId: filterCourseId !== 'all' ? filterCourseId : '',
                  sectionType: 'theoretical',
                  publishImmediately: true
                });
                setShowBulkCategorizeModal(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span>تعيين المستوى والمادة للمحدد</span>
            </button>

            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkStatusChange('draft')}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-amber-300 border border-slate-700 font-bold transition-colors whitespace-nowrap"
            >
              تحويل لمسودة
            </button>

            <button
              type="button"
              disabled={bulkBusy}
              onClick={handleBulkDelete}
              className="px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف المحدد</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedResourceIds([])}
              className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white"
              title="إلغاء التحديد"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Resources Clean Structured List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
            <p className="text-slate-400 text-xs font-semibold">لا توجد محاضرات أو ملفات مطابقة للبحث أو الفلتر المحدد.</p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-bold transition-colors"
            >
              إظهار جميع ملفات المكتبة
            </button>
          </div>
        ) : (
          filtered.map((res) => {
            const isSelected = selectedResourceIds.includes(res.id);
            const needsCategorization = res.studyLevelId === 'pending_review' || res.courseOfferingId === 'pending_review';

            return (
              <div
                key={res.id}
                className={`bg-slate-900/90 border rounded-2xl p-4 text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 transition-colors ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-950/20'
                    : needsCategorization
                    ? 'border-amber-500/40 hover:border-amber-500/70'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  {/* Selection Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectResource(res.id)}
                    className="mt-1 sm:mt-0 w-4 h-4 rounded accent-teal-500 cursor-pointer shrink-0"
                    title="تحديد الملف"
                  />

                  {/* Resource Type Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${
                    res.resourceType === 'pdf' ? 'bg-rose-500/10 text-rose-400' :
                    res.resourceType === 'image' ? 'bg-teal-500/10 text-teal-400' :
                    res.resourceType === 'audio' ? 'bg-amber-500/10 text-amber-400' :
                    'bg-indigo-500/10 text-indigo-400'
                  }`}>
                    {res.resourceType === 'pdf' && <FileText className="w-5 h-5" />}
                    {res.resourceType === 'image' && <ImageIcon className="w-5 h-5" />}
                    {res.resourceType === 'audio' && <Volume2 className="w-5 h-5" />}
                    {res.resourceType !== 'pdf' && res.resourceType !== 'image' && res.resourceType !== 'audio' && <ExternalLink className="w-5 h-5" />}
                  </div>

                  {/* Title & Clean Arabic Metadata */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm break-words">{res.title}</span>
                      <span className={`text-[11px] font-bold ${
                        res.status === 'published' ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        · {res.status === 'published' ? 'منشور للطلاب' : res.status === 'archived' ? 'مؤرشف' : 'مسودة'}
                      </span>
                      {res.createdBy === 'AUTOMATED_TELEGRAM_INGESTION' && (
                        <span className="text-[11px] text-sky-400 font-semibold">
                          · مسحوب من تيليجرام
                        </span>
                      )}
                      {needsCategorization && (
                        <span className="text-[11px] text-amber-300 font-bold">
                          · يتطلب تحديد المستوى والمادة
                        </span>
                      )}
                    </div>

                    {/* Clean Unboxed Arabic Hierarchy Path */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400">
                      <span className="text-slate-200 font-semibold">{getLevelLabel(res.studyLevelId)}</span>
                      {res.studyPeriodId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-teal-300 font-medium">{getPeriodLabel(res.studyPeriodId)}</span>
                        </>
                      )}
                      {res.courseOfferingId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-indigo-300 font-medium">{getCourseLabel(res.courseOfferingId)}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{res.sectionType === 'theoretical' ? 'شعبة نظري' : res.sectionType === 'practical' ? 'عملي ومختبر' : 'عام'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-400">{res.fileSizeLabel || '1.8 MB'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-500">{new Date(res.createdAt).toLocaleDateString('ar-YE')}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap justify-end shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
                  <button
                    onClick={() => setPreviewResource(res)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>معاينة</span>
                  </button>

                  <button
                    onClick={() => setEditingResource(res)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-teal-950/60 text-teal-300 font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 whitespace-nowrap"
                    title="تعديل بيانات المورد وتصنيفه"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>تعديل وتصنيف</span>
                  </button>

                  <button
                    onClick={() => handleToggleStatus(res.id, res.status)}
                    className={`px-3 py-1.5 rounded-xl font-bold transition-colors border whitespace-nowrap ${
                      res.status === 'published'
                        ? 'bg-amber-950/30 border-amber-800/40 text-amber-300 hover:bg-amber-950/60'
                        : 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300 hover:bg-emerald-950/70'
                    }`}
                  >
                    {res.status === 'published' ? 'إلغاء النشر' : 'اعتماد ونشر'}
                  </button>

                  <button
                    onClick={() => handleDelete(res.id)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 transition-colors border border-slate-700"
                    title="حذف المورد نهائياً"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Bulk Categorize & Publish Selected Resources */}
      {showBulkCategorizeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-sm">تصنيف ونقل الملفات المحددة ({selectedResourceIds.length})</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">تعيين المستوى والبلوك والمادة لجميع الملفات المختارة دفعة واحدة</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkCategorizeModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBulkCategorizeSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">المستوى الدراسي:</label>
                <select
                  value={bulkForm.studyLevelId}
                  onChange={(e) => setBulkForm({ ...bulkForm, studyLevelId: e.target.value, studyPeriodId: '', courseOfferingId: '' })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  required
                >
                  {studyLevels.map(lvl => (
                    <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">البلوك / الفترة الدراسية:</label>
                <select
                  value={bulkForm.studyPeriodId}
                  onChange={(e) => setBulkForm({ ...bulkForm, studyPeriodId: e.target.value, courseOfferingId: '' })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="">-- عام للمستوى --</option>
                  {bulkPeriods.map(blk => (
                    <option key={blk.id} value={blk.id}>{blk.titleArabic} ({blk.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">المقرر الدراسي:</label>
                <select
                  value={bulkForm.courseOfferingId}
                  onChange={(e) => setBulkForm({ ...bulkForm, courseOfferingId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="">-- جميع مقررات البلوك --</option>
                  {bulkCourses.map(c => (
                    <option key={c.id} value={c.id}>{c.titleArabic} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">الشعبة الأكاديمية:</label>
                <select
                  value={bulkForm.sectionType}
                  onChange={(e) => setBulkForm({ ...bulkForm, sectionType: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="theoretical">شعبة نظري (Lectures)</option>
                  <option value="practical">شعبة عملي ومختبر (Practical / Lab)</option>
                  <option value="general">عام / شامل</option>
                </select>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer text-emerald-300 font-bold">
                <input
                  type="checkbox"
                  checked={bulkForm.publishImmediately}
                  onChange={(e) => setBulkForm({ ...bulkForm, publishImmediately: e.target.checked })}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                <span>اعتماد ونشر هذه الملفات للطلاب فوراً بعد التصنيف</span>
              </label>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkCategorizeModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={bulkBusy}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md"
                >
                  {bulkBusy ? 'جاري الحفظ...' : 'تطبيق التصنيف والحفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Educational Resource */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-start sm:items-center justify-center p-2.5 sm:p-4 overflow-y-auto overscroll-contain">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full max-h-[calc(100dvh-1.25rem)] sm:max-h-[90dvh] flex flex-col shadow-2xl my-auto overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-900 shrink-0">
              <h3 className="font-bold text-white text-sm">إضافة ونشر مورد تعليمي طبي جديد</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                title="إغلاق النافذة"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateResource} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 text-xs overscroll-contain">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان المحاضرة / المورد بالعربية:</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="مثال: تشريح الشرايين التاجية وعضلة القلب"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">وصف مختصر أو محاور المحاضرة:</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="وصف تفصيلي لمحتويات المورد..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الجامعة:</label>
                  <select
                    value={form.universityId}
                    onChange={(e) => setForm({ ...form, universityId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    {universities.map(u => (
                      <option key={u.id} value={u.id}>{u.nameArabic}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المستوى الدراسي:</label>
                  <select
                    value={form.studyLevelId}
                    onChange={(e) => setForm({ ...form, studyLevelId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    {studyLevels.map(lvl => (
                      <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">البلوك / الفترة الدراسية:</label>
                  <select
                    value={form.studyPeriodId}
                    onChange={(e) => setForm({ ...form, studyPeriodId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="">-- عام للمستوى --</option>
                    {studyPeriods.map(blk => (
                      <option key={blk.id} value={blk.id}>{blk.titleArabic} ({blk.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المقرر الدراسي:</label>
                  <select
                    value={form.courseOfferingId}
                    onChange={(e) => setForm({ ...form, courseOfferingId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="">-- جميع مقررات البلوك --</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.titleArabic} ({c.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Method Selector: Upload File vs Record Audio vs External URL */}
              <div className="space-y-2.5 p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800">
                <label className="block text-slate-200 font-bold">طريقة إرفاق الملف أو المحاضرة:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => { setUploadSourceMode('device_file'); setUploadError(null); }}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all ${
                      uploadSourceMode === 'device_file'
                        ? 'bg-teal-600 text-white border-teal-500 shadow-md'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>رفع ملف (PDF / صورة / فيديو / صوت)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setUploadSourceMode('voice_record'); setUploadError(null); }}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all ${
                      uploadSourceMode === 'voice_record'
                        ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5 shrink-0" />
                    <span>تسجيل صوتي مباشر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setUploadSourceMode('external_link'); setUploadError(null); }}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition-all ${
                      uploadSourceMode === 'external_link'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>رابط خارجي (Drive / فيديو)</span>
                  </button>
                </div>

                {uploadError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-[11px] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* OPTION 1: DIRECT FILE UPLOAD FROM PHONE/PC */}
                {uploadSourceMode === 'device_file' && (
                  <div className="space-y-2 pt-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,image/*,video/*,audio/*,.mp3,.wav,.m4a,.ogg,.mp4,.webm"
                      onChange={(e) => handleFileSelected(e, false)}
                      className="hidden"
                      id="umed-direct-file-upload"
                    />
                    <label
                      htmlFor="umed-direct-file-upload"
                      className="cursor-pointer w-full py-4 px-4 rounded-xl border-2 border-dashed border-teal-500/40 hover:border-teal-400 bg-slate-900/70 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
                    >
                      <Upload className="w-6 h-6 text-teal-400" />
                      <span className="font-bold text-white text-xs">
                        اضغط هنا لاختيار ملف من جهازك (PDF، صورة، فيديو، أو تسجيل صوتي)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        يتم حفظ الملف مباشرة في قاعدة بيانات السحابة (Cloud Firestore) ومزامنته لجميع الطلاب
                      </span>
                    </label>

                    {uploadingFile && (
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-[11px] text-teal-300 font-bold">
                          <span>جارٍ رفع وتخزين الملف في السحابة...</span>
                          <span className="font-mono">{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 transition-all duration-200"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {form.url.startsWith('umed-cloud://') && !uploadingFile && (
                      <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/80 text-emerald-300 text-[11px] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span className="truncate font-bold">تم رفع الملف للسحابة: {form.fileName || 'ملف جاهز'} ({form.fileSizeLabel})</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* OPTION 2: LIVE MICROPHONE VOICE RECORDING */}
                {uploadSourceMode === 'voice_record' && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-2.5 text-center">
                    {!isRecording ? (
                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        disabled={uploadingFile}
                        className="py-2.5 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg"
                      >
                        <Mic className="w-4 h-4" />
                        <span>بدء تسجيل صوتي مباشر من الميكروفون</span>
                      </button>
                    ) : (
                      <div className="space-y-2 w-full">
                        <div className="flex items-center justify-center gap-2 text-rose-400 font-bold animate-pulse">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                          <span>جارٍ التسجيل الصوتي... ({Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')})</span>
                        </div>
                        <button
                          type="button"
                          onClick={stopVoiceRecording}
                          className="py-2 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 mx-auto"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>إيقاف التسجيل وحفظه في السحابة</span>
                        </button>
                      </div>
                    )}

                    {uploadingFile && (
                      <div className="w-full space-y-1">
                        <div className="flex justify-between text-[11px] text-teal-300">
                          <span>جارٍ رفع التسجيل الصوتي للسحابة...</span>
                          <span className="font-mono">{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    )}

                    {form.url.startsWith('umed-cloud://') && form.resourceType === 'audio' && !uploadingFile && (
                      <div className="p-2 rounded-lg bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-[11px] flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>تم حفظ التسجيل الصوتي ({form.fileSizeLabel}) في السحابة وجاهز للنشر!</span>
                      </div>
                    )}
                  </div>
                )}

                {/* OPTION 3: EXTERNAL URL (GOOGLE DRIVE / DIRECT LINK) */}
                {uploadSourceMode === 'external_link' && (
                  <div className="pt-1">
                    <label className="block text-slate-300 mb-1 font-semibold">رابط الملف المعتمد (Google Drive / Direct URL):</label>
                    <input
                      type="url"
                      value={form.url}
                      onChange={(e) => setForm({ ...form, url: e.target.value })}
                      placeholder="https://drive.google.com/file/d/.../preview"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono"
                      dir="ltr"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">نوع المورد:</label>
                  <select
                    value={form.resourceType}
                    onChange={(e) => setForm({ ...form, resourceType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="pdf">ملف PDF (محاضرة / كتاب)</option>
                    <option value="image">صورة طبية / شريحة هستولوجي</option>
                    <option value="audio">تسجيل صوتي / محاضرة صوتية</option>
                    <option value="link">رابط موقع / مرجع خارجي</option>
                    <option value="video_link">رابط فيديو تعليمي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">حجم الملف (يحسب تلقائياً عند الرفع):</label>
                  <input
                    type="text"
                    required
                    value={form.fileSizeLabel}
                    onChange={(e) => setForm({ ...form, fileSizeLabel: e.target.value })}
                    placeholder="مثال: 2.1 MB أو 450 KB"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الشعبة الأكاديمية:</label>
                  <select
                    value={form.sectionType}
                    onChange={(e) => setForm({ ...form, sectionType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="theoretical">شعبة نظري (Lectures)</option>
                    <option value="practical">شعبة عملي ومختبر (Practical / Lab)</option>
                    <option value="general">عام / شامل</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">حالة النشر:</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="published">نشر فوري للطلاب</option>
                    <option value="draft">حفظ كمسودة</option>
                    <option value="archived">أرشفة</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2 sticky bottom-0 bg-slate-900 pb-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500 shadow-lg shadow-teal-600/20"
                >
                  حفظ وتأكيد النشر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Educational Resource */}
      {editingResource && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-start sm:items-center justify-center p-2.5 sm:p-4 overflow-y-auto overscroll-contain">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full max-h-[calc(100dvh-1.25rem)] sm:max-h-[90dvh] flex flex-col shadow-2xl my-auto overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-800 bg-slate-900 shrink-0">
              <h3 className="font-bold text-white text-sm">تعديل بيانات المورد التعليمي</h3>
              <button
                type="button"
                onClick={() => setEditingResource(null)}
                className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                title="إغلاق النافذة"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateResource} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 text-xs overscroll-contain">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">عنوان المحاضرة / المورد بالعربية:</label>
                <input
                  type="text"
                  required
                  value={editingResource.title}
                  onChange={(e) => setEditingResource({ ...editingResource, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">الوصف:</label>
                <textarea
                  rows={2}
                  value={editingResource.description || ''}
                  onChange={(e) => setEditingResource({ ...editingResource, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الجامعة:</label>
                  <select
                    value={editingResource.universityId}
                    onChange={(e) => setEditingResource({ ...editingResource, universityId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    {universities.map(u => (
                      <option key={u.id} value={u.id}>{u.nameArabic}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المستوى الدراسي:</label>
                  <select
                    value={editingResource.studyLevelId}
                    onChange={(e) => setEditingResource({ ...editingResource, studyLevelId: e.target.value, studyPeriodId: '', courseOfferingId: '' })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    {studyLevels.map(lvl => (
                      <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">البلوك الدراسي:</label>
                  <select
                    value={editingResource.studyPeriodId || ''}
                    onChange={(e) => setEditingResource({ ...editingResource, studyPeriodId: e.target.value || undefined, courseOfferingId: undefined })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="">-- عام للمستوى --</option>
                    {editPeriods.map(blk => (
                      <option key={blk.id} value={blk.id}>{blk.titleArabic} ({blk.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">المقرر الدراسي:</label>
                  <select
                    value={editingResource.courseOfferingId || ''}
                    onChange={(e) => setEditingResource({ ...editingResource, courseOfferingId: e.target.value || undefined })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="">-- جميع مقررات البلوك --</option>
                    {editCourses.map(c => (
                      <option key={c.id} value={c.id}>{c.titleArabic} ({c.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">نوع المورد:</label>
                  <select
                    value={editingResource.resourceType}
                    onChange={(e) => setEditingResource({ ...editingResource, resourceType: e.target.value as ResourceType })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="pdf">ملف PDF (محاضرة / كتاب)</option>
                    <option value="image">صورة طبية / شريحة هستولوجي</option>
                    <option value="audio">تسجيل صوتي / محاضرة صوتية</option>
                    <option value="link">رابط موقع / مرجع خارجي</option>
                    <option value="video_link">رابط فيديو تعليمي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">حجم الملف:</label>
                  <input
                    type="text"
                    required
                    value={editingResource.fileSizeLabel || ''}
                    onChange={(e) => setEditingResource({ ...editingResource, fileSizeLabel: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-slate-300 font-semibold">ملف المورد أو الرابط:</label>
                  <label className="cursor-pointer px-3 py-1 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/40 font-bold text-[11px] flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>استبدال بملف جديد من الجهاز</span>
                    <input
                      type="file"
                      accept=".pdf,image/*,audio/*,.mp3,.wav,.m4a,.ogg"
                      onChange={(e) => handleFileSelected(e, true)}
                      className="hidden"
                    />
                  </label>
                </div>
                <input
                  type="text"
                  required
                  value={editingResource.url}
                  onChange={(e) => setEditingResource({ ...editingResource, url: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">الشعبة الأكاديمية:</label>
                  <select
                    value={editingResource.sectionType}
                    onChange={(e) => setEditingResource({ ...editingResource, sectionType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="theoretical">شعبة نظري (Lectures)</option>
                    <option value="practical">شعبة عملي ومختبر (Practical / Lab)</option>
                    <option value="general">عام / شامل</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">حالة النشر:</label>
                  <select
                    value={editingResource.status}
                    onChange={(e) => setEditingResource({ ...editingResource, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="published">منشور للطلاب</option>
                    <option value="draft">مسودة</option>
                    <option value="archived">مؤرشف</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2 sticky bottom-0 bg-slate-900 pb-1">
                <button
                  type="button"
                  onClick={() => setEditingResource(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500 shadow-lg shadow-teal-600/20"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active Preview Modal */}
      {previewResource && (
        <ResourcePreviewModal
          resource={previewResource}
          onClose={() => setPreviewResource(null)}
        />
      )}

      {/* TeleDrive MTProto Ingestion Studio Modal */}
      {showBotStudioModal && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
              <div className="px-6 py-4 rounded-2xl bg-slate-900 border border-teal-500/30 text-teal-300 text-sm font-bold flex items-center gap-3 shadow-2xl">
                <RefreshCw className="w-4 h-4 animate-spin text-teal-400" />
                <span>جاري تحميل استوديو البوت...</span>
              </div>
            </div>
          }
        >
          <TeleDriveBotStudioModal
            isOpen={showBotStudioModal}
            onClose={() => setShowBotStudioModal(false)}
            defaultUniversityId={form.universityId || assignedUniversityId}
            onDraftSimulated={() => {
              loadResources();
              setStatusFilter('draft');
            }}
          />
        </Suspense>
      )}

    </div>
  );
}
