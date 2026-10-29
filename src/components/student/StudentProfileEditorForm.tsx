/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UMED Shared StudentProfileEditorForm Component
 * Unified form for editing student identity (@username, full Arabic name, avatar)
 * and academic context (university, specialty, study level) with live cloud synchronization.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { StudentEnrollment } from '../../types/umed.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { saveUserAcademicContext } from '../../services/academicService.ts';
import {
  checkIdentifierUniqueness,
  normalizeUsername,
  validateUsernameFormat,
  compressAndReadProfileImage,
  YEMEN_UNIVERSITIES_OPTIONS,
  MEDICAL_SPECIALTIES_OPTIONS,
  STUDY_LEVELS_OPTIONS,
  MEDICAL_PRESET_AVATARS
} from '../../lib/firebase.ts';

export interface StudentProfileEditorFormProps {
  initialDisplayNameArabic?: string;
  initialUniversityId?: string;
  initialUniversityNameArabic?: string;
  initialStudyLevelId?: string;
  onCancel?: () => void;
  onSaved?: (result: {
    enrollment?: StudentEnrollment;
    universityNameArabic: string;
    studyLevelId: string;
    message: string;
  }) => void;
}

export default function StudentProfileEditorForm({
  initialDisplayNameArabic = '',
  initialUniversityId = 'univ-dar-al-salam',
  initialUniversityNameArabic = 'جامعة دار السلام الدولية للعلوم والتكنولوجيا',
  initialStudyLevelId = 'lvl-4',
  onCancel,
  onSaved
}: StudentProfileEditorFormProps) {
  const { user, userProfile, updateFullProfile, registerWithUsername } = useAuth();
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  const [usernameDraft, setUsernameDraft] = useState<string>(userProfile?.username || '');
  const [displayNameDraft, setDisplayNameDraft] = useState<string>(
    userProfile?.displayNameArabic || initialDisplayNameArabic || ''
  );
  const [avatarDraft, setAvatarDraft] = useState<string>(userProfile?.avatarUrl || '');
  const [universityIdDraft, setUniversityIdDraft] = useState<string>(
    userProfile?.universityId || initialUniversityId || 'univ-dar-al-salam'
  );
  const [customUniversityDraft, setCustomUniversityDraft] = useState<string>(
    userProfile?.universityNameArabic || initialUniversityNameArabic || ''
  );
  const [specialtyDraft, setSpecialtyDraft] = useState<string>(
    userProfile?.specialtyArabic || 'الطب البشري والجراحة العامة (MBBS)'
  );
  const [studyLevelDraft, setStudyLevelDraft] = useState<string>(
    userProfile?.studyLevelId || initialStudyLevelId || 'lvl-4'
  );
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [usernameAvailability, setUsernameAvailability] = useState<{
    checking: boolean;
    available: boolean | null;
    reason?: string;
  }>({ checking: false, available: null });

  useEffect(() => {
    if (userProfile?.username) setUsernameDraft(userProfile.username);
    if (userProfile?.displayNameArabic) setDisplayNameDraft(userProfile.displayNameArabic);
    setAvatarDraft(userProfile?.avatarUrl || '');
    if (userProfile?.universityId) setUniversityIdDraft(userProfile.universityId);
    if (userProfile?.universityNameArabic) setCustomUniversityDraft(userProfile.universityNameArabic);
    if (userProfile?.specialtyArabic) setSpecialtyDraft(userProfile.specialtyArabic);
    if (userProfile?.studyLevelId) setStudyLevelDraft(userProfile.studyLevelId);
  }, [
    userProfile?.username,
    userProfile?.displayNameArabic,
    userProfile?.avatarUrl,
    userProfile?.universityId,
    userProfile?.universityNameArabic,
    userProfile?.specialtyArabic,
    userProfile?.studyLevelId
  ]);

  useEffect(() => {
    const candidate = normalizeUsername(usernameDraft);
    if (!candidate || candidate === userProfile?.username) {
      setUsernameAvailability({ checking: false, available: null });
      return;
    }
    const formatCheck = validateUsernameFormat(usernameDraft);
    if (!formatCheck.valid) {
      setUsernameAvailability({
        checking: false,
        available: false,
        reason: formatCheck.message
      });
      return;
    }

    let cancelled = false;
    setUsernameAvailability({ checking: true, available: null });
    const timer = setTimeout(async () => {
      const check = await checkIdentifierUniqueness({
        username: candidate,
        excludeUid: user?.uid
      });
      if (!cancelled) {
        setUsernameAvailability({
          checking: false,
          available: check.isUnique,
          reason: check.message
        });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [usernameDraft, user?.uid, userProfile?.username]);

  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileFeedback(null);
    try {
      const compressedDataUrl = await compressAndReadProfileImage(file);
      setAvatarDraft(compressedDataUrl);
    } catch (err: any) {
      setProfileFeedback({
        type: 'error',
        message: err.message || 'تعذر رفع صورة الملف الشخصي'
      });
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleSaveFullProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);

    const fmt = validateUsernameFormat(usernameDraft);
    if (!fmt.valid) {
      setProfileFeedback({ type: 'error', message: fmt.message || 'اسم المستخدم غير صالح' });
      return;
    }

    const matchedUniv = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === universityIdDraft);
    const resolvedUnivName =
      universityIdDraft === 'univ-custom'
        ? customUniversityDraft.trim() || 'جامعة طبية يمنية'
        : matchedUniv?.nameArabic || initialUniversityNameArabic;

    setSavingProfile(true);
    try {
      if (user) {
        const res = await updateFullProfile({
          newUsername: fmt.normalized,
          displayNameArabic: displayNameDraft.trim() || fmt.normalized,
          avatarUrl: avatarDraft ? avatarDraft : null,
          universityId: universityIdDraft === 'univ-custom' ? 'univ-dar-al-salam' : universityIdDraft,
          universityNameArabic: resolvedUnivName,
          specialtyArabic: specialtyDraft,
          studyLevelId: studyLevelDraft
        });

        saveUserAcademicContext({
          universityId: res.enrollment.universityId,
          universityNameArabic: resolvedUnivName,
          studyLevelId: studyLevelDraft
        });

        setProfileFeedback({
          type: 'success',
          message: res.message
        });

        if (onSaved) {
          onSaved({
            enrollment: res.enrollment,
            universityNameArabic: resolvedUnivName,
            studyLevelId: studyLevelDraft,
            message: res.message
          });
        }
      } else {
        await registerWithUsername(
          fmt.normalized,
          undefined,
          displayNameDraft.trim() || fmt.normalized,
          {
            avatarUrl: avatarDraft || undefined,
            universityId: universityIdDraft === 'univ-custom' ? 'univ-dar-al-salam' : universityIdDraft,
            universityNameArabic: resolvedUnivName,
            specialtyArabic: specialtyDraft,
            studyLevelId: studyLevelDraft
          }
        );

        saveUserAcademicContext({
          universityId: universityIdDraft === 'univ-custom' ? 'univ-dar-al-salam' : universityIdDraft,
          universityNameArabic: resolvedUnivName,
          studyLevelId: studyLevelDraft
        });

        const msg = `تم إنشاء حسابك السحابي باسم المستخدم الفريد (@${fmt.normalized}) بنجاح ✓`;
        setProfileFeedback({
          type: 'success',
          message: msg
        });

        if (onSaved) {
          onSaved({
            universityNameArabic: resolvedUnivName,
            studyLevelId: studyLevelDraft,
            message: msg
          });
        }
      }
    } catch (err: any) {
      setProfileFeedback({
        type: 'error',
        message: err.message || 'تعذر حفظ التعديلات في السحابة'
      });
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-input)] border border-teal-500/40 space-y-4" dir="rtl">
      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileSelected}
        className="hidden"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
        <div className="flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-teal-400" />
          <h3 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
            تعديل هوية الطالب والبيانات الأكاديمية
          </h3>
        </div>
        {userProfile?.username && (
          <span
            className="text-[11px] font-mono text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded-lg border border-teal-500/20"
            dir="ltr"
          >
            @{userProfile.username}
          </span>
        )}
      </div>

      {profileFeedback && (
        <div
          className={`p-3 rounded-xl text-xs font-bold border flex items-center gap-2 ${
            profileFeedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
          }`}
        >
          {profileFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{profileFeedback.message}</span>
        </div>
      )}

      <form onSubmit={handleSaveFullProfile} className="space-y-4 text-xs">
        {/* 1. Avatar Upload & 4 Medical Preset Avatars */}
        <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {avatarDraft ? (
              <img
                src={avatarDraft}
                alt="معاينة الصورة"
                className="w-14 h-14 rounded-2xl object-cover border border-teal-500/50"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-color)] flex items-center justify-center text-teal-400 font-bold text-lg">
                {(displayNameDraft || usernameDraft || 'ط').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-bold text-[var(--text-primary)]">الصورة الرمزية</div>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                ارفع صورة شخصية من جهازك أو اختر أحد الأفاتار الطبية الأربعة
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => avatarFileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold flex items-center gap-1.5 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>رفع صورة شخصية</span>
            </button>

            {avatarDraft && (
              <button
                type="button"
                onClick={() => setAvatarDraft('')}
                className="px-2.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 font-semibold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إزالة</span>
              </button>
            )}

            <div className="flex items-center gap-1.5">
              {MEDICAL_PRESET_AVATARS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarDraft(preset)}
                  className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-transform ${
                    avatarDraft === preset
                      ? 'border-teal-400 scale-105 shadow-md'
                      : 'border-[var(--border-color)] opacity-80 hover:opacity-100'
                  }`}
                  title={`رمز طبي ${idx + 1}`}
                >
                  <img src={preset} alt={`رمز طبي ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Unique Username (@username) & Full Arabic Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] font-semibold mb-1">
              اسم المستخدم الفريد (@username) — 4 أحرف إنجليزية على الأقل:
            </label>
            <div className="relative" dir="ltr">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-400 font-mono font-bold text-xs">
                @
              </span>
              <input
                type="text"
                required
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ''))}
                placeholder="Ahmed_Med"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-teal-500"
              />
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              الحروف الكبيرة والصغيرة لها نفس القيمة ({normalizeUsername(usernameDraft) || 'ahmed'}).
            </p>
            {(usernameAvailability.checking || usernameAvailability.available !== null) && (
              <div
                className={`mt-1 text-[11px] font-bold flex items-center gap-1 ${
                  usernameAvailability.checking
                    ? 'text-[var(--text-muted)]'
                    : usernameAvailability.available
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {usernameAvailability.checking
                  ? 'جارٍ فحص التوفر وعدم التشابه...'
                  : usernameAvailability.available
                  ? 'اسم المستخدم متاح وفريد ✓'
                  : usernameAvailability.reason}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] font-semibold mb-1">
              الاسم الثلاثي بالعربية:
            </label>
            <input
              type="text"
              required
              value={displayNameDraft}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
              placeholder="مثال: د. أحمد محمد علي"
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        {/* 3. University, Specialty & Study Level Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] font-semibold mb-1">
              الجامعة:
            </label>
            <select
              value={universityIdDraft}
              onChange={(e) => {
                const val = e.target.value;
                setUniversityIdDraft(val);
                const found = YEMEN_UNIVERSITIES_OPTIONS.find((u) => u.id === val);
                if (found) setCustomUniversityDraft(found.nameArabic);
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500"
            >
              {YEMEN_UNIVERSITIES_OPTIONS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nameArabic} ({u.cityArabic})
                </option>
              ))}
              <option value="univ-custom">جامعة أخرى (كتابة اسم الجامعة)</option>
            </select>
            {universityIdDraft === 'univ-custom' && (
              <input
                type="text"
                required
                value={customUniversityDraft}
                onChange={(e) => setCustomUniversityDraft(e.target.value)}
                placeholder="اكتب اسم جامعتك هنا..."
                className="mt-2 w-full px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-teal-500/50 text-[var(--text-primary)] focus:outline-none"
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] font-semibold mb-1">
              التخصص الأكاديمي:
            </label>
            <select
              value={specialtyDraft}
              onChange={(e) => setSpecialtyDraft(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500"
            >
              {MEDICAL_SPECIALTIES_OPTIONS.map((s) => (
                <option key={s.id} value={s.nameArabic}>
                  {s.nameArabic}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] font-semibold mb-1">
              المستوى الدراسي:
            </label>
            <select
              value={studyLevelDraft}
              onChange={(e) => setStudyLevelDraft(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-teal-500"
            >
              {STUDY_LEVELS_OPTIONS.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.nameArabic}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 4. Save & Cancel Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-color)]">
          <span className="text-[11px] text-[var(--text-muted)]">
            يتم حفظ التعديلات ومزامنتها مع حسابك السحابي فوراً.
          </span>
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl bg-[var(--bg-elevated)] hover:opacity-90 text-[var(--text-secondary)] border border-[var(--border-color)] font-semibold"
              >
                إلغاء
              </button>
            )}
            <button
              type="submit"
              disabled={savingProfile || usernameAvailability.available === false}
              className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              {savingProfile && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{savingProfile ? 'جارٍ الحفظ والمزامنة...' : 'حفظ التعديلات في السحابة ✓'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
