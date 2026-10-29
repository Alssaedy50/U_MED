/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Student Medical Library
 * Horizontal Scroll Course Strip, Theoretical/Practical Academic Split,
 * and Categorized Horizontal Media Shelves (Books/Summaries, Slides/Videos, Audio Recordings)
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
  Layers,
  FlaskConical,
  GraduationCap,
  LayoutGrid,
  Rows3,
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
  const [resources, setResources] = useState<EducationalResource[]>(() =>
    getCachedEducationalResources({
      universityId,
      programId,
      studyLevelId,
      status: 'published'
    })
  );
  const [courses, setCourses] = useState<CourseOffering[]>(() => {
    const levelPeriodIds = new Set(
      getCachedCollection<{ id: string; studyLevelId: string; universityId?: string; isArchived?: boolean }>('studyPeriods')
        .filter((p) => p.studyLevelId === studyLevelId && (!p.universityId || p.universityId === universityId) && !p.isArchived)
        .map((p) => p.id)
    );
    return getCachedCollection<CourseOffering>('courseOfferings').filter(
      (c) => Boolean(c.studyPeriodId && levelPeriodIds.has(c.studyPeriodId)) && (!c.universityId || c.universityId === universityId)
    );
  });
  const [instructors, setInstructors] = useState<CourseInstructor[]>(() =>
    getCachedCourseInstructors({ universityId, studyLevelId })
  );
  const [selectedCourseId, setSelectedCourseId] = useState<string>(initialCourseId || 'all');
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedShelf, setSelectedShelf] = useState<ShelfCategoryId>('all');
  const [selectedType, setSelectedType] = useState<ResourceType | 'all'>('all');
  const [selectedSection, setSelectedSection] = useState<'all' | 'theoretical' | 'practical'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewLayout, setViewLayout] = useState<'shelves' | 'grid'>('shelves');
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [activePreviewResource, setActivePreviewResource] = useState<EducationalResource | null>(null);

  // Horizontal scroll refs
  const courseStripRef = useRef<HTMLDivElement | null>(null);
  const categoryStripRef = useRef<HTMLDivElement | null>(null);
  const shelfRefs = useRef<Record<string, HTMLDivElement | null>>({
    books_summaries: null,
    visual_media: null,
    audio_records: null
  });

  useEffect(() => {
    setSelectedCourseId(initialCourseId || 'all');
  }, [initialCourseId]);

  const scrollHorizontalContainer = (container: HTMLDivElement | null, direction: 'next' | 'prev') => {
    if (!container) return;
    const distance = Math.max(280, Math.round(container.clientWidth * 0.78));
    // In RTL layout, scrolling "next" (towards the left) uses negative delta
    const delta = direction === 'next' ? -distance : distance;
    container.scrollBy({ left: delta, behavior: 'smooth' });
  };

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

      const activePeriods = periods.filter((p) => !p.isArchived);
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

    const unsubResources = subscribeToEducationalResources(
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

    const unsubHierarchy = subscribeToAcademicHierarchy(() => {
      const activePeriods = getCachedCollection<{ id: string; studyLevelId: string; universityId?: string; isArchived?: boolean }>('studyPeriods')
        .filter((p) => p.studyLevelId === studyLevelId && (!p.universityId || p.universityId === universityId) && !p.isArchived);
      const periodIds = new Set(activePeriods.map((p) => p.id));
      const liveCourses = getCachedCollection<CourseOffering>('courseOfferings').filter(
        (c) => Boolean(c.studyPeriodId && periodIds.has(c.studyPeriodId)) && (!c.universityId || c.universityId === universityId)
      );
      setCourses(liveCourses);
    });

    const unsubInstructors = subscribeToCourseInstructors(
      universityId,
      studyLevelId,
      (liveInstructors: CourseInstructor[]) => {
        setInstructors(liveInstructors);
      }
    );

    return () => {
      unsubResources();
      unsubHierarchy();
      unsubInstructors();
    };
  }, [universityId, programId, studyLevelId]);

  // Classify each resource into its media type and one of the 3 core shelves:
  // 1) books_summaries (كتب وملخصات ومحاضرات نصية)
  // 2) visual_media (صور وشرائح وفيديوهات مرئية)
  // 3) audio_records (تسجيلات صوتية وشروحات مسموعة)
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

  // Build unified course cards list for the horizontal course scroller
  const courseCards = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        titleArabic: string;
        doctorName: string;
        totalCount: number;
        theoreticalCount: number;
        practicalCount: number;
      }
    >();

    for (const c of courses) {
      const foundInst = instructors.find((i) => i.courseOfferingId === c.id);
      const docName =
        c.instructorNameArabic ||
        (foundInst ? `${foundInst.academicTitle || 'د.'} ${foundInst.instructorNameArabic}` : '');
      map.set(c.id, {
        id: c.id,
        titleArabic: c.titleArabic,
        doctorName: docName,
        totalCount: 0,
        theoreticalCount: 0,
        practicalCount: 0
      });
    }

    for (const r of resources) {
      const cId = r.courseOfferingId || 'general';
      const existing = map.get(cId);
      if (existing) {
        existing.totalCount += 1;
        if (r.sectionType === 'practical') existing.practicalCount += 1;
        else existing.theoreticalCount += 1;
      } else if (cId !== 'general') {
        const foundInst = instructors.find((i) => i.courseOfferingId === cId);
        const docName = foundInst
          ? `${foundInst.academicTitle || 'د.'} ${foundInst.instructorNameArabic}`
          : '';
        map.set(cId, {
          id: cId,
          titleArabic: initialCourseId === cId && initialCourseTitle ? initialCourseTitle : `مقرر طبي (${cId})`,
          doctorName: docName,
          totalCount: 1,
          theoreticalCount: r.sectionType === 'practical' ? 0 : 1,
          practicalCount: r.sectionType === 'practical' ? 1 : 0
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalCount - a.totalCount);
  }, [courses, instructors, resources, initialCourseId, initialCourseTitle]);

  const courseScopedResources = useMemo(() => {
    return selectedCourseId === 'all'
      ? resources
      : resources.filter((r) => r.courseOfferingId === selectedCourseId);
  }, [resources, selectedCourseId]);

  // Counts for Theoretical vs Practical within the selected course
  const sectionCounts = useMemo(() => {
    const allCount = courseScopedResources.length;
    const theoreticalCount = courseScopedResources.filter(
      (r) => !r.sectionType || r.sectionType === 'theoretical'
    ).length;
    const practicalCount = courseScopedResources.filter((r) => r.sectionType === 'practical').length;
    return { allCount, theoreticalCount, practicalCount };
  }, [courseScopedResources]);

  const sectionScopedResources = useMemo(() => {
    return courseScopedResources.filter((res) => {
      if (selectedSection === 'all') return true;
      if (selectedSection === 'theoretical') {
        return !res.sectionType || res.sectionType === 'theoretical';
      }
      return res.sectionType === 'practical';
    });
  }, [courseScopedResources, selectedSection]);

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

    return sectionScopedResources
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
  }, [sectionScopedResources, selectedShelf, selectedType, searchQuery, sortBy]);

  // Counts per shelf in current course + section scope (before shelf filter)
  const shelfCounts = useMemo(() => {
    let books_summaries = 0;
    let visual_media = 0;
    let audio_records = 0;
    for (const r of sectionScopedResources) {
      const c = classifyResource(r);
      if (c.shelfCategory === 'books_summaries') books_summaries++;
      else if (c.shelfCategory === 'visual_media') visual_media++;
      else if (c.shelfCategory === 'audio_records') audio_records++;
    }
    return {
      all: sectionScopedResources.length,
      books_summaries,
      visual_media,
      audio_records
    };
  }, [sectionScopedResources]);

  const shelvesConfig: {
    id: Exclude<ShelfCategoryId, 'all'>;
    title: string;
    subtitle: string;
    badgeText: string;
    icon: React.ReactNode;
    accentColorClass: string;
    headerBgClass: string;
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
        headerBgClass: 'from-teal-500/10 via-transparent to-transparent',
        items: classifiedAndFiltered.filter((i) => i.shelfCategory === 'books_summaries')
      },
      {
        id: 'visual_media',
        title: 'الشرائح المعملية والصور والفيديوهات الطبية',
        subtitle: 'شرائح الأنسجة والباثولوجي، الصور السريرية، وشروحات الفيديو المرئية',
        badgeText: 'صور وفيديوهات',
        icon: <Video className="w-4 h-4 text-sky-400" />,
        accentColorClass: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
        headerBgClass: 'from-sky-500/10 via-transparent to-transparent',
        items: classifiedAndFiltered.filter((i) => i.shelfCategory === 'visual_media')
      },
      {
        id: 'audio_records',
        title: 'التسجيلات الصوتية للمحاضرات',
        subtitle: 'التسجيلات الصوتية المباشرة لشرح الدكاترة داخل القاعات والمعامل',
        badgeText: 'تسجيلات صوتية',
        icon: <Volume2 className="w-4 h-4 text-amber-400" />,
        accentColorClass: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
        headerBgClass: 'from-amber-500/10 via-transparent to-transparent',
        items: classifiedAndFiltered.filter((i) => i.shelfCategory === 'audio_records')
      }
    ];
  }, [classifiedAndFiltered]);

  const shelfFilterTabs: {
    id: ShelfCategoryId;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    count: number;
  }[] = [
    {
      id: 'all',
      label: 'جميع الأرفف الطبية',
      sublabel: 'عرض شامل',
      icon: <Layers className="w-4 h-4" />,
      count: shelfCounts.all
    },
    {
      id: 'books_summaries',
      label: 'كتب وملخصات ومحاضرات',
      sublabel: 'PDF ومراجع',
      icon: <FileText className="w-4 h-4" />,
      count: shelfCounts.books_summaries
    },
    {
      id: 'visual_media',
      label: 'صور وشرائح وفيديوهات',
      sublabel: 'مرئيات ومعامل',
      icon: <Video className="w-4 h-4" />,
      count: shelfCounts.visual_media
    },
    {
      id: 'audio_records',
      label: 'تسجيلات صوتية',
      sublabel: 'شروحات مسموعة',
      icon: <Volume2 className="w-4 h-4" />,
      count: shelfCounts.audio_records
    }
  ];

  const activeFilterCount =
    (selectedSection !== 'all' ? 1 : 0) +
    (selectedType !== 'all' ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0);

  const selectedCourseObj = courses.find((c) => c.id === selectedCourseId);
  const activeCourseLabel = selectedCourseObj?.titleArabic || initialCourseTitle || '';

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
          {/* Top Metadata Line (Clean Unboxed Discipline with Icon & Size) */}
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

            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0 tabular-nums">
              <span
                className={
                  res.sectionType === 'practical' ? 'text-amber-400 font-bold' : 'text-teal-400 font-bold'
                }
              >
                {sectionLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-400">{res.fileSizeLabel || '1.8 MB'}</span>
            </div>
          </div>

          {/* Resource Title */}
          <h3 className="font-bold text-[var(--text-primary)] text-sm sm:text-base mb-1.5 leading-snug group-hover:text-teal-400 transition-colors line-clamp-2">
            {res.title}
          </h3>

          {/* Optional Description */}
          {res.description && (
            <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed mb-3">
              {res.description}
            </p>
          )}

          {/* Course & Instructor Line */}
          {(linkedCourse || courseDoctor) && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
              {linkedCourse && (
                <span className="font-bold text-teal-400 truncate max-w-[60%]">
                  {linkedCourse.titleArabic}
                </span>
              )}
              {courseDoctor && (
                <span className="inline-flex items-center gap-1 text-[var(--text-primary)] font-semibold truncate">
                  <Stethoscope className="w-3 h-3 text-teal-400 shrink-0" />
                  <span className="truncate">{courseDoctor}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Card Footer & Actions */}
        <div className="pt-3 border-t border-[var(--border-color)] mt-2 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
            <span>تاريخ النشر</span>
            <span className="font-mono">{new Date(res.createdAt).toLocaleDateString('ar-YE')}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActivePreviewResource(res)}
              className="flex-1 min-h-[44px] py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] whitespace-nowrap"
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
                className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 flex items-center justify-center shrink-0 active:scale-[0.98]"
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
    <div className="space-y-4 max-w-full overflow-hidden" dir="rtl">
      {/* 1. Library Header Bar with View Switcher & Refresh */}
      <div className="umed-card bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-2xl px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                المكتبة الطبية الرقمية والأرفف المنهجية
              </h2>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                ({courseScopedResources.length} مادة علمية)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              اختر المقرر الدراسي ثم القسم (نظري أو عملي) وتصفح أرفف الكتب والملخصات، الشرائح والفيديوهات، والتسجيلات الصوتية
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle between Horizontal Shelves and Grid */}
          <div className="flex items-center p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs">
            <button
              type="button"
              onClick={() => setViewLayout('shelves')}
              className={`min-h-[36px] px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewLayout === 'shelves'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-[var(--text-primary)]'
              }`}
              title="عرض الأرفف الأفقية المقسمة"
            >
              <Rows3 className="w-3.5 h-3.5 shrink-0" />
              <span>أرفف أفقية</span>
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('grid')}
              className={`min-h-[36px] px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewLayout === 'grid'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-[var(--text-primary)]'
              }`}
              title="عرض الشبكة الكاملة"
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              <span>شبكة</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadResources(true)}
            disabled={loading}
            className="min-h-[38px] py-1.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 shrink-0 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* 2. Horizontal Course Scroller Strip (شريط التمرير الأفقي للمقررات الدراسية) */}
      <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-3.5 sm:p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <GraduationCap className="w-4 h-4 text-teal-400 shrink-0" />
            <span>شريط المقررات الدراسية والبلوكات الطبية</span>
            {selectedCourseId !== 'all' && activeCourseLabel && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCourseId('all');
                  if (onClearCourseFilter) onClearCourseFilter();
                }}
                className="text-[11px] text-teal-400 hover:underline font-semibold mr-1 flex items-center gap-1"
              >
                <span>(إلغاء فلتر: {activeCourseLabel})</span>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => scrollHorizontalContainer(courseStripRef.current, 'prev')}
              className="min-h-[34px] min-w-[34px] rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] flex items-center justify-center transition-colors"
              title="تمرير لليمين"
              aria-label="تمرير المقررات لليمين"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollHorizontalContainer(courseStripRef.current, 'next')}
              className="min-h-[34px] min-w-[34px] rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] flex items-center justify-center transition-colors"
              title="تمرير لليسار"
              aria-label="تمرير المقررات لليسار"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={courseStripRef}
          className="flex items-stretch gap-2.5 overflow-x-auto pb-1.5 pt-0.5 scroll-smooth snap-x snap-mandatory [scrollbar-width:thin]"
        >
          {/* All Courses Card */}
          <button
            type="button"
            onClick={() => {
              setSelectedCourseId('all');
              if (onClearCourseFilter) onClearCourseFilter();
            }}
            className={`min-h-[68px] px-4 py-3 rounded-2xl border text-right transition-all shrink-0 snap-start flex flex-col justify-between min-w-[185px] sm:min-w-[210px] ${
              selectedCourseId === 'all'
                ? 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-950/30'
                : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-color)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-xs sm:text-sm font-extrabold truncate">جميع مقررات الدفعة</span>
              <span
                className={`text-xs font-mono font-bold tabular-nums ${
                  selectedCourseId === 'all' ? 'text-teal-100' : 'text-teal-400'
                }`}
              >
                {resources.length}
              </span>
            </div>
            <div
              className={`flex items-center gap-1.5 text-[11px] mt-1.5 tabular-nums ${
                selectedCourseId === 'all' ? 'text-teal-100' : 'text-slate-400'
              }`}
            >
              <span>نظري وعملي</span>
              <span aria-hidden="true">·</span>
              <span>{courseCards.length} مقرر</span>
            </div>
          </button>

          {/* Individual Course Cards */}
          {courseCards.map((course) => {
            const isSelected = selectedCourseId === course.id;
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => setSelectedCourseId(course.id)}
                className={`min-h-[68px] px-4 py-3 rounded-2xl border text-right transition-all shrink-0 snap-start flex flex-col justify-between min-w-[210px] sm:min-w-[245px] max-w-[280px] ${
                  isSelected
                    ? 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-950/30'
                    : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-color)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <span className="text-xs sm:text-sm font-extrabold truncate">{course.titleArabic}</span>
                  <span
                    className={`text-xs font-mono font-bold shrink-0 tabular-nums ${
                      isSelected ? 'text-teal-100' : 'text-teal-400'
                    }`}
                  >
                    {course.totalCount}
                  </span>
                </div>

                <div
                  className={`flex items-center justify-between gap-2 text-[11px] mt-1.5 w-full tabular-nums ${
                    isSelected ? 'text-teal-100' : 'text-slate-400'
                  }`}
                >
                  {course.doctorName ? (
                    <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                      <Stethoscope className="w-3 h-3 shrink-0" />
                      <span className="truncate">{course.doctorName}</span>
                    </span>
                  ) : (
                    <span>مقرر أكاديمي</span>
                  )}
                  <span className="shrink-0">
                    نظري {course.theoreticalCount} · عملي {course.practicalCount}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Academic Section Switcher (نظري / عملي) + Horizontal Category Shelf Strip */}
      <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-3.5 sm:p-4 space-y-3">
        {/* Top Row: Theoretical vs Practical Split + Search & Sort */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Segmented Section Switcher: الكل / النظري / العملي والمختبر */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] overflow-x-auto [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setSelectedSection('all')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
                selectedSection === 'all'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-[var(--text-primary)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>الكل (نظري وعملي)</span>
              <span className="font-mono text-[11px] opacity-90">({sectionCounts.allCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSection('theoretical')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
                selectedSection === 'theoretical'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-[var(--text-primary)]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>القسم النظري</span>
              <span className="font-mono text-[11px] opacity-90">({sectionCounts.theoreticalCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSection('practical')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums ${
                selectedSection === 'practical'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-[var(--text-primary)]'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5 shrink-0" />
              <span>القسم العملي والمختبر</span>
              <span className="font-mono text-[11px] opacity-90">({sectionCounts.practicalCount})</span>
            </button>
          </div>

          {/* Search Box & Filter Sheet Button */}
          <div className="flex items-center gap-2 flex-1 lg:max-w-md">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-4 h-4 absolute right-3 top-3 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث في الكتب، الملخصات، الشرائح، أو التسجيلات..."
                className="w-full min-h-[40px] pl-8 pr-9 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-slate-500 focus:outline-none focus:border-teal-500 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-2.5 p-1 text-slate-500 hover:text-white"
                  title="مسح البحث"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFilterModal(true)}
              className={`min-h-[40px] py-2 px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 whitespace-nowrap ${
                activeFilterCount > 0
                  ? 'bg-teal-500/15 border-teal-500 text-teal-300'
                  : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>الترتيب والفلترة</span>
              {activeFilterCount > 0 && (
                <span className="font-mono text-[11px] text-teal-300 tabular-nums">
                  ({activeFilterCount})
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Bottom Row: Horizontal Scrollable Category Bar (شريط الفئات الثلاثة القابل للتمرير الأفقي) */}
        <div
          ref={categoryStripRef}
          className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 scroll-smooth snap-x snap-mandatory [scrollbar-width:none]"
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
                className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2.5 shrink-0 snap-start whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                    : 'bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-color)]'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-teal-400'}>{tab.icon}</span>
                <div className="text-right">
                  <div className="leading-tight">{tab.label}</div>
                  <div
                    className={`text-[10px] font-normal ${
                      isActive ? 'text-teal-100' : 'text-slate-400'
                    }`}
                  >
                    {tab.sublabel}
                  </div>
                </div>
                <span
                  className={`text-xs font-mono font-bold tabular-nums mr-1 ${
                    isActive ? 'text-white' : 'text-teal-400'
                  }`}
                >
                  ({tab.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Main Content Area: Horizontal Shelves or Focused Grid */}
      {classifiedAndFiltered.length === 0 ? (
        <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-10 text-center text-slate-500 text-xs space-y-3">
          <BookOpen className="w-9 h-9 mx-auto text-slate-500" />
          <h4 className="font-bold text-[var(--text-primary)] text-sm">لا توجد مواد تعليمية مطابقة</h4>
          <p className="max-w-md mx-auto text-slate-400 leading-relaxed">
            لم نجد كتب أو ملخصات أو شرائح أو تسجيلات تطابق عوامل التصفية المحددة حالياً. جرب اختيار مقرر آخر أو التبديل بين النظري والعملي.
          </p>
          {(selectedShelf !== 'all' ||
            selectedType !== 'all' ||
            selectedSection !== 'all' ||
            selectedCourseId !== 'all' ||
            searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedShelf('all');
                setSelectedType('all');
                setSelectedSection('all');
                setSelectedCourseId('all');
                if (onClearCourseFilter) onClearCourseFilter();
                setSearchQuery('');
              }}
              className="min-h-[42px] py-2 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors"
            >
              إعادة عرض جميع المقررات والأرفف
            </button>
          )}
        </div>
      ) : viewLayout === 'grid' ? (
        /* Grid Mode when user switches to full grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {classifiedAndFiltered.map((item) => renderResourceCard(item, false))}
        </div>
      ) : (
        /* Horizontal Shelves Mode (الأرفف الأفقية الثلاثة لكل تصنيف) */
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
                {/* Shelf Header with Title, Count, and Horizontal Scroll Arrows */}
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
                        <span className="text-xs font-mono font-bold text-teal-400 tabular-nums">
                          ({shelf.items.length} ملف)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{shelf.subtitle}</p>
                    </div>
                  </div>

                  {/* Scroll Controls & Focus Toggle */}
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
                      aria-label={`تمرير ${shelf.title} لليمين`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollHorizontalContainer(shelfRefs.current[shelf.id], 'next')}
                      className="min-h-[36px] min-w-[36px] rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] flex items-center justify-center transition-colors"
                      title="تمرير لليسار"
                      aria-label={`تمرير ${shelf.title} لليسار`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Horizontal Scroll Cards Track */}
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

      {/* 5. Filter & Sort Modal Sheet (Smooth Mobile Bottom Sheet) */}
      {showFilterModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto overscroll-contain"
          dir="rtl"
        >
          <div className="bg-slate-900 border border-slate-800 sm:rounded-2xl rounded-t-3xl max-w-md w-full max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:fade-in duration-200">
            {/* Mobile Drag Handle */}
            <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mt-2.5 sm:hidden" />

            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white">تصفية وترتيب المواد الطبية</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFilterModal(false)}
                className="min-h-[36px] min-w-[36px] p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* Section Type Filter */}
              <div className="space-y-2">
                <label className="text-slate-300 font-bold block">القسم الأكاديمي (نظري / عملي):</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'الكل (نظري وعملي)' },
                    { id: 'theoretical', label: 'القسم النظري' },
                    { id: 'practical', label: 'العملي والمختبر' }
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSection(s.id as any)}
                      className={`min-h-[42px] p-2.5 rounded-xl border font-bold text-center transition-all ${
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

              {/* Exact File Type Filter */}
              <div className="space-y-2">
                <label className="text-slate-300 font-bold block">تحديد نوع ملف دقيق:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'جميع الأنواع' },
                    { id: 'pdf', label: 'ملفات PDF' },
                    { id: 'image', label: 'شرائح وصور' },
                    { id: 'video', label: 'فيديوهات' },
                    { id: 'audio', label: 'تسجيلات صوتية' },
                    { id: 'link', label: 'روابط خارجية' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedType(t.id as any)}
                      className={`min-h-[40px] p-2 rounded-xl border font-bold text-center transition-all ${
                        selectedType === t.id
                          ? 'bg-teal-600/20 border-teal-500 text-teal-300 ring-1 ring-teal-500/50'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort Order */}
              <div className="space-y-2">
                <label className="text-slate-300 font-bold block">ترتيب المخرجات داخل الأرفف حسب:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'newest', label: 'الأحدث إضافة أولاً' },
                    { id: 'oldest', label: 'الأقدم تاريخاً' },
                    { id: 'title', label: 'أبجدياً (أ - ي)' },
                    { id: 'size', label: 'حسب حجم الملف' }
                  ].map((sortItem) => (
                    <button
                      key={sortItem.id}
                      type="button"
                      onClick={() => setSortBy(sortItem.id as SortOption)}
                      className={`min-h-[42px] p-2.5 rounded-xl border font-bold text-center transition-all ${
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
                  setSelectedType('all');
                  setSortBy('newest');
                }}
                className="min-h-[42px] py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                إعادة ضبط
              </button>
              <button
                type="button"
                onClick={() => setShowFilterModal(false)}
                className="min-h-[42px] py-2.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md shadow-teal-900/40"
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
