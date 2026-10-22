/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Educational Content Management Console
 * Enables Administrators to Upload, Categorize, and Publish Medical Materials
 */

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  FileText, 
  Image as ImageIcon, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  Trash2, 
  RefreshCw, 
  X,
  UploadCloud,
  Check,
  Archive,
  Layers
} from 'lucide-react';
import { EducationalResource, ResourceType } from '../../types/umed.ts';
import { 
  fetchEducationalResources, 
  saveEducationalResource, 
  toggleResourceStatus, 
  deleteEducationalResource 
} from '../../services/resourceService.ts';
import ResourcePreviewModal from '../library/ResourcePreviewModal.tsx';

interface EducationalContentManagerProps {
  adminUid: string;
  assignedUniversityId?: string;
}

export default function EducationalContentManager({
  adminUid,
  assignedUniversityId = 'univ-dar-al-salam'
}: EducationalContentManagerProps) {
  const [resources, setResources] = useState<EducationalResource[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'archived'>('all');
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [previewResource, setPreviewResource] = useState<EducationalResource | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [form, setForm] = useState({
    title: '',
    description: '',
    resourceType: 'pdf' as ResourceType,
    url: '',
    fileSizeLabel: '1.5 MB',
    studyLevelId: 'lvl-4',
    studyPeriodId: 'blk-cvs',
    sectionType: 'theoretical' as 'theoretical' | 'practical' | 'general',
    status: 'published' as 'published' | 'draft' | 'archived'
  });

  const loadResources = async () => {
    setLoading(true);
    try {
      const list = await fetchEducationalResources({
        universityId: assignedUniversityId
      });
      setResources(list);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل جلب المواد التعليمية' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResources();
  }, [assignedUniversityId]);

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = `res-${Date.now().toString(36)}`;
      const newResource: EducationalResource = {
        id,
        title: form.title,
        description: form.description || undefined,
        resourceType: form.resourceType,
        url: form.url,
        fileSizeLabel: form.fileSizeLabel,
        universityId: assignedUniversityId,
        programId: 'prog-mbbs',
        curriculumVersionId: 'cur-dar-2024',
        studyLevelId: form.studyLevelId,
        studyPeriodId: form.studyPeriodId,
        sectionType: form.sectionType,
        status: form.status,
        createdBy: adminUid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await saveEducationalResource(newResource);
      setResources([newResource, ...resources]);
      setShowAddModal(false);
      setForm({
        title: '',
        description: '',
        resourceType: 'pdf',
        url: '',
        fileSizeLabel: '1.5 MB',
        studyLevelId: 'lvl-4',
        studyPeriodId: 'blk-cvs',
        sectionType: 'theoretical',
        status: 'published'
      });
      setStatusMessage({ type: 'success', text: 'تمت إضافة ونشر المورد التعليمي بنجاح!' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشلت إضافة المورد' });
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
    setStatusMessage({ type: 'success', text: 'تم حذف المورد التعليمي.' });
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
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-semibold">
              إدارة المحتوى والمكتبة الرقمية
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              Educational Content Hub
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            رفع وتصنيف المحاضرات والشرائح والمراجع الطبية
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ربط المواد بالمستوى الأكاديمي، البلوك الدراسي، والشعبة (نظري / عملي ومختبر) مع فحص حجم الملف.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-600/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مورد تعليمي جديد</span>
          </button>

          <button
            onClick={loadResources}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
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
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
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
            <option value="link">روابط خارجية</option>
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
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${
                  res.resourceType === 'pdf' ? 'bg-rose-500/10 text-rose-400' :
                  res.resourceType === 'image' ? 'bg-teal-500/10 text-teal-400' :
                  'bg-indigo-500/10 text-indigo-400'
                }`}>
                  {res.resourceType === 'pdf' && <FileText className="w-5 h-5" />}
                  {res.resourceType === 'image' && <ImageIcon className="w-5 h-5" />}
                  {res.resourceType !== 'pdf' && res.resourceType !== 'image' && <ExternalLink className="w-5 h-5" />}
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">{res.title}</span>
                    <span className="px-2 py-0.2 rounded bg-slate-950 border border-slate-800 text-amber-300 font-mono text-[10px]">
                      {res.fileSizeLabel || '1.8 MB'}
                    </span>
                    <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                      res.status === 'published' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                      'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {res.status === 'published' ? 'منشور للطلاب' : 'مسودة'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                    <span>المستوى: {res.studyLevelId}</span>
                    <span>•</span>
                    <span>الشعبة: {res.sectionType === 'theoretical' ? 'نظري' : 'عملي ومختبر'}</span>
                    <span>•</span>
                    <span className="font-mono text-slate-500">{new Date(res.createdAt).toLocaleDateString('ar-YE')}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewResource(res)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1 transition-colors border border-slate-700"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>معاينة</span>
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">إضافة ونشر مورد تعليمي طبي جديد</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateResource} className="space-y-3 text-xs">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">نوع المورد:</label>
                  <select
                    value={form.resourceType}
                    onChange={(e) => setForm({ ...form, resourceType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="pdf">ملف PDF (محاضرة / كتاب)</option>
                    <option value="image">صورة طبية / شريحة هستولوجي</option>
                    <option value="link">رابط موقع / مرجع خارجي</option>
                    <option value="video_link">رابط فيديو تعليمي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">حجم الملف (لإرشاد شبكات 3G):</label>
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

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">رابط الملف المعتمد (Google Drive / Direct URL):</label>
                <input
                  type="url"
                  required
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://drive.google.com/file/d/.../preview"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500"
                >
                  حفظ وتأكيد النشر
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
