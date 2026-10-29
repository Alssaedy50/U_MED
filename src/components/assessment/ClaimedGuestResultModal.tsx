import React from 'react';
import { Trophy, Download, FileText, X } from 'lucide-react';
import { Assessment, AssessmentResult } from '../../types/umed.ts';
import {
  resolveResultPublicDisplayName,
  downloadExamBookletFile
} from '../../services/assessmentService.ts';

interface ClaimedGuestResultModalProps {
  claimedGuestOutcome: {
    result: AssessmentResult;
    assessment: Assessment;
  };
  claimedLeaderboard: AssessmentResult[];
  currentUid?: string;
  studentNameArabic?: string;
  onClose: () => void;
}

export function ClaimedGuestResultModal({
  claimedGuestOutcome,
  claimedLeaderboard,
  currentUid,
  studentNameArabic,
  onClose
}: ClaimedGuestResultModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
      <div className="umed-card bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 sm:p-6 max-w-xl w-full my-auto space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-400" />
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                نتيجتك المعتمدة وترتيبك في الاختبار المشترك
              </h3>
              <p className="text-[11px] text-teal-400 font-semibold">
                {claimedGuestOutcome.assessment.titleArabic}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 rounded-2xl bg-[var(--bg-input)] border border-teal-500/40 text-center space-y-2 tabular-nums">
          <span className="px-3 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold">
            تم تصحيح إجاباتك بنجاح ✓
          </span>
          <div className="text-3xl font-black text-teal-400 font-mono pt-1">
            {claimedGuestOutcome.result.percentage}%
          </div>
          <div className="text-xs text-[var(--text-secondary)] font-semibold">
            الدرجة المكتسبة: <span className="font-mono text-[var(--text-primary)]">{claimedGuestOutcome.result.score}</span> من{' '}
            <span className="font-mono text-[var(--text-primary)]">{claimedGuestOutcome.result.totalPoints}</span> نقطة
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            اسمك المعروض للطلاب في لوحة الترتيب:{' '}
            <strong className="text-amber-400">
              {resolveResultPublicDisplayName(claimedGuestOutcome.result)}
            </strong>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-amber-400 tabular-nums">
            <span>🏆 ترتيب الطلاب في هذا الاختبار (الأعلى درجة والأسرع حلاً):</span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">{claimedLeaderboard.length} مشارك</span>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {claimedLeaderboard.length === 0 ? (
              <div className="p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs text-teal-400 text-center font-bold">
                أنت في المركز الأول (#1) حالياً في هذا الاختبار! 🎉
              </div>
            ) : (
              claimedLeaderboard.slice(0, 15).map((item, idx) => {
                const isMe = item.uid === currentUid || item.id === claimedGuestOutcome.result.id;
                return (
                  <div
                    key={item.id || idx}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs tabular-nums ${
                      isMe
                        ? 'bg-teal-500/15 border-teal-500/60 text-[var(--text-primary)] font-bold'
                        : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-6 h-6 rounded-lg font-mono text-[11px] font-extrabold flex items-center justify-center ${
                          idx === 0
                            ? 'bg-amber-400 text-slate-950'
                            : idx === 1
                            ? 'bg-slate-300 text-slate-950'
                            : idx === 2
                            ? 'bg-amber-700 text-white'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <span>{resolveResultPublicDisplayName(item)}</span>
                      {isMe && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-500/20 text-teal-400">
                          أنت
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-[var(--text-muted)] text-[11px]">{item.score}/{item.totalPoints}</span>
                      <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-400 font-bold">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              downloadExamBookletFile({
                assessment: claimedGuestOutcome.assessment,
                result: claimedGuestOutcome.result,
                studentNameArabic,
                mode: 'solved'
              })
            }
            className="py-2.5 px-3 rounded-xl bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/40 text-teal-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download className="w-4 h-4 text-teal-400 shrink-0" />
            <span>تحميل الاختبار محلولاً (مع التعليل)</span>
          </button>
          <button
            type="button"
            onClick={() =>
              downloadExamBookletFile({
                assessment: claimedGuestOutcome.assessment,
                result: claimedGuestOutcome.result,
                studentNameArabic,
                mode: 'blank'
              })
            }
            className="py-2.5 px-3 rounded-xl bg-[var(--bg-input)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <FileText className="w-4 h-4 text-amber-400 shrink-0" />
            <span>تحميل نسخة غير محلولة للتدريب</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg transition-colors"
        >
          متابعة إلى المنصة الأكاديمية
        </button>
      </div>
    </div>
  );
}
