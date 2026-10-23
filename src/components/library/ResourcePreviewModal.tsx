/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Low-Bandwidth Medical Resource Preview Modal
 * Protects 3G/metered bandwidth by requiring explicit user confirmation before loading heavy files
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  FileText, 
  Image as ImageIcon, 
  ExternalLink, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  RefreshCw, 
  AlertTriangle, 
  ShieldCheck, 
  Eye,
  Volume2
} from 'lucide-react';
import { EducationalResource } from '../../types/umed.ts';
import { resolveResourceFileUrl } from '../../services/resourceService.ts';

interface ResourcePreviewModalProps {
  resource: EducationalResource;
  onClose: () => void;
}

export default function ResourcePreviewModal({ 
  resource, 
  onClose 
}: ResourcePreviewModalProps) {
  // Low-Bandwidth Guard state: Requires explicit click to fetch stream
  const [hasConfirmedLoad, setHasConfirmedLoad] = useState<boolean>(false);
  const [imageZoom, setImageZoom] = useState<number>(1);
  const [iframeError, setIframeError] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolvedViewUrl, setResolvedViewUrl] = useState<string>('');
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string>('');
  const [isCloudStored, setIsCloudStored] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isImage = resource.resourceType === 'image';
  const isPdf = resource.resourceType === 'pdf';
  const isAudio = resource.resourceType === 'audio';
  const isVideo = resource.resourceType === 'video';

  useEffect(() => {
    if (!hasConfirmedLoad) return;
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    resolveResourceFileUrl(resource, (pct) => {
      if (active) setLoadProgress(pct);
    })
      .then((res) => {
        if (!active) return;
        setResolvedViewUrl(res.viewUrl);
        setResolvedDownloadUrl(res.downloadUrl);
        setIsCloudStored(res.isCloudFile);
        setIsLoading(false);
      })
      .catch((err: any) => {
        if (!active) return;
        setLoadError(err.message || 'تعذر جلب الملف من السحابة');
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hasConfirmedLoad, resource]);

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header Bar */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isPdf ? 'bg-rose-500/10 text-rose-400' :
              isImage ? 'bg-teal-500/10 text-teal-400' :
              isAudio ? 'bg-amber-500/10 text-amber-400' :
              'bg-indigo-500/10 text-indigo-400'
            }`}>
              {isPdf ? <FileText className="w-4 h-4" /> :
               isImage ? <ImageIcon className="w-4 h-4" /> :
               isAudio ? <Volume2 className="w-4 h-4" /> :
               <ExternalLink className="w-4 h-4" />}
            </div>
            
            <div className="min-w-0">
              <h3 className="font-bold text-white text-sm truncate">
                {resource.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                <span className="uppercase px-1.5 py-0.2 rounded bg-slate-800 font-mono text-teal-300">
                  {isAudio ? 'AUDIO' : resource.resourceType}
                </span>
                <span>الحجم: <strong className="text-amber-300 font-mono">{resource.fileSizeLabel || 'غير محدد'}</strong></span>
                <span>•</span>
                <span>{resource.sectionType === 'theoretical' ? 'شعبة نظري' : resource.sectionType === 'practical' ? 'شعبة عملي / مختبر' : 'عام'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {resolvedDownloadUrl && (
              <a
                href={resolvedDownloadUrl}
                download={resource.fileName || `${resource.title}.${isPdf ? 'pdf' : isAudio ? 'webm' : 'jpg'}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="تنزيل الملف إلى جهازك"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تنزيل للجهاز</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 transition-colors"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950 flex flex-col items-center justify-center min-h-[360px]">
          
          {/* BANDWIDTH GUARD SCREEN (Shown before load) */}
          {!hasConfirmedLoad ? (
            <div className="max-w-md text-center space-y-4 p-6 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  حماية استهلاك باقة الإنترنت (Low-Bandwidth Guard)
                </span>
                <h4 className="text-base font-bold text-white mt-2">
                  هل ترغب في فتح وتحميل هذا المورد الآن؟
                </h4>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  لمنع استهلاك باقة الإنترنت تلقائياً في شبكات 3G باليمن، يتطلب النظام تأكيدك قبل جلب الملف، وسيُحفظ تلقائياً في ذاكرة متصفحك لفتحه لاحقاً بدون إنترنت.
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-right space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">حجم الملف التقريبي:</span>
                  <span className="text-amber-300 font-mono font-bold">{resource.fileSizeLabel || '1.8 MB'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">نوع المستند:</span>
                  <span className="text-slate-200">
                    {isPdf ? 'ملف محاضرة PDF' : isImage ? 'شريحة هستولوجي / صورة طبية' : isAudio ? 'تسجيل صوتي لمحاضرة' : 'مورد تعليمي'}
                  </span>
                </div>
              </div>

              {resource.description && (
                <p className="text-xs text-slate-400 text-right bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                  {resource.description}
                </p>
              )}

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => {
                    setHasConfirmedLoad(true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-teal-600/20"
                >
                  <Eye className="w-4 h-4" />
                  <span>{isAudio ? 'تشغيل التسجيل الصوتي الآن' : 'تحميل ومعاينة الملف الآن'}</span>
                </button>

                {!resource.url.startsWith('umed-cloud://') && (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-700"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح في تبويب خارجي</span>
                  </a>
                )}
              </div>
            </div>
          ) : isLoading ? (
            <div className="max-w-sm w-full text-center space-y-3 p-6 bg-slate-900 rounded-2xl border border-slate-800">
              <RefreshCw className="w-8 h-8 animate-spin text-teal-400 mx-auto" />
              <div className="text-xs font-bold text-white">جارٍ استرجاع الملف من السحابة... ({loadProgress}%)</div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 transition-all duration-200" style={{ width: `${loadProgress}%` }} />
              </div>
            </div>
          ) : loadError ? (
            <div className="max-w-md text-center space-y-3 p-6 bg-slate-900 rounded-2xl border border-rose-800">
              <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
              <div className="text-sm font-bold text-white">تعذر تحميل الملف</div>
              <p className="text-xs text-rose-300">{loadError}</p>
            </div>
          ) : (
            /* ACTIVE VIEWER */
            <div className="w-full h-full flex flex-col items-center justify-center relative">
              
              {/* 1. AUDIO LECTURE PLAYER */}
              {isAudio && (
                <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 text-center shadow-xl">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
                    <Volume2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-base">{resource.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">{resource.description || 'محاضرة صوتية مسجلة'}</p>
                  </div>

                  <audio
                    ref={audioRef}
                    controls
                    autoPlay
                    src={resolvedViewUrl}
                    className="w-full"
                  />

                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                    <span className="text-slate-400">سرعة التشغيل:</span>
                    {[1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleSpeedChange(rate)}
                        className={`px-2.5 py-1 rounded-lg font-mono font-bold border ${
                          playbackRate === rate
                            ? 'bg-amber-600 text-white border-amber-500'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. IMAGE / HISTOLOGY SLIDE VIEWER */}
              {isImage && (
                <div className="w-full flex flex-col items-center justify-center space-y-3">
                  <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                    <button 
                      onClick={() => setImageZoom(Math.max(0.5, imageZoom - 0.25))}
                      className="p-1 hover:bg-slate-800 rounded text-slate-300"
                      title="تصغير"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="font-mono text-slate-300 text-[11px]">{Math.round(imageZoom * 100)}%</span>
                    <button 
                      onClick={() => setImageZoom(Math.min(3, imageZoom + 0.25))}
                      className="p-1 hover:bg-slate-800 rounded text-slate-300"
                      title="تكبير"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setImageZoom(1)}
                      className="text-[10px] text-teal-400 hover:underline mr-1"
                    >
                      إعادة ضبط
                    </button>
                  </div>

                  <div className="max-w-full max-h-[70vh] overflow-auto rounded-xl border border-slate-800 bg-black flex items-center justify-center p-2">
                    <img 
                      src={resolvedViewUrl} 
                      alt={resource.title}
                      style={{ transform: `scale(${imageZoom})`, transition: 'transform 0.15s ease' }}
                      className="max-h-[65vh] object-contain rounded-lg"
                      onError={() => setIframeError(true)}
                    />
                  </div>
                </div>
              )}

              {/* 2.5 VIDEO LECTURE PLAYER */}
              {isVideo && (
                <div className="w-full max-w-3xl flex flex-col items-center justify-center space-y-3">
                  <video
                    controls
                    autoPlay
                    src={resolvedViewUrl}
                    className="w-full max-h-[68vh] rounded-xl border border-slate-800 bg-black shadow-2xl"
                  />
                </div>
              )}

              {/* 3. PDF & EXTERNAL VIEWER IFRAME */}
              {!isImage && !isAudio && !isVideo && (
                <div className="w-full h-[70vh] relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                  {iframeError ? (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                      <AlertTriangle className="w-8 h-8 text-amber-400" />
                      <h4 className="font-bold text-white text-sm">المستند جاهز للفتح أو التنزيل المباشر</h4>
                      <p className="text-xs text-slate-400 max-w-md">
                        اضغط الزر أدناه لفتح أو تنزيل الملف مباشرة على جهازك.
                      </p>
                      <a
                        href={resolvedDownloadUrl || resolvedViewUrl}
                        download={resource.fileName || `${resource.title}.pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>تنزيل / فتح الملف الآن</span>
                      </a>
                    </div>
                  ) : (
                    <iframe
                      src={resolvedViewUrl}
                      title={resource.title}
                      className="w-full h-full border-0"
                      allow="autoplay"
                      onError={() => setIframeError(true)}
                    />
                  )}
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer info bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>
            {isCloudStored
              ? 'مخزن سحابياً في Cloud Firestore (umed-yemen) ومحفوظ محلياً لعدم استهلاك الإنترنت'
              : 'منصة UMED الطبية • مكتبة المناهج والمحاضرات الرقمية'}
          </span>
          <span className="font-mono text-teal-400">ID: {resource.id}</span>
        </div>

      </div>
    </div>
  );
}
