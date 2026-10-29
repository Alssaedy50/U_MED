/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Student Medical Library
 * Always-Visible Top Search & Content Type Bar + Collapsible Advanced Filter Drawer
 * (Level, Study Period/Block, Course, Doctor, Section, Sort Order)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Layers,
  LayoutGrid,
  Rows3,
  X
} from 'lucide-react';
import {
  EducationalResource,
  ResourceType,
  StudyPeriod,
  CourseOffering,
  CourseInstructor
} from '../../types/umed.ts';
import {
  fetchEducationalResources,
  getCachedEducationalResources,
  subscribeToEducationalResources,
  normalizeFileSizeLabel
} from '../../services/resourceService.ts';
import {
  getCachedCollection,
  fetchStudyPeriods,
  fetchCourseOfferings,
  subscribeToAcademicHierarchy
} from '../../services/academicService.ts';
import {
  fetchCourseInstructors,
  getCachedCourseInstructors,
  subscribeToCourseInstructors
} from '../../services/batchGovernanceService.ts';
import {
  getActiveNotificationUser,
  syncNotificationsForResources
} from '../../services/notificationService.ts';
import { STUDY_LEVELS_OPTIONS } from '../../lib/firebase.ts';
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
type ShelfCategoryId = 'all' | 'books_summaries' | 'visual_media' | 'audio_records';

interface ClassifiedResource {
  resource: EducationalResource;
  isVideo: boolean;
  isAudio: boolean;
  isImage: boolean;
  isPdf: boolean;
  isLink: boolean;
  shelfCategory: Exclude<ShelfCategoryId, 'all'>;
}

export default function StudentMedicalLibrary({
  universityId,
  programId,
  studyLevelId,
  initialCourseId,
  initialCourseTitle,
  onClearCourseFilter
}: StudentMedicalLibraryProps) {
  // Detailed Filter States (Grouped inside the Collapsible Advanced Filters Drawer)
  const [filterLevelId, setFilterLevelId] = useState<string>(studyLevelId);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('all');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(initialCourseId || 'all');
  const [selectedDoctorName, setSelectedDoctorName] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<'all' | 'theoretical' | 'practical'>('all');
  const [selectedType, setSelectedType] = useState<ResourceType | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Always-Visible Top Search & Content Type Bar States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedShelf, setSelectedShelf] = useState<ShelfCategoryId>('all');
  const [viewLayout, setViewLayout] = useState<'shelves' | 'grid'>('shelves');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  const [resources, setResources] = useState<EducationalResource[]>(() =>
    getCachedEducationalResources({
      universityId,
      programId,
      studyLevelId: filterLevelId,
      status: 'published'
    })
  );
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>(() =>
    getCachedCollection<StudyPeriod>('studyPeriods')
      .filter((p) => p.studyLevelId === filterLevelId && (!p.universityId || p.universityId === universityId) && !p.isArchived)
      .sort((a, b) => a.order - b.order)
  );
  const [courses, setCourses] = useState<CourseOffering[]>(() => {
    const levelPeriodIds = new Set(
      getCachedCollection<StudyPeriod>('studyPeriods')
        .filter((p) => p.studyLevelId === filterLevelId && (!p.universityId || p.universityId === universityId) && !p.isArchived)
        .map((p) => p.id)
    );
    return getCachedCollection<CourseOffering>('courseOfferings').filter(
      (c) => Boolean(c.studyPeriodId && levelPeriodIds.has(c.studyPeriodId)) && (!c.universityId || c.universityId === universityId)
    );
  });
  const [instructors, setInstructors] = useState<CourseInstructor[]>(() =>
    getCachedCourseInstructors({ universityId, studyLevelId: filterLevelId })
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [activePreviewResource, setActivePreviewResource] = useState<EducationalResource | null>(null);

  // Horizontal scroll refs
  const categoryStripRef = useRef<HTMLDivElement | null>(null);
  const shelfRefs = useRef<Record<string, HTMLDivElement | null>>({
    books_summaries: null,
    visual_media: null,
    audio_records: null
  });

  useEffect(() => {
    setFilterLevelId(studyLevelId);
  }, [studyLevelId]);

  useEffect(() => {
    setSelectedCourseId(initialCourseId || 'all');
  }, [initialCourseId]);

  const scrollHorizontalContainer = (container: HTMLDivElement | null, direction: 'next' | 'prev') => {
    if (!container) return;
    const distance = Math.max(280, Math.round(container.clientWidth * 0.78));
    const delta = direction === 'next' ? -distance : distance;
    container.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const loadResources = async (showSpinner = false, targetLevel = filterLevelId) => {
    if (showSpinner) setLoading(true);
    try {
      const [list, instList, periods] = await Promise.all([
        fetchEducationalResources({
          universityId,
          programId,
          studyLevelId: targetLevel,
          status: 'published'
        }),
        fetchCourseInstructors({ universityId, studyLevelId: targetLevel }),
        fetchStudyPeriods(targetLevel, universityId)
      ]);
      setResources(list);
      setInstructors(instList);

      const activePeriods = periods.filter((p) => !p.isArchived).sort((a, b) => a.order - b.order);
      setStudyPeriods(activePeriods);
      if (activePeriods.length > 0) {
        const crsArrays = await Promise.all(
          activePeriods.map((p) => fetchCourseOfferings(p.id, universityId).catch(() => []))
        );
        setCourses(crsArrays.flat());
      } else {
        setCourses([]);
      }

      const activeUid = getActiveNotificationUser();
      if (activeUid && activeUid !== 'guest') {
        syncNotificationsForResources(activeUid, list, universityId, targetLevel);
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
      studyLevelId: filterLevelId,
      status: 'published'
    });
    if (cached.length > 0) {
      setResources(cached);
    }
    loadResources(cached.length === 0, filterLevelId);

    const unsubResources = subscribeToEducationalResources(
      {
        universityId,
        programId,
        studyLevelId: filterLevelId,
        status: 'published'
      },
      (liveList) => {
        setResources(liveList);
        setLoading(false);
        const activeUid = getActiveNotificationUser();
        if (activeUid && activeUid !== 'guest') {
          syncNotificationsForResources(activeUid, liveList, universityId, filterLevelId);
        }
      }
    );

    const unsubHierarchy = subscribeToAcademicHierarchy(() => {
      const activePeriods = getCachedCollection<StudyPeriod>('studyPeriods')
        .filter((p) => p.studyLevelId === filterLevelId && (!p.universityId || p.universityId === universityId) && !p.isArchived)
        .sort((a, b) => a.order - b.order);
      setStudyPeriods(activePeriods);
      const periodIds = new Set(activePeriods.map((p) => p.id));
      const liveCourses = getCachedCollection<CourseOffering>('courseOfferings').filter(
        (c) => Boolean(c.studyPeriodId && periodIds.has(c.studyPeriodId)) && (!c.universityId || c.universityId === universityId)
      );
      setCourses(liveCourses);
    });

    const unsubInstructors = subscribeToCourseInstructors(
      universityId,
      filterLevelId,
      (liveInstructors: CourseInstructor[]) => {
        setInstructors(liveInstructors);
      }
    );

    return () => {
      unsubResources();
      unsubHierarchy();
      unsubInstructors();
    };
  }, [universityId, programId, filterLevelId]);

  const classifyResource = (res: EducationalResource): ClassifiedResource => {
    const lowerFile = (res.fileName || res.title || '').toLowerCase().replace(/\.html$/i, '');
    const lowerMime = (res.mimeType || '').toLowerCase();

    const isVideo =
      res.resourceType === 'video' ||
      res.resourceType === 'video_link' ||
      lowerFile.endsWith('.mp4') ||
      lowerFile.endsWith('.mkv') ||
      lowerFile.endsWith('.webm') ||
      lowerMime.includes('video');

    const isAudio =
      !isVideo &&
      (res.resourceType === 'audio' ||
        lowerFile.endsWith('.mp3') ||
        lowerFile.endsWith('.m4a') ||
        lowerFile.endsWith('.ogg') ||
        lowerFile.endsWith('.wav') ||
        lowerMime.includes('audio'));

    const isImage =
      !isVideo &&
      !isAudio &&
      (res.resourceType === 'image' ||
        lowerFile.endsWith('.jpg') ||
        lowerFile.endsWith('.jpeg') ||
        lowerFile.endsWith('.png') ||
        lowerFile.endsWith('.webp') ||
        lowerMime.includes('image'));

    const isPdf = !isVideo && !isAudio && !isImage && res.resourceType === 'pdf';
    const isLink = !isVideo && !isAudio && !isImage && !isPdf;

    let shelfCategory: Exclude<ShelfCategoryId, 'all'> = 'books_summaries';
    if (isAudio) {
      shelfCategory = 'audio_records';
    } else if (isImage || isVideo) {
      shelfCategory = 'visual_media';
    } else {
      shelfCategory = 'books_summaries';
    }

    return {
      resource: res,
      isVideo,
      isAudio,
      isImage,
      isPdf,
      isLink,
      shelfCategory
    };
  };

  // Filtered Courses for the selected Period (Block)
  const periodScopedCourses = useMemo(() => {
    if (selectedPeriodId === 'all') return courses;
    return courses.filter((c) => c.studyPeriodId === selectedPeriodId);
  }, [courses, selectedPeriodId]);

  // Available Doctor Options across courses & instructors
  const availableDoctors = useMemo(() => {
    const names = new Set<string>();
    for (const c of courses) {
      if (c.instructorNameArabic?.trim()) names.add(c.instructorNameArabic.trim());
    }
    for (const inst of instructors) {
      const full = `${inst.academicTitle || 'د.'} ${inst.instructorNameArabic}`.trim();
      if (full) names.add(full);
    }
    return Array.from(names);
  }, [courses, instructors]);

  // Resources after applying Advanced Filters (Level, Period, Course, Doctor, Section)
  const advancedScopedResources = useMemo(() => {
    return resources.filter((res) => {
      // Period filter
      if (selectedPeriodId !== 'all') {
        const matchesPeriodDirect = res.studyPeriodId === selectedPeriodId;
        const linkedCourse = courses.find((c) => c.id === res.courseOfferingId);
        const matchesPeriodViaCourse = linkedCourse?.studyPeriodId === selectedPeriodId;
        if (!matchesPeriodDirect && !matchesPeriodViaCourse) return false;
      }

      // Course filter
      if (selectedCourseId !== 'all' && res.courseOfferingId !== selectedCourseId) {
        return false;
      }

      // Doctor filter
      if (selectedDoctorName !== 'all') {
        const linkedCourse = courses.find((c) => c.id === res.courseOfferingId);
        const courseDoc = linkedCourse?.instructorNameArabic?.trim() || '';
        const matchingInsts = instructors
          .filter((i) => i.courseOfferingId === res.courseOfferingId)
          .map((i) => `${i.academicTitle || 'د.'} ${i.instructorNameArabic}`.trim());
        if (courseDoc !== selectedDoctorName && !matchingInsts.includes(selectedDoctorName)) {
          return false;
        }
      }

      // Section filter
      if (selectedSection === 'theoretical' && res.sectionType === 'practical') {
        return false;
      }
      if (selectedSection === 'practical' && res.sectionType !== 'practical') {
        return false;
      }

      return true;
    });
  }, [resources, selectedPeriodId, selectedCourseId, selectedDoctorName, selectedSection, courses, instructors]);

  const classifiedAndFiltered = useMemo(() => {
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

    return advancedScopedResources
      .map(classifyResource)
      .filter((item) => {
        const { resource, shelfCategory } = item;
        const matchesShelf = selectedShelf === 'all' || shelfCategory === selectedShelf;
        const matchesType =
          selectedType === 'all' ||
          resource.resourceType === selectedType ||
          (selectedType === 'link' && resource.resourceType === 'video_link');
        const matchesSearch =
          !searchQuery.trim() ||
          resource.title.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
          (resource.description &&
            resource.description.toLowerCase().includes(searchQuery.toLowerCase().trim()));
        return matchesShelf && matchesType && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.resource.createdAt || 0).getTime() - new Date(a.resource.createdAt || 0).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.resource.createdAt || 0).getTime() - new Date(b.resource.createdAt || 0).getTime();
        }
        if (sortBy === 'title') {
          return a.resource.title.localeCompare(b.resource.title, 'ar');
        }
        if (sortBy === 'size') {
          return parseSize(b.resource.fileSizeLabel) - parseSize(a.resource.fileSizeLabel);
        }
        return 0;
      });
  }, [advancedScopedResources, selectedShelf, selectedType, searchQuery, sortBy]);

  // Counts per shelf in current advanced filter scope
  const shelfCounts = useMemo(() => {
    let books_summaries = 0;
    let visual_media = 0;
    let audio_records = 0;
    for (const r of advancedScopedResources) {
      const c = classifyResource(r);
      if (c.shelfCategory === 'books_summaries') books_summaries++;
      else if (c.shelfCategory === 'visual_media') visual_media++;
      else if (c.shelfCategory === 'audio_records') audio_records++;
    }
    return {
      all: advancedScopedResources.length,
      books_summaries,
      visual_media,
      audio_records
    };
  }, [advancedScopedResources]);

  const shelvesConfig: {
    id: Exclude<ShelfCategoryId, 'all'>;
    title: string;
    subtitle: string;
    badgeText: string;
    icon: React.ReactNode;
    accentColorClass: string;
    items: ClassifiedResource[];
  }[] = useMemo(() => {
    return [
      {
        id: 'books_summaries',
        title: 'الكتب والملخصات والمحاضرات النصية',
        subtitle: 'ملفات المحاضرات (PDF)، الكتب المرجعية، والملخصات المعتمدة للمقرر',
        badgeText: 'كتب وملخصات PDF',
        icon: <FileText className="w-4 h-4 text-teal-400" />,
        accentColorClass: 'text-teal-400 border-teal-500/30 bg-teal-500/10',
        items: classifiedAndFiltered.filter((i) => i.shelfCategory === 'books_summaries')
      },
      {
        id: 'visual_media',
        title: 'المرئيات والصور والشرائح الطبية',
        subtitle: 'شرائح الأنسجة والباثولوجي، الصور السريرية، وشروحات الفيديو المرئية',
        badgeText: 'مرئيات وصور',
        icon: <Video className="w-4 h-4 text-sky-400" />,
        accentColorClass: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
        items: classifiedAndFiltered.filter((i) => i.shelfCategory === 'visual_media')
      },
      {
        id: 'audio_records',
        title: 'التسجيلات الصوتية للمحاضرات',
        subtitle: 'التسجيلات الصوتية المباشرة لشرح الدكاترة داخل القاعات والمعامل',
        badgeText: 'تسجيلات صوتية',
        icon: <Volume2 className="w-4 h-4 text-amber-400" />,
        accentColorClass: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
        items: classifiedAndFiltered.filter((i) => i.shelfCategory === 'audio_records')
      }
    ];
  }, [classifiedAndFiltered]);

  // Content Type Bar (Always visible at the top)
  const shelfFilterTabs: {
    id: ShelfCategoryId;
    label: string;
    icon: React.ReactNode;
    count: number;
  }[] = [
    {
      id: 'all',
      label: 'الكل',
      icon: <Layers className="w-4 h-4" />,
      count: shelfCounts.all
    },
    {
      id: 'books_summaries',
      label: 'كتب وملخصات',
      icon: <FileText className="w-4 h-4" />,
      count: shelfCounts.books_summaries
    },
    {
      id: 'visual_media',
      label: 'مرئيات وصور',
      icon: <Video className="w-4 h-4" />,
      count: shelfCounts.visual_media
    },
    {
      id: 'audio_records',
      label: 'تسجيلات صوتية',
      icon: <Volume2 className="w-4 h-4" />,
      count: shelfCounts.audio_records
    }
  ];

  const activeFilterCount =
    (filterLevelId !== studyLevelId ? 1 : 0) +
    (selectedPeriodId !== 'all' ? 1 : 0) +
    (selectedCourseId !== 'all' ? 1 : 0) +
    (selectedDoctorName !== 'all' ? 1 : 0) +
    (selectedSection !== 'all' ? 1 : 0) +
    (selectedType !== 'all' ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0);

  const selectedCourseObj = courses.find((c) => c.id === selectedCourseId);
  const activeCourseLabel = selectedCourseObj?.titleArabic || initialCourseTitle || '';

  const resetAllFilters = () => {
    setFilterLevelId(studyLevelId);
    setSelectedPeriodId('all');
    setSelectedCourseId('all');
    setSelectedDoctorName('all');
    setSelectedSection('all');
    setSelectedType('all');
    setSortBy('newest');
    if (onClearCourseFilter) onClearCourseFilter();
  };

  const renderResourceCard = (item: ClassifiedResource, isHorizontalCard: boolean) => {
    const { resource: res, isVideo, isAudio, isImage, isPdf } = item;
    const linkedCourse = courses.find((c) => c.id === res.courseOfferingId);
    const courseDoctor =
      linkedCourse?.instructorNameArabic ||
      (() => {
        const foundInst = instructors.find((i) => i.courseOfferingId === res.courseOfferingId);
        return foundInst ? `${foundInst.academicTitle || 'د.'} ${foundInst.instructorNameArabic}` : '';
      })();

    const typeLabel = isPdf
      ? 'كتاب / محاضرة PDF'
      : isImage
      ? 'شريحة / صورة طبية'
      : isAudio
      ? 'تسجيل صوتي'
      : isVideo
      ? 'فيديو تعليمي'
      : 'مرجع / رابط خارجي';

    const sectionLabel =
      res.sectionType === 'practical'
        ? 'عملي ومختبر'
        : res.sectionType === 'theoretical'
        ? 'نظري'
        : 'عام';

    return (
      <div
        key={res.id}
        className={`umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between transition-all text-xs group overflow-hidden hover:border-teal-500/40 ${
          isHorizontalCard
            ? 'w-[280px] sm:w-[320px] lg:w-[340px] shrink-0 snap-start'
            : 'w-full'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-3 text-[11px]">
            <div className="flex items-center gap-1.5 font-bold min-w-0">
              <span
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border ${
                  isPdf
                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                    : isImage
                    ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                    : isAudio
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : isVideo
                    ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                    : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                }`}
              >
                {isPdf && <FileText className="w-3.5 h-3.5" />}
                {isImage && <ImageIcon className="w-3.5 h-3.5" />}
                {isAudio && <Volume2 className="w-3.5 h-3.5" />}
                {isVideo && <Video className="w-3.5 h-3.5" />}
                {!isPdf && !isImage && !isAudio && !isVideo && <ExternalLink className="w-3.5 h-3.5" />}
              </span>
              <span className="text-[var(--text-primary)] truncate">{typeLabel}</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] shrink-0 tabular-nums">
              <span
                className={
                  res.sectionType === 'practical' ? 'text-amber-400 font-bold' : 'text-teal-400 font-bold'
                }
              >
                {sectionLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono" dir="ltr">{normalizeFileSizeLabel(res.fileSizeLabel)}</span>
            </div>
          </div>

          <h3 className="font-bold text-[var(--text-primary)] text-sm sm:text-base mb-1.5 leading-snug group-hover:text-teal-400 transition-colors line-clamp-2">
            {res.title}
          </h3>

          {res.description && (
            <p className="text-[var(--text-secondary)] text-[11px] line-clamp-2 leading-relaxed mb-2.5">
              {res.description}
            </p>
          )}

          {(linkedCourse || courseDoctor) && (
            <div className="mb-2.5 pt-2 border-t border-[var(--border-color)]/60 flex flex-wrap items-center gap-1.5 text-[11px]">
              {linkedCourse && (
                <span className="font-bold text-teal-400 truncate max-w-[65%]">
                  {linkedCourse.titleArabic}
                </span>
              )}
              {linkedCourse && courseDoctor && (
                <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
              )}
              {courseDoctor && (
                <span className="inline-flex items-center gap-1 text-[var(--text-secondary)] font-semibold truncate">
                  <Stethoscope className="w-3 h-3 text-teal-400 shrink-0" />
                  <span className="truncate">{courseDoctor}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="pt-2.5 border-t border-[var(--border-color)] mt-2 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] tabular-nums">
            <span>تاريخ النشر</span>
            <span className="font-mono">
              {(() => {
                try {
                  return new Date(res.createdAt).toLocaleDateString('ar-EG-u-nu-latn', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                  });
                } catch {
                  return res.createdAt;
                }
              })()}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActivePreviewResource(res)}
              className="flex-1 min-h-[42px] py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] whitespace-nowrap"
            >
              <Eye className="w-4 h-4 shrink-0" />
              <span>
                {isVideo ? 'تشغيل الفيديو' : isAudio ? 'استماع للتسجيل' : 'معاينة وتحميل'}
              </span>
            </button>

            {!res.url.startsWith('umed-cloud://') && !res.url.startsWith('/api/teledrive/stream/') && (
              <a
                href={res.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] min-w-[42px] p-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] transition-colors border border-[var(--border-color)] flex items-center justify-center shrink-0 active:scale-[0.98]"
                title="فتح الرابط الأصلي"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3.5 max-w-full overflow-hidden" dir="rtl">
      {/* 1. Always-Visible Sticky Top Control Card: Search Bar + Content Type Bar + Collapsible Advanced Filter Drawer */}
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-sm">
        {/* Top Row: Title + Search Input + Advanced Filters Button + Layout Toggle */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] truncate">
                    المكتبة الطبية الرقمية
                  </h2>
                  <span className="text-xs text-teal-400 font-mono font-bold tabular-nums whitespace-nowrap">
                    ({classifiedAndFiltered.length})
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile-visible Layout & Refresh */}
            <div className="flex md:hidden items-center gap-1.5 shrink-0">
              <div className="flex items-center p-0.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs">
                <button
                  type="button"
                  onClick={() => setViewLayout('shelves')}
                  className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${
                    viewLayout === 'shelves'
                      ? 'bg-teal-600 text-white'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <Rows3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewLayout('grid')}
                  className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${
                    viewLayout === 'grid'
                      ? 'bg-teal-600 text-white'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => loadResources(true)}
                disabled={loading}
                className="p-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)]"
                title="تحديث"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Always-Visible Search Input + "تصفية متقدمة" Drawer Toggle Button */}
          <div className="flex items-center gap-2 flex-1 md:max-w-xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في الكتب، الملخصات، الشرائح، أو التسجيلات..."
                className="w-full min-h-[40px] pl-8 pr-9 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-teal-500 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  title="مسح البحث"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters(prev => !prev)}
              className={`min-h-[40px] py-2 px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 whitespace-nowrap ${
                showAdvancedFilters || activeFilterCount > 0
                  ? 'bg-teal-600/15 border-teal-500 text-teal-400'
                  : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>تصفية متقدمة</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-teal-600 text-white font-mono text-[10px] font-bold tabular-nums">
                  {activeFilterCount}
                </span>
              )}
              {showAdvancedFilters ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Desktop Layout & Refresh */}
            <div className="hidden md:flex items-center gap-1.5 shrink-0">
              <div className="flex items-center p-0.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs">
                <button
                  type="button"
                  onClick={() => setViewLayout('shelves')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors whitespace-nowrap ${
                    viewLayout === 'shelves'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Rows3 className="w-3.5 h-3.5 shrink-0" />
                  <span>أرفف</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewLayout('grid')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors whitespace-nowrap ${
                    viewLayout === 'grid'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                  <span>شبكة</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => loadResources(true)}
                disabled={loading}
                className="min-h-[36px] py-1.5 px-3 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[var(--border-color)] shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
                <span>تحديث</span>
              </button>
            </div>
          </div>
        </div>

        {/* Always-Visible Content Type Bar: [الكل | كتب وملخصات | مرئيات وصور | تسجيلات صوتية] */}
        <div
          ref={categoryStripRef}
          className="flex items-center gap-2 overflow-x-auto pt-0.5 pb-0.5 scroll-smooth snap-x snap-mandatory [scrollbar-width:none]"
        >
          {shelfFilterTabs.map((tab) => {
            const isActive = selectedShelf === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedShelf(tab.id);
                  setSelectedType('all');
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 shrink-0 snap-start whitespace-nowrap tabular-nums ${
                  isActive
                    ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                    : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-color)]'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-teal-400'}>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`text-[11px] font-mono font-bold ${
                    isActive ? 'text-teal-100' : 'text-teal-400'
                  }`}
                >
                  ({tab.count})
                </span>
              </button>
            );
          })}

          {/* Active Course Pill if pre-selected */}
          {selectedCourseId !== 'all' && activeCourseLabel && (
            <button
              type="button"
              onClick={() => {
                setSelectedCourseId('all');
                if (onClearCourseFilter) onClearCourseFilter();
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-400 text-xs font-bold flex items-center gap-1.5 shrink-0"
            >
              <span>المقرر: {activeCourseLabel}</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Collapsible Advanced Filters Drawer (المستوى، الفترة، المقرر، الدكتور، القسم، الترتيب) */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-[var(--border-color)] space-y-3 text-xs animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* 1. Study Level */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">المستوى الدراسي:</label>
                <select
                  value={filterLevelId}
                  onChange={(e) => {
                    setFilterLevelId(e.target.value);
                    setSelectedPeriodId('all');
                    setSelectedCourseId('all');
                    setSelectedDoctorName('all');
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
                >
                  {STUDY_LEVELS_OPTIONS.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.nameArabic}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Study Period / Block */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">الفترة / البلوك الدراسي:</label>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => {
                    setSelectedPeriodId(e.target.value);
                    setSelectedCourseId('all');
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
                >
                  <option value="all">جميع الفترات والبلوكات ({studyPeriods.length})</option>
                  {studyPeriods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.titleArabic} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Course */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">المقرر الدراسي:</label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value);
                    if (e.target.value === 'all' && onClearCourseFilter) {
                      onClearCourseFilter();
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
                >
                  <option value="all">جميع المقررات ({periodScopedCourses.length})</option>
                  {periodScopedCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.titleArabic}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Doctor / Instructor */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">الدكتور / مدرس المادة:</label>
                <select
                  value={selectedDoctorName}
                  onChange={(e) => setSelectedDoctorName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
                >
                  <option value="all">جميع الدكاترة ({availableDoctors.length})</option>
                  {availableDoctors.map((docName) => (
                    <option key={docName} value={docName}>
                      {docName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              {/* 5. Academic Section (Theoretical / Practical) */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">القسم الأكاديمي (نظري / عملي):</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'theoretical', label: 'النظري' },
                    { id: 'practical', label: 'العملي' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSection(s.id as any)}
                      className={`py-1.5 rounded-lg font-bold text-[11px] transition-all ${
                        selectedSection === s.id
                          ? 'bg-teal-600 text-white'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Specific File Type */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">نوع الملف الدقيق:</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
                >
                  <option value="all">جميع الصيغ والأنواع</option>
                  <option value="pdf">ملفات PDF وكتب</option>
                  <option value="image">شرائح وصور طبية</option>
                  <option value="video">محاضرات فيديو</option>
                  <option value="audio">تسجيلات صوتية</option>
                  <option value="link">روابط ومراجع خارجية</option>
                </select>
              </div>

              {/* 7. Sort Order */}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">ترتيب النتائج حسب:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] font-bold text-xs focus:outline-none focus:border-teal-500"
                >
                  <option value="newest">الأحدث إضافة أولاً</option>
                  <option value="oldest">الأقدم تاريخاً</option>
                  <option value="title">أبجدياً (أ - ي)</option>
                  <option value="size">حسب حجم الملف</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-bold"
              >
                إعادة ضبط الفلاتر
              </button>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
              >
                إخفاء لوحة الفلترة ({classifiedAndFiltered.length} نتيجة)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Main Content Area: Horizontal Shelves or Focused Grid */}
      {classifiedAndFiltered.length === 0 ? (
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-10 text-center text-[var(--text-muted)] text-xs space-y-3">
          <BookOpen className="w-9 h-9 mx-auto text-[var(--text-muted)]" />
          <h4 className="font-bold text-[var(--text-primary)] text-sm">لا توجد مواد تعليمية مطابقة</h4>
          <p className="max-w-md mx-auto text-[var(--text-secondary)] leading-relaxed">
            لم نجد كتب أو ملخصات أو شرائح أو تسجيلات تطابق عوامل التصفية المحددة حالياً. جرب تغيير نوع المحتوى أو إعادة ضبط الفلاتر.
          </p>
          {(selectedShelf !== 'all' || activeFilterCount > 0 || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedShelf('all');
                setSearchQuery('');
                resetAllFilters();
              }}
              className="min-h-[42px] py-2 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors"
            >
              إعادة عرض جميع المواد والأرفف
            </button>
          )}
        </div>
      ) : viewLayout === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {classifiedAndFiltered.map((item) => renderResourceCard(item, false))}
        </div>
      ) : (
        <div className="space-y-5">
          {shelvesConfig
            .filter((shelf) =>
              selectedShelf === 'all' ? shelf.items.length > 0 : shelf.id === selectedShelf
            )
            .map((shelf) => (
              <section
                key={shelf.id}
                className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-[var(--border-color)]">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${shelf.accentColorClass}`}
                    >
                      {shelf.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                          {shelf.title}
                        </h3>
                        <span className="text-xs font-mono font-bold text-teal-400 tabular-nums whitespace-nowrap">
                          ({shelf.items.length} ملف)
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{shelf.subtitle}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {selectedShelf === 'all' ? (
                      <button
                        type="button"
                        onClick={() => setSelectedShelf(shelf.id)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-xs font-bold text-teal-400 transition-colors whitespace-nowrap"
                      >
                        التركيز على هذا الرف ({shelf.items.length})
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedShelf('all')}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-xs font-bold text-amber-400 transition-colors whitespace-nowrap"
                      >
                        عرض جميع الأرفف الثلاثة
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => scrollHorizontalContainer(shelfRefs.current[shelf.id], 'prev')}
                      className="min-h-[36px] min-w-[36px] rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] flex items-center justify-center transition-colors"
                      title="تمرير لليمين"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollHorizontalContainer(shelfRefs.current[shelf.id], 'next')}
                      className="min-h-[36px] min-w-[36px] rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] flex items-center justify-center transition-colors"
                      title="تمرير لليسار"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div
                  ref={(el) => {
                    shelfRefs.current[shelf.id] = el;
                  }}
                  className="flex items-stretch gap-3.5 overflow-x-auto pb-2 pt-0.5 scroll-smooth snap-x snap-mandatory [scrollbar-width:thin]"
                >
                  {shelf.items.map((item) => renderResourceCard(item, true))}
                </div>
              </section>
            ))}
        </div>
      )}

      {/* Active Preview Modal */}
      {activePreviewResource && (
        <ResourcePreviewModal
          resource={activePreviewResource}
          onClose={() => setActivePreviewResource(null)}
        />
      )}
    </div>
  );
}
