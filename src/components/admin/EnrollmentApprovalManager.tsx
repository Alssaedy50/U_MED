/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Admin Student Enrollment Approval Queue & Academic Change Requests Manager
 * Enables Admins to Review, Approve, Reject, Edit, or Delete Enrollments & Change Requests
 */

import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Search, 
  GraduationCap, 
  RefreshCw,
  AlertCircle,
  Edit2,
  Trash2,
  FileEdit,
  X,
  UserPlus
} from 'lucide-react';
import { 
  StudentEnrollment, 
  EnrollmentStatus, 
  AcademicChangeRequest,
  StudyLevel,
  DAR_AL_SALAM_SEED
} from '../../types/umed.ts';
import { 
  fetchEnrollmentsForAdmin, 
  submitEnrollmentRequest,
  updateEnrollmentStatus,
  updateStudentEnrollment,
  deleteEnrollment,
  fetchAcademicChangeRequestsForAdmin,
  reviewAcademicChangeRequest
} from '../../services/enrollmentService.ts';
import { fetchStudyLevels } from '../../services/academicService.ts';

interface EnrollmentApprovalManagerProps {
  adminUid: string;
  assignedUniversityId?: string;
}

export default function EnrollmentApprovalManager({
  adminUid,
  assignedUniversityId
}: EnrollmentApprovalManagerProps) {
  const [activeView, setActiveView] = useState<'enrollments' | 'change_requests'>('enrollments');
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [changeRequests, setChangeRequests] = useState<AcademicChangeRequest[]>([]);
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>(DAR_AL_SALAM_SEED.studyLevels);

  const [filterStatus, setFilterStatus] = useState<EnrollmentStatus | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Direct Edit, Add & Delete States
  const [editingEnrollment, setEditingEnrollment] = useState<StudentEnrollment | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState<boolean>(false);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [newStudentNumber, setNewStudentNumber] = useState<string>('');
  const [newStudentLevelId, setNewStudentLevelId] = useState<string>('lvl-1');
  const [newStudentUid, setNewStudentUid] = useState<string>('');
  const [newStudentYear, setNewStudentYear] = useState<string>('2025/2026');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [enrList, reqList, lvlList] = await Promise.all([
        fetchEnrollmentsForAdmin(assignedUniversityId),
        fetchAcademicChangeRequestsForAdmin(assignedUniversityId),
        fetchStudyLevels('prog-mbbs')
      ]);
      setEnrollments(enrList);
      setChangeRequests(reqList);
      if (lvlList && lvlList.length > 0) {
        setStudyLevels(lvlList);
      }
      // If pending queue is empty but there are enrollments, show all so list isn't blank
      const pendingCount = enrList.filter(e => e.status === 'pending').length;
      if (pendingCount === 0 && enrList.length > 0) {
        setFilterStatus('all');
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل جلب طلبات القيد والتعديل الأكاديمي' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [assignedUniversityId]);

  const handleApprove = async (enrollmentId: string) => {
    setActionLoading(enrollmentId);
    setStatusMessage(null);
    try {
      const updated = await updateEnrollmentStatus(enrollmentId, 'approved', adminUid);
      setEnrollments(prev => {
        const next = prev.map(e => e.id === enrollmentId ? updated : e);
        const remainingPending = next.filter(e => e.status === 'pending').length;
        if (filterStatus === 'pending' && remainingPending === 0) {
          setFilterStatus('all');
        }
        return next;
      });
      setStatusMessage({ type: 'success', text: `تم اعتماد القيد الأكاديمي للطالب (${updated.studentNameArabic || updated.academicStudentNumber}) وحفظه في السحابة بنجاح ✓` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل اعتماد القيد' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddAndApproveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentNumber.trim()) return;
    setActionLoading('add-new');
    setStatusMessage(null);
    try {
      const targetUid = newStudentUid.trim() || `stu-${Date.now().toString(36)}`;
      const created = await submitEnrollmentRequest({
        uid: targetUid,
        studentNameArabic: newStudentName.trim(),
        universityId: assignedUniversityId || 'univ-dar-al-salam',
        collegeId: 'col-human-medicine',
        programId: 'prog-mbbs',
        curriculumVersionId: 'cur-dar-2024',
        currentStudyLevelId: newStudentLevelId,
        academicStudentNumber: newStudentNumber.trim(),
        academicYear: newStudentYear.trim() || '2025/2026',
        policy: 'immediate'
      });
      const approved = await updateEnrollmentStatus(created.id, 'approved', adminUid);
      setEnrollments(prev => [approved, ...prev.filter(item => item.id !== approved.id)]);
      setFilterStatus('all');
      setShowAddStudentModal(false);
      setNewStudentName('');
      setNewStudentNumber('');
      setNewStudentUid('');
      setStatusMessage({
        type: 'success',
        text: `تم تسجيل واعتماد الطالب الجديد (${approved.studentNameArabic} - ${approved.academicStudentNumber}) بنجاح ✓`
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل إضافة الطالب الجديد' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmReject = async (enrollmentId: string) => {
    setActionLoading(enrollmentId);
    setStatusMessage(null);
    try {
      await updateEnrollmentStatus(enrollmentId, 'rejected', adminUid, rejectReason);
      setEnrollments(prev => prev.map(e => e.id === enrollmentId ? { ...e, status: 'rejected', rejectionReason: rejectReason } : e));
      setRejectingId(null);
      setRejectReason('');
      setStatusMessage({ type: 'success', text: 'تم رفض طلب القيد وتسجيل سبب الرفض.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل رفض الطلب' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveEnrollmentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEnrollment) return;
    setActionLoading(editingEnrollment.id);
    setStatusMessage(null);

    try {
      const updated = await updateStudentEnrollment(editingEnrollment.id, {
        currentStudyLevelId: editingEnrollment.currentStudyLevelId,
        academicStudentNumber: (editingEnrollment.academicStudentNumber || '').trim(),
        academicYear: (editingEnrollment.academicYear || '').trim(),
        status: editingEnrollment.status
      });
      if (updated) {
        setEnrollments(prev => prev.map(item => item.id === updated.id ? updated : item));
      }
      setEditingEnrollment(null);
      setStatusMessage({ type: 'success', text: 'تم تحديث بيانات قيد الطالب والمستوى الدراسي بنجاح.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل تعديل بيانات القيد' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteEnrollment = async (enrollmentId: string) => {
    setActionLoading(enrollmentId);
    setStatusMessage(null);
    try {
      await deleteEnrollment(enrollmentId);
      setEnrollments(prev => prev.filter(e => e.id !== enrollmentId));
      setConfirmDeleteId(null);
      setStatusMessage({ type: 'success', text: 'تم حذف سجل القيد الأكاديمي نهائياً بنجاح.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل حذف سجل القيد' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReviewChangeRequest = async (req: AcademicChangeRequest, status: 'approved' | 'rejected') => {
    setActionLoading(req.id);
    setStatusMessage(null);
    try {
      const updatedReq = await reviewAcademicChangeRequest(req.id, status, adminUid);
      if (updatedReq) {
        setChangeRequests(prev => prev.map(r => r.id === req.id ? updatedReq : r));
      }
      if (status === 'approved') {
        // Refresh enrollments list to reflect the updated studyLevelId & academicStudentNumber
        const refreshedEnrollments = await fetchEnrollmentsForAdmin(assignedUniversityId);
        setEnrollments(refreshedEnrollments);
        setStatusMessage({
          type: 'success',
          text: 'تم قبول طلب التعديل الأكاديمي وتحديث المستوى الدراسي / الرقم الجامعي في سجل قيد الطالب تلقائياً ✓'
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'تم رفض طلب التعديل الأكاديمي.'
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل معالجة طلب التعديل الأكاديمي' });
    } finally {
      setActionLoading(null);
    }
  };

  const getLevelLabel = (lvlId?: string) => {
    if (!lvlId) return 'غير محدد';
    const found = studyLevels.find(l => l.id === lvlId);
    if (found) return found.titleArabic;
    return lvlId === 'lvl-internship' ? 'سنة الامتياز (سريري)' : `المستوى ${lvlId.replace('lvl-', '')}`;
  };

  const filteredList = enrollments.filter(item => {
    const currentStatus = item.status || item.enrollmentStatus;
    const matchesStatus = filterStatus === 'all' || currentStatus === filterStatus;
    const matchesSearch = !searchQuery || 
      item.studentNameArabic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.academicStudentNumber && item.academicStudentNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      item.uid.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pendingChangeRequestsCount = changeRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Top Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-semibold">
              إدارة القبول والتسجيل الأكاديمي
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              Enrollment & Change Requests
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            مراجعة واعتماد قيود الطلاب وطلبات التعديل الأكاديمي
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            اعتماد وتعديل وحذف سجلات قيد الطلاب، ومراجعة طلبات ترقية المستوى الدراسي أو تصحيح الرقم الجامعي.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveView('enrollments')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'enrollments'
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>سجلات القيد ({enrollments.length})</span>
            </button>
            <button
              onClick={() => setActiveView('change_requests')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeView === 'change_requests'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileEdit className="w-4 h-4" />
              <span>طلبات التعديل الأكاديمي ({changeRequests.length})</span>
              {pendingChangeRequestsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold">
                  {pendingChangeRequestsCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setShowAddStudentModal(true)}
            className="py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-teal-600/20"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ إضافة واعتماد طالب جديد</span>
          </button>

          <button
            onClick={loadAll}
            disabled={loading}
            className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-xl border text-xs flex items-center gap-2 ${
          statusMessage.type === 'success' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* VIEW 1: STUDENT ENROLLMENTS */}
      {activeView === 'enrollments' && (
        <>
          {/* Filter & Search Bar */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
              <button
                onClick={() => setFilterStatus('pending')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
                  filterStatus === 'pending' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>بانتظار الاعتماد ({enrollments.filter(e => e.status === 'pending').length})</span>
              </button>

              <button
                onClick={() => setFilterStatus('approved')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
                  filterStatus === 'approved' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>المعتمدون ({enrollments.filter(e => e.status === 'approved').length})</span>
              </button>

              <button
                onClick={() => setFilterStatus('rejected')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
                  filterStatus === 'rejected' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>المرفوضون ({enrollments.filter(e => e.status === 'rejected').length})</span>
              </button>

              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${
                  filterStatus === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل ({enrollments.length})
              </button>
            </div>

            <div className="relative min-w-[240px]">
              <Search className="w-3.5 h-3.5 absolute right-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالرقم الأكاديمي أو المعرف..."
                className="w-full pl-3 pr-9 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono"
                dir="ltr"
              />
            </div>
          </div>

          {/* Enrollments Cards List */}
          <div className="space-y-3">
            {filteredList.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-10 text-center text-slate-500 text-xs">
                لا توجد طلبات قيد مطابقة للفلتر المحدد حالياً.
              </div>
            ) : (
              filteredList.map((item) => (
                <div key={item.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg text-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{item.studentNameArabic || 'طالب كلية الطب'}</span>
                          <span className="font-mono text-teal-300 font-bold bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800" dir="ltr">
                            {item.academicStudentNumber}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 font-mono" dir="ltr">
                          UID: {item.uid}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.status === 'pending' && (
                        <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>قيد المراجعة</span>
                        </span>
                      )}
                      {item.status === 'approved' && (
                        <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>معتمد رسمياً</span>
                        </span>
                      )}
                      {item.status === 'rejected' && (
                        <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>مرفوض</span>
                        </span>
                      )}

                      <button
                        onClick={() => setEditingEnrollment(item)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="تعديل المستوى أو الرقم الجامعي"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="p-2 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 text-rose-400 transition-colors"
                        title="حذف القيد"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Academic Hierarchy Context */}
                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">الجامعة:</span>
                      <span className="text-slate-200 font-semibold">{item.universityId === 'univ-dar-al-salam' ? 'جامعة دار السلام' : item.universityId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">المستوى الحالي:</span>
                      <span className="text-teal-300 font-semibold">
                        {getLevelLabel(item.currentStudyLevelId)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">العام الأكاديمي:</span>
                      <span className="text-slate-200 font-mono" dir="ltr">{item.academicYear}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">تاريخ التقديم:</span>
                      <span className="text-slate-400 font-mono">{new Date(item.enrolledAt || item.requestedAt || Date.now()).toLocaleDateString('ar-YE')}</span>
                    </div>
                  </div>

                  {item.rejectionReason && (
                    <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-[11px]">
                      <strong>سبب الرفض:</strong> {item.rejectionReason}
                    </div>
                  )}

                  {confirmDeleteId === item.id && (
                    <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 flex items-center justify-between gap-2">
                      <span className="text-rose-200 font-bold">هل أنت متأكد من حذف قيد الطالب ({item.academicStudentNumber}) نهائياً؟</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteEnrollment(item.id)}
                          disabled={actionLoading === item.id}
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                        >
                          تأكيد الحذف
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-2 flex items-center justify-end gap-2">
                    {rejectingId === item.id ? (
                      <div className="w-full flex items-center gap-2">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="اكتب سبب الرفض (مثال: الرقم الجامعي غير صحيح)..."
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-rose-800 text-white text-xs"
                        />
                        <button
                          onClick={() => handleConfirmReject(item.id)}
                          disabled={actionLoading === item.id}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                        >
                          تأكيد الرفض
                        </button>
                        <button
                          onClick={() => setRejectingId(null)}
                          className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <>
                        {item.status !== 'rejected' && (
                          <button
                            onClick={() => setRejectingId(item.id)}
                            disabled={actionLoading === item.id}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 text-slate-400 border border-slate-700 font-medium transition-colors"
                          >
                            رفض الطلب
                          </button>
                        )}
                        {item.status !== 'approved' && (
                          <button
                            onClick={() => handleApprove(item.id)}
                            disabled={actionLoading === item.id}
                            className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold transition-colors shadow-md shadow-teal-600/20 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>اعتماد القيد الأكاديمي</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* VIEW 2: ACADEMIC CHANGE REQUESTS */}
      {activeView === 'change_requests' && (
        <div className="space-y-4">
          {changeRequests.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-10 text-center text-slate-500 text-xs">
              لا توجد طلبات تعديل أكاديمي مرفوعة من الطلاب حالياً.
            </div>
          ) : (
            changeRequests.map((req) => (
              <div key={req.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg text-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                      <FileEdit className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">طلب تعديل بيانات القيد الأكاديمي</div>
                      <div className="text-[11px] text-slate-400 font-mono" dir="ltr">
                        UID: {req.uid} • Enrollment: {req.enrollmentId}
                      </div>
                    </div>
                  </div>

                  <div>
                    {req.status === 'pending' && (
                      <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>بانتظار المراجعة</span>
                      </span>
                    )}
                    {req.status === 'approved' && (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تم القبول وتحديث القيد ✓</span>
                      </span>
                    )}
                    {req.status === 'rejected' && (
                      <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>مرفوض</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-500 block">المستوى الدراسي المطلوب الانتقال إليه:</span>
                    <span className="text-teal-300 font-bold text-sm">
                      {req.requestedLevelId ? getLevelLabel(req.requestedLevelId) : 'بدون تغيير'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">الرقم الجامعي المطلوب:</span>
                    <span className="text-amber-300 font-mono font-bold text-sm" dir="ltr">
                      {req.requestedAcademicNumber || 'بدون تغيير'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">تاريخ الطلب:</span>
                    <span className="text-slate-300 font-mono">
                      {new Date(req.createdAt || req.requestedAt || Date.now()).toLocaleString('ar-YE')}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/60 text-slate-300">
                  <strong className="text-slate-400 block mb-1">سبب ومبررات الطلب:</strong>
                  {req.reason}
                </div>

                {req.status === 'pending' && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleReviewChangeRequest(req, 'rejected')}
                      disabled={actionLoading === req.id}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-300 border border-slate-700 font-semibold transition-colors"
                    >
                      رفض
                    </button>
                    <button
                      onClick={() => handleReviewChangeRequest(req, 'approved')}
                      disabled={actionLoading === req.id}
                      className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold transition-colors shadow-lg flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>قبول وتحديث القيد</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL: DIRECT EDIT ENROLLMENT */}
      {editingEnrollment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <form onSubmit={handleSaveEnrollmentEdit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">تعديل قيد الطالب مباشرة</h3>
              <button type="button" onClick={() => setEditingEnrollment(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">الرقم الجامعي / الأكاديمي</label>
                <input
                  type="text"
                  value={editingEnrollment.academicStudentNumber}
                  onChange={(e) => setEditingEnrollment({ ...editingEnrollment, academicStudentNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  dir="ltr"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">المستوى الدراسي الحالي</label>
                <select
                  value={editingEnrollment.currentStudyLevelId}
                  onChange={(e) => setEditingEnrollment({ ...editingEnrollment, currentStudyLevelId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                >
                  {studyLevels.map(lvl => (
                    <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">العام الأكاديمي</label>
                <input
                  type="text"
                  value={editingEnrollment.academicYear}
                  onChange={(e) => setEditingEnrollment({ ...editingEnrollment, academicYear: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">حالة القيد</label>
                <select
                  value={editingEnrollment.status}
                  onChange={(e) => setEditingEnrollment({ ...editingEnrollment, status: e.target.value as EnrollmentStatus })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-teal-300 font-bold"
                >
                  <option value="approved">معتمد (Approved)</option>
                  <option value="pending">قيد المراجعة (Pending)</option>
                  <option value="rejected">مرفوض (Rejected)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingEnrollment(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={actionLoading === editingEnrollment.id}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
              >
                حفظ التغييرات
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD & APPROVE NEW STUDENT DIRECTLY */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <form onSubmit={handleAddAndApproveStudent} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-teal-400" />
                <span>تسجيل واعتماد قيد طالب جديد مباشرة</span>
              </h3>
              <button type="button" onClick={() => setShowAddStudentModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">اسم الطالب الرباعي بالعربية:</label>
                <input
                  type="text"
                  required
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="مثال: د. محمد عبدالله الصالحي"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">الرقم الجامعي / الأكاديمي:</label>
                <input
                  type="text"
                  required
                  value={newStudentNumber}
                  onChange={(e) => setNewStudentNumber(e.target.value)}
                  placeholder="مثال: 20211105"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">المستوى الدراسي:</label>
                <select
                  value={newStudentLevelId}
                  onChange={(e) => setNewStudentLevelId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                >
                  {studyLevels.map(lvl => (
                    <option key={lvl.id} value={lvl.id}>{lvl.titleArabic}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">العام الأكاديمي:</label>
                  <input
                    type="text"
                    value={newStudentYear}
                    onChange={(e) => setNewStudentYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">معرف حساب الطالب UID (اختياري):</label>
                  <input
                    type="text"
                    value={newStudentUid}
                    onChange={(e) => setNewStudentUid(e.target.value)}
                    placeholder="إن وجد"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddStudentModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={actionLoading === 'add-new'}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold"
              >
                {actionLoading === 'add-new' ? 'جارٍ الحفظ والاعتماد...' : 'إضافة واعتماد القيد فوراً'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
