/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * UMED Admin Student Enrollment Approval Queue
 * Enables University Admins to Review, Approve, or Reject Registrations
 */

import React, { useState, useEffect } from 'react';
import { 
  UserCheck, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Filter, 
  GraduationCap, 
  Building2, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { StudentEnrollment, EnrollmentStatus } from '../../types/umed.ts';
import { 
  fetchEnrollmentsForAdmin, 
  updateEnrollmentStatus 
} from '../../services/enrollmentService.ts';

interface EnrollmentApprovalManagerProps {
  adminUid: string;
  assignedUniversityId?: string;
}

export default function EnrollmentApprovalManager({
  adminUid,
  assignedUniversityId
}: EnrollmentApprovalManagerProps) {
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [filterStatus, setFilterStatus] = useState<EnrollmentStatus | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const loadEnrollments = async () => {
    setLoading(true);
    try {
      const list = await fetchEnrollmentsForAdmin(assignedUniversityId);
      setEnrollments(list);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل جلب طلبات القيد' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEnrollments();
  }, [assignedUniversityId]);

  const handleApprove = async (enrollmentId: string) => {
    setActionLoading(enrollmentId);
    setStatusMessage(null);
    try {
      await updateEnrollmentStatus(enrollmentId, 'approved', adminUid);
      setEnrollments(enrollments.map(e => e.id === enrollmentId ? { ...e, status: 'approved' } : e));
      setStatusMessage({ type: 'success', text: 'تم اعتماد القيد الأكاديمي للطالب بنجاح وتفعيل وصوله للمقررات.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل اعتماد القيد' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmReject = async (enrollmentId: string) => {
    setActionLoading(enrollmentId);
    setStatusMessage(null);
    try {
      await updateEnrollmentStatus(enrollmentId, 'rejected', adminUid, rejectReason);
      setEnrollments(enrollments.map(e => e.id === enrollmentId ? { ...e, status: 'rejected', rejectionReason: rejectReason } : e));
      setRejectingId(null);
      setRejectReason('');
      setStatusMessage({ type: 'success', text: 'تم رفض طلب القيد وتسجيل سبب الرفض.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'فشل رفض الطلب' });
    } finally {
      setActionLoading(null);
    }
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

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-semibold">
              إدارة القبول والتسجيل الأكاديمي
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
              Enrollment Approval Queue
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white">
            مراجعة واعتماد طلبات قيد الطلاب في كليات الطب
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تفعيل وصول الطلاب للمناهج والمقررات والاختبارات بعد التحقق من الرقم الجامعي وصحة البيانات.
          </p>
        </div>

        <button
          onClick={loadEnrollments}
          disabled={loading}
          className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث القائمة</span>
        </button>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-xl border text-xs flex items-center gap-2 ${
          statusMessage.type === 'success' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Status Filters */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
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

        {/* Search */}
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
                      <span className="font-bold text-white text-sm">طالب كلية الطب</span>
                      <span className="font-mono text-teal-300 font-bold bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800" dir="ltr">
                        {item.academicStudentNumber}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 font-mono" dir="ltr">
                      UID: {item.uid}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div>
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
                </div>
              </div>

              {/* Academic Hierarchy Context */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500 block">الجامعة:</span>
                  <span className="text-slate-200 font-semibold">{item.universityId === 'univ-dar-al-salam' ? 'جامعة دار السلام' : item.universityId}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">المستوى المطلوب:</span>
                  <span className="text-teal-300 font-semibold">
                    {item.currentStudyLevelId === 'lvl-internship' ? 'سنة الامتياز (سريري)' : `المستوى ${item.currentStudyLevelId.replace('lvl-', '')}`}
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

              {/* Action Buttons for Pending Items */}
              {item.status === 'pending' && (
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
                      <button
                        onClick={() => setRejectingId(item.id)}
                        disabled={actionLoading === item.id}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 hover:text-rose-300 text-slate-400 border border-slate-700 font-medium transition-colors"
                      >
                        رفض الطلب
                      </button>
                      <button
                        onClick={() => handleApprove(item.id)}
                        disabled={actionLoading === item.id}
                        className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold transition-colors shadow-md shadow-teal-600/20 flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>اعتماد القيد الأكاديمي</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

    </div>
  );
}
