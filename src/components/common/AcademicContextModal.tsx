/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Reusable Academic Context Header Bar & Standalone Popup Selector Modal
 * Persists the user's selected University, College, Specialty/Program, Study Level, and Block/Subject
 * and scopes all displayed data across screens to the user's saved selection.
 */

import React, { useState, useEffect } from 'react';
import {
  Building2,
  GraduationCap,
  BookOpen,
  Layers,
  ChevronDown,
  CheckCircle2,
  Filter,
  X,
  SlidersHorizontal
} from 'lucide-react';
import {
  University,
  College,
  AcademicProgram,
  StudyLevel,
  StudyPeriod,
  UserAcademicContext,
  UserRole,
  DAR_AL_SALAM_SEED
} from '../../types/umed.ts';
import {
  fetchUniversities,
  fetchColleges,
  fetchPrograms,
  fetchStudyLevels,
  fetchStudyPeriods,
  getCachedCollection,
  getUserAcademicContext,
  saveUserAcademicContext,
  subscribeToUserAcademicContext
} from '../../services/academicService.ts';

export interface AcademicContextBarProps {
  userRole?: UserRole;
  lockedUniversityId?: string;
  assignedUniversityId?: string;
  lockedStudyLevelId?: string;
  assignedStudyLevelId?: string;
  onChange?: (ctx: UserAcademicContext) => void;
  onContextChange?: (ctx: UserAcademicContext) => void;
  compact?: boolean;
  labelPrefix?: string;
}

export function AcademicContextBar({
  lockedUniversityId,
  assignedUniversityId,
  lockedStudyLevelId,
  assignedStudyLevelId,
  onChange,
  onContextChange,
  compact = false,
  labelPrefix = 'النطاق الأكاديمي النشط'
}: AcademicContextBarProps) {
  const effectiveLockedUnivId = lockedUniversityId || assignedUniversityId;
  const effectiveLockedLevelId = lockedStudyLevelId || assignedStudyLevelId;

  const [context, setContext] = useState<UserAcademicContext>(() =>
    getUserAcademicContext({
      ...(effectiveLockedUnivId ? { universityId: effectiveLockedUnivId } : {}),
      ...(effectiveLockedLevelId ? { studyLevelId: effectiveLockedLevelId } : {})
    })
  );
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activePopupTab, setActivePopupTab] = useState<'level' | 'university' | 'specialty' | 'block'>('level');

  const [universities, setUniversities] = useState<University[]>(() =>
    getCachedCollection<University>('universities')
  );
  const [colleges, setColleges] = useState<College[]>(() =>
    getCachedCollection<College>('colleges')
  );
  const [programs, setPrograms] = useState<AcademicProgram[]>(() =>
    getCachedCollection<AcademicProgram>('programs')
  );
  const [studyLevels, setStudyLevels] = useState<StudyLevel[]>(() =>
    getCachedCollection<StudyLevel>('studyLevels')
  );
  const [studyPeriods, setStudyPeriods] = useState<StudyPeriod[]>(() =>
    getCachedCollection<StudyPeriod>('studyPeriods')
  );

  // Sync with global academic context changes
  useEffect(() => {
    const unsub = subscribeToUserAcademicContext((updated) => {
      setContext(updated);
      if (onChange) onChange(updated);
      if (onContextChange) onContextChange(updated);
    });
    return unsub;
  }, [onChange, onContextChange]);

  // Load hierarchy collections when modal opens or mounts
  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchUniversities(),
      fetchColleges(context.universityId),
      fetchPrograms(context.collegeId),
      fetchStudyLevels(context.programId),
      fetchStudyPeriods(context.studyLevelId, context.universityId)
    ]).then(([uList, cList, pList, lList, perList]) => {
      if (!mounted) return;
      if (uList.length > 0) setUniversities(uList);
      if (cList.length > 0) setColleges(cList);
      if (pList.length > 0) setPrograms(pList);
      if (lList.length > 0) setStudyLevels(lList);
      setStudyPeriods(perList);
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [context.universityId, context.collegeId, context.programId, context.studyLevelId]);

  const handleUpdateSelection = (partial: Partial<UserAcademicContext>) => {
    const saved = saveUserAcademicContext({
      ...partial,
      ...(lockedUniversityId ? { universityId: lockedUniversityId } : {}),
      ...(lockedStudyLevelId ? { studyLevelId: lockedStudyLevelId } : {})
    });
    setContext(saved);
    if (onChange) onChange(saved);
  };

  const openModalOnTab = (tab: 'level' | 'university' | 'specialty' | 'block') => {
    setActivePopupTab(tab);
    setIsOpen(true);
  };

  const activeUniv = universities.find(u => u.id === context.universityId) || DAR_AL_SALAM_SEED.university;
  const activeCol = colleges.find(c => c.id === context.collegeId) || DAR_AL_SALAM_SEED.college;
  const activeProg = programs.find(p => p.id === context.programId) || DAR_AL_SALAM_SEED.program;
  const activeLevel = studyLevels.find(l => l.id === context.studyLevelId) ||
    DAR_AL_SALAM_SEED.studyLevels.find(l => l.id === context.studyLevelId) ||
    DAR_AL_SALAM_SEED.studyLevels[1];
  const levelPeriods = studyPeriods.filter(p => !p.studyLevelId || p.studyLevelId === activeLevel.id);
  const activePeriod = levelPeriods.find(p => p.id === context.studyPeriodId) || levelPeriods[0] || null;

  return (
    <>
      {/* Main Title Trigger Bar (Compact & Scannable — Opens Standalone Popup Modal on Click) */}
      <div
        className={`rounded-2xl bg-slate-900/95 border border-slate-800 shadow-lg transition-all ${
          compact ? 'p-2.5' : 'p-3.5 sm:p-4'
        }`}
        dir="rtl"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openModalOnTab('level')}
              className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-950/80 hover:bg-teal-900/80 border border-teal-500/40 text-right transition-all shadow-sm"
              title="اضغط لتغيير المستوى الدراسي أو البلوك في نافذة منبثقة"
            >
              <Layers className="w-4 h-4 text-teal-400 shrink-0" />
              <div>
                <div className="text-[10px] text-teal-300/80 font-semibold">{labelPrefix}</div>
                <div className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                  <span>{activeLevel.titleArabic}</span>
                  {activePeriod && (
                    <>
                      <span className="text-teal-400">·</span>
                      <span className="text-amber-300 font-bold">{activePeriod.titleArabic}</span>
                    </>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-teal-300 group-hover:translate-y-0.5 transition-transform" />
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => openModalOnTab('university')}
              className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 font-bold flex items-center gap-1.5 transition-colors"
              title="اضغط لتغيير الجامعة أو الكلية أو التخصص"
            >
              <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate max-w-[180px] sm:max-w-[260px]">{activeUniv.nameArabic}</span>
              <span className="text-slate-600">|</span>
              <span className="text-indigo-300 truncate max-w-[140px]">{activeCol.nameArabic}</span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleUpdateSelection({ strictScope: !context.strictScope })}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                context.strictScope
                  ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="عند التفعيل، يتم إخفاء أي مستويات أو تخصصات أو بيانات لا تخص اختيارك الحالي"
            >
              <Filter className="w-3 h-3" />
              <span>{context.strictScope ? 'عزل بيانات مستواي: مفعل ✓' : 'عرض جميع المستويات'}</span>
            </button>

            <button
              type="button"
              onClick={() => openModalOnTab('level')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
              <span>تخصيص المستوى والبلوك</span>
            </button>
          </div>
        </div>
      </div>

      {/* Standalone Popup Modal for Selecting University, College/Specialty, Study Level, and Block */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-teal-400" />
                  <span>إعدادات الجامعة والتخصص والمستوى والبلوك الدراسي</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  يتم حفظ اختياراتك تلقائياً وتخصيص جميع بنوك الأسئلة والاختبارات والمحاضرات والمراجع الطبية وفق مستواك وبلوكك الدراسي
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Popup Navigation Tabs */}
            <div className="px-4 pt-3 bg-slate-950/60 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'level', label: '1. المستوى الدراسي (السنة)', icon: Layers },
                { id: 'block', label: '2. البلوك / المقرر الطبي', icon: BookOpen },
                { id: 'university', label: '3. الجامعة', icon: Building2 },
                { id: 'specialty', label: '4. الكلية والتخصص', icon: GraduationCap }
              ].map((t) => {
                const Icon = t.icon;
                const isTabActive = activePopupTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActivePopupTab(t.id as any)}
                    className={`px-3 py-2 rounded-t-xl text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap ${
                      isTabActive
                        ? 'bg-slate-900 text-teal-300 border-teal-500'
                        : 'text-slate-400 border-transparent hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {activePopupTab === 'level' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      اختر المستوى الدراسي / السنة الدراسية:
                    </span>
                    {lockedStudyLevelId && (
                      <span className="text-[11px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                        مقيد حسب صلاحية الدفعة
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {studyLevels.map((lvl) => {
                      const isSelected = activeLevel.id === lvl.id;
                      const isDisabled = Boolean(lockedStudyLevelId && lockedStudyLevelId !== lvl.id);
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            const periodsForLvl = studyPeriods.filter(p => p.studyLevelId === lvl.id);
                            handleUpdateSelection({
                              studyLevelId: lvl.id,
                              studyLevelNameArabic: lvl.titleArabic,
                              studyPeriodId: periodsForLvl[0]?.id || '',
                              studyPeriodNameArabic: periodsForLvl[0]?.titleArabic || ''
                            });
                          }}
                          className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-teal-950/80 border-teal-500 text-white shadow-md ring-1 ring-teal-500/40'
                              : isDisabled
                              ? 'bg-slate-950/30 border-slate-800/50 text-slate-600 cursor-not-allowed'
                              : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold">{lvl.titleArabic}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5" dir="ltr">
                              {lvl.titleEnglish}
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activePopupTab === 'block' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      البلوكات والمقررات التابعة لـ ({activeLevel.titleArabic}):
                    </span>
                  </div>
                  {levelPeriods.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-950 rounded-xl border border-slate-800">
                      لا توجد بلوكات مخصصة مسجلة لهذا المستوى حالياً. يمكنك إضافتها من شاشة إدارة الهيكل الأكاديمي.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5">
                      {levelPeriods.map((per) => {
                        const isSelected = activePeriod?.id === per.id;
                        return (
                          <button
                            key={per.id}
                            type="button"
                            onClick={() =>
                              handleUpdateSelection({
                                studyPeriodId: per.id,
                                studyPeriodNameArabic: per.titleArabic
                              })
                            }
                            className={`p-3.5 rounded-xl border text-right transition-all flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-amber-950/60 border-amber-500 text-white shadow-md'
                                : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-amber-300">
                                  {per.code || 'BLOCK'}
                                </span>
                                <span className="text-xs sm:text-sm font-bold">{per.titleArabic}</span>
                              </div>
                              {per.titleEnglish && (
                                <div className="text-[11px] text-slate-400 font-mono mt-1" dir="ltr">
                                  {per.titleEnglish}
                                </div>
                              )}
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activePopupTab === 'university' && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-200 block">
                    اختر الجامعة المعتمدة:
                  </span>
                  <div className="grid grid-cols-1 gap-2.5">
                    {universities.map((u) => {
                      const isSelected = activeUniv.id === u.id;
                      const isDisabled = Boolean(lockedUniversityId && lockedUniversityId !== u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() =>
                            handleUpdateSelection({
                              universityId: u.id,
                              universityNameArabic: u.nameArabic
                            })
                          }
                          className={`p-3.5 rounded-xl border text-right transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-indigo-950/70 border-indigo-500 text-white shadow-md'
                              : isDisabled
                              ? 'bg-slate-950/30 border-slate-800/50 text-slate-600 cursor-not-allowed'
                              : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <div className="text-xs sm:text-sm font-bold">{u.nameArabic}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {u.cityArabic} · {u.type === 'private' ? 'جامعة أهلية / خاصة' : 'جامعة حكومية'}
                            </div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activePopupTab === 'specialty' && (
                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block mb-2">
                      اختر الكلية:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {colleges.map((c) => {
                        const isSelected = activeCol.id === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              handleUpdateSelection({
                                collegeId: c.id,
                                collegeNameArabic: c.nameArabic
                              })
                            }
                            className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-teal-950/70 border-teal-500 text-white'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-bold">{c.nameArabic}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{c.code || 'MED'}</div>
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-teal-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-bold text-slate-200 block mb-2">
                      اختر التخصص / البرنامج الأكاديمي:
                    </span>
                    <div className="grid grid-cols-1 gap-2.5">
                      {programs.map((p) => {
                        const isSelected = activeProg.id === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() =>
                              handleUpdateSelection({
                                programId: p.id,
                                programNameArabic: p.nameArabic
                              })
                            }
                            className={`p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-emerald-950/70 border-emerald-500 text-white'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-bold">{p.nameArabic}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {p.studySystem === 'block' ? 'نظام البلوكات الطبية التكاملية' : 'نظام الفصول الدراسية'} · {p.totalRegularLevels} مستويات
                              </div>
                            </div>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Strict Data Isolation Option */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-white">
                    حفظ وعزل البيانات حسب اختياري فقط (منع تداخل المستويات والتخصصات)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    عند التفعيل، يتم عرض بنوك الأسئلة والاختبارات والمقررات والمحاضرات المخصصة لـ ({activeLevel.titleArabic}) فقط
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={context.strictScope}
                  onChange={(e) => handleUpdateSelection({ strictScope: e.target.checked })}
                  className="w-4 h-4 accent-teal-500 rounded cursor-pointer shrink-0"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
              <div className="text-[11px] text-teal-300 font-semibold truncate">
                الاختيار المحفوظ: {activeUniv.nameArabic} · {activeLevel.titleArabic}
                {activePeriod ? ` · ${activePeriod.titleArabic}` : ''}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shrink-0"
              >
                حفظ وتطبيق الآن ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AcademicContextBar;

