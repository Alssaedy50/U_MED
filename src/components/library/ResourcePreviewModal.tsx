/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Low-Bandwidth Medical Resource Preview Modal
 * Protects 3G/metered bandwidth by requiring explicit user confirmation before loading heavy files
 */

import React, { useState } from 'react';
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
  WifiOff, 
  Maximize2,
  Eye
} from 'lucide-react';
import { EducationalResource } from '../../types/umed.ts';

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

  const isImage = resource.resourceType === 'image';
  const isPdf = resource.resourceType === 'pdf';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header Bar */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isPdf ? 'bg-rose-500/10 text-rose-400' :
              isImage ? 'bg-teal-500/10 text-teal-400' :
              'bg-indigo-500/10 text-indigo-400'
            }`}>
              {isPdf ? <FileText className="w-4 h-4" /> :
               isImage ? <ImageIcon className="w-4 h-4" /> :
               <ExternalLink className="w-4 h-4" />}
            </div>
            
            <div className="min-w-0">
              <h3 className="font-bold text-white text-sm truncate">
                {resource.title}
              </h3>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                <span className="uppercase px-1.5 py-0.2 rounded bg-slate-800 font-mono text-teal-300">
                  {resource.resourceType}
                </span>
                <span>الحجم: <strong className="text-amber-300 font-mono">{resource.fileSizeLabel || 'غير محدد'}</strong></span>
                <span>•</span>
                <span>{resource.sectionType === 'theoretical' ? 'شعبة نظري' : resource.sectionType === 'practical' ? 'شعبة عملي / مختبر' : 'عام'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="فتح في نافذة خارجية مباشرة"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
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
                  هل ترغب في تحميل ومعاينة هذا المورد الآن؟
                </h4>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  لمنع استهلاك باقة الإنترنت تلقائياً في شبكات 3G باليمن، يتطلب النظام تأكيدك قبل فتح الملف.
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-right space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">حجم الملف التقريبي:</span>
                  <span className="text-amber-300 font-mono font-bold">{resource.fileSizeLabel || '1.8 MB'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">نوع المستند:</span>
                  <span className="text-slate-200">{isPdf ? 'ملف محاضرة PDF' : isImage ? 'شريحة هستولوجي طبية' : 'مورد تعليمي'}</span>
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
                    setIsLoading(true);
                    setHasConfirmedLoad(true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-teal-600/20"
                >
                  <Eye className="w-4 h-4" />
                  <span>تحميل ومعاينة الملف الآن</span>
                </button>

                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح في تبويب خارجي</span>
                </a>
              </div>
            </div>
          ) : (
            /* ACTIVE VIEWER */
            <div className="w-full h-full flex flex-col items-center justify-center relative">
              
              {/* IMAGE / HISTOLOGY SLIDE VIEWER */}
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
                      src={resource.url} 
                      alt={resource.title}
                      style={{ transform: `scale(${imageZoom})`, transition: 'transform 0.15s ease' }}
                      className="max-h-[65vh] object-contain rounded-lg"
                      onError={() => setIframeError(true)}
                    />
                  </div>
                </div>
              )}

              {/* PDF & EXTERNAL VIEWER IFRAME */}
              {!isImage && (
                <div className="w-full h-[70vh] relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                  {iframeError ? (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                      <AlertTriangle className="w-8 h-8 text-amber-400" />
                      <h4 className="font-bold text-white text-sm">تعذر التضمين المباشر للمستند في النافذة</h4>
                      <p className="text-xs text-slate-400 max-w-md">
                        قد تفرض سياسة Google Drive أو مزود الرابط فتحه في نافذة مستقلة. اضغط الزر أدناه لفتح المستند في Google Drive مباشرة.
                      </p>
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>فتح المستند في Google Drive الآن</span>
                      </a>
                    </div>
                  ) : (
                    <iframe
                      src={resource.url}
                      title={resource.title}
                      className="w-full h-full border-0"
                      allow="autoplay"
                      sandbox="allow-scripts allow-same-origin allow-popups"
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
          <span>منصة UMED الطبية • مكتبة المناهج والمحاضرات الرقمية</span>
          <span className="font-mono text-teal-400">ID: {resource.id}</span>
        </div>

      </div>
    </div>
  );
}
