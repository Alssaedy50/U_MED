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
  Filter, 
  Layers, 
  Sparkles, 
  ShieldCheck, 
  RefreshCw,
  Eye,
  AlertCircle,
  Volume2,
  Video,
  SlidersHorizontal,
  ArrowDownUp,
  X,
  Check
} from 'lucide-react';
import { EducationalResource, ResourceType } from '../../types/umed.ts';
import {
  fetchEducationalResources,
  getCachedEducationalResources,
  subscribeToEducationalResources
} from '../../services/resourceService.ts';
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
}

type SortOption = 'newest' | 'oldest' | 'title' | 'size';

export default function StudentMedicalLibrary({
  universityId,
  programId,
  studyLevelId,
  studentNameArabic
}: StudentMedicalLibraryProps) {
  const [resources, setResources] = useState<EducationalResource[]>(() =>
    getCachedEducationalResources({
      universityId,
      programId,
      studyLevelId,
      status: 'published'
    })
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<ResourceType | 'all'>('all');
  const [selectedSection, setSelectedSection] = useState<'all' | 'theoretical' | 'practical'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showFilterModal, setShowFilterModal] = useState<boolean>(false);
  const [activePreviewResource, setActivePreviewResource] = useState<EducationalResource | null>(null);

  const loadResources = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const list = await fetchEducationalResources({
        universityId,
        programId,
        studyLevelId,
        status: 'published' // Students strictly see published content
      });
      setResources(list);
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

  const categories: { id: ResourceType | 'all'; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'all', label: 'الكل', icon: <BookOpen className="w-3.5 h-3.5" />, count: resources.length },
    { id: 'pdf', label: 'ملفات PDF', icon: <FileText className="w-3.5 h-3.5" />, count: resources.filter(r => r.resourceType === 'pdf').length },
    { id: 'image', label: 'شرائح وصور', icon: <ImageIcon className="w-3.5 h-3.5" />, count: resources.filter(r => r.resourceType === 'image').length },
    { id: 'video', label: 'فيديوهات', icon: <Video className="w-3.5 h-3.5" />, count: resources.filter(r => r.resourceType === 'video').length },
    { id: 'audio', label: 'تسجيلات صوتية', icon: <Volume2 className="w-3.5 h-3.5" />, count: resources.filter(r => r.resourceType === 'audio').length },
    { id: 'link', label: 'روابط خارجية', icon: <ExternalLink className="w-3.5 h-3.5" />, count: resources.filter(r => r.resourceType === 'link' || r.resourceType === 'video_link').length },
  ];

  const filteredResources = resources
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

  return (
    <div className="space-y-4 sm:space-y-5">
      
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-teal-950/70 via-slate-900 to-indigo-950/70 border border-teal-500/30 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
            <span className="text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold">
              المكتبة الطبية الرقمية المعتمدة
            </span>
            <span className="text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold">
              تصفح سريع وموفر للبيانات
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-white leading-snug">
            المحاضرات والشرائح والمراجع الطبية المخصصة لمستواك
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            جميع المواد العلمية محسنة لشبكات 3G والاتصال المتقطع في اليمن، مع حماية استهلاك البيانات بعدم فتح أي ملف إلا بعد تأكيدك.
          </p>
        </div>

        <button
          onClick={() => loadResources(true)}
          disabled={loading}
          className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          <span>تحديث المكتبة</span>
        </button>
      </div>

      {/* 2. Mobile-First Category Chips Bar (Smooth Horizontal Scroll) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 pt-0.5 -mx-1 px-1">
        {categories.map((cat) => {
          const isActive = selectedType === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedType(cat.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border ${
                isActive
                  ? 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-900/30 ring-1 ring-teal-400/40'
                  : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700'
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
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-2.5 sm:p-3 flex flex-wrap sm:flex-nowrap items-center gap-2 text-xs">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في المحاضرات، الشرائح، والمراجع..."
            className="w-full pl-8 pr-9 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 text-xs"
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
              ? 'bg-teal-600/20 border-teal-500 text-teal-300 ring-1 ring-teal-500/40'
              : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
          <span>تصفية وترتيب</span>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-teal-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Active Filter Indicators Bar */}
      {(selectedSection !== 'all' || sortBy !== 'newest') && (
        <div className="flex items-center gap-2 flex-wrap text-[11px] bg-slate-900/40 p-2 rounded-xl border border-slate-800/80">
          <span className="text-slate-400 font-semibold">التصفيات النشطة:</span>
          {selectedSection !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-950 border border-teal-800 text-teal-300 font-medium">
              <span>القسم: {selectedSection === 'theoretical' ? 'نظري فقط' : 'عملي ومختبر'}</span>
              <button onClick={() => setSelectedSection('all')} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {sortBy !== 'newest' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-300 font-medium">
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
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-10 sm:p-12 text-center text-slate-500 text-xs space-y-3">
          <BookOpen className="w-9 h-9 mx-auto text-slate-600" />
          <h4 className="font-bold text-slate-300 text-sm">لا توجد مواد تعليمية مطابقة</h4>
          <p className="max-w-md mx-auto text-slate-400">
            لم نجد محاضرات أو شرائح تطابق معايير البحث أو التصفية الحالية. جرب تغيير نوع المورد أو مسح كلمات البحث.
          </p>
          {(selectedType !== 'all' || selectedSection !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedType('all');
                setSelectedSection('all');
                setSearchQuery('');
              }}
              className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-bold transition-colors"
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
            return (
              <div 
                key={res.id} 
                className="bg-slate-900/85 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col justify-between hover:border-slate-700 transition-all text-xs group hover:shadow-xl"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono flex items-center gap-1 ${
                      isPdf ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                      isImage ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' :
                      isAudio ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      isVideo ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' :
                      'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
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

                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-300 font-mono font-bold">
                      {res.fileSizeLabel || '1.8 MB'}
                    </span>
                  </div>

                  <h3 className="font-bold text-white text-sm sm:text-base mb-1.5 leading-snug group-hover:text-teal-300 transition-colors line-clamp-2">
                    {res.title}
                  </h3>

                  {res.description && (
                    <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed mb-3">
                      {res.description}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800/80 mt-2 space-y-2.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 font-semibold text-slate-300">
                      {res.sectionType === 'theoretical' ? 'نظري' : res.sectionType === 'practical' ? 'عملي ومختبر' : 'عام'}
                    </span>
                    <span className="font-mono text-slate-400">{new Date(res.createdAt).toLocaleDateString('ar-YE')}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActivePreviewResource(res)}
                      className="flex-1 min-h-[42px] py-2 px-3 rounded-xl bg-teal-600/90 hover:bg-teal-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/20 active:scale-[0.98]"
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
