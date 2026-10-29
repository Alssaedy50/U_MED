/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Low-Bandwidth Medical Resource Preview Modal
 * Universal In-App Viewer for PDFs (Multi-Page Canvas via PDF.js), Videos, Audio, Images & External Drive Links
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
  Volume2,
  Share2,
  Check
} from 'lucide-react';
import { EducationalResource } from '../../types/umed.ts';
import { resolveResourceFileUrl } from '../../services/resourceService.ts';

interface ResourcePreviewModalProps {
  resource: EducationalResource;
  onClose: () => void;
}

const PDFJS_CDN_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_CDN_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfJsLoadPromise: Promise<any> | null = null;

function ensurePdfJsLoaded(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN_WORKER;
    return Promise.resolve((window as any).pdfjsLib);
  }
  if (pdfJsLoadPromise) return pdfJsLoadPromise;

  pdfJsLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PDFJS_CDN_SCRIPT}"]`);
    if (existing && (window as any).pdfjsLib) {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN_WORKER;
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = PDFJS_CDN_SCRIPT;
    script.async = true;
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = PDFJS_CDN_WORKER;
        resolve(lib);
      } else {
        pdfJsLoadPromise = null;
        reject(new Error('PDF.js failed to initialize'));
      }
    };
    script.onerror = () => {
      pdfJsLoadPromise = null;
      reject(new Error('Failed to load PDF.js from CDN'));
    };
    document.head.appendChild(script);
  });

  return pdfJsLoadPromise;
}

interface PdfCanvasViewerProps {
  fileUrl: string;
  downloadUrl: string;
  title: string;
  fileName?: string;
}

function PdfCanvasViewer({ fileUrl, downloadUrl, title, fileName }: PdfCanvasViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.25);
  const [rendering, setRendering] = useState<boolean>(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [useFallbackIframe, setUseFallbackIframe] = useState<boolean>(false);
  const [fallbackIframeLoading, setFallbackIframeLoading] = useState<boolean>(true);
  const pdfDocRef = useRef<any>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    setHtmlContent(null);
    setUseFallbackIframe(false);
    setFallbackIframeLoading(true);

    async function loadPdfDocument() {
      try {
        // Fetch bytes from the blob: or stream URL
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        if (cancelled) return;

        // Check if the file is actually an HTML note rather than a binary PDF
        const headerBytes = new Uint8Array(arrayBuf.slice(0, 64));
        const headerStr = new TextDecoder().decode(headerBytes).trim();
        if (
          headerStr.startsWith('<!DOCTYPE') ||
          headerStr.startsWith('<html') ||
          headerStr.startsWith('<div')
        ) {
          const fullHtml = new TextDecoder().decode(new Uint8Array(arrayBuf));
          if (!cancelled) {
            setHtmlContent(fullHtml);
            setRendering(false);
          }
          return;
        }

        const pdfjsLib = await ensurePdfJsLoaded();
        if (cancelled) return;

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);
        setRendering(false);
      } catch {
        if (!cancelled) {
          setUseFallbackIframe(true);
          setRendering(false);
        }
      }
    }

    loadPdfDocument();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  useEffect(() => {
    const pdfDoc = pdfDocRef.current;
    const container = canvasContainerRef.current;
    if (!pdfDoc || !container || numPages === 0 || htmlContent || useFallbackIframe) return;

    let cancelled = false;
    container.innerHTML = '';

    const maxPagesToRender = Math.min(numPages, 120);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderedPages = new Set<number>();
    let observer: IntersectionObserver | null = null;

    async function renderSinglePage(pageNum: number, pageSlot: HTMLDivElement) {
      if (cancelled || renderedPages.has(pageNum)) return;
      renderedPages.add(pageNum);

      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth = Math.max(300, Math.min(container?.clientWidth || 720, 860) - 24);
        const fitScale = (containerWidth / baseViewport.width) * scale;
        const viewport = page.getViewport({ scale: fitScale });

        pageSlot.style.width = `${Math.floor(viewport.width)}px`;
        pageSlot.style.minHeight = `${Math.floor(viewport.height) + 28}px`;

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.className = 'block bg-white';

        const placeholder = pageSlot.querySelector('[data-pdf-placeholder]');
        if (placeholder) {
          pageSlot.replaceChild(canvas, placeholder);
        } else {
          pageSlot.appendChild(canvas);
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch {}
    }

    async function setupLazyPdfPages() {
      // Estimate default page dimensions from page 1 for smooth scroll placeholders
      let estimatedWidth = 680;
      let estimatedHeight = 920;
      try {
        const firstPage = await pdfDoc.getPage(1);
        if (!cancelled) {
          const baseVp = firstPage.getViewport({ scale: 1 });
          const cWidth = Math.max(300, Math.min(container?.clientWidth || 720, 860) - 24);
          const fit = (cWidth / baseVp.width) * scale;
          const vp = firstPage.getViewport({ scale: fit });
          estimatedWidth = Math.floor(vp.width);
          estimatedHeight = Math.floor(vp.height);
        }
      } catch {}

      if (cancelled || !container) return;

      const slots: Map<Element, number> = new Map();

      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const pageNum = slots.get(entry.target);
                if (pageNum) {
                  observer?.unobserve(entry.target);
                  renderSinglePage(pageNum, entry.target as HTMLDivElement);
                }
              }
            });
          },
          { rootMargin: '400px 0px' }
        );
      }

      for (let pageNum = 1; pageNum <= maxPagesToRender; pageNum++) {
        if (cancelled) break;

        const pageWrapper = document.createElement('div');
        pageWrapper.className =
          'relative bg-white rounded-xl shadow-lg overflow-hidden mx-auto mb-4 border border-slate-700';
        pageWrapper.style.width = `${estimatedWidth}px`;
        pageWrapper.style.minHeight = `${estimatedHeight + 28}px`;

        const pageBadge = document.createElement('div');
        pageBadge.className =
          'px-2.5 py-1 bg-slate-900/85 text-slate-200 text-[10px] font-mono flex items-center justify-between border-b border-slate-800';
        pageBadge.innerHTML = `<span>صفحة ${pageNum} من ${numPages}</span><span>U_MED PDF Reader</span>`;

        const placeholder = document.createElement('div');
        placeholder.setAttribute('data-pdf-placeholder', 'true');
        placeholder.style.width = `${estimatedWidth}px`;
        placeholder.style.height = `${estimatedHeight}px`;
        placeholder.className =
          'flex items-center justify-center bg-slate-100 text-slate-400 text-xs font-semibold';
        placeholder.textContent = `جاري تجهيز صفحة ${pageNum}...`;

        pageWrapper.appendChild(pageBadge);
        pageWrapper.appendChild(placeholder);
        container.appendChild(pageWrapper);

        // Render the first 3 pages immediately; lazy-render pages 4+ on scroll
        if (pageNum <= 3 || !observer) {
          await renderSinglePage(pageNum, pageWrapper);
        } else {
          slots.set(pageWrapper, pageNum);
          observer.observe(pageWrapper);
        }
      }
    }

    setupLazyPdfPages();

    return () => {
      cancelled = true;
      if (observer) {
        observer.disconnect();
      }
    };
  }, [numPages, scale, htmlContent, useFallbackIframe]);

  if (htmlContent) {
    return (
      <div className="w-full h-[70vh] relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
        {fallbackIframeLoading && (
          <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-slate-300">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
            <span className="text-xs font-bold">جارٍ تحميل محتوى المذكرة الطبية...</span>
          </div>
        )}
        <iframe
          srcDoc={htmlContent}
          title={title}
          onLoad={() => setFallbackIframeLoading(false)}
          className="relative z-10 w-full h-full border-0"
        />
      </div>
    );
  }

  if (useFallbackIframe) {
    return (
      <div className="w-full h-[70vh] flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-900 relative">
        <div className="relative flex-1 w-full">
          {fallbackIframeLoading && (
            <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-slate-300">
              <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
              <span className="text-xs font-bold">جارٍ تهيئة إطار المعاينة...</span>
            </div>
          )}
          <iframe
            src={fileUrl}
            title={title}
            onLoad={() => setFallbackIframeLoading(false)}
            className="relative z-10 w-full h-full border-0 bg-white"
          />
        </div>
        <div className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-300">
            إذا لم يظهر المستند داخل متصفح هاتفك، يمكنك فتحه أو تنزيله مباشرة:
          </span>
          <a
            href={downloadUrl || fileUrl}
            download={fileName || `${title}.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>فتح / تنزيل PDF</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[72vh] flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
      {/* Top Reader Controls */}
      <div className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 font-bold border border-teal-500/30">
            قارئ U_MED الذكي
          </span>
          {numPages > 0 && (
            <span className="font-mono text-[11px] text-slate-400">
              عدد الصفحات: <strong className="text-white">{numPages}</strong>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.75, Number((s - 0.25).toFixed(2))))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            title="تصغير"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-slate-300 min-w-[42px] text-center">
            {Math.round((scale / 1.25) * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.25).toFixed(2))))}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            title="تكبير"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setScale(1.25)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-teal-300 font-bold cursor-pointer"
          >
            ضبط تلقائي
          </button>
        </div>
      </div>

      {/* Scrollable Multi-Page Canvas Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-950/80">
        {rendering && (
          <div className="h-full flex flex-col items-center justify-center space-y-2 py-12 text-slate-300">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
            <span className="text-xs font-bold">جارٍ تجهيز صفحات ملف الـ PDF للمعاينة...</span>
          </div>
        )}
        <div ref={canvasContainerRef} className="w-full flex flex-col items-center" />
      </div>
    </div>
  );
}

export default function ResourcePreviewModal({ 
  resource, 
  onClose 
}: ResourcePreviewModalProps) {
  // Open small (<= 5MB) or locally cached files immediately with a single click
  const [hasConfirmedLoad, setHasConfirmedLoad] = useState<boolean>(() => {
    const rawUrl = resource.url || '';
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return true;
    try {
      if (localStorage.getItem(`umed_res_blob_${resource.id}`)) return true;
    } catch {}
    const label = (resource.fileSizeLabel || '').trim().toUpperCase();
    if (!label) return true;
    const match = label.match(/([\d.]+)\s*(KB|MB|GB|B)?/);
    if (!match) return true;
    const num = parseFloat(match[1]);
    const unit = match[2] || 'MB';
    const sizeBytes =
      unit === 'GB' ? num * 1024 * 1024 * 1024 :
      unit === 'MB' ? num * 1024 * 1024 :
      unit === 'KB' ? num * 1024 : num;
    return sizeBytes <= 5 * 1024 * 1024;
  });
  const [imageZoom, setImageZoom] = useState<number>(1);
  const [iframeError, setIframeError] = useState<boolean>(false);
  const [frameLoading, setFrameLoading] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolvedViewUrl, setResolvedViewUrl] = useState<string>('');
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string>('');
  const [isCloudStored, setIsCloudStored] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const lowerFile = (resource.fileName || resource.title || '').toLowerCase().replace(/\.html$/i, '');
  const lowerMime = (resource.mimeType || '').toLowerCase();
  const isVideo =
    resource.resourceType === 'video' ||
    lowerFile.endsWith('.mp4') ||
    lowerFile.endsWith('.mkv') ||
    lowerFile.endsWith('.mov') ||
    lowerFile.endsWith('.webm') ||
    lowerMime.includes('video');
  const isAudio =
    !isVideo &&
    (resource.resourceType === 'audio' ||
      lowerFile.endsWith('.mp3') ||
      lowerFile.endsWith('.m4a') ||
      lowerFile.endsWith('.ogg') ||
      lowerFile.endsWith('.wav') ||
      lowerMime.includes('audio'));
  const isImage =
    !isVideo &&
    !isAudio &&
    (resource.resourceType === 'image' ||
      lowerFile.endsWith('.jpg') ||
      lowerFile.endsWith('.jpeg') ||
      lowerFile.endsWith('.png') ||
      lowerFile.endsWith('.webp') ||
      lowerMime.includes('image'));
  const isPdf = !isVideo && !isAudio && !isImage;

  useEffect(() => {
    if (!hasConfirmedLoad) return;
    let active = true;
    let createdViewBlobUrl = '';
    let createdDownloadBlobUrl = '';
    setIsLoading(true);
    setFrameLoading(true);
    setLoadError(null);
    resolveResourceFileUrl(resource, (pct) => {
      if (active) setLoadProgress(pct);
    })
      .then((res) => {
        if (!active) {
          if (res.viewUrl.startsWith('blob:')) URL.revokeObjectURL(res.viewUrl);
          if (res.downloadUrl.startsWith('blob:') && res.downloadUrl !== res.viewUrl) {
            URL.revokeObjectURL(res.downloadUrl);
          }
          return;
        }
        if (res.viewUrl.startsWith('blob:')) createdViewBlobUrl = res.viewUrl;
        if (res.downloadUrl.startsWith('blob:')) createdDownloadBlobUrl = res.downloadUrl;
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
      if (createdViewBlobUrl) {
        try {
          URL.revokeObjectURL(createdViewBlobUrl);
        } catch {}
      }
      if (createdDownloadBlobUrl && createdDownloadBlobUrl !== createdViewBlobUrl) {
        try {
          URL.revokeObjectURL(createdDownloadBlobUrl);
        } catch {}
      }
    };
  }, [hasConfirmedLoad, resource]);

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleShareResource = async () => {
    const shareText = `📚 مورد طبي من منصة U_MED: ${resource.title}`;
    const shareUrl =
      resource.url && !resource.url.startsWith('umed-cloud://')
        ? resource.url.startsWith('/')
          ? `${window.location.origin}${resource.url}`
          : resource.url
        : window.location.href;

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: resource.title,
          text: shareText,
          url: shareUrl
        });
        return;
      }
    } catch {}

    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2.5 sm:p-5 overflow-y-auto overscroll-contain" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[calc(100dvh-1.25rem)] sm:max-h-[92dvh] my-auto flex flex-col shadow-2xl overflow-hidden">
        
        {/* Sleek Top Action Bar (Merged Title, Metadata, Download, Share & Close) */}
        <div className="p-3 sm:p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2.5 shrink-0">
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
              <h3 className="font-bold text-white text-xs sm:text-sm truncate">
                {resource.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                <span className="uppercase px-1.5 py-0.2 rounded bg-slate-800 font-mono text-teal-300">
                  {isAudio ? 'AUDIO' : isVideo ? 'VIDEO' : resource.resourceType}
                </span>
                <span>الحجم: <strong className="text-amber-300 font-mono">{resource.fileSizeLabel || 'غير محدد'}</strong></span>
                <span className="hidden xs:inline">•</span>
                <span className="hidden xs:inline">
                  {resource.sectionType === 'theoretical' ? 'نظري' : resource.sectionType === 'practical' ? 'عملي / مختبر' : 'عام'}
                </span>
              </div>
            </div>
          </div>

          {/* Merged Download & Share Top Action Toolbar */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 gap-1">
              {resolvedDownloadUrl && (
                <a
                  href={resolvedDownloadUrl}
                  download={resource.fileName || `${resource.title}.${isPdf ? 'pdf' : isAudio ? 'mp3' : isVideo ? 'mp4' : 'jpg'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                  title="تنزيل الملف إلى جهازك"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">تنزيل</span>
                </a>
              )}

              <button
                type="button"
                onClick={handleShareResource}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="مشاركة رابط أو عنوان الملف"
              >
                {copiedShare ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline text-emerald-300">تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">مشاركة</span>
                  </>
                )}
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 transition-colors"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-slate-950 flex flex-col items-center justify-start sm:justify-center min-h-[300px]">
          
          {/* BANDWIDTH GUARD SCREEN (Shown before load) */}
          {!hasConfirmedLoad ? (
            <div className="max-w-md w-full my-auto text-center space-y-4 p-5 sm:p-6 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl">
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
                    {isVideo
                      ? 'محاضرة / مقطع فيديو طبي'
                      : isAudio
                      ? 'تسجيل صوتي لمحاضرة'
                      : isImage
                      ? 'شريحة هستولوجي / صورة طبية'
                      : 'ملف محاضرة PDF'}
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
                    setIsLoading(true);
                    setHasConfirmedLoad(true);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-teal-600/20 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>
                    {isVideo
                      ? 'تشغيل الفيديو داخل المنصة الآن'
                      : isAudio
                      ? 'تشغيل التسجيل الصوتي الآن'
                      : 'تحميل ومعاينة الملف الآن'}
                  </span>
                </button>

                {resource.url &&
                  !resource.url.startsWith('umed-cloud://') &&
                  !resource.url.startsWith('/api/teledrive/stream/') &&
                  !resource.url.includes('1sample_') && (
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
          ) : isLoading || (!resolvedViewUrl && !loadError) ? (
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

                  {resolvedViewUrl && (
                    <audio
                      ref={audioRef}
                      controls
                      autoPlay
                      src={resolvedViewUrl || undefined}
                      className="w-full"
                    />
                  )}

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

              {/* 2. IMAGE / HISTOLOGY SLIDE VIEWER WITH BACKGROUND LOADING SPINNER */}
              {isImage && resolvedViewUrl && (
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

                  <div className="relative max-w-full min-h-[260px] max-h-[70vh] overflow-auto rounded-xl border border-slate-800 bg-black flex items-center justify-center p-2 w-full">
                    {frameLoading && (
                      <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 text-slate-300 bg-slate-950/90">
                        <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
                        <span className="text-xs font-bold">جارٍ عرض الشريحة الطبية...</span>
                      </div>
                    )}
                    <img 
                      src={resolvedViewUrl || undefined} 
                      alt={resource.title}
                      onLoad={() => setFrameLoading(false)}
                      style={{ transform: `scale(${imageZoom})`, transition: 'transform 0.15s ease' }}
                      className="relative z-10 max-h-[65vh] object-contain rounded-lg"
                      onError={() => {
                        setFrameLoading(false);
                        setIframeError(true);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 2.5 VIDEO LECTURE PLAYER WITH BACKGROUND LOADING SPINNER */}
              {isVideo && resolvedViewUrl && (
                <div className="relative w-full max-w-3xl min-h-[260px] flex flex-col items-center justify-center space-y-3">
                  {frameLoading && (
                    <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-950/90 text-slate-300 border border-slate-800">
                      <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
                      <span className="text-xs font-bold">جارٍ تهيئة مشغل الفيديو الطبي...</span>
                    </div>
                  )}
                  <video
                    controls
                    autoPlay
                    playsInline
                    onLoadedData={() => setFrameLoading(false)}
                    onCanPlay={() => setFrameLoading(false)}
                    src={resolvedViewUrl || undefined}
                    className="relative z-10 w-full max-h-[68vh] rounded-xl border border-slate-800 bg-black shadow-2xl"
                  />
                </div>
              )}

              {/* 3. PDF & DOCUMENT VIEWER (Multi-Page Canvas for Blob/Stream PDFs, Iframe with Loading Spinner Behind It for External Links) */}
              {!isImage && !isAudio && !isVideo && (
                resolvedViewUrl.startsWith('blob:') || resolvedViewUrl.startsWith('/api/teledrive/stream/') ? (
                  <PdfCanvasViewer
                    fileUrl={resolvedViewUrl}
                    downloadUrl={resolvedDownloadUrl || resolvedViewUrl}
                    title={resource.title}
                    fileName={resource.fileName}
                  />
                ) : (
                  <div className="w-full h-[70vh] relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                    {iframeError || !resolvedViewUrl ? (
                      <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                        <AlertTriangle className="w-8 h-8 text-amber-400" />
                        <h4 className="font-bold text-white text-sm">المستند جاهز للفتح أو التنزيل المباشر</h4>
                        <p className="text-xs text-slate-400 max-w-md">
                          اضغط الزر أدناه لفتح أو تنزيل الملف مباشرة على جهازك.
                        </p>
                        {(resolvedDownloadUrl || resolvedViewUrl) && (
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
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Clear Loading Spinner Behind Preview Frame until iframe finishes loading */}
                        {frameLoading && (
                          <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2.5 bg-slate-950/90 text-slate-300">
                            <RefreshCw className="w-7 h-7 animate-spin text-teal-400" />
                            <span className="text-xs font-bold">جارٍ تحميل معاينة المستند...</span>
                          </div>
                        )}
                        <iframe
                          src={resolvedViewUrl || undefined}
                          title={resource.title}
                          onLoad={() => setFrameLoading(false)}
                          className="relative z-10 w-full h-full border-0"
                          allow="autoplay"
                          onError={() => {
                            setFrameLoading(false);
                            setIframeError(true);
                          }}
                        />
                      </>
                    )}
                  </div>
                )
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
