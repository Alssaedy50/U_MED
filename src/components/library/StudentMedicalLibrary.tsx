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
  Volume2
} from 'lucide-react';
import { EducationalResource, ResourceType } from '../../types/umed.ts';
import { fetchEducationalResources } from '../../services/resourceService.ts';
import ResourcePreviewModal from './ResourcePreviewModal.tsx';

interface StudentMedicalLibraryProps {
  universityId: string;
  programId: string;
  studyLevelId: string;
  studentNameArabic: string;
}

export default function StudentMedicalLibrary({
  universityId,
  programId,
  studyLevelId,
  studentNameArabic
}: StudentMedicalLibraryProps) {
  const [resources, setResources] = useState<EducationalResource[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<ResourceType | 'all'>('all');
  const [selectedSection, setSelectedSection] = useState<'all' | 'theoretical' | 'practical'>('all');
  const [activePreviewResource, setActivePreviewResource] = useState<EducationalResource | null>(null);

  const loadResources = async () => {
    setLoading(true);
    try {
      const list = await fetchEducationalResources({
        universityId,
        programId,
        studyLevelId,
        status: 'published' // Students strictly see published content
      });
      setResources(list);
    } catch (err) {
      console.warn('Failed to load educational resources:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResources();
  }, [universityId, programId, studyLevelId]);

  const filteredResources = resources.filter((res) => {
    const matchesType = selectedType === 'all' || res.resourceType === selectedType;
    const matchesSection = selectedSection === 'all' || res.sectionType === selectedSection;
    const matchesSearch = !searchQuery || 
      res.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (res.description && res.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSection && matchesSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-teal-950/70 via-slate-900 to-indigo-950/70 border border-teal-500/30 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold">
              المكتبة الطبية الرقمية المعتمدة
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              Low-Bandwidth Protected
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white">
            المحاضرات والشرائح والمراجع الطبية المخصصة لمستواك
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            جميع المواد العلمية محسنة للاستخدام مع سرعات الإنترنت الضعيفة وشبكات 3G في اليمن، ولا يتم استهلاك البيانات إلا بعد تأكيدك.
          </p>
        </div>

        <button
          onClick={loadResources}
          disabled={loading}
          className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث المكتبة</span>
        </button>
      </div>

      {/* 2. Filter & Search Controls */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Type Filter Buttons */}
        <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setSelectedType('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
              selectedType === 'all' ? 'bg-teal-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            جميع الموارد ({resources.length})
          </button>

          <button
            onClick={() => setSelectedType('pdf')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
              selectedType === 'pdf' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>ملفات PDF ({resources.filter(r => r.resourceType === 'pdf').length})</span>
          </button>

          <button
            onClick={() => setSelectedType('image')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
              selectedType === 'image' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>شرائح وصور طبية ({resources.filter(r => r.resourceType === 'image').length})</span>
          </button>

          <button
            onClick={() => setSelectedType('audio')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
              selectedType === 'audio' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>تسجيلات صوتية ({resources.filter(r => r.resourceType === 'audio').length})</span>
          </button>

          <button
            onClick={() => setSelectedType('link')}
            className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
              selectedType === 'link' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>روابط خارجية ({resources.filter(r => r.resourceType === 'link' || r.resourceType === 'video_link').length})</span>
          </button>
        </div>

        {/* Section Filter & Search Box */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value as any)}
            className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-teal-500"
          >
            <option value="all">جميع الشعب (نظري وعملي)</option>
            <option value="theoretical">القسم النظري فقط</option>
            <option value="practical">القسم العملي والمختبر فقط</option>
          </select>

          {/* Search Box */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في المحاضرات والشرائح..."
              className="w-full pl-3 pr-8 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 text-xs"
            />
          </div>
        </div>

      </div>

      {/* 3. Resources Grid */}
      {filteredResources.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs space-y-2">
          <BookOpen className="w-8 h-8 mx-auto text-slate-600" />
          <p>لا توجد مواد تعليمية مطابقة للبحث أو الفلتر المحدد حالياً.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResources.map((res) => {
            const isPdf = res.resourceType === 'pdf';
            const isImage = res.resourceType === 'image';
            const isAudio = res.resourceType === 'audio';
            return (
              <div 
                key={res.id} 
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between hover:border-slate-700 transition-all text-xs group"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono flex items-center gap-1 ${
                      isPdf ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                      isImage ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' :
                      isAudio ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    }`}>
                      {isPdf && <FileText className="w-3 h-3" />}
                      {isImage && <ImageIcon className="w-3 h-3" />}
                      {isAudio && <Volume2 className="w-3 h-3" />}
                      {!isPdf && !isImage && !isAudio && <ExternalLink className="w-3 h-3" />}
                      <span>{isAudio ? 'تسجيل صوتي' : res.resourceType}</span>
                    </span>

                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-300 font-mono font-bold">
                      {res.fileSizeLabel || '1.8 MB'}
                    </span>
                  </div>

                  <h3 className="font-bold text-white text-sm mb-1.5 leading-snug group-hover:text-teal-300 transition-colors">
                    {res.title}
                  </h3>

                  {res.description && (
                    <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed mb-3">
                      {res.description}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800/80 mt-2">
                  <div className="flex items-center justify-between mb-3 text-[10px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                      {res.sectionType === 'theoretical' ? 'نظري' : res.sectionType === 'practical' ? 'عملي ومختبر' : 'عام'}
                    </span>
                    <span className="font-mono">{new Date(res.createdAt).toLocaleDateString('ar-YE')}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActivePreviewResource(res)}
                      className="flex-1 py-2 px-3 rounded-xl bg-teal-600/90 hover:bg-teal-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/15"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isAudio ? 'استماع وتحميل' : 'معاينة وتحميل'}</span>
                    </button>

                    {!res.url.startsWith('umed-cloud://') && (
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
                        title="فتح الرابط في تبويب خارجي"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Active Preview Modal */}
      {activePreviewResource && (
        <ResourcePreviewModal
          resource={activePreviewResource}
          onClose={() => setActivePreviewResource(null)}
        />
      )}

    </div>
  );
}
