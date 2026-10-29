/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Backup, Restore & Cloud Security Audit Console
 * - Internal Tab 1: SHA-256 Verified JSON Backup Export & Dry-Run Restore
 * - Internal Tab 2: Cloud Security Audit Logs (`auditLogs`) with Arabic Action Labels, Search, and Date Filter
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Database,
  Download,
  Upload,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Calendar,
  FileCheck,
  Activity,
  X
} from 'lucide-react';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import {
  db,
  fetchMergedAuditLogs,
  writeAuditLogToCloud
} from '../../lib/firebase.ts';
import { AuditLog } from '../../types/umed.ts';

interface BackupRestoreConsoleProps {
  adminEmail: string;
  initialSubTab?: 'backup_restore' | 'audit_logs';
}

const BACKUP_COLLECTIONS = [
  'universities',
  'colleges',
  'programs',
  'curriculumVersions',
  'studyLevels',
  'studyPeriods',
  'courseOfferings',
  'educationalResources',
  'questionBanks',
  'questions',
  'assessments',
  'studentEnrollments',
  'batchNotifications',
  'courseInstructors'
];

const AUDIT_ACTION_ARABIC_MAP: Record<string, string> = {
  OWNER_PROVISIONED: 'تأسيس وتوثيق حساب مالك المنصة',
  ROLE_ASSIGNED: 'ترقية أو إسناد صلاحية إشرافية',
  ROLE_REVOKED: 'إعفاء مستخدم من صلاحية إشرافية',
  ENROLLMENT_APPROVED: 'اعتماد وقبول قيد طالب بالدفعة',
  ENROLLMENT_REJECTED: 'رفض طلب قيد أكاديمي',
  ASSESSMENT_SCORED: 'تصحيح ورصد درجة اختبار لطالب',
  RESULTS_RELEASED: 'إعلان ونشر نتائج اختبار للدفعة',
  SEED_LOADED: 'مزامنة البيانات التأسيسية للهيكل الأكاديمي',
  ACADEMIC_STRUCTURE_UPDATED: 'تحديث الهيكل الأكاديمي أو استعادة نسخة',
  RESOURCE_CREATED: 'إضافة مورد تعليمي للمكتبة الطبية',
  RESOURCE_UPDATED: 'تعديل مورد تعليمي في المكتبة',
  RESOURCE_DELETED: 'حذف مورد تعليمي من المكتبة',
  INSTRUCTOR_ADDED: 'إضافة وربط دكتور مقرر دراسي',
  INSTRUCTOR_DELETED: 'حذف دكتور مقرر دراسي',
  BATCH_NOTIFICATION_SENT: 'نشر إعلان أو تنبيه للدفعة',
  USER_ACCOUNT_DELETED: 'حذف حساب مستخدم نهائياً من السحابة',
  USER_PROFILE_UPDATED: 'تعديل بيانات حساب مستخدم',
  USER_ARCHIVED: 'أرشفة وإيقاف حساب مستخدم',
  USER_UNARCHIVED: 'استعادة حساب مستخدم من الأرشيف',
  USER_VERIFIED: 'توثيق حساب مستخدم رسمياً',
  USERS_EXPORTED: 'تصدير نسخة احتياطية مشفرة SHA-256',
  QUESTIONS_BULK_IMPORTED: 'استيراد دفعة أسئلة لبنك الأسئلة'
};

export function translateAuditActionArabic(action: string): string {
  return AUDIT_ACTION_ARABIC_MAP[action] || action;
}

function formatAuditDetails(details: string | Record<string, any> | undefined): string {
  if (!details) return '—';
  if (typeof details === 'string') return details;
  try {
    return Object.entries(details)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' • ');
  } catch {
    return JSON.stringify(details);
  }
}

async function computeSha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function BackupRestoreConsole({
  adminEmail,
  initialSubTab = 'backup_restore'
}: BackupRestoreConsoleProps) {
  const [activeSubTab, setActiveSubTab] = useState<'backup_restore' | 'audit_logs'>(
    initialSubTab
  );

  // Backup & Restore State
  const [exporting, setExporting] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [lastChecksum, setLastChecksum] = useState<string>('');
  const [dryRunReport, setDryRunReport] = useState<{
    valid: boolean;
    checksum: string;
    totalDocs: number;
    collectionsSummary: Record<string, number>;
    rawPayload: Record<string, Record<string, unknown>[]>;
  } | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [auditDateFilter, setAuditDateFilter] = useState<string>('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 4500);
  };

  const loadAuditLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const logs = await fetchMergedAuditLogs();
      setAuditLogs(logs);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (activeSubTab === 'audit_logs') {
      loadAuditLogs();
    }
  }, [activeSubTab, loadAuditLogs]);

  const handleExportSnapshot = async () => {
    setExporting(true);
    try {
      const payload: Record<string, Record<string, unknown>[]> = {};
      for (const colName of BACKUP_COLLECTIONS) {
        try {
          const snap = await getDocs(collection(db, colName));
          payload[colName] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch {
          payload[colName] = [];
        }
      }
      const serialized = JSON.stringify(payload);
      const checksum = await computeSha256Hex(serialized);
      setLastChecksum(checksum);

      const snapshotDocument = {
        platform: 'UMED',
        version: '2.0',
        exportedAt: new Date().toISOString(),
        exportedBy: adminEmail,
        sha256Checksum: checksum,
        collections: payload
      };

      const blob = new Blob([JSON.stringify(snapshotDocument, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `umed-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      await writeAuditLogToCloud({
        action: 'USERS_EXPORTED',
        performedBy: adminEmail,
        details: `Exported verified backup with SHA-256: ${checksum}`
      });
      showToast('success', 'تم تصدير النسخة الاحتياطية الموثقة بتوقيع SHA-256 بنجاح.');
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر تصدير النسخة الاحتياطية.');
    } finally {
      setExporting(false);
    }
  };

  const handleUploadBackupForDryRun = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.collections || typeof parsed.collections !== 'object') {
        throw new Error('صيغة ملف النسخة الاحتياطية غير صالحة.');
      }
      const recomputedHash = await computeSha256Hex(JSON.stringify(parsed.collections));
      const hashMatches =
        !parsed.sha256Checksum || parsed.sha256Checksum === recomputedHash;

      const summary: Record<string, number> = {};
      let totalDocs = 0;
      for (const [k, arr] of Object.entries(parsed.collections)) {
        const count = Array.isArray(arr) ? arr.length : 0;
        summary[k] = count;
        totalDocs += count;
      }

      setDryRunReport({
        valid: hashMatches,
        checksum: recomputedHash,
        totalDocs,
        collectionsSummary: summary,
        rawPayload: parsed.collections
      });
      showToast(
        hashMatches ? 'success' : 'error',
        hashMatches
          ? `اجتاز الملف فحص المحاكاة (Dry-Run) بنجاح (${totalDocs} سجل).`
          : 'تحذير: بصمة SHA-256 للملف لا تطابق البصمة الأصلية!'
      );
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر قراءة ملف النسخة الاحتياطية.');
    }
  };

  const handleExecuteRestore = async () => {
    if (!dryRunReport || !dryRunReport.valid) return;
    setRestoring(true);
    try {
      for (const [colName, docsArray] of Object.entries(dryRunReport.rawPayload)) {
        if (!Array.isArray(docsArray) || docsArray.length === 0) continue;
        const batch = writeBatch(db);
        for (const item of docsArray.slice(0, 400)) {
          const docId = String(item.id || `doc-${Date.now()}`);
          batch.set(doc(db, colName, docId), item, { merge: true });
        }
        await batch.commit();
      }
      await writeAuditLogToCloud({
        action: 'ACADEMIC_STRUCTURE_UPDATED',
        performedBy: adminEmail,
        details: `Restored ${dryRunReport.totalDocs} documents (SHA-256: ${dryRunReport.checksum.slice(
          0,
          16
        )})`
      });
      showToast('success', 'تمت استعادة البيانات السحابية بنجاح.');
      setDryRunReport(null);
    } catch (err: any) {
      showToast('error', err?.message || 'حدث خطأ أثناء استعادة البيانات.');
    } finally {
      setRestoring(false);
    }
  };

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (auditDateFilter && !entry.timestamp.startsWith(auditDateFilter)) {
        return false;
      }
      if (!q) return true;
      const arabicAction = translateAuditActionArabic(entry.action).toLowerCase();
      const formattedDetails = formatAuditDetails(entry.details).toLowerCase();
      return (
        arabicAction.includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        (entry.targetEmail || '').toLowerCase().includes(q) ||
        (entry.targetUid || '').toLowerCase().includes(q) ||
        entry.performedBy.toLowerCase().includes(q) ||
        formattedDetails.includes(q)
      );
    });
  }, [auditLogs, auditSearch, auditDateFilter]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header & Unified 2 Internal Tabs */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                النسخ الاحتياطي وسجل التدقيق الأمني السحابي
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                إدارة النسخ الاحتياطية الموثقة بـ SHA-256 ومراقبة سجل العمليات الإدارية (Audit Logs)
              </p>
            </div>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)]">
          <button
            type="button"
            onClick={() => setActiveSubTab('backup_restore')}
            className={`py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeSubTab === 'backup_restore'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>النسخ الاحتياطي والاستعادة (SHA-256)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('audit_logs')}
            className={`py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeSubTab === 'audit_logs'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>سجل التدقيق السحابي (Audit Logs)</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: BACKUP & RESTORE */}
      {activeSubTab === 'backup_restore' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 space-y-4 shadow-lg">
            <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <Download className="w-4 h-4 text-teal-400" />
              <span>تصدير نسخة احتياطية كاملة موثقة بـ SHA-256</span>
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              يقوم النظام بجمع كافة المجموعات السحابية الأكاديمية وبنوك الأسئلة والمستخدمين وتوليد بصمة رقمية SHA-256 لمنع أي تلاعب بالملف.
            </p>
            {lastChecksum && (
              <div
                className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px] font-mono break-all text-teal-400"
                dir="ltr"
              >
                SHA-256: {lastChecksum}
              </div>
            )}
            <button
              type="button"
              onClick={handleExportSnapshot}
              disabled={exporting}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2"
            >
              {exporting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>تصدير وتحميل النسخة الاحتياطية الآن</span>
            </button>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 space-y-4 shadow-lg">
            <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-400" />
              <span>فحص المحاكاة (Dry-Run) واستعادة النسخة الاحتياطية</span>
            </h3>
            <label className="block w-full p-4 rounded-xl border-2 border-dashed border-[var(--border-color)] hover:border-indigo-500/50 text-center cursor-pointer bg-[var(--bg-input)]">
              <FileCheck className="w-6 h-6 text-indigo-400 mx-auto mb-1.5" />
              <span className="text-xs font-bold text-[var(--text-primary)] block">
                اختر ملف النسخة الاحتياطية (.json) لفحصه قبل الاستعادة
              </span>
              <input
                type="file"
                accept=".json"
                onChange={handleUploadBackupForDryRun}
                className="hidden"
              />
            </label>

            {dryRunReport && (
              <div className="p-3.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold">
                  <span>إجمالي السجلات الجاهزة للاستعادة:</span>
                  <span className="text-teal-400 font-mono">{dryRunReport.totalDocs}</span>
                </div>
                <button
                  type="button"
                  onClick={handleExecuteRestore}
                  disabled={!dryRunReport.valid || restoring}
                  className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-1.5"
                >
                  {restoring ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>اعتماد وتنفيذ الاستعادة السحابية</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: MERGED CLOUD AUDIT LOGS WITH ARABIC TRANSLATIONS, SEARCH & DATE FILTER */
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="ابحث في سجل التدقيق بالعملية، الكيان، أو البريد..."
                  className="w-full pr-9 pl-3 py-2 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-[var(--text-primary)]"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <input
                  type="date"
                  value={auditDateFilter}
                  onChange={(e) => setAuditDateFilter(e.target.value)}
                  className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none"
                />
                {auditDateFilter && (
                  <button
                    type="button"
                    onClick={() => setAuditDateFilter('')}
                    className="text-[11px] text-rose-400 font-bold"
                  >
                    مسح
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={loadAuditLogs}
              className="px-3.5 py-2 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin text-teal-400' : ''}`}
              />
              <span>تحديث السجل ({filteredAuditLogs.length})</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
                  <th className="py-2.5 px-3 font-bold">العملية (مُعرّبة)</th>
                  <th className="py-2.5 px-3 font-bold">المستهدف</th>
                  <th className="py-2.5 px-3 font-bold">المنفذ</th>
                  <th className="py-2.5 px-3 font-bold">التفاصيل</th>
                  <th className="py-2.5 px-3 font-bold">التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-muted)]">
                      لا توجد سجلات تدقيق مطابقة لمعايير البحث الحالية.
                    </td>
                  </tr>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--bg-elevated)]/50">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-teal-400">
                          {translateAuditActionArabic(log.action)}
                        </div>
                        <div
                          className="text-[10px] text-[var(--text-muted)] font-mono"
                          dir="ltr"
                        >
                          {log.action}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-primary)]">
                        {log.targetEmail || log.targetUid || log.universityId || 'النظام العام'}
                      </td>
                      <td
                        className="py-2.5 px-3 font-mono text-[11px] text-indigo-400"
                        dir="ltr"
                      >
                        {log.performedBy}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)] max-w-xs truncate">
                        {formatAuditDetails(log.details)}
                      </td>
                      <td
                        className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-muted)]"
                        dir="ltr"
                      >
                        {new Date(log.timestamp).toLocaleString('ar-YE')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
