/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Educational Content Management Console
 * Enables Administrators to Upload, Edit, Categorize, and Publish Medical Materials
 * Dynamically linked to Universities, Study Levels, Blocks, and Courses
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Cloud
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
  fetchCourseOfferings
} from '../../services/academicService.ts';
import ResourcePreviewModal from '../library/ResourcePreviewModal.tsx';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'archived'>('all');
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingResource, setEditingResource] = useState<EducationalResource | null>(null);
  const [previewResource, setPreviewResource] = useState<EducationalResource | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dynamic Academic Hierarchy State
  const [universities, setUniversities] = useState<University[]>([]);
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>([]);
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>([]);
  const [courses, setCourses] = useState<CourseOffering[]>([]);

  // Edit Modal Cascading Academic Options
  const [editPeriods, setEditPeriods] = useState<StudyPeriod[]>([]);
  const [editCourses, setEditCourses] = useState<CourseOffering[]>([]);

  // Form State for Add Resource
  const [form, setForm] = useState({
    title: '',
    description: '',
    resourceType: 'pdf' as ResourceType,
    url: '',
    fileSizeLabel: '1.5 MB',
    fileName: '',
    mimeType: '',
    chunkCount: 0,
    storageProvider: 'firestore_cloud' as 'firestore_cloud' | 'external_url',
    universityId: assignedUniversityId,
    studyLevelId: 'lvl-4',
    studyPeriodId: 'blk-cvs',
    courseOfferingId: 'crs-anat-cvs',
    sectionType: 'theoretical' as 'theoretical' | 'practical' | 'general',
    status: 'published' as 'published' | 'draft' | 'archived'
  });

  // Direct File Upload & Voice Recording State
  const [uploadSourceMode, setUploadSourceMode] = useState<'device_file' | 'voice_record' | 'external_link'>('device_file');
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

      const defaultLvlId = isBatchScoped && assignedStudyLevelId
        ? assignedStudyLevelId
        : finalLvls.find(l => l.id === form.studyLevelId)?.id || finalLvls[0]?.id || 'lvl-4';

      const periods = await fetchStudyPeriods(defaultLvlId);
      setStudyPeriods(periods);

      const defaultPeriodId = periods.find(p => p.id === form.studyPeriodId)?.id || periods[0]?.id || '';
      const rawCrs = defaultPeriodId ? await fetchCourseOfferings(defaultPeriodId) : [];
      const crs = userRole === 'department_head' && assignedCourseId
        ? rawCrs.filter(c => c.id === assignedCourseId)
        : rawCrs;
      const finalCrs = crs.length > 0 ? crs : rawCrs;
      setCourses(finalCrs);

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
    return () => unsub();
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
    await toggleResourceStatus(resourceId, nextStatus);
    setResources(resources.map(r => r.id === resourceId ? { ...r, status: nextStatus } : r));
    setStatusMessage({ type: 'success', text: `تم تحديث حالة المورد إلى (${nextStatus === 'published' ? 'منشور' : 'مسودة'}).` });
  };

  const handleDelete = async (resourceId: string) => {
    await deleteEducationalResource(resourceId);
    setResources(resources.filter(r => r.id !== resourceId));
    setStatusMessage({ type: 'success', text: 'تم حذف المورد التعليمي نهائياً.' });
  };

  const getLevelLabel = (lvlId: string) => {
    const found = studyLevels.find(l => l.id === lvlId);
    return found ? found.titleArabic : lvlId;
  };

  const filtered = resources.filter(r => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchType = typeFilter === 'all' || r.resourceType === typeFilter;
    return matchStatus && matchType;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs text-teal-300 font-semibold">
            <span>إدارة المحتوى والمكتبة الرقمية</span>
            <span>·</span>
            <span className="text-slate-400 font-mono">Educational Content Hub</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            رفع وتعديل وتصنيف المحاضرات والشرائح والمراجع الطبية
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ربط المواد ديناميكياً بالجامعة، المستوى الأكاديمي، البلوك الدراسي، المقرر، والشعبة (نظري / عملي ومختبر).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              loadAcademicHierarchy();
              setUploadSourceMode('device_file');
              setUploadError(null);
              setShowAddModal(true);
            }}
            className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-600/20 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>رفع ملف (PDF / صورة / صوت) أو إضافة مورد</span>
          </button>

          <button
            onClick={() => {
              loadAcademicHierarchy();
              loadResources();
            }}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Cloud Storage Architecture Explanation Banner */}
      <div className="bg-slate-900/60 border border-teal-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-white">
              أين يتم تخزين الملفات المرفوعة (PDF، الصور، التسجيلات الصوتية)؟
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              تُخزّن جميع الملفات المرفوعة سحابياً بشكل مباشر ومجاني داخل قاعدة بيانات مشروعك <code className="text-teal-300 font-mono">umed-yemen (Cloud Firestore)</code> ضمن مجموعتي <code className="text-teal-300 font-mono">educationalResources</code> و <code className="text-teal-300 font-mono">uploadedFileChunks</code>، مع حفظ نسخة محلية فورية في متصفح الطالب (<code className="text-amber-300 font-mono">IndexedDB</code>) لفتحها لاحقاً بدون استهلاك إنترنت.
            </p>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-2 ${
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

      {/* Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Status Filters */}
        <div className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
              statusFilter === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            الكل ({resources.length})
          </button>

          <button
            onClick={() => setStatusFilter('published')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
              statusFilter === 'published' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>منشور ({resources.filter(r => r.status === 'published').length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('draft')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
              statusFilter === 'draft' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>مسودة ({resources.filter(r => r.status === 'draft').length})</span>
          </button>
        </div>

        {/* Type Filters */}
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-teal-500"
          >
            <option value="all">جميع الأنواع</option>
            <option value="pdf">ملفات PDF</option>
            <option value="image">شرائح وصور طبية</option>
            <option value="video">ملفات فيديو مباشرة</option>
            <option value="audio">تسجيلات ومحاضرات صوتية</option>
            <option value="link">روابط خارجية</option>
            <option value="video_link">روابط فيديو</option>
          </select>
        </div>

      </div>

      {/* Resources Table / Card List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-xs">
            لا توجد مواد تعليمية مطابقة للفلتر المحدد.
          </div>
        ) : (
          filtered.map((res) => (
            <div key={res.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
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

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">{res.title}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-300 font-mono text-[10px]">
                      {res.fileSizeLabel || '1.8 MB'}
                    </span>
                    {res.url?.startsWith('umed-cloud://') && (
                      <span className="px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800 text-[10px] font-bold">
                        مرفوع سحابياً (Firestore)
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      res.status === 'published' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                      'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {res.status === 'published' ? 'منشور للطلاب' : res.status === 'archived' ? 'مؤرشف' : 'مسودة'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400 mt-1">
                    <span>المستوى: {getLevelLabel(res.studyLevelId)}</span>
                    {res.studyPeriodId && (
                      <>
                        <span>•</span>
                        <span>البلوك: {res.studyPeriodId}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>الشعبة: {res.sectionType === 'theoretical' ? 'نظري' : res.sectionType === 'practical' ? 'عملي ومختبر' : 'عام'}</span>
                    <span>•</span>
                    <span className="font-mono text-slate-500">{new Date(res.createdAt).toLocaleDateString('ar-YE')}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Preview, Edit, Toggle Publish, Delete */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setPreviewResource(res)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1 transition-colors border border-slate-700"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>معاينة</span>
                </button>

                <button
                  onClick={() => setEditingResource(res)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-teal-950/60 text-teal-300 font-medium flex items-center gap-1 transition-colors border border-slate-700"
                  title="تعديل بيانات المورد التعليمي"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>تعديل</span>
                </button>

                <button
                  onClick={() => handleToggleStatus(res.id, res.status)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                    res.status === 'published'
                      ? 'bg-amber-950/30 border-amber-800/40 text-amber-300 hover:bg-amber-950/60'
                      : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300 hover:bg-emerald-950/60'
                  }`}
                >
                  {res.status === 'published' ? 'تحويل لمسودة' : 'نشر للطلاب'}
                </button>

                <button
                  onClick={() => handleDelete(res.id)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-colors"
                  title="حذف المورد"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

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

    </div>
  );
}
