/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Student Medical Library
 * Low-Bandwidth Medical Lectures, Histology Slides, and Educational Material
 */

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Search,
  RefreshCw,
  Eye,
  Volume2,
  Video,
  SlidersHorizontal,
  Stethoscope,
  X
} from 'lucide-react';
import {
  EducationalResource,
  ResourceType,
  CourseOffering,
  CourseInstructor
} from '../../types/umed.ts';
import {
  fetchEducationalResources,
  getCachedEducationalResources,
  subscribeToEducationalResources
} from '../../services/resourceService.ts';
import {
  getCachedCollection,
  fetchStudyPeriods,
  fetchCourseOfferings
} from '../../services/academicService.ts';
import {
  fetchCourseInstructors,
  getCachedCourseInstructors
} from '../../services/batchGovernanceService.ts';
import {
  getActiveNotificationUser,
  syncNotificationsForResources
} from '../../services/notificationService.ts';
import ResourcePreviewModal from './ResourcePreviewModal.tsx';

interface StudentMedicalLibraryProps {
  universityId: string;
  programId: string;
  studyLevelId: string;
  studentNameArabic: string;
  initialCourseId?: string;
  initialCourseTitle?: string;
  onClearCourseFilter?: () => void;
}

type SortOption = 'newest' | 'oldest' | 'title' | 'size';

export default function StudentMedicalLibrary({
  universityId,
  programId,
  studyLevelId,
  initialCourseId,
  initialCourseTitle,
  onClearCourseFilter
}: StudentMedicalLibraryProps) {
  const [resources, setResources] = useState<EducationalResource[]>(() =>
    getCachedEducationalResources({
      universityId,
      programId,
      studyLevelId,
      status: 'published'
    })
  );
  const [courses, setCourses] = useState<CourseOffering[]>(() =>
    getCachedCollection<CourseOffering>('courseOfferings').filter(
      (c) => !c.universityId || c.universityId === universityId
    )
  );
  const [instructors, setInstructors] = useState<CourseInstructor[]>(() =>
    getCachedCourseInstructors({ universityId, studyLevelId })
  );
  const [selectedCourseId, setSelectedCourseId] = useState<string>(initialCourseId || 'all');
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<ResourceType | 'all'>('all');
  const [selectedSection, setSelectedSection] = useState<'all' | 'theoretical' | 'practical'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [activePreviewResource, setActivePreviewResource] = useState<EducationalResource | null>(null);

  useEffect(() => {
    setSelectedCourseId(initialCourseId || 'all');
  }, [initialCourseId]);

  const loadResources = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [list, instList, periods] = await Promise.all([
        fetchEducationalResources({
          universityId,
          programId,
          studyLevelId,
          status: 'published'
        }),
        fetchCourseInstructors({ universityId, studyLevelId }),
        fetchStudyPeriods(studyLevelId, universityId)
      ]);
      setResources(list);
      setInstructors(instList);

      if (periods.length > 0) {
        const crsArrays = await Promise.all(
          periods.map((p) => fetchCourseOfferings(p.id, universityId).catch(() => []))
        );
        const mergedCourses = crsArrays.flat();
        if (mergedCourses.length > 0) {
          setCourses(mergedCourses);
        }
      }

      const activeUid = getActiveNotificationUser();
      if (activeUid && activeUid !== 'guest') {
        syncNotificationsForResources(activeUid, list, universityId, studyLevelId);
      }
    } catch (err) {
      console.warn('Failed to load educational resources:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = getCachedEducationalResources({
      universityId,
      programId,
      studyLevelId,
      status: 'published'
    });
    if (cached.length > 0) {
      setResources(cached);
    }
    loadResources(cached.length === 0);
    const unsub = subscribeToEducationalResources(
      {
        universityId,
        programId,
        studyLevelId,
        status: 'published'
      },
      (liveList) => {
        setResources(liveList);
        setLoading(false);
        const activeUid = getActiveNotificationUser();
        if (activeUid && activeUid !== 'guest') {
          syncNotificationsForResources(activeUid, liveList, universityId, studyLevelId);
        }
      }
    );
    return () => unsub();
  }, [universityId, programId, studyLevelId]);

  const courseScopedResources =
    selectedCourseId === 'all'
      ? resources
      : resources.filter((r) => r.courseOfferingId === selectedCourseId);

  const categories: { id: ResourceType | 'all'; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'all', label: 'الكل', icon: <BookOpen className="w-3.5 h-3.5" />, count: courseScopedResources.length },
    { id: 'pdf', label: 'ملفات PDF', icon: <FileText className="w-3.5 h-3.5" />, count: courseScopedResources.filter(r => r.resourceType === 'pdf').length },
    { id: 'image', label: 'شرائح وصور', icon: <ImageIcon className="w-3.5 h-3.5" />, count: courseScopedResources.filter(r => r.resourceType === 'image').length },
    { id: 'video', label: 'فيديوهات', icon: <Video className="w-3.5 h-3.5" />, count: courseScopedResources.filter(r => r.resourceType === 'video').length },
    { id: 'audio', label: 'تسجيلات صوتية', icon: <Volume2 className="w-3.5 h-3.5" />, count: courseScopedResources.filter(r => r.resourceType === 'audio').length },
    { id: 'link', label: 'روابط خارجية', icon: <ExternalLink className="w-3.5 h-3.5" />, count: courseScopedResources.filter(r => r.resourceType === 'link' || r.resourceType === 'video_link').length },
  ];

  const filteredResources = courseScopedResources
    .filter((res) => {
      const matchesType = selectedType === 'all' || res.resourceType === selectedType;
      const matchesSection = selectedSection === 'all' || res.sectionType === selectedSection;
      const matchesSearch = !searchQuery.trim() || 
        res.title.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (res.description && res.description.toLowerCase().includes(searchQuery.toLowerCase().trim()));
      return matchesType && matchesSection && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title, 'ar');
      }
      if (sortBy === 'size') {
        const parseSize = (label?: string) => {
          if (!label) return 0;
          const match = label.match(/([\d.]+)\s*(MB|KB|GB)?/i);
          if (!match) return 0;
          const val = parseFloat(match[1]) || 0;
          const unit = (match[2] || 'MB').toUpperCase();
          if (unit === 'GB') return val * 1024 * 1024;
          if (unit === 'MB') return val * 1024;
          return val;
        };
        return parseSize(b.fileSizeLabel) - parseSize(a.fileSizeLabel);
      }
      return 0;
    });

  const activeFilterCount = (selectedSection !== 'all' ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0);
  const selectedCourseObj = courses.find((c) => c.id === selectedCourseId);
  const activeCourseLabel = selectedCourseObj?.titleArabic || initialCourseTitle || '';

  return (
    <div className="space-y-3.5 max-w-full overflow-hidden">
      
      {/* 1. Compact Single-Line Header Bar */}
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <BookOpen className="w-4 h-4 text-teal-400 shrink-0" />
          <h2 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
            مكتبة الدفعة الطبية والشرائح ({courseScopedResources.length})
          </h2>
          {selectedCourseId !== 'all' && activeCourseLabel && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-bold">
              <span>مادة: {activeCourseLabel}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCourseId('all');
                  if (onClearCourseFilter) onClearCourseFilter();
                }}
                className="hover:text-rose-400 p-0.5"
                title="عرض جميع مواد الدفعة"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {courses.length > 0 && (
            <select
              value={selectedCourseId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCourseId(val);
                if (val === 'all' && onClearCourseFilter) onClearCourseFilter();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold"
            >
              <option value="all">جميع مواد الدفعة ({resources.length})</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titleArabic}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => loadResources(true)}
            disabled={loading}
            className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* 2. Responsive Category Chips Bar (flex-wrap so zero horizontal clipping on mobile) */}
      <div className="flex flex-wrap items-center gap-1.5 w-full">
        {categories.map((cat) => {
          const isActive = selectedType === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedType(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                isActive
                  ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                  : 'bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-color)]'
              }`}
            >
              <span className={isActive ? 'text-white' : 'text-teal-400'}>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isActive ? 'bg-teal-700/80 text-white' : 'bg-slate-950 text-slate-400'
              }`}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Search & Advanced Filter Bar */}
      <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-2.5 sm:p-3 flex flex-wrap sm:flex-nowrap items-center gap-2 text-xs">
        {/* Search input */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في المحاضرات، الشرائح، والمراجع..."
            className="w-full pl-8 pr-9 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-teal-500 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-2.5 p-0.5 text-slate-500 hover:text-white"
              title="مسح البحث"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Advanced Filters Button */}
        <button
          onClick={() => setShowFilterModal(true)}
          className={`py-2 px-3.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 ${
            activeFilterCount > 0
              ? 'bg-teal-500/15 border-teal-500 text-teal-300'
              : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
          <span>تصفية وترتيب</span>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-teal-500 text-white font-bold text-[10px] flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Active Filter Indicators Bar */}
      {(selectedSection !== 'all' || sortBy !== 'newest') && (
        <div className="flex items-center gap-2 flex-wrap text-[11px] bg-[var(--bg-card)] p-2.5 rounded-xl border border-[var(--border-color)]">
          <span className="text-slate-400 font-semibold">التصفيات النشطة:</span>
          {selectedSection !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 font-medium">
              <span>القسم: {selectedSection === 'theoretical' ? 'نظري فقط' : 'عملي ومختبر'}</span>
              <button onClick={() => setSelectedSection('all')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {sortBy !== 'newest' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-medium">
              <span>
                الترتيب: {sortBy === 'oldest' ? 'الأقدم أولاً' : sortBy === 'title' ? 'أبجدياً' : 'حسب الحجم'}
              </span>
              <button onClick={() => setSortBy('newest')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          <button
            onClick={() => {
              setSelectedSection('all');
              setSortBy('newest');
            }}
            className="text-slate-400 hover:text-rose-400 text-[11px] font-semibold underline underline-offset-2 mr-auto"
          >
            إعادة الضبط
          </button>
        </div>
      )}

      {/* 4. Resources Grid */}
      {filteredResources.length === 0 ? (
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-10 text-center text-slate-500 text-xs space-y-3">
          <BookOpen className="w-9 h-9 mx-auto text-slate-500" />
          <h4 className="font-bold text-[var(--text-primary)] text-sm">لا توجد مواد تعليمية مطابقة</h4>
          <p className="max-w-md mx-auto text-slate-400">
            لم نجد محاضرات أو شرائح تطابق معايير البحث أو التصفية الحالية. جرب تغيير نوع المورد أو مسح كلمات البحث.
          </p>
          {(selectedType !== 'all' || selectedSection !== 'all' || selectedCourseId !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedType('all');
                setSelectedSection('all');
                setSelectedCourseId('all');
                if (onClearCourseFilter) onClearCourseFilter();
                setSearchQuery('');
              }}
              className="py-2 px-4 rounded-xl bg-teal-600 text-white text-xs font-bold transition-colors"
            >
              عرض جميع المواد التعليمية
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredResources.map((res) => {
            const isPdf = res.resourceType === 'pdf';
            const isImage = res.resourceType === 'image';
            const isAudio = res.resourceType === 'audio';
            const isVideo = res.resourceType === 'video';
            const linkedCourse = courses.find((c) => c.id === res.courseOfferingId);
            const courseDoctor =
              linkedCourse?.instructorNameArabic ||
              (() => {
                const foundInst = instructors.find((i) => i.courseOfferingId === res.courseOfferingId);
                return foundInst ? `${foundInst.academicTitle || 'د.'} ${foundInst.instructorNameArabic}` : '';
              })();

            return (
              <div 
                key={res.id} 
                className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between transition-all text-xs group overflow-hidden"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border ${
                      isPdf ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' :
                      isImage ? 'bg-teal-500/15 text-teal-300 border-teal-500/30' :
                      isAudio ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                      isVideo ? 'bg-sky-500/15 text-sky-300 border-sky-500/30' :
                      'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    }`}>
                      {isPdf && <FileText className="w-3 h-3" />}
                      {isImage && <ImageIcon className="w-3 h-3" />}
                      {isAudio && <Volume2 className="w-3 h-3" />}
                      {isVideo && <Video className="w-3 h-3" />}
                      {!isPdf && !isImage && !isAudio && !isVideo && <ExternalLink className="w-3 h-3" />}
                      <span>
                        {isPdf ? 'ملف PDF' : isImage ? 'شريحة / صورة' : isAudio ? 'تسجيل صوتي' : isVideo ? 'فيديو طبي' : 'رابط خارجي'}
                      </span>
                    </span>

                    <span className="text-[10px] px-2 py-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-amber-300 font-mono font-bold">
                      {res.fileSizeLabel || '1.8 MB'}
                    </span>
                  </div>

                  <h3 className="font-bold text-[var(--text-primary)] text-sm sm:text-base mb-1.5 leading-snug group-hover:text-teal-400 transition-colors line-clamp-2">
                    {res.title}
                  </h3>

                  {res.description && (
                    <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed mb-2.5">
                      {res.description}
                    </p>
                  )}

                  {(linkedCourse || courseDoctor) && (
                    <div className="mb-2.5 px-2.5 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                      {linkedCourse && (
                        <span className="font-bold text-teal-300 truncate">
                          {linkedCourse.titleArabic}
                        </span>
                      )}
                      {courseDoctor && (
                        <span className="inline-flex items-center gap-1 text-[var(--text-primary)] font-semibold">
                          <Stethoscope className="w-3 h-3 text-teal-400 shrink-0" />
                          <span>{courseDoctor}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--border-color)] mt-2 space-y-2.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="px-2 py-0.5 rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] font-semibold text-[var(--text-primary)]">
                      {res.sectionType === 'theoretical' ? 'نظري' : res.sectionType === 'practical' ? 'عملي ومختبر' : 'عام'}
                    </span>
                    <span className="font-mono text-slate-400">{new Date(res.createdAt).toLocaleDateString('ar-YE')}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActivePreviewResource(res)}
                      className="flex-1 min-h-[42px] py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]"
                    >
                      <Eye className="w-4 h-4 shrink-0" />
                      <span>{isAudio ? 'استماع للمحاضرة' : 'معاينة وتحميل'}</span>
                    </button>

                    {!res.url.startsWith('umed-cloud://') && (
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[42px] min-w-[42px] p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 flex items-center justify-center shrink-0 active:scale-[0.98]"
                        title="فتح الرابط الأصلي"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Modern Filter & Sort Modal Sheet */}
      {showFilterModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto overscroll-contain" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 sm:rounded-2xl rounded-t-2xl max-w-md w-full max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:fade-in duration-200">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white">تصفية وترتيب المواد الطبية</h3>
              </div>
              <button
                onClick={() => setShowFilterModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* Section Type Filter */}
              <div className="space-y-2">
                <label className="text-slate-300 font-bold block">القسم الأكاديمي / الشعبة:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'الكل (نظري وعملي)' },
                    { id: 'theoretical', label: 'القسم النظري' },
                    { id: 'practical', label: 'العملي والمختبر' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSection(s.id as any)}
                      className={`p-2.5 rounded-xl border font-bold text-center transition-all ${
                        selectedSection === s.id
                          ? 'bg-teal-600/20 border-teal-500 text-teal-300 ring-1 ring-teal-500/50'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort Order */}
              <div className="space-y-2">
                <label className="text-slate-300 font-bold block">ترتيب المخرجات حسب:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'newest', label: 'الأحدث إضافة أولاً' },
                    { id: 'oldest', label: 'الأقدم تاريخاً' },
                    { id: 'title', label: 'أبجدياً (أ - ي)' },
                    { id: 'size', label: 'حسب حجم الملف' },
                  ].map((sortItem) => (
                    <button
                      key={sortItem.id}
                      type="button"
                      onClick={() => setSortBy(sortItem.id as SortOption)}
                      className={`p-2.5 rounded-xl border font-bold text-center transition-all ${
                        sortBy === sortItem.id
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/50'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {sortItem.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedSection('all');
                  setSortBy('newest');
                }}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                إعادة ضبط
              </button>
              <button
                type="button"
                onClick={() => setShowFilterModal(false)}
                className="py-2.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md shadow-teal-900/40"
              >
                تطبيق التصفية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Active Preview Modal */}
      {activePreviewResource && (
        <ResourcePreviewModal
          resource={activePreviewResource}
          onClose={() => setActivePreviewResource(null)}
        />
      )}

    </div>
  );
}
